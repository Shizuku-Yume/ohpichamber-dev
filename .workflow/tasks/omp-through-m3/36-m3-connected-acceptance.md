# 36: Run the connected Web/Electron W7-W10 acceptance packet

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** e1be47c36

**Delivers:** One current, non-duplicative connected acceptance packet proves the remaining M3 Web/Electron behavior and preserves exact receipts for every observed result.

**Blocked by:** 44, 55
**Files:** `.workflow/omp-migration/m3/`, `.workflow/development.md`, `.workflow/tasks/omp-through-m3/36-m3-connected-acceptance.md`
**Read first:** `.workflow/specs/omp-through-m3.md` W7-W10; Tasks 15, 17, 32-35; package READMEs and runtime docs; the current acceptance records and receipt policy
**Covers:** W7, W8, W9, W10

**Change:**

- Start the actual Web and packaged Electron surfaces against the assembled Host Gateway and Agent Runtime.
- Run one connected scenario covering session create, stream, abort, reload/reopen, snapshot-plus-cursor recovery, stale-runtime protection, sidebar/catalog rendering, Board launch, Guest Shell interaction, Host filesystem directory-scoped moves, and retained utility callers.
- Reuse unchanged W1-W6 evidence and Task 17 observations instead of repeating historical smoke. Re-run only scenarios invalidated by the final integrated source.
- Retain sanitized command output, exact artifact paths, environment identity, and provider/platform limitations. If a scenario fails, keep the task open and create the smallest owning implementation task; do not mask it with a fallback.

**Check:** The connected Web/Electron scenario plus the focused packaged runtime launch. Do not run the workspace-wide final suite here; Task 18 owns the post-assembly type-check, lint, build, test, dead-code, documentation, and workflow validation.

**Acceptance:**

- [ ] Web and packaged Electron both complete the applicable W7-W10 scenario steps.
- [ ] Receipts include exact artifact paths or explicitly state that no durable receipt was retained.
- [ ] W8 recovery proves no duplicate parts and stale prior-runtime data cannot mutate the selected runtime.
- [ ] W9 checks cover sidebar/catalog, Board, Guest, and retained utility paths without unrelated host-service changes.
- [ ] W10 records old-client reachability and lifecycle-owner findings from the assembled source.
## 2026-10-16 connected acceptance investigation

Investigation status: **blocked; no connected Web or packaged Electron success is claimed.** The repository documents the intended entrypoints (`bun run electron:dev:bundled` for bundled Electron development and `bun run electron:build` / `bun run --cwd packages/electron package` for packaging), but this investigation could not execute an actual connected scenario or retain launch output. The available shell execution route rejected the launch/check invocation before execution with `Service mode does not accept async or timeout`; therefore no Web/Electron process, authentication, session, or artifact receipt was observed. The durable blocker record is `.workflow/omp-migration/m3/task36-connected-acceptance-blocked.json` (receipt field: `none`).

Known source blockers remain those named by the task: Tasks 15, 17, 33, 34, and 35. Task 15 still records connected Board/Guest/sidebar observation and residual callers open; Task 17 records packaged Electron certification without OpenCode open; Task 18 records connected W7-W10 open and no connected-run receipt. No failure was masked with a fallback.

## 2026-10-18 packaging and readiness continuation

Continuation status: **packaging and readiness evidence recorded; W7-W10 acceptance remains unpassed, and no M3 completion is claimed.** UI type-check exited 0; focused `configCatalogCache`, `useBtwStore`, `useConfigStore`, and `ModelControls` tests exited 0. Web start smoke on `127.0.0.1:3111` returned `GET /api/agent/v1/ready` 200 body `{ready:true,engine:omp,version:1.0.0}` and unauthenticated `GET /api/agent/v1/sessions` 401 Problem Details. `bun run electron:build` exited 0 and produced `packages/electron/dist/OpenChamber-2.2.0-linux-x86_64.AppImage`. Launching that AppImage under `xvfb-run` remained running beyond 20s and was terminated, with no connected UI/session receipt.

This is recorded as packaging and readiness evidence, not a W7-W10 pass. Existing blockers remain open and no M3 completion is claimed.

## 2026-10-18 connected acceptance harness audit (superseded tooling blocker)

Audit status: **tooling blocker conclusion superseded; connected acceptance remains sequenced after caller cutovers and Host composition retirement.**

A previous read-only audit noted that repository packages contain no internal Playwright or headless browser test runner, concluding this was an external blocker. That tooling-blocker conclusion is superseded: system and npm CLI tooling (`chrome-devtools` and `/usr/bin/google-chrome`) are available and capable of driving the authenticated Web surface.

The sequencing dependency remains in effect: connected acceptance (R6 / Task 36) executes after caller cutovers (Task 46 native agent selection, Task 47 message/tool helpers, Task 43 canonical mutation contracts, Task 48 managed chat directory admission) and Task 17/44 Host composition retirement.

## 2026-10-18 browser CLI discovery and pre-fix runtime observation

Continuation status: **pre-fix discovery recorded; W7–W10 acceptance remains unpassed, and no M3 completion is claimed.**

1. **Tooling availability:** `chrome-devtools` and `chrome-devtools-mcp` are installed at `/home/shizuku/.local/npm/bin`; `/usr/bin/google-chrome` exists; `chrome-devtools list_pages` succeeded against `page1 about:blank`.
2. **Isolated Web launch:** An isolated Web main launched on `127.0.0.1:3127` with `HOME=/tmp/ohpichamber-m3-connected-iO5GmA` and opened `page2`.
3. **Runtime observations:**
   - Real UI rendered in the browser.
   - `GET /auth/session` and canonical endpoints (`/api/agent/v1/sessions`, `/api/agent/v1/models`, `/api/agent/v1/providers`, `/api/agent/v1/agents`) returned `200`.
   - Legacy routes `/api/agent`, `/api/command`, `/api/integration`, and `/api/websearch/provider` returned `404`.
   - Browser driver execution revealed that primary send failed before canonical session creation due to `POST /api/fs/mkdir` returning `400` when no configured project exists (addressed by Task 48).
4. **Qualification:** This is pre-fix discovery against the existing dist build, not final acceptance or validated latest rebuilt source.

- Missing canonical contracts and browser harnesses are implementation work, not external blockers. Task43 defines native owners followed by implementation tasks; Task39's contract decision is resolved by Task46 and no longer blocks this packet. Current blockers are Tasks 15, 17, 18, 43, 44, 46, 47, and 48; no W7-W10 or M3 completion is claimed.

## 2026-10-20 source/acceptance sequencing

Task15 source cutovers are integrated, but their new regression tests have not run. Task36 now owns connected Board/Guest/sidebar/Host-filesystem observation and waits for Task17/44 source closure, not Task15 archive. Task39's contract decision is resolved by Task46 and does not block this packet; Task39 remains paused for archive after this connected evidence.

## 2026-10-20 connected Web run

Receipt: `.workflow/omp-migration/m3/task36-connected-web-2026-10-20.json`.

The rebuilt Web surface was launched on `127.0.0.1:3127` with an isolated HOME and a local deterministic OpenAI-compatible fixture at `127.0.0.1:4601`. The run observed canonical readiness `200` (`ready:true`, `engine:omp`), unauthenticated canonical sessions `401` (`UNAUTHORIZED`), Host health `200`, and the retired legacy routes `/api/agent`, `/api/command`, `/api/integration`, `/api/websearch/provider`, `/api/config/websearch`, and `/api/opencode/health` all `404`.

The authenticated composer configured and selected `m3fixture/stream-300cps`, created a canonical session, streamed the fixture response, and retained the user/assistant history after reload. A separate browser-authenticated canonical run against `m3fixture/think-30s` entered `running`, then `POST .../runs/:runId/abort` returned `200` with terminal `cancelled`. Host filesystem admission and directory-scoped move were exercised in the admitted Web project: mkdir/write/rename/read/delete returned `200`, the old path returned `404`, and the temporary directory was removed.

Board navigation opened the Issues and PRs surface, but no linked provider account or item was available. `/api/guests` returned `200` with zero registered guests, so Guest Shell interaction was not observable. Snapshot-plus-cursor stale-runtime rejection and packaged Electron acceptance remain unobserved. This is partial connected Web evidence, not a W7-W10 or M3 pass; Task44 and the Electron lane remain open.

## 2026-10-20 packaged Electron run

Receipt: `.workflow/omp-migration/m3/task36-packaged-electron-2026-10-20.json`.

The Linux x64 AppImage was packaged with `bun x electron-builder --publish never --x64`, launched under Xvfb, and rendered the `openchamber-ui://app/index.html` window. The packaged Host answered `/health` with `200`, `/api/agent/v1/ready` with `200` and `{ ready: true, engine: "omp", version: "1.0.0" }`, and unauthenticated canonical sessions with `401`.

The authenticated UI bootstrap did not pass. `/auth/session` returned `{ authenticated: true, disabled: true }`, but renderer requests to canonical sessions and workspace resolution returned `401`; the packaged UI displayed the session refresh failure and the model picker remained unavailable. Electron child processes were stopped and verified absent after the run. No packaged session create/stream/abort/reopen or W7-W10 pass is claimed; the remaining owner is the Electron `openchamber-ui://app` authenticated transport/bootstrap.
