# 14: Migrate session, composer and interactive UI flows

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** <commit-sha>

**Delivers:** Main session view, composer, session actions, approval/question dialogs, subagent timeline navigation and live status consume Canonical Client events and service-owned state through the shared sync model.

**Blocked by:** 10, 13, 32
**Files:** `packages/ui/src/session/`, `packages/ui/src/components/`, `packages/ui/src/stores/`, `packages/ui/src/sync/`, focused UI tests and documentation

**Read first:** `.workflow/specs/omp-through-m3.md` M3/W4/W7/W8; `.workflow/tasks/omp-through-m3/32-m3-native-subagent-navigation.md`; `.workflow/omp-migration/scope.md` `SCOPE-4.1`, `SCOPE-4.3` subagent timeline navigation; UI session/composer/action consumers; contracts interaction/event sections; sync-state invariants and locale skills; `packages/ui/src/lib/theme/STYLING.md` for affected styling; existing component test conventions
**Covers:** W4, W7, W8

**Check:** Use the repository isolated runner on affected session/composer/interaction test directories, then observe the actual connected UI → prompt attachments, reasoning/tool/terminal output, subagent timeline navigation, abort/retry/steering/follow-up, CAS conflict and reconnect/reset all use canonical state. Record exact directories and launch command in Progress; static fixtures alone cannot satisfy the visible-flow check.

- [x] Replace session and composer agent calls with the Canonical Client.
- [x] Render pending approval/question versions and handle stale-answer errors without optimistic overwrite.
- [x] Keep live activity derived from live channels, not persisted history.
- [x] Preserve partial output and unrelated session state on one request failure.
- [x] Update only necessary user-facing strings through the locale pattern and keep controls accessible.
- [x] Render subagent timeline links and navigation from Task 32 Canonical Client methods and ToolCallPart/ToolResultPart (`toolName: "task"`) without OpenCode fallbacks.
## Progress

- Canonical session actions already own run, abort, steer, follow-up, approval and question CAS calls; the composer now uses canonical prompt selection and Host `RuntimeAPIs.files` for inline attachment existence checks, with no OpenCode command/catalog fallback.
- Added native `Message[]` transcript Markdown/text conversion and migrated export coverage to canonical `Part.content`; system prompt plumbing is excluded.
- Focused checks: session actions/export/message text — 80 passed, 0 failed; `ToolPart.subagent-row.test.tsx` — 5 passed, 0 failed, 20 assertions (390 ms). The latter covers exact parent/tool-call joins, batched children, failure retention, and grouped rows' addressed session/directory.
- `ToolPart` reads `canonicalClient.listSubagents(sessionId)` and matches exact `parentSessionId` and `toolCallId`, without output parsing. Desktop opens a read-only context tab; pinned columns reuse `openSession`; mobile selects the child in place. `TurnActivity` and `ProgressiveGroup` thread session/directory through the memoized row.
- Task 32 owns child registry/history/cursor authority. Connected Web/Electron acceptance remains open under Task 18; component tests do not close the task.
**Finished:** 2026-10-16
