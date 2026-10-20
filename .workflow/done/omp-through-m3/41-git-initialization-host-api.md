# 41: Cut Git initialization to the Host Git API

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** 0a56f63a18d3b2bbab34ba44612afaef4e223740
**Started:** 2026-10-18

**Delivers:** The shared Git empty state initializes a repository through the Host-owned Git API. Web and Electron use the existing `/api/git/*` capability boundary; no retained UI caller invokes `opencodeClient.initializeGit` or the OpenCode `/api/vcs/init` proxy.

**Blocked by:** None
**Files:** `packages/ui/src/lib/api/types.ts`, `packages/ui/src/components/views/git/InitializeGitButton.tsx`, `packages/ui/src/lib/gitApiHttp.ts`, `packages/web/src/api/git.ts`, `packages/web/server/lib/git/routes.js`, `packages/web/server/lib/git/service.js`, focused Git route/client tests, `.workflow/development.md`

**Read first:** `.workflow/specs/omp-through-m3.md` residual packet R4 and W2/W9/W10; `packages/web/server/lib/git/DOCUMENTATION.md`; `packages/ui/src/lib/api/types.ts`; `packages/ui/src/lib/gitApiHttp.ts`; `packages/web/src/api/git.ts`; `packages/web/server/lib/git/routes.js`; `packages/web/server/lib/git/service.js`; `packages/web/server/lib/git/repository-root.js`; `packages/ui/src/components/views/git/InitializeGitButton.tsx`.

**Covers:** W2, W9, W10

**Surface behavior:**
- Web and Electron call the same Host Git operation.
- Hosted and Capacitor mobile inherit the remote Host API; no local Git process is added.
- The Host refuses home and filesystem-root initialization using the existing repository-root policy, and rejects missing directories as invalid input.
- A normal directory runs `git init` in that directory and returns a successful empty-repository result. Failures remain errors; they do not become a false repository state.
- The UI preserves the existing busy, error and post-initialization repository recheck behavior, but removes the OpenCode-version/missing-route branch and OpenCode-specific error type.

**Check:** Focused Web Git route/client tests covering normal init, refusal, missing directory and Git failure; UI package build; strict UI test-project type-check; touched-file oxlint. Do not run workspace-wide checks or connected acceptance for this slice.

## Progress


Implementation is complete for the current bounded slice. `GitAPI.initializeGit`, the Web `/api/git/init` route, the Host service operation and the UI caller now use the Host Git boundary. The service test file passes under the package Vitest runner; the HTTP client test passes (`58` tests / `330` assertions); UI build and strict UI test-project type-check pass. Touched-file oxlint reports only pre-existing findings in `gitApiHttp.ts`; the new component and contract additions introduce no reported finding. The focused route/client and temporary-directory behavior are verified; connected W2/W9/W10 acceptance remains open.

- [x] Add the narrow Host Git API contract and HTTP implementation.
- [x] Add the route/service operation using the existing root refusal policy.
- [x] Migrate `InitializeGitButton` without an OpenCode fallback or version branch.
- [x] Add behavior tests for success and failure/refusal boundaries.
- [x] Run the focused check, real temporary-directory Git initialization path, UI build, test-project type-check and touched-file lint.
- [x] Update development/spec evidence and archive only after all checks pass.
**Finished:** 2026-10-18
Dirty at start: existing coordinator changes outside this task; do not stage or rewrite them.

**Stop condition:** If the Host Git route cannot provide the existing refusal and failure semantics without importing the OpenCode proxy/lifecycle, mark this task blocked and record the missing owner instead of adding an adapter.
