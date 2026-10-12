# 21: Verify the M1 extraction gate

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** 8189228142d37e3cb11a04f3c200f794ced87fb4
**Base branch:** omp-through-m3/m1-integration
**Started:** 2026-10-12T14:40:29+00:00
**Finished:** 2026-10-12T14:43:17+00:00

**Delivers:** Evidence proves retained extracted Host owners, no supported VS Code extension path, authenticated explicit credential preflight/absent-service refusal and durable Host metadata before Agent Service implementation. Actual migration results remain mandatory in task 22/M2 gate 23, not claimed by M1.

**Blocked by:** 05, 06, 20
**Files:** `.workflow/development.md`, `.workflow/omp-migration/implementation-plan.md`, focused M1 acceptance evidence

**Read first:** `.workflow/specs/omp-through-m3.md` M1/W2; tasks 04-06 and 20; revised authoritative M1 gate from task 02
**Covers:** W2

**Check:** One connected Host run exercises settings/themes/project, authenticated FS/Git/PTY and metadata restart; run `.workflow/bin/workflow validate --no-color`. Reuse task-local evidence for unchanged owners. Each required M1 item must be observed or explicitly accepted by the maintainer; an unresolved item keeps this gate task unarchived.

- [x] Verify extraction preserved behavior, not merely imports.
- [x] Prove extension package/build/release references are retired while external editor and theme import remain.
- [x] Verify authenticated explicit credential intent/preflight and absent-service refusal without secret reads/staging, Node SDK writes, fabricated imported results or startup credential import. Task 22/M2 gate 23 owns actual SDK write/read-reload and provider migration/re-authentication results before task 17 retirement.
- [x] Record that legacy agent execution removal is deliberately blocked on the coordinated M3 cutover, as established in task 02; do not claim deletion happened in M1.
- [x] Update development progress and only release task 07 when the revised M1 gate is met.

## Progress

Dirty at start: none beyond this coordinator's owned M1 changes. Task04 and task06 landed as `1a59130b5` and `247cdecdb`; health/preflight task05 and metadata task20 are archived and landed together as `818922814` because their reserved gateway composition is shared. The integration branch is `omp-through-m3/m1-integration`; the original dirty main worktree remains untouched.

Check before: the original gate lacked final metadata restart and retained Git/PTY/UI observations. Check after: task20's connected actual Node Host receipt `/tmp/ohpi-m1-metadata-receipt-560917.json` passed in 19.50 seconds. Two fresh Host processes retained SQLite operational state and conversion receipts without stale replay or transcript requests. Authenticated real Git/worktree/PTY and rendered Chrome folder/sidebar/archive paths passed; all owned listeners, children and private profiles were removed. Reuse task04's unchanged authentication/settings/themes/PWA/project/FS disk proof, task05's signed-cookie/password/internal/origin/enterprise preflight refusal proof with zero legacy credential calls, and task06's actual retained Web/Electron editor/theme evidence. No old test, build, runtime or security suite was repeated to satisfy this gate.

Readiness is Host-owned and truthful: absent Agent Service remains unavailable and credential preflight reads/stages no secrets or claims an import. Real SDK credential handoff remains task22/gate23. OpenCode execution lifecycle/proxy/config/auth owners remain intentionally reachable until the coordinated M3 cutover; M1 does not claim engine retirement. M0 accepted provider/platform limits, unverified Web OS URI dispatch and container/platform certification remain explicit.

Independent source requirements/quality/security reviews for tasks04/05/06/20 are reused. The final task20 requirements pass withdrew three findings that had mistakenly cited the dirty main baseline. Gate21's independent evidence-only Brief A and docs-only Brief B both passed with zero findings; no new source or trust-boundary behavior was added. Workflow validation passed for 41 task files after task05/20 archive; run it once more after this gate's archive. Sanitized receipts/screenshots stay outside the repository; disposable scenario scripts were removed.

