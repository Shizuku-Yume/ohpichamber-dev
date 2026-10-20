# 49: Native provider management, OAuth lifecycle, and custom provider discovery

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** 93d519221527e15cf52a5dde0d6ddf011c7527bb
**Started:** 2026-10-18
**Status:** active

**Delivers:** End-to-end native provider management across canonical contracts, Agent Service, Host Gateway, and UI: non-secret account roster, account labels, default account selection, native OAuth flow lifecycle (start, status, input, cancel) backed by the native SDK provider registry, and custom provider configuration, persistence, and model discovery.

**Blocked by:** None
**Files:** `packages/agent-contract/src/catalogs.ts`, `packages/agent-service/src/worker/catalog-models.ts`, `packages/agent-service/src/worker/catalog-credentials.ts`, `packages/ui/src/components/sections/providers/`, `packages/web/server/lib/`, `.workflow/development.md`, `.workflow/specs/omp-through-m3.md`
**Read first:** `.workflow/specs/omp-through-m3.md` W6, W9, W10; `packages/agent-contract/src/catalogs.ts`; `packages/agent-service/src/worker/catalog-credentials.ts`; `packages/agent-service/src/worker/catalog-models.ts`; installed native OMP SDK provider registry and `AuthStorage` APIs; Host enterprise boundaries
**Covers:** W6, W9, W10

**Architecture & Boundaries:**

- **Worker ownership:** Dedicated Bun Agent Service worker owns `AuthStorage`, OAuth secrets, and the native models file. All native resources reside in the Bun SDK worker, accessed through Canonical Client and Host Gateway. Node Host and UI never import or run the native SDK.
- **Enterprise policy & Host gate:** Host enforces authentication and preserves existing native provider-entry Host authorization/enterprise gates on all provider and credential routes. Do not invent legacy `provider.use` / `integration.use` policy checks on native endpoints.
- **Opaque non-secret public contract:** Public records expose opaque `credentialRef` tokens (never internal storage row IDs or filesystem paths). Tokens and secret headers are write-only; error messages are sanitized before client exposure.
- **Transactional native OAuth flows:** Native OAuth flows use in-memory token return via SDK `getProviderDefinition` / `getOAuthProvider.login` callbacks. Credentials commit only through serialized coordinator mutations after checking `expectedRevision` CAS to prevent out-of-band persistence by async `AuthStorage.oauth.login`.
- **Flow lifecycle & binding:** Each flow binds `workspaceId`, `agentDirectory`, `providerId`, worker generation, and a unique `flowId`. Abort, disconnect, and worker restart cleanly dispose in-flight flows. A manual callback/authorization-code entry prompt is provided for remote or non-loopback environments; no external network authentication is required for local controlled verification.
- **Account labeling & multi-account:** Native `AuthStorage` does not natively store account labels. Canonical application labels in private configuration keyed by `credentialRef` provide intentional application metadata. Default account selection binds to existing native model resolution.
- **Identity separation:** Separate native login method ID from stored provider ID (`storeCredentialsAs`).
- **Retained functionality:** Native implementation replaces legacy OpenCode integration form fields without deleting OAuth, multi-account, or custom provider capabilities.
- **Schema extension:** Intentionally extend existing canonical Provider/Model mutation schemas in `catalogs.ts`; do not build OpenCode-shaped adapters or pass-through shims. Do not rewrite native SDK fields to cater to legacy UI expectations.

**Check:** Unit and integration tests covering native storage, service restart/reopen, account selection, and controlled loopback OAuth callback / mock discovery; verification that real official third-party grants remain explicitly unexercised.

**Acceptance:**

- [ ] Canonical provider schemas support non-secret account rosters, opaque `credentialRef`s, and custom provider definitions.
- [ ] In-memory OAuth flow lifecycle (start, status, input, cancel) integrates with native SDK provider registry under coordinator revision CAS.
- [ ] Custom provider definitions support endpoint configuration, custom headers, and model discovery without OpenCode shims.
- [ ] Enterprise policy and Host authentication guard all provider routes.
- [ ] Node Host and UI remain free of SDK imports.
- [ ] Focused provider tests pass; actual native storage/reopen/selection is verified.

## Progress

- Implementation branch: `m3-native/providers-20261018`; isolated worktree: `/home/shizuku/Project/ohpichamber-worktrees/m3-native-providers`. The initial alternate-index worktree setup was corrected with parent-authorized `git read-tree HEAD` without modifying working files.
- Added intentional native provider-management contracts and authenticated canonical transport for account rosters/labels/default selection/removal, native OAuth method identity versus stored provider identity, explicit OAuth lifecycle and CAS commit, custom provider configuration readback and discovery.
- Native Bun workers own SDK storage and flow memory. Native registry login callbacks return grants into private memory; start/status/input/cancel do not advance catalog revision. Only explicit serialized `commit` writes credentials after retained starting revision and generation/flow checks. Disconnect and worker close abort flows.
- Pending/ready OAuth resources use a worker-owned 60-second lease renewed by active status/input calls. Browser departure or a lost start response therefore aborts callback resources and discards private grants rather than retaining them indefinitely. This is abandonment cleanup only; the native SDK still owns login protocol lifetime.
- Account labels are private app metadata keyed by opaque credential references, not native database IDs or OpenCode settings. Default selected credentials bind actual native model resolution; source-owned authentication remains source-owned. Custom header values are literal, private, write-only configuration; public readback exposes names only.
- Runtime surfaces: Web/PWA, Electron, hosted mobile and Capacitor all use the same Canonical Client → authenticated Host → Bun worker path. Remote/mobile browser OAuth supports manual callback/code input; browser-session cookie prompts use masked manual entry. Enterprise mode refuses provider entry/discovery while retaining account selection/removal/labels and cancellation/status.
- Added focused deterministic contract, coordinator, Host/client, native persistence/selection, OAuth lifecycle and loopback discovery regressions. Official third-party grants remain unexercised.
- Verification intentionally NOT run: no builds, tests, type-checks, lint or formatters during parallel implementation. Parent must run focused regressions and integrated checks once after landing all slices. Acceptance boxes remain unchecked and this task stays unarchived pending actual proof.
