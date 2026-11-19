# OhPiChamber bug hunt: handoff (2026-11-19)

The state of the post-audit bug hunt on `Shizuku-Yume/ohpichamber-dev`, so a new agent can clone the repo and pick up where this left off.

## Ground rules learned
- Toolchain: Bun 1.4.4 exactly, and Node 24.14+. Windows Electron needs the exact pinned Bun version.
- Dev: `bun run dev`. On Linux, Vite/HMR runs on 5180 and the Host API on 3902. The first web load can sit blank for about 60s while Vite optimizes dependencies.
- Before calling a PR ready, run full `bun run type-check` on the PR head merged with current main. The upstream-drift guard fails if an upstream-tracked file changes without a row in `.workflow/upstream-deltas.tsv` with a matching heading in `.workflow/decisions.md` when the row cites a decision. Record lasting verification and remaining gaps in `.workflow/development.md`. Main went red twice from this (after #11/#13 and after #15).
- The repo has no CI beyond Devin Review. Gate merges on a clean review, full type-check, and a native or browser retest recording.
- Merge with merge commits.
- iOS simulator builds have to be ad-hoc signed (PR #17), or Keychain fails with -34018. On macOS, run `bun run mobile:sync` before simulator builds.
- Production-style web testing: run `bun run build:web`, then `bun run profile:serve --root <fresh-temp-dir> --fresh --port <host-port> --fixture-port <fixture-port>` in disposable state.
- Provider-backed chat is verified on Android with Gemini 3.5 Flash Lite. The test provider was configured only in the isolated Android run; the other surfaces still need provider-backed verification.

## Merged into main (since the audit, PR #3)
- Electron: #1 ESM `__dirname` startup crash, #4 OMP Bun-mode readiness, #6 old-glibc pidfd cleanup, #7 Linux Add-project label, #9 Windows Vite left running after exit, #10 worktree/project/draft lost on restart, #12 native Undo/Redo hitting the wrong editor (it autosaved a file revert), #22 Chats Retry couldn't clear a scoped discovery error.
- Web/PWA: #5 mobile file search showed a false "No files found" and now has an error state with Retry, #14 confirm before closing a dirty file tab, #23 mobile editor back arrow dropped drafts, #24 save recreated a file renamed outside the app (now 409), #25 terminal history scrambled after resize and reload, #26 file tab switch silently dropped a dirty draft.
- Mobile: #11 `ohpichamber://` pairing-link paste, #13 passwordless Host bearer auth (agent calls returned 401), #15 voice-key save reported failure, #16 Android Back in the Files viewer, #17 iOS sim ad-hoc signing, #18 drift ledger for mobile tests, #19 iOS malformed pairing link feedback, #20 Android status bar contrast, #21 empty Voice row, [#31](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/31) terminal rows above the Android landscape keyboard, [#36](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/36) scrollable Android welcome at 200% font size.
- [#30](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/30): Retested Android Git diff hardware Back on main; see Android round 3 below.
- [#35](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/35): The mobile workspace stays mounted during Host outages. Full type-check and Android landscape keyboard recovery passed on the integration head; iOS Host-down resume passed on the pre-integration head and was not rerun on the merged code.
- Host: #32 session delete failed with 409 "Session scope cannot be changed" on every client; [#37](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/37) removes the session transcript on delete. Transcripts from earlier deletions are not cleaned up retroactively.
- Plus #8 broker ownership after `/btw` promotion and worker replacement, and #29 plugin settings overlap at portrait width.

## Open PRs (GitHub snapshot, 2026-11-19 UTC)

Recheck GitHub before picking up a PR; these states can change.

| PR | State and next step |
| --- | --- |
| [#27](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/27) Windows Electron readiness shutdown race | Open, mergeable. The earlier head passed 10 native Windows launches, review, and full type-check. Approval was given; confirm the gates against current main before merging. |
| [#28](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/28) iOS resume disconnect notice | Superseded by merged [#35](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/35); close if still open. |
| [#33](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/33) Terminal input lost before reattach | Open, conflicts with main. See the Web/PWA wrap-up for the remaining checks. |
| [#34](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/34) Removing a composer image submits the draft | Open, mergeable. The iOS simulator retest passed before the latest merge from main, and review reported no issues. Confirm the gates on the current head. |
| [#38](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/38) Record plugin layout verification | Open, conflicts with main. Docs-only follow-up to #29. The Add plugin search placeholder still clips at 393 CSS px. |
| [#41](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/41) Pair from links opened outside the mobile app | Open draft, conflicts with main. Finish verification of the confirmation flow before making the PR ready. |

## Late additions (iOS round 3)
- [#34](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/34): Removing an attached composer image sent the draft because the remove button defaulted to submit. The open fix was verified in the iOS simulator: the draft stayed and no send request fired.
- [#36](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/36): The Android welcome screen at 200% font size now scrolls instead of clipping. Retested in the Android emulator and merged.
- Not fixed yet: a 9.3 MiB text file opens to a blank preview on iOS, though edit mode shows the content.
- Not fixed yet: a Host pairing link opened from Safari launches the app but doesn't pair, because there is no `connect` deep-link route. The fix in draft [#41](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/41) asks for confirmation before switching hosts.
- Clean on iOS: saved hosts, projects, light/dark mode. At the largest Dynamic Type everything fits, but webview text stays at 30px, so the iOS webview may not be scaling text. Back-swipe gestures can't be tested on the simulator.

## Android round 3
- Native debug APK on the Android 15 (API 35, x86_64) emulator, with an isolated Host Gateway reached through `10.0.2.2`. On main `3700c28a2`, hardware Back from the README diff returned to the Changes list; a second Back closed the workspace drawer. The focused tests passed 11/11.
- On #35 at `51cd8e862`, stopping the Host with the landscape software keyboard open showed the reconnect banner without obscuring the terminal quick keys. The terminal view and keyboard stayed open; after restarting the Host, the banner cleared and a new shell command produced output without relaunching the app. The two focused test files passed 26/26.
- Gemini 3.5 Flash Lite streamed and completed a reply over the native chat path. Bash prompted for approval: **Deny** left the denied marker absent, and **Allow once** created only the approved marker with the expected contents. A pending approval was still actionable after the emulator and app relaunched. Devin SWE 2 returned repeated upstream HTTP 503 responses during the Android tool-call attempt and was not verified. No Android product bug was isolated in these flows.
- Local screenshots under `/home/ubuntu/ohpi-android-evidence/`: `main-3700c28-git-{diff,hardware-back,workspace-closed}.png`, `pr35-landscape-{online,reconnecting,recovered}.png`, and `round3-gemini-{streaming,completed,approval,denied,approval-after-relaunch,granted}.png`.

## Web/PWA wrap-up
- [#33](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/33) terminal reconnect input: branch `devin/1795102582-terminal-reconnect-input`, head `c06d668ce`. Both review fixes are pushed. [Browser retest on the earlier head](https://app.devin.ai/sessions/31f6db2a2b134fb484b27dec36b4d375?testRecording=f1b0a9ff-98e0-4425-8685-f3af50ded46c) passed; update against main, clear review, and rerun full type-check and the desktop and mobile browser tests.
- Unconfirmed: Files search hung or showed no results once with two tabs. Reproduce with the target file visible in the active workspace tree before treating it as a bug.
- Clean: desktop installed PWA launch and reload, git and files smoke tests on desktop and mobile, settings persistence and offline recovery, fixture chat streaming/reload and provider-outage recovery, cross-tab create/archive/restore, and desktop and mobile web terminal replay.
- Not verified: actual mobile PWA install, fallback for a removed or disabled model, mobile terminal clipboard, background project-action stop.

## Known bugs not yet fixed
- draw.io: undo restores the graph but still shows the unsaved prompt (the embed rewrites the XML).

## Tested clean
- Android round 2: git ops, terminal scrollback, all 28 settings pages, session rename/search/relaunch.
- iOS round 2: git, terminal, settings, sessions, expired-bearer renewal.
- Linux AppImage: native folder chooser, Chats Retry.
- `PIDFD_UNAVAILABLE` in the broad suite comes from the archived m0 probe only. The production cleanup path passes 27/27 on Ubuntu 22.04.
- The mobile prompt fragment after resize is normal bash redraw (it reproduces in plain tmux). Not a bug.

## Not covered yet (next steps)
1. Merge the open PRs above, gated as described, then confirm main's full type-check is green.
2. Electron packaged builds: installer, auto-updater, and the chooser on macOS and Windows. Mini-chat mouse-menu Undo/Redo.
3. Actual mobile PWA installation, removed or disabled model fallback, the unconfirmed multi-tab Files search, and terminal clipboard paste and background project-action Stop after reconnect.
4. iOS airplane mode (only a blocked route was tested).
5. Real provider-backed chat on the other surfaces. Retry Devin SWE 2 on Android once the upstream is available.
6. M7 cross-platform release acceptance (`.workflow/specs/m7-release-verification.md`) has not been done. Nothing above counts as release sign-off.
