# 49: Native provider management, OAuth lifecycle, and custom provider discovery

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** <commit-sha>

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
