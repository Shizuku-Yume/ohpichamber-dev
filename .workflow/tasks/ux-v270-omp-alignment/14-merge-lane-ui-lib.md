# 14: Resolve the merge in UI libraries, hooks, styles and i18n

**Effort:** ux-v270-omp-alignment
**Blocked by:** 11
**Covers:** W1, W2
**Files:** `packages/ui/src/lib/**` (including `lib/i18n/messages`); `packages/ui/src/hooks/**`; `packages/ui/src/types/**`; `packages/ui/src/styles/**`; `packages/ui/src/index.css`; `packages/ui/src/components/ui/**`; `packages/ui/src/components/model-picker/**`
**Read first:** spec "How it is built" (Merge); `merge-lanes.tsv` lane 14; `packages/ui/src/lib/theme/STYLING.md`; skills `locale-ui-patterns`, `ui-api-decoupling`
**Check:** in a worktree on the scaffold branch, `bun scripts/upstream-drift.mjs --markers --lane 14` → 0; `bun run --cwd packages/ui type-check` reports no error located in lane paths; `bun scripts/upstream-drift.mjs --check -- packages/ui/src/lib packages/ui/src/hooks packages/ui/src/styles` → 0 `unexplained`
- **Base commit:** eeb64ec99ed17a4611f6b951e51cbad054d79f0f
- **Status:** blocked

- [ ] Resolve the conflicted paths with the merge rule. Restore the upstream CSS utilities the fork deleted while still in use (`oc-title-rest`, `oc-group-label`, `oc-bar-grow`, file-tree row utilities, terminal preedit) and upstream's theme, release-notes, provider-logo and text-direction libraries.
- [ ] Merge i18n dictionaries key by key: upstream strings arrive in all 15 locales, and fork OMP keys are kept.
- [ ] Deletes: fork-only helpers that duplicate an upstream helper now present.

## Progress

**Check before:** `bun scripts/upstream-drift.mjs --markers --lane 14` → 2,082 markers in 168 lane paths (694 hunks).

**Check after (markers):** `bun scripts/upstream-drift.mjs --markers --lane 14` → `no conflict markers (lane 14)`.

**Resolution:** 177 lane paths decided file by file against upstream `bc50ba56a`, the fork (`d599d1566`) and the landing tree (`ux-v270-omp-alignment/merge-scaffold`): upstream's v2.7.0 file wins unless an import it makes does not resolve, or a name it imports is absent from the module it reads (the fork replaced the OpenCode engine with the Canonical Client and its own store shapes). Then the fork's own file stands in; a file the fork never had is excluded. The dictionaries are merged key by key per locale instead of by file, because a dictionary conflict is two dictionaries that grew at the same offset: 1,694 upstream keys arrived across all 15 locales, 90 imports and 198 spreads were wired, and every upstream key is present. CSS takes upstream's `index.css`; the fork's `--oc-motion-*` tokens stay in `design-system.css` and its `fireworks.css` rules are kept where retained components still name them. `adding-themes.md` (upstream moved it out of the removed theme skill) is written with fork-correct relative links.

**Check after (type-check):** does not yet pass. On a composed tree (landing tree + this lane's files) the lane still reports errors in 29 files, concentrated in `lib/guests/start-session.ts`, `lib/reviewFlow.ts`, `lib/persistence.test.ts`, `lib/worktrees/worktreeManager.ts`, `hooks/useQueuedMessageAutoSend.ts`, `lib/defaultSendSelection.ts` and `lib/sessionGoalActions.ts`. These are contract mismatches between upstream's v2.7.0 call sites and the fork's Canonical shapes that need porting, not choosing: the remaining work is to rewrite those call sites onto this tree's stores rather than to pick a side.

**Check after (drift):** not run to completion. `bun scripts/upstream-drift.mjs --check -- packages/ui/src/lib packages/ui/src/hooks packages/ui/src/styles` still lists unexplained paths for the lane's kept files; the rows belong in `.workflow/upstream-deltas.tsv` once the porting above settles which files actually stay on the fork side.

**Blocked on:** the remaining porting of upstream call sites onto the Canonical Client and store contracts (29 files), which is contract work inside this lane, not another lane's.

## Blocked

- [ ] Resolve the conflicted paths with the merge rule.
- [ ] Merge i18n dictionaries key by key.
- [ ] Deletes: fork-only helpers that duplicate an upstream helper now present.
