# 55: Repair packaged Electron canonical authentication bootstrap

**Effort:** omp-through-m3
**Task type:** bugfix
**Base commit:** <commit-sha>

**Delivers:** A packaged Electron window preserves the local authenticated Host transport for `openchamber-ui://app`, so canonical session and workspace requests succeed after startup instead of returning `401` while `/auth/session` reports `authenticated: true`.

**Blocked by:** 44
**Files:** `packages/electron/`, `packages/web/server/lib/ui-auth/`, `packages/ui/src/lib/runtime-auth*`, packaged runtime/auth tests and owning documentation

**Read first:** `.workflow/tasks/omp-through-m3/36-m3-connected-acceptance.md`; `packages/electron/README.md`; `packages/electron/main.mjs`; `packages/electron/preload.mjs`; `packages/web/server/lib/ui-auth/`; runtime authentication and URL helpers; desktop-shell and ui-api-decoupling skills
**Covers:** W7, W10

**Check:** Build and launch the Linux packaged AppImage under Xvfb with an isolated HOME → `/auth/session` is authenticated and renderer `GET /api/agent/v1/sessions` plus workspace resolve return `200`; the packaged UI renders a usable session catalog without the refresh-failure state. Run focused Electron/auth tests and package type-check.

- [ ] Preserve the authenticated local Host session across the `openchamber-ui://app` origin and loopback API origin.
- [ ] Keep remote pages and non-local runtime switches from receiving local desktop credentials.
- [ ] Prove canonical session catalog and workspace resolution from the packaged renderer.
- [ ] Record cleanup and any platform-specific limitation in the Task36 receipt.

## Progress

- 2026-10-20 Task36 packaged receipt `.workflow/omp-migration/m3/task36-packaged-electron-2026-10-20.json` reproduces the failure: `/auth/session` returned `{ authenticated: true, disabled: true }`, while renderer canonical sessions and workspace resolution returned `401`; the packaged UI showed `无法刷新会话。` and the model picker stayed unavailable.
- This is an owning implementation task, not an acceptance waiver. Task36 remains open until the repaired packaged renderer completes its connected scenario.
