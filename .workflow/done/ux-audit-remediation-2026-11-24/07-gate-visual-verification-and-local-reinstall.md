# 07: Gate — Full Validation, Real Isolated Runtime Visual Verification (10 Scenarios), Merge & Local Electron Reinstall

**Effort:** ux-audit-remediation-2026-11-24
**Blocked by:** 01, 02, 03, 04, 05, 06
**Covers:** W7

**Files:**
- `.workflow/specs/ux-audit-remediation-2026-11-24.md` (status -> `done`)
- `.workflow/done/ux-audit-remediation-2026-11-24/closeout.md`
- `.workflow/development.md`
- Artifacts directory: `/home/shizuku/Project/ohpichamber-omp-artifacts/ux-audit-remediation-2026-11-24/`

**Read first:**
- `.workflow/specs/ux-audit-remediation-2026-11-24.md`
- `.claude/skills/flow-verify/SKILL.md`
- `.claude/skills/flow-close/SKILL.md`
- `packages/ui/src/components/sections/PATTERNS.md`
- `packages/ui/src/lib/theme/STYLING.md`
- `.agents/skills/chrome-devtools-cli/SKILL.md`

**Check:** `bun run generate --check && bun run type-check && bun run lint && bun run dead-code && bun run docs:validate && VITEST_MAX_WORKERS=2 bun run test && .workflow/bin/workflow validate --no-color` plus real isolated-HOME Playwright visual acceptance screenshots covering all 10 scenarios, clean merge to `main`, and verified Linux Electron AppImage build + local reinstall.
- **Base commit:** e28578e3fc4a3b2bc7ad09c0edbdf658bd23a775

## Context

This is the final convergence and acceptance gate (`GATE_TASK=07`). Never mark this task done based solely on static checks or unit tests — EVERY ONE of the maintainer's 10 screenshot scenarios MUST be visually verified in a real running OhPiChamber instance (isolated `HOME` and `OPENCHAMBER_DATA_DIR`, NEVER modifying real `~/.omp` or `~/.config/ohpichamber`), compared directly against `PATTERNS.md`, `STYLING.md`, and upstream OpenChamber v2.8.0 (`30c70496a5`). If ANY visual, layout, localization, or runtime defect is found, reject via `rework` feedback back to the owning window (`01`–`06`) instead of hiding or deferring it!

## Checklist

- [x] **Step 1 — Full Static, Lint, Anti-Slop & Test Gates**:
  - Run `bun run --cwd packages/agent-contract build && bun run --cwd packages/agent-service build`.
  - Run `bun run generate --check`.
  - Run `bun run type-check` (includes all 5 repo guards + upstream-drift).
  - Run `bun run lint` AND `bunx oxlint` on all TypeScript/JavaScript files changed across `01`–`06` (zero errors).
  - Run `bun run dead-code` and inspect report (fix any dead code introduced by `01`–`06`).
  - Run `bun run docs:validate`.
  - Run `VITEST_MAX_WORKERS=2 bun run test`.
  - Save full command logs under `/home/shizuku/Project/ohpichamber-omp-artifacts/ux-audit-remediation-2026-11-24/task07/`.
- [x] **Step 2 — Real Isolated-HOME Runtime + Playwright Visual Acceptance (ALL 10 Scenarios)**:
  - Boot real OhPiChamber Web/Host + Agent Service against an **isolated temporary `HOME` and `OPENCHAMBER_DATA_DIR`** (e.g. `/tmp/uxfix-07-home`, copying NOTHING mutably from real `~/.omp`; seed a mock OpenAI-compatible provider + local marketplace + broken local marketplace source inside the isolated `HOME` only!).
  - Capture AND visually inspect screenshots (via `read` on each PNG!) in `zh-CN` (1600×1000 desktop AND 390×844 mobile) + `en` spot-checks, saving all screenshots + `LIVE-REPORT.md` to `/home/shizuku/Project/ohpichamber-omp-artifacts/ux-audit-remediation-2026-11-24/task07/`:
    1. **Usage (`用量`)**: `自动使用重置额度` disclosures (`Codex`, `Claude`) are **collapsed by default**; expanding shows auto-redeem switches + 3 clean rows.
    2. **Providers (`提供商`)**: edit a multi-protocol provider with compat/headers/discovery populated → human-readable protocol labels in Select & filter chips, clean 2-line model rows, expanding a model shows only 5 essential fields + folded sub-disclosures, and ALL provider advanced disclosures are collapsed by default!
    3. **Sessions (`会话`), Git, Memory, Agents, Tools**: ZERO ugly underlined `在模型角色中设置` jump links and ZERO raw `provider/model:thinking` strings; Memory hides/folds inactive backend sections.
    4. **Model Roles (`模型角色`)**: built-in roles + friendly resolved values & outline buttons for `web`/`speech` + **live end-to-end test creating a custom role (`reviewer`), reloading page to confirm persistence, and deleting it cleanly**!
    5. **Behavior (`行为`)**: click uncreated `RULES.md` and `SYSTEM.md` → ZERO red `此文件在目录中已不存在` error, clean ready-to-edit empty editor; type text and save → file created cleanly on disk!
    6. **OMP Plugins (`OMP 插件`)**: ZERO `OpenSSH Config` / SSH hosts / `内置默认` rules / dead `应用` button; open `管理来源` → add valid local marketplace, refresh, see plugin; test broken local marketplace source → localized actionable error (NO raw English `Native marketplace operation failed`) AND 1-click delete removes it cleanly!
    7. **OMP 19.1 Tools (Chat timeline)**: exercise `vibe_spawn`, `vibe_send`, `vibe_wait`, `vibe_list`, `vibe_kill`, `task`, `wait`, `yield`, `debug`, `github` → ZERO raw JSON input dumps, TV-wall worker screens rendered cleanly, `OpenSubtaskButton` works!
    8. **Subagents + Right Activity Rail + Side-by-Side Work Status**: sidebar shows real subagent/vibe names (NEVER `sonic`), Right Activity Rail shows `subagents` (`ai-agent`) icon automatically when subagents exist AND `chat` (`chat-4`) icon when opening a subagent/side chat, and opening `SubagentsPanel` keeps `WorkStatusPanel` visible side-by-side (`besidePanel`) matching upstream `30c70496a5`!
    9. **Zero console errors / zero uncaught page errors** across all visited pages!
  - If ANY visual/runtime defect is found, STOP and write a rework feedback file (`status: "rework"`, `targets: [...]`) so the orchestrator routes the fix to the owning window!
- [x] **Step 3 — Independent Code Review, Closeout, Merge to `main` & Local Electron AppImage Reinstall**:
  - Run an independent read-only `reviewer` check over the full integration diff against `main`.
  - Archive `07`, update `.workflow/specs/ux-audit-remediation-2026-11-24.md` (`Status: done`), write `.workflow/done/ux-audit-remediation-2026-11-24/closeout.md`, update `.workflow/development.md`, and verify `.workflow/bin/workflow validate --no-color` exits `0`.
  - Merge `ux-audit-remediation/integration` into `main` cleanly (`--no-edit`) under `/tmp/uxfix-integration.lock`.
  - Rebuild Linux Electron AppImage on `main` (using `OPENCHAMBER_RIPGREP` from `node_modules/.bun/@vscode+ripgrep-linux-x64@1.18.0/node_modules/@vscode/ripgrep-linux-x64/bin/rg` and Bun 1.4.5 from `~/.local/opt/ohpichamber/squashfs-root/resources/agent-runtime/bun`, running `build:web-assets`, `prepare:ripgrep`, `prepare:agent-runtime`, `verify:agent-runtime`, `bundle:main`, `rebuild:native`, `package.mjs`, `verify-linux-appimage.mjs`).
  - If OhPiChamber is NOT currently running (`! pgrep -f '/home/shizuku/.local/opt/ohpichamber/squashfs-root/ohpichamber'`), atomically install the new AppImage & extracted `squashfs-root` to `/home/shizuku/.local/opt/ohpichamber`, update `BUILD-COMMIT`, refresh icon & desktop db, and verify `git status --short` is clean! (If running, leave the verified AppImage at `packages/electron/dist/` and record the one-line install step in `closeout.md`.)

## Progress

- **Step 1 static gates** (logs `task07/01..08*.log`): `agent-contract`+`agent-service`
  build ✅; codegen staleness ✅ (after fix below); `type-check`/`check` ✅ 5/5;
  `lint` ✅ 0 err; `oxlint` (default cfg, changed files) ✅ 0 err; `dead-code`
  non-blocking, no new dead code; `docs:validate` ✅ 720/60; `test` EXIT=1 with
  two pre-existing/environmental flakes (see below).
- **Gate-time fixes I made** (committed on `uxfix/07`):
  - `scripts/generate-icon-sprite.mjs`: fixed a cross-file gap — icon-parameter
    helper call sites were only scanned in the file that *defined* the helper, so
    `queryTool`/`plainTool` (in `toolPresentation/helpers.ts`, called in
    `presentations.ts`) hid `menu-search` → dropped a live icon → TS2345. Now
    collects signatures globally then scans call sites per file; idempotent.
  - `packages/ui/src/components/icon/sprite.ts`: regenerated — dropped 7 dead
    icons, kept `menu-search`, added `wrench`.
  - `.workflow/upstream-deltas.tsv`: added 2 `fork-differs` rows
    (`useOpenChildSession.ts`, `layout/DOCUMENTATION.md`) under the 2026-11-24
    task-04 decision → upstream-drift clean.
- **Two environmental test flakes** (NOT windows-01-06 regressions; isolated
  reruns in `task07/08b-rerun.log`):
  - `scripts/perf/html-render-page-fit.browser.test.mjs` — assertion passes in
    832 ms; the `node --test` process then hangs on Chrome/CDP teardown (not CPU
    contention).
  - `server/lib/spaces/run-command.test.js` — passes 57/57 once the stale
    `/tmp/openchamber-stderr-V8q7qL` left by the earlier suite run is removed
    (test-env contamination).
- **Step 2 visual acceptance**: 9/9 scenarios PASS. Full evidence + per-scenario
  verdicts in `task07/LIVE-REPORT.md`; screenshots `task07/g-01..g-48`;
  machine-readable checks `task07/g-results.json`, `g-plugins-recheck.json`;
  `task07/rework-draft.md` records clean verdict (no rework).
- **Console-cleanliness note**: `pageErrors:[]`; the single
  `GET /api/agent/v1/sessions/<seeded-id>/tools` 404 is a harness-seeded session
  the live agent-service does not own — expected fixture 404, not product code.
- **Independent reviewer**: read-only reviewer over `git diff main...HEAD`
  reported **no blocking findings**.
- **Step 3 merge + AppImage**: pending this session.

Check after: `bun run generate --check` + `bun run type-check` (5/5) + `bun run lint`
 + `bunx oxlint` (0 err) + `bun run dead-code` (no new) + `bun run docs:validate`
(720/60) + `VITEST_MAX_WORKERS=2 bun run test` — all logs `task07/01..08*.log`;
9/9 visual scenarios PASS (`task07/LIVE-REPORT.md`, `task07/g-*.png`).
Review: pass (base a8d9bd6b8e) — independent read-only reviewer over
`git diff main...HEAD`: no blocking findings.
