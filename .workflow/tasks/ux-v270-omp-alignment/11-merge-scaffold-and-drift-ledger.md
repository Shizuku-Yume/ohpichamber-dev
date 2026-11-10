# 11: Start the upstream merge and derive the ledger from git

**Effort:** ux-v270-omp-alignment
**Blocked by:** None
**Covers:** W1
**Files:** `scripts/upstream-drift.mjs`; `scripts/upstream-drift.test.mjs`; `.workflow/upstream-deltas.tsv`; `.workflow/research/ux-v270-omp-alignment/merge-lanes.tsv`; root `package.json`; `bun.lock`; `packages/*/package.json`; standing-exclusion paths
**Read first:** spec "How it is built" (Merge); `decisions.md: 2026-11-10 - Merge upstream OpenChamber with a real git merge`; `specs/upstream-refresh.md` (standing exclusions); `research/ux-v270-systemic-review.md` R1
**Check:** on the scaffold tip, `bun scripts/upstream-drift.mjs --markers --lane 11` → 0 markers in excluded and manifest paths; `bun install --frozen-lockfile` → exit 0; `bun scripts/upstream-drift.test.mjs` → exit 0; `merge-lanes.tsv` assigns every conflicted path to exactly one of lanes 12-18
- **Base commit:** d599d1566b332cf1aa8a8c4450424b070506676e
- **Status:** active

- [ ] Fast-forward `ux-v270-omp-alignment/integration` to `main`. Cut `ux-v270-omp-alignment/merge-scaffold` from it, run `git merge --no-ff bc50ba56a`, and commit the conflicted state with markers. The commit message marks it as scaffold that never lands.
- [ ] Resolve the standing exclusions to the fork side: `packages/vscode` (deleted), OpenCode-engine paths, folder trust, isolated-spaces code, `.github` collaboration/CI, `changelog/`, `nix/`, `pr-evidence/`, upstream `.agents/.claude/.opencode` guidance.
- [ ] Resolve the root and package manifests and `bun.lock`: take upstream dependency changes unless they reintroduce OpenCode packages, then regenerate the lockfile so a frozen install passes.
- [ ] Write `scripts/upstream-drift.mjs`. It derives each path's state from git blobs against `bc50ba56a`: identical, fork-differs, upstream-only, or fork-only. A fork-differs path is classed `omp-boundary` (fork delta touches Canonical Client / agent contract / Host gateway identifiers), `decision` (listed in `.workflow/upstream-deltas.tsv` with a `decisions.md` heading), or `unexplained`. Options: `--markers [--lane N | paths]` and `--check` (fails on markers, on any `unexplained` path, and on `upstream-deltas.tsv` rows that contradict git). Its test covers each state on a fixture repository.
- [ ] Generate `merge-lanes.tsv`, assigning each conflicted path to lanes 12-18 by the area lists in those tasks; paths outside them fall to lane 16.
- [ ] Deletes: the hand-kept disposition TSV stops being read by any tool or task (left in `research/` as history).
