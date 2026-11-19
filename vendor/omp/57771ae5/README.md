# Pinned OMP package inputs

These archives come from OMP revision `57771ae562b9345e0579bceb2d68d585e3e6927e`, verified against the npm SLSA provenance payload for `@oh-my-pi/pi-coding-agent@19.0.0` (GitHub release `v19.0.0`).

`copy-manifest.json` records the 14 repository-relative inputs (12 core archives and two patches), plus six official registry artifacts with URLs, SHA-512 integrity, SHA-256 and size. The artifact-set identity covers both lists. The 12 first-party archives include their licenses and native notices. Keep their bytes unchanged. Root package overrides select these local archives and exactly `19.0.0` for each native leaf. Installation and runtime resolution must not depend on the original source checkout or artifact custody directory.

`dependency-owners.json` records the application's version-scoped parent/dependency bindings and exact registry leaf overrides. Root `bun.lock` records the resolved graph and official SHA-512 integrity values; use `bun install --frozen-lockfile --ignore-scripts` for reproduction.

The retained `@ark/schema@0.56.2` and `puppeteer-core@25.3.0` patches and the explicit application SDK patch `@oh-my-pi/pi-coding-agent@vendor/omp/57771ae5/tarballs/oh-my-pi-pi-coding-agent-19.0.0.tgz` (`patches/@oh-my-pi%2Fpi-coding-agent@vendor%2Fomp%2F57771ae5%2Ftarballs%2Foh-my-pi-pi-coding-agent-19.0.0.tgz.patch`, committed with `bun patch --commit --ignore-scripts`) are applied through root `patchedDependencies`. All artifact bytes remain unchanged; this is an explicit installed-SDK source delta, not a new same-version source identity or M0 proof. The patch modifies only `src/sdk.ts`, `src/async/job-manager.ts` and `src/tools/bash.ts`:

- `CreateAgentSessionOptions` adds optional `initialModelRefreshStrategy?: ModelRefreshStrategy`, applied to the initial default-model discovery fallback only (`src/sdk.ts`).
- `AsyncJobManagerApi`/`AsyncJobManager` add optional `observeBashJobs`, `hasBashJobObservers` and `emitBashJobEvent` plus the `BashJobEvent` start/chunk/finish union, fenced off when no observer is attached (`src/async/job-manager.ts`).
- The managed bash job publisher emits start/chunk/finish observations when observers exist (`src/tools/bash.ts`).

Neither patch feature has an equivalent in the 19.0.0 SDK. Both are retained. The upstream lock still selects `@ark/schema@0.56.2` and `puppeteer-core@25.3.0`; the application retains its existing patches for those versions rather than adopting unrelated upstream Puppeteer patch changes.

The service's `src/sdk-assets.d.ts` copies the previous pin's asset declarations. Application API adaptation is deferred to stage 2.

## Reproducing this pin

This is the measured runbook recipe, not a claim of hermetic or two-build reproducibility. It needs network access to fetch the source archive and the locked third-party packages; use it only with the maintainer's permission. The pinned input is a SHA-addressed codeload archive without Git history, so the recorded revision and hashes are the identity.

**Verify identity first.** Revision `57771ae562b9345e0579bceb2d68d585e3e6927e`; source archive SHA-256 `221d34df86240a6fa91be790f8795fab014ddf72345fbad1861ddb1c26f196be`. Reject an archive whose hashes differ.

**Prerequisites.** Bun `1.4.4`, Node for the source scripts, a disposable copy of the source excluding `.git` and `node_modules`, and a fresh HOME/XDG/TMPDIR/cache root. Never mutate the retained source. `<RETAINED>` is an absolute artifact directory.

**Native addons in 19.0.0.** The source snapshot contains no prebuilt native binaries. This pin takes the official registry leaves for all six targets (`@oh-my-pi/pi-natives-*@19.0.0`), each with verified SLSA provenance attestation matching commit `57771ae562b9345e0579bceb2d68d585e3e6927e`, manifest target `os`/`cpu`, and exact archive SHA-256 digests matching `copy-manifest.json`. Every leaf addon is stamped `PI_NATIVES_VERSION_STAMP:19.0.0`. Linux x64 addons were used during CLI packing; application runtime readiness and the other five platforms are not certified by this vendoring stage.

The six official leaves are registry dependencies, not Git inputs. The Linux x64 archive is 112,967,819 bytes, exceeding GitHub's 100 MiB blob limit; this repository does not use Git LFS. Their exact versions and official SHA-512 digests remain locked, so this changes artifact transport, not native binary identity. Docker installs the target leaf from the registry. Electron staging copies installed dependencies and checks that the selected leaf version equals its exact root override; the verifier checks the staged closure, checksums, native imports and readiness without reading vendor leaf archives.

1. **Prepare the disposable source.**
   `bun install --frozen-lockfile --ignore-scripts --filter @oh-my-pi/pi-coding-agent --filter @oh-my-pi/collab-web --filter @oh-my-pi/omp-stats`
2. **Build and pack the 12 packages** into `<RETAINED>/tarballs`:
   `cd <SOURCE> && bun -e 'import { prepareNativeCorePackage, applyPublishBin } from "./scripts/ci-release-publish.ts"; await prepareNativeCorePackage("packages/natives", true); await applyPublishBin("packages/coding-agent", true);'`

   Then run this from each package directory in this order: `stats`, `omptype`, `agent`, `ai`, `catalog`, `mnemopi`, `natives`, `tui`, `utils`, `wire`, `snapcompact`, `coding-agent`:

   `cd <SOURCE>/packages/<name> && bun pm pack --destination <RETAINED>/tarballs --quiet`

   Before packing `coding-agent`, extract the verified host platform leaf's `.node` files into the disposable source's `packages/natives/native/`; CLI bundling loads the native module. Do this after packing the native core so the core archive does not embed host-only binaries.

   `coding-agent` is last because its prepack generates the export viewer, stats client embed and CLI bundle, then resets the stats placeholder.
3. **Check and copy.** Compare the 12 core tarballs' SHA-256 and size with `copy-manifest.json`, then place only those under `vendor/omp/<revision>/tarballs/`. Fetch native leaves into external build custody, verify their provenance, target metadata, version stamps and both digests against `registryArtifacts`, and do not add them to Git. The manifest's `files` covers the 12 core archives and the `@ark/schema` and `puppeteer-core` patch inputs. The application SDK patch is not part of that list.
4. **Reorder the consumer and lock.** Install the 12 first-party packages as explicit `file:` dependencies in `packages/agent-service/package.json`. Bind those local archives and the six exact registry versions as root `overrides`. Resolve `bun.lock` with a normal `bun install`; verify all six lockfile SHA-512 digests equal the official artifacts, then snapshot scoped overrides and registry pins into `dependency-owners.json` with the consumer lock SHA-256.
5. **Wire the application.** Root `patchedDependencies` keeps the two vendor patches and the application SDK patch keyed by the coding-agent tarball path. Docker copies only the core tarballs and patches; native leaves require registry access during installation.
6. **Verify.**
   - each manifest destination's SHA-256/size matches `copy-manifest.json`;
   - `bun install --frozen-lockfile` at the repository root (locked third-party packages need registry access; record the offline limit);
   - `bun run --cwd packages/agent-service type-check`, `build`, and `test` (the package script supplies `--timeout 15000`; plain `bun test` uses a shorter default that the credential-reopen tests exceed), and the packaged Desktop path: `prepare:agent-runtime`, `verify:agent-runtime`;
   - retain the new artifact set read-only (`0444` files, `0555` directories), record its artifact-set SHA-256, and keep the exact source/consumer lock and patch inputs.

## Bumping the pin

1. Obtain the new revision and archive with the maintainer's permission; record the revision, archive SHA-256, authored fingerprint, source lock SHA-256 and acquisition method.
2. Pick the native leaves: build from source on a target host or accept SLSA-attested official registry leaves for the targets you cannot build.
3. Rebuild the 12 packages, then write the new `copy-manifest.json` (revision, destinations, SHA-256/size, artifact-set identity) before copying or comparing anything; the old manifest covers the old pin only. Regenerate `dependency-owners.json` from the new resolved closure and replace the whole `vendor/omp/<revision>/` directory, including patches.
4. Migrate every application binding together: the 18 root `overrides` (12 archives plus six native leaves), the 12 explicit `file:` dependencies in `packages/agent-service/package.json`, both vendor patch paths plus the coding-agent SDK patch key in root `patchedDependencies`, and the version-scoped `@oh-my-pi/...@<version>>...` overrides recorded in `dependency-owners.json`. Then re-resolve `bun.lock`.
5. Rerun the checks above: the Agent Service suite, packaged-resource verification, plus Agent Runtime readiness. Record the exact revisions, hashes and any stand-in.
6. Update the spec/development record. Do not claim two-build reproducibility, an offline mirror or native source-build equivalence without a measured receipt.
