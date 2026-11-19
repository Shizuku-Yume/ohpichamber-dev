# OhPiChamber bug hunt: handoff (2026-11-19)

The state of the post-audit bug hunt on `Shizuku-Yume/ohpichamber-dev`, so a new agent can clone the repo and pick up where this left off.

## Ground rules learned
- Toolchain: Bun 1.4.4 exactly, and Node 24.14+. Windows Electron needs the exact pinned Bun version.
- Dev: `bun run dev`. Linux defaults are Vite/HMR on 5180 and the Host API on 3902. For concurrent worktrees, assign distinct `OPENCHAMBER_HMR_UI_PORT` and `OPENCHAMBER_HMR_API_PORT` values per worktree. The first web load can sit blank for about 60s while Vite optimizes dependencies.
- Before calling a PR ready, run full `bun run type-check` on the PR head merged with current main. The upstream-drift guard fails if an upstream-tracked file changes without a row in `.workflow/upstream-deltas.tsv` with a matching heading in `.workflow/decisions.md` when the row cites a decision. Record lasting verification and remaining gaps in `.workflow/development.md`. Main went red twice from this (after #11/#13 and after #15).
- The repo has no CI beyond Devin Review. Gate merges on a clean review, full type-check, and a native or browser retest recording.
- Merge with merge commits.
- iOS simulator builds have to be ad-hoc signed (PR #17), or Keychain fails with -34018. On macOS, run `bun run mobile:sync` before simulator builds.
- Production-style web testing: run `bun run build:web`, then `bun run profile:serve --root <fresh-temp-dir> --fresh --port <host-port> --fixture-port <fixture-port>` in disposable state.
- Use isolated HOME, `OPENCHAMBER_DATA_DIR` and `OPENCHAMBER_DESKTOP_USER_DATA_DIR` for testing. Seed only settings/provider configuration into fresh Host state, not an old Host SQLite database or its session/admission/archive rows. Keep the native OMP storage path explicit: fresh Host metadata does not imply fresh native storage.
- For investigation runs, set `OPENCHAMBER_AGENT_DIAGNOSTICS_LEVEL=info`. This enables Agent Service diagnostics, not a general Host HTTP request log; no general Host HTTP request-log switch exists.
- Real-provider tests use the test secrets `OHPI_TEST_MODEL_BASE_URL` and `OHPI_TEST_MODEL_API_KEY`; never record their values. Only `devin-swe-2` and `gemini-3.5-flash-lite` are allowed. Linux Web verification is recorded below; Android Gemini verification remains recorded separately.

## Merged into main (since the audit, PR #3)
- Electron: #1 ESM `__dirname` startup crash, #4 OMP Bun-mode readiness, #6 old-glibc pidfd cleanup, #7 Linux Add-project label, #9 Windows Vite left running after exit, #10 worktree/project/draft lost on restart, #12 native Undo/Redo hitting the wrong editor (it autosaved a file revert), #22 Chats Retry couldn't clear a scoped discovery error.
- Web/PWA: #5 mobile file search showed a false "No files found" and now has an error state with Retry, #14 confirm before closing a dirty file tab, #23 mobile editor back arrow dropped drafts, #24 save recreated a file renamed outside the app (now 409), #25 terminal history scrambled after resize and reload, #26 file tab switch silently dropped a dirty draft.
- Mobile: #11 `ohpichamber://` pairing-link paste, #13 passwordless Host bearer auth (agent calls returned 401), #15 voice-key save reported failure, #16 Android Back in the Files viewer, #17 iOS sim ad-hoc signing, #18 drift ledger for mobile tests, #19 iOS malformed pairing link feedback, #20 Android status bar contrast, #21 empty Voice row, [#31](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/31) terminal rows above the Android landscape keyboard, [#36](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/36) scrollable Android welcome at 200% font size.
- [#30](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/30): Retested Android Git diff hardware Back on main; see Android round 3 below.
- [#33](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/33): Preserve terminal input typed before reattachment; includes review fixes and the drift ledger for terminal regression tests.
- [#34](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/34): Removing an attached composer image no longer submits the draft; the iOS simulator retest kept the draft and sent no run/session-create request.
- [#35](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/35): The mobile workspace stays mounted during Host outages. Full type-check and Android landscape keyboard recovery passed on the integration head; iOS Host-down resume passed on the pre-integration head and was not rerun on the merged code.
- [#40](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/40): Windows readiness shutdown descendant cleanup; Linux full type-check and focused Agent Service/Electron cleanup tests passed, with Windows-only tests skipped on Linux.
- [#41](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/41): Confirm external mobile pairing links before connecting; launch-URL-only and event-before-launch-response fixtures each confirm once. Native iOS cold-launch delivery remains unverified.
- [#43](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/43): Open Git Settings after repository-dialog dismissal, correct Commit accessible labels, and refresh the composer's dirty warning after a successful commit.
- [#45](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/45): Show sanitized provider failure details in chat and after reload; remember resolved custom-header values as well as API keys for redaction.
- [#47](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/47): Refresh an already-open draft's dirty warning on shared working-tree status updates, including unstaged editor saves, without new polling.
- [#48](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/48): Fix iOS large-file preview opening blank while edit mode could display the content.
- Host: #32 session delete failed with 409 "Session scope cannot be changed" on every client; [#37](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/37) removes the session transcript on delete. Transcripts from earlier deletions are not cleaned up retroactively.
- Plus #8 broker ownership after `/btw` promotion and worker replacement, and #29 plugin settings overlap at portrait width.
- [#27](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/27): Windows Electron readiness shutdown race fix.
- [#38](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/38): Record plugin layout verification, with the evidence linked from PR #29 rather than dead-VM screenshot paths.
- [#42](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/42): Refresh the earlier bug-hunt handoff and record the merged session-transcript deletion fix.

## PR queue (2026-11-19)

All fixes listed above are merged, including [#50](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/50), the daemon broker private-field receiver fix. [#28](https://github.com/Shizuku-Yume/ohpichamber-dev/pull/28), the iOS resume disconnect notice, is closed as superseded by #35. This records the maintainer's latest status; recheck GitHub before starting a new PR follow-up.

## iOS round 3 observations
- Fixed by merged #48: a 9.3 MiB text file opened to a blank preview on iOS, though edit mode showed the content.
- Clean on iOS: saved hosts, projects, light/dark mode. At the largest Dynamic Type everything fits, but webview text stays at 30px, so the iOS webview may not be scaling text. Back-swipe gestures can't be tested on the simulator.

## Android round 3
- Native debug APK on the Android 15 (API 35, x86_64) emulator, with an isolated Host Gateway reached through `10.0.2.2`. On main `3700c28a2`, hardware Back from the README diff returned to the Changes list; a second Back closed the workspace drawer. The focused tests passed 11/11.
- On #35 at `51cd8e862`, stopping the Host with the landscape software keyboard open showed the reconnect banner without obscuring the terminal quick keys. The terminal view and keyboard stayed open; after restarting the Host, the banner cleared and a new shell command produced output without relaunching the app. The two focused test files passed 26/26.
- Gemini 3.5 Flash Lite streamed and completed a reply over the native chat path. Bash prompted for approval: **Deny** left the denied marker absent, and **Allow once** created only the approved marker with the expected contents. A pending approval was still actionable after the emulator and app relaunched. Devin SWE 2 returned repeated upstream HTTP 503 responses during the Android tool-call attempt and was not verified. No Android product bug was isolated in these flows.
- Local screenshots under `/home/ubuntu/ohpi-android-evidence/`: `main-3700c28-git-{diff,hardware-back,workspace-closed}.png`, `pr35-landscape-{online,reconnecting,recovered}.png`, and `round3-gemini-{streaming,completed,approval,denied,approval-after-relaunch,granted}.png`.

## Web/PWA wrap-up
- #33's [browser retest on an earlier head](https://app.devin.ai/sessions/31f6db2a2b134fb484b27dec36b4d375?testRecording=f1b0a9ff-98e0-4425-8685-f3af50ded46c) passed; the fix and its later main integrations are now merged.
- Real-provider Linux Web chat is verified with both `devin-swe-2` and `gemini-3.5-flash-lite`: streaming, multi-turn conversation, model switching, tool-driven file editing with Git diff, Stop and reload. Gemini image handling and invalid-key HTTP 401 detail display, including after reload, are also verified. These are Linux Web results, not certification of the same flows on Electron, iOS or Android.
- Unconfirmed: Files search hung or showed no results once with two tabs. Reproduce with the target file visible in the active workspace tree before treating it as a bug.
- Clean: desktop installed PWA launch and reload, git and files smoke tests on desktop and mobile, settings persistence and offline recovery, fixture chat streaming/reload and provider-outage recovery, cross-tab create/archive/restore, and desktop and mobile web terminal replay.
- Not verified: actual mobile PWA install, fallback for a removed or disabled model, mobile terminal clipboard, background project-action stop.

## Open investigation and verification gaps
- **Native admission fence — parked unless it recurs:** Once on Linux Web after the invalid-key flow, new-session creation failed with `A prior native session admission requires recovery before another admission`; a pending `create` row was found, but the original failing request was not logged. Two capped Linux Web attempts on main `fcbf5233f`, with `OPENCHAMBER_AGENT_DIAGNOSTICS_LEVEL=info` and fresh Host DBs, followed invalid-key 401 → reload → valid key → new-session send and did not reproduce it; the admissions table was empty both times. Earlier real-worker probes on main and #45 also completed that flow without leaving admissions. The only demonstrated reproduction deliberately loses a successful create response in the harness, on both main and #45. Current-process uncertain admissions deliberately remain fenced; prior-process create recovery requires a complete native listing, while fork/reopen uncertainty remains fenced. The mechanism predates #45, but the initiating event remains unknown: neither a #45 regression nor a fresh-metadata setup artifact is established. There is no general Host HTTP request-log switch, and `host_session_admissions` has no timestamp column, limiting retrospective diagnosis. Stop chasing unless it recurs; then capture the first failed create/prepare/reopen request, the pending row's operation/root/workspace, active metadata path and Host/Agent Service logs before replacing isolated state. Do not delete rows to bypass the fence. Harness evidence: `/home/ubuntu/admission-investigation/README.md`.
- **OMP daemon warning — fixed in #50:** `Daemon broker list failed ... Cannot access invalid private field (this.#sessionChangeCallbacks)` came from our named-service ToolSession using `Object.create(nativeSession)`: inherited methods ran on a wrapper without the native private-field receiver. #50 binds session-change registration and launch-completion delivery to the actual native session. The native regression covers empty real-broker listing without the warning and late completion delivery; browser retesting remains open. No causal connection to the provider error or admission fence is established.
- **Startup GitHub 403 — environment artifact, no fix:** The Devin VM's `gh` shim at `/opt/.devin/package/custom_binaries/gh` returns an integration token even with an isolated HOME and no GitHub sign-in. Startup auth refresh → `/api/source-control/github/auth/status` → `github/accounts.js` `userSummary()` → Octokit `users.getAuthenticated()` probes that credential, which GitHub rejects with `403 Resource not accessible by integration`. Production already reports signed-out for this no-saved-account case. A fresh-metadata probe with no CLI token makes no `/user` request; this is not an unauthenticated Octokit call or an open product bug.
- **Low-priority isolated-root observations:** Background prepared-session cleanup sometimes reports 409 `The session is being deleted` or 403/404, and stale-workspace resolution errors were seen after switching isolated roots. These are unconfirmed, likely test-setup artifacts, not established product defects; keep them low priority unless they recur in a stable setup.
- **Provider-echoed secrets:** Redaction of echoed API keys and custom request-header secrets is covered by native tests, not a browser/external-provider echo retest. Successful 401 display after reload is not evidence for this separate security case.
- **iOS pairing cold launch:** Launch-URL-only delivery and event-before-launch-response deduplication have fixture coverage. Native cold-launch delivery from a pairing link has not been verified on an iOS simulator or device.
- **Concurrent-worktree setup:** Use distinct `OPENCHAMBER_HMR_UI_PORT` / `OPENCHAMBER_HMR_API_PORT` pairs and seed only settings/provider configuration into fresh Host state, as described in the ground rules. Preserve the failing run's isolated metadata and logs when investigating the fence rather than replacing them before collecting evidence.

## Known bugs not yet fixed
- draw.io: undo restores the graph but still shows the unsaved prompt (the embed rewrites the XML).
- Add plugin: the search placeholder still clips at 393 CSS px; #38 records layout verification, not a fix for this remaining clipping.

## Tested clean
- Android round 2: git ops, terminal scrollback, all 28 settings pages, session rename/search/relaunch.
- iOS round 2: git, terminal, settings, sessions, expired-bearer renewal.
- Linux AppImage: native folder chooser, Chats Retry.
- `PIDFD_UNAVAILABLE` in the broad suite comes from the archived m0 probe only. The production cleanup path passes 27/27 on Ubuntu 22.04.
- The mobile prompt fragment after resize is normal bash redraw (it reproduces in plain tmux). Not a bug.

## Not covered yet (next steps)
1. Browser-retest #50's daemon broker fix; complete the provider-echo redaction and native iOS pairing cold-launch checks above. Resume admission-fence investigation only if it recurs, capturing the first failed create/prepare/reopen. The startup GitHub 403 is an environment artifact, not a fix task.
2. Electron packaged builds: installer, auto-updater, and the chooser on macOS and Windows. Mini-chat mouse-menu Undo/Redo.
3. Actual mobile PWA installation, removed or disabled model fallback, the unconfirmed multi-tab Files search, and terminal clipboard paste and background project-action Stop after reconnect.
4. iOS airplane mode (only a blocked route was tested).
5. Real provider-backed chat on surfaces/flows not covered above. Linux Web now covers both allowed models; retry Devin SWE 2 on Android once the upstream is available.
6. M7 cross-platform release acceptance (`.workflow/specs/m7-release-verification.md`) has not been done. Nothing above counts as release sign-off.
