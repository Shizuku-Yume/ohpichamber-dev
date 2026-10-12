# 03: Record the M0 gate and implementation handoff

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** edfdf096316b92775b55410a532f61fa8aa62de9
**Started:** 2026-10-11T20:17:55+00:00
**Finished:** 2026-10-12
**Dirty at start:** 3,242 pre-existing assembled application, workflow, skill and documentation paths; all are excluded from this task except the named gate documents.

**Delivers:** A current M0 gate record states what is accepted for M1/M2, what remains explicitly deferred, and the exact source-backed handoff for implementation.

**Blocked by:** 02, 25, 26, 27, 28, 29, 30, 31
**Files:** `.workflow/development.md`, `.workflow/omp-migration/implementation-plan.md`, `.workflow/specs/omp-through-m3.md`

**Read first:** `.workflow/specs/omp-through-m3.md` W1; archived tasks 01/02/19/24 and evidence tasks 25-27; `.workflow/development.md`; migration scope, architecture and implementation-plan gates
**Covers:** W1

**Check:** `bun run docs:validate && .workflow/bin/workflow validate --no-color` plus an evidence-to-requirement review → docs pass and every required M0 item has observed evidence or a recorded maintainer decision. An unresolved required item means this task stays blocked and unarchived; completing a gate report alone cannot release tasks 04, 06 or 07.
## Progress

- Check before: `bun run docs:validate && .workflow/bin/workflow validate --no-color` passed before this gate review (`696` pages, `58` sidebar links, `37` workflow task files), but the evidence-to-requirement review was not complete, so the gate deliverable was not yet satisfied.
- The three reachable evidence investigations 25, 26 and 27 are now archived with their actual outcomes. Their artifacts retain failed, partial, unavailable and platform-limited behavior; none claims M0 or gate 03 passage.
### Evidence-to-requirement review

- W1 is observed across the pinned source-derived lifecycle, capability, Guest Shell, identity, installation, public-factory, MCP and Host PTY artifacts. Each retained invocation includes source/package/runtime identity, platform, timeout or exit, redaction and cleanup; task 25's receipt now records its command, private consumer cwd, 180-second timeout, Linux x64 platform and exit 0.
- W2 and W3 are observed by the lifecycle artifact: session creation, prompt/event sequence, terminal completion, history reload, branch/fork without workspace rollback, abort, disposal and subagent execution all passed. The raw fixture event vocabulary is not a Canonical Service contract.
- W4 is now observed for the installed public-factory slice: task 28's real `createAgentSession` run exercised full-factory built-in `write` approval/deny, built-in `bash` cancellation, and headless `bash` refusal, with requested/resolved events, side effects and cleanup. The earlier restart-pending fixtures still observed cleanup boundaries but no cross-worker request handle or stale-reply rejection. This remains SDK evidence, not a service-CAS result.
- W5 selects dedicated workers because all exercised shared-process cwd/environment modes failed. The original 100 MiB target remains failed; the measured Linux RSS limitation is explicitly maintainer-accepted. Non-Linux/macOS resource behavior remains unavailable. The maintainer removed task 30 as a mandatory release condition; no platform result is marked passed.
- W6 remains mixed. Task 29 completed a real approved-provider prompt through persisted, closed and cold-reopened SDK AuthStorage and the installed public factory; final corrected launch used inherited environment rather than secret-bearing argv. Official provider conversion/OAuth remains unavailable or unknown in the seven historical records. The maintainer explicitly accepted this as an M0 limitation for M1, preserving task-22/M2 real handoff and per-provider outcomes. Task 26 observed installed HTTP/SSE/config/schema/auth challenge/reconnect/close recovery, not remote OAuth or abrupt outage. Task 25 observed full-factory skill discovery/system prompt/public delivery; Composer acceptance remains task 15.
- W7 event order/fragment observations and W8 sanitized identity, timeout/exit and cleanup reporting are retained. Service-only cursor, CAS, restart-generation and stale-publication guarantees remain later service gates, not M0 fixture claims. `PROBE-05` is correctly M2-owned under `SCOPE-6.3`; it is not a missing M0 benchmark.
- Architecture risk review: `PROBE-01` failed shared-process isolation and selects dedicated workers; `PROBE-02` retains the failed target and accepted Linux limitation; `PROBE-03` passed; `PROBE-04` retains the observed approved-provider path and explicitly accepted official-provider/OAuth limitation; `PROBE-06` passed one real Linux Host PTY tab-close tree with the unrelated sibling preserved. No non-Linux or unexercised process class is marked passed. Tasks 25-29 are evidence investigations; gate acceptance is recorded separately.

### Final M0 handoff review

- Task 28 resolved the full-factory permission gap with real built-in approval, selector cancellation and headless refusal; task 29 resolved the approved test-provider stored-key execution gap. Both retain setup corrections and failed/unavailable boundaries.
- The maintainer accepted unavailable platform evidence outside the M0 release condition and accepted the remaining official-provider/OAuth limitation for entry into M1. The decisions are recorded under `2026-10-12 - Leave unavailable platform evidence outside the M0 release condition` and `2026-10-12 - Enter M1 with the observed provider path and explicit OAuth limitation`.
- M1 handoff is Host-owned extraction and VS Code extension retirement. Keep inherited execution lifecycle/proxy/config/auth until coordinated task 17; no OMP-shaped adapter or early SDK credential import. Task 05 preflight reports an absent service honestly; actual handoff remains task 22.
- M2 still needs service projector/cursor/CAS/queue/restart/Host Gatekeeper/resource and credential-handoff evidence. M3 still needs actual Canonical Client rendering, reconnect and old-owner retirement. No later gate is passed by this record.
- Task 29 is archived after security/requirements re-review and quality disposition; its measured receipt remains valid and disposable source was deleted without reuse. Earlier gate quality review passed. Its requirements review found one remaining blocker, online model discovery, and the maintainer selected task31 verification rather than a waiver.
- Task31 then observed one installed public-SDK GET with HTTP200, a cold idle/empty catalog becoming eight fresh nonstale records with matching private IDs and the approved model present, public AuthStorage close, worker exit0 and private-root removal. Requirements review passed and resolved the sole discovery blocker. Quality review passed after a nonblocking durable owned-path finding was fixed; the measured receipt remained valid. Pre-run security passed after the signal-cleanup correction. The disposable source was deleted without reuse and task31 archived.
- Unchanged earlier evidence/reviews remain reusable. The accepted provider/platform limits are release boundaries, not successful observations. M0 accepts the dedicated-worker handoff for M1; no M1 implementation, real service credential import, M2 gate or M3 client acceptance is claimed.
- Check after: `bun run docs:validate && .workflow/bin/workflow validate --no-color` passed (696 pages,58 sidebar links,41 workflow task files). Parsed artifact checks confirm one HTTP200 GET, matching eight-record publication, public auth close, worker exit/root removal, reviewed-source disposal and separate gate acceptance. The existing validator's Python positional-argument deprecation warnings are unrelated; no validator changes or old SDK suite rerun.




- [x] Compare every M0 implementation-plan item and architecture risk probe with current artifacts, task-02 corrections and tasks25-31 outcomes. Completed investigations do not turn failed/unavailable capabilities into accepted evidence.
- [x] Separate reachable M0 work from M5/platform or provider limits without silently dropping required M0 evidence.
- [x] Record the accepted worker architecture and its measured resource limitation.
- [x] Make M1 the next ready phase only after every M0 prerequisite is accepted, not merely documented.
- [x] Keep M0 blocked and do not release M1 until every required item is evidenced or explicitly decided by the maintainer.

