# ADR-008 — Identity chain: Entra app registrations, token validation and On-Behalf-Of

| | |
|---|---|
| **Status** | Proposed (executes the ADR-002 Conditional Access checkpoint) |
| **Last updated** | 21 September 2026 |
| **Owner** | Waqas Ahmed — single owner for the Loop initiative. Functions performed: Identity (registrations, policy) · Orchestrator team (validation, OBO) · Loop Platform Team (dock configuration). Team names identify the function, not a separate group. |
| **Audience** | Identity · Security · Orchestrator team · Sub-agent owners · Endpoint engineering |
| **Related** | [ADR-002](ADR-002-auth-flow.md) · [system-architecture.md](../system-architecture.md) §4.7, §6.9 · `src-tauri/src/auth/mod.rs` · `src-tauri/src/config.rs` · ADR-006 · ADR-009 · ADR-010 · ADR-011 · ADR-012 · ADR-014 |

## Status

Proposed. ADR-002 decided *how* the dock signs in (auth code + PKCE in Rust) and left three things for later: the app registrations, the Conditional Access checkpoint, and the server side of the token. This ADR executes them. If the checkpoint shows a broker is required, ADR-002 is superseded by a new ADR and item 9 below describes what changes.

## Context

- The dock is implemented: `auth/mod.rs` runs PKCE against `https://login.microsoftonline.com/<tenant>/oauth2/v2.0`, requests `openid profile offline_access` plus one API scope (`LOOP_API_SCOPE`, e.g. `api://<loop-app-id>/Dock.Access`), stores the refresh token in the OS credential store, and derives `Session.userId` from the id token's `oid` claim, falling back to `sub`.
- `config.rs` needs `LOOP_ENTRA_TENANT`, `LOOP_ENTRA_CLIENT_ID`, `LOOP_API_SCOPE` and `LOOP_REDIRECT_URI` (default `loop://auth/callback`) at build time. None of these values exist yet.
- The API edge must validate the dock's bearer token and exchange it On-Behalf-Of for each sub-agent's scope, so a sub-agent acts as the user wherever the platform accepts Entra tokens (`system-architecture.md` §4.7). Each sub-agent has its own identity and only its own scopes (§6.9).
- The same user identifier must be used by the dock (`Session.userId`), the API edge (token subject), the Web PubSub group (`user:<id>`, ADR-010), the Attention assignee and the Ledger `actor` (ADR-009). Today the dock's `sub` fallback breaks this: `sub` is pairwise per application and would never match the server's view of the user.
- Devices are Intune / Jamf managed and may be under device-based Conditional Access. ADR-002's checkpoint (which browsers present the device claim; whether MFA is satisfied by the PRT/SSO session) must be completed before the pilot ring.

## Decision

### Scope and repositories

| Repository | What lands there |
|---|---|
| `loop-infra` (new, Cloud & AI Team with Identity) | `identity/` scripts (Microsoft Graph PowerShell or `az ad`) that create and configure every registration below idempotently, and emit the values the other repositories need. No secrets in the repo. |
| `loop-orchestrator` | Token validation middleware, OBO token acquisition, per-agent scope map, `GET /session` under Entra. |
| `loop-agent-template` / `loop-agent-<platform>` | Token validation for `Agent.Invoke`; OBO or service-identity calls to the platform. |
| `LoopShell` | Consumes the four values as build-time environment (ADR-014). One code change: require `oid` (item 5). |

### Decision items

1. **App registrations (pilot tenant).**

   | Registration | Type | Exposes | Requests (delegated) | Notes |
   |---|---|---|---|---|
   | **Loop Dock** | Public client (`isFallbackPublicClient: true`), no secret | — | Loop API `Dock.Access`; `openid`, `profile`, `offline_access` | Redirect URIs: `loop://auth/callback` and `http://127.0.0.1` (loopback fallback, port-agnostic). `Dock.Access` is also the `post_logout_redirect_uri` target's app. Enterprise app has **assignment required** on; the pilot security group is assigned. |
   | **Loop API** (the orchestrator's API edge) | Web API, v2 tokens (`accessTokenAcceptedVersion: 2`) | Scope `Dock.Access` (admin consent only, "Access Loop as the signed-in user"); identifier URI `api://<loop-api-app-id>` | `Agent.Invoke` on every sub-agent app | `knownClientApplications` includes the Dock app id for combined consent. Credential: a **federated identity credential bound to the orchestrator's user-assigned managed identity** (no client secret, no certificate). Fallback if the tenant does not permit it: certificate in Key Vault, rotated by policy. |
   | **Loop Agent — `<platform>`** (one per sub-agent) | Web API, v2 tokens | Scope `Agent.Invoke` (admin consent only) | Platform resources that accept Entra tokens (for example the platform's own Entra enterprise app), as OBO | Credential: federated identity credential to that agent's managed identity. Where the platform cannot accept a user token, the agent uses a platform service identity and stamps the approving user in the Ledger `actor` (design-brief §3.4). |

   Admin consent is granted for Dock → API, API → each agent, and each agent → its platform. No user-consent prompts in the pilot.

2. **Token validation at the API edge.** Accept only v2 access tokens where `iss` is `https://login.microsoftonline.com/<tenant>/v2.0`, `aud` is the Loop API app id (or its identifier URI), `scp` contains `Dock.Access`, `tid` is the pilot tenant, and `azp` is the Loop Dock app id. Signature via the tenant's OIDC discovery keys, cached and refreshed. Anything else is `401` with code `unauthenticated`. A valid token whose `oid` is not a member of the pilot group is `403` code `rejected` (defence in depth behind "assignment required").

3. **User identifier is `oid`, everywhere.** `userId` on `Session`, the Web PubSub group `user:<oid>`, `AttentionItem.requester.userId` / assignee, `LedgerRow.actor.userId`, `Person.userId`, and the Cosmos partition keys that carry a user (ADR-009). UPN is display-only and may change; `oid` does not.

4. **On-Behalf-Of.** The edge exchanges the dock's token for a token with `scp: Agent.Invoke` for the target sub-agent (`Microsoft.Identity.Web` or the equivalent MSAL confidential-client flow, ADR-011), per request, cached by the library for the token lifetime. The sub-agent validates `aud` = its own app id and `scp` contains `Agent.Invoke`, then performs its own OBO to the platform. A2A push-notification callbacks from the agent to the orchestrator (ADR-007 item 5) carry a token for the Loop API obtained by the agent's identity (client credentials, app role `Agent.Callback` on the Loop API app).

5. **Dock change: `oid` is required.** `auth/mod.rs` stops falling back to `sub`; a token without `oid` is a sign-in error. Scheduled under ADR-014.

6. **Sign-out.** The dock's end-session call uses `post_logout_redirect_uri = loop://auth/callback`; the URI is already registered (item 1). The edge treats a valid token as authoritative until `exp`; there is no server-side session to revoke. `forceSignOut` in remote config (ADR-006) is the operational revocation path; Entra revocation (`revokeSignInSessions`) is the security path and takes effect at next refresh.

7. **Token lifetimes.** Default access-token lifetime (60–90 minutes) with the dock refreshing five minutes early (`REFRESH_LEAD`). Refresh-token lifetime and sign-in frequency follow the tenant's Conditional Access policy; Identity records the expected values so the 24-hour refresh soak (ADR-002 follow-up) has a pass criterion.

8. **Conditional Access checkpoint — executed, not deferred.** On an Entra-joined device with the standard image, with the pilot CA policies applied to the Loop API app:

   | Test | Browsers | Record |
   |---|---|---|
   | Interactive sign-in via system browser completes and the dock receives the callback | Edge (default), Chrome with and without the Windows Accounts extension, Firefox | Pass / fail per browser |
   | Device-based CA satisfied without re-authentication | Same | Whether the device claim was presented |
   | MFA satisfied by the PRT / SSO session (no second prompt) | Same | Yes / no |
   | macOS: same with the Enterprise SSO plug-in deployed by Jamf; Safari and Chrome | Safari, Chrome | Pass / fail |
   | Silent refresh after 24 hours | — | Pass / fail (soak) |

   Outcome A (all default browsers pass): ADR-002 stands. Outcome B (a required browser fails or a broker is mandated by policy): ADR-002 is superseded by an ADR adopting WAM on Windows and the Enterprise SSO broker on macOS; token storage, the UI contract, and every server-side item in this ADR are unchanged, because the token the edge receives is the same v2 access token.

9. **Environments.** Two sets of registrations: `dev` (developer tenant or a dedicated dev app set in the pilot tenant, redirect URIs include `http://127.0.0.1`) and `pilot`. The dock has one build per set (ADR-014). No production set exists until GA.

### Prerequisites

Owner for every row: Waqas Ahmed. The "Function" column names the hat being worn, so the row can be handed over if a team is named later.

| # | Prerequisite | Function |
|---|---|---|
| P1 | Pilot tenant id and a pilot security group | Identity |
| P2 | Global Administrator or Privileged Role Administrator to grant admin consent; Application Administrator for registrations | Identity |
| P3 | The orchestrator's and each agent's user-assigned managed identities exist (ADR-011, ADR-012), for the federated credentials | Cloud & AI Team |
| P4 | Test devices: one Entra-joined Windows 11 on the standard image, one Jamf-managed Mac with the Enterprise SSO plug-in | Endpoint engineering |
| P5 | Confirmation that the tenant permits managed identities as federated identity credentials; otherwise Key Vault for certificates | Identity |

### Steps

1. Write `loop-infra/identity/` scripts: create the three registration kinds, expose scopes, set redirect URIs, set `accessTokenAcceptedVersion`, add `knownClientApplications`, create federated credentials, grant admin consent, set assignment-required and assign the pilot group. Scripts are idempotent and print a values block (`tenantId`, `dockClientId`, `apiAppId`, `apiScope`, per-agent app ids).
2. Run for `dev`; commit the non-secret values as `loop-infra/identity/values.dev.json`.
3. Implement token validation and OBO in `loop-orchestrator` against `dev`; unit tests for each rejection in item 2 with hand-built tokens; integration test with a real dock token.
4. Build a `dev` dock (ADR-014 build flavour) and complete a sign-in, a `GET /session`, and a `POST /ask` end to end.
5. Run the item 8 checkpoint on the test devices; record results in ADR-002's checkpoint section and decide outcome A or B.
6. Run the 24-hour refresh soak on both OSes; record.
7. Security review of `src-tauri/src/auth/` and of the edge's validation middleware (ADR-002 follow-up). Findings become issues, not scope creep here.
8. Run the scripts for `pilot`; commit `values.pilot.json`; hand the values to ADR-014.

### Acceptance

- A pilot-group user signs into the `pilot` dock build and reaches `GET /session` with `userId` equal to the `oid` the edge sees.
- A non-pilot user is refused at Entra (assignment required) and, with the check disabled in a test, at the edge with `403`.
- OBO to `servicenow-itsm` yields a token with `aud` = the agent app and `scp` = `Agent.Invoke`; the agent's OBO to the platform succeeds, or the service-identity path stamps the user.
- The CA checkpoint table is filled in for every listed browser.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| One app registration for the whole of Loop | A compromised sub-agent could present the orchestrator's token to any platform; violates §6.9 (one identity per agent). |
| Client secrets or certificates for OBO | Federated credentials to managed identities remove secret handling and rotation; certificates stay as the documented fallback only. |
| User identifier = UPN | UPNs change on rename and marriage; Ledger rows and partition keys would fragment. `oid` is immutable per tenant. |
| Skip the CA checkpoint and find out in the pilot | ADR-002 made it a gate. A broker requirement discovered at rollout would stall every pilot device. |
| Server-side session store with revocation | Adds a stateful component for a benefit `forceSignOut` (config) plus Entra revocation already provide. |
| MSAL in the dock | Banned by ADR-002 and `loop-stack-locked.mdc`; no Rust MSAL. |

## Consequences

**Positive**

- Every hop presents a token scoped to exactly that hop; audit shows the user, not a service principal, wherever the platform allows it.
- No secrets in any repository or pipeline for OBO.
- The CA question is answered before devices are touched.

**Negative and mitigations**

- Admin consent and registrations need privileged roles and lead time. Mitigation: start on day one; the scripts make re-runs cheap.
- Federated credentials to managed identities may not be enabled in the tenant. Mitigation: the Key Vault certificate fallback is specified and the OBO code takes a credential abstraction.
- Requiring `oid` changes dock behaviour. Mitigation: tokens from Entra always carry `oid`; the change removes a fallback that could never have been correct.

**Follow-ups**

- ADR-014 bakes the `pilot` values into the dock build and removes the `sub` fallback.
- If outcome B, write the superseding ADR before any pilot device is enrolled.

## References

- ADR-002 — flow, storage, UI contract, checkpoint definition.
- Auth code + PKCE: https://learn.microsoft.com/entra/identity-platform/v2-oauth2-auth-code-flow
- On-Behalf-Of: https://learn.microsoft.com/entra/identity-platform/v2-oauth2-on-behalf-of-flow
- Managed identity as federated identity credential: https://learn.microsoft.com/entra/workload-id/workload-identity-federation-config-app-trust-managed-identity
- Access token claims (`oid`, `azp`, `scp`, `tid`): https://learn.microsoft.com/entra/identity-platform/access-token-claims-reference
- Conditional Access: https://learn.microsoft.com/entra/identity/conditional-access/overview
- Enterprise SSO plug-in (macOS): https://learn.microsoft.com/entra/identity-platform/apple-sso-plugin
