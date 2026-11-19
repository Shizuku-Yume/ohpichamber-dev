# OMP 19 integration

**Status:** in progress
**Priority:** high
**Integration branch:** devin/1795118904-omp-19

**Verification:** W1–W5 and W6's automated checks are complete. Fresh workflow/security review is unavailable in this environment and remains required at effort close; no integration merge is authorized by the Stage 2a local-commit request.

Stage 2b W7–W9 automated checks pass: root type-check through mobile; Agent Service 677 pass/12 skip/0 fail; contracts 273 pass; affected UI 231 pass across 12 files. Development.md records receipts and visual/platform limits. Independent review is still required; the owner's Stage 2b request authorizes local commits only.

Stage 3 real browser checks and Linux x64 packaged Agent runtime verification pass. The shared UI gates transient subagent/BTW observations through canonical sequencing; focused regressions and root type-check pass. Development.md owns screenshot paths, compaction results and platform limits. Independent review remains required before effort close; no push or integration into main is authorized.

## What this is for

Make the OMP 19 vendor pin usable by the Agent Service and its Canonical API consumers without retaining the removed OMP API model.

## What it does

- Keeps a run active across intermediate pauses and asynchronous wakes; completes it only at native run end. Queued prompts and todo synchronization follow native lifecycle authority.
- Removes blocked from current todo outputs and controls while rendering historical blocked records as pending.
- Removes seance and IDA integrations; uses OMP 19 plugin, thinking and daemon APIs. Categorizes `/commit` according to its actual headless and authorization requirements.
- Mirrors OMP 19 settings without exposing terminal-only presentation, internal tuning, or duplicate application controls. Supplies force-exit labels in all 15 locales.
- Uses OMP 19 internal URL grammar, including local log references, without broadening Host capability grants.
- Resolves worker initialization and detached-service readiness failures or proves remaining failures on origin/main.

## How it is built

The Agent Service remains the sole owner of OMP SDK objects. Read the pinned SDK's RPC and TUI lifecycle consumers before changing projection, mode, queue, goal and todo handling. Native events and live session state own activity; persisted messages never establish live running state.

Trace todo schemas through agent-contract, service projection and shared UI. Follow the protocol's schema-version rules and normalize historical records at their owning read boundary rather than publishing a second live todo model.

Web/PWA, Electron and hosted/Capacitor mobile share Canonical API todo and run behavior. Electron process ownership and mobile remote-only execution stay unchanged. The Guest SDK stays unchanged unless a traced consumer requires an intentional contract update.

Use existing command categories and policy inspection paths. Verify native `/commit` dispatch and its requirements before deciding whether it is permitted. Preserve denial for internal URLs requiring a separate Host capability.

Keep startup failures visible. Investigate concrete worker stderr and initialization gates before attributing cascades to missing exports. Reproduce any claimed pre-existing test failure against origin/main with isolated data directories.

## What it must not do

- Add OpenCode-shaped adapters, old-OMP fallback shims, dependencies, or unrelated feature work.
- Change the vendored release identity or broaden authorization to satisfy tests.
- Modify changelog files or push commits.

## How we will know it works

- **W1.** Projection and mode regression tests cover pause, resume, run end, asynchronous wake, queued prompts and todo synchronization against the pinned upstream consumer semantics.
- **W2.** Contract and UI tests cover current todo states and rendering of historical blocked records, including empty and invalid data handling at the relevant boundaries.
- **W3.** Focused command, plugin, settings/localization and internal URL policy tests pass; allow/deny behavior agrees with native dispatch and URL grammar.
- **W4.** Agent Service real worker startup and service-worktree lease tests pass with isolated HOME and application data directories.
- **W5.** Root `bun run type-check` passes through mobile. Agent Service `bun test src` passes, except failures reproduced on origin/main with the same test inputs and isolation.
- **W6.** Affected lint, contract checks and dead-code checks pass; a fresh review finds no unresolved correctness or security issue. Update development status and remove the obsolete stage-1 failure inventory after verification.
- **W7.** Worker, manager, contract and shared FormDock tests cover native forms, selector hints, media safety, Other answers, validation, current-value timeout and cancellation.
- **W8.** Native-session/projection and relevant UI tests cover handoff compaction/cancellation, warming, intents, task progress and historical placeholders; browser policy retains Host authority.
- **W9.** Full type-check through mobile, Agent Service tests and affected UI/contract suites pass; implementation decisions and any unavailable checks are recorded. Commit locally without pushing or integrating main.

## Implementation order

1. Native lifecycle and removed SDK consumers, with focused service tests.
2. Canonical todo schema and historical rendering, with contract/UI tests.
3. Command classification, settings/localization and internal URL policy, with focused regressions.
4. Startup root causes, full verification, independent review, development status and logical local commits.

The owner approved this plan. Execution receipts are archived in `.workflow/done/omp19-integration/`; development.md records results and remaining verification limits.

## Stage 2b: Behavioral integration

The owner requested implementation on the same branch. Extend the existing canonical question surface for parsed HTML forms and selector presentation; never execute model HTML. Preserve native values, optional fields, disabled choices, Other answers, and defaults. Draft answers stay worker-local and use the pending question's CAS boundary so timeout and message interruption can return current values. Form media uses the existing safe Markdown/SVG presentation, without granting local-file or network execution authority.

Web/PWA, Electron, hosted mobile and Capacitor all use the shared FormDock and canonical question replies. Mobile remains remote-only. Guest SDK execution is unchanged.

Audit handoff compaction and cancellation, cache-warming caps, browser inspection/rendering, intent tracing, task steps/progress/completion and historical secret placeholders against the pinned upstream source. Record explicit no-op decisions where existing integration already preserves native semantics.

### OMP 19 source decisions

Sources below are in the pinned `@oh-my-pi/pi-coding-agent/src/` installation unless another package is named.

1. **Forms — adapt.** `tools/ask.ts` prefers `ui.formDialog` and submits current values on timeout; extension `onTimeout` is a no-argument notification, while the form result carries `data`, `notes` and `timedOut`. Reuse pi-tui `html-form/parse.ts` and `html-form/data.ts` inside the worker, including hidden defaults, choice values, Other and validation. Canonical optional control metadata and draft-update replies feed the existing FormDock. Drafts are worker-private; native HTML never enters a browser DOM. HTTP(S)/raster data images and fenced SVG use the existing Markdown/SVG sanitizers; local-file/script image sources are omitted. No arbitrary local-image capability is added. Forms without a timeout remain pending until answer/cancellation.
2. **Selectors — adapt.** `extensibility/extensions/types.ts` and pi-tui selectors distinguish the initial highlighted action from checked markers. Map `initialIndex` to the initial single answer; retain `selectionMarker`, immutable `checkedIndices` and `markableCount`. Choosing an action does not rewrite checked markers or turn the action into a multiselect answer. Trailing actions remain unmarked.
3. **Handoff — retain native dispatch, adapt cancellation.** `slash-commands/builtin-lifecycle.ts` maps `/handoff focus` to `session.compact(focus, {mode: 'handoff'})`; our existing native builtin dispatcher owns this mapping. Keep command acknowledgement tied to native completion/error rather than starting an unobserved promise. Native manual and background/auto compaction events already drive projection, including handed-off method, cancellation and failed/skipped completion. Add canonical `compact.abort` so compaction can be cancelled without a run ID, and call `abortCompaction()` during run abort. The Stop action selects compaction cancellation from the authoritative snapshot.
4. **Warming — make caps explicit.** `sdk.ts` caps configured modes with `session/cache-warmer.ts:capCacheWarmingMode`. Long-lived GUI sessions explicitly allow `idle`; one-shot tan sessions use `off`. Existing settings/apply validation already uses `off | streaming | idle`, so no boolean conversion or second warming controller is needed. Tests cover the nine mode/cap pairs and existing application/error paths.
5. **Browser — intentional policy/rendering no-op.** `tools/browser.ts` owns `insecure` and top-level string `app`, `argv`, `target`; it no longer advertises `allow_file_access`. It declares no lighter approval tier, so native tier resolution fails closed to `exec`. The descriptor does not reinterpret browser fields as filesystem targets; the Host requests execution consent for normal, empty and malformed browser calls. ToolPart's generic native input renderer preserves all fields without a browser compatibility adapter. Host web actions retain their separate capability checks. Tests exercise native tier resolution, real Host refusal and generic tool rendering.
6. **Intent — adapt SDK default.** `sdk.ts:intentTracingActive` defaults non-interactive SDK hosts off when no setting is configured. The worker explicitly configures tracing on when unset, preserving an explicit user choice. The existing canonical tool-input intent projection and UI need no extra native types. A real SDK worker regression verifies tracing is enabled.
7. **Tasks — adapt progress, retain native steps.** `task/index.ts:taskItemBrief` calls `task/steps.ts:renderStepsBrief`; the lifecycle/progress payload already supplies that ordered brief as `task`. Keep sequential execution worker/native-owned instead of adding a second canonical step state machine. pi-tui `tools/task.ts:AgentProgress` supplies stage, completion percentage, recent output and current intent. Project these observations and show them in the existing HUD/work-status surfaces. Keep completed/failed/cancelled rows and clear active-tool/retry indicators on authoritative terminal frames. Tests reject malformed progress, preserve empty output, and do not reintroduce `taskFile` or `sourceSession`.
8. **Secrets — rendering no-op with regressions.** `secrets/placeholder.ts:buildPlaceholder` emits keyed placeholders with optional friendly-name prefix and case hint. Historical transcript projection and Markdown rendering treat old/renamed placeholders as literal text; they must not attempt secret resolution. Tests contain placeholder strings only, never configured secret values.
