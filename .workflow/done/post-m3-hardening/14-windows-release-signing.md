# 14: Require Windows signing for release builds

**Effort:** post-m3-hardening
**Task type:** feature
**Base commit:** 2928db64b08e535b309497186508923f77cb4c02
**Base branch:** post-m3-hardening/27-omp-vendor-runbook
**Started:** 2026-10-24T12:36:00+08:00
**Finished:** 2026-10-24T13:05:00+08:00

**Delivers:** Windows release jobs refuse to package without signing material, and the updater verifies update signatures; local and smoke builds can stay unsigned.

**Blocked by:** 11
**Files:** `packages/electron/scripts/package.mjs` (9-13); `packages/electron/package.json` (`verifyUpdateCodeSignature`, 122-124); `.github/workflows/release.yml` Windows job

**Read first:** `.workflow/specs/post-m3-hardening.md`; `/home/shizuku/Project/ohpichamber-omp-artifacts/post-m3-review-2026-10-23/``SurfacesReview.md` finding 4; `.agents/skills/desktop-shell/SKILL.md`; `.agents/skills/openchamber-change-discipline/references/updater-testing.md`
**Covers:** H8

**Check:** Running the release packaging step with no signing secret on a release ref exits non-zero with a clear message; the smoke path still packages unsigned; `verifyUpdateCodeSignature` is `true` for release builds.

## Done when

- [x] Asks spec open question 4 when starting; uses the secret names the maintainer gives. The maintainer chose PFX signing with `WINDOWS_CSC_LINK` (base64 PFX) and `WINDOWS_CSC_KEY_PASSWORD`.
- [x] The security pass runs on the updater trust boundary (performed inline; see `## Progress`).

## Progress

- Dirty at start: `packages/electron/scripts/prepare-agent-runtime.test.mjs` (inherited unstaged native test change; never staged or edited).
- Decision (2026-10-24): PFX signing. The Windows release job maps the repository secrets `WINDOWS_CSC_LINK` (base64 PFX content) and `WINDOWS_CSC_KEY_PASSWORD` to electron-builder's `CSC_LINK` and `CSC_KEY_PASSWORD`, and sets `OPENCHAMBER_REQUIRE_WINDOWS_SIGNING=1`. No certificate or secret value is invented or committed.
- Check before: the release packaging path built an unsigned Windows installer when no signing material was present, and `build.win.verifyUpdateCodeSignature` was `false`.
- Work: `packages/electron/scripts/package.mjs` now fails closed when the release flag is set and `CSC_LINK`/`CSC_KEY_PASSWORD` are missing (clear message naming the repository secrets, before electron-builder starts); it normalizes the `WINDOWS_CSC_*` aliases; on an unsigned local/smoke Windows build it disables signing and passes `--config.win.verifyUpdateCodeSignature=false` so the unsigned path still packages. `packages/electron/package.json` sets `build.win.verifyUpdateCodeSignature` to `true`. `.github/workflows/release.yml` maps the two exact secrets and the release flag only on the Windows packaging step.
- Check after: `node --check`, package.json JSON and release.yml YAML parse. Release path with the flag and no secrets exits 1 with `[electron] Windows release signing is required...` and never spawns the builder. Release path with dummy secrets reaches the builder stub as `bun x electron-builder --win --x64 --publish=never` (no unsigned override). Smoke/local path without the flag reaches the builder as `... --config.win.verifyUpdateCodeSignature=false` and logs the unsigned build. Receipts: `/home/shizuku/Project/ohpichamber-omp-artifacts/task14-2026-10-24/task14-focused-checks-final.log` and `task14-focused-checks.log`; builder-stub recheck in `task14-builder-path-recheck.log`.
- Review: the A/B/security review agents could not complete: both failed with provider `unknown certificate verification error` and produced no findings. The pass was performed inline using the loaded `workflow-reviewer` and security-pass guidance, and that limitation is recorded. Inline findings: (1) blocking, fixed — setting `verifyUpdateCodeSignature: true` alone would break unsigned smoke packaging because app-builder-lib derives and records `publisherName` from the signing certificate and throws without certificate info; the unsigned path now explicitly overrides the flag false, while signed release packaging leaves it true. (2) Security boundary closure: the two secrets appear only in the release Windows packaging step, are not logged (the error names the keys, not values) and are not uploaded; `package.mjs` passes them only in the child environment; `electron-updater` runs Authenticode verification against `publisherName` written from the signed certificate, and skips only when `publisherName` is absent (the unsigned smoke path sets the flag false). No new network, egress or privilege path was added.
- Limits: a real signed Windows package and a real update run were not executed (no Windows host, no certificate). The gate and unsigned path were exercised on Linux with a stub builder; the Authenticode/publisherName behavior remains to be proven by a signed Windows release build and a loopback update run per `updater-testing.md`.
- Next: coordinator landing; no main integration.
