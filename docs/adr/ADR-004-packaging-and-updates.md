# ADR-004 — Packaging and updates: MSI + notarized .pkg, MDM-owned distribution and updates

| | |
|---|---|
| **Status** | Accepted for the pilot; revisit before GA |
| **Last updated** | 18 September 2026 |
| **Owner** | Waqas Ahmed (single owner for the Loop initiative; Loop Platform Team function) |
| **Audience** | Loop build team · Endpoint engineering (Intune, Jamf) · Security |
| **Related** | [technology.md](../technology.md) · [shell-architecture.md](../shell-architecture.md) §10 · ADR-001 |

## Status

Accepted for the pilot ring. An in-app updater is explicitly deferred; the decision is revisited before general availability.

## Context

- Devices are managed: Windows 11 via Intune, macOS via Jamf (Intune as an alternative). Endpoint engineering already has packaging, detection and rollback processes for both.
- The v0.1 brief said "signed MSIX via Intune" and "signed auto-update with Intune/Jamf as fallback". Both need correcting:
  - The Tauri 2 bundler produces MSI (WiX) and NSIS for Windows; MSIX would be a custom packaging step with registry virtualisation that complicates deep-link registration and autostart.
  - A per-user in-app updater and a per-machine MDM-installed app conflict on version detection and elevation; two update owners is one too many for a pilot.
- Security review requires signed binaries, an SBOM and dependency audits before anything reaches a user device.

## Decision

**Windows**

- Bundle: **MSI via WiX** from the Tauri CLI, per-machine, silent install (`msiexec /i Loop.msi /qn`), with the WebView2 Evergreen bootstrapper declared as a dependency (fleet check confirms runtime presence on the standard image).
- Signing: **Azure Trusted Signing** in CI.
- Registers `loop://` protocol handler, Start-menu shortcut with AppUserModelID (required for toast notifications), autostart via the autostart plugin (HKCU Run) toggled from Settings.
- Distribution: Intune Win32 app (`.intunewin` via the Content Prep Tool), detection rule on product version, uninstall command, assignment to the pilot group.

**macOS**

- Bundle: signed `.app` and **notarized `.pkg`** from the Tauri CLI, Developer ID Application and Installer certificates, notarization in CI.
- Login item for autostart; PPPC profile only if a future permission requires it (none for MVP).
- Distribution: Jamf policy with smart group; Intune as alternative path.

**Updates**

- **MDM owns updates for the pilot.** Each release is a new MSI / `.pkg` version pushed by Intune and Jamf. No `tauri-plugin-updater`, no update checks from the app.
- The app reports its version in telemetry and reads remote config (kill switch, agent enable flags) on start and on an interval; that is the only "remote" behaviour.

**Release pipeline**

- One tag builds both installers on macOS and Windows runners, signs and notarizes, publishes artefacts with retention, generates an SBOM, and runs `cargo audit` and `pnpm audit`.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| MSIX | Not produced by the Tauri bundler; registry/file virtualisation complicates protocol handler and autostart; Intune detection of MSIX versions is fine but adds nothing over MSI for a per-machine install. |
| NSIS | Supported by Tauri but per-machine silent install, repair and detection are weaker than MSI in Intune. |
| `tauri-plugin-updater` alongside MDM | Two update owners; per-user updater cannot replace a per-machine install without elevation; makes the endpoint team's rollback story unreliable. |
| Mac App Store / Microsoft Store | Review latency and entitlement constraints incompatible with a non-activating always-on-top panel and a pilot cadence. |
| Homebrew / winget | Not usable through MDM for a managed fleet; not appropriate for an internal enterprise app. |

## Consequences

**Positive:** single update owner with existing rollback tooling; standard installer formats endpoint engineers already know; signed and notarized artefacts from one tag.

**Negative:** release cadence is bound to MDM deployment windows; users cannot self-update; a GA product will likely want faster patching.

**Follow-ups:** raise Apple Developer Program (organisation), Developer ID certificates and Trusted Signing account on day one (multi-week lead times); book Intune and Jamf packaging slots early; before GA, decide between staying MDM-only and adopting a policy-controlled updater (ADR to follow).

## References

- Tauri bundler: https://v2.tauri.app/distribute/
- WebView2 distribution: https://learn.microsoft.com/microsoft-edge/webview2/concepts/distribution
- Azure Trusted Signing: https://learn.microsoft.com/azure/trusted-signing/
- Intune Win32 app management: https://learn.microsoft.com/mem/intune/apps/apps-win32-app-management
