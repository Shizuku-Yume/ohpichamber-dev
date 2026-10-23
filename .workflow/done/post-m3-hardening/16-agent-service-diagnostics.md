# 16: Make Agent Service and worker diagnostics observable

**Effort:** post-m3-hardening
**Task type:** feature
**Base commit:** 24b19ddda
**Started:** 2026-10-23T14:29:00+08:00
**Finished:** 2026-10-23T15:25:00+08:00

**Delivers:** Worker and service stderr reaches a bounded, redacted Host log tagged with root session and worker generation, with a configurable level, and Runtime Status can show recent entries.

**Blocked by:** None
**Files:** `packages/agent-service/src/supervisor/workers.ts` (stdio at 279-280); `packages/agent-service/src/index.ts` (46); `packages/agent-service/src/supervisor/service.ts` (317); `packages/web/server/lib/host/agent-service-supervisor.js` (stderr handler at 248); the Runtime Status diagnostics owner

**Read first:** `.workflow/specs/post-m3-hardening.md`; `/home/shizuku/Project/ohpichamber-omp-artifacts/post-m3-review-2026-10-23/``PlanGapAnalysis.md` finding 11; `.agents/skills/performance-engineering/SKILL.md`
**Covers:** H11

**Check:** A worker that writes a sentinel line to stderr produces one log entry with its root session and generation; a sentinel secret in that line is redacted; the log stays within its size bound under a flood test. Real path: an MCP startup error appears in Runtime Status.

## Done when

- [x] No secret, token or prompt content is logged.
- [x] Logging is not on a per-event hot path without a bound.
- [x] Coordinate with 04 if both are in flight: same spawn code.

## Progress

Dirty at start: none.

Implementation:
- Workers accept only normalized JSON event classes (`openchamber.diagnostic` with a bounded code and level, `mcp.runtime.failure` with `error.code`); arbitrary stderr text, prompts and tool output are dropped. Worker initialization failures emit `Worker initialization failed (<ProblemCode>)`.
- The service applies its level filter and defensive redaction, then writes one JSON diagnostic line to its stderr. The Host parses that line, redacts again (Authorization/Bearer first, then quoted/space key-value values), keeps level/source/root/generation, and stores at most `maxDiagnostics` entries. Incoming chunks are capped before decoding; a 20/second rate cap coalesces a suppression count. The diagnostics level is forwarded in the service spawn environment.
- `/health` remains optional-auth and aggregate-only. Diagnostics are served by authenticated `GET /api/agent/v1/diagnostics`; no message text is public.
- Runtime Status (`packages/ui/src/lib/runtimeStatus.ts`, the command-palette "Show runtime status" dialog) fetches that endpoint and renders recent entries with level, source, root and generation. No new translatable copy or duplicate panel.

Check after:
- Worker diagnostics: 3 pass / 0 fail / 12 expects (warn level preserved; prompt sentinel dropped; MCP code normalized; init failure code).
- Host diagnostics: 1 pass — redaction of `Authorization: Bearer`, quoted/space values and sk- keys; 20 KB no-newline chunk; 2,000-line flood bounded by ring and rate cap; level forwarded in spawn env.
- Runtime Status formatter: 1 pass — an MCP startup failure renders with root and generation.
- Type-checks: `packages/ui` and `packages/agent-service` exit 0. oxlint: no new findings on changed files.
- Real path: managed-chat workspace with a failing stdio MCP server created a session → `MCP_APPLY_FAILED`; authenticated diagnostics returned exactly one entry `Worker initialization failed (MCP_APPLY_FAILED)` with root/generation; `/health` had no diagnostics; unauthenticated endpoint returned 401. Chrome DevTools opened the actual Runtime Status dialog and rendered the entry. Receipt: `/home/shizuku/Project/ohpichamber-omp-artifacts/post-m3-hardening-task04-2026-10-23/diagnostics-smoke.log`.
- Quality review completed: two nonblocking findings fixed — malformed diagnostics payload now reports unavailable, and a quiet burst flushes its suppressed count (a 1 s flush timer). Security review completed with no blocking findings; applied F1 (service redaction order matches Host), F2 (unstructured service stderr is recorded as a fixed message, not content), F4 (suppression summary respects the level floor). F3 (a worker can forge a diagnostic at its own identity) is accepted and bounded: no free text, fixed root/generation/source, ring-capped. F5 coverage gaps addressed with off-level and 20 KB worker-chunk tests; the authenticated-route 401 is covered by the real smoke receipt.
- Independent reviews completed with no blocking findings remaining; `/home/shizuku/Project/ohpichamber-omp-artifacts/post-m3-hardening-task04-2026-10-23/root-test-task16.log` records the full root gate `EXIT:0`. Task 16 landed at `4a7eb4975`; main evidence is recorded by `809f31670` in `.workflow/development.md`.
