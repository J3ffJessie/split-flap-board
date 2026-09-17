//! DST-safe time handling for calendar events.
//!
//! Events are stored and compared as UTC instants everywhere except the
//! final render step. Doing comparisons (urgency windows, ordering) on UTC
//! means DST transitions never enter the picture — a `Duration` between two
//! `DateTime<Utc>` values is unambiguous. The only place a timezone's wall-clock
//! offset matters is `format_local_hhmm`, which re-resolves the offset that
//! applies at that specific instant rather than assuming a fixed one, so it
//! renders correctly on either side of a spring-forward/fall-back transition.

use chrono::{DateTime, Duration, Utc};
use chrono_tz::Tz;
use std::str::FromStr;

/// Parses an IANA timezone name (e.g. "America/New_York"). Callers resolve the
/// system's zone name (e.g. via `Intl.DateTimeFormat().resolvedOptions().timeZone`
/// on the frontend) and pass it through — kept out of this module so parsing
/// and formatting stay pure and independently testable.
pub fn parse_tz(name: &str) -> Result<Tz, String> {
    Tz::from_str(name).map_err(|_| format!("unknown timezone: {name}"))
}

/// Formats a UTC instant as 24-hour "HH:MM" wall-clock time in `tz`, using
/// whichever UTC offset actually applies at that instant.
pub fn format_local_hhmm(instant: DateTime<Utc>, tz: Tz) -> String {
    instant.with_timezone(&tz).format("%H:%M").to_string()
}

/// True when `event_start` is at most `window` away in the future, or the
/// event is already underway (started but hasn't reached `event_end` yet).
/// An event that has already ended is never urgent.
pub fn is_urgent(
    now: DateTime<Utc>,
    event_start: DateTime<Utc>,
    event_end: DateTime<Utc>,
    window: Duration,
) -> bool {
    if event_end <= now {
        return false;
    }
    event_start <= now + window
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn utc(y: i32, mo: u32, d: u32, h: u32, mi: u32, s: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(y, mo, d, h, mi, s).unwrap()
    }

    // 2024-03-10: America/New_York springs forward at 2024-03-10T07:00:00Z
    // (02:00 EST -> 03:00 EDT). A fixed-offset assumption would misrender
    // either side of this instant.
    #[test]
    fn renders_est_before_spring_forward() {
        let ny = parse_tz("America/New_York").unwrap();
        let instant = utc(2024, 3, 10, 6, 59, 0);
        assert_eq!(format_local_hhmm(instant, ny), "01:59");
    }

    #[test]
    fn renders_edt_after_spring_forward() {
        let ny = parse_tz("America/New_York").unwrap();
        let instant = utc(2024, 3, 10, 7, 0, 0);
        assert_eq!(format_local_hhmm(instant, ny), "03:00");
    }

    // 2024-11-03: America/New_York falls back at 2024-11-03T06:00:00Z
    // (02:00 EDT -> 01:00 EST) — the 01:00-01:59 local hour occurs twice.
    #[test]
    fn renders_edt_before_fall_back() {
        let ny = parse_tz("America/New_York").unwrap();
        let instant = utc(2024, 11, 3, 5, 30, 0);
        assert_eq!(format_local_hhmm(instant, ny), "01:30");
    }

    #[test]
    fn renders_est_after_fall_back() {
        let ny = parse_tz("America/New_York").unwrap();
        let instant = utc(2024, 11, 3, 6, 30, 0);
        assert_eq!(format_local_hhmm(instant, ny), "01:30");
    }

    #[test]
    fn rejects_unknown_timezone() {
        assert!(parse_tz("Not/A_Zone").is_err());
    }

    #[test]
    fn urgent_when_starting_within_window() {
        let now = utc(2024, 6, 1, 12, 0, 0);
        let start = utc(2024, 6, 1, 12, 8, 0);
        let end = utc(2024, 6, 1, 12, 30, 0);
        assert!(is_urgent(now, start, end, Duration::minutes(10)));
    }

    #[test]
    fn not_urgent_when_starting_beyond_window() {
        let now = utc(2024, 6, 1, 12, 0, 0);
        let start = utc(2024, 6, 1, 12, 11, 0);
        let end = utc(2024, 6, 1, 12, 30, 0);
        assert!(!is_urgent(now, start, end, Duration::minutes(10)));
    }

    #[test]
    fn urgent_at_exact_window_boundary() {
        let now = utc(2024, 6, 1, 12, 0, 0);
        let start = utc(2024, 6, 1, 12, 10, 0);
        let end = utc(2024, 6, 1, 12, 30, 0);
        assert!(is_urgent(now, start, end, Duration::minutes(10)));
    }

    #[test]
    fn urgent_while_in_progress() {
        let now = utc(2024, 6, 1, 12, 20, 0);
        let start = utc(2024, 6, 1, 12, 0, 0);
        let end = utc(2024, 6, 1, 12, 30, 0);
        assert!(is_urgent(now, start, end, Duration::minutes(10)));
    }

    #[test]
    fn not_urgent_once_event_has_ended() {
        let now = utc(2024, 6, 1, 12, 31, 0);
        let start = utc(2024, 6, 1, 12, 0, 0);
        let end = utc(2024, 6, 1, 12, 30, 0);
        assert!(!is_urgent(now, start, end, Duration::minutes(10)));
    }
}
