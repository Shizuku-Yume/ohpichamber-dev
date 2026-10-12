# Latest-upstream baseline for OhPiChamber

**Status:** in progress
**Priority:** high

## What this is for

The earlier selectively synchronized runtime made newer features difficult to integrate coherently. The maintainer chose a full pinned upstream baseline followed by restoration of OhPiChamber customization. The source and owning documents are now updated; task02 closes at that source/document boundary and task03's W5 audit is complete. W3 runtime certification remains a separate, explicitly incomplete acceptance boundary. The later M0 gate and migration implementation belong to the [OMP effort](omp-through-m3.md), with current evidence in [development.md](../development.md).

The settled choice is recorded in [decisions.md](../decisions.md#2026-10-10---latest-upstream-first-then-restore-the-fork).

## What it does

OhPiChamber starts from one coherent, pinned upstream application revision, with matching runtime, dependencies, build configuration, and features. Board, environment management, Quake, file-tree moves, Node/build changes, Guest lifecycle, and isolated-space wiring travel with that baseline; the list is not a selective-import limit. Other upstream application changes are reviewed as part of the same update.

Fork-owned guidance, workflow, historical investigations, development records, and intentional customization survive. Migration documents distinguish inherited upstream behavior from the later OMP-only target and identify what must be rebuilt or removed.

## How it is built

1. Refresh the upstream main revision when the effort starts and record its exact identity, acquisition method, comparison baseline, and date. The previously inspected `78dacb27fee580ec945a828d781cfe39b200b7bd` is a historical input, not a live-latest guarantee. Use source archives/API without Git commands unless the maintainer explicitly authorizes Git.
2. Inventory local differences before replacement. Compare fork source, upstream source, and prior available baseline evidence to distinguish independent fork work, inherited code, obsolete selective ports, and unrelated user changes. Uncertain user-owned changes require preservation, not automatic deletion.
3. Update the application source and its runtime/package/build contracts coherently. Do not maintain a 1.x/2.x adapter or leave half the callers on the old API. Inheriting the new upstream OpenCode runtime is permitted during this prerequisite; it is not the final OMP engine or proof of migration completion.
4. Restore the fork's identified customization with existing local conventions. Keep licensing and security boundaries. Preserve fork-owned development routing and the decision not to restore upstream contribution ceremonies or collaboration bots. Respect maintainer-owned changelog rules; source synchronization does not authorize release-note generation.
5. Re-audit the feature inventory, scope traceability, architecture, proposed contracts, milestone ordering, module documentation, and operational setup against the actual refreshed source. Preserve the old inventory and investigations as dated records; update current guidance in place. Only then resume the OMP capability gates.

After source verification and documentation updates, remove obsolete application-baseline version statements throughout project guidance, including `used OpenChamber v1.24.2` phrasing. Do not replace them with another permanent hard-coded release in project introductions. Preserve useful investigation content; keep reproducibility details with the source-evidence record rather than repeating stale version framing across active documents.

The application update is one coherent cutover because its new SDK, events, credentials, lifecycle, and build configuration are coupled. It must not be split into a broken intermediate mixture of two upstream runtime generations.

## What it must not do

- Implement the OMP Agent Service in this rebaseline effort or claim M0 passed.
- Treat old selective pick/exclude/defer recommendations as current import policy.
- Blindly overwrite unrelated local work, secrets, configuration, or fork-owned documents.
- Invent unsupported engine fallbacks, fake successful Guest/Shell results, or unverified space security guarantees.
- Declare native, Docker, packaged-desktop, remote, or provider flows verified without exercising them.
- Reinterpret inheriting a baseline as a decision to retain OpenCode compatibility or VS Code extension support in the final OMP target.

## What was considered and rejected

- **Keep 1.x and selectively port the new features.** It preserves the old runnable environment, but the maintainer explicitly wants the latest upstream baseline. Guest Shell lifecycle and newer spaces also depend on APIs absent from the old runtime.
- **Register the features without updating the baseline.** It avoids immediate implementation work but leaves the next conversation with the wrong goal. The maintainer requests the full update as the next effort, not a plan to keep the old repository indefinitely.
- **Discard the old research and replace the fork wholesale.** It simplifies file replacement but loses useful investigations, development routing, and intentional customization. Preserve evidence and recheck its applicability instead.

## How we will know it works

- **W1.** Source acquisition reports a pinned upstream revision and date; a reproducible path/content comparison accounts for fork-only files, changed files, upstream removals, and retained customization without running unauthorized Git commands.
- **W2.** On the updated toolchain, package-script install/build/type-check/lint/test checks and the configured dead-code report run against the assembled checkout. Reports distinguish new failures from inherited failures and unavailable platform prerequisites; the runtime dependency graph does not mix legacy and new SDK callers.
- **W3.** Connected host/UI and actual desktop smoke exercise changed entrypoints. Board navigation, environment overlays, file moves with unsaved edits, Quake window/shortcut behavior, Guest Shell lifecycle, and isolated-space routing each have an observed result. Credential-bearing integrations, native mobile, and live Docker boundaries need their applicable environment; missing access remains an explicit verification blocker, not a passing mock.
- **W4.** Fork customization inventory has a disposition and observed verification for every retained behavior. Workflow validation and task discovery pass; preserved research and development entrypoints remain reachable.
- **W5.** Post-update documentation review ties ownership, feature coverage, runtime/configuration assumptions, and remaining migration gates to the pinned source. Local links and workflow validation pass. No document claims an OMP capability gate was completed by upstream synchronization.

Static/package checks cover contracts and build consistency; runtime smoke covers the user-visible paths and lifecycle boundaries that static checks cannot establish. External dependencies are verified with real authorized access or reported as not exercised. Security-sensitive spaces and credentials require an independent boundary review.

## Notes

The historical comparison and its source references remain in [upstream-review.md](../upstream-review.md). The original OMP analysis remains in [omp-migration](../omp-migration/README.md); the earlier sandbox design and experiments remain in [isolated-spaces](../isolated-spaces/DESIGN.md).

The documentation handoff reviewed the current project entrypoints and the earlier read-only source maps for host/Board, environment/Guest, desktop/files, build/toolchain, and isolated spaces. No application source was changed or runtime acceptance performed by that handoff.

Tasks, in order:

1. [Pin latest upstream and inventory fork preservation](../done/upstream-rebaseline/01-baseline-and-fork-inventory.md).
2. [Adopt the coherent baseline and restore customization](../done/upstream-rebaseline/02-update-and-restore.md).
3. [Re-audit migration and owning documents](../done/upstream-rebaseline/03-reaudit-documents.md).
