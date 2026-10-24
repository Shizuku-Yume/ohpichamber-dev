# Pinned OMP package inputs

These archives come from OMP revision `c9de2b02b997f37cc89639282ed35dec86f139e8`, retained by task24. The matching registry version `18.8.9` is not an equivalent source identity.

`copy-manifest.json` records each repository-relative input, SHA-256 and size, with the immutable artifact-set identity. The 13 first-party archives include their licenses and native notices. Keep their bytes unchanged. Root package overrides select these local archives; installation and runtime resolution must not depend on the original source checkout or artifact custody directory.

`dependency-owners.json` records the 225 version-scoped parent/dependency bindings derived from task24's installed SDK consumer. They preserve the SDK closure without globally replacing application dependency versions. Root `bun.lock` records the resolved graph; use `bun install --frozen-lockfile --ignore-scripts` for reproduction.

The retained `@ark/schema@0.56.2` and `puppeteer-core@25.3.0` patches and the explicit application SDK patch `@oh-my-pi/pi-coding-agent@vendor/omp/c9de2b02/tarballs/oh-my-pi-pi-coding-agent-18.8.9.tgz` (`patches/@oh-my-pi%2Fpi-coding-agent@vendor%2Fomp%2Fc9de2b02%2Ftarballs%2Foh-my-pi-pi-coding-agent-18.8.9.tgz.patch`, committed with `bun patch --commit --ignore-scripts`) are applied through root `patchedDependencies`. The 13 tarball bytes remain unchanged; this is an explicit installed-SDK source delta, not a new same-version source identity or M0 proof. The patch modifies only `src/sdk.ts`, `src/async/job-manager.ts` and `src/tools/bash.ts`: `CreateAgentSessionOptions` adds optional `initialModelRefreshStrategy?: ModelRefreshStrategy` (applied at the `createAgentSessionScoped` line-3195 `resolveModelDiscoveryFallback` call with default `"online-if-uncached"` unchanged and later explicit `ModelRegistry` discovery untouched), `AsyncJobManager` exports `BashJobEvent` (`started` with `jobId` and private `sessionKey`; `chunk` with the raw executor string; `finished` with `exitCode`, `cancelled` and `timedOut`) and per-manager `observeBashJobs` subscription/unsubscribe without global monkey-patching or new factory child plumbing, and `BashTool` publishes unclipped executor chunks and raw terminal flags through that root-shared manager (including native child jobs) while canonical ended publication still awaits the native job promise. M0 evidence remains reusable only for unchanged SDK owners; the modified initial factory refresh fallback and native Bash paths must be re-proven in the mandatory M2 canonical HTTP scenarios. The Linux x64 native archive is included. Non-Linux native execution and equivalence to a native source build remain unverified.

The service's `src/sdk-assets.d.ts` copies the pinned source's asset declarations (`types/assets/index.d.ts`, SHA-256 `bf20c22cdf85a50009831eb6b8fb097286557ac6ba5bddd2c519aca26e51842e`). Its TypeScript configuration uses the SDK's ES2024/Bun settings; these declarations describe text imports, not a replacement SDK API.

## Reproducing this pin

This is the measured task-24 recipe, not a claim of hermetic or two-build reproducibility. It needs network access to fetch the source archive and the locked third-party packages; use it only with the maintainer's permission. The pinned input is a SHA-addressed codeload archive without Git history, so the recorded revision and hashes are the identity.

**Verify identity first.** Revision `c9de2b02b997f37cc89639282ed35dec86f139e8`; source archive SHA-256 `06b6a671af953f5cdefe95cbd44271a5c20d9b9e951173af7d10d71e1b0dc150`; authored fingerprint `3,499` files / SHA-256 `b70a2f4afd9fd8fa9ec20094e9658b528e943eff52608d296af2366b80241ad1`; source lock SHA-256 `fcd23297e0c05fb6fd9b6623a70823826fd99a6cc7ffca18201c95860fce66b3`. Reject an archive whose hashes differ. The matching registry version `18.8.9` is not this identity.

**Prerequisites.** Bun `1.4.2`, Node for the source scripts, a disposable copy of the source excluding `.git` and `node_modules`, and a fresh HOME/XDG/TMPDIR/cache root. Never mutate the retained source.

1. **Prepare the disposable source.**
   `bun install --frozen-lockfile --ignore-scripts --filter @oh-my-pi/pi-coding-agent --filter @oh-my-pi/collab-web --filter @oh-my-pi/omp-stats`
2. **Build and pack the 13 packages** into `<RETAINED>/tarballs`:
   - `bun --cwd=packages/natives run gen:npm --tag linux-x64`
   - `bun pm pack --destination <RETAINED>/tarballs --quiet` from `packages/natives/npm/linux-x64`
   - `bun -e 'import { prepareNativeCorePackage, applyPublishBin } from "./scripts/ci-release-publish.ts"; await prepareNativeCorePackage("packages/natives", true); await applyPublishBin("packages/coding-agent", true);'`
   - `bun pm pack ...` in `packages/stats`, `omptype`, `agent`, `ai`, `catalog`, `mnemopi`, `natives`, `tui`, `utils`, `wire`, `snapcompact`, and last `coding-agent`. The `coding-agent` prepack generates the tool views, stats client embed, docs index and CLI bundle, then resets the stats placeholder.
3. **Check and copy.** Compare every tarball's SHA-256 and size with `copy-manifest.json`, then place them under `vendor/omp/<revision>/tarballs/`. The manifest covers 15 files: the 13 tarballs and the `@ark/schema` and `puppeteer-core` patch inputs. The `@oh-my-pi/pi-coding-agent` patch under `patches/` is application-owned and is not part of that manifest.
4. **Recreate the consumer and lock.** Install the 12 first-party packages as explicit `file:` dependencies and bind all 13 artifacts as overrides; the Linux x64 leaf arrives through the core package's `optionalDependencies`. Seed the consumer lock from the pinned source lock, preserve its third-party records and patches, replace workspace and first-party package records with the local artifacts, and remove every `@workspace:` record and catalog metadata. A fresh registry-range install is not acceptable: it drifted on 45 entries before correction in task 24. `bun install --frozen-lockfile --ignore-scripts` must exit 0 without changing the seeded lock.
5. **Wire the application.** Root `package.json` overrides select the 13 local archives; root `patchedDependencies` keeps the two vendor patches and the application SDK patch keyed by the coding-agent tarball path. Update `dependency-owners.json` only from a new installed closure.
6. **Verify.**
   - each manifest destination's SHA-256/size matches `copy-manifest.json`;
   - `bun install --frozen-lockfile --ignore-scripts` at the repository root (locked third-party packages need registry access; record the offline limit);
   - `bun test src` in `packages/agent-service` (or `bun run test` for the full gate), and the packaged Desktop path: `prepare:agent-runtime`, `verify:agent-runtime`, then `verify:agent-runtime "<packaged resources>"` and `verify:linux-appimage` when packaging;
   - retain the new artifact set read-only (`0444` files, `0555` directories), record its artifact-set SHA-256, and keep the exact source/consumer lock and patch inputs.

## Bumping the pin

1. Obtain the new revision and archive with the maintainer's permission; record the revision, archive SHA-256, authored fingerprint, source lock SHA-256 and acquisition method (the GitHub API returned HTTP 403 for the current acquisition; the Atom feed plus codeload supplied the revision and archive).
2. Rebuild all 13 packages with the recipe above on a native target host. A new native leaf needs its target host and leaf source; Linux arm64 and the non-Linux leaves are task 29's scope (`29-vendor-native-leaves.md`).
3. Replace `vendor/omp/<revision>/`, update the root overrides and the coding-agent patch key/path, and re-resolve the lock. Update `dependency-owners.json` only if the installed closure changes.
4. Rerun the checks above: the Agent Service suite, the full root gate, packaged-resource verification and the Linux AppImage verification when packaging, plus Agent Runtime readiness. Record the exact revisions, hashes and any stand-in.
5. Update the spec/development record. Do not claim two-build reproducibility, an offline mirror or native source-build equivalence without a measured receipt.
