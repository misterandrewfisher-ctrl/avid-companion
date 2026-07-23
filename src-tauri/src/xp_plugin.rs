use std::fs;
use std::path::Path;

const PLUGIN_BYTES: &[u8] = include_bytes!("../../xppython3-plugin/PI_AvidBridge.py");

/// Copies the bundled PI_AvidBridge.py into the XP12 PythonPlugins folder.
/// Creates PythonPlugins if it doesn't exist. Overwrites existing file.
pub fn install(xp_root: &str) -> anyhow::Result<()> {
    let target_dir = Path::new(xp_root).join("Resources").join("plugins").join("PythonPlugins");
    fs::create_dir_all(&target_dir)?;
    let target = target_dir.join("PI_AvidBridge.py");
    fs::write(&target, PLUGIN_BYTES)?;
    Ok(())
}
