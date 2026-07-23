use std::path::{Path, PathBuf};
use std::process::Command;

/// Attempts to locate an X-Plane 12 install by scanning common locations.
/// The user can override this via the app's UI (dialog picker).
pub fn find_xplane12_root() -> anyhow::Result<Option<String>> {
    let candidates = candidate_paths();
    for p in candidates {
        if is_xplane_root(&p) {
            return Ok(Some(p.to_string_lossy().to_string()));
        }
    }
    Ok(None)
}

fn candidate_paths() -> Vec<PathBuf> {
    let mut out = Vec::new();
    #[cfg(target_os = "windows")]
    {
        for drive in ["C:", "D:", "E:", "F:"] {
            out.push(PathBuf::from(format!("{}\\X-Plane 12", drive)));
            out.push(PathBuf::from(format!("{}\\Program Files\\X-Plane 12", drive)));
            out.push(PathBuf::from(format!("{}\\Games\\X-Plane 12", drive)));
            out.push(PathBuf::from(format!("{}\\SteamLibrary\\steamapps\\common\\X-Plane 12", drive)));
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Some(home) = dirs_next_home() {
            out.push(home.join("X-Plane 12"));
            out.push(home.join("Applications/X-Plane 12"));
        }
        out.push(PathBuf::from("/Applications/X-Plane 12"));
    }
    #[cfg(target_os = "linux")]
    {
        if let Some(home) = dirs_next_home() {
            out.push(home.join("X-Plane 12"));
            out.push(home.join(".steam/steam/steamapps/common/X-Plane 12"));
        }
    }
    out
}

fn dirs_next_home() -> Option<PathBuf> {
    std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from)
}

fn is_xplane_root(p: &Path) -> bool {
    if !p.is_dir() { return false; }
    p.join("Resources").is_dir() && (
        p.join("X-Plane.exe").exists() ||
        p.join("X-Plane").exists() ||
        p.join("X-Plane.app").exists()
    )
}

pub fn launch(xp_root: &str, sit_path: Option<&str>) -> anyhow::Result<()> {
    let root = Path::new(xp_root);
    let exe = if cfg!(target_os = "windows") {
        root.join("X-Plane.exe")
    } else if cfg!(target_os = "macos") {
        root.join("X-Plane.app/Contents/MacOS/X-Plane")
    } else {
        root.join("X-Plane-x86_64")
    };

    let mut cmd = Command::new(exe);
    if let Some(sit) = sit_path {
        // X-Plane 12 accepts a .sit as a positional argument.
        cmd.arg(sit);
    }
    cmd.spawn()?;
    Ok(())
}
