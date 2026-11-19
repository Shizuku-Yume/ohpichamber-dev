# OhPiChamber bug hunt: handoff (2026-11-19)

The state of the post-audit bug hunt on `Shizuku-Yume/ohpichamber-dev`, so a new agent can clone the repo and pick up where this left off.

## Ground rules learned
- Toolchain: Bun 1.4.4 exactly, and Node 24.14+. Windows Electron needs the exact pinned Bun version.
- Dev: `bun run dev`. On Linux, Vite/HMR runs on 5180 and the Host API on 3902. The first web load can sit blank for about 60s while Vite optimizes dependencies.
- Before calling a PR ready, run full `bun run type-check` on the PR head merged with current main. The upstream-drift guard fails if an upstream-tracked file changes without a row in `.workflow/upstream-deltas.tsv` with a matching decision heading when the row cites a decision. Record lasting verification and remaining gaps in `.workflow/development.md`. Main went red twice from this (after #11/#13 and after #15).
- The repo has no CI beyond Devin Review. Gate merges on a clean review, full type-check, and a native or browser retest recording.
- Merge with merge commits.
- iOS simulator builds have to be ad-hoc signed (PR #17), or Keychain fails with -34018. On macOS, run `bun run mobile:sync` before simulator builds.
- Production-style web testing: run `bun run build:web`, then `bun run profile:serve --root <fresh-temp-dir> --fresh --port <host-port> --fixture-port <fixture-port>` in disposable state.
- No external model provider key is configured. Chat streaming was tested only with the local fixture provider (300 chars/s), so provider-backed chat is still unverified.

## Merged into main (since the audit, PR #3)
- Electron: #1 ESM `__dirname` startup crash, #4 OMP Bun-mode readiness, #6 old-glibc pidfd cleanup, #7 Linux Add-project label, #9 Windows Vite left running after exit, #10 worktree/project/draft lost on restart, #12 native Undo/Redo hitting the wrong editor (it autosaved a file revert), #22 Chats Retry couldn't clear a scoped discovery error.
- Web/PWA: #5 mobile file search showed a false "No files found" and now has an error state with Retry, #14 confirm before closing a dirty file tab, #23 mobile editor back arrow dropped drafts, #24 save recreated a file renamed outside the app (now 409), #25 terminal history scrambled after resize and reload, #26 file tab switch silently dropped a dirty draft.
- Mobile: #11 `ohpichamber://` pairing-link paste, #13 passwordless Host bearer auth (agent calls returned 401), #15 voice-key save reported failure, #16 Android Back in the Files viewer, #17 iOS sim ad-hoc signing, #18 drift ledger for mobile tests, #19 iOS malformed pairing link feedback, #20 Android status bar contrast, #21 empty Voice row, [#31](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/31) terminal rows above the landscape keyboard, [#36](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/36) scrollable welcome at 200% Android font size.
- Host: #32 session delete failed with 409 "Session scope cannot be changed" on every client.
- Plus #8 broker ownership after `/btw` promotion and worker replacement, and #29 plugin settings overlap at portrait width.

## Open PRs (GitHub snapshot, 2026-11-19 UTC)

Recheck GitHub before picking up a PR; these states can change.

| PR | State and next step |
| --- | --- |
| [#27](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/27) Windows Electron readiness shutdown race | Open, conflicts with main. The earlier head passed 10 native Windows launches, review, and full type-check. Approval was given; verify against current main before merging. |
| [#28](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/28) iOS resume disconnect notice | Open, conflicts with main. Superseded by [#35](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/35); close it after #35 merges. |
| [#30](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/30) Android Back from a Git diff | Open, conflicts with main. Update the branch, rerun full type-check, and verify hardware Back returns to the changes list in the Android emulator. |
| [#33](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/33) Terminal input lost before reattach | Open, conflicts with main. Desktop and mobile web passed on the earlier head; both review fixes are pushed at `c06d668ce`. Update against main, clear review, and rerun full type-check and browser tests on the final head. |
| [#34](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/34) Removing a pasted image submits the draft | Open, conflicts with main. iOS simulator confirmed the draft stays and no send request fires on the earlier head; update against main and rerun the gates. |
| [#35](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/35) Keep mobile workspace mounted while reconnecting | Open, conflicts with main. Android Host-stop/resume/recovery passed; finish iOS simulator retest with the Host down and confirm review and full type-check. |
| [#37](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/37) Remove the session transcript on delete | Open, mergeable. Focused Agent Service and Host tests passed; verify the final head and review before merging. The fix does not remove transcripts left by earlier deletions. |
| [#38](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/38) Record plugin layout verification | Open, conflicts with main. Docs-only follow-up to #29; full type-check and workflow validation were reported green on the earlier head. The Add plugin search placeholder still clips at 393 CSS px. |

Recheck Android landscape terminal rows alongside the #35 reconnect banner.

## Known bugs not yet fixed
- draw.io: undo restores the graph but still shows the unsaved prompt (the embed rewrites the XML).
- A deleted session could leave its transcript on disk; see [#37](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/37).
- Web Files search appeared stuck and then returned no results in a two-tab run. The active workspace root was not verified; reproduce with a file that is visible in the tree before treating this as a bug.

## Late additions (iOS round 3)

- [#34](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/34): Removing a composer image sent the draft. The fix was verified in the iOS simulator; the PR is open.
- [#36](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/36): The Android New session welcome screen now scrolls at 200% font size. Verified in the Android emulator and merged.
- Unfixed: A 9.3 MiB text file shows a blank preview on iOS.
- Unfixed: Opening a pairing link from Safari does not pair because there is no `connect` deep-link route. A route should require confirmation before switching hosts.
- Needs verification: Text in the iOS WebView may not scale with Dynamic Type.

## Tested clean
- Android round 2: git ops, terminal scrollback, all 28 settings pages, session rename/search/relaunch.
- iOS round 2: git, terminal, settings, sessions, expired-bearer renewal.
- Web: desktop installed PWA launch/reload; settings offline recovery, cross-tab session creation, archive and restore, fixture chat streaming/reload and provider-outage recovery, and terminal replay on desktop and mobile web. [Earlier reconnect retest](https://app.devin.ai/sessions/31f6db2a2b134fb484b27dec36b4d375?testRecording=f1b0a9ff-98e0-4425-8685-f3af50ded46c).
- Linux AppImage: native folder chooser, Chats Retry.
- `PIDFD_UNAVAILABLE` in the broad suite comes from the archived m0 probe only. The production cleanup path passes 27/27 on Ubuntu 22.04.
- The mobile prompt fragment after resize is normal bash redraw (it reproduces in plain tmux). Not a bug.

## Not covered yet (next steps)
1. Merge the open PRs above, gated as described, then confirm main's full type-check is green.
2. Electron packaged builds: installer, auto-updater, and the chooser on macOS and Windows. Mini-chat mouse-menu Undo/Redo.
3. Actual mobile PWA installation, removed or disabled model fallback, the unconfirmed multi-tab file-search behavior, and clipboard paste into the terminal after reconnect.
4. iOS airplane mode (only a blocked route was tested) and Android round 3.
5. Real provider-backed chat on every surface, once a provider key is available.
6. M7 cross-platform release acceptance (`.workflow/specs/m7-release-verification.md`) has not been done. Nothing above counts as release sign-off.
