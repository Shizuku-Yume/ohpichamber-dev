# 04: Restore Side-by-Side Work Status, Right Rail Subagents/Chat Reachability & Vibe/Subagent Lifecycle

**Effort:** ux-audit-remediation-2026-11-24
**Blocked by:** None
**Covers:** W4

**Files:**
- `packages/ui/src/components/chat/work-status/useWorkStatusVisibility.ts`
- `packages/ui/src/components/chat/work-status/useWorkStatusVisibility.test.ts`
- `packages/ui/src/components/chat/ChatContainer.tsx`
- `packages/ui/src/components/layout/MainLayout.tsx`
- `packages/ui/src/components/layout/ContextPanelRail.tsx`
- `packages/ui/src/lib/surfaces/registry.ts`
- `packages/ui/src/lib/surfaces/registry.test.ts`
- `packages/ui/src/stores/useGlobalSessionsStore.ts`
- `packages/ui/src/stores/useGlobalSessionsStore.test.ts`
- `packages/ui/src/stores/useSubagentsStore.ts`
- `packages/ui/src/components/chat/work-status/useSubagentRows.ts`
- `packages/ui/src/components/chat/work-status/useSubagentRows.test.ts`
- `packages/ui/src/components/chat/work-status/WorkStatusSubagentsSection.tsx`
- `packages/ui/src/components/chat/subagents/SubagentsPanel.tsx`
- `packages/ui/src/components/chat/subagents/SubagentsPanel.test.tsx`
- `packages/ui/src/components/chat/subagents/subagentTask.ts`
- `packages/ui/src/components/chat/subagents/subagentTask.test.ts`
- `packages/ui/src/components/chat/work-status/useSubagentReports.ts`
- `packages/agent-service/src/worker/subagent-projection.ts`
- `packages/agent-service/src/worker/projection.ts`
- `packages/agent-service/src/worker/session.ts`
- `packages/agent-service/src/worker/projection.test.ts`
- `packages/ui/src/lib/i18n/messages/subagents.i18n.ts`

**Read first:**
- `.workflow/specs/ux-audit-remediation-2026-11-24.md`
- `git show 30c70496a5:packages/ui/src/components/chat/work-status/useWorkStatusVisibility.ts`
- `git show 30c70496a5:packages/ui/src/components/chat/column/useWorkStatusPlacement.ts`
- `git show 30c70496a5:packages/ui/src/components/layout/MainLayout.tsx`
- `packages/ui/src/components/layout/useSidebarPeek.ts`
- `packages/ui/src/hooks/usePaletteShortcuts.ts`
- `packages/ui/src/components/chat/subagents/DOCUMENTATION.md`
- `packages/agent-service/node_modules/@oh-my-pi/pi-coding-agent/src/tools/vibe.ts`
- `packages/agent-service/node_modules/@oh-my-pi/pi-coding-agent/src/vibe/runtime.ts`
- `.agents/skills/sync-state-invariants/SKILL.md`

**Check:** `bun run --cwd packages/agent-service test src/worker/projection.test.ts && bun run --cwd packages/ui test src/components/chat/work-status/ src/components/chat/subagents/ src/lib/surfaces/registry.test.ts src/stores/useGlobalSessionsStore.test.ts && bun run --cwd packages/agent-service type-check && bun run --cwd packages/ui type-check`

## Context

Maintainer feedback (Images #8, #9, #10):
1. Comparing OhPiChamber against upstream OpenChamber v2.8.0 (`30c70496a5`):
   - During the v2.8.0 merge, `useWorkStatusVisibility.ts` LOST upstream's `roomyBesidePanel` (`wideEnoughBesidePanel`) and `ChatContainer.tsx` LOST passing `besidePanel={workStatusRoomyBesidePanel}` to `<WorkStatusPanel>`. As a result, opening ANY right Context Panel (`SubagentsPanel` or `Chat`) immediately hides `WorkStatusPanel` even on 2048px screens, instead of displaying Work Status + SubagentsPanel side-by-side like upstream v2.8.0!
   - `MainLayout.tsx` also disconnected `useSidebarPeek` (`packages/ui/src/components/layout/useSidebarPeek.ts`) and `usePaletteShortcuts` (`packages/ui/src/hooks/usePaletteShortcuts.ts`) even though both files were merged from upstream v2.8.0!
2. On the far-right Activity Rail (`ContextPanelRail.tsx` + `registry.ts`):
   - Both `subagents` (`ai-agent`) and `chat` (`chat-4`) are gated solely on `availability: 'has-content'` (`tabs.some(t => t.mode === surface.mode)`). Even when the current session has running/completed subagents, the `subagents` rail icon NEVER appears until the user finds another button to open the tab!
3. Subagent & Vibe child session titles & linking:
   - `useGlobalSessionsStore.ts:114` (`childSessionRecord`) hardcodes `title: child.role` (`sonic` for OMP fast vibe workers / `task` for good), so the left sidebar and tab bar show `sonic` and `sonic` instead of the real subagent name (`home-disk-usage-2`) or task description!
   - OMP 19.1 `vibe_spawn` ignores `_toolCallId`, leaving `Subagent.toolCallId = undefined` and setting `description = 'vibe fast session'`. As a result, `subagentTask.ts` cannot recover the vibe worker's prompt and timeline cards cannot correlate `vibe_spawn` to its spawned worker!

## Checklist

- [x] **Restore Upstream v2.8.0 Side-by-Side Work Status (`besidePanel`) & Dropped `MainLayout` Hooks**:
  - Port upstream `30c70496a5`'s exact `useWorkStatusVisibility.ts` logic (minus retired `isVSCode` branching — keep `isVSCode?: false` or clean desktop-only signature) restoring:
    - `isZoneShown(..., state.contextSurfaceZones, 'right')`
    - `sideZoneWidth(...)` + `contextPanelExpanded` check
    - `sidebarPendingWidth()`
    - `wideEnoughBesidePanel = width >= WORK_STATUS_REQUIRED_ROW_WIDTH + contextPanelWidthRef.current`
    - `roomyBesidePanel = roomy && wideEnoughBesidePanel && !contextPanelExpanded`
    - `fits = contextPanelOpen ? roomyBesidePanel : roomy`
  - Update `ChatContainer.tsx` to read `roomyBesidePanel` from `useWorkStatusVisibility` and pass `besidePanel={workStatusRoomyBesidePanel}` to the portaled `<WorkStatusPanel>` (line ~1968).
  - Verify `Header.tsx` (`StatusHeaderControls`) always shows the Work Status panel toggle on desktop when the user wants to enable/disable or open Work Status as overlay.
  - Reconnect `useSidebarPeek` (on `LeftSidebar` / `<Sidebar peek={peek}>`) and `usePaletteShortcuts()` in `MainLayout.tsx` matching `30c70496a5`.
- [x] **Right Activity Rail: Make `subagents` & `chat` Reliably Reachable**:
  - In `packages/ui/src/lib/surfaces/registry.ts`:
    - Add `subagentsShown?: boolean` to `VisibleRailSurfacesOptions` (mirroring `workflowsShown` and `receivedPagesShown` right above it!).
    - In `getVisibleContextRailSurfaces`: if `surface.id === 'subagents' && options.subagentsShown`, return `true`!
  - In `packages/ui/src/components/layout/ContextPanelRail.tsx`:
    - Compute `subagentsShown` from the active session's subagents (using `useSubagentRows(currentSessionId, effectiveDirectory || null).length > 0` OR `tabs.some((tab) => tab.mode === 'subagents')`).
    - Pass `subagentsShown` into `getVisibleContextRailSurfaces(...)`.
    - Result: the moment a session spawns ANY subagent (`task` or `vibe_spawn`), the `subagents` (`ai-agent`) icon appears immediately on the far-right Activity Rail (even if Work Status is hidden or off!), and clicking it toggles `SubagentsPanel` right beside `WorkStatusPanel`!
  - Also verify `chat` (`chat-4`) rail icon behavior:
    - Whenever a child session or side chat is opened via `useOpenChildSession`, `OpenSubtaskButton`, `SubagentsPanel`, `WorkStatusSubagentsSection`, `TimelineNoticeCard`, or sidebar "Open in side panel" (`openSessionInSidePanel`), `tabs` contains `{ mode: 'chat', ... }` and the `chat` icon immediately appears & highlights on the right rail right below `subagents` (matching Image #10).
    - Also allow clicking `chat` on the right rail to work cleanly if a user pins/opens a side chat or switches back to an open side chat tab.
- [x] **Fix Subagent & Vibe Child Session Titles (`home-disk-usage-2`, NEVER `sonic`)**:
  - Add a shared deterministic title resolver helper (used by `useGlobalSessionsStore.ts` `childSessionRecord` AND `upsertSubagents` / `applySubagentUpdate`):
    1. Prefer `child.name?.trim()` when non-empty AND distinct from a bare generic role-only placeholder (e.g. `home-disk-usage-2`, `AlphaScout`, `Simple demo task`).
    2. Next prefer first non-empty line of `child.description?.trim()` (ignoring OMP's generic `'vibe fast session'` / `'vibe good session'` boilerplate!) or `child.task?.trim()` (clamped cleanly to ~80 chars).
    3. Fall back to `child.role` ONLY when name, description, and task are all empty!
  - In `packages/ui/src/stores/useGlobalSessionsStore.ts`:
    - Update `childSessionRecord(parent, child)` to stamp this resolved title instead of `child.role`!
    - When `upsertSubagents` receives updated subagent metadata (e.g. name or task arriving on progress/lifecycle updates) for an already-synthesized child session whose title was previously just `child.role` or empty, update the session's `title` in place so sidebar rows and session tabs refresh immediately!
- [x] **Correlate OMP 19.1 `vibe_spawn` Workers with `toolCallId`, Prompt, and Subagent Panels**:
  - In `packages/agent-service/src/worker/subagent-projection.ts` & `projection.ts` & `session.ts`:
    - When a `vibe_spawn` tool call executes/completes with `toolCallId`, `input: { prompt, name, cli }`, and `details.spawned?.id` (e.g. `home-disk-usage-2`), correlate `details.spawned.id` in `SubagentProjector`:
      - Backfill `toolCallId` on that subagent record if unset,
      - Replace generic `'vibe fast session'` / `'vibe good session'` `description` with a concise first line of `prompt` (and populate `task: prompt` if empty),
      - Emit updated `Subagent` so both live `subagent.updated` SSE and persisted `listSubagents` carry the real `toolCallId` and prompt!
  - In `packages/ui/src/components/chat/subagents/subagentTask.ts`:
    - Extend `findSubagentTask` to inspect BOTH `task` AND `vibe_spawn` / `vibe_send` tool calls (matching by `toolCallId`, `details.spawned.id`, `input.name`, or `input.session`) so `SubagentsPanel` ALWAYS displays the full prompt for vibe workers!
  - In `packages/ui/src/components/chat/work-status/useSubagentRows.ts` & `useSubagentReports.ts`:
    - Verify vibe workers appear cleanly in BOTH `WorkStatusSubagentsSection` and `SubagentsPanel` with their real name (`home-disk-usage-2`), role/model subtitle, live activity/tool, tokens/cost/duration, Markdown report from `async_job_result` / `vibe_wait`, and working click-to-open-in-side-panel (`mode: 'chat', readOnly: true`)!
- [x] **Tests & i18n**:
  - Update `useWorkStatusVisibility.test.ts` (testing `roomyBesidePanel` side-by-side behavior at wide vs narrow widths and expanded context panel).
  - Update `registry.test.ts` (testing `subagentsShown` makes `subagents` visible even before a tab is opened).
  - Update `useGlobalSessionsStore.test.ts` (testing `childSessionRecord` prefers `name` like `home-disk-usage-2` over `role: 'sonic'`, and updates stale `role` titles).
  - Add worker test in `projection.test.ts` and UI tests in `subagentTask.test.ts` / `useSubagentRows.test.ts` / `SubagentsPanel.test.tsx` covering `vibe_spawn` correlation, prompt extraction, and side-by-side panel behavior.

## Progress

- Restored upstream v2.8.0 (`30c70496a5`) side-by-side Work Status (`roomyBesidePanel`, `isZoneShown`, `sideZoneWidth`, `showsFileTreeOnly`, `sidebarPendingWidth`) in `useWorkStatusVisibility.ts`, passed `besidePanel={workStatusRoomyBesidePanel}` in `ChatContainer.tsx`, exported `showsFileTreeOnly` in `zones.ts`, and reconnected `useSidebarPeek` + `usePaletteShortcuts` in `MainLayout.tsx`.
- Added `subagentsShown` to `getVisibleContextRailSurfaces` in `registry.ts`, shared `useSubagentsSurfaceShown` / `isSubagentsSurfaceShown` in `useSubagentRows.ts`, and wired both `ContextPanelRail.tsx` and `useKeyboardShortcuts.ts` (`switch_context_surface` digit shortcut, including `receivedPagesShown` parity).
- Added `resolveSubagentSessionTitle` in `useGlobalSessionsStore.ts` (skipping role-only names and `vibe fast/good session` boilerplate), live `subagent.updated` -> `upsertSubagents` forwarding in `sync-context.tsx`, and `vibe_spawn`/`vibe_send` correlation across `subagent-projection.ts`, `projection.ts`, `session.ts`, `worker/index.ts`, `protocol.ts`, `supervisor/workers.ts`, `subagent-lifecycle.ts`, `subagentTask.ts`, `SubagentsPanel.tsx`, `useSubagentRows.ts`, and `useSubagentReports.ts`.
- Addressed all P1/P2 findings from independent `reviewer` subagent (`task04/reviewer.md`).
- Verified on combined tree (`task04/final-check.log`, `task04/final-typecheck.log`, `task04/final-oxlint.log`): `agent-service` tests (167 pass across `projection.test.ts`, `subagent-projection.test.ts`, `session-native.test.ts`, `registry-native.test.ts`), isolated UI `work-status` + `subagents` tests (25/25 files pass), `registry.test.ts` (11 pass), `useGlobalSessionsStore.test.ts` (21 pass), `useKeyboardShortcuts.test.tsx` (2 pass), `sync-context-selection-boundary.test.tsx` (16 pass), `agent-service` + `ui` `type-check` (0 errors), and `oxlint` across all 32 changed files (0 findings).
- Check after: pass — `bun test --timeout 15000 packages/agent-service/src/worker/projection.test.ts packages/agent-service/src/worker/subagent-projection.test.ts packages/agent-service/src/worker/session-native.test.ts packages/agent-service/src/sessions/registry-native.test.ts` (167 pass), `node scripts/run-isolated-tests.mjs packages/ui/src/components/chat/work-status packages/ui/src/components/chat/subagents` (25/25 files pass), `bun test packages/ui/src/lib/surfaces/registry.test.ts packages/ui/src/stores/useGlobalSessionsStore.test.ts packages/ui/src/hooks/useKeyboardShortcuts.test.tsx packages/ui/src/sync/sync-context-selection-boundary.test.tsx` (11+21+2+16 pass), `bun run --cwd packages/agent-service type-check` + `bun run --cwd packages/ui type-check` (0 errors), `oxlint` (0 findings) — see `task04/final-*.log`.
- Review: pass (base b8a504f558f0c4649da146a78e589277cfadc580) — independent `reviewer` subagent findings saved to `task04/reviewer.md`; all P1/P2 findings resolved and re-verified.
- Rework round 2: persisted `sessionTitleFallback` in `OpenSubtaskButton.tsx`, `ToolPart.tsx` (`openChild`), and `useOpenChildSession.ts`; updated `buildSessionTitleMap` in `contextPanelSessionTitles.ts` and `useSessionTitleMap` in `ContextPanel.tsx` to read/subscribe to `useGlobalSessionsStore`; localized `subagents.openSubtask` across all 15 locales in `subagents.i18n.ts` so `OpenSubtaskButton` uses the resolved display name instead of role; applied `rework/round-2-gate-fixes.patch` (`stored-provider-entry.ts` removal and `settingsLayoutGuard.test.ts` fix); added post-reload tests in `contextPanelSessionTitles.test.ts` and `ContextPanel.chatTitleReload.test.tsx`; updated `packages/ui/src/components/layout/DOCUMENTATION.md`; verified by independent `reviewer` (`Verdict: correct`).
