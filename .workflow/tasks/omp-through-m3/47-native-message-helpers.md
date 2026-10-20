# 47: Cut message and tool helpers to native Part contracts and Host invalidation

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** <commit-sha>

**Delivers:** Complete cutover of residual message preview, freshness, session events, file-tree changes, background shell, context parts, and tool descriptions to canonical `Part` / `Message` contracts and Host Git/file-tree invalidation. Migrates callers off `@/lib/opencode/model` legacy part and tool imports without shims, aliases, or compatibility fields.

**Blocked by:** None
**Files:** `packages/ui/src/components/layout/rawMessagePreview.ts`, `packages/ui/src/components/chat/lib/messagePreview.ts`, `packages/ui/src/lib/messageFreshness.ts`, `packages/ui/src/lib/sessionEvents.ts`, `packages/ui/src/lib/fileTreeChanges.ts`, `packages/ui/src/components/chat/message/parts/ToolPart.tsx`, `packages/ui/src/components/chat/message/parts/ProgressiveGroup.tsx`, `packages/ui/src/components/chat/message/parts/backgroundShellPart.ts`, `packages/ui/src/lib/messages/contextParts.ts`, owning regression test fixtures, `.workflow/development.md`, `.workflow/specs/omp-through-m3.md`
**Read first:** `.workflow/specs/omp-through-m3.md` W7, W9, W10; `packages/agent-contract/src/session.ts`; `packages/ui/src/lib/toolHelpers.ts`; current implementations of the named message and tool helpers
**Covers:** W7, W9, W10

**Change:**

- Consume canonical `Part.content`, `tool_call`, and `tool_result` fields and statuses across `rawMessagePreview`, `messagePreview`, `messageFreshness`, `sessionEvents`, `fileTreeChanges`, `backgroundShellPart`, and `contextParts`.
- Update `ToolPart` and `ProgressiveGroup` tool descriptions to consume native tool names and results rather than legacy OpenCode tool assumptions.
- Preserve user-visible preview, diff, and tool descriptions using existing native renderer context without legacy text fallbacks.
- Maintain Host Git and file-tree invalidation batching and runtime-reset behaviors.
- Exclude `ModelControls`, `agentColors`, `useAgentColors`, and `useConfigStore` (owned by Task 46) and provider callers (owned by Task 49).
- Do not introduce fake legacy `Part` shims, field aliases, or compatibility wrappers. Native resources reside in the Bun SDK worker, accessed through Canonical Client and Host Gateway.

**Check:** Focused message preview, freshness, session event, and file-tree tests (`bun test packages/ui/src/lib/sessionEvents.test.ts`, `packages/ui/src/lib/fileTreeChanges.test.ts`); UI test-project type-check (`bunx tsc --noEmit --pretty false -p packages/ui/tsconfig.test.json`); UI build (`bun run --cwd packages/ui build`); verification of actual chat tool rendering and file invalidation during integration.

**Acceptance:**

- [x] Residual message helpers consume canonical `Part` and `Message` contracts directly without compatibility shims.
- [x] Tool descriptions in `ToolPart` and `ProgressiveGroup` reflect native tool names and outcomes.
- [x] File-tree invalidation and Host Git change detection operate cleanly on native tool results without legacy part adapters.
- [x] Batching and runtime-reset behaviors are preserved.
- [x] Focused tests pass, UI build passes, and UI test-project type-check exits 0.
## Progress

The existing integration changes already cut the named message/session/file-tree/tool helpers to `@openchamber/agent-contract` Part fields and `toolHelpers`. A native Guest table regression exposed that the renderer passed canonical result text to a parser that only accepted pre-parsed JSON; the parser now owns JSON text parsing at its boundary. A diff-rendering regression assertion now checks all rendered `<pre>` blocks because the result output and native diff are separate bodies. `sessionEvents.test.ts` and `fileTreeChanges.test.ts` pass (15 tests / 36 assertions); `toolHelpers.test.ts` passes (4 tests / 35 assertions); Guest/tool rendering tests pass (11 tests / 58 assertions); the native diff test passes (1 test / 8 assertions). Touched-source oxlint passes, UI test-project type-check exits 0, and the UI build exits 0. The focused render tests exercise actual `ToolPart` output and Guest table rendering under Happy DOM; the integrated browser run separately confirmed canonical startup and profile selection. Connected W7–W10 acceptance and Host retirement remain open.
