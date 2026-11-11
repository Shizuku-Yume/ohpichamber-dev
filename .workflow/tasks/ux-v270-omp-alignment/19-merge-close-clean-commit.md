# 19: Rebuild the integration branch as one clean merge commit and prove it runs

**Effort:** ux-v270-omp-alignment
**Blocked by:** 30, 31, 32, 33, 34, 35
**Covers:** W1, W2
**Files:** merged tree; `.workflow/development.md`
**Read first:** spec W1-W2; `.workflow/standards.md` (Real path); skills `desktop-shell`, `openchamber-change-discipline`
**Check:** `git merge-base --is-ancestor bc50ba56a ux-v270-omp-alignment/integration` → exit 0; `bun scripts/upstream-drift.mjs --check` → exit 0; `bun install --frozen-lockfile && bun run type-check && bun run lint && VITEST_MAX_WORKERS=2 bun run test` → exit 0; the Web surface and packaged Linux Electron app complete a real-provider chat
- **Base commit:** c4e6dc67cfc81276c93091d38de244ce47fb9a83
- **Status:** active

- [ ] Lanes 12-18 and repair slices 30-35 are already on the scaffold. Fix only what remains when they are combined: `bun check --all` must report 0 errors repo-wide, and lint and the full test suite must pass. Name every leftover you fix in `## Progress` with the slice it belonged to.
- [ ] Rebuild `ux-v270-omp-alignment/integration` as `main` plus one merge commit with parents `main` and `bc50ba56a`, whose tree equals the resolved scaffold tip. The scaffold branch is not merged anywhere.
- [ ] Add `scripts/upstream-drift.mjs --check` and the marker check to `bun run check`.
- [ ] Run `bun run dead-code`; findings introduced by the merge are fixed, and inherited ones are left as they were.
- [ ] Real path: build and launch Web and packaged Electron, open every Settings page without errors, and send a chat that completes through the real provider.
- [ ] Record the merge, drift counts before and after, and the real-path result in `development.md`.
