# 15: Migrate settings, sidebar, Board and Guest SDK callers

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** <commit-sha>

**Delivers:** Retained settings/sidebar/Board/Guest Shell and Guest SDK surfaces consume the canonical catalogs, queue, shell and session contracts while host-owned capabilities remain on their existing APIs.

**Blocked by:** 12, 13
**Files:** `packages/ui/src/`, `packages/sdk/`, `packages/web/`, Board/Guest/settings modules, focused tests and nearest documentation

**Read first:** `.workflow/specs/omp-through-m3.md` M3/W6/W9; `packages/sdk/DOCUMENTATION.md`; UI stores/sync docs; `packages/ui/src/components/sourceBoard/SourceBoardView.tsx`; `packages/ui/src/lib/guests/shells.ts`; contracts catalog/shell/queue sections; locale skill; `packages/ui/src/lib/theme/STYLING.md` and `packages/ui/src/components/sections/PATTERNS.md` for affected styling/Settings
**Covers:** W6, W9

**Check:** Use `node scripts/run-isolated-tests.mjs` on affected settings/sidebar/Board/Guest owners, then observe those connected UI flows → scoped catalogs and configuration, persisted folders/retention, Board session launch, shell output/stop/reconnect, explicit unavailable/partial states. Verify Host FS dirty-file moves independently. Guest SDK stays separate from agent DTOs; record concrete commands and actual observations.

- [ ] Migrate model/provider/MCP/skills/completion and shell consumers to canonical service calls.
- [ ] Prove Composer skill mentions and slash commands through service-owned expansion, including installed globals and retained `.agents/skills`; SDK/CLI observations alone cannot pass this visible product path.
- [ ] Keep Guest SDK manifest/envelope/connectHost contract separate from Canonical Agent Client types.
- [ ] Preserve host-owned filesystem/Git/environment/terminal capabilities through Host Gateway APIs.
- [ ] Make loading, empty, unavailable and partial states distinguishable.
- [ ] Update search/labels/ARIA and theme states only where migration changes the visible behavior.
