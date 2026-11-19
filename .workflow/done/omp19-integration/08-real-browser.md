# 08: Verify OMP 19 in the development browser

**Effort:** omp19-integration
**Blocked by:** 07
**Covers:** W7, W8, W9
**Check:** `bun run dev` with isolated HOME/data/userData under `/tmp/ohpi-dev`; browser at localhost:5180 shows streaming then idle, todos, ask form answer round-trip, Bash result, task HUD progress, handoff compaction and Stop cancellation
**Base commit:** 14bc8ce25

- [x] Configure an OpenAI-compatible provider through the browser using bound test secrets, a /v1 endpoint, and only devin-swe-2 or gemini-3.5-flash-lite.
- [x] Exercise each requested behavior and capture screenshots under `/home/ubuntu/omp19-artifacts/screens/`.
- [x] Fix any demonstrated bugs on their owning boundaries, verify and commit locally.
- [x] Record pass/fail evidence and remaining limits in development.md.

## Progress

No push or main integration is authorized. The browser checks use the real Host Gateway and OMP workers, without mock provider responses.

Amended scope: real task execution exposed a completed child still spinning in the HUD. Subagent/BTW observations bypassed the sequence gate although the Agent Service increments the live head for them. Apply their sequence before dedicated-store updates; regress contiguous, duplicate, gap, wrong-epoch and empty batches. Web, Electron, hosted mobile and Capacitor share this reducer and Host stream; Guest execution and runtime boundaries stay unchanged. Keep the existing 33ms stream batching and avoid added recovery reads for contiguous observations.

Fixture: the short test transcript is below OMP's default 20000-token recent-history retention. Lower retention only in the isolated test profile for manual handoff/cancellation; production defaults stay unchanged.

Check after: isolated `bun run dev` and real devin-swe-2 requests pass all seven browser checks. Evidence in development.md and `/home/ubuntu/omp19-artifacts/screens/`: chat streaming/idle, todos, Ask form/returned green, Bash result, task HUD progress/completed icons, successful handoff (18461 -> 9961 tokens), active-run Stop/idle. Canonical snapshot after handoff is idle with compacting null. Root type-check passes through mobile after the fix; reducer tests 41 pass/0 fail and sync boundary tests 12 pass/0 fail. Existing stream batching is unchanged. No old browser automation remained running on resumption.

Review: skipped — no fresh reviewer-subagent tool is available; independent review remains required at effort close. Stop was exercised against an active run, not compaction cancellation. No push or main integration.
