# 13: Clean up Agent Service process trees on macOS and Windows

**Effort:** post-m3-hardening
**Task type:** feature
**Base commit:** fd7b1968c
**Started:** 2026-10-23T20:10:00Z
**Status:** paused

**Delivers:** Stopping or timing out the Agent Service or a worker on macOS and Windows terminates its whole process tree, instead of failing closed.

**Blocked by:** 07
**Files:** `packages/web/server/lib/host/managed-process-registry.js` (33-38); `packages/web/server/lib/host/pidfd-terminator.js` (41-62); `packages/web/server/lib/host/agent-service-supervisor.js` (184-197); `packages/agent-service/src/supervisor/workers.ts` (spawn and stop)

**Read first:** `.workflow/specs/post-m3-hardening.md`; `/home/shizuku/Project/ohpichamber-omp-artifacts/post-m3-review-2026-10-23/``AgentServiceReview.md` findings 4, 7 and `PlanGapAnalysis.md` finding 3; task 07 `## Findings` (worker descendants); `.agents/skills/desktop-shell/SKILL.md`
**Covers:** H9

**Check:** A Linux regression proves that a worker's shell descendant is gone after stop; that check fails before the change if task 07 confirmed the leak. macOS (process group signaling) and Windows (`taskkill /T /F` or a Job Object) paths have unit tests for their command construction. Real macOS/Windows runs are recorded as not performed unless a machine is available.

## Done when

- [ ] Workers run in their own process group (POSIX) so stop can signal the group.
- [ ] The non-Linux fallback is implemented and its limits are documented next to the code.
- [ ] Unverified platforms are named explicitly in `## Progress` and in `development.md`.

## Progress

Task13 checkpoint on `post-m3-hardening/13-non-linux-process-cleanup`; C07 archive commit `83ec4d19b` reproduced the Linux grandchild leak and assigned this fix to Lane B.

Check after (checkpoint): the real Linux worker process-group regression passes with a SIGTERM-resistant `sleep 300` descendant and an unrelated sibling outside the group: 3 pass / 0 fail / 15 expects. Host PIDFD/registry/supervisor suite passed 26/26; agent-service type-check passed; `git diff --check` passed. macOS/Windows native runs remain unavailable; command/group construction is simulated in focused tests. Workflow validation remains blocked by the unrelated duplicate `Finished` field at `.workflow/done/post-m3-hardening/03-m3-gate-at-tip.md:43`.

The task remains paused pending a final package-level gate and coordinator landing; task18 remains deferred because Lane F task17 has no findings or measurement receipt.
