# 02: Resolve UI React Hook lint warnings and guard DiffWorkerProvider worker initialization timeouts

**Effort:** tech-debt-sweep
**Task type:** bugfix
**Base commit:** 923e864b71
**Started:** 2026-11-07
**Finished:** 2026-11-07
**Blocked by:** None
**Covers:** W2
**Files:** `packages/ui/src/components/views/IntegrationsCatalogView.tsx`; `packages/ui/src/components/inline-picker/useTextareaInlinePicker.tsx`; `packages/ui/src/components/session/sidebar/list/useSidebarGroupStatus.ts`; `packages/ui/src/components/chat/ChatInput.tsx`; `packages/ui/src/contexts/DiffWorkerProvider.tsx`; `packages/ui/src/contexts/DiffWorkerProvider.test.tsx`
**Read first:** `.workflow/specs/tech-debt-sweep.md`; `/home/shizuku/Project/ohpichamber-omp-artifacts/m6-gate-2026-11-07/receipts/gate-lint.log`; `.workflow/done/m6-audit-and-polish/closeout.md`; `.agents/skills/openchamber-change-discipline/SKILL.md`
**Check:** `bun run lint 2>&1 | tee /tmp/debt-w2-lint.log && ! grep -q 'warning' /tmp/debt-w2-lint.log && bun test packages/ui/src/contexts/DiffWorkerProvider.test.tsx packages/ui/src/components/session/sidebar/list/useSidebarGroupStatus.test.tsx && bun run --cwd packages/ui type-check` → exits 0 with 0 lint warnings and verified DiffWorkerProvider timeout fallback.

- [x] Fix all 5 `react-hooks(exhaustive-deps)` warnings in `IntegrationsCatalogView.tsx` (lines 382, 397), `useTextareaInlinePicker.tsx` (line 47), `useSidebarGroupStatus.ts` (line 105), and `ChatInput.tsx` (line 1587) without `eslint-disable` / `oxlint-disable` comments.
- [x] Inspect `packages/ui/src/contexts/DiffWorkerProvider.tsx` where `@pierre/diffs` `WorkerPoolManager` initializes workers and attach proper rejection handling / graceful fallback when `WorkerPoolManager` initialization times out after 10000ms so long-lived pages never emit uncaught promise rejections.
- [x] Add a deterministic unit test in `packages/ui/src/contexts/DiffWorkerProvider.test.tsx` proving worker initialization timeout/rejection is caught cleanly without unhandled rejections.

## Progress

**Check before:** `bun run lint` emitted 5 `react-hooks(exhaustive-deps)` warnings across `@openchamber/ui` (`IntegrationsCatalogView.tsx:382,397`, `useTextareaInlinePicker.tsx:47`, `useSidebarGroupStatus.ts:105`, and `ChatInput.tsx:1587`). `@pierre/diffs` `WorkerPoolManager` in `DiffWorkerProvider.tsx` lacked timeout and rejection guards, leaking unhandled promise rejections on worker initialization and option application failures, and `DiffWorkerProvider.test.tsx` did not exist.

**Work:**
- `IntegrationsCatalogView.tsx`: Removed unused `skills` from `handleOpenCatalog` dependency array and restored missing `skills` to `handleOpenComponent` dependency array.
- `useTextareaInlinePicker.tsx`: Preserved follow-remounted-field invariant without suppression by capturing `currentField = fieldRef.current` at render time and depending on `[currentField, field]`, keeping full remount detection on textarea instance changes.
- `useSidebarGroupStatus.ts`: Removed unused `globalStatus` from `useMemo` dependency array.
- `ChatInput.tsx`: Removed unused `agents` store selector and removed `agents` from `handleSubmit` dependencies.
- `DiffWorkerProvider.tsx`: Added worker initialization timeout override plumbing for deterministic tests, wrapped `pool.initialize()` and `pool.setRenderOptions()` with try/catch and rejection handlers, terminating failed/timed-out pools and cleanly evicting from pool cache so consumers fall back to main-thread rendering with zero unhandled rejections. Consolidated test helpers (`_setWorkerInitTimeoutForTesting`, `_resetPoolsForTesting`) into `DiffWorkerProvider` component properties to remove all new `oxlint-disable` export suppressions.
- `DiffWorkerProvider.test.tsx`: Added deterministic unit tests with a controllable mock worker testing: normal pool initialization, worker initialization timeout fallback with zero unhandled rejections, worker initialization failure fallback with zero unhandled rejections, and `setRenderOptions` failure fallback with zero unhandled rejections. Resolved `TS2352` via semantically justified intermediate unknown cast on the worker event listener.

**Check after:**
- `bun run lint 2>&1 | tee /tmp/debt-w2-lint.log && ! grep -q 'warning' /tmp/debt-w2-lint.log`: Exited with code 0 across all workspaces; 0 warnings found.
- `bun test packages/ui/src/contexts/DiffWorkerProvider.test.tsx packages/ui/src/components/session/sidebar/list/useSidebarGroupStatus.test.tsx`: 14 pass, 0 fail, 47 expect() calls across 2 files.
- `bun run --cwd packages/ui type-check`: 0 type errors in 2,975 files across 2 projects.
- `bunx oxlint packages/ui/src/components/chat/ChatInput.tsx packages/ui/src/components/inline-picker/useTextareaInlinePicker.tsx packages/ui/src/components/session/sidebar/list/useSidebarGroupStatus.ts packages/ui/src/components/views/IntegrationsCatalogView.tsx packages/ui/src/contexts/DiffWorkerProvider.tsx packages/ui/src/contexts/DiffWorkerProvider.test.tsx`: Exited with code 0; 0 errors, 0 warnings.
- Browser smoke test exercised across 4 surfaces via Chrome DevTools (App home / ChatInput, IntegrationsCatalogView, Changes diff surface, Session sidebar): 0 uncaught errors, 0 unhandled promise rejections, 0 worker timeouts.
- Smoke receipt artifact: `/home/shizuku/Project/ohpichamber-omp-artifacts/post-m6-dispatch-2026-11-07/debt-w2/smoke-receipt.json`
- Diff surface screenshot artifact: `/home/shizuku/Project/ohpichamber-omp-artifacts/post-m6-dispatch-2026-11-07/debt-w2/diff-surface-smoke.png`
