//! Display mode switching — resizable window, always-on-top borderless
//! widget, or fullscreen kiosk mode.

use serde::{Deserialize, Serialize};
use tauri::LogicalSize;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DisplayMode {
    Windowed,
    Widget,
    Fullscreen,
}

const WINDOWED_SIZE: (f64, f64) = (960.0, 400.0);
const WIDGET_SIZE: (f64, f64) = (340.0, 140.0);

#[tauri::command]
pub fn set_display_mode(window: tauri::WebviewWindow, mode: DisplayMode) -> Result<(), String> {
    match mode {
        DisplayMode::Windowed => {
            window.set_fullscreen(false).map_err(|e| e.to_string())?;
            window.set_always_on_top(false).map_err(|e| e.to_string())?;
            window.set_decorations(true).map_err(|e| e.to_string())?;
            window.set_resizable(true).map_err(|e| e.to_string())?;
            let (w, h) = WINDOWED_SIZE;
            window
                .set_size(LogicalSize::new(w, h))
                .map_err(|e| e.to_string())?;
        }
        DisplayMode::Widget => {
            window.set_fullscreen(false).map_err(|e| e.to_string())?;
            window.set_decorations(false).map_err(|e| e.to_string())?;
            window.set_always_on_top(true).map_err(|e| e.to_string())?;
            window.set_resizable(false).map_err(|e| e.to_string())?;
            let (w, h) = WIDGET_SIZE;
            window
                .set_size(LogicalSize::new(w, h))
                .map_err(|e| e.to_string())?;
        }
        DisplayMode::Fullscreen => {
            window.set_fullscreen(true).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
