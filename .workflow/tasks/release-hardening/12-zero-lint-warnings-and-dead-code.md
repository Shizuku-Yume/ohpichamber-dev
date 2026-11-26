# 12: Zero lint warnings and zero dead-code findings

**Effort:** release-hardening
**Blocked by:** 10, 11
**Task type:** refactor
**Covers:** W6
**Files:** files named by `bun run lint` warnings and `bun run dead-code` findings on the integration head; `knip.json`
**Read first:** `.workflow/specs/release-hardening.md`; `.workflow/done/final-main-audit/` tasks 01-03 for the earlier audit's approach; `.agents/skills/openchamber-change-discipline/SKILL.md`; `.agents/skills/sync-state-invariants/SKILL.md` for effect dependency changes
**Check:** `bun run lint 2>&1 | tee <task tmp>/lint.log && ! grep -qE 'warning' <task tmp>/lint.log && bun run dead-code && bun run type-check && VITEST_MAX_WORKERS=2 bun run test` → lint 0 warnings, dead-code 0 findings, type-check and every workspace suite pass.

- [ ] Start from the integration head after tasks 10 and 11 merged; record the starting counts in `task12/`.
- [ ] Each `react-hooks(exhaustive-deps)` warning is fixed by reasoning about the effect's trigger (stable refs, moved computation, corrected dependencies), with a test where the trigger changes behavior; no rule disables.
- [ ] Each dead-code finding is deleted, or made a real entry point in `knip.json` when it is genuinely reachable (record why); no blanket ignores.
