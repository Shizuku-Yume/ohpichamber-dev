# 36: Run the connected Web/Electron W7-W10 acceptance packet

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** e1be47c36
**Finished:** 2026-10-21T02:06:49+08:00

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

- [x] Web and packaged Electron both complete the applicable W7-W10 scenario steps. Web steps pass; packaged Board new-session draft was confirmed on a fresh isolated launch after the earlier CDP timeout was not reproduced.
- [x] Receipts include exact artifact paths or explicitly state that no durable receipt was retained. New receipt `.workflow/omp-migration/m3/task36-connected-acceptance-2026-10-21.json` records the Web run, artifact hashes and the packaged gap; Task55/62 and recovery receipts are cited.
- [x] W8 recovery proves no duplicate parts and stale prior-runtime data cannot mutate the selected runtime. Web stream reload had 0 duplicate part IDs; the recovery receipt records mid-run disconnect/epoch resync; an old cursor after worker restart returned 410 `RESYNC_REQUIRED`.
- [x] W9 checks cover sidebar/catalog, Board, Guest, and retained utility paths without unrelated host-service changes. Web sidebar/catalog, real GitHub Board #5304 draft, installed test guest panel and Host generate all passed; packaged Board draft now passes on a fresh launch.
- [x] W10 records old-client reachability and lifecycle-owner findings from the assembled source. Production searches for `opencodeClient`, `@opencode/client`, `@opencode/schema`, `lib/opencode/*`, and old lifecycle/proxy/config/auth composition names returned 0 matches.

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

The first launch reproduced an authentication failure: `/auth/session` returned `{ authenticated: true, disabled: true }`, but canonical sessions and workspace resolution returned `401`. Task55 repaired packaged local credential bootstrap. The subsequent auth-scope AppImage (`71f97b41b9e4b2615556d04fb33ec32f8dab89ebfeee23610b95ed1264711935`; not the final artifact) returned renderer sessions and workspace resolution `200`, reused its single desktop client after restart, and withheld the local credential from the remote-runtime target. The receipt retains the initial failure and the repaired observations.

The same package then configured the fixture provider through supported canonical workspace configuration and credential APIs. Actual composer submission created and streamed `m3fixture/stream-300cps`; reload retained two messages and their text parts without duplicates. A separate composer submission to `m3fixture/think-30s` reached a running canonical run, but no Stop control rendered. Authenticated canonical abort returned `200`, cancelled the run and turn, and cleared `activeRun`; reload retained the prompt and two messages without duplicates. This proves composer create/stream/reload and API cancellation on that auth-scope package, not UI abort; the Stop control was restored later and verified on the 2026-10-21 final rebundle. One snapshot `503` and a roughly two-second empty session-detail response immediately after reload settled correctly; they are retained observations, not a recovery pass.

Board, Guest Shell, snapshot-plus-cursor recovery and stale-runtime protection remain open; no W7-W10 pass is claimed.

The final UI-proofed artifact is AppImage `0a1886923e2549bf6058ff4847a02d7f0f542698f374a6cd18b9168e7cf9bddd` (606,838,429 B, built 00:52), bundling Web index `42170a97…` and Agent Service `2f025477…`/`90f6bf5e…`. Its final2 proofs reran only one operation card for an edit, the Commands delete modal (PASS), and ask completion plus reload (completed; message-level retry remains unproven). Keyboard abort, attachment upload/download, cold start, the OMP label, and other settings were not rerun on it; those packaged observations remain historical evidence from the superseded `7b7f99ee…` artifact. After Task44's Host commit `cacbaf042`, the current on-disk AppImage is the Task55 rebundle `598bf5823785ccf5b3f36d4e49bb950638e77b3eff35a5b3fc7b3e3259eabad9` (606,838,421 B, built 01:35), whose receipt records packaged auth plus Stop/Escape cancellation; it did not rerun the final2 UI proofs. Task44 closed after the pidfd correction (see `.workflow/done/omp-through-m3/44-host-composition-retirement.md` and task44 receipt).

## 2026-10-21 connected acceptance run

Receipt: `.workflow/omp-migration/m3/task36-connected-acceptance-2026-10-21.json`.

Reused unchanged W1-W6, Task55 packaged auth/session/Stop/keyboard, Task62 Web/packaged Stop evidence, the recovery receipt for mid-run disconnect/epoch resync, and the connected-web receipt for Host filesystem moves. Current Web dist index `42170a97…`; current packaged artifact `598bf58…`.

Web run on `127.0.0.1:3160` with an isolated HOME and fixture `127.0.0.1:4601`: readiness `200` (`ready:true`, `engine:omp`), unauthenticated sessions `401`, workspace resolve `200`, fixture catalog `m3fixture/stream-300cps|think-30s|agent-20tools-300cps`, session stream completed with 2 snapshot/2 history messages and 0 duplicate part IDs after reload. A long stream run was interrupted by killing its worker; the old cursor `8824092e…:1` was rejected with HTTP `410 RESYNC_REQUIRED` after the new epoch `f2791ad4…` (headSequence 0), while a prior recovery receipt already records real mid-run disconnect and epoch-gap resync without duplicate parts. Board activated the real GitHub CLI account, listed real `openchamber/openchamber` issues/pulls, selected `#5304`, and opened a new-session draft in `ohpi-task36-board-repo` (master) with the linked issue chip. A locally installed test guest (`task36-guest`) served its panel and Host `/generate` returned fixture text through the small-model caller; sidebar/catalog rendered the project, sessions and fixture models. Production-source searches found 0 old-client, old lifecycle/proxy/config/auth composition, or retained execution-module composition imports.

Packaged Electron run under Xvfb with the final AppImage reused Task55/62 auth, session stream/reload, Stop click and Escape cancellation. Real GitHub Board items and the installed test guest panel/generate also passed. Gap: selecting Board "Attach to session" -> "New session" made the packaged renderer stop responding to CDP `Runtime.evaluate`/screenshot for ~30s; the page target remained listed, Host readiness stayed `200`, and no main-log exception appeared. No Board draft was observed on packaged Electron.

## 2026-10-21 packaged Board reproduction follow-up

The earlier packaged Board gap was retested once on the same final AppImage `598bf58…` with a fresh isolated HOME, a local git repo whose `origin` was the real `openchamber/openchamber` upstream, Xvfb `:88`, packaged CDP `9240`, and packaged Host `57123`. The real GitHub CLI account was activated, real issue `#5304` was selected, and the exact `Attach to session` -> `New session` transition was dispatched. The CDP event client was closed immediately after dispatch; two independent fresh CDP clients then probed the page.

Post-click evidence: `Runtime.evaluate` returned `6` and `8`; `Page.getFrameTree` returned the app frame; `Page.captureScreenshot` returned 129,428 base64 characters (97,071-byte PNG) showing the new-session draft with project `ohpi-t36-repro-board`, branch `master`, linked `#5304` chip and composer. DOM text matched the draft. Renderer pid `133939` remained alive in state `R`, 28 threads, 472,896 kB RSS, with 27 CPU ticks over a ~2.6 s sample (8.6% `ps` average over 1:20). Host `/health` and `/api/agent/v1/ready` stayed `200`; the main log had no click-time exception (only the pre-existing Gtk scale-factor assertion and unrelated GitHub `/user/emails` 404s). Artifacts: `t36-repro-result.json`, `t36-repro-setup.json`, and `t36-repro-after-cdp.png` under `/home/shizuku/.cache/ohpi-acceptance/evidence-electron/`.

The earlier ~30 s timeout was not reproduced. It is therefore not accepted as evidence of a persistent packaged Board failure. The prior harness/client state was not retained, so a CDP-client timeout cannot be distinguished from a transient renderer pause; no product bugfix or product regression test was created. If the harness needs one, the smallest guard is a fresh-client post-click `Runtime.evaluate` plus draft-DOM assertion, but that tests acceptance tooling rather than product behavior.

Task36 W7-W10 acceptance is met; the task is closed. No M3 gate claim is made and Task18 remains the final gate. Cleanup stopped Web Host, Chrome, packaged app, packaged CDP, Xvfb and fixture; ports `3160/9232/9233/4601/57123/9240` closed and temporary repos/HOMEs were removed.
