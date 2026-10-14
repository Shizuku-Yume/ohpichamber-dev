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

## Bounded implementation (2026-10-14)

Production startup now launches the existing supervised Bun Agent Service after the Host listener and process handlers are ready. The Host runtime exposes the lifecycle operations its entrypoint and shutdown owner already call (`start`, `stop`, final `close`). Service-only stop drains permission, scheduled-task and queue producers before stopping the event hub and supervisor. Startup failures remain canonical unavailability; no canonical request falls back to OpenCode. The unused OpenCode `watcher.js` and its retired tests were removed; production notification/session fan-out already uses the canonical global event hub.

Surfaces:
- Web/PWA: the Node Host starts the Bun service and serves the existing authenticated `/api/agent/v1` namespace.
- Electron: the same Web startup pipeline runs inside main; the Bun service remains separate. Native privileges, per-window auth and server shutdown remain owned by Electron and the Host.
- Hosted mobile: uses the active remote Host and its authenticated canonical namespace.
- Capacitor mobile: uses the configured remote Host and existing Origin/auth policy; no local Agent Service or credential store is added.

The final retirement checkboxes above remain open. Task 15 migrated Defaults/Archive/retention only; Guest/sidebar/AgentsPage are not complete. Retained App/MobileApp compatibility gates, client consumers and legacy settings/config routes still require the OpenCode lifecycle/proxy. Isolated-space archive import still calls the OpenCode session import/remove owner. Credential handoff remains explicit and its source cannot be removed while the owning cutover is incomplete. Host FS/Git/PTY/Guest/editor/theme behavior is intentionally retained. No package selectors, compatibility adapters or fallback engines were introduced.

Implementation checks were not run; the coordinator owns integrated tests, type-check, lint, builds, dead-code and real Web/Electron launch/stream/abort/reopen/shutdown certification. Packaged Bun/Agent Service staging must be completed before packaged Electron can be certified without OpenCode.
