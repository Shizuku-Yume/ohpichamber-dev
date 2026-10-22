# 17: Integrate Electron, host proxy and final legacy removal

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** <commit-sha>

**Delivers:** Web and Electron launch paths proxy the same authenticated `/api/agent/v1` boundary, host lifecycle owns Agent Service supervision, and obsolete OpenCode agent integration files/routes/config readers are removed after caller cutover.

**Blocked by:** 15, 16, 22
**Files:** `packages/web/server/index.js`, `packages/web/server/lib/host/`, `packages/electron/main.mjs`, package manifests, runtime/build docs and legacy agent integration paths

**Read first:** `.workflow/specs/omp-through-m3.md` M1/M3/W2/W7/W10; desktop-shell and UI API skills; `packages/web/server/index.js`; `packages/electron/main.mjs`; Electron README; Host architecture and proxy/auth contracts
**Covers:** W2, W7, W10

**Check:** Launch the real Web and Electron entrypoints using their package scripts, with OpenCode absent → both reach `/api/agent/v1`, stream/abort/reopen a session, preserve Host capabilities and clean owned children after stop/restart. Record concrete launch/interaction commands. Run the existing isolated runner for affected Host/Electron tests; reuse this connected run in task 18 if no relevant code changes afterward.

- [ ] Wire Host Gateway supervision and proxying through the existing Web and Electron entrypoints.
- [ ] Preserve external auth, Origin checks, internal secret boundaries and host-owned routes.
- [ ] Remove obsolete lifecycle/proxy/watcher/config/auth integration only after all callers are migrated.
- [ ] Finish the explicit credential handoff before its source disappears, then remove the one-time importer and legacy credential reader at this cutover.
- [ ] Keep external editor launch, theme import and retained host capabilities working.
- [ ] Update module ownership docs and package scripts without adding compatibility adapters.

The retained upgrade route and helper are not safe to remove: `AboutSettings.tsx`, `OpenCodeUpdateToast.tsx`, and `openCodeUpgrade.ts` actively call `POST /api/opencode/upgrade`, while About/upgrade status consumers call `GET /api/opencode/upgrade-status`; `routes-upgrade.test.js` covers these live contracts. The lifecycle `bootstrapOpenCodeAtStartup` export and tests likewise remain because retained OpenCode credential/config/session callers still invoke the lifecycle owner outside the production startup pipeline. `scheduleOpenCodeApiDetection` has no remaining production caller and is absent from the canonical startup path.

## Progress

On 2026-10-15, removed the unused public `setupProxy` and `restartOpenCode` exports, the obsolete `setupProxy` startup argument, and their `index.d.ts` declarations. `bun test packages/web/server/lib/opencode/lifecycle.test.js` passed 40 tests and 135 assertions. Node import smoke confirmed both exports are absent while `startWebUiServer` remains; `node --check` passed. After updating these records, `bun run docs:validate` passed (696 pages, 58 sidebar links) and `.workflow/bin/workflow validate --no-color` passed (42 task files). This does not pass Task 17: connected Web/Electron W7/W10, dependent service and credential-handoff work, active legacy callers, and final packaging remain open. The focused Web type-check still has seven inherited UI diagnostics; oxlint and dead-code findings remain non-passing inventory, not acceptance evidence.

Archive ownership is unresolved for the OMP cutover. `space-archive.js` imports exported chats into Host OpenCode; the OMP SDK opens local `.jsonl` session files and has no remote transcript transfer/adoption API. The M3 specification forbids automatic transcript import, and the M5 plan requires a separate versioned scope for any desired transcript importer. No transfer or adoption is implemented or claimed; do not retire this caller by silently importing transcripts.
