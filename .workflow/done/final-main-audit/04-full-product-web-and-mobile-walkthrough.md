# 04: Full-product runtime walkthrough across Web desktop and Mobile surfaces

**Effort:** final-main-audit
**Blocked by:** None
**Covers:** W3
**Files:** `packages/ui/`, `packages/web/`, `packages/agent-service/`
**Read first:** `.workflow/specs/final-main-audit.md`; `.workflow/standards.md`; `packages/ui/src/components/sections/PATTERNS.md`
**Check:** drive the built Web surface at 1600x1000 (`zh-CN` and `en`) and Mobile (`MobileApp` at 390x844) against a real provider with isolated `HOME` and `OPENCHAMBER_DATA_DIR`, capturing screenshots and console/network logs in `/home/shizuku/Project/ohpichamber-omp-artifacts/final-main-audit-2026-11-18/task04/WALKTHROUGH.md` → 0 uncaught page errors, 0 unhandled promise rejections, 0 unexpected 5xx responses, every surface verified or fixed and re-verified.
**Base commit:** cf8df4f03b90cf1a8e489553eaac6216bc2e3d47

- [x] **Core Chat & OMP Parity Walk (Web 1600 px `zh-CN` & `en`):** project onboarding, new session, live streaming chat + reasoning paragraphs, tool call cards, permission approval card + mode switch (`ask`/`auto`), `Plan` mode + plan review card, `Vibe` mode (`vibe_spawn` subagent HUD), `Goal` mode, effort picker, `/btw`, slash commands, todo tray, per-session cache warming toggle, compaction, session pin + unread + search + archive.
- [x] **Workbench Views Walk:** `Files` tree & preview, `Diff` viewer, `Git` status/commit/branches/worktrees, `Board` / tasks, `Terminal` PTY, `Skills` & `Plugins` & `MCP` views.
- [x] **All 30+ Settings Pages Visual & Interactive Walk (`zh-CN` at 1600 px):** screenshot and inspect every settings page from `General` through `Skills Catalog`, verifying control alignment, hug-width selects, dialogs, save feedback, search jump, and zero English leaks.
- [x] **Mobile Surface Walk (`MobileApp` at 390x844):** connection/auth gate, mobile session list, mobile composer (modes, effort, top trays), mobile workspace drawer (`Status`), and mobile settings pages.
- [x] Fix any bug or visual blemish found during the walk, add/update focused regression tests, and re-capture clean screenshots.

## Progress

- 2026-11-19: Retained walkthrough evidence re-measured from disk and indexed in `/home/shizuku/Project/ohpichamber-omp-artifacts/final-main-audit-2026-11-18/task04/WALKTHROUGH.md`.
- **v5/B** workbench (`zh-CN`+`en`, 21 surfaces × 2): `v5/B/REPORT.md`, `v5/B/receipts/` (44 JSON), `v5/B/shots/`; measured 42 PNGs all `1600x1000`, 0 duplicate-sha groups, verifier `VERDICT: PASS (0 failing checks)`.
- **v5/C** desktop settings `zh-CN`: `v5/C/REPORT.md`, `v5/C/receipts/` (53 JSON), `v5/C/shots/`, `v5/C/verify.out`; measured 49 PNGs all `1600x1000`, 0 duplicates, 49/49 receipts verify, `PROBLEMS: none`.
- **v5/D** mobile (`en`+`zh-CN`, 31/31 settings both locales): `v5/D/REPORT.md` + `v5/D/run/table.md`, `v5/D/receipts/` (98 JSON), `v5/D/shots/`; measured 97 PNGs all `390x844`, 0 duplicates, `settingsCoverage en 31/31 zh-CN 31/31`, 0 error entries.
- **v5/E** desktop settings `en`: `v5/E/REPORT.md`, `v5/E/receipts/` (57 JSON), `v5/E/shots/`; measured 52 PNGs all `1600x1000`, 0 duplicates, 0 error entries.
- **v6/A** chat+OMP parity at `9b3d46eae0`: `v6/A/REPORT.md`, `v6/A/receipts/` (68 JSON), `v6/A/shots/`, `v6/A/verify-out.json`; measured 53 PNGs all `1600x1000`, 0 duplicates, and 128 console / 58 5xx / 70 4xx error entries. Findings 1–5 recorded there map to fix commits `3b38874030`, `92a6821350`, `20db23c5a4`, `8ca4c7261c`, `0ad8f56b92`, each proven by a regression test, not a re-walk.
- **v6/D** mobile effort+chat+/btw at `9b3d46eae0`: `v6/D/REPORT.md` + `v6/D/run/table.md`, `v6/D/receipts/` (16 JSON), `v6/D/shots/`; measured 16 PNGs all `390x844`, 0 duplicates, 2/2 residual retired-id snapshot entries (finding 3, fixed by `20db23c5a4`).
- Across the six retained runs: 309 PNGs, 0 duplicate-sha256 groups, 0 page errors, 0 unhandled rejections.
- `v7/A..E` were started on `HEAD d899161743` (`dist` mtime 2026-11-19 17:26) and stopped mid-run at the maintainer's request: no shots and no receipts, recorded as non-evidence in `v7/INCOMPLETE.md`. Their servers (43041/43042/43044/43045) were proved scratch-scoped from `/proc/<pid>/environ` and stopped with `harness2/stop.sh`; no listener in 43040–43049 and no v7 process or Chrome profile remained.
- Check waived: final runtime re-walk of chat/workbench/settings/mobile on HEAD d899161743 (v7); maintainer-directed quick close, 2026-11-19
- Reduced gate, run serially on 2026-11-19 at gate logs under `/home/shizuku/Project/ohpichamber-omp-artifacts/final-main-audit-2026-11-18/task04/v7/gate/`: `bun run check` exit 0 (5/5 steps, 3861 files across 5 projects, drift clean); `bun run type-check` exit 1 with only the Task-01-owned agent-service errors `auto-title.ts:94` and `usage.ts:107,110,116`; `bun run lint` exit 1 with only the Task-01-owned `catalog-models.ts:908` and `workers.spare.test.ts:159` findings; `bun run dead-code` exit 0 (knip, no findings); `bun run docs:validate` exit 0 (696 pages, 58 sidebar links); `.workflow/bin/workflow validate` exit 0 (328 task files).
- Focused suites in that gate: packages/ui `bun test`, each file exit 0 — `session-message-loader` 46 pass, `session-rekey` 1 pass, `ChatInput.btw` 6 pass, `session-warming-sync` 5 pass, `useRouter` 9 pass, `useProviderLogo` 4 pass, `DefaultsSettings` 7 pass, `catalog-invalidation` 3 pass (81 pass, 0 fail); agent-service `bun test src/sessions src/supervisor` exit 1 with 165 pass / 1 fail, the fail being the Task-01-owned `workers.spare` "a refused refill does not retry from its own settle" (36 files, 1293 assertions); web `vitest run server/lib/walkthrough server/lib/git server/lib/host server/lib/openchamber-sessions` exit 0, 156 files 2620 pass / 5 skipped.
- The full `bun run test` aggregate was **not run** for this close-out, by instruction; earlier full-aggregate results and their known pre-existing failures are recorded in `WALKTHROUGH.md` and the task history.
- Review: waived — independent flow-verify BLOCKED at 9b3d46eae0 (B1-B3, I1-I7); code findings fixed in `8e05b33609`, `20db23c5a4`, `3b38874030`, `8ca4c7261c`, `92a6821350`, `0ad8f56b92`, `bad0d82ec5`, `16a258f864`, `d899161743`; B1/B3 are the runtime re-walk waived below; user, 2026-11-19.
