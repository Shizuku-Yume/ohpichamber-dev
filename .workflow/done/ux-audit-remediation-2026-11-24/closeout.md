# Closeout: ux-audit-remediation-2026-11-24

**Accepted:** 2026-11-25 by maintainer (autonomous gate task `07`; sign-off via the
recorded W-check evidence and 9/9 visual-acceptance pass)

## Shipped

All 7 tasks (`01`–`07`) are archived under `.workflow/done/ux-audit-remediation-2026-11-24/`.
The effort remediated the maintainer's reported UX regressions, unfinished OMP 19.1
adaptations, and the upstream OpenChamber v2.8.0 (`30c70496a5`) merge losses across
Settings, the workbench right rail / Work Status, subagent/vibe worker viewing, and
OMP tool rendering. `Status: done` set in `.workflow/specs/ux-audit-remediation-2026-11-24.md`.

### W-check mapping (`W1`–`W7`)

- **W1 (Usage & Model Roles):** Pass. Usage `自动使用重置额度` Codex/Claude
  disclosures collapsed by default (`codex/claudeExpandedBefore:false` → `true`
  on click); auto-redeem rows render cleanly. Sessions/Git/Memory/Agents/Tools
  show zero `在模型角色中设置` jump links and zero raw `provider/model:thinking`
  (`hasJumpLinkText:false`, `hasRawSelector:false` ×5). Custom role `reviewer`
  created → persisted after reload → deleted cleanly (`g-14`–`g-17`,
  `persistedReviewer`, `configGoneAfterDelete`). Evidence `task07/g-01..02`,
  `g-08..12`, `g-13..17`, `g-results.json`.
- **W2 (Provider Editing):** Pass. Human-readable protocol labels (`OpenAI Chat
  Completions`, `OpenAI Codex Responses`) in Select and model rows; 2-line model
  rows; expanded model shows 5 essential fields + 4 folded sub-disclosures; all 7
  advanced disclosures collapsed on open; lossless round-trip
  (`exactEqual:true`, `beforeLen=afterLen=2693`). Evidence `g-03..07`.
- **W3 (Behavior & OMP Plugins):** Pass. Uncreated `RULES.md`/`SYSTEM.md` open
  ready-to-edit with zero red missing-file error and autosave to real files at
  `/tmp/uxfix-07-project/.omp/`. Plugins show zero SSH/`内置默认`/`应用`; broken
  source reports localized actionable error (no raw `Native marketplace operation
  failed`) + 1-click delete; valid refresh shows `sample-plugin 1.2.0`.
  Evidence `g-18..27`, `g-plugins-recheck.json`.
- **W4 (Right Rail, Work Status & Subagent/Vibe Lifecycle):** Pass. `besidePanel`
  restored — Work Status + `SubagentsPanel` visible side-by-side
  (`workStatusVisibleBeside:1`, `subagentsPanelVisible:1`); rail `ai-agent`/`chat-4`
  icons; real subagent name `home-disk-usage-2` (`sonic` only as muted model
  descriptor; `sidebarHasBareSonic:false`); child-chat tab title survives reload.
  Evidence `g-31..35`.
- **W5 (All OMP 19.1 Tools):** Pass. 10 tools (`vibe_spawn`/`vibe_send`/
  `vibe_wait`/`vibe_list`/`vibe_kill`, `task`, `wait`, `debug`, `github`, `yield`)
  render structured cards with `rawJsonBlockquotes:[]` (zero raw JSON);
  `OpenSubtaskButton` opens the child chat. Evidence `g-28..30c`, `g-41` (mobile).
- **W6 (Polish & Guards):** Pass. `MemoryPage` hides inactive backend sections
  (`hasMnemopiOrHindsight:false` under `off`); upstream-drift ledger aligned
  (2 new `fork-differs` rows recorded under the task-04 decision);
  `docs:validate` 720/60.
- **W7 (End-to-End Gate & Local Reinstall):** Static gates — `generate --check`,
  `type-check`/`check` (5/5), `lint`, `oxlint` (0 err), `dead-code` (no new),
  `docs:validate` — all pass; `bun run test` EXIT=1 with two pre-existing
  environmental flakes verified non-regressions in isolated reruns. Real
  isolated-HOME Playwright acceptance: 9/9 scenarios PASS (`task07/LIVE-REPORT.md`,
  `task07/g-01..g-48`). Independent reviewer over `git diff main...HEAD`: no
  blocking findings. Merge to `main` + Linux Electron AppImage rebuild/reinstall:
  recorded in this session's Step 3 output.

## Key decisions & plan changes

- **Icon-sprite generator cross-file fix (gate-time):** `queryTool`/`plainTool`
  take the icon as a typed parameter but are defined in `toolPresentation/helpers.ts`
  and called in `presentations.ts`; the per-file call-site scan missed
  `menu-search` → dropped a live icon → TS2345. Refactored into a global
  signature pass + per-file call-site scan and regenerated `sprite.ts`
  (−7 dead icons, +`wrench`).
- **Upstream-drift ledger:** added `useOpenChildSession.ts` and
  `layout/DOCUMENTATION.md` `fork-differs` rows under the 2026-11-24 task-04
  decision so `check`/upstream-drift is clean.

## Waived checks & skipped reviews

None. `bun run test` reported two failures verified as pre-existing/environmental
(not windows-01-06 regressions): `scripts/perf/html-render-page-fit.browser.test.mjs`
(assertion passes in 832 ms; `node --test` hangs on Chrome/CDP teardown on this
host) and `server/lib/spaces/run-command.test.js` (passes 57/57 once the stale
`/tmp/openchamber-stderr-V8q7qL` left by the earlier suite run is removed — test-env
contamination). Evidence `task07/08-test.log`, `task07/08b-rerun.log`.

## Remaining debt & follow-ups

- Browser-perf test exits uncleanly on this host (Chrome/CDP teardown hang) —
  environmental, filed for perf tooling; not a product defect.
- Console-cleanliness: one `GET /api/agent/v1/sessions/<seeded-id>/tools` 404 is a
  harness-seeded session absent from the live agent-service — expected fixture
  fetch, `pageErrors` empty.
- Linux Electron AppImage rebuilt and **reinstalled**: OhPiChamber was not
  running, so the verified `OhPiChamber-1.0.0-linux-x86_64.AppImage` (Bun 1.4.5,
  123 Agent packages, 19 Host native modules) was atomically installed to
  `~/.local/opt/ohpichamber/` (AppImage + `squashfs-root`), `BUILD-COMMIT` set to
  `10ad866b1f`, icon/desktop DB refreshed; the extracted binary launches and
  loads `app.asar/dist-bundle/main.mjs` (display needed only for a full window).
