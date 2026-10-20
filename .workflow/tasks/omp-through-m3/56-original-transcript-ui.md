# 56: Restore original transcript and message list UI

**Effort:** omp-through-m3
**Task type:** bugfix
**Base commit:** e848504602333955b1d134bba3345d8bbc2ed065

**Delivers:** Restores the original OpenChamber message transcript UI from pre-M1 baseline (`bfa8edacb9b0096aabf40b12886794ce62df8ddb`) onto current native Canonical contracts (`e848504602333955b1d134bba3345d8bbc2ed065`). Restores original bubble styling, header, footer actions, turn composition, collapse/navigation, and rich `MessageBody` without redesign or fallback to generic placeholders, keeping native canonical `Message` and `Part` models without OpenCode shims.

**Blocked by:** None
**Files:** `packages/ui/src/components/chat/ChatMessage.tsx`, `packages/ui/src/components/chat/MessageList.tsx`, `packages/ui/src/components/chat/message/MessageBody.tsx`, `packages/ui/src/components/chat/message/`, `packages/ui/src/components/chat/components/`, `packages/ui/src/components/chat/lib/`, related tests
**Read first:** Visual reference at `bfa8edacb9b0096aabf40b12886794ce62df8ddb` (`packages/ui/src/components/chat/`); canonical contracts in `packages/agent-contract/src/messages.ts`; `.workflow/specs/omp-through-m3.md` W7, W9, W10
**Covers:** W7, W9, W10

**Check:** Focused behavioral tests in `packages/ui`, strict UI type-check (`bun run --cwd packages/ui type-check`), single parent UI build (`bun run --cwd packages/ui build`), and actual Web and Electron visual verification of transcript rendering, turn streaming, scrolling, and message actions; no source/copy/wiring tests.

 - [ ] Restore original `ChatMessage` layout, bubble themes, headers, and footer actions from pre-M1 baseline (`bfa8edacb9b0096aabf40b12886794ce62df8ddb`).
 - [ ] Restore `MessageList` turn composition, auto-scroll behavior, virtualized windowing, and prompt navigation rails (`PromptNavigatorRail`, `TurnMessageWindow`).
 - [ ] Reconnect rich `MessageBody` markdown formatting and part dispatcher without generic text fallback.
 - [ ] Restore turn activity feedback, live status indicators, and collapse controls (`LiveTurnActivity`, `LiveActivityCollapse`).
 - [ ] Retain native canonical `Message` and `Part` models without reintroducing OpenCode aliases, adapters, or shims.

## Background & UI Restoration Scope

The current user explicitly prioritizes restoring the original OpenChamber UI appearance and interaction behavior, with no redesign. Investigation identified commit `bfa8edacb9b0096aabf40b12886794ce62df8ddb` as the assembled pre-M1 baseline visually inherited upstream. The current integration worktree (`e848504602333955b1d134bba3345d8bbc2ed065`) retains the authoritative native Canonical contracts.

This task restores the core conversation transcript:
- **`ChatMessage` & `MessageList` Structure:** Restores turn grouping, user and assistant message rows, role badges, model tags, timestamps, and quick action bars (copy text, retry turn, branch turn) using authoritative existing message events and records.
- **`MessageBody` & Rich Parts:** Reconnects structured part rendering across assistant turns, ensuring streaming deltas append smoothly to active parts without flickering or DOM recreation.
- **Turn Activity & Collapse:** Restores turn progression states (`TurnActivity`, `LiveActivityCollapse`), allowing long tool-call sequences and thinking blocks to collapse cleanly while preserving user visibility into ongoing progress.
- **Contract Decoupling:** Binds UI components strictly to canonical message state via directory sync and native message loaders, without legacy OpenCode session adapters.

## Progress

The original transcript composition and native canonical bindings are integrated. The actual Web receipt `/tmp/ui-restored-web-proof.json` confirms a real submitted session rendered a user bubble plus assistant heading, table, three-item list, blockquote, fenced code block, and inline link; history contained text and reasoning parts. The packaged Electron proof `/tmp/ui-restored-electron-proof.json` confirmed rich composer DOM inspection and screenshot verification. Web/Electron turn-streaming, full reload persistence, and complete action coverage remain unverified, so this task stays open.
