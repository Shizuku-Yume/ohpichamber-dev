# 23: Verify the M2 service gate

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** b7929c61c9e9277a21f1a0c0384148f7d50d3e43
**Started:** 2026-10-13T21:42:16+00:00
**Finished:** 2026-10-13T21:48:00+00:00

**Delivers:** A disposable authenticated Host/Agent Service run proves the complete M2 service boundary before M3 client migration starts.

**Blocked by:** 11, 22
**Files:** `.workflow/development.md`, `.workflow/omp-migration/implementation-plan.md`, sanitized M2 acceptance evidence

**Read first:** `.workflow/specs/omp-through-m3.md` M2/W3-W6/W8; authoritative M2 gate; artifacts from tasks 08-12 and 22
**Covers:** W3, W4, W5, W6, W8

**Check:** One real disposable service scenario creates a temporary-workspace session, submits an attached prompt, observes ordered reasoning/tool/terminal events, aborts, reloads history, recovers snapshot/cursor, resolves competing approval/question replies, restarts workers, exercises durable queue and scoped Shell/catalog/completion. Close workers and prove no later publication or surviving owned descendants. Reuse focused evidence for unchanged edges. An unresolved required item keeps this gate unarchived.

- [x] Prove Host auth and internal auth separately, including denied scope and malformed input.
- [x] Verify stale request replies are rejected at the service boundary after restart, not inferred from killed fixture workers.
- [x] Prove queue attachment/order/revision durability across Host restart and failure isolation.
- [x] Prove Guest Shell running/ended reconnect snapshots, bounded output and cross-session ownership enforcement.
- [x] Verify sibling cwd/env isolation and the accepted worker resource target.
- [x] Record limitations and release task 13 only after required M2 evidence exists. This is not Web/Electron M3 acceptance.

## Progress

Dirty at start: the coordinator's pending stage-pointer/spec/dependency documentation only; no unrelated code. Tasks 11 and 22 are archived and landed in the recorded base. Check before: constituent runtime evidence is available; the aggregate M2 evidence mapping has not yet been closed. No completed scenarios are repeated.

### Verification and evidence mapping

All gate criteria map to exact receipts and passing reviews:

1. **Host and internal authentication, denied scope, and malformed input:**
   - Task 22 composed receipt `/home/shizuku/Project/ohpichamber-omp-artifacts/m222-composed-acceptance-receipt.json` (version 2): Host passwordless authentication, Host-resolved workspace scope, explicit Guest capability grant, outside-workspace write refusal, foreign session rejection, and service-off execution refusal. Authored canonical Host route suites cover authentication and malformed input separately.
   - Task 08 receipt `/tmp/ohpi-m208-acceptance-receipt.json` and task 12 receipt `/home/shizuku/Project/ohpichamber-omp-artifacts/m212-catalog-transcript-boundary-fixed-receipt.json`: loopback-only listener binding, internal secret injection, authentication refusal, and worker-private SDK objects.
   - `ReviewM2FinalTrustDelta` passed with 0 findings across Host auth, private credential resolution, and capability scopes.

2. **Stale request replies rejected at the service boundary after restart:**
   - Task 10 generation identity fixed receipt `/home/shizuku/Project/ohpichamber-omp-artifacts/m2-task10-generation-identity-fixed-receipt.json`: probe `worker-restart-expiry` passed at the service boundary with `oldReplyStatus: 410`, `oldActionExecutionCount: 0`, and `snapshotCollectiveExpiry: true`.
   - Task 10's archived record retains its passing interaction regressions. The composed receipt separately verifies `409 APPROVAL_CONFLICT` for a competing approval and `409 QUEUE_CONFLICT` for a stale queue command; neither substitutes for the actual restart-expiry probe above.

3. **Queue attachment, order, revision durability across restart, and failure isolation:**
   - Composed receipt `/home/shizuku/Project/ohpichamber-omp-artifacts/m222-composed-acceptance-receipt.json`: real PNG attachment, durable append revision and captured receipt, idempotent replay, stale CAS refusal, FIFO delivery, exact provider image bytes and captured context, plus stable session/history/metadata after cold Bun restart.
   - Task 11 recovered receipt `/home/shizuku/Project/ohpichamber-omp-artifacts/m211-acceptance-receipt-recovered.json`: two distinct Node Host processes across restart, recovery of accepted-but-unacknowledged claim, queue revision 3 to 6, 2 native turns, 0 failures, 2 provider requests.
   - Task 09 failure-isolation receipt `/tmp/ohpi-m209-failure-receipt.json`: structured 401 fails run without completion, keeps contiguous event sequence, and independent root completes.
   - Route regressions (`packages/web/server/lib/openchamber-sessions/routes.test.js`): 7 passing tests (9 assertions), including corrupt metadata sibling isolation and retained archive revision after unarchive.

4. **Guest Shell running/ended reconnect snapshots, bounded output, cross-session ownership, and no publication:**
   - Task 12 catalog/transcript receipt `/home/shizuku/Project/ohpichamber-omp-artifacts/m212-catalog-transcript-boundary-fixed-receipt.json`: checks `service-shell-output-stop-reconnect-utf8-retention-cross-owner-denial` (running and ended output, stop, reconnect, UTF-8 retention, cross-owner denial), `native-agent-bash-background-job-scopes-output-actual-stop-and-ended-retention` (background job scopes, output truncation, ended retention), `session-workspace-project-full-scope-aggregation-and-isolated-job-failure`, and `worker-restart-invalidates-old-shell-observations-preserves-sibling`.
   - Direct native Shell receipt `/home/shizuku/Project/ohpichamber-omp-artifacts/m212-shell-acceptance-receipt-recovered.json`: exit 42, 65,536 bounded bytes retained out of 70,007 bytes.
   - The composed receipt separately observes admitted PTY execution and real command output over its WebSocket. PTY replay is not substituted for the native Shell checks above. Stateless operations creating no native session files are not evidence of post-close publication behavior.

5. **Sibling cwd/env isolation, cleanup, and accepted worker resource target:**
   - Task 08 acceptance receipt `/tmp/ohpi-m208-acceptance-receipt.json`: three independent roots (two sharing a workspace) had distinct PIDs and separate cwd/env observations; internal secret absent from worker environments; killed root crashed while sibling stayed usable; after orderly stop, all observed owned child PIDs were gone.
   - Composed cleanup factual scope: final observed service PID 507093 confirmed absent via `ps` after graceful shutdown; `/tmp/m222-composed-proof.mjs` removed after retaining receipt. No fixture descendants cleanup is inferred beyond observed owned PID evidence.
   - Task 08 measured service RSS at 63,292 KiB and worker RSS at 381,612 KiB, 390,796 KiB, and 392,356 KiB. `decisions.md: 2026-10-11 - Accept measured worker memory as an M0 limitation` and the archived task's actual service measurements retain the failed original 100 MiB proposal; no passing SLO is claimed.

6. **Limitations and release of task 13:**
   - Linux service gate only: certifies backend Host/Agent Service integration; does not certify Web/Electron client UI migration, mobile, or Capacitor runtimes.
   - Inherited startup logs: startup still logs inherited preferences-write (`ENOENT`) and absent OpenCode binary errors (no clean-startup claim; full retirement belongs to task 17).
   - Provider and platform bounds: official-provider migration and OAuth remain unavailable/unsupported, accepted as limits; macOS/Windows platform parity not exercised; Docker live containment unverified.
   - Resource limits: the original 100 MiB idle RSS target remains failed per recorded decision; no new application SLO is claimed.
   - Node Host restart: proven across two distinct Node Host processes via Task 11 recovered receipt, not an in-process Node restart in the composed scenario.
   - With all M2 service boundary criteria verified by exact receipts and passing reviews (`ReviewM2ClosureRequirements` pass, `ReviewM2FinalTrustDelta` pass, `ReviewArchiveProjectionDelta` pass, `ReviewRecentProofRepairs` pass, `ReviewM2CatalogShellQuality` pass), M2 service gate 23 is verified. Task 13 (M3 canonical client) is released as the next implementation step; M3 client acceptance is not yet implemented.

Check after: all required M2 criteria have observed evidence. A mapping review caught one unsupported citation: absence of stateless transcript files does not prove post-close publication. Only that missing edge was run, using `node /tmp/m223-close-publication.mjs /home/shizuku/Project/ohpichamber-worktrees/m1-integration` (exit 0). Receipt `/home/shizuku/Project/ohpichamber-omp-artifacts/m223-worker-close-publication-receipt.json` records actual Host supervisor/Bun/native SDK admission, worker stop 204 while service stays live, `EPOCH_CHANGED` followed by SSE EOF, terminated worker PID 511041, unavailable snapshot with unchanged cursor through a finite 400 ms observation, stale-cursor 410, and stopped service. The scoped disposable authorization callback isolates this publication check; it is not new Host-policy certification. The initial harness omitted Host workspace registration and was refused 403; no product source was changed. The corrected driver was removed after proof.

Review boundary: recorded base `b7929c61c9e9277a21f1a0c0384148f7d50d3e43`, aggregate evidence from archived tasks 08–12 and 22, and the finite closure observation above; no executable source changed in this gate. Reused requirements review `ReviewM2ClosureRequirements` has its sole lint prerequisite cleared, source quality reviews cover the unchanged constituent owners, and `ReviewM2FinalTrustDelta` passes with 0 findings. Earlier source/failure/restart/provider/platform limitations remain unchanged. M3 client/surface acceptance is not passed here.
