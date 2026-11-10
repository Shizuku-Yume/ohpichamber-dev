# 14: Resolve the merge in UI libraries, hooks, styles and i18n

**Effort:** ux-v270-omp-alignment
**Blocked by:** 11
**Covers:** W1, W2
**Files:** `packages/ui/src/lib/**` (including `lib/i18n/messages`); `packages/ui/src/hooks/**`; `packages/ui/src/types/**`; `packages/ui/src/styles/**`; `packages/ui/src/index.css`; `packages/ui/src/components/ui/**`; `packages/ui/src/components/model-picker/**`
**Read first:** spec "How it is built" (Merge); `merge-lanes.tsv` lane 14; `packages/ui/src/lib/theme/STYLING.md`; skills `locale-ui-patterns`, `ui-api-decoupling`
**Check:** in a worktree on the scaffold branch, `bun scripts/upstream-drift.mjs --markers --lane 14` → 0; `bun run --cwd packages/ui type-check` reports no error located in lane paths; `bun scripts/upstream-drift.mjs --check -- packages/ui/src/lib packages/ui/src/hooks packages/ui/src/styles` → 0 `unexplained`
- **Base commit:** eeb64ec99ed17a4611f6b951e51cbad054d79f0f
- **Status:** active

- [ ] Resolve the conflicted paths with the merge rule. Restore the upstream CSS utilities the fork deleted while still in use (`oc-title-rest`, `oc-group-label`, `oc-bar-grow`, file-tree row utilities, terminal preedit) and upstream's theme, release-notes, provider-logo and text-direction libraries.
- [ ] Merge i18n dictionaries key by key: upstream strings arrive in all 15 locales, and fork OMP keys are kept.
- [ ] Deletes: fork-only helpers that duplicate an upstream helper now present.
