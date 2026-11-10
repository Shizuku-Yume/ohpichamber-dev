# 11: Start the upstream merge and derive the ledger from git

**Effort:** ux-v270-omp-alignment
**Blocked by:** None
**Covers:** W1
**Files:** `scripts/upstream-drift.mjs`; `scripts/upstream-drift.test.mjs`; `.workflow/upstream-deltas.tsv`; `.workflow/research/ux-v270-omp-alignment/merge-lanes.tsv`; root `package.json`; `bun.lock`; `packages/*/package.json`; standing-exclusion paths
**Read first:** spec "How it is built" (Merge); `decisions.md: 2026-11-10 - Merge upstream OpenChamber with a real git merge`; `specs/upstream-refresh.md` (standing exclusions); `research/ux-v270-systemic-review.md` R1
**Check:** on the scaffold tip, `bun scripts/upstream-drift.mjs --markers --lane 11` → 0 markers in excluded and manifest paths; `bun install --frozen-lockfile` → exit 0; `bun scripts/upstream-drift.test.mjs` → exit 0; `merge-lanes.tsv` assigns every conflicted path to exactly one of lanes 12-18
- **Base commit:** d599d1566b332cf1aa8a8c4450424b070506676e

- [x] Fast-forward `ux-v270-omp-alignment/integration` to `main`. Cut `ux-v270-omp-alignment/merge-scaffold` from it, run `git merge --no-ff bc50ba56a`, and commit the conflicted state with markers. The commit message marks it as scaffold that never lands.
- [x] Resolve the standing exclusions to the fork side: `packages/vscode` (deleted), OpenCode-engine paths, folder trust, isolated-spaces code, `.github` collaboration/CI, `changelog/`, `nix/`, `pr-evidence/`, upstream `.agents/.claude/.opencode` guidance.
- [x] Resolve the root and package manifests and `bun.lock`: take upstream dependency changes unless they reintroduce OpenCode packages, then regenerate the lockfile so a frozen install passes.
- [x] Write `scripts/upstream-drift.mjs`. It derives each path's state from git blobs against `bc50ba56a`: identical, fork-differs, upstream-only, or fork-only. A fork-differs path is classed `omp-boundary` (fork delta touches Canonical Client / agent contract / Host gateway identifiers), `decision` (listed in `.workflow/upstream-deltas.tsv` with a `decisions.md` heading), or `unexplained`. Options: `--markers [--lane N | paths]` and `--check` (fails on markers, on any `unexplained` path, and on `upstream-deltas.tsv` rows that contradict git). Its test covers each state on a fixture repository.
- [x] Generate `merge-lanes.tsv`, assigning each conflicted path to lanes 12-18 by the area lists in those tasks; paths outside them fall to lane 16.
- [x] Deletes: the hand-kept disposition TSV stops being read by any tool or task (left in `research/` as history).

## Progress

Lane 11 scaffolded the upstream v2.7.0 merge and produced the drift ledger; lanes
12-18 resolve the remaining 1,298 conflicted paths, so the scaffold tip still
carries their markers.

- **Integration branch:** `ux-v270-omp-alignment/integration` already equals `main`
  (`d599d1566`), so the fast-forward is satisfied by state and changed nothing.
  `ux-v270-omp-alignment/merge-scaffold` was cut from it.
- **Scaffold commit:** `2f07806ad chore(merge): scaffold upstream v2.7.0 merge with conflict markers (never lands)`,
  parents `246683722` + `bc50ba56a`, merge base `0056bf6a9`, 1,298 conflicted paths.
- **Exclusions:** the fork trees for `.workflow .agents .claude .opencode .openchamber .github changelog`
  and `AGENTS.md README.md SECURITY.md CHANGELOG.md CLAUDE.md Dockerfile` are restored verbatim; the OpenCode engine,
  spaces trees, folder trust, `packages/vscode`, `nix/`, `flake.*` and their upstream-only files are deleted.
  Guest SDK and Host guest modules took upstream's v2.7.0 `sessionAnswers`/`links` surfaces without the retired OpenCode plugin role.
- **Manifests and lockfile:** all six manifests resolved to upstream's dependency set minus `@opencode/*`, `@vscode/ripgrep`,
  `opencodeCli` and the VS Code scripts, with the fork version `3.0.0` (mobile `1.13.2`), scripts and OMP overrides;
  `bun.lock` regenerated from them.

**Check before:** `bun scripts/upstream-drift.mjs --markers --lane 11` → no tool existed; `grep -rl '^<<<<<<<'` counted 917 marker-bearing
files, including `packages/web/server/lib/host/**` and every manifest. `bun install --frozen-lockfile` failed against the
unresolved manifests.

**Check after:** `bun scripts/upstream-drift.mjs --markers --lane 11` → `no conflict markers (lane 11)`, exit 0.
`bun install --frozen-lockfile` → exit 0 (`Checked 1431 installs across 1579 packages (no changes)`).
`bun scripts/upstream-drift.test.mjs` → 9 checks pass, `upstream-drift: all checks passed`, exit 0.
`merge-lanes.tsv` → 1,298 rows, 1,298 unique paths, all assigned to lanes 12-18
  (12: 263, 13: 162, 14: 199, 15: 102, 16: 262, 17: 67, 18: 243).
