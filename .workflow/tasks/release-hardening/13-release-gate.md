# 13: Release gate: full root gate, real-path walkthrough, close both efforts

**Effort:** release-hardening
**Blocked by:** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12
**Covers:** W1, W2, W3, W4, W5, W6
**Files:** `.workflow/development.md`; `.workflow/done/release-hardening/closeout.md`; `.workflow/done/final-main-audit/closeout.md`; `.workflow/specs/release-hardening.md`; `.workflow/specs/final-main-audit.md`; `.workflow/tasks/final-main-audit/06-final-main-convergence-and-signoff-gate.md`
**Read first:** `.workflow/specs/release-hardening.md`; `.workflow/specs/final-main-audit.md`; `.claude/skills/flow-verify/SKILL.md`; `.claude/skills/flow-close/SKILL.md`; `.agents/skills/chrome-devtools-cli/SKILL.md`
**Check:** on the integration head: `bun install --frozen-lockfile && bun run brand:generate --check && bun run check && bun run type-check && bun run lint 2>&1 | tee <task tmp>/lint.log && ! grep -qE 'warning' <task tmp>/lint.log && bun run dead-code && bun run docs:validate && VITEST_MAX_WORKERS=2 bun run test && .workflow/bin/workflow validate` → every command exits 0; the rebuilt Linux AppImage passes `verify-linux-appimage` and reaches `/api/agent/v1/ready`; `task13/LIVE-REPORT.md` and `task13/FINAL-AUDIT-REPORT.md` record each W check.
**Base commit:** 05bff088c5a711d08789ac0842faa48d42d1a39e
**Status:** active

- [ ] Run the full Check and record each command's output in `task13/`.
- [ ] Real isolated walkthrough (Web 1600 px `zh-CN` and `en`, 390×844 mobile): every W1 flow, the W3 two-client refresh, and the W5 parity set compared against task 10's "before" captures; zero console errors.
- [ ] Independent read-only workflow review and security review over `git diff main...release-hardening/integration`; fix blocking and major findings or send them back.
- [ ] `.workflow/technical-debt.md` has no entries.
- [ ] Close `final-main-audit`: record the Check result in task 06's Progress (review waived by the maintainer on 2026-11-26: the audit PR merged as #3 and is superseded by this gate), archive it, write its closeout, set its spec to done.
- [ ] Write the `release-hardening` closeout, update development.md, set the spec to done, merge the integration branch into `main`, and rebuild and reinstall the local AppImage when OhPiChamber is not running.
