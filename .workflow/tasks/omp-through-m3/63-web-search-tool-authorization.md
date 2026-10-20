# 63: Route the native web_search tool through Host web-search egress authorization

**Effort:** omp-through-m3
**Task type:** bugfix
**Base commit:** <commit-sha>

**Delivers:** A native `web_search` tool call reaches the existing Host `{ type: 'web-search' }` egress authorization instead of the generic tool-grant path. Normal policy permits the guarded native SearXNG transport; enterprise policy denies it before any search request; all other tools retain their generic authorization and native descriptor/approval rules.

**Blocked by:** None
**Files:** `packages/agent-service/src/worker/session.ts`, `packages/agent-service/src/worker/session-native.test.ts`
**Read first:** `packages/agent-service/src/worker/session.ts` `WorkerSession.open` observer and `authorizeTool`; `packages/web/server/lib/host/worker-operation-authorizer.js` native web-search authority; `packages/agent-service/src/worker/catalog-websearch.ts` guarded transport; CONVENTIONS §8; Task53 receipt `.workflow/omp-migration/m3/task53-websearch-2026-10-21.json`
**Covers:** W6, W9

**Check:** `bun test packages/agent-service/src/worker/session-native.test.ts` → the new tests fail before the fix because the host receives `{ type: 'tool', toolName: 'web_search' }`; after the fix the normal test receives `{ type: 'web-search' }`, performs one loopback SearXNG request and completes, while the enterprise-denial test receives `{ type: 'web-search' }`, fails the tool and performs zero loopback requests. Existing generic unknown-tool refusal and native descriptor/approval checks remain in `bunx vitest run packages/web/server/lib/host/worker-operation-authorizer.test.js`, which stays green.

- [ ] Exact `web_search` tool event maps to `authorize({ type: 'web-search' })`; other tools still use `authorizeTool`.
- [ ] Profile `allowedTools` is checked before either authorization branch.
- [ ] Normal policy allows the native loopback search; enterprise policy denies with zero egress.
- [ ] Generic unknown tools remain refused and native tools still require existing descriptors/approval.
- [ ] Focused worker test, Host boundary test, and changed-file lint/type validation are accurate; no unrelated dirty paths included.
