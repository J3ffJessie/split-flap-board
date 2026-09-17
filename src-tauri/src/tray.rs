//! System tray icon + close-to-tray behavior. The app keeps running in the
//! tray after the window is closed (a departure board is meant to be left
//! running); the tray's own "Quit" item is the only way to actually exit.

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Manager, WindowEvent,
};

const MAIN_WINDOW_LABEL: &str = "main";

fn show_and_focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn build_tray(app: &App) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().cloned().ok_or_else(|| {
            tauri::Error::AssetNotFound("no default window icon configured".into())
        })?)
        .menu(&menu)
        .tooltip("Split-Flap Display")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_and_focus_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_and_focus_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

/// Hides the main window instead of letting a close request quit the app —
/// the tray icon (and its Quit item) is the only way out, so the board can
/// keep running (and keep polling for urgent calendar events) after the
/// window is dismissed.
pub fn handle_window_event(window: &tauri::Window, event: &WindowEvent) {
    if window.label() != MAIN_WINDOW_LABEL {
        return;
    }
    if let WindowEvent::CloseRequested { api, .. } = event {
        let _ = window.hide();
        api.prevent_close();
    }
}
