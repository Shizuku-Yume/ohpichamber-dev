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

## 2026-10-13 - Scope review rounds to a boundary and declare the real landing mode

- **Decided:** adopt workflow 2.6.4 in this repository. A review round covers one boundary — comparison point, paths, deliverable and trust boundaries; a nonblocking fix inside it opens no new round, while a `blocking` finding or a boundary-moving fix gets one delta round carrying every such fix at once. The security pass triggers on a named trust-boundary list and reviews the boundary closure instead of the whole change set. Gate and close reviews reuse the tasks' `Review boundary` records plus a fixed assembly checklist rather than replaying task briefs. Declare `Landing: local-merge`, and keep one current acceptance receipt per Check bound to the code path, inputs and environment it exercised.
- **Instead of:** keeping `Landing: direct` while work accumulated on 54 branches with `main` 85 commits behind, and reviewing each finding, task and gate as its own round.
- **Because:** the measured waste was per-finding rounds (11 recovery/reopen branches, 15 receipts on task 10 alone), a security pass over an 85-file change set on every task, and gate21 repeating briefs the tasks had already passed. Task 22's five disjoint slices were each reviewed against their own diff while the merged result was reviewed by nobody.
- **Mine:** no
- **Revisit when:** a blocking defect escapes a boundary round, or the assembly checklist proves insufficient at gate 23.
- **Effort:** omp-through-m3
