# 14: Resolve the merge in UI libraries, hooks, styles and i18n

**Effort:** ux-v270-omp-alignment
**Blocked by:** 11
**Covers:** W1, W2
**Files:** `packages/ui/src/lib/**` (including `lib/i18n/messages`); `packages/ui/src/hooks/**`; `packages/ui/src/types/**`; `packages/ui/src/styles/**`; `packages/ui/src/index.css`; `packages/ui/src/components/ui/**`; `packages/ui/src/components/model-picker/**`
**Read first:** spec "How it is built" (Merge); `merge-lanes.tsv` lane 14; `packages/ui/src/lib/theme/STYLING.md`; skills `locale-ui-patterns`, `ui-api-decoupling`
**Check:** in a worktree on the scaffold branch, `bun scripts/upstream-drift.mjs --markers --lane 14` → 0; `bun run --cwd packages/ui type-check` reports no error located in lane paths; `bun scripts/upstream-drift.mjs --check -- packages/ui/src/lib packages/ui/src/hooks packages/ui/src/styles` → 0 `unexplained`
- **Base commit:** eeb64ec99ed17a4611f6b951e51cbad054d79f0f
- **Status:** active

- [x] Resolve the conflicted paths with the merge rule. Restore the upstream CSS utilities the fork deleted while still in use (`oc-title-rest`, `oc-group-label`, `oc-bar-grow`, file-tree row utilities, terminal preedit) and upstream's theme, release-notes, provider-logo and text-direction libraries.
- [ ] Merge i18n dictionaries key by key: upstream strings arrive in all 15 locales, and fork OMP keys are kept.
- [x] Deletes: fork-only helpers that duplicate an upstream helper now present.

## Progress

**Check before:** `bun scripts/upstream-drift.mjs --markers --lane 14` → 2,082 markers in 168 lane paths (694 hunks).

**Check after (markers):** `bun scripts/upstream-drift.mjs --markers --lane 14` → `no conflict markers (lane 14)`.

**Resolution:** 177 lane paths decided file by file against upstream `bc50ba56a`, the fork (`d599d1566`) and the landing tree (`ux-v270-omp-alignment/merge-scaffold`): upstream's v2.7.0 file wins unless an import it makes does not resolve, or a name it imports is absent from the module it reads (the fork replaced the OpenCode engine with the Canonical Client and its own store shapes). Then the fork's own file stands in; a file the fork never had is excluded. The dictionaries are merged key by key per locale instead of by file, because a dictionary conflict is two dictionaries that grew at the same offset: 1,694 upstream keys arrived across all 15 locales, 90 imports and 198 spreads were wired, and every upstream key is present. CSS takes upstream's `index.css`; the fork's `--oc-motion-*` tokens stay in `design-system.css` and its `fireworks.css` rules are kept where retained components still name them. `adding-themes.md` (upstream moved it out of the removed theme skill) is written with fork-correct relative links.

**Check after (type-check):** `cd packages/ui && bunx tsc -b --force` reports no error in any lane path (0 files, 0 lines). The project total is 1,171 error lines, all in paths owned by other lanes and by the scaffold's own conflicts.

**Check after (drift):** `bun scripts/upstream-drift.mjs --check -- packages/ui/src/lib packages/ui/src/hooks packages/ui/src/styles` → `drift check passed: no conflict markers, no unexplained path, no contradicting row`. 175 decision rows were added to `.workflow/upstream-deltas.tsv`; each states what actually changed against v2.7.0 rather than a class label.

**Porting record:** the 29 residual files were contract mismatches, not side choices, and each was ported onto what the landing tree actually exposes:

- `lib/reviewFlow.ts`: the client no longer polls a run it started. `startAutoReview` prepares the review session and hands the Host every rendered prompt (`handoff`, `reviewStart`, `reviewRules`, `feedbackToImplementer`, `responseToReviewer`) through `useAutoReviewStore.startRun`; the client-side loop, its forward keys and its run mutations were deleted with it. `getRuntimeSwitchRevision` was added to `lib/runtime-switch.ts` over the existing `instanceGeneration` counter because ten fork call sites need a revision that also bumps when the key stays the same.
- `hooks/useTraySync.ts` + test: unread state lives on session metadata now (`isSessionUnread`), so the notification `index` fallback is gone; the quota label takes the whole window plus a translator; `markSessionViewed` is the module function, not a store member.
- `hooks/useQueuedMessageAutoSend.ts`: reads the Canonical runtime status string and the snapshot's turns instead of OpenCode `session_status` objects and `time.completed`; the status type narrowed to `idle | busy`.
- `hooks/useKeyboardShortcuts.ts` + `lib/shortcuts/config.ts`: the variant accessors are the landed `get/saveAgentModelVariantForSession`, and `toggle_terminal_expanded` was restored to the schema (hook, all fifteen dictionaries and the panels group already referenced it).
- `hooks/useMergedWorktreeCleanup.ts`: resolves the change-request term from `readSourceControlProvider`.
- `hooks/useMessageQueueHoldSync.ts`: reads the store's `runs` projection, which is already scoped to the active runtime.
- `lib/settings/{metadata,search}.ts` and `lib/api/types.ts`: union of both sides' declarations — upstream's v2.7.0 additions kept beside the fork's OMP fields (`linear`, `changeId`/`notes`, `teardownCommand`, `sessionIds` optional, the worktree binding authority, `GitAPI.teardownGitWorktree`, the archive `recovery` argument).
- `lib/mobileKeyboardMode.ts`: restored the upstream overloads that take a `fallback`; the settings registry calls that form.
- `lib/persistence.test.ts`: the cache-reconciliation cases use `lastSelectedModel`/`zenModel`, because `defaultModel`/`defaultVariant` left the registry when OMP took model roles.
- Deleted as orphans with their subjects: `lib/btw.test.ts` (the `/btw` flow needs the retired OpenCode engine; only the composer-key helper remains) and `lib/sessionGoalActions.ts` (no importer, depends on the retired goal runtime and three absent modules).
- Removed `packages/ui/src/probe3.tmp.test.tsx`, an empty stray file.

## Cross-lane follow-up for task 19

`packages/ui/src/sync/notification-store.ts` imports `getUnreadSessionIds` and `markSessionsUnreadSeen` from `./session-unread`, but that module exports neither, so any import of the store throws `SyntaxError: Export named 'getUnreadSessionIds' not found in module 'src/sync/session-unread.ts'` at runtime. The landed store also dropped `index` and `markSessionViewed`, which lane paths still read: `src/App.tsx`, `src/apps/AppEffects.tsx`, `src/components/layout/ContextSurfacePanes.tsx`, `src/sync/session-ui-store.ts` and `src/components/session/sidebar/sessions/collapsedActivityState.ts`. `sync/selection-store.ts` likewise dropped `ROOT_SELECTION_AGENT`, `getAgentModelReasoningEffortForSession` and `saveAgentModelReasoningEffortForSession`, still imported by `src/components/chat/{ChatInput,ModelControls,pinnedComposerSelection}.tsx` and `src/sync/session-ui-store.ts`. All three files are outside lane 14 and were left alone.
