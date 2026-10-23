# 29: Vendor native leaves from the pinned OMP source

**Effort:** post-m3-hardening
**Task type:** feature
**Base commit:** <commit-sha>

**Delivers:** Six native leaf tarballs for Linux x64/arm64, macOS x64/arm64 and Windows x64/arm64, built from the pinned OMP Rust source `c9de2b02`, vendored with SHA-256 values, selected by the root overrides and lock, and staged and verified by the Agent Runtime on each supported host.

**Blocked by:** 12
**Files:** `vendor/omp/c9de2b02/README.md`; `vendor/omp/c9de2b02/copy-manifest.json`; `vendor/omp/c9de2b02/tarballs/`; `vendor/omp/c9de2b02/dependency-owners.json` only if the installed closure changes; root `package.json` overrides (lines 173-186); `bun.lock`; `packages/electron/scripts/prepare-agent-runtime.mjs` only if the staged identity check needs it

**Read first:** `.workflow/specs/post-m3-hardening.md`; archived task 12 `## Findings`; `vendor/omp/c9de2b02/README.md`; `.workflow/development.md` "OMP source preparation"; `.workflow/omp-migration/m0/source-install.json`; the pinned OMP `BUILD.bazel` and `scripts/ci-release-publish.ts`; `packages/electron/scripts/prepare-agent-runtime.mjs`
**Covers:** H8

**Check:** For each vendored leaf, its SHA-256 matches `copy-manifest.json`, its manifest declares the target `os`/`cpu`, and the expected `.node` files contain `PI_NATIVES_VERSION_STAMP:18.8.9`. On Linux x64, `bun install --frozen-lockfile` exits 0, and `bun run --cwd packages/electron prepare:agent-runtime` followed by `bun run --cwd packages/electron verify:agent-runtime` exits 0. On macOS, Windows and Linux arm64 hosts, the same install, staging and verification pass; when no host is reachable, record the exact stand-in and leave that result not run. The real builds and any registry or toolchain downloads require the maintainer's network permission; without it, record the task as blocked with the exact request rather than substituting registry artifacts.

**Done when**

- [ ] All six leaves are built from `c9de2b02` with the named Bazel targets; the source revision/archive hash, lock/toolchain pins, addon SHA-256 values and leaf-tarball SHA-256 values are recorded.
- [ ] `vendor/omp/c9de2b02/README.md` and `copy-manifest.json` describe all six leaves and keep the tarball bytes unchanged after packing.
- [ ] Root overrides and `bun.lock` resolve the six local tarballs; `bun install --frozen-lockfile` passes and no registry native package is selected.
- [ ] Linux x64 staging and `verify:agent-runtime` pass; non-Linux and arm64 results are recorded or their stand-ins are named explicitly.
- [ ] Any actual build or download used the maintainer's network permission, and the receipt names the host, toolchain and command.
