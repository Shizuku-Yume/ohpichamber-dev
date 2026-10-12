# 04: Extract host-owned runtime modules

**Effort:** omp-through-m3
**Task type:** refactor
**Base commit:** 8c23615d9ae94f64553b7b800b5f5eac20687cb5
**Started:** 2026-10-12T05:42:39+00:00
**Finished:** 2026-10-12T09:00:01+00:00

**Delivers:** Host settings, themes, project/network/tunnel, startup/static serving and managed-process ownership live outside the OpenCode integration directory while retained behavior stays unchanged.

**Blocked by:** 03
**Files:** `packages/web/server/index.js`, `packages/web/server/lib/opencode/`, `packages/web/server/lib/host/`, related host tests and module documentation

**Read first:** `.workflow/specs/omp-through-m3.md` M1/W2; `.workflow/omp-migration/scope.md` host extraction list; `packages/web/server/lib/opencode/DOCUMENTATION.md`; `packages/web/README.md`; server composition imports
**Covers:** W2

**Check:** `bun run --cwd packages/web test && bun run type-check:web` → retained host tests and web types pass, and no retained host module imports its old OpenCode path through an alias or re-export.

- [x] Move only host-owned modules named by the migration scope and update every retained caller.
- [x] Preserve settings, themes, PWA, project directory, network, login shell, startup/static routes and process cleanup behavior.
- [x] Keep filesystem, Git, PTY, environment, guest and source-control owners in their existing modules unless their boundary changes.
- [x] Update nearest module documentation to describe the new owner.
- [x] Remove dead host path aliases rather than adding compatibility re-exports.

## Progress

Dirty at start: none in the isolated task worktree at the recorded Base commit. Parent integration shares that assembled baseline; unrelated main-tree changes remain outside this task.

Check before: reuse the unchanged assembled baseline's web suite (381 files, 6,785 tests passed; nine files/136 tests skipped) and `type-check:web` pass. No duplicate baseline run was performed.

Implementation: the parent applied the tracked 55-path extraction patch once, then wrote the omitted 38 new Host files from the worker's source. The composition root now imports the Host owners and supplies `readOpenCodeInfo` and `isSupportedOpenCodeVersion` to the extracted network runtime as required dependencies. Shared settings generation targets only the Host snapshot and was regenerated once after task06's registry changes.

Correction: initial relative `MV ../host/...` resolved against the session cwd and temporarily placed the 37 moved files under `/home/shizuku/Project/host`; the worker recovered them into its own `packages/web/server/lib/host/` with absolute destinations and reported no pre-existing destination collision. Future move destinations are absolute worktree paths.

Surfaces: Web/PWA and hosted mobile use the retained Host HTTP services; Electron embeds the same Host and imports login-shell environment from its new owner; Capacitor connects to the Host without running local service processes; the Guest SDK keeps its existing Host bridge and capabilities. No new agent runtime or extension compatibility path is introduced.

Check after: the integrated web suite passed 380 files and skipped nine; only `src/DiffView.hunks.test.ts` failed (nine tests) because task06 left the removed `isConstrainedRuntime` identifier in the shared UI loader. After its fix, `bun run --cwd packages/web test src/DiffView.hunks.test.ts` passed one file and all nine tests. The 380 unchanged passing file receipts were reused. Workspace build, all package type-checks and lint passed; lint retained one unrelated `PluginPane` dependency warning. Dead-code ran and reported 12 unused exports/types, not a retired-workspace import. Documentation validation passed 696 pages and 58 sidebar links. Worker verification: none.

Real path: the final private Node Host scenario exited0 and proved unauthenticated settings HTTP401, password-session login, `inputHistoryLimit=37` HTTP PUT/GET plus profile-disk persistence, extracted theme-owner HTTP200, the built dynamic PWA manifest, Host project-directory validation/persistence and project-scoped filesystem write/read. Listener closure and private-root removal passed. Earlier disposable checks stopped on absent Web assets, then used the wrong `/api/project/current` route and wrongly treated `runtime.isReady()` as canonical readiness; those oracle errors were corrected, not application failures suppressed. The inherited flag was true in the final run; no OMP or canonical-service readiness was evaluated. No provider call or fake asset was used.

Review: `M1ExtractionQuality04` passed source quality with no findings. `M1HostRetirementSecurity` passed the combined source-security brief with no findings, including the 38 new Host files, then passed the narrowly scoped authored-capability/auth-banner recheck. `M1Requirements0406` passed the independent task04 requirements brief with no remaining findings after both stale settings-owner references in project documentation and the three matching comments/documentation references were corrected. These path-only corrections change no behavior. Neither source review establishes unexercised surface certification. The two final current OpenCode-document deltas are integrated; their worker's accidental main-tree `RUNTIME_NOTES.md` line change was restored to the original exact text before delivery.

Landing: archive and commit only the extraction-owned delta on the isolated integration branch. The original dirty main tree and its assembled-source changes remain untouched. Task06's remaining retirement payload and native editor/theme acceptance stay separate. Tasks05 and20 may stack on this archived extraction commit without rerunning unchanged baseline checks.
