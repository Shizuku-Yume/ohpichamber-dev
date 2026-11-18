# 02: Audit and polish Host server, CLI, Electron, Mobile, SDK, and scripts

**Effort:** final-main-audit
**Task type:** refactor
**Blocked by:** None
**Covers:** W1
**Files:** `packages/web/**`; `packages/electron/**`; `packages/mobile/**`; `packages/sdk/**`; `packages/extensions/**`; `scripts/**`
**Read first:** `.workflow/specs/final-main-audit.md`; `AGENTS.md`; `.agents/skills/enterprise-boundary/SKILL.md`; `.agents/skills/desktop-shell/SKILL.md`; `.agents/skills/clack-cli-patterns/SKILL.md`; `.agents/skills/relay-transport/SKILL.md`
**Check:** `bunx oxlint packages/web/server/lib/host packages/web/server/lib/openchamber-sessions packages/web/server/lib/openchamber-control packages/electron packages/mobile/scripts packages/sdk/src && bun run --cwd packages/electron type-check && bun run --cwd packages/mobile type-check && bun run --cwd packages/sdk test && VITEST_MAX_WORKERS=2 bun run --cwd packages/web test && bun run --cwd packages/electron test` → all exit 0.
**Base commit:** cf8df4f03b90cf1a8e489553eaac6216bc2e3d47

## Progress

- [x] Audit fork-authored and fork-modified modules across `packages/web` (Host canonical routes, worker authorization channel, Gatekeeper, enterprise mode, MCP OAuth callback, CLI `ohpichamber`), `packages/electron` (IPC, deep links, updater, process cleanup), `packages/mobile`, `packages/sdk` (`ohpichamber-sdk`), `packages/extensions`, and `scripts/`: fix any `oxlint` / `anti-slop` violation, security gap, stale OpenCode/VS Code/`openchamber.dev` reference, or doc mismatch.
- [x] Verify `.workflow/upstream-deltas.tsv` (`bun run check`) stays green for any touched upstream-tracked file, and run web, electron, mobile, and SDK checks.

Check after:
- `/home/shizuku/Project/ohpichamber-omp-artifacts/final-main-audit-2026-11-18/task02/rework/check-oxlint.log` → exit 0, no diagnostics output.
- `/home/shizuku/Project/ohpichamber-omp-artifacts/final-main-audit-2026-11-18/task02/rework/check-oxlint-repo-config.log` → exit 0.
- `/home/shizuku/Project/ohpichamber-omp-artifacts/final-main-audit-2026-11-18/task02/rework/electron-type-check.log` → exit 0.
- `/home/shizuku/Project/ohpichamber-omp-artifacts/final-main-audit-2026-11-18/task02/rework/mobile-type-check.log` → exit 0, no-op.
- `/home/shizuku/Project/ohpichamber-omp-artifacts/final-main-audit-2026-11-18/task02/rework/sdk-test.log` → exit 0, 32/32 tests.
- `/home/shizuku/Project/ohpichamber-omp-artifacts/final-main-audit-2026-11-18/task02/rework/web-test.log` → exit 0, 525/534 files, 8522/8664 tests, 341 s.
- `/home/shizuku/Project/ohpichamber-omp-artifacts/final-main-audit-2026-11-18/task02/rework/electron-test.log` → exit 0, 69/69 tests.
- `/home/shizuku/Project/ohpichamber-omp-artifacts/final-main-audit-2026-11-18/task02/rework/anti-slop.log` → exit 1, 787 findings.
- `/home/shizuku/Project/ohpichamber-omp-artifacts/final-main-audit-2026-11-18/task02/rework/check.log` → exit 0, 5/5 steps.
- `/home/shizuku/Project/ohpichamber-omp-artifacts/final-main-audit-2026-11-18/task02/rework/workflow-validate.log` → exit 0, 328 files.
- Audit notes: `/home/shizuku/Project/ohpichamber-omp-artifacts/final-main-audit-2026-11-18/task02/{baseline-check.md,cli-real-path.md,electron-audit.md,electron-security-audit.md,mobile-sdk-audit.md,scripts-audit.md,server-stale-inventory.md}`.
- `scripts/tool-use-bench/` deletion rationale: commit `a4a8d19d2d` deleted `README.md`, `bench.mjs`, `cases.json`, and `fake-mcp.mjs` because the harness targeted OpenCode Code Mode (`~/.local/share/opencode/opencode.db`, OpenCode CLI binary, and retired `openchamber_memory` / `agent-tool` contracts) and was superseded by `scripts/model-bench/`; zero references remain in `package.json`, `knip.json`, or active code, and `.workflow/upstream-deltas.tsv` records all four files as `upstream-only` / `upstream-excluded`.
- Electron reconciliation: `electron-security-audit.md` and `electron-audit.md` reconciled against `packages/electron/` (`main.mjs:5757-5884` IPC handlers; `linux-relaunch.mjs` shell args; `early-startup.mjs`/`packaged-ui-routing.mjs`/`pairing-deep-link.mjs`/`updater-feed.mjs` setup). Electron shell `shell.openExternal` navigation finding (`main.mjs:2758, 2765, 3312, 3323`) fixed by `openExternalIfAllowed` helper (using `tryParseExternalUrl` scheme validation) and verified with `packages/electron/external-url-policy.test.mjs`. Settings-helpers `sanitizeShortcutOverrides` boundary-decode change confirmed.
- README proof: `packages/electron/README.md:470` (Bundled ripgrep) now says the binary is staged from `OPENCHAMBER_RIPGREP` then `rg` on `PATH` (`scripts/prepare-ripgrep.mjs:11-21, 34-38`, copied to `resources/ripgrep` at `:8`, build fails when none runs at `:68`/`:80-82`) and that the server resolves staged `resources/ripgrep`, then the optional `@vscode/ripgrep` package, then `PATH` (`packages/web/server/lib/fs/ripgrep.js:1-11, 36-67`, 501 at `packages/web/server/lib/fs/routes.js:1155-1156`); the reconciled `electron-security-audit.md` and `electron-audit.md` citations were re-verified line-by-line against current source and are recorded in `/home/shizuku/Project/ohpichamber-omp-artifacts/final-main-audit-2026-11-18/task02/rework/citation-check.txt`.
Review: pass (fresh flow-verify reviewer, third pass after two FAIL rounds whose findings were fixed; range cf8df4f03b90cf1a8e489553eaac6216bc2e3d47..HEAD plus the rework commit)

