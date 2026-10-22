# 35: Converge the UI test project after caller cutover

**Effort:** omp-through-m3
**Task type:** refactor
**Base commit:** e1be47c36

**Delivers:** The remaining UI test-project diagnostics are resolved after Tasks 17, 33, and 34, with no weakening of the canonical contract or test compiler configuration.

**Blocked by:** None
**Files:** `packages/ui/tsconfig.test.json`, `packages/ui/src/**/*.test.*` and directly paired test helpers still reported by the test-project type-check, plus the owning canonical contract only when a diagnostic proves it incomplete
**Read first:** `.workflow/specs/omp-through-m3.md` W7-W10; `packages/ui/src/sync/DOCUMENTATION.md`; `packages/ui/src/stores/DOCUMENTATION.md`; Task 17, 33, and 34 artifacts; the full current diagnostic report
**Covers:** W7, W9, W10

**Change:**

- Run the UI test-project type-check once against the landed caller and fixture slices, then group every remaining diagnostic by owner.
- Migrate remaining directly evidenced fixtures and test-only helpers to canonical contracts. If a diagnostic exposes a missing production owner, fix that owner rather than widening the test configuration.
- Keep `tsconfig.test.json` strict enough to catch stale runtime imports; do not exclude files, add ambient aliases, or use unjustified assertions to obtain a green result.
- Remove obsolete test-only OpenCode imports/helpers after their callers are gone.

**Check:** `bun run --cwd packages/ui type-check`; focused tests for each changed residual slice only. `bunx oxlint` on authored TypeScript/JavaScript files.

**Acceptance:**

- [x] The UI test project type-check passes without exclusions or compatibility aliases.
- [x] Remaining test fixtures use canonical client/DTO contracts or are explicitly historical data fixtures.
- [x] No new production fallback, adapter, or guessed contract is added.
- [x] The final diagnostic count, focused test commands, package type-check and lint-ratchet result are recorded.
## 2026-10-17 evidence

The strict test-project command `bunx tsc --noEmit --pretty false -p packages/ui/tsconfig.test.json` exits 0. The package production type-check `bun run --cwd packages/ui type-check` exits 0 after aligning the existing Zustand `persist.rehydrate` return type. The 21-file changed-slice packet passed 264 tests / 984 assertions; the four files touched by final lint repairs passed 72 tests / 145 assertions on rerun. The direct lint run reports 10 unchanged baseline findings in four fixture files after all 9 introduced findings were removed; no new finding was added by this convergence slice. No exclusions, ambient aliases, adapters, fallback engines or unjustified assertions were added. Connected runtime acceptance and residual production caller closure remain Task17/36 work.

**Finished:** 2026-10-17
