# 03: Audit and polish packages/ui code style, design tokens, layout, and 15-locale copy

**Effort:** final-main-audit
**Task type:** refactor
**Blocked by:** None
**Covers:** W2
**Files:** `packages/ui/**`
**Read first:** `.workflow/specs/final-main-audit.md`; `packages/ui/src/components/sections/PATTERNS.md`; `packages/ui/src/components/sections/references/layout.md`; `packages/ui/src/components/sections/references/controls.md`; `packages/ui/src/lib/theme/STYLING.md`; `.agents/skills/sync-state-invariants/SKILL.md`; `.agents/skills/performance-engineering/SKILL.md`; `.agents/skills/locale-ui-patterns/SKILL.md`
**Check:** `bun run --cwd packages/ui lint 2>&1 | tee /tmp/audit03-lint.log && ! grep -qE ': warning ' /tmp/audit03-lint.log && bun run --cwd packages/ui type-check && bun test packages/ui/src/components/sections/settingsLayoutGuard.test.ts packages/ui/src/lib/i18n/messages.test.ts && VITEST_MAX_WORKERS=2 bun run --cwd packages/ui test` → all exit 0 with 0 warnings.
**Base commit:** cf8df4f03b90cf1a8e489553eaac6216bc2e3d47

- [x] Audit fork-created and fork-modified files in `packages/ui/src/{api,sync,stores,components,lib,apps}` with `bunx oxlint`: fix every fork-authored `anti-slop` finding, hook dependency issue, or sync-state / hot-path hazard without touching untouched upstream backlog files or silencing lint rules.
- [x] Audit all `packages/ui/src/components/sections/**` and chat/OMP components against `PATTERNS.md` and `STYLING.md`: verify zero hardcoded Tailwind palette colors (`emerald-*`, `amber-*`, `rose-*`, etc. where semantic tokens belong), zero layout-guard violations, and consistent typography/spacing.
- [x] Audit all 15 locales in `packages/ui/src/lib/i18n/messages/*` for missing keys, leftover `OpenChamber` product strings outside the About credit, `Token` capitalization in Chinese, or raw English leaks in `zh-CN`.

**Review:** pass (base cf8df4f03b) — independent read-only `flow-verify` reviewer, verdict PASS on round 2. Round 1 findings were `ar.ts` mojibake, dropped `{placeholder}` tokens, and untranslated English words in shipped locales; all fixed.
**Check after:** `bun run --cwd packages/ui lint 2>&1 | tee /tmp/audit03-lint.log && ! grep -qE ': warning ' /tmp/audit03-lint.log && bun run --cwd packages/ui type-check && bun test packages/ui/src/components/sections/settingsLayoutGuard.test.ts packages/ui/src/lib/i18n/messages.test.ts && VITEST_MAX_WORKERS=2 bun run --cwd packages/ui test` → exit 0: lint 0 errors and 0 warnings, UI type-check 0 type errors across 3,518 files, 27 pass / 0 fail for `settingsLayoutGuard` + `messages.test.ts` (4,708 asserts), and 1250/1250 UI test files passed (`/home/shizuku/Project/ohpichamber-omp-artifacts/final-main-audit-2026-11-18/task03/check-final.log`). Supporting receipts under that same evidence directory: `tokenize.log` 30 pass / 0 fail; `check.log` exit 0 with 5/5 check steps; `he-spotcheck.txt` and `ar-spotcheck.txt` 0 extra, 0 missing, 0 duplicate, 0 mojibake and 0 placeholder drift per locale, with verbatim English limited to justified identifiers and units; `anti-slop-ui-before-after.txt` and `anti-slop-ui-final-count.log` 3,984 findings against the 4,004 base count, UI `i18n/store.ts` at 0; `palette-scan.txt` 0 hardcoded palette-class hits in `components/sections` and `components/chat`; `RECEIPTS.md` holds the command/exit/count table.

## Progress

- 2026-11-18: Task 06 rework (a) `packages/ui/src/lib/i18n/messages/he.ts` dropped 128 invented keys and gained 170 real Hebrew translations; Hebrew now matches the English key set exactly (11,849 keys, 0 extra, 0 missing).
- 2026-11-18: Task 06 rework (b) `packages/ui/src/lib/i18n/messages/ar.ts` translated 262 values that had shipped as raw English (533 verbatim-English values down to 271 justified ones), preserving every `{placeholder}` token.
- 2026-11-18: Task 06 rework (c) `packages/ui/src/components/chat/composer/language/__tests__/tokenize.test.ts` now asserts the status-token behaviour the composer ships (`text-[var(--status-error)]` for `ultrathink`, `bg-[var(--status-warning-background)]` for the turn budget) instead of the removed palette gradients.
- 2026-11-18: Task 06 rework (d) `packages/ui/src/lib/i18n/messages/timeline-notices.i18n.ts` gained `uk`, `tr`, `ar` and `he` blocks for all 24 notice keys, so every shipped locale resolves them instead of falling back to English.
- 2026-11-18: Task 06 rework (e) removed the unused `_normalizePath` alias in `packages/ui/src/apps/MobileFilesSurface.tsx`.
- 2026-11-18: Task 06 rework (f) corrected the four `.workflow/upstream-deltas.tsv` reason cells for `MobileProjectEditSurface.tsx`, `MobileProjectIcon.tsx`, `ProjectSettingsHeader.tsx` and `desktop.d.ts`; each now states the actual fork change instead of a generic branding note.
- 2026-11-18: `packages/ui/src/lib/i18n/store.ts` now selects dictionaries through a typed `DICTIONARY_LOADERS` map (`satisfies Record<Locale, () => Promise<I18nModule>>`), which cleared the file's last anti-slop finding; the UI backlog is 3,984 findings against 4,004 at base.
- 2026-11-18: Root `bun run type-check` and `bun run lint` fail only in `packages/agent-service` (4 type errors in `src/worker/{auto-title,usage}.ts`, 2 lint errors in `src/worker/catalog-models.ts:908` and `src/supervisor/workers.spare.test.ts:159`). Those sites belong to task 01's rework and are outside this task's scope; evidence is in the same directory as `type-check.log`, `lint-root.log` and the isolated reruns `type-check-agent-service-isolated.log` and `lint-agent-service-isolated.log`. `bun run check`, UI type-check, UI lint and the full UI suite pass.

