# 15: Migrate settings, sidebar, Board and Guest SDK callers

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** 6f344af05c3226583cc7a361aa91c65329e7961f

**Delivers:** Retained settings/sidebar/Board/Guest Shell and Guest SDK surfaces consume the canonical catalogs, queue, shell, subagent hierarchy and session contracts while host-owned capabilities remain on their existing APIs.

**Blocked by:** 12, 13, 32
**Files:** `packages/ui/src/`, `packages/sdk/`, `packages/web/`, Board/Guest/settings modules, focused tests and nearest documentation

**Read first:** `.workflow/specs/omp-through-m3.md` M3/W6/W9; `.workflow/tasks/omp-through-m3/32-m3-native-subagent-navigation.md`; `.workflow/omp-migration/scope.md` `SCOPE-3.2` Session Sidebar subagent hierarchy; `packages/sdk/DOCUMENTATION.md`; UI stores/sync docs; `packages/ui/src/components/sourceBoard/SourceBoardView.tsx`; `packages/ui/src/lib/guests/shells.ts`; contracts catalog/shell/queue sections; locale skill; `packages/ui/src/lib/theme/STYLING.md` and `packages/ui/src/components/sections/PATTERNS.md` for affected styling/Settings
**Covers:** W6, W9

**Check:** Use `node scripts/run-isolated-tests.mjs` on affected settings/sidebar/Board/Guest owners, then observe those connected UI flows → scoped catalogs and configuration, persisted folders/retention, sidebar subagent hierarchy, Board session launch, shell output/stop/reconnect, explicit unavailable/partial states. Verify Host FS dirty-file moves independently. Guest SDK stays separate from agent DTOs; record concrete commands and actual observations.

- [ ] Migrate model/provider/MCP/skills/completion and shell consumers to canonical service calls.
- [ ] Prove Composer skill mentions and slash commands through service-owned expansion, including installed globals and retained `.agents/skills`; SDK/CLI observations alone cannot pass this visible product path.
- [ ] Keep Guest SDK manifest/envelope/connectHost contract separate from Canonical Agent Client types.
- [ ] Preserve host-owned filesystem/Git/environment/terminal capabilities through Host Gateway APIs.
- [ ] Make loading, empty, unavailable and partial states distinguishable.
- [ ] Update search/labels/ARIA and theme states only where migration changes the visible behavior.
- [ ] Render sidebar subagent hierarchy and active child session grouping via canonical parentSessionId and Task 32 client methods, without legacy OpenCode parentID.

## Progress

- **Status:** partial implementation committed as an authorized bounded slice; Task 15 is not fulfilled or archived.
- **Dirty at start:** none.
- **Worktree:** `/home/shizuku/Project/ohpichamber-worktrees/m3-task15`; detached commit for coordinator cherry-pick only. The original and integration trees remain untouched.
- **Surfaces:** Web/PWA and Electron share canonical settings/sidebar/Board and capability-granted Guest execution. Hosted mobile and Capacitor share canonical settings/sidebar/Board through the active Host; Guest frames and local Guest services remain explicitly unsupported until M5. Host filesystem, Git, environment, worktree and terminal owners remain unchanged.
- **Task 32 integration point:** native `Session.parentSessionId` and `rootSessionId` already feed the global structure and existing sidebar grouping. Task 32 must supply real native child registration/discovery, canonical `GET /api/agent/v1/subagents` and `CanonicalClient.listSubagents(sessionId)`, authorization-bound child snapshots/history and lifecycle across cold reopen, relocation and root deletion. No child route, fabricated child record or legacy `parentID` adapter is added here. Child navigation and connected hierarchy acceptance remain open until Task 32 lands.
- **Landed scope:** provider discovery in `DefaultsSettings.tsx` resolves the selected workspace and reads the canonical provider catalog. `ArchiveView.tsx` uses native session/archive/title/parent fields and authorized workspace-directory resolution, preserving its open-session `onLeave` callback. `session-retention.ts` resolves pinned-session directories through the same authorized global-session owner. Archive fixtures now construct native sessions.
- **Checks:** `bun test packages/ui/src/components/sections/openchamber/DefaultsSettings.test.tsx` passed 1 test in the settings worker and was not repeated. After repairing two omitted archive expression delimiters, `bun test packages/ui/src/components/views/ArchiveView.test.tsx` passed 5 tests / 30 assertions; `bun test packages/ui/src/sync/session-retention.test.ts` passed 18 tests / 42 assertions in a separate process. Archive tests logged unavailable localhost Host home/location/session probes; no connected Host flow was exercised.
- **Guest check not passed:** `bun test packages/ui/src/lib/guests/shells.test.ts` returned 5 passed / 5 failed. Session-tree and project scopes omitted expected descendant jobs. Guest edits are excluded from this bounded commit; this result is not acceptance evidence.
- **Restored unfinished files:** partial config/profile migration was restored exactly to base `6f344af05` in `stores/useConfigStore.ts`, `stores/useAgentsStore.ts`, and `components/sections/agents/AgentsPage.tsx`; no mixed-key store or profile adapter lands.
- **Continuation callers:** native catalog/selection cutover remains in `useConfigStore.ts`, `configCatalogCache.ts`, shared `useModelLists`/`ModelPickerList` helpers and agent settings. Completed but unlanded sidebar/session-worktree helpers, Board native title, agent label/colors hook, Guest Shell/workspace/PluginPane/BackgroundShellsStrip, and linked-issue typing require a coherent continuation with focused owner checks. Task 16 owns the native `sessionReviewMetadata.ts` dependency; Task 32 owns child discovery/history and relocation semantics.
- **Host extraction seam for Task 17:** `components/session/sidebar/projects/useProjectFolderMissing.ts` and `lib/worktrees/relocateRestoredSession.ts` retain the existing Host-only `opencodeClient.getDirectoryAvailability` method. Sidebar `list/sessionCollection.test.ts` and `sessions/sessionNodeItemUtils.test.ts` retain home-info test setup for `ensureChatsRootDirectory`. No replacement route, local adapter, fake empty result or fallback engine was added. Existing Host FS/Git/environment/worktree/terminal ownership remains unchanged.
- Full package checks and connected Web/Electron/mobile settings/sidebar/Board/Guest flows were not run; Composer skill/slash-command and child hierarchy acceptance remain open.
