# 12: Resolve the merge in the Web Host and CLI

**Effort:** ux-v270-omp-alignment
**Blocked by:** 11
**Covers:** W1, W2
**Files:** `packages/web/**`
**Read first:** spec "How it is built" (Merge); `merge-lanes.tsv` lane 12; `packages/web/server/lib/host/DOCUMENTATION.md`; `packages/web/server/lib/opencode/RUNTIME_NOTES.md`; skills `ui-api-decoupling`, `enterprise-boundary`, `openchamber-change-discipline`
**Check:** in a worktree on the scaffold branch, `bun scripts/upstream-drift.mjs --markers --lane 12` → 0; `VITEST_MAX_WORKERS=2 bunx vitest run packages/web/server packages/web/bin` → exit 0; `bun scripts/upstream-drift.mjs --check -- packages/web` → 0 `unexplained`

- [x] Resolve the 263 conflicted paths. Upstream wins unless the fork delta is OMP-boundary or recorded in a decision. Upstream changes to host-owned modules the fork relocated from `server/lib/opencode/` to `server/lib/host/` are applied to the relocated files. Changes to OpenCode-engine paths stay excluded.
- [x] In auto-merged lane files, cut over any reintroduced OpenCode SDK or engine call to the Canonical API or Host owner.
- [x] Every remaining fork-differs path in lane 12 is classed `omp-boundary` or has an `upstream-deltas.tsv` row; nothing stays `unexplained`.
- [x] Deletes: fork copies of host modules that upstream now provides unchanged, and fork-only server code an upstream replacement supersedes.

## Progress

**Check before:** `bun scripts/upstream-drift.mjs --markers --lane 12` reported conflict markers in 18 files (123 markers) on the scaffold branch.

**Check after:**

- `bun scripts/upstream-drift.mjs --markers --lane 12` → `no conflict markers (lane 12)`, exit 0.
- `bun scripts/upstream-drift.mjs --check -- packages/web` → `drift check passed: no conflict markers, no unexplained path, no contradicting row (base bc50ba5)`, exit 0.
- `bunx oxlint` on every rewritten file → no findings.
- `VITEST_MAX_WORKERS=2 bunx vitest run packages/web/server packages/web/bin` → exit 1; see "Suite caveat" below.

### Resolution notes

- `server/index.js` is the pre-merge fork file wholesale: every conflict was a `lib/host/*` versus `lib/opencode/*` import, and the fork composition is the Host composition.
- Host modules the fork relocated keep their fork location and take the upstream delta where it does not depend on the removed OpenCode engine: `bootstrap-runtime.js`, `project-icon-routes.js`, `settings-normalization-runtime.js`, `theme-catalog.js`, `theme-runtime.js` and their tests. Files whose fork content is unchanged upstream stay byte-identical to the fork tip (`shared.js`, `settings-helpers.js`, `settings-runtime.js`, `feature-routes-runtime.js`, `shutdown-runtime.js`, `startup-pipeline-runtime.js`, `session-runtime.js`, `theme-watch.js`).
- `host/openchamber-routes.js`: kept upstream's `withUserEnv` restart handoff, its manual-install block and the `fetchReleaseNotes` route the retained About page already calls, and dropped the OpenCode-version shortfall blocks (`OPENCODE_TOO_OLD`) because the branch has no OpenCode runtime to guard.
- `host/core-routes.js`: took upstream's tracker-OAuth callback regex, dropped the MCP OAuth exemption (MCP OAuth lives in the Agent Service supervisor catalog), dropped the revoked-push-device removal (no client-push wiring on the branch), and restored `isGuestFrameFileRead`, which the scaffold had deleted although `guests/routes.js` still serves `/api/guest-files/:grant/...`.
- `permission-auto-accept`: the runtime keeps the fork's authoritative Host policy and its routes. Upstream's `session.forked` inheritance read a parent session through the OpenCode API, which OMP does not serve; the Canonical path expresses a fork as `parentSessionId`, and the runtime's lineage walk already resolves it to the nearest explicit ancestor. The doc says so, and `runtime.test.js` tests the fork runtime and its registered routes.
- `agent-tool/DOCUMENTATION.md` is the fork file, extended to the six tools the worker declares (`openchamber`, `web`, `memory`, `openchamber_knowledge`, `notify`, `openchamber_image`).
- `package-manager.js` gained upstream's R2 Canary APK mirror check (the committed test expects it) and keeps its fork channel scope; the OpenCode-engine requirement helper and its test were dropped with the engine.
- Deleted nine files v2.7.0 resurrected after the OMP migration removed them (`agent-tool/runtime*.js`, `session-warming/**`, `trackers/session-status*`, `opencode-proxy.test.js`, `opencode-worktree-readiness.test.js`).
- Ledger: `2026-11-11 - Keep the lane 12 host-adjacent modules on the fork's Host owners in the v2.7.0 merge` and `2026-11-11 - Keep the remaining web modules on the fork Host and Canonical owners in the v2.7.0 merge` record the reasons; every web path still differing from `bc50ba56a` names one of them or is `omp-boundary` by location or token.

### Suite caveat

`VITEST_MAX_WORKERS=2 bunx vitest run packages/web/server packages/web/bin` fails (126 files, 36 tests) in files identical to `main` (`d599d1566`), not in this lane's resolutions:

- installed `zod@4.6.7` throws `.omit() cannot be used on object schemas containing refinements` from the built canonical schemas;
- `supertest@7.3.2`/`superagent@10.4.2` break `packages/web/test/loopback-supertest.js`;
- a root-level run does not load `packages/web/vitest.config.ts`, so the `bun:test` alias shim is absent and `bun:test` suites cannot resolve;
- `tts/routes.js` imports `./index.js`, which the fork removed from `main`.

Fixing those belongs to the lockfile/test-harness lane. The lane-12 suites themselves pass: `package-manager.test.js`, `host/core-routes.test.js`, `host/openchamber-routes.test.js`, `host/settings-helpers.test.js` → 4 files / 158 tests passed after the scaffold merge.

### Review and landing

- Self-review of the lane diff (no subagents were used; provider concurrency budget): checked every rewritten file parses (`node --check`), every relative and dynamic import resolves, no conflict markers remain, and the deleted files have no surviving production importer.
- `bun run dead-code` reports only pre-existing `main` findings (unused UI types and configuration hints); none of the files this lane deleted or rewrote appear in its output as new findings.
- Merged `ux-v270-omp-alignment/merge-scaffold` into the branch, resolved the `upstream-deltas.tsv` conflict by unioning the rows, reran the drift check, and landed under `/tmp/v270-scaffold.lock` into `/home/shizuku/Project/ohpichamber-worktrees/v270-11`.
