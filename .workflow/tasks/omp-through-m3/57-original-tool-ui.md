# 57: Restore original tool call and output preview UI

**Effort:** omp-through-m3
**Task type:** bugfix
**Base commit:** e848504602333955b1d134bba3345d8bbc2ed065

**Delivers:** Restores the original compact animated tool execution row, status feedback, and rich `ToolOutputDialog` with diff previews, syntax-highlighted code, quick-open actions, subagent inspection, and shell output formatting from pre-M1 baseline (`bfa8edacb9b0096aabf40b12886794ce62df8ddb`). Replaces raw `<pre>` or generic `<details>` substitutes with the original tool UI connected to native canonical tool calls and outcomes, with truthful OMP semantics.

**Blocked by:** 65, 67
**Files:** `packages/ui/src/components/chat/message/parts/ToolPart.tsx`, `packages/ui/src/components/chat/message/parts/ToolPartDiffPreview.tsx`, `packages/ui/src/components/chat/message/ToolOutputDialog.tsx`, `packages/ui/src/components/chat/message/toolRenderers.tsx`, `packages/ui/src/components/chat/DiffPreview.tsx`, related tool part helpers and tests
**Read first:** Visual reference at `bfa8edacb9b0096aabf40b12886794ce62df8ddb` (`packages/ui/src/components/chat/message/parts/ToolPart.tsx`, `ToolOutputDialog.tsx`); canonical tool schemas in `packages/agent-contract/src/messages.ts`; `.workflow/specs/omp-through-m3.md` W7, W9, W10
**Covers:** W7, W9, W10

**Check:** Focused behavioral tests in `packages/ui`, strict UI type-check (`bun run --cwd packages/ui type-check`), single parent UI build (`bun run --cwd packages/ui build`), and actual Web and Electron visual verification of tool execution rows, running animations, diff viewers, and dialog output inspections; no source/copy/wiring tests.

 - [ ] Restore the original compact tool row, hover disclosure, running feedback and outcome actions. Display duration only where authoritative native records provide it; never invent tool timestamps.
 - [ ] Restore rich `ToolOutputDialog` for deep inspection of tool outputs, arguments, and execution metadata.
 - [ ] Restore diff previews (`ToolPartDiffPreview`, `DiffPreview`) with unified/split views, line number formatting, additions/deletions stats, and editor quick-open actions.
 - [ ] Restore dedicated tool renderers for shell execution (`bash`), file operations (`read`, `write`, `edit`), subagent runs, and task tools.
 - [ ] Eliminate raw `<details>` or generic `<pre>` substitutes, connecting rich display components directly to native canonical tool call and result schemas.

## Background & UI Restoration Scope

The current user explicitly prioritizes restoring the original OpenChamber UI appearance and interaction behavior, with no redesign. Investigation identified commit `bfa8edacb9b0096aabf40b12886794ce62df8ddb` as the assembled pre-M1 baseline visually inherited upstream. The current integration worktree (`e848504602333955b1d134bba3345d8bbc2ed065`) retains the authoritative native Canonical contracts.

This task restores tool call presentation and output inspection:
- **Compact Tool Row:** Restores the original collapsed and animated tool row (`ToolPart`) that clearly indicates tool name, target file or command parameter summary, execution duration, and live progress state without cluttering the chat view.
- **Rich Diff Viewer:** Reconnects structured file diff presentation with syntax highlighting, line additions/removals, and file jump buttons for workspace editing tools.
- **Deep Inspection Modal:** Restores `ToolOutputDialog` allowing users to inspect full stdout/stderr streams, raw JSON responses, and execution logs in a dedicated, high-performance modal with copy and search capabilities.
- **Native OMP Semantics:** Binds directly to canonical tool types (`ToolCallPart`, `ToolResultPart`) and truthful OMP tool execution properties without introducing OpenCode legacy fields or wrapper shims.

## Progress

Native tool-call/result pairing and the restored tool presentation are integrated; the focused diff regression passed 1/1. In both Web (`/tmp/ui-restored-web-proof.json`) and Electron (`/tmp/ui-restored-electron-proof.json`) receipts, session history recorded tool calls and results (including `edit`). Snapshot 503 was traced to journal event ordering and resolved via an ordered `messagesByTurn` index in `journal.ts` (5 tests / 31 assertions pass). Visual tool diff rows, preview toggles, and dialog output inspections remain to be verified in live UI without claiming unverified filesystem mutations. This task stays open.

**2026-10-20 Web verification:** The blank expanded result was traced to two display-projection defects, both fixed. `streamingTailEntry.withLiveParts` replaced the always-live tail message parts with the live part store, discarding the `tool_result` that `MessageList` pairs from its `role:"system"` message; `mergeLiveParts` now retains those paired results in record order without duplicates. `ChatMessage.handleShowPopup` ignored non-image/mermaid popup content, so the output dialog never opened; it now always installs the popup. Focused tests pass 15/15, UI type-check and oxlint pass, and `bun run build:web` passed. In the final Web build against retained native-edit session `dc541ce6-8b31-4dbf-aa31-63d39249634a`, the expanded result card shows `+1/-1`, its `@pierre/diffs` shadow root contains `Native edit target updated`, the output dialog opens with `[NOTES.md]` and `details.diff`, and a hard reload retains the same parts and diff. Evidence is recorded in `.workflow/omp-migration/m3/task36-connected-web-2026-10-20.json` and `/home/shizuku/.cache/ohpi-acceptance/evidence/112-*`/`113-*`. Electron visual verification is still unobserved; this task remains open.

**2026-10-21 Task57 verification (isolated worktree `57-original-tool-ui`, base `4d99b9827`):**

- Check before: the focused tool set had 3 failures at the base commit — `ToolPart.subagent-row.test.tsx` (2) and `ToolOutputDialog.websearch.test.tsx` (1). The subagent cases rendered a standalone `task` through `TurnActivity`, which intentionally skips it (MessageBody owns that row), and did not advance the one-frame deferred expansion; the websearch case asserted the pre-`Output`-disclosure rendering.
- Fixes: `ToolPopupContent` now carries the canonical `toolName` and `input`; `ToolPart` passes both when opening the output dialog; `ToolOutputDialog` renders localized `Arguments` (native formatting, complete write JSON) and `Output` sections plus the result `error`, using `JsonToolOutput`/`WorkerCode`/`Pierre` paths unchanged. Locale key `chat.toolOutputDialog.arguments` added to all 13 dictionaries.
- Check after: `bun test` on the 12 focused tool files → 58 pass, 0 fail, 222 `expect()` calls. `bun run --cwd packages/ui type-check` exit 0; `bun run --cwd packages/ui build` exit 0; `bunx oxlint` on changed files exit 0; i18n environment suite 1 pass / 864 assertions. `bun run build:web` exit 0 (chunk-size warning only).
- Web run: isolated `HOME=/tmp/ohpi-task57/home`, `OPENCHAMBER_DATA_DIR=/tmp/ohpi-task57/data`, managed workspace `data/chats/t57-work`, loopback fixture `http://127.0.0.1:4605/v1`, provider/model `t57fixture/deepseek-v4-flash` (the replace edit mode is required for `old_string`/`new_string`; the hashline default refuses that grammar). Session `379517ff-bea4-4140-84c8-f1ff502a41bc` produced a real `edit` (`NOTES.md`, `+1/-1`) with the file actually updated. Screenshots: `01`/`02` compact completed row with path, quick-open and `+1/-1`; `03b` unified and `04b` split diff (line numbers `1`, pale green/red line backgrounds, per-file open/diff actions); `05` output dialog with `Arguments` (`path`, `old_string`, `new_string`) and `Output` (native `[NOTES.md]` + `details` JSON); `06` quick-open. Evidence under `/tmp/ohpi-task57/evidence/`.
- Quick-open observation: the row `Open file` control opened an in-app context `NOTES.md` tab (`runtime.editor` is absent on Web) but the tab displayed `File not found` with no `/api/fs` read request. This is a Files/context-panel path binding defect exposed by Task57's action, not yet fixed; the diff/editor actions themselves were not otherwise exercised.
- Not verified in this run: a running-state tool row (the bash fixture turn was not run), the dedicated `bash`/`read`/`write`/`task` renderers in live UI, and packaged Electron at this HEAD. No Electron AppImage was built for `4d99b9827`, so no packaged claim is made. The earlier error-state edit row (failed host-policy grammar) was visible but is not acceptance evidence.

Task remains open on the unverified rows above.
