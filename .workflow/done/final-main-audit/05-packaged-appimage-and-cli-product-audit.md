# 05: Packaged Linux AppImage, standalone npm tarball, and zero-egress product audit

**Effort:** final-main-audit
**Blocked by:** None
**Covers:** W4
**Files:** `packages/electron/`, `packages/web/`, `scripts/`
**Read first:** `.workflow/specs/final-main-audit.md`; `packages/electron/README.md`; `packages/web/bin/lib/DOCUMENTATION.md`; `.workflow/specs/rebrand.md`
**Check:** build `OhPiChamber-1.0.0-linux-x86_64.AppImage` and `ohpichamber-1.0.0.tgz` + `ohpichamber-sdk-1.0.0.tgz`; run clean-HOME packaged desktop and CLI smoke suites with outbound `openchamber.dev` monitored/blocked → all checks exit 0, receipts and screenshots saved in `/home/shizuku/Project/ohpichamber-omp-artifacts/final-main-audit-2026-11-18/task05/PACKAGED-AUDIT.md`.
**Base commit:** cf8df4f03b90cf1a8e489553eaac6216bc2e3d47

## Progress
- Check after: AppImage `OhPiChamber-1.0.0-linux-x86_64.AppImage` sha256 `39fce0bd969ebb3bd882904dff1b165ef7b33404850e0a73805a1c75f4bfe55c`, `ohpichamber-1.0.0.tgz` sha256 `5bf898fdb1211c31e8c310753a944186de610385dce4258630022c690d1ae628`, `ohpichamber-sdk-1.0.0.tgz` sha256 `45c9b0ba070cbd489a4d22573a776e8e687a6a010e35d77428814d7971e9ec40`; clean-HOME packaged desktop and CLI smoke all PASS including real-provider chat (PONG completed, projection `duration` ReferenceError resolved), 0 `*.openchamber.dev` requests, SIGTERM clean exit; receipts in `/home/shizuku/Project/ohpichamber-omp-artifacts/final-main-audit-2026-11-18/task05/PACKAGED-AUDIT.md`, `runs/appimage-reverify/RECEIPT.md`, `runs/cli-reverify/RECEIPT.md`.
- Root causes: `projection.ts` `stepTiming` `duration` undefined; standalone tarball `ERR_MODULE_NOT_FOUND` from static `@openchamber/agent-contract` imports in `bin/lib` evaluated before `standalone-loader`; packaged runtime root/ASAR handling and standalone SDK staging.
- Review: pass (base cf8df4f03b)

- [x] Build `packages/agent-service`, `ohpichamber-1.0.0.tgz`, `ohpichamber-sdk-1.0.0.tgz`, and `OhPiChamber-1.0.0-linux-x86_64.AppImage`.
- [x] Install `ohpichamber-1.0.0.tgz` into a clean prefix under `/tmp`, verify `ohpichamber --version` (`1.0.0`), `ohpichamber --help` (`OhPiChamber` branding, no `update` command), and `ohpichamber serve` with isolated `HOME` (writes `<HOME>/.config/ohpichamber`, `/api/agent/v1/ready` returns 200, real-provider chat completes).
- [x] Launch `OhPiChamber-1.0.0-linux-x86_64.AppImage` with isolated `HOME`: verify window title & π icon, `<HOME>/.config/OhPiChamber` + `<HOME>/.config/ohpichamber` isolation, `ohpichamber://` protocol handler, Settings → About (`1.0.0`, `"Based on OpenChamber"` MIT credit, no canary/update-check controls), `app-update.yml` (`Shizuku-Yume/ohpichamber`), real-provider chat + terminal + git, clean child-process exit on quit, and zero requests to `*.openchamber.dev`.
- [x] Fix any defect discovered in packaged desktop or CLI execution and re-verify.
