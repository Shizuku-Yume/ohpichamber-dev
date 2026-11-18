# 05: Packaged Linux AppImage, standalone npm tarball, and zero-egress product audit

**Effort:** final-main-audit
**Blocked by:** None
**Covers:** W4
**Files:** `packages/electron/`, `packages/web/`, `scripts/`
**Read first:** `.workflow/specs/final-main-audit.md`; `packages/electron/README.md`; `packages/web/bin/lib/DOCUMENTATION.md`; `.workflow/specs/rebrand.md`
**Check:** build `OhPiChamber-1.0.0-linux-x86_64.AppImage` and `ohpichamber-1.0.0.tgz` + `ohpichamber-sdk-1.0.0.tgz`; run clean-HOME packaged desktop and CLI smoke suites with outbound `openchamber.dev` monitored/blocked → all checks exit 0, receipts and screenshots saved in `/home/shizuku/Project/ohpichamber-omp-artifacts/final-main-audit-2026-11-18/task05/PACKAGED-AUDIT.md`.

- [ ] Build `packages/agent-service`, `ohpichamber-1.0.0.tgz`, `ohpichamber-sdk-1.0.0.tgz`, and `OhPiChamber-1.0.0-linux-x86_64.AppImage`.
- [ ] Install `ohpichamber-1.0.0.tgz` into a clean prefix under `/tmp`, verify `ohpichamber --version` (`1.0.0`), `ohpichamber --help` (`OhPiChamber` branding, no `update` command), and `ohpichamber serve` with isolated `HOME` (writes `<HOME>/.config/ohpichamber`, `/api/agent/v1/ready` returns 200, real-provider chat completes).
- [ ] Launch `OhPiChamber-1.0.0-linux-x86_64.AppImage` with isolated `HOME`: verify window title & π icon, `<HOME>/.config/OhPiChamber` + `<HOME>/.config/ohpichamber` isolation, `ohpichamber://` protocol handler, Settings → About (`1.0.0`, `"Based on OpenChamber"` MIT credit, no canary/update-check controls), `app-update.yml` (`Shizuku-Yume/ohpichamber`), real-provider chat + terminal + git, clean child-process exit on quit, and zero requests to `*.openchamber.dev`.
- [ ] Fix any defect discovered in packaged desktop or CLI execution and re-verify.
