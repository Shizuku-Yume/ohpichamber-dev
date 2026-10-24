# 14: Require Windows signing for release builds

**Effort:** post-m3-hardening
**Task type:** feature
**Base commit:** 2928db64b08e535b309497186508923f77cb4c02
**Base branch:** post-m3-hardening/27-omp-vendor-runbook
**Started:** 2026-10-24T12:36:00+08:00
**Status:** blocked

**Delivers:** Windows release jobs refuse to package without signing material, and the updater verifies update signatures; local and smoke builds can stay unsigned.

**Blocked by:** 11
**Files:** `packages/electron/scripts/package.mjs` (9-13); `packages/electron/package.json` (`verifyUpdateCodeSignature`, 122-124); `.github/workflows/release.yml` Windows job

**Read first:** `.workflow/specs/post-m3-hardening.md`; `/home/shizuku/Project/ohpichamber-omp-artifacts/post-m3-review-2026-10-23/``SurfacesReview.md` finding 4; `.agents/skills/desktop-shell/SKILL.md`; `.agents/skills/openchamber-change-discipline/references/updater-testing.md`
**Covers:** H8

**Check:** Running the release packaging step with no signing secret on a release ref exits non-zero with a clear message; the smoke path still packages unsigned; `verifyUpdateCodeSignature` is `true` for release builds.

## Done when

- [ ] Asks spec open question 4 when starting; uses the secret names the maintainer gives.
- [ ] The security pass runs on the updater trust boundary.

## Progress

- Dirty at start: `packages/electron/scripts/prepare-agent-runtime.test.mjs` (inherited unstaged native test change; not staged).
- Check before: cannot run. The current release packaging path builds an unsigned Windows installer when no signing secret is present, and `build.win.verifyUpdateCodeSignature` is `false`.
- Work so far: inspected the actual signing configuration only. No code changed because the maintainer-owned signing route and secret names are absent.
- Next: resume after the maintainer answers spec open question 4.

## Blocked

- **Open question 4 (maintainer-owned):** choose the Windows code-signing route, the certificate/account identity, and the exact GitHub secret names. The task cannot implement fail-closed release packaging or set `verifyUpdateCodeSignature: true` honestly without them.
- Observed configuration on 2026-10-24 in this worktree: `packages/electron/package.json` `build.win.verifyUpdateCodeSignature` is `false`; there is no `forceCodeSigning`, `signAndEditExecutable`, `certificateFile`, `certificateSubjectName`, `signingHashAlgorithms` or `azureSignOptions`. `packages/electron/scripts/package.mjs:10-13` disables signing when both `CSC_LINK` and `WINDOWS_CSC_LINK` are unset and logs `[electron] Windows code signing disabled; building unsigned installer.` The Windows release and smoke jobs pass no Windows signing environment; the only signing secrets in `.github/workflows/release.yml` are the Apple certificate/notarization ones for macOS.
- **Decision needed:** the signing route (a PFX file through electron-builder's `CSC_LINK`/`WINDOWS_CSC_LINK` and its key-password secret, a cloud/HSM service such as Azure Trusted Signing, or another provider), the certificate/account identity, and the exact secret names. No certificate or secret name is invented here.
- **Why blocked:** the Check requires a release-ref packaging run to fail non-zero without signing material and `verifyUpdateCodeSignature` to be true for release builds. Both depend on the selected route and secret names; implementing a guess would falsely claim support for a signing mechanism the maintainer has not chosen.
- **Resume when:** the maintainer answers open question 4. Then implement fail-closed release packaging, keep local/smoke builds unsigned, set `verifyUpdateCodeSignature` true for release builds, and run the Check plus the updater-signature security pass.
