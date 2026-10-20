# 47: Cut message and tool helpers to native Part contracts and Host invalidation

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** 93d519221527e15cf52a5dde0d6ddf011c7527bb

**Finished:** 2026-10-21T03:10:00Z

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

2026-10-21 connected file-invalidation attempt: one isolated Web run on HEAD `d798d456e`, current Web dist `42170a97…`, temporary workspace `/tmp/ohpi-task47-workdir`, fixture port 4605, model `m3write/native-write`, agent `writeonly`. The prompt "Create TASK47_NEW.md using the native write tool." completed and the chat rendered the native `write TASK47_NEW.md` tool row with "Created TASK47_NEW.md with the native write tool." The file exists with the expected content, and Host `git status` reported `?? TASK47_NEW.md`; direct Host `/api/fs/list` returned it. The Files tree still showed only `.git`, `.omp`, and `NOTES.md`; no `/api/fs/list` request followed the completed tool transition, so `TASK47_NEW.md` never appeared in the visible tree. Receipt: `.workflow/omp-migration/m3/task47-file-invalidation-2026-10-21.json`; screenshot: `/home/shizuku/.cache/ohpi-acceptance/evidence-electron/task47-after-write.png`. Root cause/fix: a canonical gap can abandon the live tool event before `fileTreeChanges.toolTransition`; recovery snapshots intentionally do not replay historical tool side effects. `SessionMessageLoader` now passes the previous snapshot only through the pipeline recovery path; `SyncProvider.onSnapshot` compares epoch/`headSequence` after commit and calls `fileTreeChanges.unknownChange` once for the addressed directory only when runtime state advanced. Initial hydration, unchanged snapshots, and non-recovery refreshes do not invalidate, and no `activeRun` state is consulted. Regression: SyncProvider + real loader snapshot installation, initial/unchanged no-change, real `handleEvents` gap, then one invalidation after changed recovery while idle (22/22 focused tests, 69 assertions). After rebuilding Web dist `3d08bb5b…`, the same connected fixture created `TASK47_NEW.md` via native write, rendered the canonical `write` tool row, and visibly refreshed the Files tree to show the file. The harness did not expose the `/api/fs/list` network entry; direct Host listing returned the new file. Task47 acceptance now passes for this slice; Task36/18 retain connected W7–W10/E2E claims.

2026-10-21 final connected attempt after rebuild: Web dist `c438247e…`; session `ce14b0c0-…`; `TASK47_NEW.md` was created and chat showed `write TASK47_NEW.md`. The Files tree initially omitted the file, then a later poll showed `TASK47_NEW.md` at the tree (element x=1354). No `/api/fs/list` request was exposed by the harness, so the observation cannot distinguish the fix hook from the tree's periodic refresh; direct Host `/api/fs/list` returned the file. The in-flight recovery race found in review is now covered by `session-message-loader.test.ts`: a recovery refresh queued behind an initial load yields one post-load recovery and onSnapshot sees prior head 4 → 5. Loader + SyncProvider boundary tests pass 47/47 (179 assertions); UI type-check/build and Web build pass. Receipt: `.workflow/omp-migration/m3/task47-file-invalidation-2026-10-21.json`.
