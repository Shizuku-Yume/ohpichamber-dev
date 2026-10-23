# 11: Stage the Agent Runtime in release workflows

**Effort:** post-m3-hardening
**Task type:** bugfix
**Base commit:** 17df7d06b285cd3cfd607836e857be17385a91d5
**Base branch:** post-m3-hardening/12-native-packages-all-targets
**Started:** 2026-10-23T20:14:18+08:00
**Status:** active

**Delivers:** Release and smoke workflows stage and verify the Agent Runtime instead of calling removed OpenCode CLI scripts, and the OpenCode smoke workflow is gone.

**Blocked by:** None
**Files:** `.github/workflows/release.yml` (158-169, 205-215, 309-333, 355, 443-448); `.github/workflows/release-desktop-smoke.yml` (78-90, 123-131); `.github/workflows/build-macos-arm64-dmg.yml` (40-52, 85-90); `.github/workflows/opencode-smoke.yml`; `scripts/oc-dev.mjs` (624-625); `packages/electron/package.json` scripts; `packages/electron/scripts/prepare-agent-runtime.mjs`

**Read first:** `.workflow/specs/post-m3-hardening.md`; `/home/shizuku/Project/ohpichamber-omp-artifacts/post-m3-review-2026-10-23/``SurfacesReview.md` findings 2 and 12; `packages/electron/README.md`; `.agents/skills/desktop-shell/SKILL.md`
**Covers:** H8

**Check:** The owned release/smoke workflows and `scripts/oc-dev.mjs` contain no `opencode-cli` or `opencodeCli` references; run Agent Runtime preparation and verification before packaging, then verify the Linux AppImage and run `verify:agent-runtime` against the packaged Linux app resources to prove service readiness. The literal `.github/` + `scripts/` sweep is reported separately because pre-existing hits in unowned performance scripts cannot be changed in this task.

## Done when

- [x] Every workflow and `oc-dev` step that prepared or cached the OpenCode CLI now prepares or verifies the Agent Runtime.
- [x] `opencode-smoke.yml` is removed; the release workflows use the pinned Agent Runtime preparation and verification commands.
- [x] Non-Linux matrix jobs fail at native staging when their target leaf is unavailable, with the source-built native-package requirement and task 29 follow-up named in the staging error/progress.
## Progress

- Dirty at start: none. Worktree `/home/shizuku/Project/ohpichamber-worktrees/post-m3-hardening-12`, branch `post-m3-hardening/11-release-workflows-agent-runtime`, stacked on Task12 branch at `17df7d06b285cd3cfd607836e857be17385a91d5` (Task12 code SHA `461018296091eb9a43278372152605fe6e19b46f`, refreshed evidence commit `17df7d06b285cd3cfd607836e857be17385a91d5`).
- Check before: failed. The release/smoke workflows still invoke removed `prepare:opencode-cli` / `verify:opencode-cli` scripts and cache `.cache/opencode-cli`; `.github/` + `scripts/` search also found out-of-scope references in `scripts/profile-startup.mjs` and `scripts/perf/isolated-server.mjs`. No implementation was present yet.
- Focused checks after implementation: `node --check scripts/oc-dev.mjs`, `node --check packages/electron/scripts/prepare-agent-runtime.mjs`, and Bun YAML parsing of `.github/workflows/release.yml`, `.github/workflows/release-desktop-smoke.yml`, and `.github/workflows/build-macos-arm64-dmg.yml` passed. Ruby YAML validation was unavailable (`ruby: command not found`, exit 127); no network or retry was used.
- Linux Agent Runtime staging and verification passed with `TMPDIR=/home/shizuku/Project/ohpichamber-omp-artifacts/task11-2026-10-23/tmp`: Bun 1.4.2, 158 packages, readiness `ready:true`, engine `omp`, version `1.0.0`, `PIPESTATUS=0`. Receipt: `/home/shizuku/Project/ohpichamber-omp-artifacts/task11-2026-10-23/focused-stage-verify.log`.
- Package smoke: `bun run electron:build` built the Linux AppImage payload but electron-builder exited 1 because `GH_TOKEN` was not set for publishing. The subsequent packaged-resource verification passed (`Bun 1.4.2`, 158 packages, readiness ready) and `verify:linux-appimage` passed for `OpenChamber-2.2.0-linux-x86_64.AppImage`, reporting 29 Host native modules. Receipt: `/home/shizuku/Project/ohpichamber-omp-artifacts/task11-2026-10-23/task11-package-smoke-direct.log`; this is a packaging result with a publishing blocker, not a zero-exit package command.
- The no-network `unshare --net` package stand-in separately failed at Agent Service readiness (`Agent service readiness timed out`, exit 1), retained at `/home/shizuku/Project/ohpichamber-omp-artifacts/task11-2026-10-23/task11-package-smoke-20261023.log`. An AppImage launch stand-in under the same isolated network timed out (exit 124), retained at `/home/shizuku/Project/ohpichamber-omp-artifacts/task11-2026-10-23/task11-appimage-launch.log`; no connected UI/provider result is claimed.
- Literal sweep limitation: owned workflow and `scripts/oc-dev.mjs` references are migrated, but `.github/` + `scripts/` still finds pre-existing `opencodeCli` references in unowned `scripts/profile-startup.mjs:175,178,694,695,699` and `scripts/perf/isolated-server.mjs:31`. Those files were not edited.
- The existing native-package guard regression is top-level and its focused run passed (7 tests, 0 failures), retained at `/home/shizuku/Project/ohpichamber-omp-artifacts/task11-2026-10-23/prepare-agent-runtime-focused.log`; no further test edits are required. The AppImage extraction/launch stand-in reached extraction and exited 124 after 47 seconds; that does not prove connected UI startup. No C/B/F files, Task29/37, `scripts/profile-startup.mjs`, or `scripts/perf/isolated-server.mjs` were edited. Task12's accepted code/evidence lineage remains the stacked base; no old Task12 gate is being repeated.
- Check after: Linux staged and packaged Agent Runtime verification passed; the literal global sweep remains an external ownership dependency as stated above. The package command's missing publishing token and no-network/AppImage-launch stand-in limitations remain explicit. A final full-stack gate follows the required rebase onto `7cc282d08504afc88d1531b6ba527009de3b0794`; no main merge is authorized.
