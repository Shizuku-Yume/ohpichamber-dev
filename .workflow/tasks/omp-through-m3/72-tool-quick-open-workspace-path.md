# 72: Normalize sanitized workspace paths for tool quick-open

**Effort:** omp-through-m3
**Task type:** bugfix
**Base commit:** <commit-sha>

**Delivers:** Native tool diff/output rows that expose a privacy-sanitized `[workspace]/relative/path` quick-open the real `<currentDirectory>/relative/path` instead of concatenating `[workspace]` literally. The rendered row label no longer shows the sanitized prefix, and the Web filesystem read targets the real file. This is the narrow quick-open follow-up scoped from Task57; Task57's hover, subagent/task-row, and packaged-Electron limitations remain open and are not resolved by this task.

**Blocked by:** None
**Files:** `packages/ui/src/components/chat/message/parts/toolDiffUtils.ts`, `packages/ui/src/components/chat/message/parts/ToolPart.tsx` (only if the fix cannot stay in the target resolver), `packages/ui/src/components/chat/message/parts/toolDiffUtils.test.ts`, `packages/ui/src/components/chat/message/parts/ToolPart.rich.test.tsx`.

**Read first:** `.workflow/specs/omp-through-m3.md` W7, W9; Task57's paused handoff and quick-open observation in `.workflow/tasks/omp-through-m3/57-original-tool-ui.md`; `packages/agent-service/src/worker/session.ts:176` sanitizes `input.cwd` to `[workspace]`; `packages/ui/src/components/chat/message/parts/toolDiffUtils.ts` `getToolFileChanges` and `resolveToolQuickOpenTarget`; `packages/ui/src/components/chat/message/parts/ToolPart.tsx` quick-open target construction around `resolveToolQuickOpenTarget`/`toAbsoluteFilePath`; `packages/ui/src/lib/path-utils.ts` `toAbsoluteFilePath`; existing quick-open tests in `toolDiffUtils.test.ts` and `ToolPart.rich.test.tsx`.

**Covers:** W7, W9

**Change:**

- Normalize the privacy-sanitized workspace sentinel only on UI tool-file targets that use it (`details.path`, `perFileResults[].path`, and the equivalent write result/input path), so `[workspace]/NOTES.md` becomes the relative `NOTES.md` before it is resolved against `currentDirectory`.
- Never concatenate `[workspace]` into a filesystem path. Resolve the stripped relative path with the existing `toAbsoluteFilePath` behavior, producing `/project/NOTES.md` for directory `/project`.
- Preserve already-valid relative paths (`NOTES.md`, `src/a.ts`) and absolute paths unchanged. Do not normalize device/coordination URLs or unrelated placeholders.
- Keep the Host filesystem owner unchanged; no Host/global fallback, no new API route, and no security-boundary widening. Existing containment/foreign-path behavior must still hold, including traversal attempts such as `[workspace]/../outside`.
- Do not change transcript/tool rendering outside quick-open target/row-label resolution.

**Check:** At the Base commit, a native edit result with `details.path` `[workspace]/NOTES.md`, a real directory `/project`, and unchanged fixture bytes reproduces the quick-open failure: the filesystem read target is `/project/[workspace]/NOTES.md` and returns 404. After the fix, the rendered row label is `NOTES.md`, quick-open targets `/project/NOTES.md`, and the real file preview loads. Existing valid quick-open paths and the mismatch/error cases remain unchanged. Focused failing-then-passing tests: `cd packages/ui && bun test src/components/chat/message/parts/toolDiffUtils.test.ts` and `bun test src/components/chat/message/parts/ToolPart.rich.test.tsx`; then `bun run --cwd packages/ui type-check` and `bun run --cwd packages/ui build`. No source/copy/wiring test substitutes for the behavior.

- [ ] A tool result whose `details.path` is `[workspace]/NOTES.md` renders the row label `NOTES.md`, not `[workspace]/NOTES.md`.
- [ ] Quick-open resolves to `/project/NOTES.md` for `currentDirectory` `/project`, and the Web filesystem read no longer requests `/project/[workspace]/NOTES.md`.
- [ ] Existing relative and absolute quick-open paths, valid previews, mismatched-call protection, and error results are unchanged.
- [ ] Traversal/foreign-path guards remain intact; no Host/global fallback or security-boundary widening is introduced.
- [ ] Task57's remaining hover, subagent/task-row, and packaged-Electron limitations are recorded as still open, not claimed by this task.

## Progress

Drafted 2026-10-21 from Task57's paused handoff. Not started; no source change or test run yet.
