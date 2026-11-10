# 18: Resolve the merge in Electron, mobile, SDK, extensions, docs and scripts

**Effort:** ux-v270-omp-alignment
**Blocked by:** 11
**Covers:** W1, W2
**Files:** `packages/electron/**`; `packages/mobile/**`; `packages/sdk/**`; `packages/extensions/**`; `packages/docs/**`; `scripts/**` (except `scripts/upstream-drift*`); root docs and `Dockerfile`
**Read first:** spec "How it is built" (Merge); `merge-lanes.tsv` lane 18; `packages/electron/README.md`; `packages/sdk/DOCUMENTATION.md`; skills `desktop-shell`, `openchamber-change-discipline`
**Check:** in a worktree on the scaffold branch, `bun scripts/upstream-drift.mjs --markers --lane 18` → 0; `bun --cwd packages/sdk test` and `bun --cwd packages/electron test` → exit 0; `bun run docs:validate` → exit 0
- **Base commit:** fd671d0690c72c3f69b8c8c3739f60ce026832d8

- [x] Resolve the conflicted paths with the merge rule. The Guest SDK keeps its `v: 2` bootstrap, Electron keeps the in-process Host and Agent Service staging, and product docs take upstream content with OMP corrections only where behavior differs.
- [x] Root `README.md`, `AGENTS.md`, `SECURITY.md`, `CONTRIBUTING.md` and `CHANGELOG.md` keep the fork's text (standing rule for fork guidance and the changelog gate).
- [x] Deletes: docs pages for retired VS Code or OpenCode surfaces that upstream changed.

## Progress

- Resolved every lane-18 conflict: Electron (`main.mjs`, `updater-feed.mjs`, `updater-check.mjs` and their tests, `scripts/{after-pack.cjs,electron-dev.mjs,package.mjs,packaged-app-contents.test.cjs}`, `README.md`), the Guest SDK (source tests, `scripts/{check-guest.ts,check-guest.test.ts,examples.test.ts}`, `tasks-demo/panel/attach.ts`, 21 regenerated example bundles, `API.md`, `DOCUMENTATION.md`, `GUEST_SERVICES.md`, `README.md`, `examples/README.md`), `scripts/{model-bench,perf,oc-dev,generate-icon-sprite}`, and all 111 product docs pages including the 11 locales.
- Rules applied: upstream wins except where the OMP boundary or a recorded decision requires the fork side. Kept the Guest SDK `v: 2` envelope and manifest apiVersion 1, `>=3.0.0` engine floor, Electron's supervised Agent Runtime staging and `isRemoteSafeCommand` gate, and the OMP runtime vocabulary in perf/bench scripts. Removed the retired OpenCode plugin role, the VS Code extension surface and the unreleased isolated spaces from every locale.
- Fixed two auto-merge semantic errors the scaffold had baked in: `protocol.test.ts` and `parse.test.ts` carried upstream's `v: 1` / apiVersion literals over a v2 envelope runtime.
- Deletes: the docs pages for retired VS Code and OpenCode surfaces stay deleted; no sidebar link was restored.
- Root `README.md`, `AGENTS.md`, `SECURITY.md`, `CONTRIBUTING.md` and `CHANGELOG.md` untouched.
- Review: one `reviewer` pass over the diff against `fd671d069` plus a manual sweep for retired content, orphaned sentences and duplicate sections.
- Check after: `bun scripts/upstream-drift.mjs --markers --lane 18` → no conflict markers (lane 18). `bun --cwd packages/sdk test` → 32/32 files. `bun --cwd packages/electron test` → 71/71 files. `bun run docs:validate` → 696 pages, 58 sidebar links. Same four results on the landing target after the merge.
