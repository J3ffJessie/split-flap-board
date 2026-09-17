//! Google Calendar event fetch — mirrors quote_api.rs's cache-then-network
//! pattern: try the live API, fall back to the last-known-good cached
//! response on any failure (offline, expired token, API outage), and always
//! recompute urgency against the *current* clock rather than baking a
//! stale "is_urgent" flag into the cache.

use crate::calendar_oauth::get_valid_access_token;
use crate::http_retry::{classify_status, retry_with_backoff, FetchError};
use crate::time_util::{format_local_hhmm, is_urgent, parse_tz};
use chrono::{DateTime, Duration, NaiveDate, Utc};
use chrono_tz::Tz;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const EVENTS_ENDPOINT: &str = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
/// Matches the ≤10-minute urgent-preemption window from the project plan.
const URGENT_WINDOW_MINUTES: i64 = 10;
const MAX_RESULTS: &str = "10";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarEvent {
    pub summary: String,
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub all_day: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct DisplayEvent {
    #[serde(flatten)]
    pub event: CalendarEvent,
    pub is_urgent: bool,
    /// "HH:MM" in the caller's timezone, re-resolved against the correct
    /// UTC offset for this specific instant — never a fixed offset baked in
    /// once and reused, which is exactly what breaks across DST transitions.
    pub start_local: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CalendarEventsResult {
    pub events: Vec<DisplayEvent>,
    pub from_cache: bool,
}

#[derive(Deserialize)]
struct EventsResponse {
    #[serde(default)]
    items: Vec<RawEvent>,
}

#[derive(Deserialize)]
struct RawEvent {
    #[serde(default)]
    summary: Option<String>,
    start: RawEventTime,
    end: RawEventTime,
}

#[derive(Deserialize)]
struct RawEventTime {
    #[serde(rename = "dateTime", default)]
    date_time: Option<DateTime<Utc>>,
    #[serde(default)]
    date: Option<String>,
}

fn cache_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not resolve app data dir: {e}"))?;
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(dir.join("calendar_events_cache.json"))
}

fn load_cached(app: &AppHandle) -> Vec<CalendarEvent> {
    let Ok(path) = cache_file_path(app) else {
        return Vec::new();
    };
    match fs::read_to_string(&path) {
        Ok(contents) => serde_json::from_str(&contents).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

fn save_cache(app: &AppHandle, events: &[CalendarEvent]) {
    if let Ok(path) = cache_file_path(app) {
        if let Ok(json) = serde_json::to_string_pretty(events) {
            let _ = fs::write(path, json);
        }
    }
}

/// Maps one raw Google Calendar API event into our shape. Returns `None` for
/// a malformed entry (missing both `dateTime` and `date` on start/end) rather
/// than failing the whole batch.
fn map_raw_event(raw: RawEvent) -> Option<CalendarEvent> {
    let summary = raw.summary.unwrap_or_else(|| "(no title)".to_string());

    if let (Some(start), Some(end)) = (raw.start.date_time, raw.end.date_time) {
        return Some(CalendarEvent {
            summary,
            start,
            end,
            all_day: false,
        });
    }

    // All-day event: Google sends a bare "YYYY-MM-DD" with no time or zone.
    // We don't have the calendar owner's timezone here, so this is anchored
    // to UTC midnight — imprecise, but all-day events are excluded from
    // urgency/preemption anyway, so it only affects the (non-urgent) display
    // ordering.
    let start_date = raw.start.date.as_deref()?;
    let end_date = raw.end.date.as_deref()?;
    let start = NaiveDate::parse_from_str(start_date, "%Y-%m-%d")
        .ok()?
        .and_hms_opt(0, 0, 0)?
        .and_utc();
    let end = NaiveDate::parse_from_str(end_date, "%Y-%m-%d")
        .ok()?
        .and_hms_opt(0, 0, 0)?
        .and_utc();
    Some(CalendarEvent {
        summary,
        start,
        end,
        all_day: true,
    })
}

/// Drops events that have already ended, relative to `now`. The API already
/// orders by start time, so no re-sort is needed.
fn relevant_events(events: Vec<CalendarEvent>, now: DateTime<Utc>) -> Vec<CalendarEvent> {
    events.into_iter().filter(|e| e.end > now).collect()
}

fn annotate_urgency(events: Vec<CalendarEvent>, now: DateTime<Utc>, tz: Tz) -> Vec<DisplayEvent> {
    events
        .into_iter()
        .map(|event| {
            let urgent = !event.all_day
                && is_urgent(now, event.start, event.end, Duration::minutes(URGENT_WINDOW_MINUTES));
            let start_local = format_local_hhmm(event.start, tz);
            DisplayEvent {
                event,
                is_urgent: urgent,
                start_local,
            }
        })
        .collect()
}

async fn fetch_once(access_token: &str) -> Result<Vec<CalendarEvent>, FetchError> {
    let mut url = url::Url::parse(EVENTS_ENDPOINT).map_err(|e| FetchError::Permanent(e.to_string()))?;
    url.query_pairs_mut()
        .append_pair("timeMin", &Utc::now().to_rfc3339())
        .append_pair("singleEvents", "true")
        .append_pair("orderBy", "startTime")
        .append_pair("maxResults", MAX_RESULTS);

    let response = reqwest::Client::new()
        .get(url.as_str())
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| FetchError::Transient {
            message: e.to_string(),
            retry_after: None,
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let retry_after = response
            .headers()
            .get(reqwest::header::RETRY_AFTER)
            .and_then(|v| v.to_str().ok())
            .map(str::to_string);
        let body = response.text().await.unwrap_or_default();
        return Err(classify_status(status, retry_after.as_deref(), body));
    }

    let parsed: EventsResponse = response
        .json()
        .await
        .map_err(|e| FetchError::Permanent(e.to_string()))?;
    Ok(parsed.items.into_iter().filter_map(map_raw_event).collect())
}

/// Retries transient failures (network hiccups, 429, 5xx) with capped
/// exponential backoff before the caller falls back to the cached events.
async fn fetch_from_network(access_token: &str) -> Result<Vec<CalendarEvent>, String> {
    retry_with_backoff(|| fetch_once(access_token))
        .await
        .map_err(FetchError::into_message)
}

/// `tz_name` is the caller's current IANA timezone (e.g. resolved on the
/// frontend via `Intl.DateTimeFormat().resolvedOptions().timeZone`), passed
/// fresh on every call rather than cached — the whole point of re-resolving
/// it each time is to pick up a system timezone change without a restart.
#[tauri::command]
pub async fn fetch_calendar_events(app: AppHandle, tz_name: String) -> Result<CalendarEventsResult, String> {
    let now = Utc::now();
    let tz = parse_tz(&tz_name)?;
    let access_token = get_valid_access_token(&app).await?;

    match fetch_from_network(&access_token).await {
        Ok(events) => {
            save_cache(&app, &events);
            Ok(CalendarEventsResult {
                events: annotate_urgency(relevant_events(events, now), now, tz),
                from_cache: false,
            })
        }
        Err(_) => {
            let cached = relevant_events(load_cached(&app), now);
            Ok(CalendarEventsResult {
                events: annotate_urgency(cached, now, tz),
                from_cache: true,
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn utc(y: i32, mo: u32, d: u32, h: u32, mi: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(y, mo, d, h, mi, 0).unwrap()
    }

    #[test]
    fn maps_timed_event() {
        let raw = RawEvent {
            summary: Some("Standup".to_string()),
            start: RawEventTime {
                date_time: Some(utc(2024, 6, 1, 9, 0)),
                date: None,
            },
            end: RawEventTime {
                date_time: Some(utc(2024, 6, 1, 9, 30)),
                date: None,
            },
        };
        let event = map_raw_event(raw).unwrap();
        assert_eq!(event.summary, "Standup");
        assert!(!event.all_day);
    }

    #[test]
    fn maps_all_day_event() {
        let raw = RawEvent {
            summary: Some("Company Holiday".to_string()),
            start: RawEventTime {
                date_time: None,
                date: Some("2024-06-01".to_string()),
            },
            end: RawEventTime {
                date_time: None,
                date: Some("2024-06-02".to_string()),
            },
        };
        let event = map_raw_event(raw).unwrap();
        assert!(event.all_day);
    }

    #[test]
    fn missing_summary_falls_back_to_placeholder() {
        let raw = RawEvent {
            summary: None,
            start: RawEventTime {
                date_time: Some(utc(2024, 6, 1, 9, 0)),
                date: None,
            },
            end: RawEventTime {
                date_time: Some(utc(2024, 6, 1, 9, 30)),
                date: None,
            },
        };
        let event = map_raw_event(raw).unwrap();
        assert_eq!(event.summary, "(no title)");
    }

    #[test]
    fn rejects_event_with_no_start_shape() {
        let raw = RawEvent {
            summary: Some("Broken".to_string()),
            start: RawEventTime {
                date_time: None,
                date: None,
            },
            end: RawEventTime {
                date_time: Some(utc(2024, 6, 1, 9, 30)),
                date: None,
            },
        };
        assert!(map_raw_event(raw).is_none());
    }

    #[test]
    fn relevant_events_drops_ended_ones() {
        let now = utc(2024, 6, 1, 10, 0);
        let events = vec![
            CalendarEvent {
                summary: "Past".into(),
                start: utc(2024, 6, 1, 8, 0),
                end: utc(2024, 6, 1, 9, 0),
                all_day: false,
            },
            CalendarEvent {
                summary: "Upcoming".into(),
                start: utc(2024, 6, 1, 11, 0),
                end: utc(2024, 6, 1, 12, 0),
                all_day: false,
            },
        ];
        let kept = relevant_events(events, now);
        assert_eq!(kept.len(), 1);
        assert_eq!(kept[0].summary, "Upcoming");
    }

    #[test]
    fn annotate_urgency_flags_events_starting_soon() {
        let now = utc(2024, 6, 1, 10, 0);
        let events = vec![CalendarEvent {
            summary: "Soon".into(),
            start: utc(2024, 6, 1, 10, 5),
            end: utc(2024, 6, 1, 10, 30),
            all_day: false,
        }];
        let annotated = annotate_urgency(events, now, chrono_tz::UTC);
        assert!(annotated[0].is_urgent);
        assert_eq!(annotated[0].start_local, "10:05");
    }

    #[test]
    fn annotate_urgency_never_flags_all_day_events() {
        let now = utc(2024, 6, 1, 0, 0);
        let events = vec![CalendarEvent {
            summary: "Holiday".into(),
            start: utc(2024, 6, 1, 0, 0),
            end: utc(2024, 6, 2, 0, 0),
            all_day: true,
        }];
        let annotated = annotate_urgency(events, now, chrono_tz::UTC);
        assert!(!annotated[0].is_urgent);
    }
}
