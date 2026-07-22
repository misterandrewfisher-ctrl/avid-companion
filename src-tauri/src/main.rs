#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod bridge;
mod sit_manager;
mod xp_locator;
mod xp_plugin;

#[tauri::command]
async fn locate_xplane() -> Result<Option<String>, String> {
    xp_locator::find_xplane12_root().map_err(|e| e.to_string())
}

#[tauri::command]
async fn install_bridge_plugin(xp_root: String) -> Result<(), String> {
    xp_plugin::install(&xp_root).map_err(|e| e.to_string())
}

#[tauri::command]
async fn launch_xplane(xp_root: String, sit_path: Option<String>) -> Result<(), String> {
    xp_locator::launch(&xp_root, sit_path.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
async fn load_situation(sit_url: String, tail: String) -> Result<String, String> {
    sit_manager::download_and_prepare(&sit_url, &tail)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn snapshot_situation(
    xp_root: String,
    tail: String,
    flight_id: String,
    bearer: Option<String>,
) -> Result<String, String> {
    sit_manager::snapshot_and_upload(&xp_root, &tail, &flight_id, bearer.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn bridge_status() -> Result<bridge::BridgeStatus, String> {
    bridge::status().await.map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_websocket::init())
        .setup(|app| {
            use tauri::Manager;
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(bridge::start_listener(handle));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            locate_xplane,
            install_bridge_plugin,
            launch_xplane,
            load_situation,
            snapshot_situation,
            bridge_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
