# Decisions

## 2026-11-22 - Merge Host revisions across concurrent discovery mutations

- **Decided:** preserve concurrent local live session fields while merging strictly newer Host archive and metadata revisions independently during full discovery and head refresh; derive archive membership from the merged record.
- **Instead of:** treating every concurrent upsert, including unchanged snapshots, as authority to discard newer Host fields.
- **Because:** worktree archival can finish and await discovery while a live snapshot upserts the older active record, leaving the chat outside Archive despite the Host's newer archive revision.
- **Mine:** yes (requested fix and drift classification)
- **Revisit when:** session discovery and live snapshots share a single revision authority. Deletion tombstones, runtime fences and the child-discovery failure rules remain unchanged.

## 2026-11-21 - Let Host worktree capture own session archive state

- **Decided:** archive worktrees without client-side session pre-archival, and resolve standalone restored-session relocation through the registered workspace directory.
- **Instead of:** pre-archiving every chat before Host capture or treating a session display path as a filesystem path.
- **Because:** the Host must distinguish chats active at capture from independently archived chats; only admitted workspace paths can authorize relocation or establish that a checkout is missing.
- **Mine:** yes (requested archive restore follow-up)
- **Revisit when:** Host archive capture or canonical workspace directory authority changes.

## 2026-11-20 - Keep portable and type-safe test harness fixes

- **Decided:** retain file URLs for the Electron startup test's Node `--import` preload and the Git storage fixture's proxy around `readFileSync`.
- **Instead of:** restoring the upstream baseline's filesystem-path preload and hand-written `readFileSync` overloads.
- **Because:** Windows drive-letter paths are not valid preload URLs, and the baseline fixture's overloads fail TS2394 and TS2322 against the installed Node types. The proxy preserves the complete Node signature and the fixture's read delay.
- **Mine:** yes (requested drift classification)
- **Revisit when:** upstream adopts these fixes or its harness no longer needs them.

## 2026-11-21 - Restore audit-discovered upload and settings reachability

- **Decided:** compose one Host upload store into browser control and its authenticated download route; expose the existing file-input upload driver as `browser.upload`. Resolve files only inside the captured session folder, never a model-supplied directory or an OpenCode temporary directory. Keep the existing token expiry and file limits.
- **Settings:** restore the mobile Return-key checkbox that still has live composer/comment consumers, and index the existing worktree-creation command section. No stores, sync infrastructure, sidebar/search or router ownership changes.
- **Surfaces:** browser bytes stay on the connected Host for Web/PWA, Electron and mobile clients; browser driving remains subject to the existing renderer/provider capability. The Return-key checkbox is mobile-only, matching its search guard.
- **Remaining:** shared/received and later pages still require retained-feature restoration, not exceptions. Other unresolved audit findings are not waived by this decision.
- **Follow-up:** after merging the extension-waits port, its Canonical session service replaces the retired OpenCode callbacks. Restore managed chat-directory cleanup with scoped snapshot/event subscriptions, connection gating and shutdown detachment. Remove the unused `agentWorkflowAutoApprove` store/sanitizer fields; no runtime consumed them and workflow admission still requires explicit approval.

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

## 2026-11-12 - The R3/R5/R6 cutovers own the UI files they rewrote in the v2.7.0 merge

- **Decided:** the 49 `fork-differs` UI paths the drift report still listed without a reason belong to this effort's own class cutovers and keep the fork blob: the status line (`StatusRow`, `WorkingPlaceholder`, `agentStatus`, `useAgentStatusLabel`, `ThinkingPill`, the `agent-status` i18n test), live streaming (`useStreamingTextThrottle`, `streamTextCommit` and its test), the easter-egg thinking lines and their copy, the usage and quota reads (`UsagePage`, `UsageSidebar`, `useQuotaStore`), agent memory and git identities, the shared `content-state`/`text`/preview primitives, `AppStartupOverlay`, `NewWorktreeBranchPicker`, `MagicPromptsPage`, `modelPrefsAutoSave`, `index.css` and `design-system.css`.
- **Instead of:** taking upstream's copy of those files, which still renders hashed whimsical status phrases, buffers prose behind the block hold, keys a joke off the reasoning part, reads `/api/quota/*` without OMP credentials, and carries the OpenCode-shaped store fields.
- **Because:** each file is the surviving half of a cutover whose whole point was to remove that behavior; upstream's version reintroduces the defect the effort exists to fix, and the fork blob is what the class guardrails and the reference comparison were run against. The drift report's job is to force this listing, not to prefer upstream.
- **Mine:** yes (conservative option inside the 2026-11-10 merge decision and the R3/R5/R6 cutovers)
- **Revisit when:** upstream rewrites one of these surfaces on a contract the fork also accepts, so its blob no longer carries the retired behavior.
- **Effort:** ux-v270-omp-alignment

## 2026-11-12 - A dead settings row is deleted, not kept for later

- **Decided:** a persisted settings key with no consumer outside the settings plumbing is deleted through its whole chain (registry row, store field and setter, page control, search entry, translations, server sanitizer, snapshot, fixture). Each surviving entry declares its effect as `ui`, `store`, `server` or `shell`, and a test fails on a key with no consumer or a declaration the code contradicts.
- **Instead of:** keeping the rows and wiring each to something plausible, or leaving the declaration out and relying on review.
- **Because:** 25 keys had no reader at all — the control moved, nothing happened, and nothing failed. A declaration alone is a claim; deriving it from the same scan the test runs makes it evidence. The four effect classes are the boundaries the repo already separates, so the truth is mechanical.
- **Mine:** yes
- **Revisit when:** a key legitimately has no reader yet (a staged rollout) — then the registry needs an explicit `pending` effect with an expiry, not a silent exception.
- **Effort:** ux-v270-omp-alignment

## 2026-11-12 - Turn telemetry reads a run, because a turn is one step

- **Decided:** `getLatestCompletedTurnStats` gathers every turn of the latest run and derives model time, tool time, TTFT and throughput from their `Message.timing`. A metric with no source is `null` and its row is not rendered.
- **Instead of:** deriving per turn, which is what the field name suggests.
- **Because:** the server records one turn per model step, so a turn holds exactly one step: tool time (the gaps between steps) was always `null` and model time covered only the final step. A live run proved it — 3748 ms of model time and 588 ms of tool time only appear when the run is read as a whole.
- **Mine:** yes
- **Revisit when:** the agent service starts recording one turn per run instead of per step; then the run grouping is redundant and should collapse back to the turn.
- **Effort:** ux-v270-omp-alignment

## 2026-11-12 - A class name must resolve to something, and the check enforces it

- **Decided:** `scripts/check-css-classes.mjs` runs in `bun run check` and fails on any class token in UI TSX that is neither a stylesheet rule, a Tailwind utility, a class the runtime kit injects, nor a documented marker naming who queries it.
- **Instead of:** a lint rule per stylesheet, or trusting review to notice an unstyled element.
- **Because:** a class that resolves to nothing renders unstyled and no other check fails. Writing it found a dropped animation the component and its test still expected, four colour tokens utilities already referenced, and ~30 dead typography names. It also found its own blind spot: a `className` string closed by a JSX `>` was read as a comparison, hiding 257 tokens.
- **Mine:** yes
- **Revisit when:** the kit stops injecting CSS as a string, or a second runtime-injected source appears — the declared-class scan must learn it or the check will report false positives.
- **Effort:** ux-v270-omp-alignment

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

## 2026-10-24 - Keep Capacitor mobile in the M5 release matrix

- **Decided:** Keep Capacitor mobile as a supported surface in the M5 release matrix. Release stays blocked until physical-device certification passes on a Pixel 8 running Android 15/API 35 and a physical iPhone running iOS 26 through TestFlight, covering pairing, canonical chat, reconnect, approval/question recovery, push-click routing and offline queue.
- **Instead of:** Removing mobile from the release matrix and product docs until device evidence exists.
- **Because:** `scope.md` retains Mobile, the shell and signed iOS/Android workflows already exist, and the missing piece is device evidence rather than implementation. Keeping the row with a blocked release is more honest than hiding a retained surface.
- **Mine:** no
- **Revisit when:** the maintainer drops mobile from product scope or device access is unavailable for the planned release.
- **Effort:** post-m3-hardening
- **Superseded by:** 2026-11-06 - Split post-M4 roadmap into M5 packaging cleanup, M6 full audit and polish, and M7 pragmatic release

## 2026-10-24 - Bundle the Agent Runtime into @openchamber/web

- **Decided:** Make npm standalone distribution work by bundling a per-platform Agent Runtime payload into `@openchamber/web`, using the same staged payload and identity verification the Electron build already produces. Do not publish `@openchamber/agent-service`, `@openchamber/agent-contract` or the vendored OMP closure; a packed `@openchamber/web` must contain no `workspace:*` dependency.
- **Instead of:** Publishing the Agent Service and Contract packages with the OMP closure, or dropping npm standalone from the supported matrix and pointing Web/PWA deployment only at Docker.
- **Because:** the maintainer chose bundling. Publishing would put third-party OMP package names and native artifacts under this project's registry ownership, while dropping npm would remove the documented Web/PWA install path. The Electron staging path already proves payload identity, so one verified runtime recipe serves both artifacts.
- **Mine:** no
- **Revisit when:** the bundled payload exceeds the npm package limit, a platform runtime cannot be produced from the approved native leaf, or the maintainer drops npm standalone from product scope.
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

## 2026-10-26 - Approval summaries are safe one-liners

- **Decided:** The public approval record carries the exact tool name and a redacted, single-line, 200-character input summary (bash command or file path). Raw input and exact policy targets stay service-private; card details, pattern labels and tooltips are built only from the safe projection.
- **Instead of:** Forwarding the captured input object/details to the browser, or keeping the generic "Native tool operation requires approval" text.
- **Because:** The card must name the tool and command to be useful, but the same projection reaches browser events and notifications. Environment assignment values, authorization schemes, URL credentials, token arguments, API-key headers, signed-URL parameters and known credential/key shapes must be masked before that boundary.
- **Mine:** yes
- **Revisit when:** a tool needs a different human summary field, or the projection gains structured preview data that cannot be bounded by one line.
- **Effort:** omp-native-parity

## 2026-10-26 - Chat reference bindings require a Git repository

- **Decided:** `useRepositoryHosts` ensures the owning Git store has read the directory's status, then reads a source-control binding only when that status reports a repository. Non-repository chat directories request no binding.
- **Instead of:** Returning a synthetic empty binding from `GET /api/source-control/binding`, or letting the existing 422 stand and treating it as an empty result.
- **Because:** `SourceControlBindingRead` requires a real repository context; a fake repository would leak into identity, mutation and worktree consumers that assume a repository. The binding route remains honest about its precondition, and a deep-linked or Source-Board directory still gets a status read before its real repository binding is skipped or loaded.
- **Mine:** yes
- **Revisit when:** a non-repository surface needs a first-class "no repository" binding read (for example a dedicated discriminated response).
- **Effort:** omp-native-parity

## 2026-10-26 - Refresh errors belong to the group that failed

- **Decided:** A sidebar group shows "Could not refresh sessions" when its own directory bootstrap failed, or when the global session-list request itself failed (a total failure, with global retry). Partial per-scope `result.errors` do not mark untouched groups.
- **Instead of:** Falling back to `globalStatus === 'error'` for every incomplete group, or suppressing all global failures for directory-backed groups.
- **Because:** A partial global result can fail for one directory while other groups have not refreshed at all, while a total list failure is real for every unopened group and must keep its retry visible.
- **Mine:** yes
- **Revisit when:** the global store publishes per-directory failure attribution, which would let each group show its own global-scope error directly.
- **Effort:** omp-native-parity

## 2026-10-27 - Always allow uses OMP's native ACP cache with exact Host grants

- **Decided:** "Always allow" resolves OMP's `allow_always` handle through the native `ClientBridge.requestPermission` seam for bash. OMP's per-session ACP decision cache owns the key (`bash`); the Agent Service keeps no policy mirror and writes nothing to Host SQLite or OMP config. A worker-local routing set only identifies a cached call so it can request the silent exact Host grant; it never authorizes execution itself. A later cached bash call bypasses the native card but still reaches the custom Bash tool, which synthesizes an exact Host execution grant bound to that tool call and input before authorization; that grant is consumed once and produces no public card. The bridge resets with the native logical session, stops with the worker, surfaces non-bash ACP-gated tools as one-shot canonical cards (never a session allowance), passes native bash pattern allow/deny to their existing Host policy, and provider-safety or Host-only prompts never receive a native allowance. Schema version 2 revokes all legacy persisted session allowances.
- **Instead of:** The interim Agent Service session-rule Set, a wildcard Host policy row, or a second approval prompt after the native cache already authorized a call.
- **Because:** Title-text scraping and conflating the two-option `ui.select` prompt with the four-option native gate were unsound: cached ACP calls bypass `requestPermission`, so a Host mirror could authorize the wrong tool or keep allowing after the native session reset. The native cache is the exact lifecycle owner; re-entering the custom Bash tool is the one point where every execution can still be bound to an exact Host grant.
- **Mine:** yes
- **Revisit when:** the SDK exposes per-tool ACP bridge scoping or a session-reset callback that lets the Host observe cache clears directly.
- **Effort:** omp-native-parity
## 2026-10-27 - Publish OMP's resolved defaults on the model catalog

- **Decided:** Add `defaults: { model, thinkingLevel }` to the canonical `ModelCatalog`; the worker resolves them with the pinned `resolveAllowedModels`/`resolveModelRoleValue`/`pickDefaultAvailableModel` and `cfgDefaultThinkingLevel`, and the UI treats them as the untouched-draft value. `auto` is exposed but never sent as an effort.
- **Instead of:** Keeping app-owned default model/thinking settings (desktop `defaultModel`/`defaultVariant`) and teaching the UI OMP's precedence itself.
- **Because:** The catalog already crosses the worker boundary with the exact native workspace state; a second resolver in the UI would drift on credentials, enabled models and role aliases, and app defaults would keep overriding the TUI on the same session.
- **Mine:** yes
- **Revisit when:** OMP exposes a session-scoped default or the catalog read stops reflecting the live credential/role resolution.
- **Effort:** omp-native-parity

## 2026-10-27 - Keep unset effort distinct from explicit off and persist the sent level

- **Decided:** `undefined`/`null` effort means "defer to OMP"; `off` is a real choice. The worker normalizes optional controls to `null` before its guard, the composer shows session effort → explicit draft effort → OMP catalog default → `off`, and the sent effort is stored per session+agent+model so a reload restores it. Route variants stay a separate picker.
- **Instead of:** Defaulting the composer to `off` when no local choice exists, or folding `off` into the unset state.
- **Because:** OMP resolves a missing effort to its configured level; treating that as `off` both hides the real level and forces a different request. Explicit `off` must still reach `setThinkingLevel('off')`.
- **Mine:** yes
- **Revisit when:** the canonical session record starts carrying the stored thinking level, which can replace the local per-session copy.
- **Effort:** omp-native-parity

## 2026-10-27 - Retire only the global default model/thinking controls, keep project and small-model choices

- **Decided:** Remove the global `defaultModel`/`defaultVariant` desktop settings and the Defaults page model/thinking rows; keep the project default model/route and the small-model/walkthrough preferences that share the page.
- **Instead of:** Deleting the whole Defaults section and every per-project or auxiliary model preference.
- **Because:** The spec retires app-level defaults that override OMP for ordinary new chats; project identity and small-model selection are separate explicit choices, and deleting their only UI would drop unrelated capability. The main composer now follows OMP when no explicit choice exists.
- **Mine:** yes
- **Revisit when:** OMP role settings replace the small-model/walkthrough overrides, or the maintainer wants the remaining Defaults controls moved or removed.
- **Effort:** omp-native-parity

## 2026-10-27 - Keep the worker's OMP resolution unchanged; prove it with fixtures

- **Decided:** Do not change the worker's `selectOptions` guard. The observed base behavior already defers to OMP when all client effort/variant values are `null`; the real defect was on the catalog/UI side. Keep fixture tests for no-effort → `high` and explicit `off`, and record the spec's unreproduced "worker forces off" claim in task 04 Progress instead of inventing a production change.
- **Instead of:** Keeping a defensive normalization that made no observable difference, or editing the spec Check to hide the mismatch.
- **Because:** A real native fixture on `cbe1f912b3` already recorded `reasoning_effort: high` with no client effort. Changing the guard would be scope without evidence; the strict contract already forbids `undefined` in those fields.
- **Mine:** yes
- **Revisit when:** a real caller can pass `undefined` effort/variant outside the parsed contract, or a client-visible case forces `off` again.
- **Effort:** omp-native-parity

## 2026-10-27 - Read the persisted session level from the transcript snapshot

- **Decided:** Add `selection: { model, thinkingLevel }` to `SessionSnapshot`/`ProjectionSeed`, derive it from the JSONL's last `model_change` and `thinking_level_change`, and publish `session.updated.selection` when OMP reports `thinking_level_changed`. The composer reads session choice → this native level → draft choice → OMP default.
- **Instead of:** Relying only on the browser selection store for reload, or exposing the level on every `Session` record.
- **Because:** A page reload can hit a live worker whose in-memory level is newer than the seed; the event keeps the journal current, and the snapshot is the canonical place the UI already reads. Keeping it out of `Session` avoids changing every session list/row consumer.
- **Mine:** yes
- **Revisit when:** the canonical `Session` record starts carrying the native selection, making a separate snapshot field redundant.
- **Effort:** omp-native-parity
## 2026-10-27 - Host tools are essential callable tools, not xd:// devices

- **Decided:** Register `openchamber`, `web`, `memory` and `notify` with `loadMode: 'essential'`, so OMP places them in the normal callable tool schema with only their own descriptions. Their Host actions keep the existing capability owner and approval path.
- **Instead of:** Leaving them as default `discoverable` extension tools, which OMP mounts as `xd://` devices whose documentation the Host policy refuses, or adding app-authored prompt guidance explaining how to call them.
- **Because:** The effort's parity rule is that the model receives what plain OMP receives plus pins, attachments and the tools' own descriptions. A discoverable extension tool reaches the model only through an `xd://` device listing, which is additional prompt text and an unreadable Host capability; an essential tool is the ordinary OMP shape for a callable extension.
- **Mine:** yes
- **Revisit when:** OMP changes extension-tool presentation so essential tools gain prompt text of their own, or a Host tool needs to be deferred until explicitly enabled.
- **Effort:** omp-native-parity

## 2026-10-27 - Host policy passes only allowlisted OMP internal URL reads

- **Decided:** A native `read` descriptor may carry `internalReadUrls` only for the exact OMP schemes `agent`, `history`, `artifact`, `local`, `proc`, `skill`, `xd`, `mcp`, `omp`, `issue` and `pr`. The descriptor resolves them with OMP's own `InternalUrlRouter.normalize`/`canHandle` (so registered aliases and selectors keep OMP's meaning) and stores the normalized URL. Host policy admits them only for `read`, checks every local target in a mixed list as before, and keeps `write`, `edit`, `grep` and `glob` on the filesystem-only path. Unknown schemes, `file://`, `https://` and NUL bytes stay refused. Native `wait` is admitted because it only observes this session's async jobs.
- **Instead of:** Removing the `://` refusal wholesale, resolving internal URLs in the Host, or allowing the same pass-through for every native tool.
- **Because:** OMP owns the grammar and containment of its internal resources, while the Host must not turn an opaque URL into a machine-capability grant. The allowlist is exactly the schemes the TUI resolves; arbitrary MCP fallback schemes and remote/file URLs are not silently granted, and a mixed delimited read still authorizes each local path.
- **Mine:** yes
- **Revisit when:** OMP adds or removes a native internal scheme, or a read-only internal URL starts granting a capability the Host must authorize separately.
- **Effort:** omp-native-parity
## 2026-10-27 - Publish plan-role availability in the workspace model catalog

- **Decided:** `ModelCatalog` carries `planRoleAvailable`, resolved by the Agent Service with OMP's `resolveRoleModelFull(settings, 'plan', modelRegistry.getAvailable(), undefined)` — the same resolver the worker's plan enter uses. The composer reads it from the per-directory catalog cache to disable Plan and show the reason before a session exists.
- **Instead of:** Letting the user pick Plan and surfacing the worker's 422 `MODEL_UNAVAILABLE` after the draft session is created, or reading the OMP config from the UI.
- **Because:** the UI must know availability in a draft, the Agent Service already owns OMP settings and the executable model list, and a second availability rule would drift from `mode.ts`. The new field is required so every catalog producer and consumer states the fact.
- **Mine:** yes
- **Revisit when:** OMP exposes a dedicated capability endpoint, or plan availability stops depending on `modelRoles.plan`.
- **Effort:** omp-native-parity

## 2026-10-27 - Draft mode lives in draft state and applies after session creation

- **Decided:** `NewSessionDraftState.mode` (and a Goal objective) holds the composer's choice. `sendMessage` applies Plan/Vibe with `mode.set` after the session exists and before the prompt; Goal calls the native `goal create` and returns without a prompt, because the controller starts the first turn. If `mode.set` fails, the created session stays in Main, the composer text is restored, and no prompt is sent.
- **Instead of:** Applying the mode before creation through a hidden draft session, or sending the prompt and switching afterwards.
- **Because:** the worker mode control needs a real session id and "before the first prompt" is the acceptance condition; for Goal, also sending the typed text would duplicate the first objective turn.
- **Mine:** yes
- **Revisit when:** the Agent Service supports creating a session in an initial mode atomically, or a draft mode can fail without closing the draft.
- **Effort:** omp-native-parity

## 2026-10-27 - Mode picker sits beside ModelControls, not inside it

- **Decided:** the desktop mode picker renders immediately after `<ModelControls>` in the composer's right-side group; mobile renders it after the model button in the same model row. It uses the retired agent picker's DropdownMenu + Input + ScrollableOverlay pattern, with a searchable bottom sheet on mobile.
- **Instead of:** Editing `ModelControls.renderAgentSelector`'s old insertion point inside that component.
- **Because:** the visual order is the same rightmost slot, and window C owns the model/effort region of `ModelControls.tsx`; a sibling keeps the two intents mergeable. Mobile keeps the exact vacated `MobileAgentButton` slot.
- **Mine:** yes
- **Revisit when:** composer layout composes model and mode into one shared control cluster.
- **Effort:** omp-native-parity
## 2026-10-26 - OMP owns session titles

- **Decided:** `RuntimeSession.title` is the only session title, sourced from OMP's JSONL through its listing and title-change event. Rename goes through OMP `setSessionName`; Host metadata no longer has a writable title field, and legacy stored titles are ignored on read.
- **Instead of:** Keeping `SessionMetadata.title` as the UI-facing canonical title and overlaying or mirroring OMP's title into it.
- **Because:** two writable title stores disagree after a CLI rename or OMP auto-title, and the spec requires the sidebar and `omp --resume` to show the same title. A projection also leaves `getSessionMetadata`, list composition and patch revisions disagreeing about which title is current.
- **Effort:** omp-native-parity
- **Mine:** yes
- **Revisit when:** a retained surface needs Host-owned titles that OMP cannot express, or an OMP release stops storing the title in the session JSONL.

## 2026-10-26 - Cold title writes use OMP's session manager

- **Decided:** A rename on a cold root opens OMP's `SessionManager` for that JSONL, calls `setSessionName(..., 'user')`, flushes and closes. A live root applies the same call through its worker.
- **Instead of:** Requiring a worker to be started before any rename, or appending a title record by hand.
- **Because:** OMP's own API owns the header title slot and title-change entry; starting a worker only to write a title wastes a capacity slot, and a hand-written record would diverge from OMP's format. The live branch prevents two writers to the same file.
- **Effort:** omp-native-parity
- **Mine:** yes
- **Revisit when:** OMP adds a storage API that writes titles without constructing a session manager, or a live/cold race becomes observable.

## 2026-10-26 - Legacy Host titles are dropped, not migrated

- **Decided:** Existing `session_metadata.payload.title` values are stripped from canonical metadata reads and are not copied into OMP. OMP's JSONL titles become authoritative immediately.
- **Instead of:** A one-time Host-to-OMP title migration during list or startup.
- **Because:** app-created sessions already carry OMP's generated title in their JSONL, so the common case needs no migration; a list-time migration would mutate during a read and could start an unbounded cold-write pass. Manual old titles are the only loss, and no acceptance criterion requires importing them.
- **Effort:** omp-native-parity
- **Mine:** yes
- **Revisit when:** a maintainer reports a manual title that must survive the cutover; then add an explicit versioned migration rather than a fallback.

## 2026-10-27 - OMP behaviour settings route is a narrow registry view

- **Decided:** `GET`/`PUT /api/agent/v1/workspaces/:workspaceId/settings` exposes only `OMP_SETTING_IDS` from the shared contract. Descriptor metadata comes from the pinned `orderedSettings()`, values are validated by each native `Setting.assertWritable`, and writes use the workspace catalog owner's uint64 revision CAS. The route excludes credentials and `auth.broker.*` (broker URL/token), raw MCP command/env/header definitions, account pools, appearance keys, remote URLs and configurable paths; those stay on their owning provider/MCP/skill surfaces or the OMP TUI. The four candidate pages (classification, routing, magic prompts, snippets) are retained because each still has a live Host/native consumer.
- **Instead of:** A generic dotted-key settings API, copying OMP's schema into the app, or deleting active feature pages to make the settings list shorter.
- **Because:** the route writes the same `config.yml` OMP reads, so a second schema or credential/path/egress field would create a second authority or bypass provider-entry policy. Keeping descriptors dynamic follows the pinned package and lets the UI see OMP's own defaults and enum values.
- **Mine:** yes
- **Revisit when:** OMP exports a supported settings mutation API with its own revision/lock semantics, or a candidate page loses its last runtime consumer.
- **Effort:** omp-native-parity
## 2026-10-27 - Worker titles use OMP's generator on the selected provider

- **Decided:** The worker leaves OMP `autoTitle` off and, after an idle turn on an untitled session, calls OMP `AgentSession.generateTitle` with the `tiny`, `commit` and `smol` roles pinned to the selected session model and model fallback disabled. The worker authorizes `provider.use` through the Host before that call; a refused or unavailable provider leaves the session untitled without failing the user run.
- **Instead of:** Enabling OMP `autoTitle`, which can run a fork turn or fall back to a role model on another connected provider, resolving credentials directly from the model registry without the Host `provider.use` gate.
- **Because:** the title request carries the operator's first substantive message and must release credentials only for a Host-authorized provider. Pinning one candidate keeps title work on the selected provider, as the migration architecture requires, and limiting the override to the idle title window leaves user-run fallback behavior untouched.
- **Effort:** omp-native-parity
- **Mine:** yes
- **Revisit when:** OMP exposes a title hook that accepts a Host-authorized model and fallback policy directly, or titles must use a configured small model on a different provider.

## 2026-10-27 - Listed native sessions become references on first mutation

- **Decided:** A read of an OMP-listed session builds a transient cold reference from the list result and never writes storage. The first mutating operation promotes that session into the persisted SessionReference index before its worker starts.
- **Instead of:** Persisting every CLI/native session during list, or refusing to open a listed session that has no reference.
- **Because:** list is a read and must not mutate the reference file, while a send needs the session file and Host scope to survive worker startup and restart. Promotion at the mutation boundary keeps reads cold and gives native sessions the same durable ownership as app-created sessions.
- **Effort:** omp-native-parity
- **Mine:** yes
- **Revisit when:** OMP exposes a scoped open-by-session-file API that makes the reference index unnecessary, or a listed session must be mutated without a prior list read.

## 2026-10-27 - Suppress OMP replan title refresh

- **Decided:** Disable `title.refreshOnReplan` (`cfgTitleRefreshOnReplan`) in the worker's in-memory session settings. Automatic titles run only through the worker's authorized selected-model title generator after an idle turn.
- **Instead of:** Allowing OMP's todo tool replan hook to invoke background `generateTitle()` with default candidate roles, or globally disabling titles via `PI_NO_TITLE`.
- **Because:** OMP's replan title refresh has no provider-authorization hook and can fall back to unconfigured or unauthorized credentials, violating the enterprise boundary. The worker's own auto-title path authorizes the session's selected model before releasing credentials.
- **Effort:** omp-native-parity
- **Mine:** yes
- **Revisit when:** OMP adds an authorization hook for replan title refreshes or delegates replan title generation to the host.

## 2026-10-27 - Approve-and-compact proceeds when compaction is a no-op

- **Decided:** Plan approval with compact treats compaction as best-effort: if OMP reports nothing to compact or compaction fails while the worker is healthy, the approved plan still starts its execution turn and no `session.compacted` event is emitted.
- **Instead of:** Failing the worker when `session.compact` throws `ManualCompactionNoOpError` for a small or already-compacted transcript.
- **Because:** The user approved the plan; compaction only shrinks the transcript. Upstream OMP's own plan approval documents failure as proceeding best-effort, and a short plan session must not lose its execution. OMP does not export the no-op error class, so the worker distinguishes only the unhealthy-worker case.
- **Mine:** yes
- **Revisit when:** OMP exports a compaction outcome or no-op error type that lets the worker distinguish cancellation from failure without catching every error.
- **Effort:** omp-native-parity

## 2026-10-27 - Slash-command agent bindings still reach the send

- **Decided:** `routeMessage` applies `agentId` from a native command/template expansion to the prompt options, even though the root agent picker is retired.
- **Instead of:** Ignoring the expanded `agentId` and sending only the composer's captured agent value.
- **Because:** A command's agent binding is resource metadata, not the retired root agent picker; the canonical file-resource contract carries it and the existing session tests assert it. Dropping it silently changed command behavior.
- **Mine:** yes
- **Revisit when:** OMP command/template expansion stops exposing agent bindings, or prompt submission rejects non-null `agentId` by contract.
- **Effort:** omp-native-parity

## 2026-10-29 - Merge the refreshed main into parity instead of landing parity first

- **Decided:** The upstream refresh lands on `main` first. Then `main` is merged into `omp-native-parity/integration`, the conflicts are resolved with the refreshed version of every overlapping file as the base and the parity intent re-applied on top, both efforts are gated together, and parity lands. The merge keeps the new upstream behavior; parity's work predates it and cannot be taken whole-file where the refresh also changed a file.
- **Instead of:** Landing parity on `main` first and redoing the remaining refresh tasks against the mode-aware composer, or rebasing `omp-native-parity/integration` onto the refreshed `main`.
- **Because:** The refresh is the newer baseline by maintainer decision (`decisions.md: 2026-10-10 - Latest upstream first then restore the fork`), and the two efforts share 148 files changed since `dee0c88ebd` (26 of them i18n catalogs, plus seven parity deletions the refresh modifies). Landing parity first would put the old upstream baseline on `main` and force the unfinished refresh tasks (review board, overview/diagnostics, RTL, composer and permissions) to be rebuilt on a composer parity has already rewritten, against the direction the maintainer set. A rebase would rewrite a branch the refresh and parity task branches build on, which `merge-strategy.md` forbids; a merge keeps both histories, and resolving toward the refreshed file is how the new upstream updates survive.
- **Mine:** no
- **Revisit when:** The refresh has not landed on `main` by 2026-10-31, `upstream-refresh/31` or `32` (the one-view sidebar redesign) lands before this merge, or parity must ship a fix before the refresh gate passes.
- **Effort:** omp-native-parity
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
- **Superseded by:** 2026-11-16 - First release is 1.0.0 under the ohpichamber package names, stable channel only

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
- **Effort:** upstream-refresh

## 2026-10-29 - Delete upstream's per-session warming instead of rewiring it

- **Decided:** Remove the per-session warming feature the upstream refresh adopted: the server modules under `packages/web/server/lib/session-warming/`, the UI store and sync subscriber, the Settings field, the per-session strings and the retired `/api/config/warming` fallback. Keep the canonical workspace control (`GET/PUT /api/agent/v1/workspaces/:workspaceId/cache-warming`) as the only warming surface.
- **Instead of:** rewiring the adopted runtime onto the Agent Service now, or mounting it with a Host-side keep-alive ping loop over the canonical prompt endpoint.
- **Because:** the adopted runtime and its routes call OpenCode endpoints that the fork deleted (`/api/session/active`, `/api/session/:id/generate`), nothing mounted them, and the settings field and toggle hid themselves behind a 404, so the feature was unreachable code carrying user-facing strings. The fork's warming is native and workspace-scoped (`CacheWarmingMode` off/streaming/idle, applied by the Agent Service workers); per-session warming is a different contract that needs a canonical route, per-session worker application and a revision, which is a follow-up, not a refresh task.
- **Mine:** no (maintainer decision after the task 21 real path).
- **Revisit when:** per-session warming is implemented on the Agent Service and a canonical session-level route exists; the settings field and session toggle can then be rebuilt against it.
## 2026-10-30 - Solve deferred wiring in the task that still needs it, not in a follow-up nobody owns

- **Decided:** Where an archived task accepted a deferral and then closed without doing it, the deferral moves to the open task whose Check needs the behavior, with the consumer files named in that task's `Files`. Task 07 therefore adopts the scoped magic-prompt page, the composer session references and message mention chips, the tracker item mount in `ContextPanel.tsx`, and the generic tracker settings card, and it retires `useLinearAuthStore` with its last callers (`App.tsx`, `apps/MobileApp.tsx`, `apps/runtimeEndpointReset.ts`, `LinearSettings.tsx`) and the `linear` runtime API itself. Task 31 loses the line that asked it to remove the store. The worktree archive that tasks 08 and 09 deferred to "Host endpoints" becomes task 35 — a Host and UI feature on paths already counted in tasks 01, 08 and 09 — and task 26's docs wait for it.
- **Instead of:** Leaving each deferred module as a dead-code finding or a technical-debt entry, deleting the orphaned `TrackerItemView`/`ArchivedWorktreeRow`/mention-chip modules with a waiver, or opening small follow-up tasks per gap. Also rejected: making task 07 block on task 31 for the store, which would invert the dependency the plan already has (31 is blocked by 07).
- **Because:** A preflight of integration `811ecef471` and task 07's branch `9a8f099471` found every deferral's owner closed: 13 and 15 named task 07 for the mention chips and session references, 09 dropped `ContextPanel`'s tracker branch "until 07", 11 kept `LinearSettings`' store import while transferring the deletion to 24/07, 24 closed without touching the store, and 08/09 both pointed the worktree archive at a Host endpoint no task owned. The wiring is small and sits directly on the path of 07's and 35's own Checks, so a separate task would repeat the same context with less information, and a waiver would leave adopted upstream source unreachable.
- **Mine:** yes
- **Revisit when:** a task's `Files` line is treated as a hard ownership boundary again (the plan needs an explicit rule for edits into closed tasks' paths), or a deferred module turns out to need a Host route rather than a wiring change — the archive being the first case, which is why it became its own task.
- **Effort:** upstream-refresh

## 2026-10-30 - Release a worktree's workers by directory inside the Agent Service, not by client-supplied ids

- **Decided:** Archiving a worktree acquires a lease in the Agent Service before anything on disk changes. `POST /internal/worktree-leases { directory }` enumerates every session worker whose `WorkerBootstrap.cwd` is that directory or inside it, stops each through the existing `Workers.evict` rules (409 `RUN_ACTIVE`, 409 `COMMAND_IN_FLIGHT`) and answers the roots it released; `DELETE /internal/worktree-leases/:leaseId` ends the lease, which also expires on a timer. While the lease exists, `SupervisorService.admit` and `WorkerRegistry.start` refuse any start or reopen under that path with 409 `COMMAND_IN_FLIGHT` plus the lease id. The Host passes the canonical worktree path it is about to remove through the existing `hostAgentRuntime.service.request`, and `sessionIds` stays archive metadata only.
- **Instead of:** Releasing the sessions the archive request lists, through `DELETE /internal/workers/:rootSessionId`, and recording that a worker of an unlisted session stays invisible as a limit. Also rejected: an upstream-style `disposeInstance` callback built from OpenCode URLs and auth headers, and leaving the release to `archiveSessionsThenRemoveWorktree` on the client.
- **Because:** The request's id list is optional, so an empty or partial list would remove a folder a live worker still holds — the precise data-loss case this feature exists to avoid — and a recorded limit does not make an unsafe route acceptable. The Agent Service already owns the authoritative `cwd` per worker, the guarded stop and the per-root serialization, while no Host-facing route can enumerate a directory's workers (`WorkerInfo` has no `cwd`, `displayPath` is project-relative). Stopping the workers of a directory without blocking new ones leaves a start-after-release race that only a lease closes. The OpenCode disposer has no fork counterpart and cannot be reproduced without inventing an adapter.
- **Mine:** yes
- **Revisit when:** the Agent Service gains a general "drain a directory" primitive the Host can call directly, or sessions start sharing one worker across directories, which would make the cwd the wrong key.
- **Superseded by:** 2026-10-30 - Fence worktree leases at the spawn point and hold Host restarts
- **Effort:** upstream-refresh

## 2026-10-30 - Fence worktree leases at the spawn point and hold Host restarts

- **Decided:** Correct the worktree lease before implementation. The Host supplies the lease id before the POST, so a lost 201 is still releasable. Acquisition canonicalizes outside the lease-mutation chain, then inside that chain performs the overlap check, installs its fence and snapshots every `workerEntries` entry of every kind (session, stateless, usage) whose `cwd` is the directory or inside it in one synchronous block before the stop sweep; `admit` refuses fast and `WorkerRegistry.launch` rechecks at the last synchronous point before `spawn`, with no `await` between the check and the spawn, so all three start paths and an in-flight `prepareBootstrap` are covered. Session entries keep the idle/restart/pending/action/shell-job guards; stateless and usage entries get their own starting/pending/action guards and `stopEntry`, never `evict`. Stop success is the entry leaving `workerEntries` plus child and process-group exit, not `stopEntry`'s `exitCode === 0`. A same, ancestor or descendant canonical directory is refused with 409 `COMMAND_IN_FLIGHT` and the holder named, using segment-safe `path.relative`. There is no TTL: the Host supervisor exposes a refcounted `holdRestarts()`/`resumeRestarts()` that clears a pending restart, makes `scheduleRestart` and `start(true)` wait without consuming attempts, and resumes through the existing `start(true)`; the archive hook holds before acquire and releases in the same `finally`. `agent-service/src/index.ts` also stops on IPC disconnect after the secret handshake. The Host adopts upstream's archive block verbatim (bootstrap wait and `WORKTREE_BOOTSTRAP_FAILED` before snapshot; ref deleted only when the worktree is provably intact; `WORKTREE_ARCHIVE_PARTIAL` keeps the ref), maps `PARTIAL` explicitly, and restore takes the caller-created checkout rather than creating one at `record.path`. Session storage inside the leased directory is refused at acquire.
- **Instead of:** The 60 s `worktreeLeaseTimeoutMs`, the session-only stop reusing `evict`, reliance on `withRoot` for directory exclusion, unconditional ref deletion after a failed removal, restore creating a checkout from `record.path`, and leaving parent/child archive overlap to the client. Also rejected: a persisted lease marker, a reconcile route, a new retry loop, a durable lease framework, PTY/editor quiescence, and a new bounded `sessionIds` validator — `sessionIds` stays metadata and the adopted id validation covers archive, restore and delete.
- **Because:** The independent plan/security review found six blocking defects in the earlier contract: the fence was not atomic with the spawn (B1), stateless workers were left running (B2), a service restart could admit a new generation while the Host archived (B3), a failed removal could delete the only copy of uncommitted work (B4), the restore contract contradicted upstream (B5), and overlapping leases were left to the client (B6). The corrected mechanism uses existing lifecycle edges (`launch`, `withRoot`, `stopEntry`, `scheduleRestart`, `start(true)`) instead of a new timer or persisted state, and adopts upstream's data-loss checks rather than paraphrasing them.
- **Supersedes:** 2026-10-30 - Release a worktree's workers by directory inside the Agent Service, not by client-supplied ids
- **Mine:** yes
- **Revisit when:** the Agent Service gains a general directory-drain primitive, sessions share one worker across directories, or the supervisor restart hold proves insufficient and a persisted lease marker becomes necessary.
- **Effort:** upstream-refresh

## 2026-10-30 - Report a rewritten branch tip to the source-control shell through a route option

- **Decided:** `registerGitRoutes` takes `onBranchRewritten`, and `feature-routes-runtime.js` passes `walkthroughBindingService.invalidateBranchStatus`. After a successful Change-Id amend the route calls it with `{ directory, branch }`; the route never imports the source-control shell or its status caches.
- **Instead of:** importing the shell (or a status cache) inside `packages/web/server/lib/git/routes.js` so the Change-Id route could call `invalidateBranchStatus` itself.
- **Because:** `feature-routes-runtime.js` constructs the source-control shell before the Git routes and already supplies every other source-control dependency the Git routes use (`getSourceControlBinding`, `resolveChangeRequestSource`, `backfillIdentities`). A direct import would make the Git route module depend on how the provider shell and its per-provider caches are constructed, and the Git route test could not seed a cached status without also building a provider registry; the option keeps the route a thin reporter, and the test can use the real `createChangeRequestStatusCache`.
- **Mine:** yes
- **Revisit when:** a second Git mutation needs the same invalidation (then a shared repository-mutation seam), or the Git routes are registered somewhere that cannot receive the shell.
- **Effort:** upstream-refresh

## 2026-11-01 - Bind worktree archives to Host session authority

- **Decided:** Use the bounded Host association and Git-ref listing described in task 35. Allow unbound legacy Git-only restore/delete with a prominent no-session-effects warning and explicit confirmation for unverified branch deletion. Successful restore preserves pre-existing archived sessions and timestamps. Authorize protected integration fast-forward only for task 07 and the independently reviewed plan amendment.
- **Instead of:** Trusting Git record paths or session IDs, requiring legacy reassociation before Git-only actions, unarchiving previously archived sessions, or granting broader integration mutation.
- **Because:** Host identity and durable scope are required to avoid acting on unrelated sessions; the user explicitly chose the legacy and restore behaviors and bounded integration authorization. Conditional technical reviews do not establish implementation or runtime acceptance.
- **Mine:** no
- **Revisit when:** A separately authorized legacy reassociation protocol or a different session-state policy is adopted.
- **Effort:** upstream-refresh

## 2026-11-04 - Accept official registry native leaves with SLSA provenance for non-Linux targets

- **Decided:** Accept official npm registry native leaf packages (`darwin-arm64`, `darwin-x64`, `linux-arm64`, `win32-arm64`, `win32-x64`) for OMP 18.16.0 when verified by signed SLSA provenance attestation matching pinned commit `650f3a108229ee11bf68ba3377f4e8c3391cd424`, exact archive SHA-512/SHA-256 integrity, and target `os`/`cpu` match in `copy-manifest.json`. Linux x64 leaf remains built and packed from source. This unlocks the M5 non-Linux release matrix without claiming unrun target-platform runtime certification.
- **Instead of:** Requiring hermetic cross-toolchain source builds for all six targets on a single host, or blocking the M5 release matrix indefinitely.
- **Because:** The maintainer explicitly approved the attested registry leaves for non-Linux targets. Each artifact is individually verified against the author's signed SLSA provenance and exact archive digests. Host runtime certification on target platforms remains a distinct release gate and is not certified until real target devices/runners execute the tests.
- **Mine:** no (maintainer decision).
- **Revisit when:** Hermetic cross-compilation toolchains are provisioned or upstream OMP changes build/packaging infrastructure.
- **Effort:** post-m3-hardening

## 2026-11-04 - Defer M4 replanning to a dedicated milestone effort

- **Decided:** Defer M4 replanning from Post-M3 Hardening to a dedicated future milestone effort. Keep task 25 paused in place to record the deferred status truthfully without falsely claiming completion.
- **Instead of:** Marking M4 replanning completed without an approved M4 spec and tasks, or deleting the task.
- **Because:** The maintainer explicitly decided to defer M4 replanning while closing Post-M3 Hardening's remaining gates and archiving task 26. Prerequisite `omp-opencode-comparison/01` remains unexecuted. Preserving the task as paused avoids both false completion claims and accidental loss of plan context.
- **Mine:** no (maintainer decision).
- **Revisit when:** The maintainer schedules the dedicated M4 milestone effort and executes the comparison audit.
- **Effort:** post-m3-hardening

## 2026-11-05 - Baseline dead-code findings against main with zero new findings for parity integration

- **Decided:** Accept the inherited `main` (`46c8dcc8aa`) dead-code baseline of 143 findings (17 files, 63 exports, 60 types, 3 config hints) for `omp-native-parity/integration` and require zero net new dead-code findings compared with `main`, without deleting inherited code. The `bun run dead-code` command still exits 1 due to the inherited baseline findings and is not claimed as code-clean or exit 0.
- **Instead of:** Attempting broad deletions of the 143 inherited findings across unrelated subsystems during integration, or falsely claiming `bun run dead-code` exits 0.
- **Because:** The user explicitly decided to require only that this merge introduces no new problems ("只要求这次合并没有增加新的问题"). The 143 inherited baseline findings are identical between `main` and candidate, pre-date the parity merge, and include false positives (e.g. lazy-loaded markdown renderers, native bridges, API types) that are unsafe to delete inside the parity effort.
- **Decided by:** user
- **Mine:** no
- **Revisit when:** Repository-wide dead-code cleanup is scheduled as a dedicated workspace maintenance task on `main`.
- **Effort:** omp-native-parity

## 2026-11-05 - Retain parity useBtwPanelState implementation until upstream helpers are used

- **Decided:** Retain the parity whole-file implementation of `packages/ui/src/components/chat/btw/useBtwPanelState.ts` with ephemeral BTW text state (`ephemeralRecordId`, `ephemeralText`, `ephemeralStatus`) and omission of unused fork-only helpers (`btwHoldsDock`, `parentPromoted`). Switch to the upstream implementation only after a future upstream refresh makes those helpers actually used by real callers or features.
- **Instead of:** Forcing adoption of upstream's `useBtwPanelState.ts` with unused `btwHoldsDock` and `parentPromoted` helpers now, or creating a premature hybrid merge.
- **Because:** The user explicitly approved keeping the parity version until upstream updates it with real usage ("那就用parit的吧 上游更新了再用上游的"). Investigation confirmed `btwHoldsDock` has 0 callers across the repository and `parentPromoted` has 0 callers and 0 setters; adding them now would introduce unused dead code while parity relies on ephemeral text BTW state.
- **Decided by:** user
- **Mine:** no
- **Revisit when:** A future upstream refresh introduces real callers or features that consume `btwHoldsDock` or `parentPromoted`.
- **Effort:** omp-native-parity

## 2026-11-05 - Nest workflow agent sessions under parentSessionId and ignore workflow agent personas

- **Decided:** Pass `parentSessionId` to `sessionService.create` in `packages/web/server/lib/workflows/agent-session.js` so workflow branch sessions nest under the proposing session, and force `options.agentId: null` when creating and prompting workflow sessions (ignoring any `agent` field in workflow script options while retaining `model`, `label`, and `schema`).
- **Instead of:** Passing `options.agentId: agent || null` on root workflow sessions (which fails `assertRootPromptAdmission` with HTTP 400), prepending a synthetic prompt wrapper to invoke the `task` tool, or rejecting workflow scripts that still pass an `agent` field.
- **Because:** Workflow branches are independent `AgentSession` instances, and OMP agent profiles are subagent definitions for the `task` tool rather than root session personas. Nesting via `parentSessionId` (landed in `p1-debts/03`) preserves session hierarchy in the sidebar, and forcing `agentId: null` eliminates the HTTP 400 admission failure without breaking existing workflow scripts.
- **Decided by:** user
- **Revisit when:** OMP introduces root-session persona profiles distinct from `task` subagents.
- **Effort:** m4-orchestration

## 2026-11-05 - Fix auto routing effort mapping and unify small-model resolution on OMP modelRoles

- **Decided:** Remove `AgentSelector` and `agentId` assignment from `RoutingPage.tsx` and `prompt-delivery-runtime.js`, switch routing category thinking controls from `model.variants` to `model.reasoningOptions` (`options.reasoningEffort`), and resolve small-model completions (`small-model`, `smallModelRequest.ts`) through OMP's `modelRoles` (`commit` for Git commit/PR generation, `smol` for Session Assist, Walkthrough, and titles, falling back to `default`), retiring the duplicate `smallModelOverride` and `walkthroughModelOverride` fields in `DefaultsSettings.tsx`.
- **Instead of:** Keeping `smallModelOverride` and `walkthroughModelOverride` in Host `settings.json` alongside OMP's `modelRoles` in `config.yml`, or leaving routing categories bound to `model.variants` and root `agentId`.
- **Because:** Root `agentId` causes `openchamber/auto` prompts to fail Host admission with HTTP 400, `variants` no longer represent thinking levels after `omp-native-chat/10`, and maintaining two separate UIs and config stores for small/utility models splits configuration between Host settings and OMP's `config.yml`.
- **Decided by:** user
- **Revisit when:** A caller needs a per-surface model override that has no corresponding OMP model role.
- **Effort:** m4-orchestration

## 2026-11-05 - Retire BehaviorPage response-style injection, dead Code Mode toggle, and Host permission auto-accept

- **Decided:** Remove first-message `<system-reminder>` response-style injection from `ChatInput.tsx` together with `BehaviorPage.tsx` (`SET-03`), delete the unused `agentToolsCodeMode` setting (`SET-09`), and retire the Host `permissionDefaultMode` (`ask/safety/auto`) and `permission-auto-accept` runtime/UI (`SET-02`) so tool approval is governed solely by OMP's `tools.approvalMode`, per-session ACP `allow_always`, and the Host Gatekeeper.
- **Instead of:** Retaining synthetic `<system-reminder>` prompt injection on the first turn and keeping a parallel Host permission-mode state machine alongside OMP's native approval settings.
- **Because:** Injecting hidden `<system-reminder>` style instructions violates the `omp-native-parity` prompt-purity rule, `agentToolsCodeMode` has no runtime consumer, and running two competing permission mode systems (`ask/safety/auto` in Host settings vs `always-ask/write/yolo` in OMP `config.yml`) obscures who authorizes tool execution.
- **Decided by:** user
- **Revisit when:** OMP adds a native personality or response-style setting in `config.yml` that the OMP settings page should expose.
- **Effort:** m4-orchestration

## 2026-11-05 - Enable OMP LSP settings in workers, project unmanaged MCP configs read-only, and clean up settings naming

- **Decided:** Remove the hardcoded `enableLsp: false` override in `packages/agent-service/src/worker/session.ts` so OMP's `lsp.*` settings take effect (`SET-05`), allow `packages/agent-service/src/worker/mcp.ts` to project hand-written/unmanaged `.omp/mcp.json` files as redacted read-only entries instead of throwing 500 `MCP_CONFIG_READ_FAILED` (`SET-06`), rename the `'opencode'` settings nav group key (`SET-11`), and clarify `Guest Extensions`, `OMP Plugins`, and `Prompt Templates` naming (`SET-07`, `SET-10`).
- **Instead of:** Leaving `enableLsp: false` hardcoded while exposing dead `lsp.*` toggles in Settings, failing closed with HTTP 500 on user-authored `.omp/mcp.json` files, or keeping legacy `'opencode'`/ambiguous section labels.
- **Because:** Settings exposed in `OmpSettingsPage` must work in the worker runtime, CLI users with existing `.omp/mcp.json` files must not hit 500 errors in the GUI, and settings navigation should reflect OMP and Guest SDK terminology accurately.
- **Decided by:** user
- **Revisit when:** Full GUI editing of arbitrary env/header secrets in unmanaged `.omp/mcp.json` files is designed with write-only secret handling.
- **Effort:** m4-orchestration

## 2026-11-05 - Scope M4 to full OMP 18.16.0 TUI feature/display parity, B3 adaptation fixes, and orchestration verification

- **Decided:** Re-plan M4 into `.workflow/specs/m4-orchestration.md` and tasks `m4-orchestration/01`–`14`, covering: (1) Workflows, Auto Routing, Small-Model `modelRoles`, and Batch B3/`CP-09` adaptation fixes; (2) full OMP 18.16.0 built-in TUI feature and display parity as audited in `.workflow/research/omp-tui-parity-audit.md` (`out://` mid-turn replies, inline ` ```svg ` & table auto-charts, `ast_edit` diffs & specialized tool cards, consecutive `read` grouping, `tool_stream_update` live argument streaming, live subagent HUD + per-subagent steer/cancel, timeline notices `todo_reminder`/`ttsr_triggered`/`retry_fallback_applied`/`served_model_mismatch`, rich compaction divider & annotated context gauge, visual selectors for all 16 `modelRoles` + `modelPresets` + `tier.*`, extended headless slash commands, magic keywords `ultrathink`/`orchestrate`/`workflowz`/`jevify` + `+Nk!` turn budgets + internal URL autocomplete + composer ghost-text prediction, `checkpoint`/`rewind` tools + `branchFromBtw` + mid-run Plan mode & execution model selection, interactive Jobs Sheet + `proc://` controls + `job-widgets/`, and `/loop`, `/omfg`, `/cleanse`, `/tan`, `/seance`, and Advisor watchdog); and (3) end-to-end verification and removal of the unverified M4 documentation banners.
- **Instead of:** Limiting M4 to only OMP-vs-OpenCode differences or deferring OMP 18.16.0 built-in TUI features and displays beyond M4.
- **Because:** The maintainer explicitly directed that M4 must audit and include all missing OMP built-in TUI features and displays alongside the OMP-vs-OpenCode adaptation fixes ("不光要记录omp与OpenCode的功能差异 还有omp自带的tui里的各项功能与显示 也要调查清楚 最好如果没有的要安排上"), and selected Option A across all eight TUI parity clusters (`TUI-Q1` through `TUI-Q8`).
- **Decided by:** user
- **Supersedes:** 2026-11-04 - Defer M4 replanning to a dedicated milestone effort
- **Revisit when:** All 14 M4 tasks pass verification and close out before M5 release certification.
- **Effort:** m4-orchestration

## 2026-11-06 - Split post-M4 roadmap into M5 packaging cleanup, M6 full audit and polish, and M7 pragmatic release

- **Decided:** Reshape the post-M4 roadmap into three sequential milestones: (1) **M5 (`m5-release-surfaces`)** focuses strictly on build/packaging adaptation, OpenCode/VSCode CI removal, unsigned cross-platform build readiness, `@openchamber/web` Agent Runtime bundling, Linux x64 Electron AppImage local smoke, `Dockerfile`/`docker-compose.yml` OMP rewrite, and Isolated Spaces fail-closed verification; (2) **M6 (`m6-audit-and-polish`)** conducts a full-codebase three-pillar audit, restores mistakenly deleted OpenChamber frontend UX, wires remaining OMP capabilities, overhauls non-compliant Settings UIs, and resolves maintainer hands-on feedback; (3) **M7 (`m7-release-verification`)** runs real-world release testing on **Linux, Windows, Android, and local Docker**, while Apple targets (macOS Electron and iOS Mobile) produce unsigned installable build artifacts only, with no Apple Developer ID signing, notarization, or TestFlight certification gates blocking release.
- **Instead of:** Keeping the old monolithic M5 spec that blocked release on paid Apple Developer ID notarization, Authenticode EV signing, `blacksmith` runner lock-in, a physical Pixel 8, and a physical iPhone running iOS 26 via TestFlight before user feedback polish.
- **Because:** The maintainer can directly test Linux, Windows, Android, and local Docker, has no reason to gate open builds on Apple signing/notarization ceremonies (macOS/iOS users handle unsigned installation themselves), and expects a substantial UX/feature polish round (M6) after packaging cleanup (M5) and before final release verification (M7).
- **Supersedes:** 2026-10-24 - Keep Capacitor mobile in the M5 release matrix
- **Mine:** no
- **Revisit when:** The maintainer acquires Apple signing credentials and explicitly asks to add notarized Apple distribution, or changes the target platform set.
- **Effort:** m5-release-surfaces

## 2026-11-06 - Preserve OpenChamber frontend capabilities alongside full OMP engine parity

- **Decided:** Establish the two-sided product rule for OhPiChamber and enforce it in M6 (`m6-audit-and-polish`): (1) OMP is the sole agent engine, and capabilities present in OMP or its TUI (including `Recap`, `Agent Hub`, and `Marketplace`) should be surfaced in the GUI; (2) OpenChamber's strengths as an agent GUI workbench are retained whenever they are genuine frontend/Host UX rather than OpenCode-specific workarounds or adapters. Specifically restore Host-persisted cross-client session pins (`session-pins`), Host-persisted session unread watermarks and turn duration badges (`session-unread` + `session-turn-duration`), optional GUI response-style presets (`BehaviorPage.tsx`, zero injection on `default`), mistakenly deleted OpenChamber General/Desktop settings controls, and strict adherence to `PATTERNS.md` and `STYLING.md` on Settings pages (`ProvidersPage`, `WebSearch`, `OmpSettingsPage`). Leave per-session cache warming and bundled `ripgrep` cut as previously decided.
- **Instead of:** Rejecting or deleting useful OpenChamber GUI features merely because the standalone OMP CLI lacks a matching field, or accepting ad-hoc test-passing settings layouts that ignore OpenChamber's design system.
- **Because:** OhPiChamber forks OpenChamber specifically for its superior GUI workbench UX on top of OMP's agent runtime; throwing away Host/UI features that do not depend on OpenCode degrades the frontend unnecessarily, and custom OMP/Provider settings must match the visual quality of the rest of the application.
- **Mine:** no
- **Revisit when:** An individual restored frontend control conflicts directly with an authoritative OMP runtime state owner.
- **Effort:** m6-audit-and-polish
## 2026-11-06 - Waive residual environmental limitations and close M4 orchestration effort

- **Decided:** Accept maintainer directive to close the M4 orchestration effort and merge `m4-orchestration/integration` into `main`, waiving the three uncertified environmental limitations as accepted technical debt: (1) Linear OAuth external account configuration unavailable, (2) live worktree sessions unsupported/uncertified on the OMP runtime, and (3) Electron Linux compositor `capturePage` / snapshot timeout under virtual display while Browser Control lease, webview mounting, and direct DOM JavaScript execution are fully verified. Retain warning banners in product documentation for notifications and sessions-in-work, and track follow-ups in `technical-debt.md` without fabricating runtime passes.
- **Instead of:** Blocking M4 milestone closeout and `main` merge indefinitely until external Linear OAuth credentials, worktree session architectural support, and Linux GPU compositor capture pipelines are provisioned or refactored.
- **Because:** The maintainer explicitly reviewed the comprehensive verification evidence (root test gate passing 7/7 suites, full unit/integration test coverage, real-provider smoke verification across all 13 reachable M4 feature areas, and documentation truth alignment) and directed flow-close and merge to `main` with explicit waiver of these three external/environmental gaps as residual technical debt.
- **Decided by:** user
- **Revisit when:** External Linear OAuth credentials are provisioned, worktree session isolation is designed and implemented in a subsequent milestone, or Electron Linux headless compositor capture is resolved.
- **Effort:** m4-orchestration

## 2026-11-10 - Merge upstream OpenChamber with a real git merge

- **Decided:** Bring upstream v2.7.0 (`bc50ba56a`) into the fork with a real three-way `git merge`, resolved by area on the `ux-v270-omp-alignment` integration branch. Resolution rule: upstream wins unless the fork's delta is required by the OMP boundary (Canonical Client, agent contract, Host gateway) or by a recorded decision; standing exclusions (`packages/vscode`, OpenCode-engine paths, folder trust, isolated-spaces code, `.github` collaboration/CI, `changelog/`, `nix/`, upstream agent guidance) resolve to the fork side. The disposition ledger is generated from git blobs instead of maintained by hand. Future syncs are ordinary merges.
- **Instead of:** continuing file-level ports with a git-derived drift report, or the `-s ours` history link used for `0056bf6a9`.
- **Because:** the `ours` link and two file-level refreshes left git believing upstream was absorbed while 53/53 v2.7.0 UI commits are absent, 404 baseline files were silently deleted and 44 ledger rows claim adoption of files that do not exist (`research/ux-v270-systemic-review.md` R1). A dry-run `git merge-tree main bc50ba56a` conflicts in 1,298 files (about 1,082 outside standing exclusions); that one-time cost is accepted so later syncs stay incremental.
- **Decided by:** user
- **Supersedes:** 2026-10-27 - Link upstream history with an ours merge
- **Revisit when:** upstream changes license or repository, or the fork stops tracking upstream.
- **Effort:** ux-v270-omp-alignment

### Within the same merge: workbench shell resolutions

- **Header project action:** the upstream `HeaderProjectControls` (and its test) is the header's one project-action surface; the fork's `ProjectActionsButton` and its test are deleted rather than kept beside it. `ProjectActionsProvider`, `ProjectActionsScope`, `projectActionsRunnerContext` and `ProjectActionRunIndicator` come from upstream and the main layout mounts the provider and the on-demand dialog.
- **Isolated spaces in the workbench:** the merge drops upstream's draft-space branches (`useDraftSpaceTarget`, `panelContentDirectory`, `SpacePreparing`, `isSpaceDirectory`) from `Header`, `ContextSurfacePanes` and `SidebarFilesTree` instead of restoring `components/session/spaces/SpacePreparing`; isolated spaces stay unreleased behind `ISOLATED_SPACES_RELEASED = false`, so no surface can reach a draft-space state.
- **Guest panes:** `PluginPane` keeps the fork's private `MessagePort` bootstrap transport (decision `2026-10-24 - Break the Guest SDK version for the private bootstrap transport`) and takes upstream's value from `usePageColors` plus the `DockedPanelSurfaceContext` provider around the floating popover, and upstream's `/btw` shell stop is left as the fork's `createGuestShellRequests`.
- **RTL:** the upstream conversion to logical CSS and `getInlineStartSide` in `Sidebar`, `TitlebarLeftControls` and `Header` is not taken here; these files keep the fork's `--oc-titlebar-left-inset` and physical props until the separate RTL conversion lands, so one tree does not mix two conventions.
- **Header terminal control:** `HeaderTerminalAction` is the fork's addition and has no upstream counterpart; it is kept and mounted in the header's right cluster.
- **Files tree rows:** `fileTreeRows.ts` (+test) is restored because the adopted `SidebarFilesTree` imports it; the upstream `SidebarFilesTree.test.tsx` is retired with the draft-space behavior it tests.

## 2026-11-10 - OMP TUI parity means function and display parity, not a mirror of OMP's settings and commands

- **Decided:** "OMP TUI parity" covers what the user can do and see in the agent experience (status, tool intent, live streaming, tool summaries, todo, modes, goals, subagents), presented in OpenChamber's UI idioms. GUI Settings expose only settings a GUI user acts on; terminal-presentation settings, internal tuning knobs and duplicates of an existing OpenChamber control are not shown, and the OMP Settings page offers "open config.yml" for the rest. When OpenChamber already has a control for a concept, it is the single surface. The Commands page manages prompt templates; built-in OMP commands stay in chat autocomplete.
- **Instead of:** exposing every OMP setting, role editor and CLI command in the GUI.
- **Because:** the literal reading produced a 157-row settings page (22 GUI-meaningful), four `modelRoles` editors, 30 CLI commands on the Commands page and a 21-pill plugin wall; the maintainer's original direction asked for the TUI's functions and displays (`tui里的各项功能与显示`).
- **Decided by:** user
- **Supersedes:** the "visual selectors for all 16 `modelRoles` + `modelPresets`" and settings/command exposure parts of 2026-11-05 - Scope M4 to full OMP 18.16.0 TUI feature/display parity; refines part (1) of 2026-11-06 - Preserve OpenChamber frontend capabilities alongside full OMP engine parity.
- **Revisit when:** a concrete GUI user need appears for a hidden OMP setting.
- **Effort:** ux-v270-omp-alignment

## 2026-11-12 - Classify every OMP setting by GUI surface and let one role editor own model assignment

- **Decided:** `OmpSettingSchema` states where each allowlisted OMP setting belongs — `gui`, `tui-only`, `duplicate` (naming the settings-item id that owns the concept) or `advanced` — and carries OMP's own `ui.condition` with whether it holds. The Agent Service owns one explicit per-id table; an unplaced id fails its classification test rather than falling into a default. The OMP page draws only `gui` rows from a declarative registry, offers the real `config.yml` path for the rest, and one `ModelRoleEditor` now serves Defaults, Git and OMP with the model's concrete effort level instead of a synthetic `default`.
- **Instead of:** a prefix rule in the page (e.g. "everything `tui.*` is terminal-only"), a second defaults editor per surface, and an effort picker whose first row was a sentinel the user could not inspect.
- **Because:** prefixes each span several surfaces (`task.`, `skills.`, `compaction.`), so a prefix rule decides for ids nobody examined; and the page's 157-row type switch had already grown a per-page copy of the role editor, the effort vocabulary and three sentinel conventions.
- **Also decided:** the UI Check leg runs `bun --cwd packages/ui test …` instead of `bunx vitest run packages/ui/…`. `packages/ui` suites are `bun:test` files run one process per file by `scripts/run-isolated-tests.mjs`; no vitest configuration covers that root, so the vitest invocation fails at baseline with `Cannot find package 'bun:test'` (task 20 recorded the same).
- **Mine:** yes (conservative option; no maintainer question)
- **Revisit when:** a vitest configuration lands under `packages/ui`, or a prefix rule becomes a reliable classifier for its whole namespace.
- **Effort:** ux-v270-omp-alignment

## 2026-11-11 - Resolve the web work modules to the fork host boundary in the upstream merge

- **Decided:** the lane 12 work modules (`openchamber-sessions`, `openchamber-control`, `quota`, `small-model`, `routing`, `session-assist`, `session-work`, `scheduled-tasks`, `workflows`, `tts`, `package-manager.js`) keep the fork's Host/Canonical API shape; upstream v2.7.0 engine code is not adopted there.
- **Instead of:** taking upstream's `@opencode/client` and `server/lib/opencode/*` implementations for those modules.
- **Because:** every one of those modules now dispatches on `/api/agent/v1` through the Host (`sessionService`, `resolveSessionScope`, `credentialAccessToken`, `selected-credential`); upstream's side reintroduces the retired OpenCode runtime, duplicate declarations, and reads of `opencode/auth.js`.
- **Also retired here:** `session-goal/` (the fork removed the goal runtime), and upstream-only helpers with no fork consumer (`quota/console-budgets`, `quota/extension-quota[s]`, `quota/utils/auth.js`, `scheduled-tasks/model-catalog.js`, `openchamber-control/{form-answer,secret-run,tool-envelope}.js`, `openchamber-sessions/session-archive.js`). `usage-read.ts` is retained through the native `openchamber_usage` Host tool: it reads the calling workspace's selected native quota credentials, not OpenCode auth. Session track/done use Canonical eligibility and Host metadata; turn-end background checks use Canonical shell snapshots and live subagent rosters.
- **Consequence:** the cluster's five remaining failing test files are `main`-identical and fail on tree-wide dependency bumps, not on this resolution: installed `zod@4.6.7` makes `.omit()` throw on the refined canonical event schemas (`agent-service/dist/supervisor/host-authorization-protocol.js`), and `supertest@7.3.2`/`superagent@10.4.2` break `packages/web/test/loopback-supertest.js` (its own self-test fails). Fixing them belongs to the lockfile lane, not this cluster.
- **Mine:** yes (conservative option; no maintainer question)
- **Revisit when:** the zod/supertest pins return to `4.3.6`/`7.2.2`, or the canonical event schemas drop their refinements and the loopback harness is repaired.

## 2026-11-11 - Keep the lane 12 host-adjacent modules on the fork's Host owners in the v2.7.0 merge

- **Decided:** the lane 12 modules that are not under `server/lib/host/` keep their fork shape where upstream v2.7.0 adds an OpenCode-engine path: the permission policy and its routes, the browser-control docs, the agent-tool doc, the context-obligatory runtime and its test, the event-stream docs, the ui-auth doc, the route export list, the update-check tests, and `lib/git/**`.
- **Instead of:** taking upstream's `@opencode/client`, `server/lib/opencode/*` readers, `session.forked`-driven permission inheritance, `vcsInitRefusal` route guard, and stored project start command into those modules.
- **Because:** the fork answers permissions from Canonical `parentSessionId` lineage with no OpenCode wire events (`agent-contract/src/session.ts`), resolves sessions through `sessionService`/`resolveSessionScope`, owns repository init through the Host route, and reads no stored project start command; upstream's side reintroduces the retired engine and a second authority for the same state. In `lib/git/` the fork keeps its own `initializeRepository`/`POST /api/git/init`, the Host lease and archive path, `OPENCHAMBER_DATA_DIR` with the personal `worktreeDirectory` rule, local-only remote-branch worktree validation, and the fork's neutral transport credential (`secret` plus the fork's own resolver callbacks) — upstream's `@opencode/client` worktree disposer and OpenCode worktree directory cannot run without the removed engine.
- **Also recorded:** `test` files here use `vitest` where upstream moved them to `bun:test`, and the fork's own tests cover project-id `..` rejection, relay close-reason bounds and identity reset races, extension tracker attach/detach, and the split-view hunk cases it still supports.
- **Mine:** yes (conservative option; no maintainer question)
- **Revisit when:** the Agent Service exposes fork semantics as Canonical events, or a Host-owned repository-init contract replaces the fork route.
- **Effort:** ux-v270-omp-alignment

## 2026-11-11 - Keep the remaining web modules on the fork Host and Canonical owners in the v2.7.0 merge

- **Decided:** the web modules outside lane 12's work clusters keep the fork implementation where upstream v2.7.0 changes an OpenCode-engine path, an OpenCode-only helper, or text that named `server/lib/opencode/`.
- **Instead of:** adopting upstream's OpenCode client reads, `opencodeBinary` policy field, provider/credential enterprise hooks, OpenCode diagnostic scrubber, OpenCode message-search cursors and `XDG_DATA_HOME`, or upstream's `bun:test` imports in the fork's vitest suite.
- **Because:** those paths either read the retired OpenCode runtime or duplicate an owner the fork already has on the Host (`core-routes.js`, `sessionService`, `resolveSessionScope`, `OPENCHAMBER_DATA_DIR`). The fork also carries correctness and security work upstream lacks: project-id `..` rejection in `agent-memory` and `project-context`, bounded relay close reasons and an identity reset race, extension tracker attach/detach, the guest asset token scope, the space-prefixed dev tunnel, and the desktop runtime-key report that replaced the SDK reconnect.
- **Also recorded:** docs and tests in the same files follow those owners, so a re-sync takes the fork side for them until the Agent Service exposes the same behavior as Canonical events.
- **Mine:** yes (conservative option; no maintainer question)
- **Revisit when:** the Agent Service exposes those behaviors as Canonical events, or a Host-owned contract replaces each fork route.
## 2026-11-11 - Chat presentation is ported onto the canonical contract, not kept on the OpenCode engine

- **Decided:** The chat UI keeps the OMP-boundary data access (canonical `ToolCallPart`/`ToolResultPart` from `/api/agent/v1`) and takes upstream v2.7.0's presentation for the components that render what an agent showed: `ShownToolCard`, `HtmlRenderFrame`, `UiPageFrame`, `OpenChamberToolOutput`, `ToolResultParts`, `GeneratedImages`, `SecretRequestCard`, `PageAskStatus`, plus the page/quote/selection stack (`pageQuoteBridge`, `frameSelection`, `TextSelectionMenu`, `ChatQuoteHighlightLayer`) and the composer/file-mention/markdown/work-status surface. Where a component's only engine dependency was its shape, a thin adapter (`message/parts/toolView.ts`) joins a canonical call with its glued result and `message/parts/pageRenderView.ts` carries the ported pure helpers (`renderedPage`, `generatedImagePaths`, `requestedSecret`, `requestedSecretRun`, `proposedWorkflowRunId`, `isShownInPlace`, `isSettledAsk`). `lib/opencode` is not restored; upstream-only chat files whose closure needs it stay excluded.
- **Instead of:** keeping the fork's wholesale chat rewrites, or restoring the OpenCode UI engine so upstream's chat compiles verbatim (the engine is a standing merge exclusion and the migration target is OMP-only).
- **Because:** upstream's chat is one version-coupled component rooted in `@/lib/opencode/*` (180 of 675 files import it directly; 244 of the 274 fork-vs-upstream disagreements share one dependency component), so neither wholesale side gives both the boundary and the presentation. The adapter is the smallest join that does, and it keeps the R3 cutover (tasks 23-24) free to change semantics without re-porting presentation.
- **Decided by:** agent (conservative option within the 2026-11-10 OMP TUI parity decision; the maintainer confirmed on 2026-11-11 that no instruction was given on the lane 13 ticket)
- **Revisit when:** R3 lands the OMP-keyed tool presentation registry, or an upstream sync changes the shape of a ported component.
- **Effort:** ux-v270-omp-alignment

## 2026-11-11 - Product docs describe the OMP runtime and drop the retired VS Code and OpenCode surfaces

- **Decided:** every `packages/docs` page keeps upstream v2.7.0's text and structure, and a fork difference survives only where it removes a retired surface (the VS Code extension, the OpenCode engine, isolated spaces) or states the fork's actual runtime (`OPENCODE_JWT_SECRET` still signs the Host session, Jev/OpenCode Zen are provider names, VS Code theme import is retained). Pages whose only fork change was a retired-term removal now read as upstream reads.
- **Instead of:** merging upstream docs through a lane-level rule that keeps the fork wholesale, or restoring the 24 upstream-only pages (`opencode-server.mdx`, `troubleshooting/opencode-connection.mdx` in every locale) that document a retired engine.
- **Because:** the fork's doc drift was mostly stale, not intentional: upstream v2.7.0 added Tailscale Serve/Funnel, the five-host Git board (GitHub, GitLab, Gitea, Forgejo, Gerrit), the worktree and work/session model, walkthrough observations, and project-knowledge pins that the fork already implements (`server/lib/tunnels/providers/tailscale.js`, `server/lib/{github,gitlab,gitea,forgejo,gerrit}/`, `session/sidebar/works/sidebarWorks.ts`, `lib/walkthrough/prompt.js`, `ProjectNotesTodoPanel.tsx`). Taking the fork's deletions and rewrites wholesale would have deleted documented, shipped behavior.
- **Mine:** yes (evidence in the source tree listed above; no maintainer question)
- **Revisit when:** the retired-surface wording is purged from all 12 locales, or a docs page starts describing an OMP-only capability that upstream cannot express.
- **Effort:** ux-v270-omp-alignment

## 2026-11-11 - Keep the fork Guest SDK bootstrap transport and regenerated example bundles

- **Decided:** `packages/sdk` keeps its v2 Guest envelope: `OPENCHAMBER_SDK_API_VERSION = 2` in `src/api-version.ts`, the MessagePort bootstrap in `src/host.ts` and its `GUEST_BOOTSTRAP_*` exports in `src/index.ts`, the `3.0.0` `engines.openchamber` floor in `src/host-version.ts`, the fork's `examples/**/main.js` bundles compiled from that transport, `scripts/examples.test.ts`, the fork test files, and `src/ui/DOCUMENTATION.md`.
- **Instead of:** taking upstream's v1 envelope and its `examples/**/main.js` bundles, which hand the guest the pre-M3 `window` handshake the fork removed.
- **Because:** the Host and the Guest loader both speak the v2 envelope (`packages/sdk/src/host.ts`), so upstream's v1 bundles cannot load here, and the example bundles are build output: they are regenerated from source, never merged by hand. The `README.md`/`GUEST_SERVICES.md` differences state the same v2 contract and the removed VS Code extension form.
- **Mine:** yes (conservative option; no maintainer question)
- **Revisit when:** upstream ships a v2 envelope of its own, or the example bundles are regenerated after a source merge.
- **Effort:** ux-v270-omp-alignment

## 2026-11-11 - Keep the Electron shell on the in-process Host and the staged Agent Runtime

- **Decided:** the desktop main process keeps its OMP lifecycle: `main.mjs` supervises the Bun Agent Service through `agent-runtime.mjs` and `server/lib/host/agent-service-supervisor.js` instead of spawning `opencode serve`; `after-pack.cjs` and `electron-dev.mjs` stage and verify `resources/agent-runtime/`; `ssh-manager.mjs` resolves the agent runtime on the remote; `server-shutdown.mjs` stops the Host and its supervised service; `remote-page-policy.mjs`, `guest-frame-navigation.mjs`, `packaged-ui-routing.mjs`, `prepare-ripgrep.mjs`, `verify-linux-appimage.mjs`, and their tests carry the fork's navigation guards, ripgrep staging, and AppImage verification.
- **Instead of:** upstream's `opencode-readiness.mjs`, `opencode-cwd.mjs`, `opencode-cli` staging and `diagnostics/local-files.js`, which start and probe a retired engine, and upstream's `main.mjs` imports for them.
- **Because:** the packaged app runs the Agent Service as a separate Bun process and the Host in-process (architecture ADR; `process-lifecycle.md` records the map), so an upstream `opencode serve` supervisor has no place to run. The fork's guards and packaging scripts are additions upstream does not have, and taking upstream would silently re-open guest navigation and drop the Agent Runtime payload check.
- **Mine:** yes (conservative option; no maintainer question)
- **Revisit when:** upstream's Electron shell ships the same Agent Service boundary, making `main.mjs` a plain adoption.
- **Effort:** ux-v270-omp-alignment

## 2026-11-11 - Keep the fork perf, bench, changelog, dev and icon scripts

- **Decided:** `scripts/` keeps the fork's own tooling: `perf/**` measurement and soak scripts, `model-bench/**`, `changelog/{build,lib,lib.test}.mjs`, `bump-version.mjs`, `oc-dev.mjs`, `generate-icon-sprite.mjs`, `profile-compare.mjs`, `profile-soak.mjs`, `run-isolated-tests.mjs`, and `port-opencode-theme.ts` with its integration test.
- **Instead of:** upstream's versions, which drop the Agent Service soak parameters, the worktree/`OPENCHAMBER_DATA_DIR` harness, the isolated-test runner, and the theme porter's fork target paths.
- **Because:** these scripts measure and drive the fork's own runtime; upstream's copies predate the Agent Service and would exercise a process the fork no longer runs. `port-opencode-theme.ts` is retained on purpose: it imports a VS Code theme into OpenChamber tokens, and retiring the extension does not retire theme import.
- **Mine:** yes (conservative option; no maintainer question)
- **Revisit when:** upstream's perf harness gains an Agent Service mode, or the theme porter is replaced by an in-app importer.
- **Effort:** ux-v270-omp-alignment

## 2026-11-11 - Keep the fork toolchain, lint and container configuration

- **Decided:** the root configuration keeps its OMP shape: `tsconfig.json`/`packages/electron/tsconfig.json`/`packages/ui/tsconfig.test.json` path and extension settings, `knip.json` without the retired `renderVSCodeApp.tsx` and vendor aliases, `oxlint.config.ts` with `no-physical-sides` wired off until the RTL conversion lands, `.gitignore` and `packages/electron/.gitignore` for `agent-runtime` staging, `docker-compose.yml` and `scripts/docker-entrypoint.sh` mounting `./data/omp` and creating `~/.omp` instead of the OpenCode share/state/config trees, `docs/CUSTOM_THEMES.md` without the VS Code runtime-adapter wording, `packages/extensions/{README,DOCUMENTATION}.md`, and `packages/mobile/HANDOFF.md`.
- **Instead of:** upstream's copies, which reference the retired engine's directories, the VS Code renderer entry, and the OpenCode container mounts.
- **Because:** the fork runs OMP, so its container and ignore rules point at `.omp` and the staged Agent Runtime; adopting upstream would ignore the staged payload and create empty OpenCode directories. `renovate.json` is the exception: it now takes upstream, because its only fork difference was a missing dependency-policy rule rather than OMP work.
- **Mine:** yes (conservative option; no maintainer question)
- **Revisit when:** task 20 flips the physical-sides rule on, or the container image is rebuilt for the Agent Service.
## 2026-11-11 - Keep the slice 33 chat, layout, view and app-shell surfaces on the fork's contracts in the v2.7.0 merge

- **Decided:** the repair slice 33 files outside lane 13's presentation port keep the fork implementation where upstream v2.7.0's copy reads the retired OpenCode engine or an upstream-only contract: the app shells (`apps/**`), `components/{comments,layout,onboarding,projects,references,sourceBoard,ui}`, the views outside the chat port, and their tests. Upstream wins only where its change is a pure presentation or type alignment the fork's contracts already accept, and there the fork's blob is replaced.
- **Instead of:** taking upstream's `@opencode/client` sync bootstrap in the app-shell and view tests, upstream's page/forms pending-request aggregator, the VS Code branches and RTL pair in the layout shells, upstream's `opencodeBinary` setup and project-config-error onboarding surfaces, or upstream's `OpenCode.make(...)` test doubles.
- **Because:** those upstream paths import the retired OpenCode runtime or name a surface the fork removed, and the remaining differences are the fork's own fixes: runtime-switch ownership in the git dialogs, the archive's optional `deleteBranch`, the tolerant `changeRequestCopy` signature, canonical session fields in the mobile shell and memory panel, and the physical-side layout the RTL conversion (task 20) has not reached.
- **Also recorded:** the deleted upstream-only surfaces and the ported presentation the slice adopted (the walkthrough trio, the partial usage notice, the guest-frame `incompatible` state) are named in the task's `## Progress`.
- **Mine:** yes (conservative option within the 2026-11-10 merge decision and the 2026-11-11 chat port decision)
- **Revisit when:** the RTL conversion lands, or the Agent Service exposes those behaviors as Canonical events.
## 2026-11-11 - Settings sections keep the fork contract surface, not the upstream OpenCode callers

- **Decided:** The merged Settings sections that upstream v2.7.0 wrote against the retired OpenCode engine take the fork's own content: `providers/CustomProviderForm.tsx`, `providers/CustomProviderModelRow.tsx`, `plugins/AddPluginDialog.tsx`, `commands/CommandsSidebar.tsx`, `snippets/SnippetsPage.tsx`, `snippets/SnippetsSidebar.tsx`, `components/snippets/SnippetQuickCreateDialog.tsx`, `routing/RoutingPage.tsx` and `projects/useProjectIdentityForm.ts` are restored from `main`. Upstream-only modules that had no fork contract and no remaining consumer are deleted: `agents/AgentPermissionsEditor.tsx`, `agents/agentPermissionModel.ts`, `mcp/useMcpOAuthIntegration.ts`, `openchamber/CompactionSettings.tsx`, `snippets/SnippetAliasesField.tsx`. The merged sections whose shape is canonical already stay on upstream's content and are ported field by field (`agents/ModelSelector.tsx`, `skills/catalog/SkillsCatalogPage.tsx`).
- **Instead of:** restoring the retired OpenCode client modules, the `useAgentsStore` permissions API, the plugin entry/file draft store, the snippet alias/preview/file-path model, or the `/api/config/compaction` route so upstream's sections compile verbatim.
- **Because:** the migration target is OMP-only and the OpenCode engine is a standing merge exclusion, so none of those contracts exist or should come back; the pluggable pieces upstream adds on top of a canonical base (`mcpImport` on `MCPServerConfig`, the catalog's installed scope, the model picker's `providerID`/`modelID` rows) are kept. Where the fork genuinely lacks a store key — `terminalCloseOnExit`, `sessionTabsPerWorkspace`, `serverUpdateChannel`, `settingsDefaultVariant`, `previewSnippet`/`setHasUnsavedChanges` — the control is dropped or read through the nearest existing call rather than adding a key to a store another lane owns.
- **Mine:** yes (within the 2026-11-10 merge and OMP TUI parity decisions)
- **Revisit when:** tasks 25-26 rebuild the Plugins, Agents, Commands and OMP Settings pages, or the fork adds a persisted key for one of the dropped controls.
## 2026-11-11 - Repair the merged session sidebar on the fork's session model

- **Decided:** the upstream v2.7.0 `packages/ui/src/components/session` surface keeps its layout, menus, sections manager, mark-all-read, worktree naming and row context menus, ported onto the fork's contract `Session` (`sessionId`/`parentSessionId`/`archivedAt`/`createdAt`/`updatedAt`, directory through `resolveGlobalSessionDirectory`), its Canonical Client errors and its Host-owned unread/catalog stores.
- **Instead of:** adopting upstream's `session.id`/`time.*`/`directory`/`session.fork` reads, `@/lib/opencode/*` imports, `OpencodeApiError`, `isVSCodeRuntime` branches, named pin lists (`openchamber.pinned` carries only `at` on the contract), the `/btw`-session marker and the `SpaceMark.taskTitle` field; upstream's `.vitest.tsx`-mixed app shell is not imported either.
- **Because:** the fork has one agent runtime on `/api/agent/v1` and one unread authority (`openchamber.workbench.lastIdleAt`/`viewedAt`), one error type (`CanonicalApiError`), and no VS Code runtime target. Where upstream had a genuine capability the fork lacks (named pin lists, space task titles, worktree pin writes, batched project-status prefetch, `checkIsGitRepository` gating) the dependent branch is removed and the loss recorded in the task, rather than shaping `sync`, `stores` or `api` exports to carry it.
- **Also recorded:** the identifier and error ports are mechanical by construction (`id` → `sessionId`, `time.archived` → `archivedAt`, `OpencodeApiError` → `CanonicalApiError`, `getUnreadSessionIds`/`markSessionsUnreadSeen` → `isSessionUnread`/`markSessionUnreadSeen`), so each row cites this decision rather than repeating the mapping.
- **Mine:** yes (maintainer confirmed the pin-list, dialog-catalog and space-affordance removals for task 32)
- **Revisit when:** the contract carries named pin lists or space task titles, or the Agent Service exposes those behaviors as Canonical events.
## 2026-11-11 - Session pins keep one Host stamp; a pin list collapses onto Pinned until the metadata contract carries it

- **Decided:** `sync/session-pins.ts` keeps `setSessionPinList(target, pinned, list)` for its sidebar consumers, but the Host metadata contract stays `openchamber.pinned = { at }`, so a list other than `pinned` files the session under Pinned. Unpin writes the same stamp removal as before.
- **Instead of:** adding `openchamber.pinned.list` to `packages/agent-contract`, which would change the metadata contract, the patch schema and the Host's validation surface for one sidebar affordance, or editing slice 32's `SessionNodeItem.tsx`/`workFacts.ts`/`SessionProjectCollection.tsx` to drop the list.
- **Because:** one pin authority already exists (`setSessionPinned` over Host metadata plus the device-local legacy migration), and the pin-list affordance is a sidebar filing choice, not an agent fact. Keeping the exported shape identical to the scaffold leaves every caller compiling unchanged, and the choice can be revisited as a contract change on its own ticket.
- **Mine:** yes (conservative option; the alternative touched another package's contract)
- **Revisit when:** a later milestone extends `SessionMetadataSchema.openchamber.pinned` with a list, or the sidebar drops user-created pin lists.
- **Effort:** ux-v270-omp-alignment

## 2026-11-11 - Finish the v2.7.0 merge on the fork's runtime and unread authorities

- **Decided:** the last six `fork-differs` files keep the fork's behavior where upstream's copy depended on something the fork no longer has: `components/desktop/OpenInAppButton.tsx` carries `data-work-status-popup` so the chat work panel does not close when the app picker is used; `components/sections/behavior/BehaviorPage.test.tsx` asserts AGENTS.md as the sole prompt authority (no settings mirror) and seeds `localStorage`; `components/sections/classification/ClassificationProvidersPage.tsx` opens the Host's canonical provider ids (`opencode-zen`, `vercel-ai-gateway`) instead of upstream's `opencode`/`vercel`; `hooks/useGlobalSessionsPolling.ts` keeps `missedWhileHidden` so a refresh that came due while hidden runs once on return; `useNestedGitDirectory.test.tsx` treats `/api/session-folders` as bootstrap, like `/api/fs/home`; `useSshConfirmation.test.tsx` clicks the dictionary's effective `Save Changes`. Alongside it, `sync/session-unread.ts` gains `isUnreadTurn` (the turn's own watermark, without the top-level-only rule) so the dock badge can roll a subtask's unread turn up to its parent, `sync/global-session-status.ts` regains `subscribeSessionStatusTransitions` for `multirun/autoFusion.ts`, and `multirun/laneStatus.ts` regains `hasRunningGoal`.
- **Instead of:** adopting upstream's provider ids, its settings-mirrored Behavior prompt, its visibility-blind polling, upstream's `id`/`time.*` session fields in the autoFusion and unread paths, or dropping the subtask badge rollup because the top-level rule cannot express it.
- **Because:** the Host's routing table (`server/lib/routing/runtime.js`) and private-credential module name the canonical ids; the fork has one unread authority in Host metadata and one settings authority for AGENTS.md; and a hidden app owes the refresh its cadence promised rather than silently skipping it.
- **Mine:** yes (conservative options inside the 2026-11-10 merge and 2026-11-11 sidebar decisions)
- **Revisit when:** the unread contract gains a subtask-aware field, or the fork adds a settings-mirror for the Behavior prompt.
- **Effort:** ux-v270-omp-alignment

## 2026-11-12 - Move the integration branch to the final merge tree instead of preserving a superseded attempt

- **Decided:** `ux-v270-omp-alignment/integration` is moved with a non-fast-forward update (`git reset --hard` under `/tmp/v270-integration.lock`, from a clean worktree) to the merge commit built from the final scaffold tip. The commit it replaces, `700b8449a`, was built by this window alone and is referenced by no other branch, done file, ref or worktree.
- **Instead of:** keeping `700b8449a` and stacking the final tree on top, or leaving integration short of the scaffold tip. Both would break the task's requirement that the integration tree equal the resolved and tested scaffold tip byte for byte.
- **Because:** `700b8449a` predated four commits that fixed a test-only race in the workflow runtime probes and the archived records; a fast-forward is impossible once integration holds a commit that is not an ancestor of the new one, and nothing depends on that superseded attempt.
- **Also recorded:** no other branch was touched; the new commit keeps `main`'s tip (`e04b3dfb7`) and `bc50ba56a` as its parents, and the previous move to `700b8449a` was the same kind of replaceable attempt.
- **Mine:** yes (conservative option within the 2026-11-10 merge decision)
- **Revisit when:** integration carries commits that other branches or releases depend on, which then requires history-preserving updates instead.
- **Effort:** ux-v270-omp-alignment

## 2026-11-12 - The boot registry owns server-owned reads; freshness compares one clock

- **Decided:** `packages/ui/src/stores/serverStateBoot.ts` is the single reader and resetter of every store that projects the instance's own state (permission policy, Git identities, quota, agent memory, session folders, web search, MCP/skills/catalog reset-only, advisor/cleanse reset-only). Each of those stores declares `unknown | ready | error` (`stores/loadPhase.ts`), and a failed read keeps the held value and says so instead of producing an empty list. Freshness comparisons moved to one clock at a time: suggestions and work hints order against Host turn stamps (`openchamber.workbench.lastIdleAt`, `openchamber.turn.endedAt`, `openchamber.reviewOffer.at`) rather than `session.updatedAt`, and the Host status seed dropped its client-clock age window.
- **Instead of:** keeping per-page hydrate-on-mount paths beside the registry, letting `resolvePermissionMode` return `ask` for an unread policy, or adding a Host "now" field to every session list read. The first two are the R4 defects themselves; the third would change the session-list contract for a display window that only needs to be honest about which clock it used.
- **Because:** the permission policy had no production reader at all after `permission-mode-sync.ts` lost its importer, so a restart with default mode `auto` still showed `ask`; and `session.updatedAt` is the native transcript file's mtime, so any comparison against a Host or client stamp measured clock skew — touching a session file purged a suggestion that still applied.
- **Also recorded:** `getCurrentPermissionMode` returns `null` for "not read" while `getSessionMode` keeps returning a concrete mode (the configured `permissionDefaultMode`) for callers that must act; the composer's new-session draft uses that default too. Two presentation windows in `lib/overview/overviewModel.ts` (14-day followed window, 3-day stalled label) keep a justified `oxlint-disable-next-line openchamber/no-cross-source-time-compare`, since seconds of skew cannot change an answer measured in days.
- **Mine:** yes (conservative reading of task 22's acceptance)
- **Revisit when:** the Canonical contract carries a Host-sourced "now" per session list read, or the permission policy gains a server-pushed initial value on connect.
- **Effort:** ux-v270-omp-alignment

## 2026-11-12 - A settled session is not only `idle`, and a role level is not a model

- **Decided:** the assist surfaces (composer suggestion, done hint, review offer) settle by the composer's own rule — live status is busy, `idle` is idle, `unavailable` or missing with no native run binding is idle — instead of accepting only `runtimeStatus === 'idle'`. On the server, a `modelRoles` selector's trailing thinking level is stripped when it is one of `minimal|low|medium|high|xhigh|max|auto` before catalog lookup.
- **Instead of:** a second `unavailable`-aware predicate per surface, which keeps four copies of one rule, or a server fallback to provider-local discovery when a role does not resolve, which would silently answer with a model the user did not choose.
- **Because:** a session the Agent Service no longer holds (after a reload or Host restart) is projected as `unavailable`, so the strict gate suppressed a real recap and suggestion; and OMP writes roles as `provider/model:effort`, so reading the level as part of the model ID made every levelled role unresolvable and session-assist never generated anything. Both were observed directly: `describeSmallModel` returned null (`described null`) until the suffix was stripped, then returned `CLIProxyAPI/claude-haiku-5-5` and the runtime wrote a real suggestion.
- **Also recorded:** `sessionActivityPhase` is the single owner of that settled rule; `SessionDoneHintRow` and `SessionReviewHintRow` had the same duplicated predicate. An empty suggestion stays a successful outcome (the prompt rules return `""` when the request is satisfied or the next move is the user's), so the observation used a request with genuinely unfinished agent work.
- **Mine:** yes (the alternative — adding a second `unavailable`-aware predicate per surface — would keep four copies of one rule)
- **Revisit when:** the projection stops reporting unheld sessions as `unavailable` (e.g. a separate "not loaded" status), or OMP changes the role selector syntax.
## 2026-11-12 - UI error suites run under bun test, Host suites under the web vitest config

- **Decided:** task 21's Check runs `bun test` for `packages/ui/src/lib/problemMessage*` and `bunx vitest run server/lib/host` from `packages/web`.
- **Instead of:** the single root `bunx vitest run packages/web/server/lib/host packages/ui/src/api packages/ui/src/lib/problemMessage.test.ts` the task originally named.
- **Because:** `packages/ui` tests import `bun:test`, and the repo has no root `vitest.config.ts` (upstream `bc50ba56a` has none either), so a root vitest run fails to resolve `bun:test` for UI paths before running a single test. `packages/web/vitest.config.ts` is the only config that aliases `bun:test` and `@/`, and it resolves `server/lib/host` correctly.
- **Mine:** yes (agent decision, confirmed by the maintainer's dispatch note).
- **Revisit when:** a root vitest config appears, or the UI suites migrate off `bun:test`.
- **Effort:** ux-v270-omp-alignment

## 2026-11-12 - Upstream UI error displays carry the fork problem cause in the v2.7.0 merge

- **Decided:** the nine upstream UI files that task 21 touched keep the fork's `problemMessage(error, …)` display and are recorded as `fork-differs` decision rows in the drift ledger.
- **Instead of:** leaving them `unexplained` in the ledger, or reverting them to upstream's translation-only toasts to avoid the divergence.
- **Because:** the R6 fix is a deliberate fork change: a caught failure must show the cause the Agent Service wrote. Reverting those nine files would restore the defect the task exists to remove, and an unexplained row would fail `bun run check`.
- **Mine:** yes (agent decision, within the task's stated scope).
- **Revisit when:** upstream adopts an equivalent cause-carrying display, at which point the rows collapse into `identical`.
## 2026-11-12 - A tool result is a part of its call's message; a failure keeps a kind beside its detail

- **Decided:** the canonical projection publishes a `tool_result` part inside the assistant message that authored its `tool_call`, at part id `<call-part>:result`, and streams OMP's partial result frames as `part.updated` on that same part. `ToolResultPart` keeps `error: string` and gains `errorKind`. A assistant step carries `timing: { startedAt, firstTokenAt?, completedAt? }` derived only from the native message. A run OMP prompts itself opens a turn with no authored user message, and the client joins its steps to the previous turn.
- **Instead of:** a separate `role: 'system'` result message paired by the client, an object-valued `error`, or a `tool_result`-only turn role.
- **Because:** the journal and reducer already key parts by partId and already flip call status from `tool.started`/`tool.completed`, so one message makes the live stream and the restored transcript identical and lets the client delete every heuristic it used to re-join them. `error` is read as text in cards the effort does not own, and absolute epochs survive both live emission and history replay without a second clock.
- **Mine:** yes (settled inside task 23's design; maintainer approved the user-less-turn rule as an out-of-list edit)
- **Revisit when:** the contract gains a first-class result message or `error` becomes a structured value with every card migrated.
## 2026-11-12 - `@upstream` routing is opt-in for the selector grammar

- **Decided:** `parseModelSelector` reads a trailing `@<slug>` as provider routing only when the caller passes `allowUpstreamRouting: true`. By default the `@` and its slug stay part of the model half, and `splitUpstreamRouting` remains exported for callers that check the base first.
- **Instead of:** reproducing OMP's two-stage behavior (split, then re-resolve only when the base is an OpenRouter or Vercel-Gateway model) inside a grammar module that has no model registry. The alternative would have been to accept an `supportsUpstreamRouting(model)` predicate in the parse options, which doesn't exist without a catalog lookup and would make a pure string grammar depend on live provider state.
- **Because:** an ungated split rewrites real ids that legitimately contain `@` — `anthropic/claude-opus-4-8@default` becomes provider `anthropic`, id `claude-opus-4-8`, upstream `default` — and those ids are persisted in role settings and project defaults, so a wrong split corrupts stored configuration. Leaving it off is the safe default; a caller that can prove the base is an aggregator turns it on.
- **Mine:** yes (conservative option inside the 2026-11-10 R7 cutover)
- **Revisit when:** a layer that parses selectors has the resolved model in hand and needs routing fidelity; it should then pass `allowUpstreamRouting: true` plus its registry check.
- **Effort:** ux-v270-omp-alignment

## 2026-11-13 - Host authorizes OMP tools by tier, not by a known-name list

- **Decided:** the worker operation authorizer classifies every OMP tool by its tier. Read-tier tools are allowed after the path check. Write-tier tools need the workspace write grant. Exec-tier tools (`eval`, `debug`, `ida`, `github`) and `mcp__*` calls return `approvalRequired` through the same approve-then-reauthorize loop as `bash`. Reads outside the workspace become an approval card, which `auto` answers. Writes and edits outside the workspace stay hard-denied. The worker forwards the Host's refusal reason to the model instead of a fixed sentence.
- **Instead of:** adding `eval` and similar tools to the descriptor-free allow list, or adding fixed read-only roots such as the temp directory.
- **Because:** the fall-through deny at `worker-operation-authorizer.js:203` refuses every OMP tool the fork did not list, so YOLO still showed denials. `eval` runs arbitrary code like `bash`, so `ask` and `safety` must still prompt for it. Bash can already read outside the workspace, so a hard deny on reads adds no security.
- **Decided by:** user
- **Mine:** no
- **Revisit when:** OMP exposes a per-call tier the Host can read directly, or ADR-05 changes the path boundary.
- **Effort:** ux-feedback-2026-11-12

## 2026-11-13 - MCP installs choose project or user scope

- **Decided:** installing an MCP server, from the Integrations marketplace or Settings → MCP, asks whether to install for the project or globally (`~/.omp/agent/mcp.json`, shared with the OMP TUI). Settings → MCP lists both scopes and labels each server's scope. An install that saved but did not connect shows "saved, not connected" or "sign-in required", never a success toast or a bare failure.
- **Instead of:** user scope only, project scope only, or today's per-chat-directory scope.
- **Because:** installs into a no-project chat directory were invisible to every other chat and to Settings → MCP. The maintainer wants both scopes available.
- **Decided by:** user
- **Mine:** no
- **Revisit when:** OMP adds a third MCP scope.
- **Effort:** ux-feedback-2026-11-12

## 2026-11-13 - Settings pages show their title and description

- **Decided:** every settings page renders its title and description, matching the v2.7.0 release and the fork's own pages. `namedBySidebar` is dropped from the call sites, and the `settings.page.*.description` keys return.
- **Instead of:** upstream main's `namedBySidebar` (commit `f2d8615b4`), which hides both.
- **Because:** the maintainer prefers pages that carry a title and description, and the mixed state (some pages titled, some not) is inconsistent.
- **Decided by:** user
- **Mine:** no
- **Revisit when:** a later upstream merge reworks the settings layout.
- **Effort:** ux-feedback-2026-11-12

## 2026-11-13 - The Usage page is an OMP-native dashboard

- **Decided:** the Usage page reads OMP's own statistics (`stats.db` rollups, `authStorage` usage reports and session stats) through a new Agent Service endpoint and contract. It covers all OMP sessions, including TUI sessions. It offers an all-providers view with a provider comparison, and a per-provider view for every configured provider, custom ones included. Unconfigured quota plans are not shown. TTFT, tok/s, error rate and cost come from OMP, and OMP's pricing is the cost authority. A model with unknown pricing shows "—", never $0.00.
- **Instead of:** a single page with a scope switcher over the session-derived report, or upstream's master/detail page narrowed to configured providers.
- **Because:** the maintainer wants OMP's richer data and TUI `/usage` parity. The session-derived report cannot separate unpriced from free, and it hard-codes reasoning tokens to null.
- **Decided by:** user
- **Mine:** no
- **Revisit when:** the Host-authorized-reference design for usage (`worker/usage.ts:34-42`) must exclude non-OhPiChamber sessions.
- **Effort:** ux-feedback-2026-11-12

## 2026-11-13 - OMP settings live on the page that owns the concept

- **Decided:** each OMP setting is placed on the OpenChamber page that already owns its concept: Sessions, Chat, Behavior, Agents, Web search, Voice, Notifications, Git. New Tools and Memory pages hold capability toggles and the memory backend. The OMP page keeps only the long tail, rendered from OMP's settings registry instead of a hand-kept allowlist. A setting another page owns is never rendered twice.
- **Instead of:** an OMP hub page grouped by task that links out to owning pages.
- **Because:** 335 of the 450 TUI-visible settings were unreachable, while several OpenChamber controls duplicated OMP ones or claimed ownership without writing the OMP key. Placement by concept removes the duplicates without copying the TUI layout.
- **Decided by:** user
- **Mine:** no
- **Revisit when:** OMP adds a category field to its settings registry.
- **Effort:** ux-feedback-2026-11-12

## 2026-11-13 - OMP owns image generation and agent memory

- **Decided:** image generation uses OMP's `generate_image` tool and its `image` role; the `openchamber_image` host tool and the separate image-model picker are removed. Agent memory uses OMP's `memory.backend` (local, mnemopi, hindsight), managed on the new Memory page; the OpenChamber `memory` host tool and its store are removed.
- **Instead of:** keeping the host tools and disabling OMP's, or keeping both memory systems side by side.
- **Because:** each pair is two unrelated implementations of one capability that the model sees at the same time, with two settings surfaces.
- **Decided by:** user
- **Mine:** no
- **Revisit when:** an OpenChamber-only consumer needs the removed memory store's data.
- **Effort:** ux-feedback-2026-11-12

## 2026-11-13 - Next-prompt suggestions run at turn end, from the session model or the small model

- **Decided:** a suggestion is generated as soon as a turn completes, with no quiet timer. A setting chooses the generator: the session's own model through OMP's `runEphemeralTurn` (cache-warm, as the OMP TUI does), the small model, or off. It is on by default.
- **Instead of:** keeping the Host's 60-second quiet timer, or offering only the session-model path.
- **Because:** the 60-second timer, left from the OpenCode design, made suggestions arrive a minute late. The maintainer wants the choice of generator and accepts one extra billed request per turn by default.
- **Decided by:** user
- **Mine:** no
- **Revisit when:** OMP exposes a non-TUI composer prediction controller.
- **Effort:** ux-feedback-2026-11-12

## 2026-11-13 - Streaming text updates every 33 ms

- **Decided:** the UI event pipeline flushes every 33 ms, and streaming text passes through without a second per-part throttle.
- **Instead of:** the current 100 ms pipeline flush stacked on a 100 ms text throttle, or 16 ms or 50 ms.
- **Because:** the stacked gates made streaming arrive in 10 Hz chunks. 33 ms matches the OMP TUI's minimum render interval.
- **Decided by:** user
- **Mine:** no
- **Revisit when:** markdown re-parse cost at 33 ms exceeds the session profiling budget.
- **Effort:** ux-feedback-2026-11-12

## 2026-11-13 - Chinese copy writes LLM tokens as "Token"

- **Decided:** zh-CN and zh-TW copy write LLM tokens as "Token". "词元", "詞元" and "令牌" are replaced in that sense.
- **Instead of:** "令牌", or keeping "词元".
- **Because:** "令牌" already means credentials (访问令牌), and the context and telemetry strings already use "Token".
- **Decided by:** user
- **Mine:** no
- **Revisit when:** a product glossary fixes a different term.
- **Effort:** ux-feedback-2026-11-12

## 2026-11-14 - Immediate session ID and queued prompt delivery; the prepared path meets the first-delta budget, the cold path does not

- **Decided:** `POST /sessions` returns immediately (~5–15 ms) with the initialized session ID while worker admission and launch proceed asynchronously, and prompt delivery (`POST /runs`) queues behind worker readiness. To keep a new chat fast for the path a user actually takes, the Host Gateway and Canonical Client also support bounded speculative session preparation (`/api/agent/v1/sessions/prepare`), triggered when the user opens the new-chat composer for a workspace (and as an explicit variant in the performance test). The speculative session is bounded (≤1 per workspace), idle-reaped after five minutes, discarded on draft cancellation and on Host shutdown, and consumed on session creation, so the session graph is already built and ready when the prompt arrives.
- **Instead of:** retaining synchronous worker `ready` before returning from `POST /sessions` (stalling session creation at ~880–1150 ms) or leaving heavy OMP SDK graph initialization on the critical prompt delivery path.
- **Because:** the independent reviews of tasks 17 and 24 measured that a worker launch plus SDK `createAgentSession` inherently cost ~500 ms, which puts the cold path's first `part.delta` above the 600 ms budget. The three measured paths, from `task24/after-8` and `after-9` receipts plus the round-3 review's independent run:
  - **Prepared (composer open, then send)** — what the product does: first `part.delta` p50 **≈ 220–260 ms**, `POST /sessions` p50 6–7 ms. Meets both budgets in every run.
  - **Cold, no prepare**: `POST /sessions` p50 13–15 ms (meets its budget) but first `part.delta` p50 **≈ 720–800 ms on a lightly loaded machine and ≈ 855–934 ms under load**. Does not meet 600 ms.
  - **Prepare issued and abandoned immediately before send**: first `part.delta` p50 **≈ 780–1020 ms** and `POST /sessions` p50 **560–750 ms**, because creation waits on its own in-flight prepare. This is an accepted, documented miss of the 400 ms creation budget.

  The remaining cold-path cost is measured, not assumed: `createAgentSession` ≈ 109 ms, serial agent-loop preparation before the provider call ≈ 144 ms, and supervisor queueing ≈ 60 ms, all in one process on one thread. The post-init `Promise.all` that fills the rest is concurrent, not serial: its branches' CPU time exceeds their own wall time, so their wall time is queueing (see the task file's sub-step table).
- **Open, for the maintainer:** the cold path's ≤ 600 ms first-delta budget needs a waiver, or an SDK seam that lets a session graph be built in a spare process (OMP's `AgentRegistry.global()` is process-wide, so the attempt was rejected: it regressed the cold path and conflicted on the registry). The prepared path meeting the budget is not a substitute for the cold path meeting it; it is what the product does.
- **Decided by:** agent
- **Mine:** yes
- **Revisit when:** OMP SDK changes session initialization or worker process architecture, or the maintainer decides the cold path's budget.
- **Effort:** ux-feedback-2026-11-12

## 2026-11-14 - OMP settings name only verified owners; writes reach placed settings only

- **Decided:** an `owned-by` placement names only a control that writes that OMP key: `recap.enabled` and `recap.idleSeconds` → Chat → Session recap (`chat.session-recap`, task 11), `suggestion.generator` → `chat.suggestion-generator`. `tui.renderMermaid`, `tools.approvalMode` and `enabledModels` have no GUI writer of their OMP keys and are `tui-only`, so they stay off the OMP page and off the writable set. The `enabledModels` row is removed (untabbed, so hidden). The OMP write route accepts only ids present in the placement table, so an unplaced id is refused with 400.
- **Instead of:** `owned-by` rows for the mermaid, permission-default and providers controls, which write other keys, and the unrestricted write path the rewrite left behind.
- **Because:** the effort's rule that an `owned-by` row names a real writer could not hold for those three; without the gate, the route accepted every non-credential OMP id, widening the 157-id allowlist it replaced.
- **Decided by:** agent
- **Mine:** yes
- **Revisit when:** a GUI control starts writing `tools.approvalMode` or `enabledModels`, or task 12 moves the egress endpoints (`collab.*`, `share.*`, `stream.*`) onto a page.
## 2026-11-14 - Agent tool permissions editor queries live tool catalog and groups tools by domain

- **Decided:** the Agent tool permissions editor queries the live session or workspace tool catalog exposing name, label, description, tier (`read`, `write`, `exec`), and availability (`SessionToolsCatalogSchema`). Tools are grouped into 7 fork-owned domains (files and search, execution, web and external, planning and memory, multi-agent, OpenChamber, MCP and extensions) with collapsible sections, header tri-state checkboxes, and tier chips. Quick actions operate over available tools only, preventing 422 `UNSUPPORTED_CAPABILITY` on profile creation/activation. Dead `permissionPresetId` fields and inputs were deleted.
- **Instead of:** keeping the static flat 2-4 column grid over `OMP_TOOL_NAMES` and free-text permission preset ID.
- **Because:** `OMP_TOOL_NAMES` includes uninstalled, unconfigured, or gated tools (e.g. `ida`, `checkpoint`, `memory`, `github`), causing "Show all" to select unavailable tools and crashing profile activation with 422. A live catalog reflects real OMP settings and active extensions, allowing safe tool selection and clear user visibility.
- **Decided by:** agent
- **Mine:** yes
- **Revisit when:** OMP introduces runtime dynamic tool capability negotiation or fine-grained parameter-level permission rules.
- **Effort:** ux-feedback-2026-11-12

## 2026-11-14 - Auto-review and PR watch retire OpenCode staged reverts, queue holds, and client-side routing

- **Decided:** auto-review and PR watch retire OpenCode-specific staged reverts (`revertCommit`), manual queue release hooks (`onRunSettled`), client-driven prompt routing (`routeSend`), and session guidance (`sessionKnowledgeRuntime`), delegating send dispatch, queueing, observation leases, and provider routing exclusively to the canonical session service and global message stream hub.
- **Instead of:** maintaining OpenCode-shaped revert commit endpoints, manual queue settlement callbacks, or bespoke model-routing interceptors inside the review loop.
- **Because:** OMP has no staged-revert API, and prompts in the OMP architecture carry `KEEP_SESSION_MODEL` leaving routing to the session's active selection or Auto routing; observation leases (`hub.retainSession`) replace manual queue holds; and prompt context travels directly via synthetic context in `sessionService.send`.
- **Decided by:** agent
- **Mine:** yes
- **Revisit when:** OMP introduces native turn rollback checkpoints or session-level review transactional boundaries.
## 2026-11-14 - Enterprise-boundary OMP settings are placed `boundary`: never rendered, written or read by a GUI route

- **Decided:** settings that cross the enterprise boundary (relay, share and stream endpoints, collab and browser relay, image URL listeners, memory and search endpoints and API keys, dev autoqa push, OTLP telemetry) get the placement `boundary`. The OMP route omits them from its state, so their values never reach the browser, and refuses writes to them with 400. They stay editable only in `config.yml`, as before this task, when the OMP settings allowlist did not name them.
- **Instead of:** `tunnel:collab`, `memory:backend` and `chat:images` page placements, which would have let a GUI write egress targets and read secret values back.
- **Because:** the enterprise-boundary skill classifies these as egress, exposure, provider entry and telemetry. Their enforcement belongs at the crossing, and the mode's pin knobs do not exist yet. Web, Electron and mobile all reach this route through the same Host, so one enforcement point covers them.
- **Decided by:** agent
- **Mine:** yes
- **Revisit when:** a later task adds an admin pin for one of these endpoints; that needs the `enterprise-mode.js` knob, its test cases, and moving the `boundary` placement to a page.
- **Effort:** ux-feedback-2026-11-12

## 2026-11-14 - Untabbed engine settings without OMP copy are hidden, not drawn with raw ids

- **Decided:** the 38 settings that OMP's TUI never shows (untabbed, so no OMP label or description: retry internals, compaction tuning, skills discovery toggles, spotlight experiment, task overrides, thinking budgets) are removed from the placement table, so they default to `hidden`. `modelRoles` stays `engine` because the role editor draws it. A test asserts every `engine` row carries OMP's label and description.
- **Instead of:** writing locale copy for 38 internal settings in 15 locales, or keeping them as `engine` rows that show raw ids.
- **Because:** the real-path page drew raw ids such as `thinkingBudgets.high` as row labels. Their copy would be invented, and they are OMP tuning knobs that the page's own footer already says to edit in config.yml.
- **Decided by:** agent
- **Mine:** yes
- **Revisit when:** OMP ships labels for these settings, or the maintainer wants them in the GUI.
- **Effort:** ux-feedback-2026-11-12

## 2026-11-14 - The OMP route exposes only the settings a GUI owner draws or writes

- **Decided:** the OMP settings route returns and accepts only `OMP_SETTING_EXPOSED_IDS`: `engine` placements, `owned-by` placements, and `page` placements that a GUI control writes (today `defaultThinkingLevel`, written by Defaults). `tui-only`, untabbed (`hidden`), `boundary` and unwritten page placements are omitted from state and refused on write with 400. The path settings (`plan.autosaveDir`, `workspace.additionalDirectories`, `contextFiles.extra`, `mnemopi.dbPath`, `ovnfs.path`, `worktree.base`, `ida.installDir`, `browser.screenshotDir`, `python.interpreter`) and the off-host `skills.registryUrl` are `boundary`.
- **Instead of:** the earlier rule that refused only boundary and unplaced ids, which made tui-only ids readable and writable, contrary to the 2026-11-14 owners decision.
- **Because:** the old contract excluded remote URLs and configurable paths as a second authority and a path escape hatch. A placed row with no reader or writer is an unverified claim. The two decisions now agree.
- **Decided by:** agent
- **Mine:** yes
- **Revisit when:** task 12 adds a page control that writes another page placement; that key joins `GUI_WRITTEN_PAGE_KEYS` in the same change.
- **Effort:** ux-feedback-2026-11-12

## 2026-11-14 - Engine rows without a locale override show OMP's own label and description

- **Decided:** each `engine` row takes its label and description from OMP's registry. The locale overrides in `omp-settings.i18n.ts` cover the rows the page names, and any row without an override shows OMP's English text in every locale. The 131 engine rows are not mass-translated in this effort.
- **Instead of:** translating every engine row into 15 locales now, or hiding untranslated rows.
- **Because:** OMP's labels are themselves technical English, and the copy is OMP's own rather than an invented fallback. Mass translation of about 3,900 strings is a separate localization effort the maintainer did not ask for in this effort.
- **Decided by:** agent
- **Mine:** yes
- **Revisit when:** the maintainer schedules localization of the OMP settings page, or `locale-ui-patterns` is read to forbid English fallback on runtime-sourced copy; then translate or hide the affected rows.
- **Effort:** ux-feedback-2026-11-12
## 2026-11-14 - Child subagent session prompts inherit parentSessionId in Host routes to permit agentId

- **Decided:** Host session routes (`routes.js`) track admitted child sessions with their `parentSessionId` so `prepareDelivery` and queue append evaluate `isRoot` as `scope.parentSessionId === undefined`. Child subagent runs (`parentSessionId !== undefined`) bypass `assertRootPromptAdmission` and retain their profile `options.agentId`, while root sessions continue enforcing `options.agentId === null`.
- **Instead of:** Allowing `options.agentId` on root sessions, or mutating `agent-scope-store` schema/SQLite tables during this task.
- **Because:** Root prompt admission intentionally enforces `agentId === null` for user-entered root turns (where model routing or default agents govern). Child subagents, however, are spawned with specific profile agent IDs (such as `task`, `sonic`, `reviewer`, or user-defined profiles). Tracking child parentage in the session admission route provides exact root/subagent discrimination without schema migrations.
- **Decided by:** agent
- **Mine:** yes
- **Revisit when:** SQLite `host_agent_sessions` durable schema adds a first-class `parent_session_id` column across all sessions.
- **Effort:** ux-feedback-2026-11-12
## 2026-11-15 - The 2026-11-12 feedback cutovers own the remaining files they rewrote

- **Decided:** these `fork-differs` paths keep the fork blob because this effort's own work produced them: the UI-blocks guidance test no longer mirrors a generated server module (`chat/uiBlocks/guidance.test.ts`), the shared sortable visibility list `shared/SettingsSortableVisibilityList.tsx`, the Settings window's keyboard reorder and plugin-category fix (`views/SettingsWindow.tsx`), the `parseProjects` round-trip test for the dropped per-project `defaultAgent` (`lib/settings/parsers.test.ts`), the Magic-prompts sidebar without the retired memory prompts (`sections/magic-prompts/MagicPromptsSidebar.tsx`), and the stream-cadence harness (`scripts/perf/scenario.mjs`, `scripts/profile-session.mjs`).
- **Instead of:** taking upstream's copy of each file, which still generates the ui-blocks module, keeps the OpenChamber memory prompts, reads `defaultAgent` from project settings, and has no stream-cadence scenario.
- **Because:** each file is the surviving half of a cutover this effort made on purpose; upstream's version reintroduces the behavior the cutover removed, and the reference comparison was run against the fork blob. The drift ledger's job is to force this listing, not to prefer upstream.
- **Decided by:** agent
- **Mine:** yes
- **Revisit when:** upstream rewrites one of these files on a contract the fork also accepts.
- **Effort:** ux-feedback-2026-11-12
## 2026-11-15 - Row 16 ships PARTIAL with task 24 blocked on the 600 ms variant-(a) budget

- **Decided:** task 20 closes with row 16 recorded as PARTIAL, and task 24 keeps `Status: blocked` on its cold-path first-delta budget (variant (a), the new chat that never calls `prepare`: ~760 ms against ≤ 600 ms). The cold-prompt stall the maintainer reported is fixed and measured on both surfaces (501 ms Web / 495 ms Electron against 1529 / 1568 ms before); the remaining number is the harness variant only.
- **Instead of:** marking row 16 PASS on the strength of the fixed user path, or clearing task 24's blocked status by redefining the budget to the variant the product actually uses.
- **Because:** the Check names first `part.delta` on a new chat explicitly and only the maintainer can waive a budget, so a green row would be a claim the receipt does not support. The measured remainder is real work in one process on one thread — `createAgentSession`, serial agent-loop preparation before the provider call, and supervisor queueing — and the alternative is an OMP SDK seam that builds a session graph ahead of the call, which is a design decision, not an acceptance one.
- **Mine:** yes
- **Revisit when:** the maintainer waives the 600 ms budget for the cold variant, or the OMP SDK exposes a prebuilt session graph so a spare can construct one ahead of the prompt.
- **Effort:** ux-feedback-2026-11-12
## 2026-11-15 - Task 02's asar-guard revert stays unlanded

- **Decided:** `16199d2a6b` (`revert(web): drop unneeded asar guard in standalone-loader symlinks`) is left out of the integration branch.
- **Instead of:** landing it because the guard looked like dead code in a development tree.
- **Because:** it is load-bearing for the packaged app: `ensureAgentRuntimeSymlinks` writes inside the runtime root, `packages/electron/package.json` stages `resources/agent-runtime`, and the asar copy of `@openchamber/web/resources` is read too. The commit also removed a `try/catch` around `mkdirSync`, packaged Electron was verified working **with** the guard, and no test under `packages/web/server/**/*.test.js` imports `standalone-loader` — so nothing in the suite would have caught the breakage.
- **Mine:** yes
- **Revisit when:** the symlink writer stops writing inside the runtime root, or a packaged-Electron test covers `standalone-loader`'s symlink path so the guard's absence fails loudly.
- **Effort:** ux-feedback-2026-11-12

## 2026-11-15 - The cold-path first-delta budget is waived

- **Decided:** the W11 budget of ≤ 600 ms from send to the first `part.delta` is waived for a new chat that never calls `prepare` (variant (a), measured ~720–800 ms p50 on a lightly loaded machine). Task 24 archives with `Check waived:`, and row 16 of the acceptance matrix stands as accepted.
- **Instead of:** funding an OMP SDK seam that lets a spare worker build a session graph ahead of the prompt, or holding the effort open until one exists.
- **Because:** the path users take (`openNewSessionDraft` calls `prepare`) measures 220–280 ms and meets the budget, `POST /sessions` fell from ~1 s to 13–15 ms, and the remaining cold cost is OMP's own `createAgentSession` (~110 ms), agent-loop preparation (~145 ms) and supervisor queueing (~60 ms), which this repository cannot remove while `AgentRegistry.global()` is process-wide.
- **Decided by:** user
- **Mine:** no
- **Revisit when:** OMP exposes a prebuilt or per-process session graph, or the cold path becomes a path users routinely take.
- **Effort:** ux-feedback-2026-11-12

## 2026-11-15 - The Host classifies OMP tools by the tier each tool declares

- **Decided:** the worker sends each tool call's declared OMP approval tier (`read`, `write` or `exec`, resolved from the live registry with the call's arguments) on `policy.request`. The Host authorizer drops its read and write name lists, keeps the argument-aware special cases, and classifies every other tool by that tier: read after the path check, write after the workspace check, exec and unknown as `approvalRequired`. Hard denials remain only for writes outside the workspace, explicit deny rows, enterprise mode, unconfigured MCP servers and isolated delegation. The coverage test enumerates live tool names in main, plan and vibe modes. This replaces the name-list half of "Host authorizes OMP tools by tier, not by a known-name list" (2026-11-13); its tier semantics stand.
- **Instead of:** letting OMP's `tools.approvalMode` decide prompts while the Host keeps only invariants, or adding the `vibe_*` names to the list.
- **Because:** vibe mode leaves the director with only `vibe_*` tools, which no list named, so the final deny refused every call and `auto` could not help. OMP cannot express the workspace boundary, and under `ask` its gate would stop raising our card for `eval` and MCP. A list fails again with the next OMP, extension or plugin tool.
- **Decided by:** user
- **Mine:** no
- **Revisit when:** OMP exposes a path-aware approval policy the Host can delegate to, or ADR-05 changes the path boundary.
- **Effort:** ux-feedback-2026-11-15

## 2026-11-15 - The todo tray shows only while a task is open

- **Decided:** a todo result with no tasks renders only its text, and the composer tray renders only while at least one task is neither completed nor abandoned. The chat history keeps every todo card.
- **Instead of:** hiding a finished plan after OMP's `tasks.todoClearDelay` (60 s), or keeping the `N/N` row.
- **Because:** the maintainer reported an empty box and a tray that stays when nothing is in progress.
- **Decided by:** user
- **Mine:** no
- **Revisit when:** the tray reads OMP's canonical todo state, including `todo_hud_state` dismissal, instead of tool results.
- **Effort:** ux-feedback-2026-11-15

## 2026-11-15 - MCP sign-in starts on install, polls to completion, and redirects by runtime

- **Decided:** an install whose probe needs authorization saves the server, reports "sign in to finish", starts the OAuth flow, opens the authorization page once and polls until connected. A local desktop runtime keeps the Agent Service loopback on a fixed dedicated port. A remote Web, mobile or remote-Host desktop client uses a public Host callback route that validates `state`. Enterprise mode refuses MCP OAuth at the authorizer and at the callback route with `403 enterprise_mode`. Provider failure reasons reach the panel, and a server with closed client registration offers a client-ID field.
- **Instead of:** a separate "Sign in" click, the SDK loopback alone with a paste field, or leaving MCP OAuth ungated in enterprise mode.
- **Because:** the install copy already promises a browser sign-in. A loopback on the Agent Service is unreachable from a remote or mobile browser. An MCP server carries conversation content to a third party, the same class as provider entry.
- **Decided by:** user
- **Mine:** no
- **Revisit when:** OMP's callback server becomes configurable to a Host-owned origin, or enterprise mode gains a per-service allowlist.
- **Effort:** ux-feedback-2026-11-15

## 2026-11-15 - Model auto-fill reads OMP's bundled catalog first and OpenRouter second

- **Decided:** "尝试自动填写模型信息" (try to fill in model info) fills context window, max output, input modalities, tool support, reasoning and pricing from `@oh-my-pi/pi-catalog` through `resolveModelReference`, offline. Only models the catalog misses go to OpenRouter's public models API through the Host, which sends model ids only. Enterprise mode refuses the OpenRouter request with `403 enterprise_mode`, and the UI reports a catalog-only result. Auto-fill never overwrites a value the user typed.
- **Instead of:** OpenRouter only, or the catalog only.
- **Because:** the catalog is the data OMP executes with and already matches vendor-prefixed and bracketed ids. OpenRouter covers ids the catalog lacks, but it is a second authority and an egress call.
- **Decided by:** user
- **Mine:** no
- **Revisit when:** OMP's catalog gains a refresh channel, or OpenRouter stops being the broadest public model list.
- **Effort:** ux-feedback-2026-11-15

## 2026-11-15 - Settings rows use one row pattern, one set of control sizes and one spacing scale

- **Decided:** every settings row is label-left, control-right, with the control aligned to the row's trailing edge. OMP rows of every type follow it, booleans as checkbox rows. Named classes in `SettingsSection.tsx` set control widths (select, number stepper, short text, long text) and vertical spacing (section, row stack, checkbox stack). Pages stop adding their own widths and section spacing, and a guard test rejects raw width or spacing utilities on controls in `components/sections`. The 840 px page cap stays.
- **Instead of:** stacked fields with a wider page, or removing the page cap now.
- **Because:** the empty right side came from stacked rows capped at 24 rem and an inert trailing alignment, not from the page width, which matches upstream. The maintainer asked for spacing and control sizes to be unified across Settings.
- **Decided by:** user
- **Mine:** no
- **Revisit when:** the maintainer finds the pages cramped after the row fix.
- **Effort:** ux-feedback-2026-11-15

## 2026-11-15 - The OMP settings page has four tabs, ordered by a layout table

- **Decided:** the OMP page renders 常用 (Common), 编辑与读取 (Editing & reading), 执行与工具 (Execution & tools) and 高级 (Advanced) from a layout table (tab → group → ordered ids) instead of OMP's `group` and declaration order. 高级 holds only internal tuning, and ends with the config.yml footer. The four read-summary thresholds get a preset that writes all four keys and shows 自定义 (Custom) for any other tuple. Rows Sessions, Agents, Memory, Chat, Tools or Behavior already own stay there. `dev.autoqa` and `spotlight.experiment.enabled` become `boundary`; five terminal-presentation rows become `tui-only`. Every row is searchable, and search opens its tab. Copy, option labels and units exist in all 15 locales. This supersedes "Engine rows without a locale override show OMP's own label and description" (2026-11-14), which the 15-locale test had already overtaken.
- **Instead of:** three tabs, a separate experimental tab, or gathering other pages' complex rows into 高级.
- **Because:** the page was a 93-row wall in OMP's declaration order, with raw English option chips, missing units and 85 unsearchable rows. Moving rows off their concept pages would relocate owners and search entries without addressing the complaint.
- **Decided by:** user
- **Mine:** no
- **Revisit when:** OMP adds a category or advanced marker to its settings registry.
- **Effort:** ux-feedback-2026-11-15

## 2026-11-15 - Routing categories are a flat disclosure list and save only when valid

- **Decided:** routing categories render as a flat disclosure list built on a shared `SettingsDisclosure` primitive, enabled by a checkbox. A new category needs a name and a description. The debounced save runs only for a valid draft, and an invalid one shows an inline helper while the save state stays idle.
- **Instead of:** a card grid with a detail screen per category, or a placeholder description.
- **Because:** a new category carried an empty description that the server rejects, so the draft never saved. A placeholder would be sent to the router as real criteria, and a card grid adds a navigation step to a short list.
- **Decided by:** user
- **Mine:** no
- **Revisit when:** routing gains enough categories that a single list stops fitting on a screen.
- **Effort:** ux-feedback-2026-11-15

## 2026-11-15 - Provider IDs follow OMP's selector grammar, not the OpenCode-era pattern

- **Decided:** custom provider IDs accept letters, digits, `.`, `_` and `-` (up to 128), are unique regardless of case, and refuse `/`, `#`, `@`, `:`, whitespace and prototype names. `configureProvider` rejects `/` with 422. Custom base URLs may carry a query string. MCP server names follow OMP's `^[A-Za-z0-9_.-]{1,100}$`. Env-backed built-in providers show their variable name and offer a key field; the contract carries the variable name only.
- **Instead of:** keeping `^[a-z0-9][a-z0-9_-]*$`, or dropping client validation.
- **Because:** the pattern came from upstream's OpenCode era. OMP accepts any `models.yml` key and matches ids case-insensitively. Only the selector delimiters and object-key hazards break anything.
- **Decided by:** user
- **Mine:** no
- **Revisit when:** OMP's selector grammar changes.
- **Effort:** ux-feedback-2026-11-15

## 2026-11-16 - Ship as OhPiChamber with its own identifiers and a fresh data directory

- **Decided:** the product is named OhPiChamber on every user-facing surface (window title, app names, PWA manifest, UI copy), with an About credit "Based on OpenChamber" and the upstream MIT notice. External identifiers move to the `dev.ohpichamber` prefix: Electron `dev.ohpichamber.desktop`, mobile `dev.ohpichamber.app` (extensions under it), CLI `ohpichamber`, URL scheme `ohpichamber://`, data directory `~/.config/ohpichamber`, environment prefix `OHPICHAMBER_*`. Nothing is imported from `~/.config/openchamber`.
- **Instead of:** keeping the OpenChamber name and identifiers, or renaming but importing selected files from the upstream data directory on first start.
- **Because:** shared app IDs make an upstream install and this fork overwrite each other, and a shared data directory lets both read one `settings.json` whose schema has diverged. An import path would mean reading OpenCode-era keys, which the no-fallback cutover rule forbids.
- **Decided by:** user
- **Mine:** no
- **Revisit when:** a released OhPiChamber build exists and users report needing their upstream settings.
- **Superseded by:** 2026-11-16 - Rename what users and the OS see; keep OPENCHAMBER_* variables and private names

## 2026-11-16 - Cut the fork off from upstream-hosted services

- **Decided:** desktop auto-update reads GitHub Releases of `Shizuku-Yume/ohpichamber`. The first release disables or hides every other `openchamber.dev` dependency: the CLI update check (`api.openchamber.dev/v1/update/check` and the `@openchamber/web` dist-tags), the changelog API, the APNs push relay, the Linear OAuth broker and the `downloads.openchamber.dev` mirror. Documentation links point at this repository's docs.
- **Instead of:** disabling desktop auto-update as well, or self-hosting replacements for each service.
- **Because:** every one of these endpoints belongs to upstream. The updater and CLI update check would replace the fork with upstream's OpenCode build, and the push relay and OAuth broker hold credentials bound to upstream's app IDs. GitHub Releases needs no server, while the other services would each need hosting and credentials (APNs needs an Apple developer account, which M7 does not require).
- **Decided by:** user
- **Mine:** no
- **Revisit when:** the maintainer decides to host a push relay or an OAuth broker.

## 2026-11-16 - First release is 1.0.0 under the ohpichamber package names, stable channel only

- **Decided:** the first fork release is `1.0.0`. The npm package is provisionally `ohpichamber` and the Guest SDK is `ohpichamber-sdk`, both unscoped; the maintainer handles registry publishing at release time. Desktop ships the stable channel only: the canary channel and its icon set are removed.
- **Instead of:** keeping `3.0.0` and the `@openchamber/*` package names, publishing under a new npm org scope, or keeping a canary channel with a badged icon.
- **Because:** the `@openchamber` scope belongs to upstream and cannot be published to. Since the package names change anyway, starting from `1.0.0` keeps the fork from looking like the next upstream 3.x release. A single maintainer has no use for a second update channel.
- **Decided by:** user
- **Mine:** no
- **Revisit when:** the npm name `ohpichamber` turns out to be unavailable, or a pre-release channel becomes needed.
- **Supersedes:** 2026-10-27 - Keep the fork version at 3.0.0

## 2026-11-19 - Sign local iOS simulator builds for Keychain

- **Decided:** sign iOS simulator builds with Xcode's ad-hoc identity and no development team.
- **Instead of:** disabling code signing for simulator builds.
- **Because:** unsigned builds cannot save mobile Host credentials to Keychain and fail with error `-34018`.
- **Revisit when:** upstream's simulator build supports Keychain without a development team.

## 2026-11-16 - Rename what users and the OS see; keep OPENCHAMBER_* variables and private names

- **Decided:** what a user or the operating system sees is renamed. The product is OhPiChamber on every user-facing surface, with an About credit "Based on OpenChamber" and the upstream MIT notice. Electron uses `dev.ohpichamber.desktop`, mobile `dev.ohpichamber.app` (extensions under it), the CLI is `ohpichamber`, the URL scheme `ohpichamber://`, the data directory `~/.config/ohpichamber`, and Electron's user-data folder `OhPiChamber`. Nothing is imported from `~/.config/openchamber`. Environment variables keep the `OPENCHAMBER_*` prefix (209 names, 2845 references) and are documented as the fork's configuration names. Private workspace packages keep their `@openchamber/*` names, and code identifiers (`OpenChamberLogo`, the `OpenChamberWidget` Xcode target) stay.
- **Instead of:** keeping the OpenChamber name and IDs; renaming but importing selected files from `~/.config/openchamber` on first start; renaming every variable to `OHPICHAMBER_*`; or renaming only the dozen variables users set by hand.
- **Because:** shared app IDs and a shared data directory make an upstream install and this fork overwrite each other and read one `settings.json` whose schema has diverged. An import path would mean reading OpenCode-era keys, which the no-fallback cutover rule forbids. The fork merges upstream with real git merges, so every renamed line conflicts each time upstream touches it, and users never see private names. The renamed data directory, IDs and CLI already keep the two installs apart, so the shared variable prefix collides with nothing.
- **Decided by:** user (name, IDs, data directory, environment variables); agent (private package and code names)
- **Mine:** partly: the private package and code-name scope is mine
- **Revisit when:** a user runs upstream OpenChamber and this fork in one environment and the shared prefix causes a real misconfiguration.
- **Effort:** rebrand
- **Supersedes:** 2026-11-16 - Ship as OhPiChamber with its own identifiers and a fresh data directory

## 2026-11-16 - Rebrand in two phases around the open UX effort

- **Decided:** the icon pipeline, identifiers, update feed, upstream-service cutoff, package names and canary removal land now. The product-name change across UI copy (160 i18n files, 5236 references) and documentation waits until `ux-feedback-2026-11-15` lands on `main`. When the rename lands, the maintainer's operator files in `~/.config/ohpichamber` are deleted, and from then on that directory holds the maintainer's real product data.
- **Instead of:** waiting for every in-progress effort before starting, or renaming all copy now and resolving conflicts later.
- **Because:** the open effort has 13 tasks rewriting UI copy, and a parallel mass string rename would conflict with each of them. The identity, icon and service work barely touches copy, and the update-feed fix is the urgent part.
- **Decided by:** user
- **Mine:** no
- **Revisit when:** `ux-feedback-2026-11-15` is abandoned or split so that its remaining tasks no longer touch UI copy.
- **Effort:** rebrand

## 2026-11-16 - The OhPiChamber mark is the upstream cube with an OMP π folded over its front edge

- **Decided:** the mark keeps upstream's cube unchanged: open shell, three roof tiers with a white centre, white edges, black outline. An OMP-proportioned π (bar 42, legs 40 and 41 wide, short left leg, measured from the official OMP mark) lies on the left face. Its bar covers the top-left edge, its long leg is the front vertical edge, and the bar folds round onto the right face as an opaque strip shaded one step darker. The π shades from white at the top to `#9fa1a6` on the left face and from `#d6d7da` to `#85878d` on the fold. The approved master is concept I2 at `/home/shizuku/Project/ohpichamber-omp-artifacts/icon-concepts-2026-11-16/ohpichamber-icon-i2.svg`. It is rebuilt in code by restoring upstream's `scripts/brand` generator without the VS Code, OpenCode and canary outputs.
- **Instead of:** a π floating inside a glass cube (P3/V-series), a π engraved or embossed on the roof, a recoloured upstream cube, or hand-exported icon files.
- **Because:** the maintainer chose the folded edge (E2 → G5 → H5 → I2) over twelve glass-cube and edge-treatment variants, because there the cube's edges become the π instead of crossing it. Upstream's generator already draws every platform drawing from one geometry file, and its only dependency, `sharp`, is installed.
- **Decided by:** user (design); agent (generator restore)
- **Mine:** partly: restoring the generator is mine
- **Revisit when:** the 16–32 px drawings cannot show the π legibly and the maintainer rejects the simplified small sizes.
- **Effort:** rebrand

## 2026-11-18 - Restart the technical debt sweep from main and fix every open entry

- **Decided:** `tech-debt-sweep` restarts from `main` (`ad4d78dd57`) with a new integration branch. The old `tech-debt-sweep/integration` and its task branches are kept as tags under `archive/tech-debt-sweep-2026-11-08` and then deleted. Every open `technical-debt.md` entry gets a fixing task; fixed entries are deleted. An entry may stay only when its fix needs an upstream OMP change, with a decision naming that change.
- **Instead of:** merging the 2026-11-08 branch (1,509 commits behind, built against 18 dead files where `main` now has 43) or declining the open entries.
- **Because:** the maintainer asked on 2026-11-18 to finish the debt rather than carry it ("有的修复了就删去 没修复的去修复 最好全部结个尾").
- **Decided by:** user
- **Mine:** no
- **Revisit when:** never; this records the restart.
- **Effort:** tech-debt-sweep

## 2026-11-18 - Build per-session cache warming on the Agent Service

- **Decided:** Implement per-session cache warming as a canonical session-level route and state on the Agent Service, applied by the worker through OMP's native warming, with the session menu toggle and Settings field rebuilt on it (`tech-debt-sweep/06`). The session value overrides the workspace mode for that session.
- **Instead of:** keeping the 2026-10-29 deletion as final, or a Host-side ping loop.
- **Because:** the 2026-10-29 entry deferred the feature until a canonical session-level route existed; the maintainer asked on 2026-11-18 for every open debt entry to be fixed, and this is one.
- **Decided by:** user
- **Mine:** no
- **Revisit when:** OMP changes how cache warming is scoped.
- **Effort:** tech-debt-sweep

## 2026-11-18 - Close the five landed efforts on their recorded evidence

- **Decided:** `omp-native-chat`, `omp-native-parity`, `omp-through-m3`, `upstream-rebaseline` and `ux-and-omp-parity-remediation` are accepted and closed. Each closeout maps its W checks to the recorded evidence, or to the later effort and full gate that re-verified the same surface (`m6-audit-and-polish`, `ux-feedback-2026-11-15` task 13), instead of rerunning historical checks on old tips.
- **Instead of:** rerunning every historical W check on the current tip, or leaving the specs `in progress` indefinitely.
- **Because:** every task of these efforts is archived and their code is on `main`; later efforts rebuilt and re-gated the same surfaces. The maintainer asked on 2026-11-18 to end what is finished ("该结束的结束").
- **Decided by:** user
- **Mine:** no
- **Revisit when:** a defect is traced to one of these efforts; it is fixed as a new task, not by reopening the spec.
- **Effort:** tech-debt-sweep
## 2026-11-16 - MCP sign-in failure is a contract-visible result, and a closed registration asks for the client ID

- **Decided:** the sign-in contract gains `MCP_OAUTH_IN_PROGRESS` (HTTP 409), `MCP_OAUTH_CLIENT_REGISTRATION_REJECTED` (HTTP 422) and an optional `error` on the unauthenticated `MCPOAuthResult`. A closed client registration reveals and focuses the client-ID field and shows the provider's own sentence; nothing is pre-filled, because no client ID is known, and no app-registration link is added. A failure after the browser handoff has no request left to throw from, so it is reported once through `MCPOAuthResult.unauthenticated.error`. The OAuth redirect stays `http://localhost:3000/callback` here and belongs to task 05.
- **Instead of:** keeping one opaque `MCP_OAUTH_FAILED` and a `CATALOG_CONFLICT` for a second start, or adding a link to each provider's app-registration page.
- **Because:** the panel must distinguish "already signing in" from a real conflict and must show why a handoff failed, and polling every 1.5 s otherwise resets to plain unauthenticated. A registration link would need per-provider URLs nobody maintains.
- **Decided by:** agent
- **Mine:** yes
- **Revisit when:** OMP exposes a provider registration directory, or the redirect origin moves to the Host.
## 2026-11-16 - Custom provider IDs keep a leading letter or digit

- **Decided:** the provider-ID pattern is `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`, narrower than the bare character set in "Provider IDs follow OMP's selector grammar": the first character must be a letter or digit. IDs like `.`, `..` or `-x` are refused.
- **Instead of:** accepting the whole `[A-Za-z0-9._-]` set in any position, which OMP itself would accept.
- **Because:** the same id reaches logo routes and settings keys, so a leading `.` reads as a hidden file, a leading `-` reads as a CLI flag, and `.`/`..` read as path segments. The narrower first character costs no real provider name.
- **Mine:** yes
- **Revisit when:** a provider name or OMP-side convention needs a leading dot or hyphen.
- **Effort:** ux-feedback-2026-11-15

## 2026-11-16 - `OmpSettingsState` carries `placementCounts`, because the page cannot count rows it never receives

- **Decided:** `OmpSettingsState` gains `placementCounts: { tuiOnly, boundary, elsewhere }`. The Agent Service computes all three from the placement table over every registry row: `tuiOnly` and `boundary` count rows by placement, and `elsewhere` counts the rows state actually carries for another Settings page (`page` or `owned-by`). The 高级 config.yml footer renders those three numbers as its three sentences instead of deriving them.
- **Instead of:** letting `OmpSettingsPage` count the rows it has and label the remainder "not shown", or adding the absent rows to `settings` with a `hidden` flag for the page to filter.
- **Because:** `tui-only` and `boundary` rows never reach `state().settings`, so the page sees neither their ids nor their placement; anything it computed would have to infer the split from `totalCount` minus what it drew, which cannot distinguish terminal presentation from egress from another page's owner. Shipping absent rows in `settings` would have widened the write surface to rows the page must never offer. The measured footer is `tuiOnly: 83`, `elsewhere: 179`, `boundary: 42` over 602 registry / 265 exposed rows.
- **Mine:** yes
- **Revisit when:** OMP exposes placement in a runtime API, or another surface needs the same split.
- **Effort:** ux-feedback-2026-11-15

## 2026-11-16 - `providers.autoThinkingMaxEffort` sits on 常用 and `read.summarize.enabled` is owned by the preset row

- **Decided:** `providers.autoThinkingMaxEffort` is placed on 常用 in the `toolsAndModels` group, gated by the new `autoThinkingActive` condition (shown only when `defaultThinkingLevel` is `auto`), rather than on 高级. `read.summarize.enabled` has no row of its own: the `preset.readSummary` row owns it and writes it together with the four thresholds, and 编辑与读取 remains the tab that row lives on.
- **Instead of:** putting the auto ceiling with the other model-internals tuning on 高级, and giving `read.summarize.enabled` its own switch beside the preset.
- **Because:** the ceiling only scales the automatic thinking level, so a user who never sets `auto` never acts on it — 高级 would advertise a knob that does nothing for them. A separate enable switch next to a preset that already sets it produced two controls for one value and a state where the switch contradicts the preset.
- **Mine:** yes
- **Revisit when:** OMP makes the auto ceiling apply outside the `auto` preset, or the preset stops writing `enabled`.
## 2026-11-16 - Catalog installs that collect environment values are project-scope only

- **Decided:** when any `envInputs` value is filled, a catalog MCP install writes workspace credentials and therefore installs at project scope only. The scope dialog disables the user option and says why, and with no project selected the Install button stays disabled. An entry whose env values are all empty keeps both scopes.
- **Instead of:** allowing user scope with credential references in the shared user MCP file.
- **Because:** `NativeMcpCredentials` prefixes every reference with a hash of the writing workspace (`packages/agent-service/src/worker/mcp-credentials.ts:12`), and the user MCP file is shared by every workspace (`packages/agent-service/src/worker/mcp.ts:391-393`); a reference written in one workspace makes another workspace's config save fail when the worker resolves it (`stateless.ts:220-223`). The same hazard already exists for catalog token entries saved at user scope and was not changed here.
- **Decided by:** agent
- **Mine:** yes
- **Revisit when:** credential references become workspace-independent, or the user MCP file can carry per-workspace server entries.
## 2026-11-16 - MCP OAuth callback state is bound to the flow, not the initiating browser session

- **Decided:** the public `GET /api/agent/v1/mcp/oauth/callback` route accepts a `state` that the Host recorded from the proxied `start` response's authorization URL. It does not bind that state to the browser session, cookie or IP that started the flow, matching the existing guest and extension-tracker public callbacks (`guests/routes.js`, `trackers/routes.js`).
- **Instead of:** adding a second, session-bound nonce to the redirect and rejecting a callback from a different browser.
- **Because:** the workspace MCP credential store is shared by every surface and user of that workspace, so a completed sign-in is not scoped to the browser that began it. Binding to a session cookie would break the intended remote and mobile case (the consent browser is often a different browser profile, or the system browser rather than the Capacitor webview), and it would not add authority the credential store does not already carry. The accepted risk is a login-CSRF-class one: an attacker who obtains a live `state` can finish a sign-in the victim started, which yields the same credential the victim was already granting.
- **Decided by:** agent
- **Mine:** yes
- **Revisit when:** MCP credentials become per-user or per-device, or the Host gains a session-bound consent surface.
- **Effort:** ux-feedback-2026-11-15

## 2026-11-16 - The settings layout refactor owns the fork-differs paths it touched

- **Decided:** the 16 `fork-differs` settings/UI paths the drift report listed after the 2026-11-15 feedback work keep the fork blob and are recorded as `decision` rows: `CustomEndpointFields`, `CatalogExtensionsSection`, `TrackerProjectMapping`, `TrackerSessionComments`, `AboutReleaseNotes`, `DesktopAppSettings`, `DesktopNetworkSettings`, `DesktopQuakeModeSettings`, `OpenChamberVisualSettings`, `PasskeySettings`, `ProviderInstanceAccounts`, `SessionRetentionSettings` and its test, `ProjectWorktreesTab`, `SettingsSection` and `PublishDialog`.
- **Instead of:** reverting them to upstream's inline `space-y-*` utilities and per-page control widths, or leaving them `unexplained`.
- **Because:** each file is a call site or the definition of the 2026-11-15 decision that every settings row is label-left/control-right on one shared width and spacing scale, with a guard test that rejects raw width or spacing utilities in `components/sections`. Those commits renamed the shared classes (`SETTINGS_SPACE_ROW_CLASS`, `SETTINGS_WIDTH_*_CLASS`) and re-pointed the call sites, so upstream's blob would reintroduce exactly the ad-hoc utilities the refactor removed.
- **Mine:** yes
- **Revisit when:** upstream adopts a shared settings width/spacing scale, so the fork blob no longer carries behavior upstream lacks.
- **Effort:** ux-feedback-2026-11-15

## 2026-11-16 - The integrations catalog declares environment inputs for local MCP entries

- **Decided:** local catalog MCP entries carry `local.envInputs` (`{ id, envName, labelKey, required? }`) and the install form collects them; `registry.test.ts` asserts the declared inputs are unique, upper-snake env names and labelled under the entry id. The entry keeps the fork blob against upstream's catalog, which has no `envInputs` field.
- **Instead of:** leaving the values as `{token}` placeholders inside `command`, or dropping the declaration to match upstream.
- **Because:** a value written into `command` lands in the MCP config in plain text, while `envInputs` becomes a workspace credential behind `envCredentialRefs`; the catalog is the fork's own surface bound to the canonical agent service, so upstream's registry has nothing to adopt here.
- **Mine:** yes
- **Revisit when:** upstream's catalog gains an environment-input model the fork can adopt.
- **Effort:** ux-feedback-2026-11-15

## 2026-11-17 - Settings controls share the 28 px height, and the stepper cluster opts in by `data-slot`

- **Decided:** on desktop, a control inside `[data-settings-page]` is `h-7` (28 px), matching the dropdown trigger. `Input` gets there through the fork's `inputSize="compact"` prop at the call sites that upstream still sizes with a raw `h-8`, and `NumberInput`'s container carries `data-slot="number-input"` so the settings-page rule can size the stepper cluster and draw its 1 px border through `::after`, leaving the inner `<input>` (`h-full`) 28 px tall. `EnvironmentVariablesEditor` takes `inputSize="compact"` on its three fields instead of `h-8`; `NumberInput` gains only the slot marker.
- **Instead of:** keeping upstream's `h-8` utilities per call site, or sizing `NumberInput` through a `containerClassName` each caller passes.
- **Because:** the maintainer asked for one control height across Settings, and chat, dialogs and mobile touch targets must keep their own sizes. `inputSize` is a fork prop on a primitive upstream still has byte-identical (so `input.tsx` stays out of the ledger), and the slot marker is what the `[data-settings-page]` rule selects on: without it the stepper stayed 32 px beside 28 px selects. The same commit also re-indented `NumberInput`'s `no-explicit-any` oxlint directive, which is why that fork blob differs beyond the new attribute.
- **Mine:** yes
- **Revisit when:** upstream sizes settings controls from a shared token, or its `Input` grows a compact variant the fork can adopt instead of `inputSize`.
- **Effort:** ux-feedback-2026-11-15

## 2026-11-18 - Row selects hug their value again, and OMP option notes sit under the field label

- **Decided:** `SETTINGS_WIDTH_SELECT_CLASS` returns from `w-full @xl:w-56` to hug-with-cap sizing (`w-fit min-w-[8ch] max-w-[28ch]`), while `SettingsFieldRow` keeps `@xl:justify-end` so every row control still shares one trailing right edge. `OmpRowControl` passes the selected option's `description` to `SettingsFieldRow`'s `description` prop (under the left label) instead of stacking a `w-full` paragraph inside the `flex-1` control column. `settings-ui.test.ts` extends option-copy enforcement from `engine` rows to `page` rows as well.
- **Instead of:** keeping 224 px fixed-width row selects and right-aligning or floating the option helper text in the control column.
- **Because:** the maintainer reviewed the `4f9a7c7f39` candidate (`feedback-2026-11-18/1-*.png`, `6-*.png`) and reported both that 224 px selects look overlong and uncoordinated on short values (`Default`, `默认`, `500 行`) and that the helper subtext sits in the middle of the row. Upstream v2.7.0 used hug-width select triggers for the same reason, and `SettingsFieldRow` already owns a left-column `description` slot.
- **Decided by:** user
- **Mine:** no
- **Revisit when:** never; supersedes the fixed-select-width clause of 2026-11-15.
- **Effort:** ux-feedback-2026-11-15

## 2026-11-18 - Drop the `placementCounts` breakdown from the OMP `config.yml` footer

- **Decided:** remove the three placement-count sentences and raw config path from `OmpSettingsPage`'s `omp.configFile` footer, keeping only the `仍需在 config.yml 中修改` row/title and the `打开 config.yml` button, and remove `placementCounts` if no other caller reads it. Supersedes `2026-11-16 - OmpSettingsState carries placementCounts`.
- **Instead of:** keeping the count audit prose under the button.
- **Because:** the maintainer reviewed `feedback-2026-11-18/6-*.png` and explicitly asked to remove the footer small print ("omp高级设置最后 这个小字就没必要搞了"); `AGENTS.md` only requires the `open config.yml` affordance.
- **Decided by:** user
- **Mine:** no
- **Revisit when:** never.
- **Effort:** ux-feedback-2026-11-15

## 2026-11-18 - Routing categories are created in a complete dialog, fallbacks use `oc-tile` rows, and agent tools use flat `SettingsDisclosure` groups

- **Decided:** (1) Routing replaces its bare `新类别 [input] [添加]` row (which inserted an invalid empty-description category into the live draft and immediately showed warning + error banners) with an outline `+ 添加类别` button that opens a complete creation `Dialog` (Name, Model, Thinking, Description) validated on submit. (2) Web Search's fallback list renders each item inside a rounded `oc-tile oc-tile-hover rounded-xl` row via optional `listClassName`/`rowClassName` props on `SettingsSortableList`. (3) `AgentPermissionsEditor` drops its boxed cards, `divide-y` dividers, hardcoded palette `TierChip`s and `"Show all"`/`"Hide all"` wording in favor of accurate `Default` / `All available` / `None` chips, flat default-collapsed `SettingsDisclosure` groups with tri-state `accessory` checkboxes, and single-line `SettingsCheckboxRow` items with descriptions behind `SettingsInfoHint`.
- **Instead of:** patching individual error messages on inline incomplete category rows, adding borders to bare fallback rows, or restyling `AgentPermissionsEditor`'s cards.
- **Because:** the maintainer reviewed `feedback-2026-11-18/2..5-*.png` and asked for a complete rethink of routing category addition, rounded-rectangle surfaces on fallback items, and a ground-up rewrite of agent tool settings to match OpenChamber's design system (`PATTERNS.md`, `STYLING.md`).
- **Decided by:** user
- **Mine:** partly (specific `Dialog`, `oc-tile` and `SettingsDisclosure` mappings are mine)
- **Revisit when:** never.
- **Effort:** ux-feedback-2026-11-15

## 2026-11-18 - Keep spare workers at runtime prewarm until OMP splits session-graph preparation from session binding

- **Decided:** keep spare workers prewarming `NativeWorkerRuntime`, SDK module imports, plugin extension paths, and the initial model catalog read, without calling `createAgentSession` before `WorkerBootstrapMessage`. Require an upstream `@oh-my-pi/pi-coding-agent` two-phase session-graph seam (`prepareSessionGraph` / `hydrateSessionGraph` or late-bindable `SessionManager`, `MCPManager`, and `AgentRegistry` attachment without pre-bootstrap side effects) before prebuilding a session in a spare process.
- **Instead of:** calling `createAgentSession` in a spare worker with an in-memory or throwaway `SessionManager` and rebinding via `AgentSession.switchSession()`, or disposing the prebuilt session on option mismatch.
- **Because:** even though each worker runs in its own process (isolating `AgentRegistry.global()`), `createAgentSession` (`@oh-my-pi/pi-coding-agent/src/sdk.ts`) couples workspace graph discovery with bootstrap-bound state and construction-time side effects: (1) `SessionManager.inMemory()` fixes `readonly #persist = false` so `switchSession(input.sessionFile)` never persists to disk, `SessionManager.create(cwd)` binds a fresh dummy session id and path (materialized on disk by `ensureOnDisk()` or the first non-draft entry), `#setSessionFile()` skips updating `#sessionDir` when `headerCwd === cwd` (breaking explicit `input.sessionsDirectory`), `createAgentSession` captures `providerSessionId = sessionManager.getSessionId()` in closures, and `AgentSession.switchSession()` does not update `AgentRegistry.global().get('Main').sessionFile`; (2) `mcpManager` / `enableMCP` is wired once during construction with no post-construction attach API, while `WorkerMcp` requires `workspaceId`, `rootSessionId`, and `workerGeneration` from `WorkerBootstrapMessage`; (3) construction runs `prewarmOpenAICodexResponses` (calling `options.getApiKey` and Host `provider.use` authorization), `SkillDescriptionCatalog.startCompression()`, non-lazy LSP warmup, and `memoryBackend.start()` before bootstrap admission; and (4) disposing a mismatched prebuilt `AgentSession` runs `AgentLifecycleManager.global().dispose()` and `AsyncJobManager.dispose()`, making cold reopen slower than unprewarmed startup, while passing pre-discovered `skills`/`rules`/`contextFiles` sets `skillsReloadable = false` and breaks live refresh.
- **Decided by:** agent
- **Mine:** yes
- **Revisit when:** `@oh-my-pi/pi-coding-agent` exposes a two-phase session-graph API that separates workspace tool, extension, and prompt construction from `SessionManager`, `MCPManager`, `AgentRegistry` `sessionFile`, and `getApiKey` binding, or the unprepared `POST /sessions` path becomes a user-facing path whose 600 ms first-delta budget is unwaived.
- **Effort:** tech-debt-sweep

## 2026-11-18 - Remove OpenCode service and environment variables

- **Decided:** delete `packages/web/server/lib/environment/opencode-service-env.js` and `packages/web/server/lib/environment/opencode-service-env.test.js`, remove `readOpenCodeServiceEnv` and `forOpenCode` from `packages/web/server/lib/environment/runtime.js` and `packages/web/server/lib/environment/runtime.test.js`, and update `packages/web/server/lib/environment/DOCUMENTATION.md`.
- **Instead of:** keeping the OpenCode service-env reader and `forOpenCode` hook on `createEnvironmentRuntime`.
- **Because:** OhPiChamber runs the OMP Agent Service rather than a managed OpenCode process, so `opencode service set env` variables are unused.
- **Decided by:** agent
- **Mine:** yes
- **Revisit when:** never; OpenCode service-env compatibility is retired.
- **Effort:** final-main-audit

## 2026-11-18 - Stage standalone SDK, exclude agent-runtime from ASAR, and configure standalone loader roots

- **Decided:** Stage `ohpichamber-sdk` into `packages/web/resources/standalone-sdk` during both Electron asset builds (`packages/electron/scripts/build-web-assets.mjs`) and npm prepack (`packages/web/scripts/prepack.mjs`), keep `packages/web/package.json` publishing `resources/agent-runtime`, `resources/changelog`, `resources/standalone-sdk`, and `scripts/standalone-loader.mjs` under `ohpichamber` 1.0.0 with a worktree-scoped `package.json` backup/restore in `prepack.mjs`/`postpack.mjs`, exclude `node_modules/ohpichamber/resources/agent-runtime` from Electron `app.asar` while verifying `standalone-loader.mjs`, `standalone-sdk/dist/index.js`, and `changelog/index.json` in `packaged-app-contents.{cjs,test.cjs}`, and pass `{ runtimeRoot, sdkRoot }` via `registerStandaloneLoader` and `Module.register` `initialize()` data in `standalone-loader.mjs` while skipping `.asar` paths.
- **Instead of:** Bundling `agent-runtime` inside `app.asar`, resolving `ohpichamber-sdk` only from workspace `node_modules`, using a single shared `/tmp` `package.json` backup path across worktrees, or relying on `findRuntimeRoot()` without explicit packaged roots.
- **Because:** Bun cannot execute `agent-runtime` binaries or resolve symlinks from inside Electron's virtual ASAR archive; standalone npm installs and packaged Electron apps lack workspace symlinks for `ohpichamber-sdk` and `@openchamber/agent-*` until `standalone-loader.mjs` resolves them using `initialize()`-propagated roots; and concurrent worktree packs clobbered the shared backup file.
- **Decided by:** agent
- **Mine:** yes
- **Revisit when:** Electron and npm distributions consume published packages directly without staged `resources/agent-runtime` or `resources/standalone-sdk`.
- **Effort:** final-main-audit


## 2026-11-19 - Task 04 walkthrough rework fixes

- **Decided:** the three fork-differs paths the Task 04 rework left without a class keep the fork blob and are recorded as `decision` rows: `MobileEffortButton.tsx` passes `t` into `formatEffortLabel`, `ProjectsPage.test.tsx` asserts the project page's `data-settings-page-heading` target, and `useProviderLogo.ts` builds a `models.dev` URL only for a provider the catalog or the bundled map knows.
- **Instead of:** reverting them to upstream's unlocalized label, test without the heading assertion, and unguarded `https://models.dev/logos/<id>.svg` probe.
- **Because:** each file carries a fix from this effort rather than an unrelated drift: the effort button rendered the effort level in the default locale (`faf0189437`), the project page's heading focus target is a settings-page contract its test must pin (`10fc8d746e`), and a custom `models.yml` provider such as `CLIProxyAPI` gave a failed remote image request in every session (`ff73f5ba9e`).
- **Mine:** yes
- **Revisit when:** upstream localizes effort labels itself, or its settings pages stamp the heading target so the fork's test assertion has nothing to pin.
- **Effort:** final-main-audit

## 2026-11-19 - Second-round walkthrough fixes own their fork-differs paths

- **Decided:** the seven `fork-differs` paths the second walkthrough fix round left without a class keep the fork blob and are recorded as `decision` rows: the mobile settings navigation module and its test, the Git operation recovery hook and its test, `cycleThinkingVariant`, and the router's `parseRoute` and its test.
- **Instead of:** reverting them to upstream's nav-only settings entry, ungated binding read, variant-only effort cycle and `settings=general` root alias.
- **Because:** each file carries a fix the effort requires: the phone opened every deep-linked settings slug as the nav list (`5a6a053d28`), the desktop root request had to stay explicit while `general` stopped being a root alias (`ff07861164`), the recovery hook read the binding route for a folder Git had not proved a repository (`d36656aa8f`), and the phone's effort button derived levels from legacy route variants instead of the shared model levels (`9ce2395e79`).
- **Mine:** yes
- **Revisit when:** upstream gates its binding reads on a repository probe itself, or its router already keeps `general` distinct from the settings root.
- **Effort:** final-main-audit

## 2026-11-19 - Confirm before closing a dirty file tab

- **Decided:** the desktop tab strip defers single and bulk closes that include the dirty file until the editor confirms the close.
- **Instead of:** closing directly from the strip and leaving confirmation to the editor's own close shortcut.
- **Because:** the editor owns the draft, and a direct strip close silently loses it in Manual save mode.
- **Mine:** yes
- **Revisit when:** upstream routes all tab-close actions through its editor's unsaved-changes guard.

## 2026-11-19 - One draft for draw.io source and preview

- **Decided:** visual draw.io writes update the same draft as the source editor. The iframe receives the draft at mount and remounts when the host adopts an external write or discards the draft.
- **Instead of:** keeping separate source and visual buffers and reconciling them at close and on every preview toggle.
- **Because:** one draft makes close, save, and reload see the same edits without reloading the iframe on every visual change.
- **Mine:** yes
- **Revisit when:** upstream shares its draw.io source and visual draft and handles external file updates.

## 2026-11-19 - Preserve mobile Host authentication regression coverage

- **Decided:** retain the fork versions of `packages/ui/src/apps/mobileNativeHttp.test.ts` and `packages/ui/src/apps/mobileReconnectForm.test.tsx` and classify their upstream differences with explicit decision rows in the drift ledger.
- **Instead of:** reverting their native passwordless-session and secure-header assertions to upstream, adding artificial boundary tokens to the tests, or expanding the guard's automatic exclusions.
- **Because:** the tests pin native Host connection behavior retained by PRs #11 and #13: redirect refusal, closed browser fallback, signed passwordless bearer bootstrap, secure credential persistence, reconnect and password cancellation, header removal, and invalid pairing handling. Neither test carries a token recognized by the guard's content-based OMP boundary classification, but both protect the fork's deliberate authentication contract.
- **Mine:** yes
- **Revisit when:** upstream covers the same native Host authentication contract or the connection implementation retires that contract.

## 2026-11-19 - Android status-bar icons follow the painted background owner

- **Decided:** retain `packages/ui/src/apps/mobileNativeChrome.ts` with native-background contrast from `WindowLayoutPlugin` when Capacitor pads the Android decor view, app-theme contrast when the WebView paints behind the bar, and refreshes on app/system appearance changes and resume.
- **Instead of:** choosing icons solely from the app's dark class, assuming unsupported Android 15 background writes succeed, or forcing native insets off on WebViews with broken CSS safe areas.
- **Because:** the installed WebView 124 reaches Capacitor SystemBars' native-inset fallback. On Android 15 the native strip follows Android's theme while StatusBar background writes are ignored; app-dark icons therefore became white on the native light background. Newer edge-to-edge WebViews still need app-theme icons because their strip is web content.
- **Mine:** yes
- **Revisit when:** Capacitor exposes native background ownership directly or native-inset fallback is retired.

## 2026-11-19 - Identify malformed mobile pairing links in the welcome form

- **Decided:** Show the translated pairing rejection message when pasted `ohpichamber://` text cannot be parsed, and prevent address submission until it is corrected.
- **Instead of:** Treating malformed pairing links as server addresses.
- **Because:** A network error does not tell the user to generate a new pairing link.
- **Revisit when:** Mobile onboarding no longer accepts both pairing links and server addresses in the same field.

## 2026-11-19 - Route native history to the focused editor

- **Decided:** retain active-element-scoped CodeMirror Undo/Redo, its regression tests, and the editor documentation in the fork. A native action targeted at a document uses its active editor even when the window is inactive; document focus is not an ownership requirement.
- **Instead of:** relying on Chromium's frame-wide native history for CodeMirror while both the file editor and chat composer are mounted.
- **Because:** native Undo could revert and autosave an unfocused file after a chat paste, and native Redo did not restore the CodeMirror edit. Ordinary inputs still use native history. Chromium's context-menu editFlags describe native history, not CodeMirror history, so those flags cannot gate CodeMirror's Undo/Redo commands.
- **Revisit when:** upstream ports the same focused-editor history routing and tests.

## 2026-11-19 - Mobile Git detail Back belongs to the workspace navigation owner

- **Decided:** register visible Git detail routes through the workspace Back callback already used by Files, and reuse the header's return-to-list action. Keep the drawer's existing terminal lifecycle and the fork health/sync test harness.
- **Instead of:** closing the workspace while retaining a hidden diff, registering Git in the higher-priority global overlay stack, or leaving hidden tabs in charge of Back.
- **Because:** the Git pane owns its list/detail route and visited panes remain mounted. Only that pane can consume one Back to clear the detail, while the shell keeps popups, plans and fullscreen surfaces ahead of workspace navigation. Visibility and owner-key cleanup prevent stale handlers during tab, repository and runtime changes.
- **Mine:** yes
- **Revisit when:** upstream wires Git detail navigation into the same workspace Back contract.

## 2026-11-19 - Walkthrough Back follows its reading depth

- **Decided:** the Git workspace Back callback delegates to the visible walkthrough's own header action before returning to Changes.
- **Instead of:** discarding an open step and its contents in one hardware Back.
- **Because:** the walkthrough owns its reading depth; step, contents and Changes must follow the same ladder for header and hardware Back. Global overlays retain their shell priority.
- **Mine:** yes
- **Revisit when:** upstream shares walkthrough navigation through the workspace Back contract.

## 2026-11-19 - Git Back ownership follows the rendered screen

- **Decided:** register workspace Back only while Git renders a diff or walkthrough, including its repository and source availability gates. Reset a walkthrough route only when a successful file-list read is empty.
- **Instead of:** treating every retained non-list route as a visible detail screen.
- **Because:** refresh can remove the last walkthrough target or change a comparison source while retaining its route. The resulting Changes list must let Back close the workspace immediately. Two consecutive typed unreadable status errors clear the store's status to unknown, not an authoritative empty list; the walkthrough route must survive that failure and return on retry.
- **Mine:** yes
- **Revisit when:** Git navigation normalizes unavailable detail routes before rendering.

## 2026-11-19 - Replay terminal history at its recorded PTY sizes

- **Decided:** retain PTY resize boundaries in bounded terminal history and replay them in output order before fitting the viewport.
- **Instead of:** replaying the entire snapshot at the latest dimensions.
- **Because:** shell cursor movements and wrapping depend on the grid where they were produced. Resizing and reloading otherwise leaves scrambled command echoes.
- **Revisit when:** upstream records ordered resize boundaries or snapshots terminal emulator state directly.

## 2026-11-19 - Refuse editor saves to externally missing paths

- **Decided:** text editor saves send an optional `mustExist` condition through the shared Files API and content cache to the Host. Missing paths return `409`; the editor displays the error and retains its dirty draft. New-file writes and binary canvas uploads keep their existing behavior.
- **Instead of:** silently recreating an externally renamed or deleted file, or replacing atomic writes with direct writes through an open handle.
- **Because:** saving should not undo an external rename. Keep temporary-file replacement and check existence both at resolution and immediately before rename, cleaning the temporary file on refusal. A narrow check-to-rename race remains; this is not compare-and-swap or fingerprint conflict detection. Existing Host directory-query, workspace containment, native view documentation and FS search boundary decisions remain unchanged.
- **Mine:** yes
- **Revisit when:** upstream supports conditional editor writes or the Host gains a race-free conditional replacement primitive.

## 2026-11-19 - Confirm external mobile pairing links before connecting

- **Decided:** deliver validated native URL pairing offers to the shared confirmation UI before probing, redeeming or changing Hosts. Reuse the mobile pairing controller after confirmation.
- **Instead of:** treating a URL handoff as consent or waiting for a connected workspace before showing the offer.
- **Because:** Safari and other apps can launch the URL scheme. Opening an offer is not consent to store its credentials or switch the active Host, and first-time onboarding must also receive it. Existing mobile authentication regressions and fork deep-link behavior remain in force.
- **Revisit when:** upstream provides a native consent flow for external Host pairing links.

## 2026-11-19 - Keep native mobile visible through Host outages

- **Decided:** keep the workspace mounted and put a reconnect banner in flow below the visible header when the authenticated Host control stream drops or resume finds the Host unreachable. Keep retrying the existing stream after the transport probe ladder ends; confirmed auth and relay-limit failures still return to the instance picker.
- **Instead of:** treating a reachable network or a successful startup probe as proof the Host is still live, or clearing the runtime when a resume probe times out.
- **Because:** Android can stay online while the Host is stopped. The existing stream detects this even with no chat open, and its ready event confirms recovery and lets stalled startup retry without a separate poll. Native direct connections use the header-aware stream reader because EventSource cannot send saved proxy headers; when configured, those headers stay on the selected endpoint by rejecting redirects.
- **Mine:** yes
- **Revisit when:** upstream provides a native, authenticated Host connectivity signal independent of its session streams.

## 2026-11-19 - Keep interactive terminal input bound to its attachment

- **Decided:** interactive input requires the current socket's terminal snapshot and an explicit resume after reconnect. Project-action interrupts can still use a socket without attaching a viewport.
- **Instead of:** automatically accepting input as soon as the next socket opens or replaying keys typed during a disconnect.
- **Because:** forwarding an arbitrary suffix of a command can change what the shell executes. After reattachment, the user can inspect the recovered command line before typing again.
- **Revisit when:** interactive terminal transport can acknowledge command input across a connection change without ambiguity.

## 2026-11-19 - Keep composer image removal from sending drafts

- **Decided:** mark the shared composer's image removal control as a non-submit button.
- **Instead of:** preventing the click's default action in the removal handler.
- **Because:** the button has no submission role; native button semantics keep removal separate from sending without changing the form.
- **Mine:** no
- **Revisit when:** upstream marks the same control as non-submit.

## 2026-11-19 - Compact draft welcomes scroll before clipping large text

- **Decided:** give the compact draft welcome a bounded vertical scroll area and center its non-shrinking title/starter group with automatic margins.
- **Instead of:** unconditional flex centering, shrinking the text, or scrolling the composer out of view with the welcome.
- **Because:** at large system font sizes or short viewport heights, centered overflow begins above the scroll origin. Automatic margins preserve the normal centered appearance but collapse when content needs to scroll from its top.
- **Mine:** yes
- **Revisit when:** upstream provides the same scroll-safe compact welcome layout.

## 2026-11-19 - Give terminal rows priority above the Android keyboard

- **Decided:** on native Android, when the software keyboard is open and the viewport is at most 240 CSS pixels tall, collapse the active Terminal workspace's two tab bars and reclaim vertical padding without hiding quick keys or unmounting the terminal.
- **Instead of:** adding another keyboard inset or forcing a minimum height that would clip the terminal or its quick keys.
- **Because:** Android already resizes the WebView. In Android 15 landscape the keyboard can leave 122 CSS pixels, while the tab bars and quick keys alone take 163.
- **Revisit when:** upstream preserves terminal rows in the short Android keyboard viewport.

## 2026-11-19 - Bound plugin marketplace metadata and actions on narrow panes

- **Decided:** bound and truncate marketplace names, versions and source labels; wrap long description text and keep install/status actions in their own compact, width-bounded container in the Plugins page and Add plugin dialog.
- **Instead of:** letting non-shrinking metadata overflow a phone pane or stretching the install action across the narrow row.
- **Because:** Capacitor shares these components with web and desktop. The existing container-query stacking remains intact, and ordinary wide-pane rows keep their layout.
- **Mine:** yes
- **Revisit when:** upstream adopts equivalent narrow-pane marketplace bounds.

## 2026-11-19 - Stack settings headers and bound installed plugin cards on narrow panes

- **Decided:** shared settings section headers stack their actions below the heading below `@xl`. Plugins Installed and Marketplace action groups wrap. Shared cards constrain their grid item's intrinsic width and reserve a non-shrinking narrow-pane footer area for sibling menu and toggle controls.
- **Instead of:** forcing headings and controls into one narrow line or letting a long installed title size its card beyond the pane.
- **Because:** Android portrait verification showed heading/action collisions in Installed and Marketplace and an overflowing installed plugin title under its controls. Capabilities uses the same header primitive and needs the same stacking. Wide-pane direction and control placement remain unchanged. Existing fork section/disclosure and card-chip contracts are retained.
- **Mine:** yes
- **Revisit when:** upstream adopts equivalent narrow-pane section and card layout constraints.

## 2026-11-19 - Stretch the settings card text column within its button

- **Decided:** explicitly stretch the shared settings card text wrapper across the card's available inner width.
- **Instead of:** relying on `min-w-0` to bound a flex child when the card button aligns children to the start.
- **Because:** Android WebView measured a long installed plugin title extending to 423.1px past the card edge at 357.1px. Start alignment let the text wrapper use its intrinsic width, preventing the existing title ellipsis from taking effect.
- **Mine:** yes
- **Revisit when:** shared card button alignment guarantees a bounded text column without an explicit self-alignment.

## 2026-11-19 - Ship Windows Agent dependencies without archive links

- **Decided:** Windows afterPack removes dependency directory links from the archive, records their relative payload targets, and copies native file aliases. Runtime resolution creates directory junctions at the installed location, validating existing junctions against those targets. Linux and macOS retain their relative symlink payloads.
- **Instead of:** accepting electron-builder's absolute links into win-unpacked, or relying on NSIS to recreate symlinks.
- **Because:** electron-builder rewrites relative links during copying, and NSIS extracts through Nsis7z and CopyFiles. An archive containing only ordinary files avoids symlink privilege and preservation requirements; per-user installation permits junction creation without administrator privileges.
- **Mine:** yes
- **Revisit when:** Windows packaging offers a verified relocatable dependency graph without runtime junction creation.
## 2026-11-19 - Preserve file descriptor identity in code previews

- **Decided:** memoize the complete Pierre file descriptor by its contents and metadata at the preview component boundary.
- **Instead of:** recreating equivalent file objects on each FilesView render, disabling large-file previews or replacing the virtualizer.
- **Because:** the iOS simulator reproduced a blank large-text preview while edit mode displayed the same contents and narrow Chrome rendered it. Native console instrumentation exposed `VirtualizedFile.render: rendered a different file than its prepared layout`; Pierre compares prepared and rendered descriptors by reference. Keeping the descriptor stable restored the native preview without truncating the file or changing its worker-backed virtualization.
- **Mine:** yes
- **Revisit when:** Pierre no longer requires stable descriptor identity across virtualized renders.

Small-file acceptance also exposed `No valid theme loader registered for "openchamber-dark"`: FilesView requested raw theme IDs even though the registry returns content-hashed render names. Resolve and register the light/dark pair synchronously before rendering, and memoize by theme objects so custom-theme edits under the same ID are respected. Both inline and fullscreen previews share these descriptors and theme names.

## 2026-11-19 - Confirm before replacing a dirty file through the tab strip

- **Decided:** the desktop strip consults a file-editor selection guard before selecting a different file path. Reuse Save/Discard/Cancel and pause autosave through the existing confirmation hook; failed saves and Cancel leave the active tab and dirty draft unchanged. Clean drafts, the same path, and non-file surfaces select immediately.
- **Instead of:** clearing a dirty draft on strip selection or adding a per-tab draft cache.
- **Because:** one shared editor holds the current draft. Other file tabs replace its document, while non-file surfaces only hide the mounted editor and retain its selected path. Keyboard activation of strip buttons follows the same selection callback; there is no separate next/previous strip shortcut. Existing close guards, runtime directory ownership and conditional-save decisions remain in force.
- **Mine:** yes
- **Revisit when:** upstream guards strip selection or introduces authoritative per-file draft ownership.

## 2026-11-19 - Empty GitHub release feeds mean no desktop update

- **Decided:** treat electron-updater's `No published versions on GitHub` like a missing platform manifest when no update is pending. Preserve pending downloads on failed checks; keep the production release feed unchanged.
- **Instead of:** rejecting an update check for an empty release feed when no download is pending.
- **Because:** electron-updater throws for an empty GitHub release feed rather than returning a no-update result; before the first release, that is an expected absence of an update.

## 2026-11-19 - Refresh desktop login items only when enabled

- **Decided:** use the OS login-item settings as the desktop's stored launch-at-login preference. Packaged startup re-registers an enabled login item and skips the write when the item is disabled, unregistered, or unreadable. Explicit settings-change IPC remains authoritative and unchanged.
- **Instead of:** re-registering disabled or unregistered login items on every packaged launch.
- **Because:** macOS can reject that no-op write with `Operation not permitted`, while enabled items need their path and background-start args refreshed after updates or moves.

## 2026-11-19 - Retry native session and command discovery during Agent Service startup

- **Decided:** global sessions and native command catalogs use the existing bounded `STARTUP_RETRY` policy in their owning stores, including command workspace resolution. A successful native read establishes authority; readiness does not manufacture an empty snapshot. Session workspace binding follows successful discovery so it cannot exhaust its own retry window before the service is ready. Non-retryable or exhausted failures retain the existing error and cached-data behavior. Runtime generation changes retire retries before another request. This shared behavior applies to Web/PWA, Electron, hosted mobile, and Capacitor; the Guest SDK contract is unchanged.
- **Instead of:** relying on global polling or a command directory change to recover startup discovery, or treating readiness as an empty native snapshot.
- **Because:** the gateway returns `503 SERVICE_UNAVAILABLE` before the Agent Service is ready, and config readiness reaches the agents store rather than these loaders.

## 2026-11-19 - Refresh composer catalogs after provider settings mutations

- **Decided:** Explicit provider-settings refreshes emit the existing `providers` config-change notification before rereading their page-owned catalog. The existing config-store subscriber invalidates and freshly loads known-directory catalogs for the composer.
- **Because:** Custom provider save and credential/account changes refreshed only the settings page, leaving the composer's separate catalog stale until reload. A failed page reread must not suppress notification of a completed write. Ordinary loads and stale-runtime refreshes do not emit.
- **Surfaces:** Web/PWA, Electron, hosted mobile and Capacitor share the same store and notification path. Guest SDK is unchanged.
- **Instead of:** Directly mutating composer catalogs from Settings or adding another event channel.

## 2026-11-19 - Retry transient partial session discovery without losing complete scopes

- **Decided:** the global sessions store owns bounded startup recovery for successful HTTP 200 discovery pages containing `SERVICE_UNAVAILABLE` errors. Retry whole listings within the same eight-attempt budget as thrown retryable failures. Reconcile healthy scopes on every page, retain failed scopes, defer transient sidebar errors until exhaustion, and expose non-transient errors immediately. An initial retrying partial page does not establish global completeness; runtime changes retire the retry loop.
- **Instead of:** retrying only thrown failures or replacing partial listings with a top-level 503 that loses scoped information.
- **Because:** successful HTTP 200 discovery pages can contain transient `SERVICE_UNAVAILABLE` scope errors during startup; retrying those pages must not discard healthy scopes or failed scopes' existing records.

Keep the Host's explicit partial `items`/`errors` contract, including all-unavailable pages, rather than replacing it with a top-level 503 that loses scoped information. Discovery errors carry codes, not retryable flags; only `SERVICE_UNAVAILABLE` is classified transient here. Web/PWA, Electron, hosted mobile and Capacitor share this store; Guest SDK and session admission are unchanged.

Later successful listings also retire stale failures: global head polls replace the discovery error map, and successful workspace lists clear only that workspace and its known session errors through the global store owner. This applies even when no session record changes; an unrelated workspace's failure is not cleared by a scoped success.

## 2026-11-19 - Recover startup snapshots and cold-send streams without opening cold workers

- **Decided:** SessionMessageLoader retries retryable snapshot/workspace failures within `STARTUP_RETRY`, preserving authoritative state and stopping retired loads. After accepted native delivery, sends starting from a cold or absent snapshot request a queued recovery snapshot; only that recovery waits for an available worker within the bounded budget. Successful snapshots attach the existing event pipeline from the returned cursor.
- **Because:** A startup snapshot failure was terminal. Manual retry could read a worker-free cold snapshot, which correctly skipped SSE; the pre-send stream request still saw that cold snapshot and never retried after the worker opened.
- **Instead of:** Removing the cold-session stream guard, retaining cold journals in the service, opening workers just to read history, or replaying accepted prompts. Recovery failure stays a loader error, never a failed-send rollback.
- **Surfaces:** Web/PWA, Electron, hosted mobile and Capacitor use the shared loader/actions/provider. Guest SDK, Host admission and transport/auth behavior are unchanged. Earlier scoped discovery-error clearing remains in the same SyncProvider paths.

## 2026-11-19 - Preserve sanitized native provider failure details

- **Decided:** project the last unrecovered assistant error message into canonical run failure and turn history after removing resolved provider credentials and credential-shaped text. Preserve generic detail only when OMP supplies none.
- **Instead of:** replacing every provider failure with a generic service failure or teaching the UI to read native transcripts.
- **Because:** OMP owns the provider outcome and the existing canonical failure string already reaches the chat error notice. Credential values must not cross that boundary even when a provider echoes them.
- **Mine:** yes
- **Revisit when:** the canonical API introduces a structured provider-error contract.

## 2026-11-19 - Complete repository dialog dismissal before opening Git Settings

- **Decided:** retain the repository popup through dismissal and open Git Settings on close completion. Recheck the draft warning when its directory's Git index revision changes and use action names for commit accessible labels.
- **Instead of:** opening sibling modals during dismissal or keeping a one-shot dirty snapshot after a commit.
- **Because:** closing modal focus cleanup must complete before the next surface opens, and a successful Git mutation invalidates the earlier dirty answer.
- **Revisit when:** the shared dialog supports an atomic modal handoff or the draft target reads its dirty answer from the shared Git store.

## 2026-11-19 - Restore chat failure notices from canonical turns

- **Decided:** use the latest canonical failed turn when no equally recent live notification explains the failure.
- **Instead of:** persisting the notification cache or relying on replay of a terminal event after a reload.
- **Because:** snapshots already own sanitized terminal outcomes; transient notification state is not a complete history source. Completed, cancelled and superseded turns must not become current failures.
- **Revisit when:** the chat renders terminal explanations inline with each canonical turn.

## 2026-11-19 - Recheck draft dirtiness on working-tree status updates

- **Decided:** subscribe the draft dirty probe to its selected directory's shared Git status in addition to index revision changes.
- **Instead of:** waiting for staging to change the index or introducing another status poller.
- **Because:** editor saves already invalidate Git status and the Git panel publishes working-tree changes without changing the index revision. The draft warning must follow those same directory-scoped updates.
- **Revisit when:** advisory draft dirtiness is derived directly from a bootstrap-safe authoritative store snapshot.

## 2026-11-19 - Remove Agent junctions before NSIS atomic uninstall

- **Decided:** The new Windows installer's customCheckAppRunning wraps the stock PowerShell availability and running-app checks, then removes directory reparse points beneath the physical Agent runtime root. A cancelled check exits before cleanup. The generated uninstaller's customUnInstall runs after its own stock app-running check and before removal. Cleanup uses non-recursive RMDir without following targets; physical directories and files remain for normal NSIS removal.
- **Because:** electron-builder's atomic upgrade removal traverses dependency junctions into paths beyond MAX_PATH and aborts. New-installer cleanup also covers older uninstallers without this hook.
- **Instead of:** Materializing dependency directory copies or relying on the newly installed uninstaller to repair an upgrade executed by the old one.
- **Surfaces:** Windows NSIS only; runtime junction semantics and Linux/macOS packaging remain unchanged.
## 2026-11-19 - Bind native daemon callbacks to their session owner

- **Decided:** retain Host session identity overrides for named services while binding session-change registration and launch-completion delivery to the native AgentSession instance.
- **Instead of:** invoking inherited native private-field methods on an `Object.create(nativeSession)` wrapper or patching the OMP dependency.
- **Because:** JavaScript private fields belong to the constructed instance, not objects inheriting from it. OMP's own ToolSession delegates these calls to the real session; our adapter must preserve the same receiver.
- **Revisit when:** the worker no longer needs a separate Host-identity ToolSession for broker services.

## 2026-11-19 - Keep child discovery failures distinct from healthy root listings

- **Decided:** Track failed child-discovery parents separately from root-listing failures. Root-only head and workspace listings cannot retire them. A head poll with pending child failures reuses full discovery to retry child reads; full and directory refreshes clear a pending parent only after successful child discovery, including empty results.
- **Instead of:** Clearing every session-keyed error after a healthy root listing, or adding another child polling owner.
- **Because:** Canonical session lists contain roots, not the result of `listSubagents(parentId)`. Root success cannot establish that a missing child tree recovered. Known children and unrelated scope failures must survive unsuccessful retries and runtime changes must retire old completions.
- **Surfaces:** Web/PWA, Electron, hosted mobile and Capacitor share the global store. Guest SDK and native admission are unchanged. Existing bounded root-listing startup retries and scoped root-error clearing remain in place.

## 2026-11-20 - Test notification stream retirement with the runtime-change event contract

- **Decided:** Pass the previous and next runtime URLs and keys when the notification stream test simulates switching runtimes.
- **Instead of:** Dispatching a detail-free event after changing the URL resolver.
- **Because:** Without the runtime identities, the listener cannot distinguish a switch from an event for the active runtime.
- **Mine:** yes (records the existing fork fixture).
- **Revisit when:** Upstream's fixture uses the same runtime-change event contract.

## 2026-11-20 - Exclude the inherited OpenCode verification stand and orphan CI policy test

- **Decided:** exclude `scripts/verify/**` and its root `verify` command. Keep the reusable fixture-request regression under `scripts/perf`, forwarding its opt-in control flag to the fixture process and using a fixture-owned request header. Remove `scripts/pr-checks.test.mjs` with the excluded `.github/scripts/pr-checks.cjs` policy it tests.
- **Instead of:** restoring `bundled-opencode-server.mjs`, OpenCode environment/configuration, legacy session endpoints, or fork-excluded GitHub policy merely to load upstream tests.
- **Because:** main has no `scripts/verify` stand; the imported stand configures an OpenCode server, drives `/api/session` and OpenCode CLI operations, and cannot exercise the fork's Host plus supervised OMP Agent Service without a new canonical scenario harness. The existing OMP-aware `scripts/perf/isolated-server.mjs` and canonical performance probes remain authoritative; deleting this inherited stand does not certify replacement behavior coverage.
- **Mine:** yes, within the requested tooling exclusion option and the existing fork-owned scripts and `.github` exclusions.
- **Revisit when:** a behavior harness drives `/api/agent/v1` and launches the same Host/Agent Service boundary as the retained runtime.

## 2026-11-20 - Require full retained-platform acceptance before merging the upstream sync

- **Decided:** do not merge the sync until full acceptance on Web/PWA, Android, iOS, Windows and macOS. The owner and designated testers now own testing; this implementation handoff stops all test/build runs and records the existing evidence and open failures.
- **Instead of:** treating local checks, Linux packaging, or the earlier Web/macOS blocking-smoke fixes as complete merge acceptance.
- **Because:** the owner expanded the merge bar to every retained platform and explicitly transferred testing ownership.
- **Mine:** no; owner instruction.
- **Scope:** acceptance and verification ownership only. Canonical `/api/agent/v1`, OMP 19, the Host/Agent Service boundary and Guest MessagePort v2 remain unchanged.

## 2026-11-20 - Retain runtime-equivalent source compatibility cleanup

- **Decided:** retain removal of unused default React imports under the automatic JSX transform, source formatting and type-only Host/Canonical contract repairs where the normalized runtime output is unchanged. Package renames remain owned by the first-release naming decision, not this exception.
- **Instead of:** reverting mechanically equivalent source solely to match the new upstream baseline, or treating every type-related change as equivalent.
- **Because:** the JSX/import-only rows have identical source after removing the unused React default import and blank-line differences; the remaining compatibility rows emit identical JavaScript under the same Bun transpiler after the separately recorded package rename. Neither comparison licenses deleting a route, setting, feature or assertion.
- **Mine:** yes, limited to the mechanically compared source rows in the audit reconciliation.
- **Revisit when:** the upstream source converges, or a row gains a behavioral difference requiring its own review.

## 2026-11-20 - Keep UI state aligned with the fork's runtime and workspace contracts

- **Decided:** preserve recording scope and interrupted-send recovery at the Canonical boundary, and keep native preferences and layout validation in their shared UI state owners.
- **Because:** upstream lacks the authorized workspace for dictation correction and the switch revision that retires pending sends even on a same-key Host change. Unknown delivery is not a reason to drop or replay a send. Upstream also lacks the rail-versus-link intent, native preference fields and same-version layout validation.
- **Also retained:** the locale direction and dictionary contract, translated attachment regression, and standards-mode DOM setup used by math renderer tests.
- **Instead of:** treating partial reads as proof of non-delivery, restoring retired state, or dropping behavior or regression coverage to match the upstream blob.
- **Revisit when:** upstream supports equivalent scopes and state invariants or the corresponding fork feature is retired.

## 2026-11-21 - Skip the POSIX shell quoting round-trip on Windows

- **Decided:** keep the `process.platform === 'win32'` skip on the CLI shell quoting test's `/bin/sh` round-trip.
- **Instead of:** restoring the upstream test, which runs `/bin/sh` on every host.
- **Because:** Windows hosts have no `/bin/sh`, so the upstream test fails there without exercising `shellQuote`; macOS and Linux still run the round-trip.
- **Mine:** yes (requested drift classification)
- **Revisit when:** upstream gates the test itself or the CLI quoting gains a Windows-native round-trip test.

## 2026-11-21 - Keep stable package links in generated Capacitor native files

- **Decided:** keep the iOS Podfile, Podfile.lock and Android `capacitor.settings.gradle` pointing at package links under `packages/mobile/node_modules`, generated by the patched `@capacitor/cli`.
- **Instead of:** the upstream files, which point at Bun's versioned `node_modules/.bun/<package>@<version>+<hash>` store directories.
- **Because:** store hashes change with each clean install, so the upstream paths break iOS clean-install builds and churn on every native sync; package links stay stable.
- **Mine:** yes (requested drift classification)
- **Revisit when:** upstream Capacitor preserves symlink paths or upstream commits stable native paths itself.

## 2026-11-21 - Cap timer minutes left at the timer length

- **Decided:** clamp `timerMinutesLeft` to the timer's own length.
- **Instead of:** the upstream calculation, which reports more minutes than the timer was set for when the client clock is behind the start time.
- **Because:** a 20-minute timer must never show more than 20 minutes left; clock skew between host and client is normal.
- **Mine:** yes (requested drift classification)
- **Revisit when:** upstream clamps the value or wait timers carry a server-computed deadline.

## 2026-11-21 - Normalize share-document source paths to POSIX separators

- **Decided:** convert source paths to `/` separators before matching shims and component directories when generating share-document messages.
- **Instead of:** the upstream `path.relative` comparisons, which use `\` on Windows.
- **Because:** on Windows the shim lookup and the `components|share-document` filter never match, so the generated messages miss keys there.
- **Mine:** yes (requested drift classification)
- **Revisit when:** upstream normalizes these paths itself.

## 2026-11-21 - Report desktop notification success only after native confirmation

- **Decided:** treat a desktop notification as sent only when the Electron IPC confirms Electron's `show` event; an unconfirmed or failed native result reports failure with no browser `Notification` fallback.
- **Instead of:** the upstream behavior, which treats any resolved desktop IPC call as success and lets the browser path mask a native failure.
- **Because:** the notification test action told users a notification was delivered when none appeared; Electron 45 has no authorization query, so the `show` event is the only native signal available.
- **Mine:** yes (requested drift classification)
- **Revisit when:** Electron exposes notification authorization or upstream adopts native confirmation.

## 2026-11-21 - Skip draft session preparation inside a worktree being removed

- **Decided:** treat a directory inside a worktree whose removal is pending (`isDirectoryInRemovingWorktree`) as unavailable for speculative draft session preparation, and restore sessions archived by a refused deletion before reporting the error.
- **Instead of:** the upstream removal state, which only answers for the worktree root path and leaves drafts preparing sessions inside the checkout being deleted.
- **Because:** a prepared session inside the removed checkout counts as an active run and makes the deletion refuse itself.
- **Mine:** yes (requested drift classification)
- **Revisit when:** upstream guards draft preparation during worktree removal itself.

## 2026-11-21 - Keep chats of a deleted worktree readable from Archive

- **Decided:** a workspace whose checkout no longer exists but still has archived sessions stays in Host discovery, its sessions resolve against the project (marked `checkoutRemoved`), and its directory resolves to that workspace. The Host does not register it with the Agent Service, so snapshot and history are served cold from the session files and execution is refused. Prompt delivery refuses these sessions itself, because a root still warm from before the removal skips the reopen that would otherwise fail.
- **Instead of:** failing every scope read once the checkout is gone, which dropped these chats from Archive after a reload and made opening them return 500.
- **Because:** deleting a worktree archives its chats first, so they must remain recoverable; the worktree-archive flow already keeps absent checkouts readable this way.
- **Mine:** yes (requested fix)
- **Revisit when:** removed-checkout sessions gain a relocation or restore flow that moves them to a live workspace.

## 2026-11-21 - Preserve relative symlinks in archive restore comparison checkouts

- **Decided:** copy symlink text verbatim into the temporary restore comparison checkout while keeping the existing fingerprint safety check and the Host Git ownership recorded under the 2026-11-11 web work modules decision.
- **Instead of:** allowing `fs.cp` to rewrite relative links into absolute links or weakening the comparison fingerprint check.
- **Because:** rewriting a tracked relative link changes the comparison tree and status, refusing an otherwise safe restore before target pinning.
- **Mine:** yes (requested fix and drift classification)
- **Revisit when:** restore preflight no longer reconstructs a comparison checkout or upstream preserves relative symlinks itself.

## 2026-11-22 - Keep mobile todo and tool readouts readable

- **Decided:** keep inline tool disclosures inside their reserved icon boxes while the containing row supplies the touch target; wrap phase names and task identifiers in expanded checklists, and wrap phone Work status task labels without hover tooltips. Count completed and abandoned tasks as closed in tool summaries, matching the checklist and Work status.
- **Instead of:** expanding absolute-positioned icon buttons to the global mobile minimum, clipping long todo content, or reporting different progress for the same snapshot.
- **Because:** the shared phone UI must expose the complete task and consistent progress in hosted mobile and Capacitor without pointer hover. Desktop Work status keeps its compact row layout.
- **Mine:** yes (requested mobile display fixes)
- **Revisit when:** upstream provides equivalent mobile readouts or the shared todo presentation changes.

## 2026-11-22 - Restore phone drawer focus without a keyboard

- **Decided:** full-cover phone drawers focus their surface on entry and restore the opener on close unless another overlay owns focus. Retained closed drawers and tablet panels are inert. Inline tablet panels do not take modal focus.
- **Touch entry:** header button clicks explicitly focus the opener before opening so WebKit taps do not leave the drawer restoring an unrelated input or body.
- **Instead of:** leaving focus in a hidden drawer or opening the phone keyboard by focusing the search field.
- **Because:** keyboard dismissal must return to the control that opened the drawer, and the exit animation must not leave invisible controls focusable.
- **Mine:** yes (requested mobile functional fixes)
- **Revisit when:** these custom drawers adopt a shared dialog primitive with equivalent focus and lifetime behavior.

## 2026-11-21 - Match deleted Windows worktree paths from Archive

- **Decided:** match separator, drive-letter case, and trailing-separator variants when looking up an already authorized deleted Windows checkout.
- **Instead of:** changing live directory validation or case-folding the entire path.
- **Because:** a missing checkout cannot be canonicalized on disk, and the renderer's forward-slash form must resolve to the same workspace without equating distinct directory names.
- **Mine:** yes (requested fix)
- **Revisit when:** Archive can open deleted worktree chats without resolving their former directory.

## 2026-11-22 - Park idle off-screen session streams

- **Decided:** keep a session's SSE stream only while it is viewed, live (`running`, `awaiting_approval`, `awaiting_input`) or just sent to; park idle off-screen sessions and resume from the snapshot head when viewed again.
- **Instead of:** keeping a stream for every cached transcript until cache eviction (up to 20 per tab for 5 minutes).
- **Because:** browsers allow six HTTP/1.1 connections per origin across all tabs; two production tabs filled them with streams and stalled every request, including approval responses.
- **Mine:** yes (requested fix)
- **Revisit when:** the Host serves session events over a multiplexed transport (HTTP/2 or one shared stream).
