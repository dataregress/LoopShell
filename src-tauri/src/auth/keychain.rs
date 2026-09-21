//! Refresh-token storage in the OS credential store (ADR-002 §4).
//! Windows Credential Manager / macOS Keychain via `keyring`. Nothing else
//! ever touches disk; access tokens stay in memory.

use serde::{Deserialize, Serialize};

const SERVICE: &str = "loop-dock";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredCredential {
    pub refresh_token: String,
    pub user_id: String,
    pub display_name: Option<String>,
    pub upn: Option<String>,
}

pub struct Keychain {
    tenant_id: String,
}

impl Keychain {
    pub fn new(tenant_id: impl Into<String>) -> Self {
        Self { tenant_id: tenant_id.into() }
    }

    fn entry(&self) -> keyring::Result<keyring::Entry> {
        keyring::Entry::new(SERVICE, &format!("{}/refresh", self.tenant_id))
    }

    pub fn load(&self) -> Option<StoredCredential> {
        let entry = self.entry().ok()?;
        match entry.get_password() {
            Ok(json) => serde_json::from_str(&json).ok(),
            Err(keyring::Error::NoEntry) => None,
            Err(err) => {
                log::warn!("keychain read failed: {err}");
                None
            }
        }
    }

    pub fn save(&self, cred: &StoredCredential) -> anyhow::Result<()> {
        let json = serde_json::to_string(cred)?;
        self.entry()?.set_password(&json)?;
        Ok(())
    }

    pub fn clear(&self) {
        if let Ok(entry) = self.entry() {
            match entry.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => {}
                Err(err) => log::warn!("keychain delete failed: {err}"),
            }
        }
    }
}
