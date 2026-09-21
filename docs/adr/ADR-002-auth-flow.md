# ADR-002 — Authentication: Entra ID authorization code + PKCE in the Rust layer

| | |
|---|---|
| **Status** | Accepted (with a Conditional Access checkpoint) |
| **Last updated** | 18 September 2026 |
| **Owner** | Waqas Ahmed (single owner for the Loop initiative; Loop Platform Team function) |
| **Audience** | Loop build team · Identity · Security |
| **Related** | [shell-architecture.md](../shell-architecture.md) §6 · [technology.md](../technology.md) · ADR-001 |

## Status

Accepted. The Conditional Access checkpoint below must be completed by the identity team before Phase 5 work starts; if a broker is required, this ADR is superseded, not amended.

## Context

- Users sign in with their Entra ID work account. The dock calls one Loop backend (the orchestrator API and Web PubSub negotiate endpoint) with a bearer token; the backend uses On-Behalf-Of to act as the user on platforms that accept Entra tokens.
- Tokens must never be exposed to the webview: the UI layer is a renderer, not a security boundary. Tokens must survive restarts and be removed on sign-out.
- Devices are Intune / Jamf managed and Entra-joined or registered. The pilot tenant may enforce device-based Conditional Access.
- There is no MSAL library for Rust. The earlier brief said "via MSAL"; that is not achievable in the chosen stack and the wording is corrected here.

## Decision

1. **Flow:** OAuth 2.0 authorization code with PKCE (S256), public client, implemented in Rust with the `oauth2` crate and `reqwest`. `state` and `nonce` are generated per attempt and verified.
2. **Browser:** the system browser is launched for the interactive step (`open` / `ShellExecute`). No embedded webview sign-in.
3. **Redirect:** custom scheme `loop://auth/callback` handled by `tauri-plugin-deep-link`, paired with `tauri-plugin-single-instance` (deep-link feature) so the callback reaches the running instance on Windows. Fallback: loopback `http://127.0.0.1:<ephemeral>/callback` if the scheme is blocked by policy.
4. **Storage:** access and refresh tokens are stored via the `keyring` crate in the OS credential store (Windows Credential Manager, macOS Keychain) under `loop-dock/<tenantId>/<userId>`. Nothing is written to disk elsewhere and nothing is sent to the webview.
5. **Session:** Rust performs silent refresh before expiry; on refresh failure it emits `session_changed { state: 'signed_out', reason }` and the UI raises an Attention item "Sign in again". Sign-out revokes locally (deletes keyring entries) and calls the Entra end-session endpoint in the system browser.
6. **Scopes:** `openid profile offline_access` plus the orchestrator API scope `api://<loop-app-id>/Dock.Access`. No Graph scopes on the client; platform access is On-Behalf-Of on the server.
7. **UI contract:** the webview sees only `Session { state, displayName, upn, tenantId, expiresAt }` via `auth_get_session` and the `session_changed` event.

## Conditional Access checkpoint (identity team, before Phase 5)

System-browser PKCE satisfies device-based CA only when the browser presents the device claim:

- Windows Entra-joined: Microsoft Edge does natively; Chrome requires the Windows Accounts extension; Firefox does not.
- macOS: requires the Microsoft Enterprise SSO plug-in deployed by Jamf/Intune; Safari and Chrome then present device state.

Identity records, per pilot policy: (a) which browsers on the standard image pass CA for this app registration, (b) whether MFA is satisfied by the PRT/SSO session. If the tenant requires brokered authentication (WAM on Windows, Company Portal/broker on macOS), see "Fallback" below.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| **MSAL (any language) in-process** | No Rust MSAL. Embedding .NET or Swift for MSAL adds a second runtime and a cross-language boundary around the most sensitive code path. |
| **Sign-in inside the Tauri webview** | Violates "tokens never in the webview"; blocked by Microsoft guidance for embedded browsers; breaks SSO with the system browser session. |
| **Device code flow** | Poor UX for a daily-use client; no device claim. |
| **Backend-held tokens with a dock session cookie** | Moves the problem to a bespoke session service and still needs a secure client credential; more surface for less benefit. |
| **WAM broker via WinRT (`WebAuthenticationCoreManager`) now** | Best CA compliance on Windows, but Windows-only and requires WinRT interop from Rust plus a different macOS path. Kept as the documented fallback, not the default. |

## Fallback (if CA requires a broker)

Supersede this ADR with ADR-00N: Windows uses WAM through the `windows` crate (`Windows.Security.Authentication.Web.Core`), macOS uses the Enterprise SSO plug-in's broker flow via `ASWebAuthenticationSession` in `native/macos.rs`. Token storage and the UI contract are unchanged.

## Consequences

**Positive:** tokens never leave Rust; SSO via the system browser session; no additional runtime; auditable, small code path.

**Negative:** default browser matters for CA; hand-rolled PKCE needs careful review (state/nonce, redirect validation, token response handling); refresh-token lifetime policy must be confirmed with Identity.

**Follow-ups:** app registration with `loop://auth/callback` and loopback redirect; scripted sign-in test on an Entra-joined device under pilot CA; 24-hour refresh soak; security review of `auth/` module.

## References

- Auth code + PKCE: https://learn.microsoft.com/entra/identity-platform/v2-oauth2-auth-code-flow
- Desktop app scenario: https://learn.microsoft.com/entra/identity-platform/scenario-desktop-overview
- Conditional Access: https://learn.microsoft.com/entra/identity/conditional-access/overview
- `oauth2` crate: https://docs.rs/oauth2 · `keyring`: https://docs.rs/keyring
