# 72: Normalize sanitized workspace paths for tool quick-open

**Effort:** omp-through-m3
**Task type:** bugfix
**Base commit:** e40d14983e942687ca1053e7ea7b58c6a0120f37
**Started:** 2026-10-21T00:00:00Z
**Finished:** 2026-10-21T04:06:48Z

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

- [x] A tool result whose `details.path` is `[workspace]/NOTES.md` renders the row label `NOTES.md`, not `[workspace]/NOTES.md`.
- [x] Quick-open resolves to `/project/NOTES.md` for `currentDirectory` `/project`, and the Web filesystem read no longer requests `/project/[workspace]/NOTES.md`.
- [x] Existing relative and absolute quick-open paths, valid previews, mismatched-call protection, and error results are unchanged.
- [x] Traversal/foreign-path guards remain intact; no Host/global fallback or security-boundary widening is introduced.
- [x] Task57's remaining hover, subagent/task-row, and packaged-Electron limitations are recorded as still open, not claimed by this task.

## Progress

Drafted 2026-10-21 from Task57's paused handoff. Not started; no source change or test run yet.

**2026-10-21 implementation (isolated worktree `/home/shizuku/Project/ohpichamber-worktrees/72-tool-quick-open`, branch `omp-through-m3/72-tool-quick-open`, base `e40d14983`):**

- Dirty at start: none. Base resolves to `e40d14983e942687ca1053e7ea7b58c6a0120f37` on `omp-through-m3/verified-integration-20261021`.
- Root cause (CONVENTIONS §8): `packages/agent-service/src/worker/projection.ts` replaces the private session workspace root with `[workspace]` in canonical tool inputs and result details. `toolDiffUtils` adopted `details.path`, `perFileResults[].path`, write `resolvedPath` and call input paths verbatim, and `ToolPart` resolved them with `toAbsoluteFilePath`, so the placeholder became a literal directory segment (`<directory>/[workspace]/NOTES.md`). The row label used the same unresolved value.
- Fix: `toolDiffUtils` now strips the sentinel to its workspace-relative path for edit/write/read file targets and the row description (`normalizeWorkspaceToolPath`); diff bytes and their headers are untouched. A sentinel target that climbs out of the workspace root (`[workspace]/../outside`), starts another root (`//`, whitespace, `C:`), or carries a backslash separator names no workspace file and is refused (no file change, no quick-open) instead of resolving to an unrelated in-workspace or outside path. Non-sentinel relative/absolute paths, the write device-URL filter, and the Host filesystem owner are unchanged; no Host/API route change.
- Check before (`cd packages/ui`):
  - `bun test src/components/chat/message/parts/toolDiffUtils.test.ts` → **13 pass, 2 fail**: `getToolFileChanges(...).path` was `[workspace]/NOTES.md` instead of `NOTES.md`; the traversal case returned `[workspace]/../outside.ts`.
  - `bun test src/components/chat/message/parts/ToolPart.rich.test.tsx` → **5 pass, 3 fail**: the Web context action received `path: "/project/[workspace]/NOTES.md"`; the row title `[title="NOTES.md"]` was absent; traversal opened `/project/outside.md`.
- Check after:
  - `bun test toolDiffUtils.test.ts` → **15 pass, 0 fail, 50 expect()**.
  - `bun test ToolPart.rich.test.tsx` → **8 pass, 0 fail, 31 expect()**.
  - Related packet (`ToolPart.test.ts`, `ToolPart.diff-stats`, `ToolPart.execute`, `ToolPart.subagent-row`, `ToolOutputDialog.test.ts`, `LiveTurnActivity.test.tsx`, `liveActivitySummary.test.ts`) → **51 pass, 0 fail, 197 expect()**.
  - `bun run --cwd packages/ui type-check` exit 0; `bun run --cwd packages/ui build` (tsc -b) exit 0; `bunx oxlint` on the four changed files exit 0.
  - `bun run dead-code` reports only the pre-existing backlog and no `toolDiffUtils`/`normalizeWorkspaceToolPath` finding (the script itself exits 1 on the baseline backlog).
- Actual Web run: isolated `HOME=/tmp/ohpi-task72/home`, `OPENCHAMBER_DATA_DIR=/tmp/ohpi-task72/data`, managed workspace `data/chats/t72-work`, loopback fixture `http://127.0.0.1:4613/v1`, provider/model `t72fixture/deepseek-v4-flash`; built Web dist from this worktree served on `127.0.0.1:3213`. Native replace edit of the absolute `/tmp/ohpi-task72/data/chats/t72-work/NOTES.md` produced canonical `details.path` `[workspace]/NOTES.md` and actually updated the file (`Task 72 edited line.`). The row rendered title/path `NOTES.md` with `+1 / -1`. Clicking `Open file` issued `GET /api/fs/read?path=%2Ftmp%2Fohpi-task72%2Fdata%2Fchats%2Ft72-work%2FNOTES.md&directory=%2Ftmp%2Fohpi-task72%2Fdata%2Fchats%2Ft72-work` → **200**, body `Task 72 edited line.`, and the context tab showed the file content. No request contained `[workspace]`; no Host file changed. Evidence: `/tmp/ohpi-task72/evidence/01-edit-row-notes.png`, `02-open-file-real-path.png`, plus `/tmp/ohpi-task72/setup.json`, `last-run.json`, `fixture.mjs`.
- W7/W9: the quick-open/row-label defect from Task57 is fixed and observed in real Web. Task57's remaining hover disclosure, successful subagent/task execution row, and packaged-Electron limitations remain open and are not claimed here.


**2026-10-21 security correction and final evidence (same worktree, base unchanged):**

- Security review (CONVENTIONS §7) returned **1 blocking** finding: the first guard validated the raw `/`-split string, so `[workspace]//etc/passwd`, `[workspace]/ /etc/passwd`, `[workspace]/..\etc\passwd`, a drive-letter remainder, or an interior `..` that `toAbsoluteFilePath` later re-normalized could still become a foreign absolute path and be read with `allowOutsideWorkspace`. Fixed by refusing a sentinel remainder that is untrimmed, starts with `/`, contains `\`, starts with a drive letter, or climbs above the root; a nonblocking dead-helper finding was removed. No Host route changed.
- Regression checks: `toolDiffUtils.test.ts` covers the `//`, whitespace, backslash, drive-letter and interior-traversal spellings (all refused, non-sentinel `../outside.ts` unchanged); `ToolPart.rich.test.tsx` asserts such rows offer no `Open file` or `Open file at first change` action. Host containment rechecked directly: inside-workspace `GET /api/fs/read` → 200, `/etc/passwd` with the same workspace directory → **400 `Path is outside of active workspace`**.
- Final focused evidence: `toolDiffUtils.test.ts` **16 pass / 0 fail / 68 expect()**; `ToolPart.rich.test.tsx` **9 pass / 0 fail / 33 expect()**; `bun run --cwd packages/ui type-check` exit 0; `bun run --cwd packages/ui build` exit 0; `bunx oxlint` on the four changed files exit 0.
- Final Web run on the rebuilt dist: reran the same isolated fixture/session, produced a fresh native `[workspace]/NOTES.md` edit, and clicked `Open file`; `GET /api/fs/read` targeted the real `.../t72-work/NOTES.md` → **200** with its current contents (`Task 72 edited line.\nFinal Web click-through line.`). Evidence: `/tmp/ohpi-task72/evidence/03-final-open-file-200.png` (plus `01`/`02` from the first run). Services stopped after the run.
- Reviews: security verdict recorded above (blocking finding fixed and regression-tested). **Brief B — pass**, clean, no blocking or nonblocking findings; it traced every caller and the post-fix sentinel guard (boundary: working tree vs `e40d14983`, four tool files plus two workflow records). **Brief A — not-run**: still running when this session stopped waiting; external verdict pending. Own review (Brief A substitute): the diff is limited to the task's four files plus the task/development records; all acceptance items are covered by the focused tests and the real Web run; Task57's remaining limitations stay open; documents updated; no scaffolding left; `Dirty at start: none`.
