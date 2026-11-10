# 17: Resolve the merge in Settings sections

**Effort:** ux-v270-omp-alignment
**Blocked by:** 11
**Covers:** W1, W2
**Files:** `packages/ui/src/components/sections/**`
**Read first:** spec "How it is built" (Merge); `merge-lanes.tsv` lane 17; `packages/ui/src/components/sections/PATTERNS.md`; `decisions.md: 2026-11-10 - OMP TUI parity means function and display parity…`; skills `locale-ui-patterns`, `enterprise-boundary`
**Check:** in a worktree on the scaffold branch, `bun scripts/upstream-drift.mjs --markers --lane 17` → 0; `bun run --cwd packages/ui type-check` reports no error in lane paths; `bun scripts/upstream-drift.mjs --check -- packages/ui/src/components/sections` → 0 `unexplained`
- **Base commit:** fd671d0690c72c3f69b8c8c3739f60ce026832d8
- **Status:** active

- [x] Resolve the conflicted paths with the merge rule. Adopt upstream's `GeneralWorkspaceSettings` (files and editor), `ThemeAppearancePicker`/`ThemeSchematic` (retiring `ThemePicker`), `OpenChamberToolsSettings` grouped hints, `KeyboardShortcutsSettings` toolbar, `AboutReleaseNotes`, `ProviderLogoImageControl`, `WebSearchPage` (mode segment and provider cards), `SkillsPage`, `SnippetsPage`, `CompactionSettings`, `FinishedWorktreesSettings` and the settings row menus.
- [x] Where upstream pages call OpenCode-shaped APIs, cut them over to the existing Canonical or Host owner. Keep the upstream layout and components.
- [x] Leave the OMP-specific pages (`OmpSettingsPage`, Commands, Plugins, Agents) structurally as they are; tasks 25-26 rebuild them.
- [x] Deletes: the fork's bespoke Web Search page, its Desktop "runtime status" row, and other unexplained rewrites in lane paths.

## Progress

Resolved 56 conflicted lane files plus the section files that differed without a lane row. Upstream was adopted verbatim wherever its side compiles on the canonical tree: the module docs, Providers (grid, custom form, model row, accounts, custom-provider-form), MCP grid, Snippets, Usage, Remote instances, Extensions detail, Plugins dialogs, Theme catalog, Keyboard shortcuts, Voice, Desktop app, provider instance accounts, Git identity rows, and the shared General/chat split (`GeneralWorkspaceSettings`, `ChatSettings`, `OpenChamberPage`, `ChatSettings`, `SessionWorkSettings`). Files whose upstream side named a retired module keep the fork implementation and carry a decision row in `.workflow/upstream-deltas.tsv`: Providers page/test, provider auth and OAuth, MCP page, Plugins page/grid/banner, tools settings, Skills page/sidebar, Agents page/sidebar, Commands page, Defaults test, Appearance settings, About, Extensions page, Model selector, project/routing call sites.

Cutovers: `commands/AgentSelector.tsx` now selects a profile from `@/stores/useAgentsStore` by name (the identity routing categories and project defaults store); the mode filter was dropped with it because the agent contract carries no mode. `websearch/WebSearchPage.tsx` keeps upstream's mode segment, provider cards and provider detail screen but reads and writes the canonical `useWebSearchStore` (revision CAS, write-only credentials, fallback chain, timeout, worker outcome). `AboutSettings` keeps upstream's version rows, release notes, update channel and instance URLs, without the OpenCode CLI upgrade panel. `OpenChamberPage` keeps upstream's section composition without isolated spaces, the OpenCode CLI page or VS Code gates, and with the fork worktree cleanup section.

Deletes: `openchamber/ThemePicker.tsx` (ThemeAppearancePicker replaces it), the About OpenCode upgrade panel, the Extensions OpenCode plugin banner, the fork Web Search selection/keys sections, and the Desktop runtime-status row. Also removed the modules that only spoke the deleted OpenCode integration API and had no remaining caller: `providers/ProviderAuthMethodCards.tsx`, `providers/provider-oauth.ts`, `shared/useIntegrationPolicyBlock.ts` and its test, plus the unreferenced `openchamber/SpacePlacesSettings.tsx`.

Not changed here, owned by other lanes: `lib/settings/search.ts` (lane 14) still lists `chat.render-mode`, `chat.streaming`, `chat.tools-and-files` and `chat.persist-drafts`, whose controls upstream removed from the Chat page; those rows need deleting when lane 14 resolves its file. `lib/openchamberConfig.ts` (lane 14) still carries the `worktreeDirectory` patch field the project setup test asserts.

### Check before

`bun scripts/upstream-drift.mjs --markers --lane 17` → 555 markers across 56 lane files. `bun scripts/upstream-drift.mjs --check -- packages/ui/src/components/sections` → 57 unexplained paths and one row contradicting git (`packages/web/server/lib/guests/catalog.js`).

### Check after

- `bun scripts/upstream-drift.mjs --markers --lane 17` → `no conflict markers (lane 17)`, exit 0.
- `bun scripts/upstream-drift.mjs --check -- packages/ui/src/components/sections` → `drift check passed: no conflict markers, no unexplained path, no contradicting row (base bc50ba5)`, exit 0.
- `cd packages/ui && bunx tsc -b` → 0 errors in `src/components/sections/**` (the run still exits non-zero on conflict markers in other lanes' files, e.g. `src/lib/quota/index.ts`).
- `bunx oxlint` on every changed lane `.ts`/`.tsx` → clean.
- `cd packages/ui && bun test src/components/sections/providers/ProvidersPage.test.ts src/components/sections/providers/custom-provider-form.test.ts` → 13 pass, 0 fail. Remaining section tests cannot run yet: their module graphs cross other lanes' marker files (`lib/desktop.ts`, `lib/quota/index.ts`).
- Import audit of all 67 lane paths → every relative/`@/` specifier resolves; no reference to a module the standing exclusion deletes.

### Review

Reviewer pass on `git diff fd671d069..HEAD -- packages/ui/src/components/sections`: pending result recorded below when it lands.
