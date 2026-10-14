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

- **Status:** active
- **Dirty at start:** none in the integration worktree.
- **Worktree:** integration branch `/home/shizuku/Project/ohpichamber-worktrees/m1-integration`; source slices were reviewed and cherry-picked from isolated worktrees.
- **Landed scope:** native workspace-scoped agent catalog/CRUD/settings/sidebar with revision CAS, native allowed-tools/preset fields, separate Host ordered-permission rules; canonical Guest Session/ShellJob workspace and shell projections; canonical authoritative sidebar cleanup root.
- **Commits:** `1501104c6`, `8048d855`, `b698e5113`, `10df19f9d`, `5d163923c`, `ae1693aed`.
- **Checks:** combined settings/Guest packet passed `74` tests / `578` assertions; session-actions passed `66` / `208`; Electron passed `43/43`; docs validation passed. Full UI type-check and changed-slice oxlint remain open with artifacts recorded in `.workflow/development.md`.
- **Remaining callers/gates:** config/importer and Composer/model catalogs, legacy `switchSessionAgent`/multi-run session creation, credential/importer, isolated-space archive, packaging/staging, connected Board/Guest/sidebar child hierarchy, Composer skill/slash-command flow, and full Web/Electron acceptance.
- **W9 limitations:** no native permission-preset catalog contract; Host ordered permission rules are not claimed as native execution-policy enforcement. Guest item metadata remains `items: []` until a canonical metadata boundary exists; no legacy dual-shape adapter was added.
