# 30: Make the drift check honest and give every differing path an owner

**Effort:** ux-v270-omp-alignment
**Task type:** bugfix
**Blocked by:** 18
**Covers:** W1
**Files:** `scripts/upstream-drift.mjs`; `scripts/upstream-drift.test.mjs`; `.workflow/research/ux-v270-omp-alignment/merge-lanes.tsv`; `.workflow/research/ux-v270-omp-alignment/repair-slices.tsv` (new)
**Read first:** spec "How it is built" (Merge); the archived task 11 record; skill `openchamber-change-discipline`
**Check:** `bun scripts/upstream-drift.test.mjs` → exit 0, including cases where an unknown flag exits 2 and a path-scoped check reports out-of-scope unexplained paths as a count; `bun scripts/upstream-drift.mjs --check --slice <N>` runs for each of 31-35; `repair-slices.tsv` assigns every `unexplained` path and every file with a `bun check --all` error to exactly one of slices 31-35
- **Base commit:** f7d633adc008d69cad5be5e8b92cc3416e236ed5

Findings this task fixes (scaffold `93a3c7549`):
- Any argument the parser does not know becomes a path filter. `--check --json` therefore filtered every path out and printed "drift check passed". A misspelled flag can turn a failing check into a pass.
- Lanes only owned conflicted paths (`merge-lanes.tsv`). Paths git merged cleanly but that still differ from upstream had no owner, so 646 stay `unexplained`: 453 in `packages/docs`, 38 `packages/sdk`, 28 `packages/electron`, 20 `scripts`, 37 `components/session`, 16 `components/views`, 13 `components/layout`, plus a few others. The lane-scoped checks the lanes recorded could not see them.
- The class `omp-boundary` also covers standing exclusions (`.agents/`, `.github/`, `nix/`), so the class name overstates what was reviewed.

- [x] Unknown flags exit 2 with usage. A path-scoped or lane-scoped `--check` prints how many unexplained paths exist outside its scope, so a scoped pass cannot be read as a global pass.
- [x] Split the standing exclusions out of `omp-boundary` into their own class `excluded`, keeping the decision references.
- [x] Add `--slice <N>` reading `repair-slices.tsv`, and generate that table: each currently `unexplained` path and each file with a type error in `bun check --all` is assigned to slices 31-35 by the area lists in those tasks.
- [x] Do not resolve any unexplained path or type error yourself; the slices own them.
- [x] Deletes: nothing beyond the parser's path fallback.

## Progress

**Check before:** on `f7d633adc` + the scaffold merge `9ec651b03`, `bun scripts/upstream-drift.mjs --check --json`
→ `no conflict markers (--json)` and `drift check passed`, **exit 0**, from a full-repository ledger that
reports 646 `unexplained` paths: the unknown flag had become a path filter. `--check -- packages/docs`
→ exit 1 with 453 docs paths unexplained, and the pass/fail line named no out-of-scope count. The ledger
classed 1,992 paths `omp-boundary`, 1200 of them standing exclusions (`.agents`, `.claude`, `.github`,
`.opencode`, `.workflow`, `changelog`, `nix`, `flake.*`, the root docs and `packages/vscode`). `bun scripts/upstream-drift.test.mjs`
→ 10 checks pass (exit 0) but covered neither argument rejection nor scope reporting. `bun check --all --no-pretty`
on the unmodified tree → exit 1, **1,130 errors in 219 files (214 distinct paths**; five files are reported by two
projects), 3,873 files across 5 projects. `--slice 31` → unavailable (no parser support, no table).

**Check after:** the same commands on this tree.
- `bun scripts/upstream-drift.test.mjs` → **14 checks pass, `upstream-drift: all checks passed`, exit 0**. The three
  new cases: an unknown argument (`--check --json`, `--chek`) exits **2** and prints usage; a path-scoped check
  (`--check packages/sdk`) reports its own unexplained path, `outside packages/sdk: 2 unexplained paths not checked`,
  and exit 1, while a clean scope (`packages/ui/src/api`) passes *and* still reports `outside … 3 unexplained paths
  not checked`; `--check --slice 35` reads the table and reports `outside slice 35: 1 unexplained path not checked`.
  A whole-repository check prints no `outside` line. Also covered: paths/`--lane`/`--slice` are alternative scopes,
  `--slice 99` with no rows exits 2, and a ledger row may not claim `excluded` on a path the rule does not exclude.
- `bun scripts/upstream-drift.mjs --check` → **exit 1** (unchanged finding count: 646 unexplained, 992 `omp-boundary`,
  1200 `excluded`, 782 `decision`, 408 `upstream-excluded`, 268 `fork-added` over 4,296 differing paths). This task
  does not resolve a path, so a global pass is not its goal; what changed is that the reason a scoped pass is not a
  global one is printed.
- `--check --slice N` runs for every N: 31 exit 0 (`drift check passed … in slice 31`), 32 exit 1 (37 unexplained in
  scope, `outside slice 32: 609`), 33 exit 1 (56 in scope, outside 590), 34 exit 0, 35 exit 1 (553 in scope, outside 93).
  Each prints `no conflict markers (slice N)` and its out-of-scope count, and none errors on the table or the parser.
- `bun check --all --no-pretty` rerun on this tree → **exit 1, 1,130 errors in 219 files / 214 distinct paths**
  (identical set; the tool change touches no TypeScript).
- `bunx oxlint scripts/upstream-drift.mjs scripts/upstream-drift.test.mjs` → exit 0.
- **Coverage of `repair-slices.tsv`** (throwaway check, not committed): 856 rows, 856 unique paths, no duplicate.
  646 `unexplained` paths covered 646/646, 214 type-error files covered 214/214, 4 of them in both sets.
  Every row is in exactly one slice: 35: 585, 33: 101, 32: 85, 34: 46, 31: 39. Assignments follow the Files lists in
  tasks 31-35 with nothing defaulted into the wrong area: sections/snippets → 31, session → 32, chat/layout/views/
  multirun/ui/onboarding/projects/sourceBoard/desktop/comments/references/apps/App.tsx → 33, sync/stores/api/contexts
  → 34, everything else (ui lib/hooks/types, web client, docs, sdk, electron, extensions, mobile, scripts, root config)
  → 35. The three paths no task's Files list names by area — `packages/ui/src/components/dictation/…`,
  `packages/ui/src/components/mcp/…` and `packages/ui/tsconfig.test.json` — are UI files no other slice claims, so they
  follow the task-35 catch-all role ("unowned paths") and are recorded in slice 35.
- **Class split:** `excluded` now covers `.agents/ .claude/ .opencode/ .github/ .workflow/ nix/ changelog/ packages/vscode/
  packages/web/server/lib/opencode/ packages/ui/src/lib/opencode/ packages/web/server/lib/opencode-trust/
  packages/web/server/lib/spaces/ packages/ui/src/lib/spaces/ packages/ui/src/components/session/spaces/
  scripts/omp-m0/` and the root files `flake.nix flake.lock AGENTS.md CLAUDE.md CONTRIBUTING.md README.md CHANGELOG.md
  SECURITY.md Dockerfile`; `omp-boundary` keeps the Canonical Client (`packages/ui/src/api/`), the agent contract, the
  Agent Service, the Host gateway (`packages/web/server/lib/host/`) and `vendor/omp/`. Both rules cite decision
  `2026-11-10 - Merge upstream OpenChamber with a real git merge` and `specs/upstream-refresh.md`, "Excluded on purpose".
  `merge-lanes.tsv` gained a `class` column populated from the same predicates (39 `excluded`, 13 `omp-boundary`, 1,041
  neither), so the lane table and the ledger cannot disagree about a path. The one ledger row that had mislabelled an
  engine path `omp-boundary` (`packages/ui/src/lib/opencode/events.ts`) now says `excluded`.
- **Not done here:** no unexplained path and no type error was fixed. Slice 31 is already clean (its paths were
  `omp-boundary` by prefix or covered by decisions); 32/33/35 stay red with the exact counts above until their tasks land.
