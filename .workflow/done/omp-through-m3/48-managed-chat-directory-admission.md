# 48: Restore managed-root filesystem admission independent of project selection

**Effort:** omp-through-m3
**Task type:** bugfix
**Base commit:** 0a56f63a18d3b2bbab34ba44612afaef4e223740
**Started:** 2026-10-18
**Finished:** 2026-10-18

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

**Check:** `bun run --cwd packages/web test server/lib/fs/routes.test.js`; verification that `POST /api/fs/mkdir` succeeds with zero configured projects; actual browser driver session creation and primary send pass with existing Web dist and restarted repaired Node Host (no UI source changes).

**Acceptance:**

- [x] `resolveWorkspacePathFromContext` admits authenticated managed-root paths when no project is active.
- [x] Regression tests cover directory creation with zero configured projects.
- [x] Out-of-root, traversal, and unauthorized path refusals remain strictly enforced.
- [x] Focused filesystem route tests pass under Vitest.
- [x] Browser-driven session creation and prompt send succeed with existing Web dist and restarted repaired Node Host (no UI source changes).

## Progress

Check before: on a fresh isolated home with zero configured projects, the real isolated Web driver clicked Send once and observed POST `/api/fs/mkdir` 400 with `'Directory parameter or active project is required'`; no session was created (receipt: `/home/shizuku/Project/ohpichamber-omp-artifacts/m3-web-prefix-20261018/receipt.json`). Cause: `packages/web/server/lib/fs/routes.js` `resolveWorkspacePathFromContext` returned early before checking independent `managedRoots` admission when `resolveProjectDirectory` returned no active directory.

Repair:
- `resolveWorkspacePathFromContext` in `packages/web/server/lib/fs/routes.js` authorizes each configured project directory and managed root independently with no home fallback, admitting fresh managed chats when no project is active.
- `POST /api/fs/mkdir` canonicalizes the target once using `canonicalDirectoryPath` and verifies containment against `resolved.base` plus every configured managed root (`[resolved.base, ...managedRoots]`), correctly admitting independently authorized aliases nested under project or config roots while rejecting unmanaged paths and symlink escapes with `400`.

Focused verification:
- Real `nativeFs` regression tests in `packages/web/server/lib/fs/routes.test.js` exercise directory creation and deletion for lexical and canonical relocated roots with `noProject: true`, assert rejection of unmanaged targets and symlink escapes (status `400`, no directory created on disk), and pass new cases for independently authorized aliases nested under project or config roots.
- Vitest test run: `bun run --cwd packages/web test server/lib/fs/routes.test.js` passed (109 passed, 1 skipped; prior run was 107 passed before the two realFS alias cases; macOS casing test skipped on Linux).
- Real HTTP Express route smoke on latest source confirmed both project- and config-nested managed alias `POST /api/fs/mkdir` return 200 with physical directory creation, and symlink escape returns 400 without creating unmanaged directories. Temp directories were cleaned up.
- Oxlint: Exited 1 due to pre-existing `typeof` findings elsewhere in `routes.js`; the changed resolver and mkdir canonicalization code introduce no new `typeof` findings. Clean lint is not claimed.

Connected browser verification:
- On browser `page2` (`http://127.0.0.1:3127`, isolated home `/tmp/ohpichamber-m3-connected-iO5GmA`), restarted the repaired Node Host using existing Web dist assets (no UI source changes).
- Clicked Send once using the retained draft and selected fixture model: created session `92838fb5-fb12-498c-aa77-dd7c7c10c5ff`, completed turn `868563a0-b0b2-4a8d-8d87-e3b6946222cb`. User message (83 chars), assistant message (5742 chars), snapshot status 200, fixture document rendered, native SDK prompt reached.
- Tested against controlled loopback model provider only; does not exercise official third-party provider grants.
- Durable receipt: `/home/shizuku/Project/ohpichamber-omp-artifacts/m3-managed-chat-fixed-20261018/receipt.json` with artifacts `completed-session.png` and `completed-session.snapshot.txt`.

## Security review and closure

- Review boundary and source files: `packages/web/server/lib/fs/routes.js`, `packages/web/server/lib/fs/routes.test.js`.
- Second security review PASSED with no blocking findings. Existing pathname TOCTOU remains pre-existing and is not expanded.
- Task 48 is completed and archived to `.workflow/done/omp-through-m3/48-managed-chat-directory-admission.md`.
- Connected W7–W10 and full M3 acceptance remain open; remaining uncut paths include the old Agent picker (stuck on Loading) and legacy resource routes.
