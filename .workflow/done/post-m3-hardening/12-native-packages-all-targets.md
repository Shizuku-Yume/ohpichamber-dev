# 12: Find a native-package source for every release target

**Effort:** post-m3-hardening
**Task type:** spike
**Base commit:** f72010e3ef453a5218c3464b674b86c0ccc00a04
**Started:** 2026-10-23T12:46:02+08:00
**Finished:** 2026-10-23T12:49:49+08:00

**Delivers:** Answer to: how does each release target (macOS arm64/x64, Windows x64/arm64, Linux arm64) get an OMP native package that matches the pinned source? Includes a recommendation and the drafted vendoring task.

**Blocked by:** None
**Files:** `vendor/omp/c9de2b02/` (`README.md`, `copy-manifest.json`, `dependency-owners.json`, tarballs); root `package.json` lines 173-186; `packages/electron/scripts/prepare-agent-runtime.mjs` (93-118)

**Read first:** `.workflow/specs/post-m3-hardening.md`; `.workflow/omp-migration/m0/source-install.json`; `.workflow/omp-migration/m0/sdk-install-identity.json`; `.workflow/development.md` "Guest Shell and installable SDK evidence"; `.workflow/spike-tasks.md`
**Covers:** H8

**Check:** `## Findings` states, per target, the proposed source (registry prebuilt pinned by integrity, or a build from pinned Rust source), how identity is proven, and what was not verifiable here; the follow-up vendoring task is drafted after the maintainer answers spec open question 5.

## Done when

- [x] Network access to fetch registry metadata or binaries is used only with the maintainer's permission; otherwise the finding says what it would need.
- [x] Time box: one pass over the vendored inputs plus one identity comparison per target that can be reached.

Both items are met. The Check is complete: the maintainer chose option B and the follow-up vendoring task is drafted as task 29.

## Progress

- Dirty at start: none. Worktree `/home/shizuku/Project/ohpichamber-worktrees/post-m3-hardening-12`, branch `post-m3-hardening/12-native-packages-all-targets`, cut from `main` at `f72010e3e`.
- Check before: skipped (spike).
- Check after: pass. `## Findings` answers every target and records the remaining limits, and the maintainer's answer to open question 5 is recorded below.
- Work: one pass over the vendored inputs, `prepare-agent-runtime.mjs`, the release matrices, the M0 install/provenance records and the pinned OMP source build definitions; one identity comparison for the only reachable target, Linux x64. No code changed and no outbound network request ran.
- Decision: the maintainer chose option B, build all six leaves from the pinned Rust source `c9de2b02`. The follow-up task is `.workflow/tasks/post-m3-hardening/29-vendor-native-leaves.md`, `Blocked by: 12`.
- Review: not run separately; this spike changed planning documents only, and the task Check plus `workflow validate` are the proof.
- Landing gate: the rebase command was run against current `main`; it reported the branch was already up to date, and `main` was unchanged at `f72010e3e`, so it was a no-op. `bun run test` was then run and aborted in the UI package: 802/804 UI test files passed, 2 failed, with six failing tests across `packages/ui/src/stores/useQuotaStore.test.ts` and `useQuotaStore.same-origin.test.ts`. That is a UI package subtotal, not whole-root-suite coverage: the root `&&` command stopped before the Electron and Web suites, so this does not establish that only two root-level test files failed. Bun printed exit code 1. The shell pipeline status was not captured because it ended in `tail` without `pipefail`; no standalone log was retained, and the only record is the tool transcript. The failures are Lane A task 01's scope; no Lane A file was changed. The branch is preserved as finished-but-unlanded; main was not updated.
- Current gate receipt (supersedes the historical failed and timed-out gate attempts): clean tested tree `461018296091eb9a43278372152605fe6e19b46f`, based on `main` at `ecdeb110d835d09defa60d4e91b0e1dbecf8a3df`, in `/home/shizuku/Project/ohpichamber-worktrees/post-m3-hardening-12`. The worktree was on stacked branch `post-m3-hardening/11-release-workflows-agent-runtime` at that same SHA, with no Task11 dirty edits before or during the run. `main` was `7cc282d08504afc88d1531b6ba527009de3b0794`; this gate does not cover its newer commits.
- `bun run test` completed in 452.07 seconds with `PIPESTATUS=0` and all 7/7 suites passing: scripts 22/22 files; SDK 23/23; UI 804/804; agent-contract 177 pass, 0 fail (22 files); agent-service 229 pass, 7 skip, 0 fail (36 files); Electron 44/44 files; Web 375 passed, 9 skipped (384 files), 6105 passed, 135 skipped (6240 tests). The shell used `set -o pipefail`, `tee`, and captured `${PIPESTATUS[0]}` immediately after the pipeline. Full current log: `/home/shizuku/Project/ohpichamber-omp-artifacts/task12-2026-10-23/root-test-refresh-20261023T195510.log`; prior complete log `root-test-final.log` is preserved unchanged.
- This follow-on commit updates evidence only after the clean tested tree; it is not the tested SHA. Task12 remains prepared but unlanded. No main write or landing grant was consumed. Before landing, refresh onto then-current main and rerun the full root gate to a distinct SHA/base-named log.
- Next: continue Task11 branch-only implementation in the same worktree, stacked on prepared Task12; task 29 remains separate and unmodified.

## Findings

**Question:** how does each release target (macOS arm64/x64, Windows x64/arm64, Linux arm64) get an OMP native package that matches the pinned source?

**Current inputs.** `vendor/omp/c9de2b02/` holds the 13 source-derived tarballs, but only the Linux x64 native leaf. `copy-manifest.json` records `platform: "linux-x64"` and states that other native platforms and native source-build equivalence remain unverified. Root `package.json` overrides (lines 173-186) pin only `@oh-my-pi/pi-natives-linux-x64`; `bun.lock` has no resolved leaf package entries or local overrides for the other five. The loader's `optionalDependencies` declarations in the vendored `@oh-my-pi/pi-natives` package do list all six leaves. `packages/electron/scripts/prepare-agent-runtime.mjs:93-118` requires a native target host and looks for `@oh-my-pi/pi-natives-${platform}-${arch}`, so a packaged build needs the matching leaf installed on that host. The release matrix covers macOS arm64/x64, Windows x64/arm64 and Linux x64/arm64; this task adds Linux arm64 to the answer.

**Identity evidence.**

- Pinned source: revision `c9de2b02b997f37cc89639282ed35dec86f139e8`, source archive SHA-256 `06b6a671af953f5cdefe95cbd44271a5c20d9b9e951173af7d10d71e1b0dc150`, source lock SHA-256 `fcd23297e0c05fb6fd9b6623a70823826fd99a6cc7ffca18201c95860fce66b3` (`source-install.json`).
- Registry: the recorded npm provenance for `@oh-my-pi/pi-coding-agent@18.8.9` names source revision `fa5ff4a3a977a28b93d025f4cf50f046e019f18c`, not the pin (`sdk-install-identity.json`). That is coding-agent provenance, not native-leaf provenance; no attestation for the five native leaves was fetched, so a native-source mismatch is not proven. Registry integrity can be pinned, but version or integrity alone does not establish the pinned source; M0 rejected reusing source-based SDK results for that package. The native leaf manifests carry no `gitHead`, and the addons stamp only `PI_NATIVES_VERSION_STAMP:<version>`; native build equivalence remains unproven.
- Reachable Linux x64 comparison: vendored leaf tarball SHA-256 `35effa44e183ac54621f8099d85a5f27f5a8a054a1e2293eb357bf8fe504e6c7`; addons `pi_natives.linux-x64-baseline.node` SHA-256 `df5f6404bdd1db1da01144d91e76accef34a6beeb0e3041537c8d6edf05e5a15` and `pi_natives.linux-x64-modern.node` SHA-256 `33710d1ac6830e068fb46db335e6e2f2e6175a343b267506cd8a31d72d52e059`. Both are stamped `18.8.9`; the bytes match the M0 source-tree and registry copies. The pinned snapshot did not include prebuilt addons (`development.md` "M0 fixture evidence"), so this proves byte identity, not a build from `c9de2b02`.

**Proposed source and identity proof, per target.** The source revision, archive hash, exact Bazel target, `Cargo.lock`/`MODULE.bazel.lock`/toolchain pins and the resulting addon and leaf-tarball SHA-256 values are the identity record. The version stamp is necessary but not sufficient because it names only the release version.

| Target | Build from pinned source | Registry leaf | Local evidence |
|---|---|---|---|
| linux-x64 | `//:natives-linux-x64-baseline` and `//:natives-linux-x64-modern`, then `gen:npm --tag linux-x64` | `@oh-my-pi/pi-natives-linux-x64@18.8.9` | vendored; tarball/addon hashes and stamp verified; build provenance unproven |
| linux-arm64 | `//:natives-linux-arm64`, then tag `linux-arm64` | `@oh-my-pi/pi-natives-linux-arm64@18.8.9` | no leaf, no lock record, no arm64 host |
| darwin-arm64 | `//:natives-darwin-arm64`, then tag `darwin-arm64` | `@oh-my-pi/pi-natives-darwin-arm64@18.8.9` | no leaf, no lock record, no macOS host |
| darwin-x64 | `//:natives-darwin-x64-baseline`, then tag `darwin-x64` | `@oh-my-pi/pi-natives-darwin-x64@18.8.9` | no leaf, no lock record, no macOS host |
| win32-x64 | `//:natives-win32-x64-baseline`, then tag `win32-x64` | `@oh-my-pi/pi-natives-win32-x64@18.8.9` | no leaf, no lock record, no Windows host |
| win32-arm64 | `//:natives-win32-arm64`, then tag `win32-arm64` | `@oh-my-pi/pi-natives-win32-arm64@18.8.9` | no leaf, no lock record, no Windows host |

**How each route proves identity.**

- Build route: verify the source archive against the pinned revision/hash; build the named Bazel target with the pinned lock and toolchain; stamp `18.8.9` and check `__piNativesBuildVersion`; record the addon and leaf-tarball hashes in `copy-manifest.json`; on each native host run `bun install --frozen-lockfile`, `prepare:agent-runtime`, `verify:agent-runtime` and the packaged smoke. `verify-agent-runtime.mjs` checks payload hashes, platform/architecture and package presence, not the source revision, so the manifest record is the source proof.
- Registry route: pin each tarball's SHA-512/integrity and require an npm provenance attestation whose subject matches the tarball and whose payload source revision is `c9de2b02`. The five leaf attestations were not fetched, so this route's source identity cannot be checked here. Accepting registry leaves would need the maintainer to accept version/integrity identity in place of a verified pinned-source build.

**Not verifiable here.** No outbound network, so the five missing registry tarballs, their metadata and leaf attestations were not fetched, and crates/toolchains were not downloaded. This host is x86_64 Linux with no `bazel`/`bazelisk`, Rust, clang/clang-cl, `ld64.lld`, `xwin`, `zig` or Docker, so no cross-build and no non-Linux native load ran. There is no `fa5ff4a3` source snapshot, so native Rust changes between the published revision and the pin cannot be diffed. The source archive was not re-verified (`acquisitionArchiveReverified: false`). OMP's CI cross-build and leaf-publishing jobs are design evidence for the build route, not an execution receipt here.

**Maintainer decision (2026-10-23): option B.** Build all six leaves from the pinned Rust source `c9de2b02`, including a rebuild of Linux x64, then vendor the resulting tarballs with SHA-256 values and add all six `file:` overrides. This route can establish source identity through the pinned build inputs and recorded output hashes; the registry route would need leaf attestations and a same-revision provenance check that were not available here. It is not proven that registry native leaves come from a different native source. The registry option is not approved. The actual builds and downloads remain follow-up work and need the maintainer's network permission; this task did not perform them.

**Follow-up.** `.workflow/tasks/post-m3-hardening/29-vendor-native-leaves.md` carries the builds, vendoring, overrides, lock update and per-host verification. It is `Blocked by: 12` and starts only after this task lands.

**Check.** Pass. `## Findings` states the per-target proposed source, identity proof and unverifiable limits, and the follow-up vendoring task is drafted after the maintainer answered open question 5.
