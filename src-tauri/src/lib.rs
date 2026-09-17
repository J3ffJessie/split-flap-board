mod calendar_api;
mod calendar_oauth;
mod http_retry;
mod quote_api;
mod quotes;
mod time_util;
mod tray;
mod window;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            tray::build_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| tray::handle_window_event(window, event))
        .invoke_handler(tauri::generate_handler![
            greet,
            quotes::list_local_quotes,
            quotes::add_local_quote,
            quotes::update_local_quote,
            quotes::delete_local_quote,
            quotes::bulk_add_local_quotes,
            quote_api::fetch_api_quotes,
            window::set_display_mode,
            calendar_oauth::save_calendar_client_config,
            calendar_oauth::calendar_connection_status,
            calendar_oauth::disconnect_calendar,
            calendar_oauth::start_calendar_auth,
            calendar_api::fetch_calendar_events,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
