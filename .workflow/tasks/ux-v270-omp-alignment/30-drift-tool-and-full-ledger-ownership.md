# 30: Make the drift check honest and give every differing path an owner

**Effort:** ux-v270-omp-alignment
**Task type:** bugfix
**Blocked by:** 18
**Covers:** W1
**Files:** `scripts/upstream-drift.mjs`; `scripts/upstream-drift.test.mjs`; `.workflow/research/ux-v270-omp-alignment/merge-lanes.tsv`; `.workflow/research/ux-v270-omp-alignment/repair-slices.tsv` (new)
**Read first:** spec "How it is built" (Merge); the archived task 11 record; skill `openchamber-change-discipline`
**Check:** `bun scripts/upstream-drift.test.mjs` → exit 0, including cases where an unknown flag exits 2 and a path-scoped check reports out-of-scope unexplained paths as a count; `bun scripts/upstream-drift.mjs --check --slice <N>` runs for each of 31-35; `repair-slices.tsv` assigns every `unexplained` path and every file with a `bun check --all` error to exactly one of slices 31-35

Findings this task fixes (scaffold `93a3c7549`):
- Any argument the parser does not know becomes a path filter. `--check --json` therefore filtered every path out and printed "drift check passed". A misspelled flag can turn a failing check into a pass.
- Lanes only owned conflicted paths (`merge-lanes.tsv`). Paths git merged cleanly but that still differ from upstream had no owner, so 646 stay `unexplained`: 453 in `packages/docs`, 38 `packages/sdk`, 28 `packages/electron`, 20 `scripts`, 37 `components/session`, 16 `components/views`, 13 `components/layout`, plus a few others. The lane-scoped checks the lanes recorded could not see them.
- The class `omp-boundary` also covers standing exclusions (`.agents/`, `.github/`, `nix/`), so the class name overstates what was reviewed.

- [ ] Unknown flags exit 2 with usage. A path-scoped or lane-scoped `--check` prints how many unexplained paths exist outside its scope, so a scoped pass cannot be read as a global pass.
- [ ] Split the standing exclusions out of `omp-boundary` into their own class `excluded`, keeping the decision references.
- [ ] Add `--slice <N>` reading `repair-slices.tsv`, and generate that table: each currently `unexplained` path and each file with a type error in `bun check --all` is assigned to slices 31-35 by the area lists in those tasks.
- [ ] Do not resolve any unexplained path or type error yourself; the slices own them.
- [ ] Deletes: nothing beyond the parser's path fallback.
