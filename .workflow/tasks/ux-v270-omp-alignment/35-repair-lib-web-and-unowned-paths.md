# 35: Repair UI libraries, hooks and web client, and explain the unowned docs, SDK, Electron and script paths

**Effort:** ux-v270-omp-alignment
**Task type:** bugfix
**Blocked by:** 30
**Covers:** W1, W2
**Files:** `packages/ui/src/{lib,hooks,types}/**`; `packages/web/src/**`; `packages/docs/**`; `packages/sdk/**`; `packages/electron/**`; `packages/extensions/**`; `packages/mobile/**`; `scripts/**` (except `scripts/upstream-drift*`); root config files (`.gitignore`, `.gitattributes`, `knip.json`, `oxlint.config.ts`, `docker-compose.yml`, `docs/`); slice 35 rows in `repair-slices.tsv`
**Read first:** spec "How it is built" (Merge); the archived task 14 and 18 records; `packages/sdk/DOCUMENTATION.md`; `packages/electron/README.md`; skills `desktop-shell`, `ui-api-decoupling`, `openchamber-change-discipline`
**Check:** in your worktree, `bun check --all` → 0 errors in slice 35 files (about 92 at scaffold `93a3c7549`: ui lib 37, web client 40, hooks 15); `bun scripts/upstream-drift.mjs --check --slice 35` → 0 unexplained (about 545 paths today: docs 453, sdk 38, electron 28, scripts 20, root config 6); `bun --cwd packages/sdk test && bun --cwd packages/electron test && bun run docs:validate` → exit 0

- [ ] Fix every type error in slice 35 files by porting merged callers onto the fork's contracts. Do not change exported shapes in `src/sync`, `src/stores` or `src/api`.
- [ ] For each unexplained path: take upstream's content when the fork's difference is accidental or stale, keep the fork's content with an `upstream-deltas.tsv` row citing a decision when it is OMP-specific. Product docs describe OMP behaviour where it differs and otherwise follow upstream. Group rows by decision; one row per path is still required.
- [ ] Root `README.md`, `AGENTS.md`, `SECURITY.md`, `CONTRIBUTING.md` and `CHANGELOG.md` stay as they are.
- [ ] Deletes: fork docs pages for retired VS Code or OpenCode surfaces, and accidental fork differences in SDK, Electron and script files.
