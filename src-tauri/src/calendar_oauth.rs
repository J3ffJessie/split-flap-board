//! Google Calendar OAuth — Authorization Code + PKCE via a local loopback
//! listener (RFC 8252: a native app has no web server to receive a redirect,
//! so it opens a short-lived listener on 127.0.0.1 instead; Google's OAuth
//! matches a "Desktop app" client's registered redirect by scheme+host+path,
//! accepting any port, which is what makes an ephemeral loopback port work).
//!
//! Tokens are the only genuinely sensitive artifact here and are stored in
//! the OS keychain via `keyring`. The client id/secret pair is not: for an
//! installed-app OAuth client Google does not treat it as confidential (it
//! ships inside every copy of the app), so it lives in a plain config file
//! next to the other app settings.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{DateTime, Duration, Utc};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::time::timeout;

const AUTH_ENDPOINT: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
const SCOPE: &str = "https://www.googleapis.com/auth/calendar.readonly";
const KEYRING_SERVICE: &str = "splitflap-desktop";
const KEYRING_USER: &str = "google-calendar-tokens";
const CALLBACK_TIMEOUT_SECS: u64 = 180;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientConfig {
    pub client_id: String,
    pub client_secret: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredTokens {
    access_token: String,
    refresh_token: String,
    expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ConnectionStatus {
    pub connected: bool,
}

fn client_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not resolve app data dir: {e}"))?;
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(dir.join("calendar_client.json"))
}

fn save_client_config(app: &AppHandle, config: &ClientConfig) -> Result<(), String> {
    let path = client_config_path(app)?;
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

fn load_client_config(app: &AppHandle) -> Result<ClientConfig, String> {
    let path = client_config_path(app)?;
    let contents = fs::read_to_string(&path).map_err(|_| {
        "Google Calendar isn't configured yet — add a Client ID and Secret in Settings.".to_string()
    })?;
    serde_json::from_str(&contents).map_err(|e| e.to_string())
}

/// Wraps a raw keyring error with an actionable hint for the cases that
/// aren't just "not connected yet" — most notably a Linux desktop with no
/// secret-service provider running, which `keyring` otherwise reports as an
/// opaque platform error.
fn friendly_keyring_error(e: keyring::Error) -> String {
    let hint = match &e {
        keyring::Error::NoStorageAccess(_) => {
            " (no OS credential store is reachable — on Linux, start a secret-service \
             provider such as gnome-keyring or ksecretservice and try again)"
        }
        keyring::Error::PlatformFailure(_) => " (the OS credential store reported an error)",
        _ => "",
    };
    format!("{e}{hint}")
}

fn keyring_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(friendly_keyring_error)
}

fn load_tokens() -> Option<StoredTokens> {
    let entry = keyring_entry().ok()?;
    let raw = entry.get_password().ok()?;
    serde_json::from_str(&raw).ok()
}

fn save_tokens(tokens: &StoredTokens) -> Result<(), String> {
    let entry = keyring_entry()?;
    let json = serde_json::to_string(tokens).map_err(|e| e.to_string())?;
    entry.set_password(&json).map_err(friendly_keyring_error)
}

fn clear_tokens() -> Result<(), String> {
    let entry = keyring_entry()?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(friendly_keyring_error(e)),
    }
}

/// A cryptographically random, URL-safe string in PKCE's allowed length
/// (43-128 chars) — used as both the code_verifier and the anti-CSRF `state`.
fn random_url_safe_token() -> String {
    let mut bytes = [0u8; 48];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

/// SHA-256 + base64url (no padding) per RFC 7636's S256 code_challenge_method.
fn code_challenge(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

fn build_auth_url(client_id: &str, redirect_uri: &str, challenge: &str, state: &str) -> String {
    let mut url = url::Url::parse(AUTH_ENDPOINT).expect("static URL is valid");
    url.query_pairs_mut()
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", SCOPE)
        .append_pair("code_challenge", challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", state)
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent");
    url.to_string()
}

/// Extracts `code` and `state` from a raw loopback request line, e.g.
/// `GET /callback?code=abc&state=xyz HTTP/1.1`. Returns `Err` when there's
/// no `code` (the user denied consent, Google reported an error, or a stray
/// browser probe hit the listener first).
fn parse_callback_request_line(line: &str) -> Result<(String, Option<String>), String> {
    let path = line
        .split_whitespace()
        .nth(1)
        .ok_or_else(|| "malformed request line".to_string())?;
    let url = url::Url::parse(&format!("http://127.0.0.1{path}")).map_err(|e| e.to_string())?;

    let mut code = None;
    let mut state = None;
    for (k, v) in url.query_pairs() {
        match &*k {
            "code" => code = Some(v.into_owned()),
            "state" => state = Some(v.into_owned()),
            "error" => return Err(format!("authorization denied: {v}")),
            _ => {}
        }
    }
    code.map(|c| (c, state))
        .ok_or_else(|| "no authorization code in callback".to_string())
}

const CALLBACK_HTML: &str =
    "<html><body><h1>Signed in</h1><p>You can close this tab and return to Split-Flap Display.</p></body></html>";

async fn run_loopback_listener(
    port_tx: tokio::sync::oneshot::Sender<u16>,
) -> Result<(String, Option<String>), String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let _ = port_tx.send(port);

    let (mut socket, _) = timeout(
        std::time::Duration::from_secs(CALLBACK_TIMEOUT_SECS),
        listener.accept(),
    )
    .await
    .map_err(|_| "timed out waiting for the browser sign-in redirect".to_string())?
    .map_err(|e| e.to_string())?;

    let mut buf = vec![0u8; 8192];
    let n = socket.read(&mut buf).await.map_err(|e| e.to_string())?;
    let request = String::from_utf8_lossy(&buf[..n]);
    let first_line = request.lines().next().unwrap_or_default();
    let result = parse_callback_request_line(first_line);

    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        CALLBACK_HTML.len(),
        CALLBACK_HTML
    );
    let _ = socket.write_all(response.as_bytes()).await;
    let _ = socket.shutdown().await;

    result
}

async fn exchange_code_for_tokens(
    config: &ClientConfig,
    code: &str,
    verifier: &str,
    redirect_uri: &str,
) -> Result<StoredTokens, String> {
    #[derive(Deserialize)]
    struct TokenResponse {
        access_token: String,
        refresh_token: Option<String>,
        expires_in: i64,
    }

    let params = [
        ("code", code),
        ("client_id", config.client_id.as_str()),
        ("client_secret", config.client_secret.as_str()),
        ("redirect_uri", redirect_uri),
        ("grant_type", "authorization_code"),
        ("code_verifier", verifier),
    ];

    let response = reqwest::Client::new()
        .post(TOKEN_ENDPOINT)
        .form(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!("token exchange failed: {body}"));
    }

    let parsed: TokenResponse = response.json().await.map_err(|e| e.to_string())?;
    let refresh_token = parsed.refresh_token.ok_or_else(|| {
        "Google did not return a refresh token — remove the app's access at \
         https://myaccount.google.com/permissions and try connecting again"
            .to_string()
    })?;

    Ok(StoredTokens {
        access_token: parsed.access_token,
        refresh_token,
        expires_at: Utc::now() + Duration::seconds(parsed.expires_in),
    })
}

async fn refresh_access_token(config: &ClientConfig, refresh_token: &str) -> Result<StoredTokens, String> {
    #[derive(Deserialize)]
    struct RefreshResponse {
        access_token: String,
        expires_in: i64,
    }

    let params = [
        ("client_id", config.client_id.as_str()),
        ("client_secret", config.client_secret.as_str()),
        ("refresh_token", refresh_token),
        ("grant_type", "refresh_token"),
    ];

    let response = reqwest::Client::new()
        .post(TOKEN_ENDPOINT)
        .form(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!("token refresh failed: {body}"));
    }

    let parsed: RefreshResponse = response.json().await.map_err(|e| e.to_string())?;
    Ok(StoredTokens {
        access_token: parsed.access_token,
        refresh_token: refresh_token.to_string(),
        expires_at: Utc::now() + Duration::seconds(parsed.expires_in),
    })
}

/// Returns a valid access token, transparently refreshing it first if it has
/// expired (or is within a minute of expiring).
pub async fn get_valid_access_token(app: &AppHandle) -> Result<String, String> {
    let config = load_client_config(app)?;
    let tokens = load_tokens().ok_or_else(|| "Google Calendar isn't connected yet.".to_string())?;

    if tokens.expires_at > Utc::now() + Duration::seconds(60) {
        return Ok(tokens.access_token);
    }

    let refreshed = refresh_access_token(&config, &tokens.refresh_token).await?;
    save_tokens(&refreshed)?;
    Ok(refreshed.access_token)
}

#[tauri::command]
pub fn save_calendar_client_config(
    app: AppHandle,
    client_id: String,
    client_secret: String,
) -> Result<(), String> {
    if client_id.trim().is_empty() || client_secret.trim().is_empty() {
        return Err("Client ID and Client Secret are both required".into());
    }
    save_client_config(
        &app,
        &ClientConfig {
            client_id: client_id.trim().to_string(),
            client_secret: client_secret.trim().to_string(),
        },
    )
}

#[tauri::command]
pub fn calendar_connection_status() -> ConnectionStatus {
    ConnectionStatus {
        connected: load_tokens().is_some(),
    }
}

#[tauri::command]
pub fn disconnect_calendar() -> Result<(), String> {
    clear_tokens()
}

/// Runs the full PKCE flow: opens the system browser to Google's consent
/// screen, waits for the loopback redirect, and exchanges the code for
/// tokens. Resolves once the user finishes (or cancels/times out) in the
/// browser.
#[tauri::command]
pub async fn start_calendar_auth(app: AppHandle) -> Result<ConnectionStatus, String> {
    let config = load_client_config(&app)?;
    let verifier = random_url_safe_token();
    let challenge = code_challenge(&verifier);
    let state = random_url_safe_token();

    let (port_tx, port_rx) = tokio::sync::oneshot::channel();
    let listener_task = tokio::spawn(run_loopback_listener(port_tx));

    let port = port_rx
        .await
        .map_err(|_| "loopback listener failed to start".to_string())?;
    let redirect_uri = format!("http://127.0.0.1:{port}/callback");
    let auth_url = build_auth_url(&config.client_id, &redirect_uri, &challenge, &state);

    open::that(&auth_url).map_err(|e| format!("could not open browser: {e}"))?;

    let (code, returned_state) = listener_task.await.map_err(|e| e.to_string())??;

    if returned_state.as_deref() != Some(state.as_str()) {
        return Err("state mismatch — possible CSRF, aborting sign-in".into());
    }

    let tokens = exchange_code_for_tokens(&config, &code, &verifier, &redirect_uri).await?;
    save_tokens(&tokens)?;
    Ok(ConnectionStatus { connected: true })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn code_challenge_matches_rfc7636_worked_example() {
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        assert_eq!(
            code_challenge(verifier),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn random_token_is_url_safe_and_pkce_length() {
        let token = random_url_safe_token();
        assert!(token.len() >= 43 && token.len() <= 128);
        assert!(token
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
    }

    #[test]
    fn two_random_tokens_differ() {
        assert_ne!(random_url_safe_token(), random_url_safe_token());
    }

    #[test]
    fn parses_code_and_state_from_callback() {
        let line = "GET /callback?code=abc123&state=xyz789 HTTP/1.1";
        let (code, state) = parse_callback_request_line(line).unwrap();
        assert_eq!(code, "abc123");
        assert_eq!(state, Some("xyz789".to_string()));
    }

    #[test]
    fn rejects_callback_with_no_code() {
        let line = "GET /callback?state=xyz789 HTTP/1.1";
        assert!(parse_callback_request_line(line).is_err());
    }

    #[test]
    fn surfaces_denied_consent_as_error() {
        let line = "GET /callback?error=access_denied&state=xyz HTTP/1.1";
        assert!(parse_callback_request_line(line).is_err());
    }

    #[test]
    fn auth_url_contains_pkce_params() {
        let url = build_auth_url(
            "client-123",
            "http://127.0.0.1:9999/callback",
            "challenge-abc",
            "state-xyz",
        );
        assert!(url.contains("code_challenge=challenge-abc"));
        assert!(url.contains("code_challenge_method=S256"));
        assert!(url.contains("state=state-xyz"));
        assert!(url.contains("client_id=client-123"));
    }
}
