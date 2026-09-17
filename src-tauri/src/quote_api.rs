//! Quotes API integration — fetches from ZenQuotes, caches the last
//! successful response to app_data_dir, and falls back to that cache
//! whenever the network call fails (offline, API outage, rate limit).

use crate::http_retry::{classify_status, retry_with_backoff, FetchError};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiQuote {
    pub text: String,
    pub author: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct ZenQuoteRaw {
    q: String,
    a: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ApiQuotesResult {
    pub quotes: Vec<ApiQuote>,
    pub from_cache: bool,
}

const ZENQUOTES_URL: &str = "https://zenquotes.io/api/quotes";

fn cache_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not resolve app data dir: {e}"))?;
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(dir.join("api_quotes_cache.json"))
}

fn load_cached(app: &AppHandle) -> Vec<ApiQuote> {
    let Ok(path) = cache_file_path(app) else {
        return Vec::new();
    };
    match fs::read_to_string(&path) {
        Ok(contents) => serde_json::from_str(&contents).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

fn save_cache(app: &AppHandle, quotes: &[ApiQuote]) {
    if let Ok(path) = cache_file_path(app) {
        if let Ok(json) = serde_json::to_string_pretty(quotes) {
            let _ = fs::write(path, json);
        }
    }
}

fn map_raw(raw: Vec<ZenQuoteRaw>) -> Vec<ApiQuote> {
    raw.into_iter()
        .map(|r| ApiQuote {
            text: r.q,
            author: if r.a.trim().is_empty() || r.a.eq_ignore_ascii_case("unknown") {
                None
            } else {
                Some(r.a)
            },
        })
        .collect()
}

async fn fetch_once() -> Result<Vec<ApiQuote>, FetchError> {
    let response = reqwest::get(ZENQUOTES_URL).await.map_err(|e| FetchError::Transient {
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

    let raw: Vec<ZenQuoteRaw> = response
        .json()
        .await
        .map_err(|e| FetchError::Permanent(e.to_string()))?;
    Ok(map_raw(raw))
}

/// Retries transient failures (network hiccups, 429, 5xx) with capped
/// exponential backoff before the caller falls back to the cached quotes.
async fn fetch_from_network() -> Result<Vec<ApiQuote>, String> {
    retry_with_backoff(fetch_once).await.map_err(FetchError::into_message)
}

#[tauri::command]
pub async fn fetch_api_quotes(app: AppHandle) -> Result<ApiQuotesResult, String> {
    match fetch_from_network().await {
        Ok(quotes) if !quotes.is_empty() => {
            save_cache(&app, &quotes);
            Ok(ApiQuotesResult {
                quotes,
                from_cache: false,
            })
        }
        _ => Ok(ApiQuotesResult {
            quotes: load_cached(&app),
            from_cache: true,
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_unknown_author_to_none() {
        let raw = vec![
            ZenQuoteRaw { q: "Stay hungry.".into(), a: "Unknown".into() },
            ZenQuoteRaw { q: "Carpe diem.".into(), a: "Horace".into() },
        ];
        let quotes = map_raw(raw);
        assert_eq!(quotes[0].author, None);
        assert_eq!(quotes[1].author, Some("Horace".to_string()));
    }

    #[test]
    fn maps_blank_author_to_none() {
        let raw = vec![ZenQuoteRaw { q: "No author here.".into(), a: "  ".into() }];
        let quotes = map_raw(raw);
        assert_eq!(quotes[0].author, None);
    }

    #[test]
    fn preserves_quote_text() {
        let raw = vec![ZenQuoteRaw { q: "Test quote.".into(), a: "Someone".into() }];
        let quotes = map_raw(raw);
        assert_eq!(quotes[0].text, "Test quote.");
    }
}
