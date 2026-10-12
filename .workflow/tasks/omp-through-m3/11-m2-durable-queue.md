# 11: Cut over the durable Host Gateway queue

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** c51efab064ce20378a0b9aed9a00b93556710578
**Base branch:** omp-through-m3/m1-integration
**Started:** 2026-10-12T20:48:32+00:00
**Status:** active

**Delivers:** Host-owned SQLite prompt queue records canonical deliveries, survives Host/service restart, preserves per-session order, attachments and revisions, and exposes explicit storage/delivery failure without losing unrelated queues.

**Blocked by:** 09
**Files:** `packages/web/server/lib/queue/`, host routes, migrations, queue tests and documentation

**Read first:** `.workflow/specs/omp-through-m3.md` M2/W5; architecture Host Gateway persistence and queue sections; existing queue owner and schema; agent contract job/session events
**Covers:** W5

**Check:** Run focused tests in the discovered queue owner with `node scripts/run-isolated-tests.mjs <queue-owner-directory>`, then a temporary Host/service restart scenario → enqueue/claim/ack/retry/fail/restart preserves attachments, revisions, order and idempotent delivery; outage or corrupt data never becomes authoritative empty success. Record concrete paths before implementation and remove temporary smoke code.

- [ ] Keep SQLite persistence and queue authorization in the Host Gateway.
- [ ] Store canonical session/job references without SDK objects or provider secrets.
- [ ] Convert the existing atomic JSON queue explicitly, preserving captured attachments, revisions and valid unrelated records when conversion fails partially.
- [ ] Make claim, acknowledgement, retry and terminal failure transitions atomic and observable.
- [ ] Reconcile queue records with service restart and worker terminal state explicitly.
- [ ] Preserve unrelated projects when one record is malformed or failed.

## Progress

Dirty at start: none in the fresh worktree based on landed task09. The actual inherited owner is `packages/web/server/lib/message-queue/runtime.js`, with routes in the same file and module documentation beside it. Main owns task11 integration. The first agent's inconsistent runtime replacement was discarded from this exact fresh base without reuse or verification; this was a failed edit, not a requirements blocker.

Continue with a bounded real Node SQLite storage owner under the existing message-queue module, then replace the runtime's legacy execution and queue records directly. Main owns integration with canonical service events/run admission and final actual-runtime proof. Host initialization/routes/shutdown retain their owning modules. Check before: existing persistence is atomic JSON and dispatch uses OpenCode; no canonical durable queue or lease/idempotency owner exists.

Surfaces: Web/PWA and Electron share the Host SQLite queue and single delivery owner; hosted mobile and Capacitor use their remote Host and run no local queue worker. Guest cannot obtain unrestricted queue mutation authority. VS Code remains retired. Task22 composes the public canonical gateway; task17 activates the sole OMP runtime.

Main implemented `sqlite-store.js` and `canonical-runtime.js` under the discovered owner. The store uses the existing Node Host database opener/lifecycle, canonical request/projection schemas, decimal revisions, atomic FIFO leases, durable append receipts and per-owner legacy conversion receipts. The dispatcher uses real private service requests and reconciles accepted claims through canonical live state/native history; uncertain lost-generation submissions are not automatically replayed.

The four new consumer-visible Node regressions pass (latest run 222 ms). Authored source/test oxlint passes. `/tmp/ohpi-m211-acceptance-receipt.json` records two separate Node Host processes, the actual built Bun service and pinned public SDK, with exactly two loopback provider requests after Host/service restart. The first Host exited after real acceptance and native persistence but before local acknowledgement; the second recovered that claim and delivered the remaining captured request. Queue revision reached `6`, native history retained two turns and both canonical attachment records, and no dispatch failure was reported. The initial smoke incorrectly expected non-image file bytes to be embedded in the prompt; the actual SDK path supplies a Host-resolved file reference. The corrected check proves that reference, retained bytes and canonical attachment history instead. Disposable source and private state are removed.

Still active: compose canonical Host authorization/routes, real attachment conversion, accepted context receipts, service event subscription and retained server callers with task22. Remove the inherited queue owner at that coordinated cutover. Task11 is not archived and gate23 is not advanced. Root/workspace checks and independent reviews wait for the complete integrated boundary rather than repeating the unchanged baseline now.
