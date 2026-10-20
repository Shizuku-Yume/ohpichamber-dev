# 63: Route the native web_search tool through Host web-search egress authorization

**Effort:** omp-through-m3
**Task type:** bugfix
**Base commit:** a01cc3715a66f59b20a1751d42c9e1149d12fcab

**Started:** 2026-10-21T03:30:00Z

**Finished:** 2026-10-21T03:45:00Z

**Delivers:** A native `web_search` tool call reaches the existing Host `{ type: 'web-search' }` egress authorization instead of the generic tool-grant path. Normal policy permits the guarded native SearXNG transport; enterprise policy denies it before any search request; all other tools retain their generic authorization and native descriptor/approval rules.

**Blocked by:** None
**Files:** `packages/agent-service/src/worker/session.ts`, `packages/agent-service/src/worker/session-native.test.ts`
**Read first:** `packages/agent-service/src/worker/session.ts` `WorkerSession.open` observer and `authorizeTool`; `packages/web/server/lib/host/worker-operation-authorizer.js` native web-search authority; `packages/agent-service/src/worker/catalog-websearch.ts` guarded transport; CONVENTIONS §8; Task53 receipt `.workflow/omp-migration/m3/task53-websearch-2026-10-21.json`
**Covers:** W6, W9

**Check:** `bun test packages/agent-service/src/worker/session-native.test.ts` → the new tests fail before the fix because the host receives `{ type: 'tool', toolName: 'web_search' }`; after the fix the normal test receives `{ type: 'web-search' }`, performs one loopback SearXNG request and completes, while the enterprise-denial test receives `{ type: 'web-search' }`, fails the tool and performs zero loopback requests. Existing generic unknown-tool refusal and native descriptor/approval checks remain in `bunx vitest run packages/web/server/lib/host/worker-operation-authorizer.test.js`, which stays green.

- [x] Exact `web_search` tool event maps to `authorize({ type: 'web-search' })`; other tools still use `authorizeTool`.
- [x] Profile `allowedTools` is checked before either authorization branch.
- [x] Normal policy allows the native loopback search; enterprise policy denies with zero egress.
- [x] Generic unknown tools remain refused and native tools still require existing descriptors/approval.
- [x] Focused worker test, Host boundary test, and changed-file lint/type validation are accurate; no unrelated dirty paths included.

Dirty at start: `packages/agent-service/src/sessions/registry-native.test.ts`, `packages/agent-service/src/sessions/registry.ts`, `packages/agent-service/src/supervisor/service.ts`, `packages/ui/src/sync/DOCUMENTATION.md`, `packages/ui/src/sync/bootstrap.test.ts`, `packages/ui/src/sync/bootstrap.ts`, `packages/ui/src/sync/child-store.test.ts`, `packages/ui/src/sync/child-store.ts`, `packages/ui/src/sync/retry.ts`, `packages/ui/src/sync/session-message-loader.ts`, `packages/ui/src/sync/sync-context.tsx`, and untracked `.workflow/omp-migration/m3/task36-recovery-guest-2026-10-20.json`. These stay out of Task63 commits.

Check before: `bun test packages/agent-service/src/worker/session-native.test.ts` fails both new regressions because `hostRequests` contains the generic `{ type: 'tool', toolName: 'web_search' }`; 13 existing tests pass. After the routing fix the normal case must show `{ type: 'web-search' }`, one loopback request and a completed tool; the enterprise case must show `{ type: 'web-search' }`, a failed tool and zero loopback requests.

Root cause: `WorkerSession.open`'s `tool_call` observer passed the exact SDK `web_search` name to generic `authorizeTool`, so Host received `{type:'tool',toolName:'web_search'}` and refused it before `NativeWebSearch`'s existing guarded transport could request `{type:'web-search'}`. Fix: after the profile allowlist check, exact `web_search` calls `authorize({type:'web-search'})`; every other tool keeps `authorizeTool`. The Host authorizer was not broadened.

Check after: focused `session-native.test.ts` 15 pass / 114 assertions; Host authorizer 18 pass; focused `tsc` for `session.ts` exit 0; changed-file oxlint leaves one unchanged baseline finding at session.ts:81. Real normal Web smoke session `a0d7e7b1…` made exactly one loopback SearXNG request (`task63 loopback`), completed the `web_search` tool and returned the controlled `Task63 Loopback Result`. Enterprise Host smoke session `0bcb07f3…` failed the tool with `Host policy refused the tool operation` and left the search fixture at the single normal-phase request (zero new egress). No external credentials were used; Task53's write-only credential evidence is unchanged. Task53's failed connected scenario now succeeds.

Quality review: pass, no findings. Security review: no blocking findings; two nonblocking notes are recorded in the receipt: (1) name-only routing can be reached by a locally installed extension shadowing the builtin `web_search` name (MCP/custom-tool-file paths cannot mint it), left unchanged to keep the requested exact-name/minimal routing; (2) persisted workspace deny policies for `web_search` are not evaluated by the web-search capability request, while SDK deny and enterprise policy still apply. Neither creates an enterprise egress bypass.
