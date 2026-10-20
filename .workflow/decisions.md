# Decisions

Every choice that mattered, with the option it beat. Newest last.

This file exists so the same argument is not had twice. A decision recorded here
is settled. The file is strictly append-only: to reverse or reopen a decision,
append a new entry that cites the old one. The one exception is below. Git merges
it with the union driver (`.gitattributes`), so parallel branches can each append.

## Why the runner-up is required

A decision recorded without the alternative it beat will be reopened next session:
the reader cannot see why the obvious option was rejected.

Draft entries during `flow-grill`, while the options are fresh. Write the strongest
honest case for each alternative. If writing "Instead of" feels like inventing a
strawman, that option was never real; find the real one, or accept the decision was
obvious and doesn't need logging.

## Format

This is the only copy of the format; other documents point here. Each entry is a
level-2 heading `## <YYYY-MM-DD> - <title>` under `## Entries`. Subsections (`###`),
fenced code blocks and comments are not entries. Cite an entry by its heading text:
`decisions.md: <date> - <title>`.

Every entry has all five fields, none empty:

- **Decided:** what was chosen
- **Instead of:** the real alternative that was seriously considered
- **Because:** the constraint, measurement, or reasoning that eliminated it
- **Mine:** yes if an agent decided, no if the user decided
- **Revisit when:** the observation that would make this wrong

Optional fields:

- **Effort:** the effort slug this decision belongs to. Find one effort's entries
  with `grep -n 'Effort:\*\* <slug>' .workflow/decisions.md`. Omit it when the
  decision is not tied to one effort.
- **Supersedes:** the heading of the entry this one reverses. The only edit allowed
  to an old entry is then appending one line to it: `**Superseded by:** <new
  heading>`. An entry with `Superseded by` is history: follow the pointer before
  acting on it.

```markdown
## 2026-01-31 - Retries capped at 3, no backoff

- **Decided:** three immediate retries, then fail.
- **Instead of:** exponential backoff with jitter.
- **Because:** the only caller retries within a single user request; a 30-second
  backoff would outlive the request it is serving.
- **Mine:** no (asked the user).
- **Revisit when:** a background job starts calling this.
```

Field names stay in English for `workflow validate`; their content can be in any
language.

`Mine` shows which calls came from an agent: still real decisions, but ones the
user may overturn on sight. `Revisit when` of "never" is allowed but suspicious;
`flow-close` reads it for every entry of the effort it closes.

## Entries

## 2026-10-10 - Workflow owns development routing and records

- **Decided:** use `.workflow` as the default conversation process and home for development records, migration design and inherited sandbox design.
- **Instead of:** leaving development material under `docs` with workflow as an optional appended entrypoint.
- **Because:** the maintainer requested one workflow for future conversations and development documentation. Product/operational guides and module contracts retain their separate owners.
- **Mine:** no
- **Revisit when:** the maintainer changes the development process or a document's audience changes.
- **Effort:** workflow-alignment

## 2026-10-10 - Latest upstream first then restore the fork

- **Decided:** make the latest upstream repository the next code baseline, preserve and restore OhPiChamber customization, then re-audit project/migration documents before OMP implementation. This conversation changes documentation and queues the effort for a new conversation; application source is not updated now. After the refreshed baseline is verified, remove obsolete application-version statements from project documents rather than leaving hard-coded old-baseline labels.
- **Instead of:** preserving the old 1.x runtime and selectively importing features, deferring runtime-bound additions until OMP, or replacing the fork wholesale and discarding its investigations.
- **Because:** the maintainer wants the current upstream repository as the starting point, not a permanently old fork with individually backported features. Earlier research remains useful but must be checked against the new source.
- **Mine:** no
- **Revisit when:** the maintainer changes the baseline strategy or a verified preservation conflict needs a product decision.
- **Effort:** upstream-rebaseline

## 2026-10-11 - Guest bridge uses a private early bootstrap

- **Decided:** use an SDK-owned early bootstrap script with a private per-document `MessageChannel` for Web/PWA and Electron Guests. The host sends the normal SDK port over that private channel; direct and relay HTML share the same bootstrap source.
- **Instead of:** create an isolated guest-serving origin and gate capability transfer on origin equality.
- **Because:** the maintainer selected reuse of the existing direct/relay HTML rewriting with minimal changes and no new deployment boundary; the private port authenticates the current bootstrapped document without a URL-readable nonce, and iframe `load` is not document authentication.
- **Mine:** no
- **Revisit when:** either Guest loader cannot keep replacement documents from obtaining a new SDK port, the CSP fail-closed contract cannot be maintained, or deployment requirements change enough to justify an isolated guest origin.
- **Effort:** upstream-rebaseline

## 2026-10-11 - Rebaseline task closes at source and document boundary

- **Decided:** close upstream-rebaseline task 02 after coherent source adoption, fork restoration, source-level verification, and documentation adaptation; keep connected W3 certification as an explicit follow-up boundary rather than expanding this task.
- **Instead of:** keeping task 02 open until authenticated Board actions, live Docker/native/provider checks, packaged updater behavior, and every platform review are available.
- **Because:** the maintainer clarified that this task is the repository update and document adaptation, not a full cross-platform certification effort; the unavailable runtime checks are already recorded without fabricated success.
- **Mine:** no
- **Revisit when:** the maintainer starts the separately scoped W3 runtime-certification effort or changes the acceptance boundary.
- **Effort:** upstream-rebaseline

## 2026-10-11 - Accept measured worker memory as an M0 limitation

- **Decided:** retain the dedicated-worker isolation direction and accept the observed Linux fixture idle RSS of 270,200,832 and 274,202,624 bytes as a known M0 resource limitation. The original 100 MiB probe remains failed; it is not a hard prerequisite for advancing after the other M0 requirements pass. Measure the actual service footprint and cleanup in M2.
- **Instead of:** retaining 100 MiB as a hard M0 gate and requiring a measured SDK worker memory reduction before M1.
- **Because:** the maintainer explicitly accepted the observed cost rather than blocking the migration on that hypothesis. Shared-process cwd/env isolation failed, so removing process isolation is not an accepted memory optimization.
- **Mine:** no
- **Revisit when:** the real service measurements or expected concurrent-session workload show unacceptable memory pressure, or another supported platform differs materially.
- **Effort:** omp-through-m3

## 2026-10-11 - Continue from the assembled migration baseline

- **Decided:** use the current assembled application source and existing M0/workflow files as migration input, preserving a separate local baseline where isolated worktrees need it. Subsequent task commits contain only task-owned changes; unrelated pre-existing changes remain untouched and no push is authorized.
- **Instead of:** allowing only new independent evidence files and refusing to modify any existing uncommitted migration source.
- **Because:** the maintainer explicitly authorized continuing this assembled migration baseline. The old HEAD predates the assembled source and cannot provide correct inputs to independent implementation worktrees.
- **Mine:** no
- **Revisit when:** ownership of a specific pre-existing change conflicts with a migration task or the maintainer changes the baseline boundary.
- **Effort:** omp-through-m3

## 2026-10-12 - Keep provider and platform evidence as M0 prerequisites

- **Decided:** run one bounded provider/OAuth evidence investigation against the operator-managed approved environment without retaining secrets, and require actual non-Linux/macOS worker-resource evidence before releasing M0; keep gate 03 closed while either result is missing or unresolved.
- **Instead of:** accepting the Linux-only worker measurement and the unresolved stored-format/OAuth records as sufficient to begin M1.
- **Because:** task 28 closed the reachable full-factory permission gap, but it did not answer provider conversion feasibility or cross-platform resource behavior. The maintainer explicitly requires those boundaries to be measured or retained as blockers rather than relabeled as later work.
- **Mine:** no
- **Revisit when:** the bounded provider/OAuth probe records an outcome for each supported format and actual non-Linux/macOS worker runs record resource results, or the maintainer changes the support and acceptance scope.
- **Effort:** omp-through-m3
- **Superseded by:** 2026-10-12 - Leave unavailable platform evidence outside the M0 release condition

## 2026-10-12 - Leave unavailable platform evidence outside the M0 release condition

- **Decided:** task 30 no longer requires a passing non-Linux/macOS run before M1. Keep the missing platform measurements explicitly unverified and stop unavailable-runner work. Retain the bounded approved-provider task 29 and its actual provider/OAuth outcomes for the gate review; this platform waiver alone does not turn unavailable provider evidence into a pass.
- **Instead of:** keeping M0 blocked on access to a real macOS/Windows runner.
- **Because:** the maintainer explicitly said to drop the mandatory task-30 pass when it cannot be verified and enter M1 promptly. This changes the release condition, not the observed platform status or retained support matrix.
- **Mine:** no
- **Revisit when:** a real target-platform runner is available or platform certification becomes required for a retained release surface.
- **Effort:** omp-through-m3
- **Supersedes:** 2026-10-12 - Keep provider and platform evidence as M0 prerequisites

## 2026-10-12 - Enter M1 with the observed provider path and explicit OAuth limitation

- **Decided:** accept the real approved-provider stored API-key path as the measured M0 provider boundary and enter M1 after the bounded investigation is reviewed. Keep official provider conversion, OAuth refresh/scopes and account-selection behavior unverified rather than reporting success. Actual credential handoff and per-provider unsupported/re-authentication outcomes remain mandatory at task 22 and M2 gate 23.
- **Instead of:** keeping M0 blocked until unavailable official-provider/OAuth credentials can be supplied and exercised.
- **Because:** the approved test provider completed through persisted, closed and cold-reopened AuthStorage plus the installed public factory. The maintainer explicitly accepted the remaining provider limitation and selected entry into M1; Host extraction and extension retirement do not perform SDK credential migration.
- **Mine:** no
- **Revisit when:** official provider/OAuth credentials become available, or real service credential handoff requires a provider behavior not yet established.
- **Effort:** omp-through-m3

## 2026-10-13 - Remove the M2 queue and consumer acceptance cycle

- **Decided:** unblock task 22 on tasks 10 and 12 (`Blocked by: 10, 12`) so server-consumer composition builds directly on task 11's already-committed `sqlite-store.js` and `canonical-runtime.js` source, pause task 11 with `Blocked by: 09, 22` for its final composed queue verification after task 22 lands, and require both tasks 11 and 22 at M2 gate 23 (`Blocked by: 11, 22`). No tasks are deleted or renumbered, and W1–W10 acceptance criteria and product scope are unchanged.
- **Instead of:** keeping task 22 formally blocked on task 11 while task 11's Progress keeps task 11 open until task 22 composes public Host routes, attachment conversion and service event consumers, or archiving task 11 early on its isolated-worktree receipt alone.
- **Because:** task 11's SQLite queue owner and canonical dispatcher source are already committed on the integration branch, whereas its remaining acceptance items require the composed Host consumer boundary owned by task 22. Ordering 10/12 acceptance → 22 composition → 11 final composed acceptance → gate 23 breaks the circular dependency without weakening any queue, credential-handoff or gate check.
- **Mine:** yes
- **Revisit when:** task 22 composition reveals a missing storage primitive in task 11 that must be implemented before server consumers can wire to the queue owner.
- **Effort:** omp-through-m3
## 2026-10-18 - Canonical agent profiles are the selectable UI roster

- **Decided:** Treat every enabled native `Agent` returned by the canonical workspace catalog as a visible/selectable profile in shared UI. Use `name` as its display label, `description` for supporting text, and do not preserve the legacy `hidden`, `mode`, or `displayName` filters.
- **Instead of:** Keep the legacy OpenCode catalog presentation fields through an adapter or block the caller migration until an equivalent field set is added to the Canonical API.
- **Because:** The native service discovers enabled project, user, extension, and bundled agent definitions and projects only the JSON-safe `Agent` fields. The target contract has no hidden/mode/display metadata, and fabricating those values would create a second authority. Direct use of the native roster keeps the canonical contract authoritative and makes the loss of legacy internal-agent filtering explicit.
- **Mine:** yes
- **Revisit when:** The canonical Agent contract adds an intentional visibility or role policy that is required by a retained product surface.
- **Effort:** omp-through-m3

## 2026-10-18 - Native agent controls and ConfigStore catalog retirement

- **Decided:** Cut ModelControls and App startup to `useAgentsStore`, retire the duplicate OpenCode agent catalog in `useConfigStore`, and remove client-side `PermissionRuleset` simulation. ModelControls displays native `allowedTools` tool availability and `permissionPresetId`, retains canonical model/variant selection, binds profile default models via `providerId`/`modelId`, and cycles native `agentId`/`name`. Host approval controls remain unchanged, the native SDK owns authorization policy, and no new Canonical contract fields are created for retired legacy mode or HTTP sampling metadata.
- **Instead of:** Waiting indefinitely for hypothetical canonical schemas matching OpenCode's client-side permission ruleset and HTTP sampling, or creating compatibility adapters and pass-through shims.
- **Because:** The selectable UI roster was settled in `2026-10-18 - Canonical agent profiles are the selectable UI roster`. Legacy sampling was only tooltip metadata, and `allowedTools` denotes tool availability rather than authorization rules. Authorization is enforced by the native SDK and Host approval boundary. Removing duplicate agent loading stops legacy `/api/agent` polling loops during startup while preserving empty-catalog versus error state semantics.
- **Mine:** yes
- **Revisit when:** Native SDK or canonical contracts introduce dedicated tool-policy or preset catalog schemas required by retained product surfaces.
- **Effort:** omp-through-m3

## 2026-10-21 - Finish M3 by owning the observed dirty work and closing the gate cycle

- **Decided:** Assign the observed unowned behavior to Tasks 64-68: live Agent Service session reopen (64), in-flight snapshot and reconnect run-control continuity (65), a spike on the failing workspace-admission recovery test (66), bounded directory startup catalog recovery/retry (67, blocked by 65 and 66), and the native Web Search provider-catalog fix (68). Block Task 52 on 64; block Tasks 56-59 on 65 and 67; block Task 60 on 65, 67 and 68; block Task 61 on 65 and 67. Remove Task 18 from Task 15's blockers and resume Task 15 on archived Task 36 evidence after 65/67 land. Make Task 18 wait on every open M3 deliverable (15, 52, 56-61 and 64-68).
- **Instead of:** Leaving the uncommitted live-reopen, live-control, startup-retry and catalog work unowned for the gate to absorb, or keeping Task 15 blocked by the Task 18 gate it must precede.
- **Because:** No open task owned that behavior; the committed Task 62 snapshot-race test is red at HEAD, the startup retry ignores Task 17's failing workspace-admission test, and the Web Search catalog defect has no owner. Task 15 could never close while waiting on Task 18. Task 18 must run once against rebuilt artifacts after this work lands, not against the current dirty tree or the superseded `598bf582…` AppImage and `c438247e…` Web dist.
- **Mine:** yes
- **Revisit when:** A dirty path turns out to belong to a different owner, or a task's implementation shows the behavior is already fully committed and the task can be dropped without losing the evidence.
- **Effort:** omp-through-m3
