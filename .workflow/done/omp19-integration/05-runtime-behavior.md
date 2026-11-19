# 05: OMP 19 runtime behavior

**Effort:** omp19-integration
**Blocked by:** 04
**Covers:** W8
**Check:** native session/projection/warming suites and relevant ToolPart/subagent UI suites pass
**Base commit:** 593f4de1f66a4d5b37733d3d3dc427d604f7a0e8

- [x] Audit handoff/background compaction and cancellation against upstream.
- [x] Audit warming cap, browser policy/rendering and enable GUI intent tracing.
- [x] Cover task steps/progress/finished status and historical secret placeholders.
- [x] Record each adaptation or explicit no-op decision.

## Progress

No old-OMP compatibility layer, dependency additions or capability expansion.

Check after: full Agent Service suite passes 677 tests, 12 skipped, 0 failed. Focused native/projection/form/HTTP suites pass 126 tests; existing background compaction lifecycle tests cover completion, cancellation, skip and retry. A real service HTTP call reaches compact.abort; native dispatch/cancellation tests cover handoff options and control while compaction is pending. Affected UI suites pass 231 tests across 12 files, including browser ToolPart and subagent HUD/work-status. Receipts: `/home/ubuntu/omp19-artifacts/logs/stage2b-*`. Implementation is in `593f4de1f`; source decisions are in the spec.

Review: skipped — no fresh reviewer-subagent tool is available; required at effort close.
