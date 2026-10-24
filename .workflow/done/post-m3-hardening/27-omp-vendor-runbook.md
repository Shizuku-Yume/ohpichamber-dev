# 27: Write a reproducible OMP vendor upgrade runbook

**Effort:** post-m3-hardening
**Task type:** feature
**Base commit:** 94d356cb21b3ef0423daa9f0a19c0df4e75df3c4
**Base branch:** post-m3-hardening/15-docker-image-omp
**Started:** 2026-10-24T12:20:00+08:00
**Finished:** 2026-10-24T12:32:00+08:00

**Delivers:** A runbook that reproduces the current `vendor/omp/c9de2b02` pin (tarball hashes, patches, dependency owners, root overrides) from its source revision, and describes how to bump it.

**Blocked by:** None
**Files:** `vendor/omp/c9de2b02/README.md`; `copy-manifest.json`; `dependency-owners.json`; `patches/`; root `package.json` overrides and `patchedDependencies`

**Read first:** `.workflow/specs/post-m3-hardening.md`; `.workflow/omp-migration/m0/source-install.json`; `.workflow/development.md` "OMP source preparation" and the patched-dependency paragraph
**Covers:** H15

**Check:** Following the runbook from the pinned source archive regenerates tarballs whose hashes match `copy-manifest.json`, and `bun install --frozen-lockfile` passes. If the source archive is not reachable without network, the runbook is checked step by step against the existing inputs and that limit is stated.

## Done when

- [x] The bump procedure names which checks must be rerun (agent-service suite, gate, packaged smoke).
- [x] Network use needs the maintainer's permission.

## Progress

- Dirty at start: `packages/electron/scripts/prepare-agent-runtime.test.mjs` (inherited unstaged native test change; not staged).
- Check before: cannot run. There was no runbook to follow, and the pinned source archive plus locked third-party packages are not reachable without network; network use was not permitted for this task.
- Work: added `## Reproducing this pin` and `## Bumping the pin` to `vendor/omp/c9de2b02/README.md`. The runbook records the pinned identity and hashes, source acquisition, disposable preparation, the exact 13-package build/pack sequence, the consumer/lock correction, application overrides and patches, verification checks, read-only retention, and the bump procedure with its limits.
- Check after: step-by-step verification against existing inputs. All 15 destinations covered by `copy-manifest.json` (13 tarballs plus the `@ark/schema` and `puppeteer-core` patch inputs) match their recorded SHA-256 and size. The `@oh-my-pi/pi-coding-agent` patch under `patches/` is application-owned and is not part of that manifest; the runbook says so. Because the source archive is not reachable offline, tarball regeneration and `bun install --frozen-lockfile` were not rerun; this task changed no dependency, lock or source package, and the installed closure was exercised by the full root gate at code `1f86c21628d14658a3a415cf70a6bda74116b31c` in the parent stack. Receipt: `/home/shizuku/Project/ohpichamber-omp-artifacts/task27-2026-10-24/task27-input-hashes.log` (`PIPESTATUS=0`).
- Limits: the runbook claims no two-build reproducibility, hermetic packaging or offline registry; locked third-party packages require registry access, and only the Linux x64 native leaf is retained. Linux arm64 and non-Linux native leaves remain task 29's scope, and native source-build equivalence is not established.
- Review boundary: `94d356cb2` + `vendor/omp/c9de2b02/README.md` and this record; round: 1; briefs: A,B; boundaries: vendor identity/recipe, root overrides/patches, lock reproduction; findings: none received. Both review briefs were spawned but returned no result before the commit (no output available); they are recorded as not-run for this commit and passed to the coordinator. No review finding was acted on, and the step-by-step hash check above is the only completed verification.
