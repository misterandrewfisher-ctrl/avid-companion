use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const BRIDGE_URL: &str = "ws://127.0.0.1:49152";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BridgeStatus {
    pub connected: bool,
    pub xplane_running: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type")]
pub enum BridgeMessage {
    #[serde(rename = "telemetry")]
    Telemetry { lat: f64, lon: f64, alt_ft: f64, gs_kts: f64, on_ground: bool, phase: String },
    #[serde(rename = "landing")]
    Landing { vs_fpm: f64, g_load: f64, touchdown_lat: f64, touchdown_lon: f64 },
    #[serde(rename = "engine_start")]
    EngineStart { engine: u8 },
    #[serde(rename = "engine_stop")]
    EngineStop { engine: u8, hours: f64 },
    #[serde(rename = "hello")]
    Hello { aircraft: String, xp_version: String },
}

/// Long-running WS listener. Auto-reconnects on drop.
pub async fn start_listener(app: AppHandle) {
    loop {
        match connect_once(&app).await {
            Ok(_) => {},
            Err(e) => eprintln!("[bridge] disconnected: {e}"),
        }
        tokio::time::sleep(Duration::from_secs(3)).await;
    }
}

async fn connect_once(app: &AppHandle) -> anyhow::Result<()> {
    use futures_util::StreamExt;
    use tokio_tungstenite::connect_async;

    let (mut ws, _) = connect_async(BRIDGE_URL).await?;
    let _ = app.emit("bridge:connected", true);

    while let Some(msg) = ws.next().await {
        let msg = msg?;
        if let tokio_tungstenite::tungstenite::Message::Text(txt) = msg {
            if let Ok(parsed) = serde_json::from_str::<BridgeMessage>(&txt) {
                let _ = app.emit("bridge:message", parsed);
            }
        }
    }
    let _ = app.emit("bridge:connected", false);
    Ok(())
}

pub async fn status() -> anyhow::Result<BridgeStatus> {
    // Simple probe: try to open a TCP connection to the WS port.
    let connected = tokio::net::TcpStream::connect("127.0.0.1:49152").await.is_ok();
    Ok(BridgeStatus { connected, xplane_running: connected })
}
