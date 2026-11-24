# 05: Comprehensive OMP 19.1 All-Tools Presentation & Structured Cards Adaptation

**Effort:** ux-audit-remediation-2026-11-24
**Blocked by:** 04
**Covers:** W5

**Files:**
- `packages/ui/src/lib/toolPresentation/presentations.ts`
- `packages/ui/src/lib/toolPresentation/index.ts`
- `packages/ui/src/lib/toolPresentation/types.ts`
- `packages/ui/src/lib/toolPresentation/toolView.ts`
- `packages/ui/src/lib/toolPresentation/*.test.ts`
- `packages/ui/src/lib/toolHelpers.ts`
- `packages/ui/src/lib/toolResultContent.ts`
- `packages/ui/src/components/chat/message/parts/ToolPart.tsx`
- `packages/ui/src/components/chat/message/parts/VibeToolCard.tsx` (new)
- `packages/ui/src/components/chat/message/parts/WaitToolCard.tsx` (new)
- `packages/ui/src/components/chat/message/parts/StructuredToolCards.tsx` (new)
- `packages/ui/src/components/chat/message/parts/ToolPart*.test.tsx`
- `packages/ui/src/components/chat/message/parts/DOCUMENTATION.md`
- `packages/ui/src/lib/i18n/messages/chat-workbench.i18n.ts`
- `packages/ui/src/lib/i18n/messages/openchamber-tool-output.i18n.ts`

**Read first:**
- `.workflow/specs/ux-audit-remediation-2026-11-24.md`
- `packages/ui/src/lib/theme/STYLING.md`
- `packages/ui/src/components/chat/message/parts/DOCUMENTATION.md`
- `packages/agent-service/node_modules/@oh-my-pi/pi-coding-agent/src/tools/builtin-names.ts`
- `packages/agent-service/node_modules/@oh-my-pi/pi-coding-agent/src/tools/vibe.ts`
- `packages/agent-service/node_modules/@oh-my-pi/pi-coding-agent/src/tools/wait.ts`
- `packages/agent-service/node_modules/@oh-my-pi/pi-coding-agent/src/tools/debug.ts`
- `packages/agent-service/node_modules/@oh-my-pi/pi-coding-agent/src/tools/gh.ts`
- `packages/agent-service/node_modules/@oh-my-pi/pi-coding-agent/src/tools/yield.ts`
- `packages/agent-service/node_modules/@oh-my-pi/pi-coding-agent/src/tools/resolve.ts`
- `packages/agent-service/node_modules/@oh-my-pi/pi-coding-agent/src/tools/report-tool-issue.ts`
- `packages/agent-service/node_modules/@oh-my-pi/pi-coding-agent/src/tools/security-scan.ts`
- `packages/agent-service/node_modules/@oh-my-pi/pi-coding-agent/src/goals/tools/goal-tool.ts`
- `packages/agent-service/node_modules/@oh-my-pi/pi-tui/src/tools/vibe.ts` (if present — check exact TUI rendering conventions)
- `.agents/skills/locale-ui-patterns/SKILL.md`

**Check:** `bun run --cwd packages/ui test src/lib/toolPresentation/ src/components/chat/message/parts/ && bun run --cwd packages/ui type-check`

## Context

Maintainer feedback (Image #8):
- `Vibe spawn`, `Vibe wait`, `Vibe list`, `Vibe kill` render raw `{ "prompt": "...", "name": "home-disk-usage", "cli": "fast" }` JSON blocks and raw ack text in expanded bodies, with broken/missing call descriptions and zero TV-wall worker screens or `OpenSubtaskButton` links!
- Maintainer explicitly demanded ALL OMP 19.1 built-in and injected tools be properly adapted (not just `vibe_*`).
- Audit confirmed `projection.ts` already forwards rich `details` verbatim (`toolResultOutput` and partial `tool_stream_update` updates); the gap is 100% in `packages/ui/src/lib/toolPresentation/`, `toolHelpers.ts`, and `ToolPart.tsx`.

## Checklist

- [ ] **Fix ALL `TOOL_PRESENTATIONS` Entries in `packages/ui/src/lib/toolPresentation/presentations.ts` & `index.ts`**:
  - **`vibe_spawn`**: `describeCall` → `${cli} · ${name}` (or first line of `prompt` if `name` absent); `describeResult` → `${spawned.id} · ${cli}` (using `details.spawned` and screen state if available).
  - **`vibe_send`**: fix wrong key `id` → `session` (`→ ${session}` + concise message snippet); `describeResult` → `${send.id} · ${send.mode}`.
  - **`vibe_wait`**: fix wrong key `id` → `sessions` (comma-joined session list or timeout label); `describeResult` → `${settled.length} settled · ${stillRunning.length} running` (+ `timed out` when `wait.timedOut`).
  - **`vibe_kill`**: fix wrong key `id` → `session`; `describeResult` → `${killed.id} · killed` (+ `cancelled turn` when `killed.cancelledTurn`).
  - **`vibe_list`**: `describeCall` → `''`; `describeResult` → `${screens.length} sessions` (with active count when > 0).
  - **`yield`**: fix wrong key `action` → `type` / `key`; `describeResult` → `details.status` / `details.type`.
  - **`think`**: fix wrong key `action` → first line of `thoughts`; `describeResult` → localized recorded status.
  - **`new_context`**: fix wrong key `action` → clean summary from `details.requested`.
  - **`resolve` / `reject` / `propose`**: fix wrong keys `action`/`id` → `reason` / `title`; `describeResult` → `details.action`.
  - **`report_issue`**: fix wrong keys `title`/`description` → first line of `report`.
  - **`glob`**: prioritize `pattern` before `path` (or `${pattern} in ${path}`).
  - **`generate_image`**: read `subject` first (`['subject', 'prompt', 'action']`), include `details.provider`/`model`/`imageCount`.
  - **`openchamber_usage`**: add missing presentation entry (`hostCall` pattern, appropriate icon `bar-chart` / `pie-chart`, clean summary).
  - **`mcp__*` fallback**: prettify label in `fallbackPresentation` when `toolName` starts with `mcp__` or `details.serverName`/`details.mcpToolName` exists → `${serverName}: ${mcpToolName}` instead of raw `mcp__foo_bar`.
  - Update `isSubagentTool` (or add `isVibeSubagentTool`) so `vibe_spawn` participates in subagent linking without breaking `task` batch assumptions.
- [ ] **Build Dedicated `VibeToolCard.tsx` (Zero Raw JSON Dump!)**:
  - Parse `VibeToolDetails` safely with Zod (`op`, `screens[]`, `hiddenKilled[]`, `spawned`, `send`, `wait`, `killed`) — never `any` or unchecked casts!
  - Render clean OpenChamber-styled UI using semantic theme tokens (`STYLING.md`):
    - For `vibe_spawn` & `vibe_send`: render a clean quoted prompt/message header with `[cli]` badge and target session badge (`name`/`session`), NEVER a raw JSON code block!
    - Render **TV-wall `screens[]`** rows: status icon (`running`/`idle`/`done`/`failed`/`killed`), worker `id` + `[cli]` pill, `turns` (+ `queued` if > 0), live `currentTool` + `currentToolArgs` / `lastIntent` / `lastActivity`, collapsible compact trace/outputTail preview, AND an **`OpenSubtaskButton`** (looking up `childSessionId` in `useSubagentsStore` by `subagent.name === screen.id`, plus an action to open `SubagentsPanel`)!
    - Render compact op-specific summary footer:
      - `spawn`: spawned session `id` + `cli` + `jobId` + `OpenSubtaskButton` (even before `screens` has rows!)
      - `send`: target `id` + delivery mode (`turn`/`steered`/`queued`)
      - `wait`: settled list (status icon + `id` + `status`) + stillRunning badges + timedOut notice
      - `kill`: killed `id` + cancelledTurn note
      - `list`: hiddenKilled count note if > 0
- [ ] **Build `WaitToolCard.tsx` & `StructuredToolCards.tsx` for ALL Remaining OMP 19.1 Tools**:
  - **`WaitToolCard.tsx`** (`wait`): parse `CoordinationDetails` (`jobs[]`, `agents[]`, `cancelled[]`, `interrupted`) and render clean per-job & per-agent status rows (status icon, label/id, status badge) instead of counts-only + raw text!
  - **`StructuredToolCards.tsx`** (all using semantic tokens & Zod parsing):
    - **`debug`**: render `DebugToolDetails.snapshot` header bar (status pill, `stopReason`, `source:line`, `frameName`) + text output.
    - **`github`**: render `GhToolDetails` header (repo, branch, status/conclusion pill, failedJobs badges, watch run jobs/steps tree when present) + text output.
    - **`goal`**: render `GoalToolDetails.goal` (objective, status pill, token usage vs budget).
    - **`security_scan`**: render `SecurityScanToolDetails` (action, plan/operation status pill, finding summary).
    - **`checkpoint` / `rewind`**: render goal/report cleanly as styled text/markdown without raw JSON input.
    - **`yield` / `think` / `report_issue` / `resolve` / `reject` / `propose`**: render clean human content (`thoughts`, `report`, `reason`, `title`, or formatted `data` markdown/JSON tree for `yield`) instead of raw JSON input dump!
  - **`web_search` enhancement**: in existing `renderWebSearchOutput`, surface `details.response.answer` synthesis (when present) and `details.failures[]` compact warning alongside the existing sources list.
  - **`read` / `grep` / `ast_grep` enhancement**: prefer `details.displayContent` over model-facing hashline text when `details.displayContent` is a non-empty string!
- [ ] **Eliminate Raw JSON Input Dumps in `ToolPart.tsx` & `toolHelpers.ts`**:
  - Suppress `formatToolInput` raw JSON blocks for every tool whose structured card/header already presents its input (`vibe_*`, `wait`, `yield`, `think`, `report_issue`, `resolve`, `reject`, `propose`, `checkpoint`, `rewind`, `goal`, `debug`, `github`, `security_scan`, `new_context`).
  - For any remaining generic/unknown/MCP tool with flat scalar inputs, format as clean key-value rows rather than an italic raw JSON blob (keeping full JSON fallback only for deeply nested unknown payloads).
  - Update `packages/ui/src/components/chat/message/parts/DOCUMENTATION.md` to document the new OMP 19.1 tool renderers.
- [ ] **i18n & Comprehensive Tests**:
  - Translate every added user-facing label/badge across ALL 15 locales in `chat-workbench.i18n.ts` / `openchamber-tool-output.i18n.ts`.
  - Add unit/component tests covering:
    - All 5 `vibe_*` tools (`describeCall`, `describeResult`, `VibeToolCard` TV-wall screens, zero raw JSON, `OpenSubtaskButton` click)
    - `wait`, `debug`, `github`, `goal`, `security_scan`, `yield`, `think`, `report_issue`, `resolve`/`reject`/`propose`, `openchamber_usage`, `mcp__*`
    - `displayContent` preference for `read`/`grep`/`ast_grep`
    - `web_search` answer synthesis & failures

## Progress

- Planned; blocked by 04.
