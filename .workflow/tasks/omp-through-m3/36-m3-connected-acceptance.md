# 36: Run the connected Web/Electron W7-W10 acceptance packet

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** e1be47c36

**Delivers:** One current, non-duplicative connected acceptance packet proves the remaining M3 Web/Electron behavior and preserves exact receipts for every observed result.

**Blocked by:** 15, 17, 35
**Files:** `.workflow/omp-migration/m3/`, `.workflow/development.md`, `.workflow/tasks/omp-through-m3/36-m3-connected-acceptance.md`
**Read first:** `.workflow/specs/omp-through-m3.md` W7-W10; Tasks 15, 17, 32-35; package READMEs and runtime docs; the current acceptance records and receipt policy
**Covers:** W7, W8, W9, W10

**Change:**

- Start the actual Web and packaged Electron surfaces against the assembled Host Gateway and Agent Runtime.
- Run one connected scenario covering session create, stream, abort, reload/reopen, snapshot-plus-cursor recovery, stale-runtime protection, sidebar/catalog rendering, Board launch, Guest Shell interaction, and retained utility callers.
- Reuse unchanged W1-W6 evidence and Task 17 observations instead of repeating historical smoke. Re-run only scenarios invalidated by the final integrated source.
- Retain sanitized command output, exact artifact paths, environment identity, and provider/platform limitations. If a scenario fails, keep the task open and create the smallest owning implementation task; do not mask it with a fallback.

**Check:** The connected Web/Electron scenario plus the focused packaged runtime launch. Do not run the workspace-wide final suite here; Task 18 owns the post-assembly type-check, lint, build, test, dead-code, documentation, and workflow validation.

**Acceptance:**

- [ ] Web and packaged Electron both complete the applicable W7-W10 scenario steps.
- [ ] Receipts include exact artifact paths or explicitly state that no durable receipt was retained.
- [ ] W8 recovery proves no duplicate parts and stale prior-runtime data cannot mutate the selected runtime.
- [ ] W9 checks cover sidebar/catalog, Board, Guest, and retained utility paths without unrelated host-service changes.
- [ ] W10 records old-client reachability and lifecycle-owner findings from the assembled source.
## 2026-10-16 connected acceptance investigation

Investigation status: **blocked; no connected Web or packaged Electron success is claimed.** The repository documents the intended entrypoints (`bun run electron:dev:bundled` for bundled Electron development and `bun run electron:build` / `bun run --cwd packages/electron package` for packaging), but this investigation could not execute an actual connected scenario or retain launch output. The available shell execution route rejected the launch/check invocation before execution with `Service mode does not accept async or timeout`; therefore no Web/Electron process, authentication, session, or artifact receipt was observed. The durable blocker record is `.workflow/omp-migration/m3/task36-connected-acceptance-blocked.json` (receipt field: `none`).

Known source blockers remain those named by the task: Tasks 15, 17, 33, 34, and 35. Task 15 still records connected Board/Guest/sidebar observation and residual callers open; Task 17 records packaged Electron certification without OpenCode open; Task 18 records connected W7-W10 open and no connected-run receipt. No failure was masked with a fallback.
