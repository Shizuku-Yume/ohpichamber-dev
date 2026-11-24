# 06: Cross-Cutting Settings Polish, Regression Guardrails & Upstream-Drift Sync

**Effort:** ux-audit-remediation-2026-11-24
**Blocked by:** 01, 02, 03
**Covers:** W6

**Files:**
- `packages/ui/src/components/sections/memory/MemoryPage.tsx`
- `packages/ui/src/components/sections/memory/MemoryPage.test.tsx` (or nearest test)
- `packages/ui/src/components/sections/openchamber/RetryFallbackChains.tsx`
- `packages/ui/src/components/sections/openchamber/RetryFallbackChains.test.tsx` (if present or new)
- `packages/ui/src/components/sections/shared/OmpRowControl.tsx`
- `packages/ui/src/components/sections/shared/ompRowHelpers.ts` (or wherever `inferUnit` lives)
- `packages/ui/src/components/sections/settingsLayoutGuard.test.ts`
- `packages/ui/src/components/sections/settingsItemOwnership.test.ts`
- `packages/ui/src/components/sections/settingsSearchAnchors.test.ts`
- `packages/ui/src/lib/i18n/messages.test.ts`
- `packages/ui/src/lib/i18n/messages/memory-dreaming.i18n.ts`
- `packages/ui/src/lib/i18n/messages/settings-layout.i18n.ts`
- `.workflow/upstream-deltas.tsv` (ONLY if upstream-drift guard requires updated entries for files modified in 01–05)

**Read first:**
- `.workflow/specs/ux-audit-remediation-2026-11-24.md`
- `packages/ui/src/components/sections/PATTERNS.md`
- `packages/ui/src/lib/theme/STYLING.md`
- `packages/ui/src/components/sections/settingsLayoutGuard.test.ts`
- `packages/ui/src/components/sections/settingsItemOwnership.test.ts`
- `packages/ui/src/components/sections/settingsSearchAnchors.test.ts`
- `packages/ui/src/lib/i18n/messages.test.ts`
- `scripts/check-upstream-drift.mjs` (or check root `package.json` for drift script)

**Check:** `bun run --cwd packages/ui test src/components/sections/settingsLayoutGuard.test.ts src/components/sections/settingsItemOwnership.test.ts src/components/sections/settingsSearchAnchors.test.ts src/lib/i18n/messages.test.ts src/components/sections/memory/ && bun run type-check`
**Base commit:** b8a504f558f0c4649da146a78e589277cfadc580

## Context

"举一反三" cross-cutting polish & mechanical guardrails so the regressions caught in the 2026-11-24 audit can NEVER recur:
1. `MemoryPage.tsx` renders all ~20 Mnemopi & Hindsight rows unconditionally even when `memory.backend === 'off'` (or when the other backend is active).
2. `RetryFallbackChains.tsx:775-779` jumps to `web-search` while its local modal dialog is open (risking an orphaned dialog) and renders raw selector strings in its web chain preview.
3. `OmpRowControl.tsx` needs unit inference for `Minutes`/`Hours` (used by `codexResets`/`claudeResets` steppers) AND an automated test proving every exposed OMP setting ID has a real localized label across all 15 locales (never falling back to raw `setting.id.replace(/\./g, ' ')`).
4. Mechanical guard tests need to lock the new invariants: no bare `SettingsInlineLink` inside `ModelRoleLinkRow`, no `ssh`/`OpenSSH Config`/`builtin-defaults` on `PluginsPage`, no missing-file dead-end for `RULES.md`/`SYSTEM.md`, default-collapsed Usage reset disclosures & Provider advanced disclosures, and clean upstream-drift ledger.

## Checklist

- [x] **`MemoryPage.tsx` Inactive-Backend Folding**:
  - When `memory.backend === 'off'`, hide (or fold inside a default-collapsed `SettingsDisclosure`) the Mnemopi and Hindsight configuration sections instead of dumping ~20 inactive rows flat on the page!
  - When `memory.backend === 'mnemopi'`, show Mnemopi active and hide/fold Hindsight (and vice-versa when `memory.backend === 'hindsight'`).
  - Verify `sharpshooter.model` clear writes cleanly without error and does not conflict with Task 01's inline `memory` role picker.
- [x] **`RetryFallbackChains.tsx` Modal Jump & Friendly Labels**:
  - Before invoking `requestSettingsJump('web-search', ...)` inside `RetryFallbackChains`, close any open local dialog/disclosure state cleanly so no orphaned modal lingers over the destination page.
  - Format the web fallback chain preview using friendly provider names (via the shared role/provider formatting helper from Task 01) instead of raw selector strings.
- [x] **`OmpRowControl.tsx` Unit Inference & Complete 15-Locale Guard**:
  - Check `inferUnit` (`ompRowHelpers.ts` / `OmpRowControl.tsx`) and ensure `Minutes` (`codexResets.minBlockedMinutes`, `claudeResets.minBlockedMinutes`) and `Hours` (`salvageHorizonHours`) display clean localized units where appropriate.
  - Add an automated test verifying EVERY setting ID in `OMP_SETTING_EXPOSED_IDS` has a non-empty, non-raw-ID localized label in `omp-settings.i18n.ts` across all 15 locales (and fails if any exposed setting falls back to `setting.id.replace(/\./g, ' ')`!).
- [x] **Mechanical Regression Guards**:
  - Update `settingsLayoutGuard.test.ts` (and/or dedicated companion guard tests) to assert:
    - `ModelRoleLinkRow.tsx` uses shared `Button` chrome, NEVER `SettingsInlineLink`.
    - `PluginsPage.tsx` / `ExtensionControlCenter.tsx` explicitly excludes `ssh`, `OpenSSH Config`, and `builtin-defaults`.
    - `settingsItemOwnership.test.ts` and `settingsSearchAnchors.test.ts` pass cleanly after Tasks 01–03.
    - `messages.test.ts` passes cleanly with zero untranslated English placeholders across all 15 locales.
- [x] **Upstream-Drift Ledger Sync**:
  - Run the repository's upstream-drift check (part of `bun run type-check`) and update `.workflow/upstream-deltas.tsv` ONLY if any newly-diverged upstream file needs an accurate ledger entry.

## Progress

- Completed `MemoryPage.tsx` inactive-backend folding (`off` hides both MnemoPi and Hindsight sections while keeping backend selection, inline `memory` role picker when enabled, and Autolearn; `mnemopi` shows only MnemoPi; `hindsight` shows only Hindsight) and verified `sharpshooter.model` clearing writes `{ id: 'sharpshooter.model', value: null }` cleanly without conflicting with the inline `memory` `ModelRoleEditor` (`MemoryPage.test.tsx`). Known limitation: `SettingsView.tsx` / `packages/ui/src/lib/settings/search.ts` do not dynamically switch `memory.backend` or filter search items by per-workspace `memory.backend` when jumping to a hidden MnemoPi/Hindsight/Sharpshooter row.
- Completed `RetryFallbackChains.tsx` jump cleanup (`flushSync` closes `addOpen` and `expandedKey` before `requestSettingsJump('web-search', 'web-search.fallbacks')`) and friendly web fallback preview (`formatWebFallbackPreview` in `retryFallbackHelpers.ts` resolves web search provider names scoped to `getWebSearchScopeKey()` or `formatRoleDisplayValue`, covered by `RetryFallbackChains.test.tsx`).
- Completed `OmpRowControl.tsx` / `ompRowHelpers.ts` `Minutes` / `Hours` unit inference and 15-locale completeness guard in `messages.test.ts` (asserting all exposed `OMP_SETTING_EXPOSED_IDS` labels and `minutes`/`hours` unit translations across all 15 locales in `omp-settings.i18n.ts`).
- Added mechanical UX regression guards in `settingsLayoutGuard.test.ts` (`ModelRoleLinkRow` uses `Button`, never `SettingsInlineLink`; `PluginsPage` / `ExtensionControlCenter` route through `filterPluginCapabilities` excluding `ssh`/`openssh-config`/`builtin-defaults`; `UsagePage` reset-policy and `CustomProviderForm` advanced disclosures default-collapsed).
- Check after: `node scripts/run-isolated-tests.mjs packages/ui/src/components/sections/memory` (1/1 passed); `bun test --cwd packages/ui` on `settingsLayoutGuard.test.ts` (17 pass), `settingsItemOwnership.test.ts` (4 pass), `settingsSearchAnchors.test.ts` (7 pass), `messages.test.ts` (19 pass), `MemoryPage.test.tsx` (4 pass), `RetryFallbackChains.test.tsx` (10 pass), `OmpRowControl.test.tsx` (19 pass), `ompRowHelpers.test.ts` (14 pass); `bun run type-check` passed (4,766 files + `upstream-drift` + `error-cause` + `css-classes` + `upstream-gaps`); `bunx oxlint` 0 findings; `bun run check:changed -- --ratchet-only --base HEAD` passed; logs in `/home/shizuku/Project/ohpichamber-omp-artifacts/ux-audit-remediation-2026-11-24/task06/{final-check,final-typecheck,final-oxlint}.log`.
- Review: pass (independent `reviewer` subagent `memory-06.diff-reviewer-06` flagged missing `snapshot.scope === getWebSearchScopeKey()` check in `RetryFallbackChains.tsx`; fixed and covered by stale-scope test in `RetryFallbackChains.test.tsx`; review recorded in `/home/shizuku/Project/ohpichamber-omp-artifacts/ux-audit-remediation-2026-11-24/task06/review.md`).
