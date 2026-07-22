use std::path::PathBuf;

/// Downloads the aircraft's most recent .sit file from the Avid backend,
/// stashes it in a temp folder, and returns the local path for X-Plane launch.
pub async fn download_and_prepare(sit_url: &str, tail: &str) -> anyhow::Result<String> {
    let client = reqwest::Client::new();
    let bytes = client.get(sit_url).send().await?.bytes().await?;

    let mut out = std::env::temp_dir();
    out.push("avid-companion");
    std::fs::create_dir_all(&out)?;
    out.push(format!("{tail}.sit"));
    std::fs::write(&out, &bytes)?;

    Ok(out.to_string_lossy().to_string())
}

/// Scans XP12's Output/situations folder for the latest .sit and uploads it.
/// `bearer` is optional; when present it's sent as `Authorization: Bearer …`
/// so the backend can identify the pilot without exposing the companion secret.
pub async fn snapshot_and_upload(
    xp_root: &str,
    tail: &str,
    flight_id: &str,
    bearer: Option<&str>,
) -> anyhow::Result<String> {
    let situations = PathBuf::from(xp_root).join("Output").join("situations");
    let mut latest: Option<(std::time::SystemTime, PathBuf)> = None;
    for entry in std::fs::read_dir(&situations)? {
        let entry = entry?;
        if entry.path().extension().and_then(|s| s.to_str()) != Some("sit") {
            continue;
        }
        let modified = entry.metadata()?.modified()?;
        if latest.as_ref().map(|(t, _)| modified > *t).unwrap_or(true) {
            latest = Some((modified, entry.path()));
        }
    }
    let Some((_, sit_path)) = latest else {
        anyhow::bail!("No .sit files found in {}", situations.display());
    };

    let bytes = std::fs::read(&sit_path)?;
    let api_base = std::env::var("AVID_API_BASE").unwrap_or_else(|_| {
        "https://project--0b678040-0945-40d8-b885-963e81cc0a50.lovable.app".into()
    });
    let url = format!(
        "{api_base}/api/public/sit/upload?tail={tail}&flight={flight_id}"
    );

    let client = reqwest::Client::new();
    let mut req = client.post(&url).body(bytes);
    if let Some(tok) = bearer {
        req = req.header("Authorization", format!("Bearer {tok}"));
    }
    let resp = req.send().await?;
    Ok(resp.text().await?)
}
