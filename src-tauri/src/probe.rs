use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CapabilityReport {
    pub app_version: String,
    pub os: String,
    pub xplane: XplaneProbe,
    pub msfs2024: Msfs2024Probe,
    pub pmdg: PmdgProbe,
    pub api: ApiProbe,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct XplaneProbe {
    pub installed: bool,
    pub bridge_reachable: bool,
    pub path: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Msfs2024Probe {
    pub reachable: bool,
    pub simconnect: bool,
    pub wasm_module: bool,
    pub note: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PmdgProbe {
    pub data_broadcast: bool,
    pub note: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ApiProbe {
    pub reachable: bool,
    pub bearer_ok: bool,
    pub url: String,
}

pub async fn run_probe(bearer: Option<String>, api_url: String) -> anyhow::Result<CapabilityReport> {
    // X-Plane: reuse the existing locator and bridge status helpers.
    let xplane_path: Option<String> = crate::xp_locator::find_xplane12_root().ok().flatten();
    let bridge_reachable = tokio::net::TcpStream::connect("127.0.0.1:49152")
        .await
        .is_ok();

    // MSFS 2024 / PMDG: not yet implemented at runtime; the UI will show manual steps.
    let msfs2024 = Msfs2024Probe {
        reachable: false,
        simconnect: false,
        wasm_module: false,
        note: "Requires SimConnect bridge or WASM module (in development).".into(),
    };
    let pmdg = PmdgProbe {
        data_broadcast: false,
        note: "Requires MSFS 2024 + PMDG Data Broadcast setup.".into(),
    };

    // API/device link: lightweight health ping.
    let api = probe_api(&api_url, bearer.as_deref()).await;

    Ok(CapabilityReport {
        app_version: env!("CARGO_PKG_VERSION").into(),
        os: std::env::consts::OS.into(),
        xplane: XplaneProbe {
            installed: xplane_path.is_some(),
            bridge_reachable,
            path: xplane_path,
        },
        msfs2024,
        pmdg,
        api,
    })
}

async fn probe_api(api_url: &str, bearer: Option<&str>) -> ApiProbe {
    let url = format!("{}/api/health", api_url.trim_end_matches('/'));
    let mut req = reqwest::Client::new().get(&url).timeout(Duration::from_secs(5));
    if let Some(token) = bearer {
        req = req.header("Authorization", format!("Bearer {token}"));
    }
    let reachable = req.send().await.map(|r| r.status().is_success()).unwrap_or(false);
    ApiProbe {
        reachable,
        bearer_ok: bearer.is_some(),
        url: api_url.into(),
    }
}
