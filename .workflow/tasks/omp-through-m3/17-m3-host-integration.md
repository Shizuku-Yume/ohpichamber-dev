# 17: Integrate Electron, host proxy and final legacy removal

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** <commit-sha>

**Delivers:** Web and Electron launch paths proxy the same authenticated `/api/agent/v1` boundary, host lifecycle owns Agent Service supervision, and obsolete OpenCode agent integration files/routes/config readers are removed after caller cutover.

**Blocked by:** 14, 15, 16, 22
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
