# 16: Migrate utility generation and remaining agent callers

**Effort:** omp-through-m3
**Task type:** refactor
**Base commit:** <commit-sha>

**Delivers:** Utility generation, multi-run and residual agent-facing callers use canonical session/model/queue contracts; no old client or hidden dual-engine selector remains in retained surfaces.

**Blocked by:** 12, 13
**Files:** `packages/ui/src/`, `packages/web/`, utility/multi-run modules, tests and docs

**Read first:** `.workflow/specs/omp-through-m3.md` M3/W9/W10; contracts; current remaining `@opencode/client`/`@opencode/schema` references from code search; `packages/ui/src/lib/multirun/`; Host small-model owner; performance and UI API skills
**Covers:** W9, W10

**Check:** Use the isolated runner for affected utility/multi-run owners, then a temporary canonical-service scenario → generation, cancellation, per-run failure and selected model scope work without old client calls. Run changed-source oxlint; review `bun run dead-code` once after this removal batch. Remaining non-agent legacy references cannot import or reach the old execution client.

- [ ] Migrate utility generation, multi-run and helper callers instead of wrapping old client methods.
- [ ] Remove dual-engine selectors, OpenCode configuration readers and fallback agent paths from retained surfaces.
- [ ] Preserve cancellation, provider/model scope and per-run failure isolation.
- [ ] Remove dead exports/re-exports and update direct consumers.
- [ ] Document any intentionally retained OpenCode references as non-agent legacy only before final removal review.
