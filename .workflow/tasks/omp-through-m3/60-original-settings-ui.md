# 60: Restore original settings sections and shared layout UI

**Effort:** omp-through-m3
**Task type:** bugfix
**Base commit:** e848504602333955b1d134bba3345d8bbc2ed065

**Delivers:** Restores the original OpenChamber settings section layouts, field row styling, interactive editors, and dialogs from pre-M1 baseline (`bfa8edacb9b0096aabf40b12886794ce62df8ddb`) across MCP, Agents, Behavior, Commands, Snippets, Skills, Plugins, and Web Search sections. Replaces unstyled stacks, raw JSON textareas, and naked selects with the original rich Settings components, while strictly preserving native OMP capability schemas, secret references, and revision CAS without modifying backend stores or contracts.

**Blocked by:** None
**Files:** `packages/ui/src/components/sections/mcp/`, `packages/ui/src/components/sections/agents/`, `packages/ui/src/components/sections/behavior/`, `packages/ui/src/components/sections/commands/`, `packages/ui/src/components/sections/snippets/`, `packages/ui/src/components/sections/skills/`, `packages/ui/src/components/sections/plugins/`, `packages/ui/src/components/sections/websearch/`, related section tests
**Read first:** Visual reference at `bfa8edacb9b0096aabf40b12886794ce62df8ddb` (`packages/ui/src/components/sections/`); canonical settings contracts in `packages/agent-contract/src/catalogs.ts` and `websearch.ts`; `.workflow/specs/omp-through-m3.md` W9, W10
**Covers:** W9, W10

**Check:** Focused behavioral tests in `packages/ui`, strict UI type-check (`bun run --cwd packages/ui type-check`), single parent UI build (`bun run --cwd packages/ui build`), and actual Web and Electron visual verification of settings navigation, field updates, autosave status, dialog workflows, and empty states; no source/copy/wiring tests.

 - [ ] Restore original `SettingsPageLayout`, `SettingsSection`, and `SettingsFieldRow` styling, spacing, typography, and search anchors across target settings pages.
 - [ ] Restore rich visual configuration grids and cards for MCP servers, installed skills, trusted repositories, slash commands, and snippets.
 - [ ] Restore Agents and Behavior settings controls (`allowedTools`, `permissionPresetId`, prompt styling) without OpenCode rule shims or unstyled inputs.
 - [ ] Restore native Web Search and Plugins configuration controls, removing raw JSON textareas and unstyled select fallbacks while keeping exact native settings keys.
 - [ ] Retain native stores, write-only credential refs, and expected revision CAS handling; do not touch `SettingsView`, shared primitives, or i18n dictionaries (request parent integrator if shared changes needed).

## Background & UI Restoration Scope

The current user explicitly prioritizes restoring the original OpenChamber UI appearance and interaction behavior, with no redesign. Investigation identified commit `bfa8edacb9b0096aabf40b12886794ce62df8ddb` as the assembled pre-M1 baseline visually inherited upstream. The current integration worktree (`e848504602333955b1d134bba3345d8bbc2ed065`) retains the authoritative native Canonical contracts.

This task restores visual and interaction parity across settings sections:
- **Shared Settings Structure:** Re-establishes the standard header/section/field hierarchy, section descriptions, search-target anchors, autosave feedback indicators, and empty state illustrations matching `bfa8edacb9b0096aabf40b12886794ce62df8ddb`.
- **Target Sections Only:** Covers `mcp`, `agents`, `behavior`, `commands`, `snippets`, `skills`, `plugins`, and `websearch`. Does not modify `SettingsView` shell navigation or shared core primitive components.
- **Truthful OMP Semantics:** Binds directly to native settings properties (e.g. MCP transport types, native skill sources, cache warming flags, search provider options) rather than recreating legacy OpenCode configurations.
- **CAS and credential safety:** Preserve opaque stored credential references and revision CAS. New credentials may be entered only through the existing write-only input flow; never display stored secrets or persist plaintext drafts.
