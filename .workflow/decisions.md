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

## 2026-10-22 - Reopen M3 for the trial-observed quota and model-availability follow-ups

- **Decided:** Reopen `omp-through-m3` for two follow-up bugfixes. Task 75 (owned by the quota lane in its own worktree) makes an unconfigured provider's usage request `configured: false` with no error while configured failures stay visible. Task 76 (this lane) makes the workspace `ModelCatalog` expose only providers the native SDK reports as available, while `ProviderCatalog` stays the complete Settings directory.
- **Instead of:** Deferring these trial-observed defects to M4, treating the native-provider read as a new design effort, or rewriting Host profile/environment agent-directory resolution. Live Host metadata binds the current workspace `agentDirectory` to `/home/shizuku/.omp/agent`, matching the OMP CLI's default `models.yml`, and the running service already publishes CLIProxyAPI with its 12 enabled models. There is no current-lane evidence of a path mismatch to fix.
- **Because:** The user's real trial showed the chat picker listing every bundled provider, which buries the one configured custom provider, and a quota error for a provider with no credential. Application packaging/integration is coordinated separately for the final M3 gate rather than becoming a product task.
- **Mine:** no
- **Revisit when:** A real trial workspace shows the Host agent directory differing from the native OMP CLI configuration path, or a provider still cannot be selected after the availability fix.
- **Effort:** omp-through-m3

## 2026-10-24 - Remove Task 37 and retain unproven Agent Service failure log

- **Decided:** Amend `post-m3-hardening` by removing Task 37 (`37-project-plugin-registry-setup.md`) without SDK or source changes. Retain `/home/shizuku/Project/ohpichamber-omp-artifacts/post-m3-integration-2026-10-24/root-test.log` as historical failure evidence, and record the exact cause of the earlier Agent Service failure as unproven.
- **Instead of:** Keeping Task 37 open to patch `@oh-my-pi/pi-coding-agent` or add parent-directory creation around `Bun.write`.
- **Because:** Direct Bun 1.4.2 smoke verification confirms `Bun.write` creates parent directories (`{createdParents:true}`) when writing nested paths like `.omp/plugins/installed_plugins.json.tmp`. In an isolated fresh workspace, the focused Agent Service plugins test passes (2 pass, 7 skip), and the assembled root gate on candidate branch `validation/post-m3-hardening-final` passes 7/7 suites unchanged with `TMPDIR=/tmp` (`/home/shizuku/Project/ohpichamber-omp-artifacts/post-m3-integration-2026-10-24/root-test-localtmp.log`). The hypothesized missing-mkdir `ENOENT` defect is disproved.
- **Mine:** no
- **Revisit when:** A reproducible fresh-workspace plugin install failure is observed with an identified root cause.
- **Effort:** post-m3-hardening

## 2026-10-24 - Keep isolated spaces unreleased without the OpenCode runtime

- **Decided:** Choose Task08 Option B: remove the OpenCode space runtime and keep isolated spaces unreleased until an OMP space runtime is built as a separate effort. Task38 owns the bounded removal and awaits a dedicated owner.
- **Instead of:** Building an OMP Agent Service into isolated spaces as part of post-M3 hardening.
- **Because:** Task08's source inventory found that OMP support would require coordinated image, tools-volume, in-space service, dispatcher and security-boundary work, while spaces are already explicitly unreleased. The maintainer selected B on 2026-10-23; the decision is now synchronized from the Task08 archive into the governing spec and decision log.
- **Mine:** no
- **Revisit when:** The maintainer starts a dedicated OMP isolated-spaces effort or changes the unreleased product boundary.
- **Effort:** post-m3-hardening

## 2026-10-24 - Break the Guest SDK version for the private bootstrap transport

- **Decided:** Ship a breaking Guest SDK version bump for the private `MessagePort` bootstrap transport. Wire envelope and bootstrap handshake are `v: 2`; `@openchamber/sdk` and the release-coupled root/ui/web/electron packages are `3.0.0`. Manifest `apiVersion` stays `1` because the manifest/`contributes` schema is unchanged. A pre-M3 `v1` window `hello` from the current iframe stops the pane with a localized explicit version-mismatch; a v1 bootstrap announcement is dropped. The frame receives no port, ready push, or host state; no compatibility path or fallback is added.
- **Instead of:** Supporting both the old `window.postMessage` hello bootstrap and the new private `MessagePort` transport, or leaving the wire at `1` and bumping only the SDK package.
- **Because:** The two bootstrap contracts have different trust and lifecycle semantics. The maintainer chose an explicit breaking bump; the old SDK has no handshake-error message and is not guaranteed to call after `hello`, so the pane error is the observable refusal without weakening the private channel boundary. `scripts/bump-version.mjs` keeps the SDK version equal to the app release, so the release packages move with it.
- **Mine:** no
- **Revisit when:** The maintainer reintroduces a supported pre-`v2` consumer, or the manifest schema changes independently of the transport.
- **Effort:** post-m3-hardening

## 2026-10-25 - Drive OMP modes in-process instead of the rpc-ui subprocess

- **Decided:** Keep OMP inside the Agent Service worker and reuse the pinned package's RPC-mode modules in-process (`RpcGoalController`, `RpcBtwController`, `executeAcpBuiltinSlashCommand`). Plan and vibe get a worker mode controller that follows `interactive-mode.ts` without importing it.
- **Instead of:** Running `omp --mode rpc-ui` per session behind the Agent Service, as the ompweb reference client does.
- **Because:** ompweb runs a subprocess only because Node can't load OMP. Our Bun worker already imports OMP and depends on the vendored patch, in-process host tools and the fail-closed interaction manager; a subprocess would duplicate the worker and move those guarantees across a pipe.
- **Mine:** no
- **Revisit when:** a needed OMP capability exists only in the RPC process and can't be reached through package exports, or an OMP upgrade removes the `./modes/rpc/*` exports.
- **Effort:** omp-native-chat

## 2026-10-25 - Replace root agent selection with session modes

- **Decided:** A chat runs the main conversation. The composer switches session mode (main, plan, vibe, goal); agent profiles are only `task` subagent definitions. A root `agentId` or `agentMention` is rejected at Host admission, and stored root `agentId` values are migrated to `null`.
- **Instead of:** Keeping the root agent picker, filtered to profiles whose tools are available.
- **Because:** OMP has no root agent. A root profile override changes the tool set behind OMP's back, which produced the 422 on new chats; modes are OMP's own way to change root behaviour.
- **Mine:** no
- **Revisit when:** OMP adds root agent personas, or users need a root persona that plan, vibe and goal can't express.
- **Effort:** omp-native-chat

## 2026-10-25 - Report OMP-initiated turns as worker-originated runs

- **Decided:** When OMP starts a turn without a Host prompt (plan approval, goal continuation), the worker projection opens a canonical run with `origin: 'plan' | 'goal'`. The Host treats it as an active run for `/runs`, queue dispatch and abort.
- **Instead of:** Having the Host send every continuation and approval prompt through its delivery path.
- **Because:** `RpcGoalController` already owns budget accounting, the no-progress stop and session-change handling; copying it into the Host would split goal state between two processes. The worker holds no user prompt, so the Host remains the single delivery owner.
- **Mine:** yes
- **Revisit when:** a worker-originated run must carry a user-authored prompt, or the Host needs to reorder continuation turns against queued prompts.
- **Effort:** omp-native-chat

## 2026-10-25 - Use OMP goal mode as the only goal loop

- **Decided:** Session Goals run on OMP goal mode (`RpcGoalController` in the worker). The Host Session Goals supervisor, its objective files and its small-model progress audit are removed; the composer, fork, plan, scheduled-task and CLI "Run as goal" entry points send the `goal create` control, and notifications follow the session's goal mode.
- **Instead of:** Keeping the Host supervisor as the goal loop, or running both, with the supervisor's independent audit judging OMP's goal turns.
- **Because:** the supervisor existed because OpenCode had no goal mode. OMP's goal runtime already does continuation, budget accounting, the no-progress stop and abort handling, and a second loop would mean two goal states and two token counters for one session. The maintainer accepted losing the independent audit; the agent now declares completion itself.
- **Mine:** no
- **Revisit when:** goals end too early in practice because the agent declares completion without the work being done, or OMP exposes a hook for an external completion check.
- **Effort:** omp-native-chat

## 2026-10-27 - Adopt the upstream-first area refresh now

- **Decided:** Answer post-M3 hardening open question 7 by adopting the upstream-first area refresh and running it now to upstream `0056bf6a9` (v2.5.2+1, 2026-10-26, 813 commits since the adopted baseline), including features rather than only security and bugfixes. For each shared area, take current upstream source as the baseline, then restore the fork's OMP customizations path by path.
- **Instead of:** security-only synchronization, commit-level cherry-picking of the range, or leaving the fork at `1f9320062` until the OMP engine work finishes.
- **Because:** the measured delta is 4,031 changed paths (+299,677/-82,213), 1,223 of them new, and 640 of 1,230 files changed on both sides conflict textually; one sampled cherry-pick of a five-file fix conflicted in three files. The maintainer wants current upstream features, not a permanently older fork.
- **Mine:** no
- **Revisit when:** upstream stops touching retained areas, an area refresh cannot preserve an OMP invariant, or the maintainer changes the sync cadence.
- **Effort:** upstream-refresh

## 2026-10-27 - Do not adopt upstream folder trust

- **Decided:** Do not adopt `packages/web/server/lib/opencode-trust` or the commits `c351e16e38`, `bcf2498bbb` and `883f50e173`, and open no technical-debt item for them.
- **Instead of:** Porting folder trust to an OMP equivalent, or tracking its absence as debt.
- **Because:** it guards OpenCode running project code. OMP has no project-code execution hook of that kind, and the maintainer does not expect one.
- **Mine:** no
- **Revisit when:** OMP gains a project-code execution hook that needs user consent.
- **Effort:** upstream-refresh

## 2026-10-27 - Keep the fork version at 3.0.0

- **Decided:** Keep the fork's package versions at `3.0.0` (mobile `1.13.2`) through the refresh; do not adopt upstream's `2.5.2` or any upstream version string in project documents.
- **Instead of:** Following upstream's release number, or bumping the fork version because the source changed.
- **Because:** the fork numbers its own releases; a source refresh is not a fork release, and the earlier rebaseline already establishes that upstream version framing is not current project state.
- **Mine:** no
- **Revisit when:** the maintainer schedules a fork release with its own version decision.
- **Effort:** upstream-refresh

## 2026-10-27 - Bump the toolchain before refreshing ui and web

- **Decided:** Land TypeScript ~7.0.2, Bun 1.4.4, oxlint 1.88 and Electron ^44.9.3 in task 02, before any ui/web area task, with the lockfile regenerated.
- **Instead of:** bumping the toolchain last, after the area refresh.
- **Because:** upstream area source is authored against TypeScript 7. Refreshing it under 5.9 and migrating later would touch every refreshed file twice and review it against a compiler upstream does not use.
- **Mine:** yes
- **Revisit when:** the toolchain bump cannot be green before the area work, or upstream authors against the older toolchain again.
- **Effort:** upstream-refresh

## 2026-10-27 - Refresh paths three-way from the adopted baseline

- **Decided:** Refresh per path with a three-way content merge based on `1f9320062` (`git merge-file` or `git show` blobs): adopt clean/new upstream files whole, merge both-changed files and resolve toward OMP invariants, keep fork-deleted paths deleted, and apply upstream deletions unless the fork changed the file.
- **Instead of:** `git merge upstream/main`, or cherry-picking the 813 commits.
- **Because:** the real merge base of `main` and `upstream/main` is `336e19248` (915 upstream commits older than the adopted baseline), so a plain merge reports 2,810 conflicting paths; the requested merge-base override is ignored by git 2.56. Per-path slices give every task a disjoint, measurable list and keep OMP resolution local.
- **Mine:** yes
- **Revisit when:** the history link lands and a normal merge becomes accurate, or a task cannot be expressed as a path slice.
- **Effort:** upstream-refresh

## 2026-10-27 - Plan the refresh on an integration branch

- **Decided:** Run the effort on `upstream-refresh/integration`, cut from `main` at `dee0c88ebd`, and commit the plan there instead of on `main` as `flow-break` normally does.
- **Instead of:** committing the plan on `main`, or stashing or committing the other session's uncommitted `.workflow` edits.
- **Because:** `main`'s working tree holds another session's changes (`decisions.md`, `implementation-plan.md`, `post-m3-hardening.md`, tasks 26/29, the M5 spec and tasks); committing there would capture or disturb work this session does not own. The branch starts at the same commit, so the plan is identical.
- **Mine:** yes
- **Revisit when:** `main`'s working tree is clean and the plan changes, or the other session's work lands.
- **Effort:** upstream-refresh

## 2026-10-27 - Link upstream history with an ours merge

- **Decided:** The final task creates `git merge -s ours 0056bf6a9` on the integration branch so upstream's commit becomes an ancestor without altering the refreshed tree.
- **Instead of:** leaving history unlinked, keeping the fork's history pure and repeating the `1f9320062` base comparison on every future sync.
- **Because:** after the content refresh the tree already contains upstream's changes; the merge records that fact so `git merge-base` returns `0056bf6a9` instead of `336e19248`, and the next sync diffs only new upstream work.
- **Mine:** yes
- **Revisit when:** the maintainer prefers fork-only history, or a tag/pin mechanism replaces the merge.
- **Effort:** upstream-refresh

## 2026-10-27 - Lint with oxlint only

- **Decided:** The repository lints with oxlint alone: `eslint.config.js` is deleted, the ESLint and typescript-eslint devDependencies leave the root, ui and web manifests, and every workspace `lint` script runs `oxlint -c ../../oxlint.config.ts --report-unused-disable-directives`. `oxlint.config.ts` is the general config and `oxlint.anti-slop.config.ts` keeps the anti-slop backlog and ratchet, the split upstream uses.
- **Instead of:** keeping ESLint for general lint and oxlint only for the vendored anti-slop plugin, as the fork did before this refresh.
- **Because:** upstream 0056bf6a9 authors and checks its source with oxlint 1.88, and two linters mean the same file is judged twice with different rule sets and duplicated disable comments. The oxlint 1.88 config is ESLint's and typescript-eslint's recommended sets plus the React rules, so the migration keeps the checks the fork relied on.
- **Mine:** yes
- **Revisit when:** a rule the fork needs has no oxlint equivalent, or a check has to run with type information oxlint does not provide.
- **Effort:** upstream-refresh

## 2026-10-27 - Wire the RTL lint rule but leave it off until the RTL conversion

- **Decided:** `tools/oxlint/openchamber` (including `no-physical-sides`) is vendored and wired in `oxlint.config.ts`, but the rule is set to `"off"` with a comment naming the RTL conversion task 20 as the owner that turns it on.
- **Instead of:** enabling the rule now, which reports 881 physical side classes in the fork's UI, or dropping the rule and the plugin until later.
- **Because:** the layout has not been converted to logical sides yet; that conversion is task 20's deliverable, and enabling the rule in task 02 would leave the integration branch red for every task until 20 lands. Keeping the rule wired means the conversion only flips one value.
- **Mine:** yes
- **Revisit when:** task 20 converts the UI, or a task needs the rule enforced over its own files sooner.
- **Effort:** upstream-refresh

## 2026-10-27 - Take upstream's bun patch set and drop the dead @ark/schema entry

- **Decided:** `bun-patches/` matches upstream where the package version is the fork's: adopt `@legendapp%2Flist@3.6.0.patch` whole, replace the `@tanstack/virtual-core` 3.17.11 patch with 3.19.6, replace the `bun-pty` 0.4.8 patch with 0.5.1, and bump `@tanstack/react-virtual` to 3.14.21 and `bun-pty` to 0.5.1 so the new patches apply. Keep `happy-dom@18.0.1.patch` (unchanged upstream) and the three vendor OMP patches. Delete the `@ark/schema@0.56.2` entry from `patchedDependencies`: the package is no longer installed, so `bun install` warned that its patch does not apply, while the version override stays for a dependency that may return.
- **Instead of:** keeping the fork's older patch set, or re-adding a package just to keep its patch alive.
- **Because:** a patch that names a version the tree no longer installs is dead weight that makes every install warn, and upstream's patch content is the same fix carried onto the versions the refresh moves to.
- **Mine:** yes
- **Revisit when:** a vendor package reintroduces `@ark/schema`, or a patched dependency is removed or replaced.
- **Effort:** upstream-refresh

## 2026-10-27 - Do not track a .env file

- **Decided:** Delete the tracked root `.env` (its only content was `NODE_ENV=development`). `.env` stays in `.gitignore`; local development sets variables through the shell or an untracked file.
- **Instead of:** keeping the tracked file because it was already there.
- **Because:** upstream deleted it, nothing in the repository reads a root `.env` outside Vite's `VITE_`-prefixed convention, and a tracked environment file ships a default that silently overrides whatever the developer configured. The fork's real provider settings already live outside the repository.
- **Mine:** yes
- **Revisit when:** the build needs a repository-shipped default for a non-secret variable, which belongs in the code or a documented command instead.
- **Effort:** upstream-refresh

## 2026-10-27 - Leave the source-control SDK example to task 04

- **Decided:** `packages/sdk/examples/source-control-provider/package.json` is not adopted in task 02. The SDK example set stays as the fork has it; task 04 brings this manifest together with the example's `README.md`, `fake-forge.ts` and `service/main.*`, which its path list already owns.
- **Instead of:** adopting the manifest now because the path list assigns it to 02, or teaching the fork's manifest parser the new `sourceControl` contribution from a toolchain task.
- **Because:** the fork's current SDK manifest parser rejects the file (`invalid-service`: the `sourceControl` contribution and `provides: ["source-control"]` shape are newer than the parser), so landing it alone leaves an example the repository cannot validate; the parser and the example's sources belong to task 04.
- **Mine:** yes
- **Revisit when:** task 04 lands the SDK source-control contract and its examples.
- **Effort:** upstream-refresh

## 2026-10-29 - Keep project knowledge delivery in session metadata, not instruction entries

- **Decided:** Adopt upstream's knowledge text, memory wording and tool guidance, but keep the fork's delivery: the block travels as a synthetic part with the prompt, `session.metadata.openchamber.knowledge_context_delivered` records what the session carries, and compaction re-sends it with the pinned messages. The knowledge actions are exposed to the OMP agent as the `openchamber_knowledge` host tool.
- **Instead of:** Upstream's `sync`, which writes per-source OpenCode session instruction entries through `/api/experimental/session/:id/instructions/entries/:key` and keeps no OpenChamber record.
- **Because:** Instruction entries are OpenCode surface, and the fork has no OpenCode engine: the Agent Service builds prompts and delivers synthetic parts through the canonical session service. Adopting the entries would require an OMP equivalent that does not exist, and the metadata signature is what keeps scheduled tasks and agent-dispatched sessions carrying the same context as UI sends.
- **Mine:** yes
- **Revisit when:** the Agent Service gains a session-scoped instruction mechanism that survives compaction without a synthetic message, or upstream changes the delivery contract again.
- **Effort:** upstream-refresh

## 2026-10-30 - Let a mounted extension tool own its xd:// device write

- **Decided:** The Agent Service worker's `tool_call` authorization skips the generic path/command descriptor for a `read`/`write` whose path is an `xd://<device>` URL. The device dispatch runs the extension tool, and that tool's own Host capability call (scope match, feature policy, arguments) authorizes the real action.
- **Instead of:** judging the virtual `xd://` path with the native file policy, which refused every mounted extension tool with "Host policy refused the tool operation".
- **Because:** OMP mounts extension tools as `xd://` devices and delegates their policy to the device (`deviceWriteTier`; `internal-urls/types.ts` marks device dispatch as always allowed). Without the carve-out, the `openchamber`, `web`, `memory`, `openchamber_knowledge` and `notify` tools register but no real agent turn can call them; the project-knowledge real path could not be exercised.
- **Mine:** yes
- **Revisit when:** OMP exposes extension tools as direct model tools, or provides a dedicated device-authorization hook that the worker can consult.
## 2026-10-29 - Delete upstream's per-session warming instead of rewiring it

- **Decided:** Remove the per-session warming feature the upstream refresh adopted: the server modules under `packages/web/server/lib/session-warming/`, the UI store and sync subscriber, the Settings field, the per-session strings and the retired `/api/config/warming` fallback. Keep the canonical workspace control (`GET/PUT /api/agent/v1/workspaces/:workspaceId/cache-warming`) as the only warming surface.
- **Instead of:** rewiring the adopted runtime onto the Agent Service now, or mounting it with a Host-side keep-alive ping loop over the canonical prompt endpoint.
- **Because:** the adopted runtime and its routes call OpenCode endpoints that the fork deleted (`/api/session/active`, `/api/session/:id/generate`), nothing mounted them, and the settings field and toggle hid themselves behind a 404, so the feature was unreachable code carrying user-facing strings. The fork's warming is native and workspace-scoped (`CacheWarmingMode` off/streaming/idle, applied by the Agent Service workers); per-session warming is a different contract that needs a canonical route, per-session worker application and a revision, which is a follow-up, not a refresh task.
- **Mine:** no (maintainer decision after the task 21 real path).
- **Revisit when:** per-session warming is implemented on the Agent Service and a canonical session-level route exists; the settings field and session toggle can then be rebuilt against it.
- **Effort:** upstream-refresh
