# 05: Packaged Linux AppImage, standalone npm tarball, and zero-egress product audit

**Effort:** final-main-audit
**Blocked by:** None
**Covers:** W4
**Files:** `packages/electron/`, `packages/web/`, `scripts/`
**Read first:** `.workflow/specs/final-main-audit.md`; `packages/electron/README.md`; `packages/web/bin/lib/DOCUMENTATION.md`; `.workflow/specs/rebrand.md`
**Check:** build `OhPiChamber-1.0.0-linux-x86_64.AppImage` and `ohpichamber-1.0.0.tgz` + `ohpichamber-sdk-1.0.0.tgz`; run clean-HOME packaged desktop and CLI smoke suites with outbound `openchamber.dev` monitored/blocked → all checks exit 0, receipts and screenshots saved in `/home/shizuku/Project/ohpichamber-omp-artifacts/final-main-audit-2026-11-18/task05/PACKAGED-AUDIT.md`.
**Base commit:** cf8df4f03b90cf1a8e489553eaac6216bc2e3d47

## Progress
- Check after: rebuilt on integration `0bc47377f9` (`OhPiChamber-1.0.0-linux-x86_64.AppImage` sha256 `ac233a926643dcb90e99e0330b8ada372a84447a01efc8c83f46f1544ee6da4d`, `ohpichamber-1.0.0.tgz` sha256 `f5631c65cfd3e95ce82b12cadca164b69cd11b6937c0cf4e2317893e305f9ae6`, `ohpichamber-sdk-1.0.0.tgz` sha256 `45c9b0ba070cbd489a4d22573a776e8e687a6a010e35d77428814d7971e9ec40`, `sha256sum -c SHA256SUMS.txt` 3/3 OK exit 0); `node .../runs/appimage-reverify-r2/run-reverify-r2.mjs` exit 0 (`10/10` PASS, 0 `*.openchamber.dev` across 1160 CDP requests, SIGTERM 13->0 PIDs, real-provider PONG chat PASS); `node .../runs/cli-reverify-r2/run-cli-reverify-r2.mjs` exit 0 (`7/7` PASS across 633 CDP requests, 0 console errors, 0 pageerrors, 0 failed requests, 0 5xx, 0 `*.openchamber.dev`); `node --check packages/electron/main.mjs` exit 0; `bun run --cwd packages/electron type-check` exit 0; `bun run --cwd packages/electron test` exit 0 (`69/69`); `bun run check` exit 0 (`5/5` steps); `.workflow/bin/workflow validate` exit 0; `bun run docs:validate` exit 0 (`696` pages, `58` links). Receipts: `/home/shizuku/Project/ohpichamber-omp-artifacts/final-main-audit-2026-11-18/task05/PACKAGED-AUDIT.md`, `runs/appimage-reverify-r2/RECEIPT.md`, `runs/cli-reverify-r2/RECEIPT.md`, `screenshots/CLI-WEB-RECEIPT.md`, `artifacts/SHA256SUMS.txt`, `artifacts/METADATA.txt`, `artifacts/TARBALLS.txt`.
- Root causes: `projection.ts` `stepTiming` `duration` undefined; standalone tarball `ERR_MODULE_NOT_FOUND` from static `@openchamber/agent-contract` imports in `bin/lib` evaluated before `standalone-loader`; packaged runtime root/ASAR handling and standalone SDK staging; `CLI-WEB-RECEIPT.md` `Console errors: unknown` from `run-cli-reverify.mjs` reading nonexistent `uiAndChat.consoleErrors`.
- Review: pass (fresh flow-verify reviewer, base 0bc47377f9, tip 38d062c409; bun run check exit 0, workflow validate exit 0 [328 task files], sha256sum -c SHA256SUMS.txt 3/3 OK)

- [x] Build `packages/agent-service`, `ohpichamber-1.0.0.tgz`, `ohpichamber-sdk-1.0.0.tgz`, and `OhPiChamber-1.0.0-linux-x86_64.AppImage`.
- [x] Install `ohpichamber-1.0.0.tgz` into a clean prefix under `/tmp`, verify `ohpichamber --version` (`1.0.0`), `ohpichamber --help` (`OhPiChamber` branding, no `update` command), and `ohpichamber serve` with isolated `HOME` (writes `<HOME>/.config/ohpichamber`, `/api/agent/v1/ready` returns 200, real-provider chat completes).
- [x] Launch `OhPiChamber-1.0.0-linux-x86_64.AppImage` with isolated `HOME`: verify window title & π icon, `<HOME>/.config/OhPiChamber` + `<HOME>/.config/ohpichamber` isolation, `ohpichamber://` protocol handler, Settings → About (`1.0.0`, `"Based on OpenChamber"` MIT credit, no canary/update-check controls), `app-update.yml` (`Shizuku-Yume/ohpichamber`), real-provider chat + terminal + git, clean child-process exit on quit, and zero requests to `*.openchamber.dev`.
- [x] Fix any defect discovered in packaged desktop or CLI execution and re-verify.
