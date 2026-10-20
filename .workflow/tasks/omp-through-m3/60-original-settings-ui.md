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

## Progress

The original settings presentation is integrated over native MCP, agent, skill, command, web-search, plugin, and behavior stores. Focused MCP runtime/credential guards passed 3+1 cases. The plugin page regression passes 3 tests / 19 assertions with write-only replacement in the test seam, isolating the test directory hook from delayed settings synchronization and superseding the stale historical `writes: 0` receipt note.

Initial bounded settings failures recorded in `/tmp/ui-restored-electron-settings-proof.json` (Commands create failure, Providers indefinite Loading, Agents directory unavailable, Plugins missing workspace) were superseded by source fixes and passing verification across Web and packaged Electron:
- **Settings directory resolution:** Settled in source (`packages/ui/src/components/sections/useSettingsDirectory.ts`) as explicit pick > active project > first project > Host `useChatsRoot`, with no home fallback. Null directory renders explicit "Unavailable" state rather than perpetual "Loading...".
- **Web verification (`final-web-acceptance-receipt.json`, `phase2-commands-receipt.json`):**
  - Agents: Total 5 rendered.
  - Plugins: 'No plugins yet' + marketplace/doctor verified.
  - MCP: 'No MCP servers yet' + add dialog verified.
  - Commands: `POST /commands` returned 201; custom command `/m3-check` created with description and template, navigated away to Agents and reopened with description/template retained, deleted via row more menu + confirmation modal -> Total 1, custom command absent, toast success (screenshots 40, 41, 43, 45).
- **Packaged Electron (`ACCEPTANCE-RECEIPT.md`):**
  - Final UI-proofed AppImage package (`0a1886923e2549bf6058ff4847a02d7f0f542698f374a6cd18b9168e7cf9bddd`, 606,838,429 B, built 00:52) contains Web dist index `42170a9705ca7e6586cf960f9574581888cbba3bb873bf411dd2fc322e6b71ef`. The earlier `7b7f99ee…` package (606,808,636 B, `d29186da…` Web dist) is superseded historical evidence, not final; the current on-disk Task55 rebundle is `598bf582…` (606,838,421 B).
  - The packaged observations in the next four bullets were captured on the superseded `7b7f99ee…` artifact and were not rerun on the final artifacts.
  - Cold-start auto-recovery verified on fresh profile without reload; startup Agent readiness 503 bursts recovered automatically.
  - Settings nav groups verified: `OPENCHAMBER`, `WORKSPACE`, `OMP`, `LIBRARY` (OMP label proven across 13 locales; Providers and Commands nav present).
  - Commands: created `/accept-probe`, navigate away -> reopen retained, delete succeeded (Total back to 1; screenshots 12-20, 21-24).
  - Agents: 6 rendered; Plugins: empty + marketplace/Doctor; MCP: empty + Add MCP server; no-project Settings loads from first project without infinite loader.
- **Preserved gaps & defects:** On the superseded `7b7f99ee…` artifact the Commands delete-modal retest failed: the row was removed (Total 2 -> 1) but the empty-name Delete Command modal stayed open for the full 6-second sample. That failure is superseded: on the final UI-proofed AppImage `0a188692…`, deleting `/gap-final` removed the row and the modal unmounted by t=1000ms (`final2-08-command-delete-modal.png`, final-package receipt `finalProofs.commandsDeleteModal`). Keyboard abort and attachment download were not rerun on the final artifact; their packaged PASS observations are historical (`7b7f99ee…`), and the Task55 rebundle `598bf582…` later exercised Stop and Escape cancellation, not attachments. Native ask completed with reload on the final artifact, but message-level retry remains unproven (six injected failures equal the transport retry budget). This task stays open. No M3 gate or task complete claims.
