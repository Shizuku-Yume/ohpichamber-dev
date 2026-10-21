# 56: Restore original transcript and message list UI

**Effort:** omp-through-m3
**Task type:** bugfix
**Base commit:** e848504602333955b1d134bba3345d8bbc2ed065

**Delivers:** Restores the original OpenChamber message transcript UI from pre-M1 baseline (`bfa8edacb9b0096aabf40b12886794ce62df8ddb`) onto current native Canonical contracts (`e848504602333955b1d134bba3345d8bbc2ed065`). Restores original bubble styling, header, footer actions, turn composition, collapse/navigation, and rich `MessageBody` without redesign or fallback to generic placeholders, keeping native canonical `Message` and `Part` models without OpenCode shims.

**Blocked by:** 65, 67
**Files:** `packages/ui/src/components/chat/ChatMessage.tsx`, `packages/ui/src/components/chat/MessageList.tsx`, `packages/ui/src/components/chat/message/MessageBody.tsx`, `packages/ui/src/components/chat/message/`, `packages/ui/src/components/chat/components/`, `packages/ui/src/components/chat/lib/`, related tests
**Read first:** Visual reference at `bfa8edacb9b0096aabf40b12886794ce62df8ddb` (`packages/ui/src/components/chat/`); canonical contracts in `packages/agent-contract/src/messages.ts`; `.workflow/specs/omp-through-m3.md` W7, W9, W10
**Covers:** W7, W9, W10

**Check:** Focused behavioral tests in `packages/ui`, strict UI type-check (`bun run --cwd packages/ui type-check`), single parent UI build (`bun run --cwd packages/ui build`), and actual Web and Electron visual verification of transcript rendering, turn streaming, scrolling, and message actions; no source/copy/wiring tests.

**Acceptance revision (user-directed, 2026-10-21):** The Web branch of this Check is satisfied by the evidence below. The Electron visual branch is explicitly limited for this round because no packaged artifact exists from this HEAD; no stale Electron evidence is reused. The ticked bullets record restored code plus focused/Web evidence, not packaged Electron acceptance. End-to-end branch creation remains blocked by the Host `APPROVAL_POLICY_WRITE_FAILED` response and is recorded as a limitation, not a pass.

 - [x] Restore original `ChatMessage` layout, bubble themes, headers, and footer actions from pre-M1 baseline (`bfa8edacb9b0096aabf40b12886794ce62df8ddb`).
 - [x] Restore `MessageList` turn composition, auto-scroll behavior, virtualized windowing, and prompt navigation rails (`PromptNavigatorRail`, `TurnMessageWindow`).
 - [x] Reconnect rich `MessageBody` markdown formatting and part dispatcher without generic text fallback.
 - [x] Restore turn activity feedback, live status indicators, and collapse controls (`LiveTurnActivity`, `LiveActivityCollapse`).
 - [x] Retain native canonical `Message` and `Part` models without reintroducing OpenCode aliases, adapters, or shims.

## Background & UI Restoration Scope

The current user explicitly prioritizes restoring the original OpenChamber UI appearance and interaction behavior, with no redesign. Investigation identified commit `bfa8edacb9b0096aabf40b12886794ce62df8ddb` as the assembled pre-M1 baseline visually inherited upstream. The current integration worktree (`e848504602333955b1d134bba3345d8bbc2ed065`) retains the authoritative native Canonical contracts.

This task restores the core conversation transcript:
- **`ChatMessage` & `MessageList` Structure:** Restores turn grouping, user and assistant message rows, role badges, model tags, timestamps, and quick action bars (copy text, retry turn, branch turn) using authoritative existing message events and records.
- **`MessageBody` & Rich Parts:** Reconnects structured part rendering across assistant turns, ensuring streaming deltas append smoothly to active parts without flickering or DOM recreation.
- **Turn Activity & Collapse:** Restores turn progression states (`TurnActivity`, `LiveActivityCollapse`), allowing long tool-call sequences and thinking blocks to collapse cleanly while preserving user visibility into ongoing progress.
- **Contract Decoupling:** Binds UI components strictly to canonical message state via directory sync and native message loaders, without legacy OpenCode session adapters.

## Progress

### Verification (2026-10-21)

The accepted restoration is committed in `6f1fe19fe` and was not redone. This round checked the four remaining acceptance areas (Web/Electron streaming, reload persistence, scroll/navigation, actions) and fixed only the defects those checks exposed.

**Focused tests (after fixes).** Run one file per process from `packages/ui` with `bun test <file>`; the repository runner isolates files because the suites share module singletons. All exit 0: `__tests__/transcriptRestore.test.tsx` 4, `lib/turns/streamingTailEntry.test.ts` 9, `lib/messageDisplayNormalization.test.ts` 6, `lib/turns/projectTurnRecords.test.ts` 15, `components/TurnMessageWindow.test.tsx` 17, `components/LiveTurnActivity.test.tsx` 10, `components/LiveActivityCollapse.test.tsx` 3, `message/parts/ReasoningPart.test.tsx` 15, `message/parts/ToolPart.test.ts` 20, `message/parts/ToolPart.rich.test.tsx` 5, `lib/scroll/followScroll.test.ts` 12, `lib/scroll/timelineScrollAnchoring.test.ts` 10. Total 126 pass / 0 fail.

**Defects fixed.**
- `lib/turns/projectTurnRecords.ts` put an assistant reply with no canonical user turn into `ungroupedMessageIds`, so a session opened mid-history rendered it as a standalone row. The documented/projected rule is that such a reply is not a turn and not an ungrouped row; non-assistant ungrouped messages are unchanged.
- `projectTurnRecords.test.ts` fixtures gave assistant messages a different `turnId` from their user prompt, which the canonical projection correctly rejects; the fixtures now share the canonical turn id, and the hydration case no longer claims a completed tool call is streaming.
- `transcriptRestore.test.tsx` asserted a tool body that mounts one animation frame after a later user click; the test now flushes those frames.
- `ReasoningPart.test.tsx` / `parts/DOCUMENTATION.md` still asserted OpenCode-era `part.time.end`; canonical reasoning parts carry no timing, so only the message-level live phase can stream them. The test now asserts that canonical rule.

**Type-check and build.** From the worktree root: `bun run --cwd packages/ui type-check` exit 0 (`tsc -b`, 35.4 s); `bun run --cwd packages/ui build` exit 0 (`tsc -b`, 7.3 s); `bun run --cwd packages/web build` exit 0 (Vite production, 60.9 s) for the live App bundle. The web build is additional to the task Check because the checked-in `packages/web/dist` is gitignored and the live UI must serve current source.

**Web visual proof (isolated Host).** Loopback only: fixture providers `127.0.0.1:4601` (`scripts/perf/fixture-provider.mjs`) and `127.0.0.1:4602` (temporary reasoning/glob fixture), isolated `HOME=/tmp/ohpi-task56/home`, `OPENCHAMBER_DATA_DIR=/tmp/ohpi-task56/data`, UI password, Host `127.0.0.1:3176`, current `packages/web/dist`, Chrome via `chrome-devtools`.
- Session `a9a5d9c1-539f-4fb1-8328-d11e5f1530d0`, workspace `/tmp/ohpi-task56/workdir`. A `m3fixture/stream-300cps` run streamed the 5,742-character fixture document; persisted history has one text part of exactly 5,742 characters, and the UI sampled a monotonic assistant row (1,061 -> 4,415 characters over 40 samples). Reload restored the same message IDs, 5,742-character body, three headings, three tables and nine code blocks; the footer model label briefly used the id until the provider catalog loaded, then matched the live label.
- A `m3reason/reason-300cps` run persisted reasoning (43/48 chars), a `glob` `tool_call`, a `system` `tool_result`, and final text (118 chars). With the user setting `Show reasoning traces` enabled, both assistant rows rendered `[data-reasoning-block-id]` reasoning blocks through `MessageBody` and the `glob` row through the tool renderer; no `<details>` JSON fallback appeared.
- Auto-follow kept moving with growth (scrollTop 2,834 -> 5,220; 0 gap at completion). A real wheel gesture showed the scroll pill; clicking it moved scrollTop 0 -> 2,534 and `atEnd` true. The prompt rail listed both prompts; selecting the first tick moved scrollTop 2,534 -> 48, set `aria-current` on the first prompt, and wrote `#turn-<id>`.
- Actions: `Copy message text` clicked and the button changed to the success check (clipboard read itself is permission-denied in headless Chrome). `Revert to this message` put the original prompt back in the composer and staged the later messages out of the visible transcript.

**Limitations.**
- Branch action: `Fork from this message` invoked the canonical fork but the isolated Host returned HTTP 503 `APPROVAL_POLICY_WRITE_FAILED` (`Host approval policy persistence is unavailable`), reproduced directly on both `/api/agent/v1/sessions/:id/fork` and `/api/openchamber/sessions/:id/fork`. This is Host/session persistence outside Task56's chat/transcript files, so no transcript-side change or false pass was made. End-to-end branch creation remains unverified here.
- Electron: no packaged artifact exists from this HEAD (`fe1ae4d33`) in the worktree; no AppImage was rebuilt and no prior screenshot is reused as current evidence. Packaged Electron streaming/reload/action verification remains unverified.
- Security pass: not applicable. The change set is transcript projection/test/doc only; it touches no trust boundary, route, credential, or runtime transport.


The original transcript composition and native canonical bindings are integrated. The actual Web receipt `/tmp/ui-restored-web-proof.json` confirms a real submitted session rendered a user bubble plus assistant heading, table, three-item list, blockquote, fenced code block, and inline link; history contained text and reasoning parts. An earlier packaged Electron proof `/tmp/ui-restored-electron-proof.json` covered composer DOM inspection and screenshot verification, but it predates this HEAD and is not current evidence. Web turn-streaming, reload persistence and action coverage are recorded below; packaged Electron remains an explicit limitation.

**Own quality and security pass:** pass, no findings. The projection exclusion only removes assistant messages from the standalone ungrouped set; turn grouping, streaming-tail rendering, non-assistant ungrouped rows, tool/result pairing and reasoning rendering are unchanged. The test corrections assert canonical `turnId` identity and live-phase reasoning rather than weakening either guard. No trust boundary, credential, route, runtime transport or persisted format is touched, so the CONVENTIONS security pass is not applicable.

**Review briefs:** Brief A (requirements/correctness) and Brief B (quality/regression) were started at the exact task base `e848504602333955b1d134bba3345d8bbc2ed065`. Brief B returned **correct**, confidence 0.94, with no actionable patch-introduced findings: the orphan filter preserves non-assistant ungrouped rows, the fixtures match canonical shared `turnId`, the reasoning test asserts canonical live-phase behavior, and the timer flush only observes the existing deferred tool-body mount. Brief A returned **incorrect** with two record-level findings: ticked acceptance while Electron/branch evidence was missing, and the historical packaged-Electron sentence reading as current proof. Both are addressed: the acceptance revision above explicitly records the Electron branch as limited per the user's direction, the historical proof is labeled as predating this HEAD, and branch creation remains an explicit Host-side blocker. No source/test finding was raised. The own quality pass above covers the same five-file boundary.

**Web screenshot:** `/tmp/ohpi-task56/task56-transcript-web.png` (current isolated Web transcript after the live/reload/action checks).

**Finished:** 2026-10-21T01:02:00Z
