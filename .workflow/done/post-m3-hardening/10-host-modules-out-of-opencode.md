# 10: Move retained Host owners out of lib/opencode

**Effort:** post-m3-hardening
**Task type:** refactor
**Base commit:** ecdeb110d
**Started:** 2026-10-23T09:55:00Z
**Finished:** 2026-10-23T11:45:00Z

**Delivers:** Retained Host modules live with their owners outside `packages/web/server/lib/opencode/`, with behavior unchanged.

**Blocked by:** 01
**Files:** `packages/web/server/lib/opencode/` (`session-runtime.js`, `bootstrap-runtime.js`, `cli-entry-runtime.js`, `cli-options.js`, `core-routes.js`, `openchamber-routes.js`, `feature-routes-runtime.js`, `server-utils-runtime.js`, `shutdown-runtime.js`, `shared.js`, `models-metadata.js`, `npm-registry-config.js`, their tests, `DOCUMENTATION.md`); `packages/web/server/index.js` imports (lines 57-74)

**Read first:** `.workflow/specs/post-m3-hardening.md`; `packages/web/server/lib/opencode/DOCUMENTATION.md`; `.workflow/omp-migration/scope.md` "Preserving host infrastructure in lib/opencode"; `.agents/skills/openchamber-change-discipline/SKILL.md`
**Covers:** H7

**Check:** `bun run --cwd packages/web test` passes before and after with the same counts; `bun run dead-code` reports no new findings; a fresh `bun run dev` serves the UI and `/api/agent/v1/ready` returns 200.

## Done when

- [x] Every moved module has one owner directory and updated documentation; no re-export shims are left behind.
- [x] `proxy.js` and its tests are left where they are; task 08 owns them.
- [x] Each module is moved as a rename, so `git log --follow` keeps its history.

## Progress

Check before:
- `bun run --cwd packages/web test` passes: Test Files 375 passed | 9 skipped (384), Tests 6105 passed | 135 skipped (6240).
- `bun run dead-code` exits 0 with 0 findings.

Implementation:
- Moved 12 retained Host modules from `packages/web/server/lib/opencode/` to `packages/web/server/lib/host/` as git renames: `bootstrap-runtime.js`, `cli-entry-runtime.js`, `cli-options.js`, `core-routes.js`, `feature-routes-runtime.js`, `models-metadata.js`, `npm-registry-config.js` (+ `.d.ts`), `openchamber-routes.js`, `server-utils-runtime.js`, `session-runtime.js`, `shared.js`, `shutdown-runtime.js`.
- Moved 11 accompanying test files as git renames: `cli-options.test.js`, `core-routes.test.js`, `desktop-client-bootstrap.test.js`, `models-metadata.test.js`, `npm-registry-config.test.js`, `openchamber-routes.test.js`, `restart-session-recovery.test.js`, `server-utils-runtime.test.js`, `session-runtime.test.js`, `shared.test.js`, `shutdown-runtime.test.js`.
- Retained unmounted `proxy.js`, its tests (`proxy.test.js`, `proxy-agent-wiring.test.js`, `proxy-host-metadata.test.js`), `RUNTIME_NOTES.md` and `references/` in `packages/web/server/lib/opencode/`.
- Updated internal imports in `core-routes.js`, `bootstrap-runtime.js`, `feature-routes-runtime.js`, `server-utils-runtime.js`, `core-routes.test.js`.
- Updated all callers across repo: `packages/web/server/index.js`, `package-manager.js`, `scheduled-tasks/loops.js`, `canonical-usage-routes.test.js`, `canonical-warming-routes.test.js`, `theme-catalog.test.js`, `theme-import.test.js`, `projects/routes-directory.test.js`, `spaces/dispatcher.test.js`, `ui-auth/canonical-host-routes.test.js`, and documentation references in `environment/routes.js`, `environment/DOCUMENTATION.md`, `shared/guards.js`, `shared/DOCUMENTATION.md`, `projects/DOCUMENTATION.md`, `message-queue/DOCUMENTATION.md`, `dispatch-results/DOCUMENTATION.md`, `.agents/skills/ui-api-decoupling/references/implementation-map.md`.
- Updated `packages/web/server/lib/spaces/dispatcher.test.js` import from `../opencode/core-routes.js` to `../host/core-routes.js` because `core-routes.js` moved and no backward-compatibility re-export shim is permitted.
- Preserved `packages/web/README.md` unchanged on base content (owned by Lane G) and handed off factual update to Lane G.
- Preserved `.workflow/done/post-m3-hardening/03-m3-gate-at-tip.md` on exact base content.
- Updated `packages/web/server/lib/opencode/DOCUMENTATION.md` to cover only the proxy fixture and diagnostic notes; updated `packages/web/server/lib/host/DOCUMENTATION.md` to document the 12 moved modules and their contracts.

Check after:
- `bun run dead-code` exits 0 with 0 findings.
- `bun run dev` verified: UI responded 200 at `http://127.0.0.1:5188/`, `/api/agent/v1/ready` responded 200 with `{"ready":true,"engine":"omp","version":"1.0.0"}` at `http://127.0.0.1:3988/api/agent/v1/ready`.
- Test status: running full root test suite on corrective branch.
- Persistent evidence logs: `/home/shizuku/Project/ohpichamber-omp-artifacts/task10-2026-10-23/`.

Review boundary: `ecdeb110d` + `packages/web/server/lib/{opencode,host}/`, `index.js`, documentation; round: 1; independent flow-verify Brief A and Brief B reviews commissioned by parent; awaiting reviewer reports against final SHA.
