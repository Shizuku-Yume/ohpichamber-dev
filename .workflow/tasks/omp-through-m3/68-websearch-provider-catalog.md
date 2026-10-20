# 68: Expose native search providers in the Web Search provider catalog

**Effort:** omp-through-m3
**Task type:** bugfix
**Base commit:** <commit-sha>

**Delivers:** `GET /api/agent/v1/workspaces/:workspaceId/web-search` returns `providers` drawn from the exact native search-model pool, so every `providerId` matches the selectors used by `selectedProviderId`/`fallbackProviderIds` and the Settings Web Search radios show native `web/*` search providers. Chat models that merely advertise a `webSearch` capability no longer appear as search providers.

**Blocked by:** None
**Files:** `packages/agent-service/src/worker/catalog-websearch.ts`, `packages/agent-service/src/worker/catalog-websearch.test.ts`, `packages/web/server/lib/ui-auth/canonical-host-routes.test.js` (route assertion if needed), nearest worker/web-search documentation

**Read first:** `.workflow/specs/omp-through-m3.md` W9, W10; the Task 60 pause handoff "Blocking defect outside Task60's no-backend boundary" in `.workflow/tasks/omp-through-m3/60-original-settings-ui.md`; `packages/agent-service/src/worker/catalog-websearch.ts` `readCurrent`; native `getRoleInfo('web', settings)` / `roleCandidatePool('web', …)` / `modelKind` owners; `.workflow/done/omp-through-m3/53-native-web-search.md`; `packages/agent-contract/src/websearch.ts`
**Covers:** W9, W10

**Check:** `bun test packages/agent-service/src/worker/catalog-websearch.test.ts` passes with a new assertion that the provider roster equals the native search-model selector pool and contains no chat-model IDs; `bun run --cwd packages/agent-service type-check` and touched-file `bun run --cwd packages/agent-service lint` pass; one authenticated `GET /api/agent/v1/workspaces/<workspaceId>/web-search` shows `providers` restricted to the native search pool and consistent with `selectedProviderId`/`fallbackProviderIds`. A clean-HEAD reproduction must show at least one chat-model `providerId` in `providers`.

- [ ] Derive `providers` from the same native search-model pool that supplies the `web` role chain; do not post-filter the UI list to hide chat models, and do not change the role chain itself.
- [ ] Preserve each provider's name, configured/credential flags, `requiresCredential`, `credentialWritable`, self-hosted flag, native options, and revision CAS behavior.
- [ ] Keep chat models usable as grounded-search transports where the native runtime owns them; this task changes catalog exposure, not search execution.
- [ ] Add a focused test that reads the state and asserts `providers.map(providerId)` equals the native pool selectors (including `web/hosted` handling already expected by the contract) and excludes `anthropic/*`, `openai/*`, and other chat selectors.
- [ ] Record the live Web response in `## Progress` with the workspace scope and a sanitized provider list; do not change Settings UI code to compensate.
