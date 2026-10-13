# 11: Cut over the durable Host Gateway queue

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** c51efab064ce20378a0b9aed9a00b93556710578
**Base branch:** omp-through-m3/m1-integration
**Started:** 2026-10-12T20:48:32+00:00
**Finished:** 2026-10-13T21:31:53+00:00

**Delivers:** Host-owned SQLite prompt queue records canonical deliveries, survives Host/service restart, preserves per-session order, attachments and revisions, and exposes explicit storage/delivery failure without losing unrelated queues.

**Blocked by:** 09, 22
**Files:** `packages/web/server/lib/queue/`, host routes, migrations, queue tests and documentation

**Read first:** `.workflow/specs/omp-through-m3.md` M2/W5; architecture Host Gateway persistence and queue sections; existing queue owner and schema; agent contract job/session events
**Covers:** W5

**Check:** Run focused tests in the discovered queue owner with `node scripts/run-isolated-tests.mjs <queue-owner-directory>`, then a temporary Host/service restart scenario → enqueue/claim/ack/retry/fail/restart preserves attachments, revisions, order and idempotent delivery; outage or corrupt data never becomes authoritative empty success. Record concrete paths before implementation and remove temporary smoke code.

- [x] Keep SQLite persistence and queue authorization in the Host Gateway.
- [x] Store canonical session/job references without SDK objects or provider secrets.
- [x] Convert the existing atomic JSON queue explicitly, preserving captured attachments, revisions and valid unrelated records when conversion fails partially.
- [x] Make claim, acknowledgement, retry and terminal failure transitions atomic and observable.
- [x] Reconcile queue records with service restart and worker terminal state explicitly.
- [x] Preserve unrelated projects when one record is malformed or failed.

## Progress

Dirty at start: none in the fresh worktree based on landed task09. The actual inherited owner is `packages/web/server/lib/message-queue/runtime.js`, with routes in the same file and module documentation beside it. Main owns task11 integration. The first agent's inconsistent runtime replacement was discarded from this exact fresh base without reuse or verification; this was a failed edit, not a requirements blocker.

Continue with a bounded real Node SQLite storage owner under the existing message-queue module, then replace the runtime's legacy execution and queue records directly. Main owns integration with canonical service events/run admission and final actual-runtime proof. Host initialization/routes/shutdown retain their owning modules. Check before: existing persistence is atomic JSON and dispatch uses OpenCode; no canonical durable queue or lease/idempotency owner exists.

Surfaces: Web/PWA and Electron share the Host SQLite queue and single delivery owner; hosted mobile and Capacitor use their remote Host and run no local queue worker. Guest cannot obtain unrestricted queue mutation authority. VS Code remains retired. Task22 composes the public canonical gateway; task17 activates the sole OMP runtime.

Main implemented `sqlite-store.js` and `canonical-runtime.js` under the discovered owner. The store uses the existing Node Host database opener/lifecycle, canonical request/projection schemas, decimal revisions, atomic FIFO leases, durable append receipts and per-owner legacy conversion receipts. The dispatcher uses real private service requests and reconciles accepted claims through canonical live state/native history; uncertain lost-generation submissions are not automatically replayed.

The four new consumer-visible Node regressions pass (latest run 222 ms). Authored source/test oxlint passes. `/tmp/ohpi-m211-acceptance-receipt.json` records two separate Node Host processes, the actual built Bun service and pinned public SDK, with exactly two loopback provider requests after Host/service restart. The first Host exited after real acceptance and native persistence but before local acknowledgement; the second recovered that claim and delivered the remaining captured request. Queue revision reached `6`, native history retained two turns and both canonical attachment records, and no dispatch failure was reported. The initial smoke incorrectly expected non-image file bytes to be embedded in the prompt; the actual SDK path supplies a Host-resolved file reference. The corrected check proves that reference, retained bytes and canonical attachment history instead. Disposable source and private state are removed.

The pending integration and composed verification wait is fulfilled by task 22's composed acceptance receipt at `/home/shizuku/Project/ohpichamber-omp-artifacts/m222-composed-acceptance-receipt.json` (version 2, 99 assertions, 8 provider requests). That run verifies:
- Host-authorized SQLite queue routes (`/api/agent/v1/sessions/:sessionId/queue`) with strict 1 MiB JSON validation, durable append, decimal revisions, and idempotent replay;
- Stale CAS conflict rejection (`409 QUEUE_CONFLICT`);
- FIFO order and one delivery of the queued follow-up in the observed run;
- Real PNG attachment persistence, exact image bytes, and captured context preservation;
- Reopen durability across cold Bun restart with stable session history IDs;
- Failure isolation and corrupt sibling protection verified in route regressions (7 tests pass, 9 assertions).

The earlier recovered receipt `/home/shizuku/Project/ohpichamber-omp-artifacts/m211-acceptance-receipt-recovered.json` remains reused unchanged, providing the required two distinct Node Host lifetimes and unacknowledged claim recovery across restart (queue revision 3 to 6, 2 native turns, 2 provider requests, 0 dispatch failures).

Reviews and boundaries:
- `ReviewM2ClosureRequirements` confirmed that all unchanged evidence remains valid and that the sole authored-lint blocker is cleared.
- `ReviewM2FinalTrustDelta` passed with 0 findings on Host authorization, private credential boundaries, and storage safety.
- `ReviewArchiveProjectionDelta` passed with 0 semantic findings on session and archive persistence.

Limitations: Original dirty and base commit metadata are preserved; inherited queue legacy removal belongs to task 17 retirement; in-process Node restart is not claimed; M3 client activation remains deferred.

Review boundary: original base `c51efab064ce20378a0b9aed9a00b93556710578`, the committed SQLite queue owner/dispatcher, and Task 22's final authenticated composition. Requirements, source quality, and trust reviews pass; unchanged queue owner evidence is reused. Task 17 removes the remaining legacy execution lifecycle, not the already replaced queue owner.
