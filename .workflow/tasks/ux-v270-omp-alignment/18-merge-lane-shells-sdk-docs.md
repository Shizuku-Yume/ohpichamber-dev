# 18: Resolve the merge in Electron, mobile, SDK, extensions, docs and scripts

**Effort:** ux-v270-omp-alignment
**Blocked by:** 11
**Covers:** W1, W2
**Files:** `packages/electron/**`; `packages/mobile/**`; `packages/sdk/**`; `packages/extensions/**`; `packages/docs/**`; `scripts/**` (except `scripts/upstream-drift*`); root docs and `Dockerfile`
**Read first:** spec "How it is built" (Merge); `merge-lanes.tsv` lane 18; `packages/electron/README.md`; `packages/sdk/DOCUMENTATION.md`; skills `desktop-shell`, `openchamber-change-discipline`
**Check:** in a worktree on the scaffold branch, `bun scripts/upstream-drift.mjs --markers --lane 18` → 0; `bun --cwd packages/sdk test` and `bun --cwd packages/electron test` → exit 0; `bun run docs:validate` → exit 0
- **Base commit:** fd671d0690c72c3f69b8c8c3739f60ce026832d8
- **Status:** blocked

- [ ] Resolve the conflicted paths with the merge rule. The Guest SDK keeps its `v: 2` bootstrap, Electron keeps the in-process Host and Agent Service staging, and product docs take upstream content with OMP corrections only where behavior differs.
- [ ] Root `README.md`, `AGENTS.md`, `SECURITY.md`, `CONTRIBUTING.md` and `CHANGELOG.md` keep the fork's text (standing rule for fork guidance and the changelog gate).
- [ ] Deletes: docs pages for retired VS Code or OpenCode surfaces that upstream changed.

## Blocked

Run budget stopped the lane mid-resolution. Committed in `cc45ed9f6`: Electron, SDK source and scripts, every regenerated example bundle, and the English product docs for extensions, github, integrations, issues-and-prs, notes-todos-plans, security and sessions-in-work.

Still carrying markers: 104 files, 711 markers. They are `packages/docs/content/docs/sidebar.mdx`, `sdk.mdx`, `sdk/host.mdx`, `workflows.mdx`, `packages/electron/README.md`, `packages/sdk/{API,DOCUMENTATION,GUEST_SERVICES,README}.md`, `packages/sdk/examples/README.md`, and 94 localized `packages/docs/content/docs/<locale>/*.mdx` pages.

Check evidence at this commit: `bun scripts/upstream-drift.mjs --markers --lane 18` → 711 markers (not 0). `bun --cwd packages/sdk test` → 31/32 files, 1 failure (`scripts/examples.test.ts` "the SDK package and every localized example name the release version", because the localized `sdk.mdx` JSON blocks are unresolved). `bun run docs:validate` → passes (696 pages, 58 sidebar links). Electron files pass `node --check`; `packages/electron test` was not reached.
