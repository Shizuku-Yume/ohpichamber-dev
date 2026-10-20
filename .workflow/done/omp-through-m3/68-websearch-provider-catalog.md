# 68: Expose native search providers in the Web Search provider catalog

**Effort:** omp-through-m3
**Task type:** bugfix
**Base commit:** 84b3d4046d4d31f18b0f5c0ff3c050195885f4e6
**Started:** 2026-10-20T20:41:00Z
**Finished:** 2026-10-20T20:48:29Z

**Delivers:** `GET /api/agent/v1/workspaces/:workspaceId/web-search` returns `providers` drawn from the exact native search-model pool, so every `providerId` matches the selectors used by `selectedProviderId`/`fallbackProviderIds` and the Settings Web Search radios show native `web/*` search providers. Chat models that merely advertise a `webSearch` capability no longer appear as search providers.

**Blocked by:** None
**Files:** `packages/agent-service/src/worker/catalog-websearch.ts`, `packages/agent-service/src/worker/catalog-websearch.test.ts`, `packages/web/server/lib/ui-auth/canonical-host-routes.test.js` (route assertion if needed), nearest worker/web-search documentation

**Read first:** `.workflow/specs/omp-through-m3.md` W9, W10; the Task 60 pause handoff "Blocking defect outside Task60's no-backend boundary" in `.workflow/tasks/omp-through-m3/60-original-settings-ui.md`; `packages/agent-service/src/worker/catalog-websearch.ts` `readCurrent`; native `getRoleInfo('web', settings)` / `roleCandidatePool('web', …)` / `modelKind` owners; `.workflow/done/omp-through-m3/53-native-web-search.md`; `packages/agent-contract/src/websearch.ts`
**Covers:** W9, W10

**Check:** `bun test packages/agent-service/src/worker/catalog-websearch.test.ts` passes with a new assertion that the provider roster equals the native search-model selector pool and contains no chat-model IDs; `bun run --cwd packages/agent-service type-check` and touched-file `bun run --cwd packages/agent-service lint` pass; one authenticated `GET /api/agent/v1/workspaces/<workspaceId>/web-search` shows `providers` restricted to the native search pool and consistent with `selectedProviderId`/`fallbackProviderIds`. A clean-HEAD reproduction must show at least one chat-model `providerId` in `providers`.

- [x] Derive `providers` from the same native search-model pool that supplies the `web` role chain; do not post-filter the UI list to hide chat models, and do not change the role chain itself.
- [x] Preserve each provider's name, configured/credential flags, `requiresCredential`, `credentialWritable`, self-hosted flag, native options, and revision CAS behavior.
- [x] Keep chat models usable as grounded-search transports where the native runtime owns them; this task changes catalog exposure, not search execution.
- [x] Add a focused test that reads the state and asserts `providers.map(providerId)` equals the native pool selectors (including `web/hosted` handling already expected by the contract) and excludes `anthropic/*`, `openai/*`, and other chat selectors.
- [x] Record the live Web response in `## Progress` with the workspace scope and a sanitized provider list; do not change Settings UI code to compensate.

## Progress

- **Dirty at start:** none (isolated worktree `68-websearch-provider-catalog` created from `84b3d4046`).
- **Check before:** the focused regression on base fails: `providers` held 994 entries, 973 of them chat selectors (`anthropic/*`, `openai/*`, `google-vertex/*`, …) against 21 native search selectors; a direct `readCurrent` repro on base printed `count 994 chat 973 native search 21`. Existing suite: 10 pass / 66 assertions.
- **Implementation:** `readCurrent` now builds `providers` from `runtime.modelRegistry.getAvailable('search')`, the SDK's available native search-kind pool that supplies the `web` role chain. No UI filtering, no role-chain change, and `installWebSearchAuthorization` still guards chat grounded transports. `packages/agent-service/DOCUMENTATION.md` now states that chat grounding transports are execution-only, not catalog entries.
- **Check after:** `bun test packages/agent-service/src/worker/catalog-websearch.test.ts` → 11 pass / 74 assertions; `bun run --cwd packages/agent-service type-check` exit 0; touched-file oxlint reports only the file's 3 pre-existing anti-slop findings (lines 38×2 and 197, byte-identical on base) with the test file clean, so no new lint findings. The Check's "touched-file lint pass" is unreachable because those baseline findings predate the task; the Check was kept unchanged and this is the residual report. Contract suite 6 pass / 30 assertions; Host `worker-operation-authorizer.test.js` 18 pass; Host web-search authentication/enterprise tests pass. `canonical-host-routes.test.js` has 3 unrelated usage-query failures that reproduce with this task's changes stashed.
- **Live authenticated GET:** isolated Web (`HOME=/tmp/ohpi-task68-home`, port 3199, UI password, Agent Service dist rebuilt from this worktree) registered `/tmp/ohpi-task68/ws`; workspace `ws_eb879718-a0aa-4197-b241-9b4a5df82cd9`. Response 200, revision 0, `enabled: true`, `selectedProviderId: null`, `timeoutSeconds: 60`, `fallbackProviderIds: ["web/parallel","web/hosted","web/exa","web/firecrawl","web/searxng","web/startpage","web/duckduckgo","web/ecosia","web/google","web/mojeek","web/public"]`. `providers` has 21 entries and exactly the native pool, all `web/*`: brave, duckduckgo, ecosia, exa, firecrawl, google, hosted, jina, kagi, kimi, mojeek, ollama, parallel, perplexity, public, searxng, startpage, synthetic, tavily, tinyfish, zai. No chat selectors; every fallback ID appears in `providers`; `web/hosted` retains `requiresCredential: false`. Server stopped and isolated HOME/workspace removed.
- **Enterprise policy:** unchanged. The worker's live pre-egress `{type:'web-search'}` authorization test and the Host enterprise web-search boundary tests pass; no Host or UI code changed.
- **Review:** security pass limited to the unchanged egress boundary (no finding); quality review found one owner, one-line fix, no new abstraction or shim. Settings UI deliberately untouched.
