# OMP 19 integration

**Status:** in progress
**Priority:** high
**Integration branch:** devin/1795118904-omp-19

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

## Implementation order

1. Native lifecycle and removed SDK consumers, with focused service tests.
2. Canonical todo schema and historical rendering, with contract/UI tests.
3. Command classification, settings/localization and internal URL policy, with focused regressions.
4. Startup root causes, full verification, independent review, development status and logical local commits.

The owner approved this plan. Execution follows tasks in `.workflow/tasks/omp19-integration/`.
