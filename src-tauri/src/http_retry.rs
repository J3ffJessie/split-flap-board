//! Shared retry-with-backoff-and-jitter for outbound HTTP calls, plus a
//! transient/permanent error classification so a real 4xx (bad request,
//! expired auth, malformed schema) fails fast instead of being retried
//! into a longer outage.
//!
//! Caps total attempts and max backoff — an explicit fix for the
//! "Retry storms on flaky connections" risk flagged with no concrete cap
//! in the original plan review.

use rand::Rng;
use std::future::Future;
use std::time::Duration;

const MAX_ATTEMPTS: u32 = 4;
const BASE_DELAY: Duration = Duration::from_millis(250);
const MAX_DELAY: Duration = Duration::from_secs(4);

#[derive(Debug, Clone)]
pub enum FetchError {
    /// Worth retrying: network-level failure, 429, or 5xx. Carries an
    /// optional server-specified delay (e.g. a 429's `Retry-After` header).
    Transient {
        message: String,
        retry_after: Option<Duration>,
    },
    /// Not worth retrying: a real 4xx (bad request, unauthorized, not
    /// found) or a response body that doesn't parse — retrying won't fix
    /// a schema mismatch or an expired token.
    Permanent(String),
}

impl FetchError {
    pub fn into_message(self) -> String {
        match self {
            FetchError::Transient { message, .. } => message,
            FetchError::Permanent(message) => message,
        }
    }
}

/// Classifies a non-2xx HTTP response as transient or permanent, honoring
/// `Retry-After` (seconds) when the server sent one.
pub fn classify_status(status: reqwest::StatusCode, retry_after_header: Option<&str>, body: String) -> FetchError {
    let retry_after = retry_after_header
        .and_then(|v| v.trim().parse::<u64>().ok())
        .map(Duration::from_secs);

    if status.as_u16() == 429 || status.is_server_error() {
        FetchError::Transient {
            message: format!("{status}: {body}"),
            retry_after,
        }
    } else {
        FetchError::Permanent(format!("{status}: {body}"))
    }
}

fn backoff_delay(attempt: u32) -> Duration {
    let shift = (attempt - 1).min(6);
    let exp = BASE_DELAY.saturating_mul(1u32 << shift).min(MAX_DELAY);
    let max_jitter_ms = ((exp.as_millis() as u64) / 4).max(1);
    let jitter_ms = rand::thread_rng().gen_range(0..=max_jitter_ms);
    (exp + Duration::from_millis(jitter_ms)).min(MAX_DELAY)
}

/// Retries `f` up to `MAX_ATTEMPTS` times on a transient error, waiting
/// between attempts per `backoff_delay` (or the error's own `retry_after`
/// when the server specified one). A permanent error returns immediately.
pub async fn retry_with_backoff<T, F, Fut>(mut f: F) -> Result<T, FetchError>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<T, FetchError>>,
{
    let mut attempt = 0;
    loop {
        attempt += 1;
        match f().await {
            Ok(value) => return Ok(value),
            Err(FetchError::Permanent(msg)) => return Err(FetchError::Permanent(msg)),
            Err(FetchError::Transient { message, retry_after }) => {
                if attempt >= MAX_ATTEMPTS {
                    return Err(FetchError::Transient { message, retry_after });
                }
                let delay = retry_after.unwrap_or_else(|| backoff_delay(attempt)).min(MAX_DELAY);
                tokio::time::sleep(delay).await;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    #[tokio::test(flavor = "current_thread", start_paused = true)]
    async fn retries_transient_errors_up_to_the_cap() {
        let calls = AtomicU32::new(0);
        let result: Result<(), FetchError> = retry_with_backoff(|| async {
            calls.fetch_add(1, Ordering::SeqCst);
            Err(FetchError::Transient {
                message: "boom".into(),
                retry_after: None,
            })
        })
        .await;
        assert!(result.is_err());
        assert_eq!(calls.load(Ordering::SeqCst), MAX_ATTEMPTS);
    }

    #[tokio::test]
    async fn does_not_retry_permanent_errors() {
        let calls = AtomicU32::new(0);
        let result: Result<(), FetchError> = retry_with_backoff(|| async {
            calls.fetch_add(1, Ordering::SeqCst);
            Err(FetchError::Permanent("bad request".into()))
        })
        .await;
        assert!(result.is_err());
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test(flavor = "current_thread", start_paused = true)]
    async fn succeeds_after_a_transient_failure() {
        let calls = AtomicU32::new(0);
        let result = retry_with_backoff(|| async {
            let n = calls.fetch_add(1, Ordering::SeqCst);
            if n == 0 {
                Err(FetchError::Transient {
                    message: "boom".into(),
                    retry_after: None,
                })
            } else {
                Ok(42)
            }
        })
        .await;
        assert_eq!(result.unwrap(), 42);
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn classifies_429_as_transient_with_retry_after() {
        let err = classify_status(reqwest::StatusCode::TOO_MANY_REQUESTS, Some("2"), "rate limited".into());
        match err {
            FetchError::Transient { retry_after, .. } => assert_eq!(retry_after, Some(Duration::from_secs(2))),
            _ => panic!("expected Transient"),
        }
    }

    #[test]
    fn classifies_500_as_transient() {
        let err = classify_status(reqwest::StatusCode::INTERNAL_SERVER_ERROR, None, "oops".into());
        assert!(matches!(err, FetchError::Transient { .. }));
    }

    #[test]
    fn classifies_400_as_permanent() {
        let err = classify_status(reqwest::StatusCode::BAD_REQUEST, None, "bad".into());
        assert!(matches!(err, FetchError::Permanent(_)));
    }

    #[test]
    fn classifies_401_as_permanent() {
        let err = classify_status(reqwest::StatusCode::UNAUTHORIZED, None, "nope".into());
        assert!(matches!(err, FetchError::Permanent(_)));
    }

    #[test]
    fn malformed_retry_after_falls_back_to_computed_backoff() {
        let err = classify_status(reqwest::StatusCode::TOO_MANY_REQUESTS, Some("not-a-number"), "".into());
        match err {
            FetchError::Transient { retry_after, .. } => assert_eq!(retry_after, None),
            _ => panic!("expected Transient"),
        }
    }
}
