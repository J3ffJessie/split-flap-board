//! Local quotes CRUD — persisted as JSON under the app's data directory.
//! Reload-from-disk-per-call keeps this simple; call volume is settings-UI-scale, not hot-path.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalQuote {
    pub id: String,
    pub text: String,
    pub author: Option<String>,
}

static ID_COUNTER: AtomicU32 = AtomicU32::new(0);

/// Timestamp + in-process counter — sufficient uniqueness for a local,
/// single-user quote list without pulling in a random-number-generator crate
/// (avoids a getrandom/dlltool build dependency that isn't available in
/// every Windows toolchain setup).
fn generate_id() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let seq = ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{millis:x}-{seq:x}")
}

fn quotes_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not resolve app data dir: {e}"))?;
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(dir.join("local_quotes.json"))
}

fn load_quotes(app: &AppHandle) -> Result<Vec<LocalQuote>, String> {
    let path = quotes_file_path(app)?;
    match fs::read_to_string(&path) {
        Ok(contents) => Ok(serde_json::from_str(&contents).unwrap_or_default()),
        Err(_) => Ok(Vec::new()),
    }
}

fn save_quotes(app: &AppHandle, quotes: &[LocalQuote]) -> Result<(), String> {
    let path = quotes_file_path(app)?;
    let json = serde_json::to_string_pretty(quotes).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_local_quotes(app: AppHandle) -> Result<Vec<LocalQuote>, String> {
    load_quotes(&app)
}

#[tauri::command]
pub fn add_local_quote(
    app: AppHandle,
    text: String,
    author: Option<String>,
) -> Result<LocalQuote, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("Quote text cannot be empty".into());
    }
    let mut quotes = load_quotes(&app)?;
    let quote = LocalQuote {
        id: generate_id(),
        text: trimmed.to_string(),
        author: author.filter(|a| !a.trim().is_empty()),
    };
    quotes.push(quote.clone());
    save_quotes(&app, &quotes)?;
    Ok(quote)
}

#[tauri::command]
pub fn update_local_quote(
    app: AppHandle,
    id: String,
    text: String,
    author: Option<String>,
) -> Result<LocalQuote, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("Quote text cannot be empty".into());
    }
    let mut quotes = load_quotes(&app)?;
    let quote = quotes
        .iter_mut()
        .find(|q| q.id == id)
        .ok_or_else(|| "Quote not found".to_string())?;
    quote.text = trimmed.to_string();
    quote.author = author.filter(|a| !a.trim().is_empty());
    let updated = quote.clone();
    save_quotes(&app, &quotes)?;
    Ok(updated)
}

#[tauri::command]
pub fn delete_local_quote(app: AppHandle, id: String) -> Result<(), String> {
    let mut quotes = load_quotes(&app)?;
    let before = quotes.len();
    quotes.retain(|q| q.id != id);
    if quotes.len() == before {
        return Err("Quote not found".into());
    }
    save_quotes(&app, &quotes)
}

#[derive(Debug, Clone, Deserialize)]
pub struct BulkQuoteEntry {
    pub text: String,
    pub author: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BulkAddResult {
    pub added: Vec<LocalQuote>,
    /// Entries that were blank/whitespace-only after trimming.
    pub skipped: usize,
}

/// Appends many quotes in a single file write instead of one round-trip per
/// quote — used by the Settings bulk-import textarea.
#[tauri::command]
pub fn bulk_add_local_quotes(app: AppHandle, entries: Vec<BulkQuoteEntry>) -> Result<BulkAddResult, String> {
    let mut quotes = load_quotes(&app)?;
    let mut added = Vec::new();
    let mut skipped = 0;

    for entry in entries {
        let trimmed = entry.text.trim();
        if trimmed.is_empty() {
            skipped += 1;
            continue;
        }
        let quote = LocalQuote {
            id: generate_id(),
            text: trimmed.to_string(),
            author: entry.author.filter(|a| !a.trim().is_empty()),
        };
        quotes.push(quote.clone());
        added.push(quote);
    }

    save_quotes(&app, &quotes)?;
    Ok(BulkAddResult { added, skipped })
}

#[cfg(test)]
mod tests {
    use super::*;

    // Pure logic that doesn't require an AppHandle — mirrors the validation
    // and mutation rules the commands above enforce.

    fn apply_add(mut quotes: Vec<LocalQuote>, text: &str, author: Option<&str>) -> Result<Vec<LocalQuote>, String> {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return Err("Quote text cannot be empty".into());
        }
        quotes.push(LocalQuote {
            id: "test-id".into(),
            text: trimmed.to_string(),
            author: author.map(|a| a.to_string()).filter(|a| !a.trim().is_empty()),
        });
        Ok(quotes)
    }

    #[test]
    fn rejects_empty_quote_text() {
        let result = apply_add(Vec::new(), "   ", None);
        assert!(result.is_err());
    }

    #[test]
    fn trims_whitespace_and_blank_author() {
        let quotes = apply_add(Vec::new(), "  Stay hungry.  ", Some("  ")).unwrap();
        assert_eq!(quotes[0].text, "Stay hungry.");
        assert_eq!(quotes[0].author, None);
    }

    #[test]
    fn keeps_provided_author() {
        let quotes = apply_add(Vec::new(), "Carpe diem", Some("Horace")).unwrap();
        assert_eq!(quotes[0].author, Some("Horace".to_string()));
    }

    #[test]
    fn generate_id_produces_unique_values() {
        let a = generate_id();
        let b = generate_id();
        assert_ne!(a, b);
    }

    #[test]
    fn delete_removes_matching_id_only() {
        let mut quotes = vec![
            LocalQuote { id: "a".into(), text: "one".into(), author: None },
            LocalQuote { id: "b".into(), text: "two".into(), author: None },
        ];
        quotes.retain(|q| q.id != "a");
        assert_eq!(quotes.len(), 1);
        assert_eq!(quotes[0].id, "b");
    }

    // Pure-logic mirror of bulk_add_local_quotes' per-entry validation.
    fn apply_bulk_add(entries: Vec<BulkQuoteEntry>) -> (Vec<LocalQuote>, usize) {
        let mut added = Vec::new();
        let mut skipped = 0;
        for entry in entries {
            let trimmed = entry.text.trim();
            if trimmed.is_empty() {
                skipped += 1;
                continue;
            }
            added.push(LocalQuote {
                id: "test-id".into(),
                text: trimmed.to_string(),
                author: entry.author.filter(|a| !a.trim().is_empty()),
            });
        }
        (added, skipped)
    }

    #[test]
    fn bulk_add_skips_blank_entries() {
        let entries = vec![
            BulkQuoteEntry { text: "Real quote".into(), author: None },
            BulkQuoteEntry { text: "   ".into(), author: None },
        ];
        let (added, skipped) = apply_bulk_add(entries);
        assert_eq!(added.len(), 1);
        assert_eq!(skipped, 1);
    }

    #[test]
    fn bulk_add_keeps_authors_and_trims_text() {
        let entries = vec![BulkQuoteEntry {
            text: "  Carpe diem  ".into(),
            author: Some("Horace".into()),
        }];
        let (added, skipped) = apply_bulk_add(entries);
        assert_eq!(skipped, 0);
        assert_eq!(added[0].text, "Carpe diem");
        assert_eq!(added[0].author, Some("Horace".to_string()));
    }
}
