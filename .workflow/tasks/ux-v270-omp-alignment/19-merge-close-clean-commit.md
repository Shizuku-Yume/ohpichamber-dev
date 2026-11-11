# 19: Rebuild the integration branch as one clean merge commit and prove it runs

**Effort:** ux-v270-omp-alignment
**Blocked by:** 30, 31, 32, 33, 34, 35
**Covers:** W1, W2
**Files:** merged tree; `.workflow/development.md`
**Read first:** spec W1-W2; `.workflow/standards.md` (Real path); skills `desktop-shell`, `openchamber-change-discipline`
**Check:** `git merge-base --is-ancestor bc50ba56a ux-v270-omp-alignment/integration` → exit 0; `bun scripts/upstream-drift.mjs --check` → exit 0; `bun install --frozen-lockfile && bun run type-check && bun run lint && VITEST_MAX_WORKERS=2 bun run test` → exit 0; the Web surface and packaged Linux Electron app complete a real-provider chat
- **Base commit:** c4e6dc67cfc81276c93091d38de244ce47fb9a83
- **Status:** active

- [x] Lanes 12-18 and repair slices 30-35 are already on the scaffold. Fix only what remains when they are combined: `bun check --all` must report 0 errors repo-wide, and lint and the full test suite must pass. Name every leftover you fix in `## Progress` with the slice it belonged to.
- [x] Rebuild `ux-v270-omp-alignment/integration` as `main` plus one merge commit with parents `main` and `bc50ba56a`, whose tree equals the resolved scaffold tip. The scaffold branch is not merged anywhere.
- [x] Add `scripts/upstream-drift.mjs --check` and the marker check to `bun run check`.
- [x] Run `bun run dead-code`; findings introduced by the merge are fixed, and inherited ones are left as they were.
- [x] Real path: build and launch Web and packaged Electron, open every Settings page without errors, and send a chat that completes through the real provider.
- [x] Record the merge, drift counts before and after, and the real-path result in `development.md`.

## Progress

**Combined-tree fixes, by slice.** Slice 30 (UI library): `lib/settings/search.ts` gained the six chat rows whose anchors exist (`chat.diff-layout`, `chat.mermaid-rendering`, `chat.selection-approval-text`, `chat.session-goal-checker`, `chat.session-goal-max-turns`, `chat.user-message-rendering`), dropped the four orphans (`chat.render-mode`, `chat.streaming`, `chat.tools-and-files`, `chat.persist-drafts`) and filed `chat.dotfiles` under General; `lib/gitApi.ts` regained the fifteen `unsupportedByRuntime` guards and `getCommitFileDiff`'s `previousPath` argument. Slice 31 (hooks): `useGlobalSessionsPolling.ts` keeps `missedWhileHidden` and `scheduleNext`; the sidebar hooks declare `SidebarSessionProjection`, `UseSessionProjectCollectionResult`, `MatchedZoneSessions` and `UseWorktreeWorkResult` so the merged zod shapes stop leaking into the portability check. Slice 32 (sync/stores): `global-session-status.ts` regains `subscribeSessionStatusTransitions`, emitted synchronously per event before publication; `session-unread.ts` gains `isUnreadTurn`; the tray badge rolls a subtask's unread turn up to its parent. Slice 33 (chat/layout/view): `OpenInAppButton` marks its menu `data-work-status-popup` so the work panel ignores the pick. Slice 34 (settings pages): `ClassificationProvidersPage` opens the canonical `opencode-zen`/`vercel-ai-gateway` ids. Lane 16: the merged OAuth harness gained `memo`, `createContext`, `useContext`, `useDebugValue` and a `busy-dots` stub; the source-board launch mock gained the dropdown subcomponents `action-toolbar` imports. Lane 17: `multirun/autoFusion.ts` keeps the subagent wait, the active-goal check and the transition subscription, on the canonical `parentSessionId` and `mode` record; `multirun/laneStatus.ts` regains `hasRunningGoal`. Test contracts: canonical `ModelVariantSchema` fixtures, canonical `Session` records in the tray fixture, the effective `Save Changes` label, `/api/session-folders` as bootstrap, and an awaited guest `ready()`.

**Environment.** A stray `/tmp/.git-quarantine-v270-19` (a git-init-shaped folder in `/tmp`) made every Web git test fail with `fatal: detected dubious ownership`; removed and preserved in the artifacts directory. `code-in.test.js` made its socket directory under `/tmp` while the repository lived under `TMPDIR`, so the rename crossed devices; the socket now shares the repository's device.

**Drift.** 33 unexplained paths of 4,373 differing at the scaffold start became 0 of 4,387; the six authored `fork-differs` paths cite `2026-11-11 - Finish the v2.7.0 merge on the fork's runtime and unread authorities` in `.workflow/upstream-deltas.tsv`.

**Parents.** `main` had two workflow-only commits past the scaffold's merge base, so `e04b3dfb7` was merged into the scaffold before landing.

**Check after:** `bun scripts/upstream-drift.mjs --check` exit 0; `bun check --all` exit 0; `bun run lint` exit 0 (seven workspaces); `VITEST_MAX_WORKERS=2 bun run test` 7/7 suites, and `bun run dead-code` exits 1 on the inherited inventory.

**Checks.**

**Real path (2026-11-11).** Web: built `packages/web/dist`, served on `127.0.0.1:4119` with an isolated HOME/data dir and the maintainer's provider env (key never printed); all 27 Settings pages rendered through the router with headings and items, 0 failed pages, and the only renderer log entries are `/api/quota/*` 503s from the unconfigured quota credentials. A real-provider turn completed in the Host (`/api/agent/v1/sessions/:id/history` carries a `completed` turn and assistant content) in ~3.6 s. Desktop: built `OpenChamber-3.0.0-linux-x86_64.AppImage` (sha256 `f08a904a1a9915ea2b5c669a043d1e64947c2096c3b023cff3a33930ad2867b3`), launched under Xvfb with CDP 9551 after resolving first-run onboarding to the local host; all 27 Settings pages rendered, and a real-provider turn finished with `stopReason: stop`, `contentBlocks: 2`, `hasText: true` and a generated session title. Evidence: `sweep-web/`, `chat-out/`, `desktop-out/`, `desktop-check.log`, `final-check.log` under `/home/shizuku/Project/ohpichamber-omp-artifacts/ux-v270-task19-2026-11-11/`.

**Check after:** `bun check --all` exit 0; `bun run lint` exit 0 (seven workspaces); `VITEST_MAX_WORKERS=2 bun run test` 7/7 suites (`final-check.log`); `bun scripts/upstream-drift.mjs --check` exit 0; `bun run dead-code` exits 1 on the inherited inventory.

Review: pass (base c4e6dc67cfc81276c93091d38de244ce47fb9a83). One `reviewer` pass over the close-out commits found one P2: the tray fixture answered every unrecognized request with 204, so an unexpected endpoint stayed green. Fixed by matching exactly the metadata read, its patch and the view POST, and failing everything else (`926a22980`). No other blocking finding.

**Accepted limits.** The AppImage was launched with `APPIMAGE_EXTRACT_AND_RUN=1` (no FUSE in this shell) and a short `TMPDIR` because Chromium's process-singleton socket path exceeded the limit; the packaged content gate, not the AppImage launcher, is what proves the payload. Two desktop sessions in that env hit `401 Invalid API key` before the seeded provider config was corrected; the successful turn above is the evidence that counts.
