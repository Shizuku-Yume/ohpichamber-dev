# 48: Restore managed-root filesystem admission independent of project selection

**Effort:** omp-through-m3
**Task type:** bugfix
**Base commit:** 0a56f63a18d3b2bbab34ba44612afaef4e223740
**Started:** 2026-10-18
**Status:** active

**Delivers:** Restores authenticated managed-root directory admission in Host filesystem routes when no active project exists. Enables primary chat session creation on a fresh isolated home without preconfigured projects, while preserving path containment, symlink traversal safety, and refusal of unmanaged paths.

**Blocked by:** None
**Files:** `packages/web/server/lib/fs/routes.js`, `packages/web/server/lib/fs/routes.test.js`, `.workflow/development.md`, `.workflow/specs/omp-through-m3.md`
**Read first:** `.workflow/specs/omp-through-m3.md` W2, W7, W10; `packages/web/server/lib/fs/routes.js`; `packages/web/server/lib/fs/routes.test.js`
**Covers:** W2, W7, W10

**Change:**

- Fix `resolveWorkspacePathFromContext` in `packages/web/server/lib/fs/routes.js`: evaluate independent `managedRoots` admission even when `resolveProjectDirectory` returns no active project or directory.
- Allow authenticated requests targeting managed chat roots (such as default workspace directories under an isolated home) to succeed on `POST /api/fs/mkdir` and related filesystem operations without requiring a configured project.
- Preserve strict boundary checks: path containment within the resolved root, symlink escape prevention, and rejection of out-of-root/unmanaged paths with `403 Forbidden` / `400 Bad Request`.
- Add regression tests verifying directory creation under a managed chat root with zero configured projects, and confirming refusal of unmanaged/arbitrary filesystem targets.
- Main owns the implementation fix; writer documents task and planning boundaries without source edits.

**Check:** `bun run --cwd packages/web test server/lib/fs/routes.test.js`; verification that `POST /api/fs/mkdir` succeeds with zero configured projects; actual browser driver session creation and primary send pass after web rebuild.

**Acceptance:**

- [ ] `resolveWorkspacePathFromContext` admits authenticated managed-root paths when no project is active.
- [ ] Regression tests cover directory creation with zero configured projects.
- [ ] Out-of-root, traversal, and unauthorized path refusals remain strictly enforced.
- [ ] Focused filesystem route tests pass under Vitest.
- [ ] Browser-driven session creation and prompt send succeed against the rebuilt Web application.

## Progress

Check before: the real isolated Web driver clicked Send once and observed POST `/api/fs/mkdir` 400 with `Directory parameter or active project is required`; no session was created. Receipt: `/home/shizuku/Project/ohpichamber-omp-artifacts/m3-web-prefix-20261018/receipt.json`. Do not repeat this failing scenario before fixing its owner. Existing assembled edits remain in the integration worktree; this task changes only the FS resolver, focused regression coverage, and owning documentation.
