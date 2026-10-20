# 57: Restore original tool call and output preview UI

**Effort:** omp-through-m3
**Task type:** bugfix
**Base commit:** e848504602333955b1d134bba3345d8bbc2ed065

**Delivers:** Restores the original compact animated tool execution row, status feedback, and rich `ToolOutputDialog` with diff previews, syntax-highlighted code, quick-open actions, subagent inspection, and shell output formatting from pre-M1 baseline (`bfa8edacb9b0096aabf40b12886794ce62df8ddb`). Replaces raw `<pre>` or generic `<details>` substitutes with the original tool UI connected to native canonical tool calls and outcomes, with truthful OMP semantics.

**Blocked by:** None
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
