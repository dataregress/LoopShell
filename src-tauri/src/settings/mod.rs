//! Rust-owned user settings and per-monitor-layout pill positions
//! (docs/shell-architecture.md §2.1, §5.1 `settings_get`/`settings_set`).
//! Plain JSON files in the app config directory; nothing sensitive lives here.

use std::{collections::HashMap, fs, path::PathBuf};

use anyhow::Context;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::ipc::types::Settings;

const SETTINGS_FILE: &str = "settings.json";
const LAYOUT_FILE: &str = "layout.json";

/// Pill top edge, in logical px relative to the work-area top, per layout key.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Layouts {
    #[serde(default)]
    pub pill_y: HashMap<String, f64>,
}

pub struct Store {
    dir: PathBuf,
}

impl Store {
    pub fn new(app: &AppHandle) -> anyhow::Result<Self> {
        let dir = app.path().app_config_dir().context("no app config dir")?;
        fs::create_dir_all(&dir).with_context(|| format!("creating {}", dir.display()))?;
        Ok(Self { dir })
    }

    pub fn load_settings(&self) -> Settings {
        match fs::read(self.dir.join(SETTINGS_FILE)) {
            Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_else(|err| {
                log::warn!("settings.json unreadable ({err}); using defaults");
                Settings::default()
            }),
            Err(_) => Settings::default(),
        }
    }

    pub fn save_settings(&self, settings: &Settings) -> anyhow::Result<()> {
        write_atomic(&self.dir.join(SETTINGS_FILE), &serde_json::to_vec_pretty(settings)?)
    }

    pub fn load_layouts(&self) -> Layouts {
        fs::read(self.dir.join(LAYOUT_FILE)).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
    }

    pub fn save_layouts(&self, layouts: &Layouts) -> anyhow::Result<()> {
        write_atomic(&self.dir.join(LAYOUT_FILE), &serde_json::to_vec_pretty(layouts)?)
    }
}

fn write_atomic(path: &PathBuf, bytes: &[u8]) -> anyhow::Result<()> {
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, bytes).with_context(|| format!("writing {}", tmp.display()))?;
    fs::rename(&tmp, path).with_context(|| format!("replacing {}", path.display()))?;
    Ok(())
}
