# OpenChamber Mobile

This package owns the Capacitor native shells (iOS and Android) for the dedicated OpenChamber mobile web surface.

The mobile package reuses the web build, then rewrites `mobile.html` to `index.html` in `packages/mobile/dist` so native iOS/Android always launch `MobileApp` instead of the hosted surface selector.

### Migration status

In OhPiChamber, the Mobile Capacitor shell is retained under `SCOPE-2.4` in `.workflow/omp-migration/scope.md`. It currently connects to the inherited remote host and OpenCode-backed UI, not an implemented Canonical API. The target consumes canonical records and events through the Host Gateway according to the migration contracts. Mobile embeds neither the host server nor the agent runtime. Guest iframe support is planned for M5 under `SCOPE-16.0`, without local background child processes.

## Runtime Model

- The native app bundles the mobile UI only; it does not embed the OpenChamber web server or agent runtime.
- On first launch in Capacitor, the app shows a connection screen for an existing OpenChamber server.
- Connections are saved locally in the app and can be managed from `Instances` in the sessions drawer footer (a persistent left sidebar on tablets).
- The connection screen and the `Instances` entry are Capacitor-only. Hosted `mobile.html` in a normal browser keeps the regular web behavior.
- Phones and tablets share one navigation model: a sessions drawer/sidebar on the left, the workspace drawer (Changes / Files / Terminal / Notes / MCP) on the right, and no overflow menu. Tablets differ only in that the sessions list is a resizable persistent sidebar and the header dropdowns are anchored popovers.
- The tablet layout is a live size class (`useTabletLayout`), not a device check: any surface whose short side is at least 600px gets it, and the workspace only becomes a side panel where the width can host the sidebar, the panel and a readable chat at once. Book foldables therefore pick it up when unfolded, keep the portrait layout in both orientations (their long side is barely wider than a tablet's short one), and drop back to the phone layout when folded shut. The Android activity declares the matching `configChanges`, so folding resizes the WebView instead of recreating it.
- Password-protected OpenChamber servers can be unlocked from the mobile app. The app stores the issued client token with the saved connection.
- The Terminal workspace surface runs its PTY on the active OpenChamber server over the shared authenticated runtime transport; it never opens a local shell on the phone or tablet. Closing the surface detaches the renderer while the server session remains available for reattachment. On touch devices, dragging scrolls the buffer while long-pressing and dragging selects terminal text.
- Downloads (file viewer, saved message images) open the native share sheet instead of a browser download, because a WebView has no download manager. iOS uses the Web Share API; Android WebView lacks it, so Android goes through the app-local `FileShare` plugin (`android/app/src/main/java/com/openchamber/app/FileSharePlugin.java`, registered in `MainActivity`), which writes the file to the cache directory and shares it through the manifest's `FileProvider`. The shared helper is `packages/ui/src/lib/nativeFileShare.ts`.
- Image paste on Android goes through the input method, not the page. The IME reads the content types the focused editor declares in `EditorInfo.contentMimeTypes` and refuses an image paste when it finds none, which is why Gboard answers "image paste is not supported here" in a WebView and no paste event ever fires. `android/app/src/main/java/com/openchamber/app/OpenChamberWebView.java` declares image content and hands whatever the IME commits to the page as an `openchamber-native-image-paste` window event; `packages/ui/src/lib/nativeImagePaste.ts` turns that into a file and the composer attaches it the same way it attaches a pasted image. `MainActivity.load()` inflates that WebView in place of Capacitor's own, which is what makes the declaration take effect. The WebView is a single input connection for every editable element, so `ImagePastePlugin` narrows the declaration to the composer on focus and blur, and asks the IME to read it again when the composer takes focus, since the IME reads it at focus time and that can be before the report arrives. The media type comes from the bytes rather than from the clipboard description. Gboard is the only input method confirmed to insert content this way, and Android Chrome refuses the same paste, so a hosted mobile page still cannot do it.
- The Changes workspace has a top-level Changes / Branch / Commit / Pull Requests selector. Checkout, Sync, staging, and commit controls appear only under Changes. Comparisons show a read-only file list that opens one diff at a time. Their shared source pickers use bottom sheets on phones and anchored popovers on tablets. Commit lists the latest 50 commits of the checked-out branch. Pull Requests shows the published GitHub diff, excluding local edits and unpushed commits, with search and an explicit refresh action. Closing the workspace preserves the current detail and suspends comparison reads; changing repository or instance resets navigation, and a new file link from chat opens the working-tree diff.

## Commands

Run these from `packages/mobile`, or use the root `mobile:*` aliases.

- `bun run build`: builds `packages/web` and prepares mobile web assets.
- `bun run build:assets`: prepares mobile assets from an existing `packages/web/dist` build; the root workspace build uses this to avoid rebuilding web.
- `bun run sync`: prepares assets and runs `cap sync`.
- `bun run add:ios`: creates the native iOS project.
- `bun run add:android`: creates the native Android project.
- `bun run build:android:debug`: builds a debug Android APK without launching an emulator.
- `bun run build:ios:simulator`: builds an iOS Simulator app without launching Xcode or Simulator.
- `bun run sim:run`: boots a simulator if needed, installs the built iOS app, and launches it.
- `bun run sim:dev`: one-command dev loop. Builds the simulator app, installs and launches it, starts the `serve-sim` stream, and prints the preview URL; Ctrl+C stops the stream. Pass `--no-build` to skip the build step.
- `bun run sim:serve`: starts `serve-sim` in detached JSON mode and prints the browser preview URL.
- `bun run sim:list`: lists running `serve-sim` streams.
- `bun run sim:kill`: stops running `serve-sim` streams.
- `bun run open:ios`: opens the iOS project.
- `bun run open:android`: opens the Android project.

## Headless Quickstart

```sh
bun run build
bun run sync
bun run build:ios:simulator
bun run build:android:debug
```

These commands build and sync the native projects without launching Xcode, Android Studio, Simulator, or an emulator.

## iOS Simulator control and streaming

`serve-sim` captures a booted Apple Simulator framebuffer, serves a browser preview,
and exposes taps, text entry, gestures, hardware buttons, rotation, memory warnings,
permissions, camera injection and accessibility inspection without opening Xcode.
It requires a macOS host, Xcode with Simulator support, Node 18+ and a simulator
bootable through `xcrun simctl`. Set `DEVELOPER_DIR` as described below if
`xcode-select` points at Command Line Tools.

Use the [existing simulator commands](#commands) in order: build the simulator app,
then `sim:run` to boot/install/launch, then `sim:serve` for the detached stream.
The root `mobile:*` aliases run the same discrete steps. `sim:dev` combines the
loop and stops its stream on Ctrl+C.

Consume JSON rather than parsing human output. Surface the returned JSON `url`;
it is the only authoritative stream address. Do not guess a preview port or URL.
When finished, use `sim:kill` to stop helpers unless the user asked to keep them
running; stop only processes started for this work. Completion means the app
launched, the returned URL was surfaced, requested interactions were verified,
and helpers were stopped or intentionally left running.

### Manual controls

Run direct CLI commands from `packages/mobile`, where the binary lives. Plain
`serve-sim` inside `with-mobile-env.mjs` from elsewhere fails with command not found.

```sh
bunx serve-sim tap 0.5 0.5
bunx serve-sim type "hello"
bunx serve-sim button home
bunx serve-sim rotate portrait
bunx serve-sim --list -q
```

Coordinates are normalized `0..1`, not pixels. Use `tap` for simple taps;
separate `gesture` begin/end calls can register as a long press. For accessibility
inspection, request `/ax` from the running stream's returned address rather than
assuming `localhost:3100`. If lookup cannot identify a target, report the missing
target instead of guessing coordinates.


## Local Tooling

The default scripts assume the local Homebrew/Xcode paths prepared for this workspace:

- Xcode: `/Applications/Xcode.app/Contents/Developer`
- JDK 21: `/opt/homebrew/opt/openjdk@21`
- Android SDK: `/opt/homebrew/share/android-commandlinetools`

Override `DEVELOPER_DIR`, `JAVA_HOME`, `ANDROID_HOME`, or `ANDROID_SDK_ROOT` when using a different local setup.

Required local tools:

- Xcode with iOS Simulator support.
- CocoaPods for iOS dependency installation.
- JDK 21 for Android Gradle builds.
- Android SDK command-line tools with platform/build-tools 35.

## Troubleshooting

- If `xcodebuild` reports that the active developer directory is Command Line Tools, keep using the provided scripts or set `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`.
- If Android builds fail with `Unable to locate a Java Runtime` or `source release: 21`, install/use JDK 21 and set `JAVA_HOME` accordingly.
- If Android SDK packages are missing, install `platform-tools`, `platforms;android-35`, and `build-tools;35.0.0`, then accept SDK licenses.
- If CocoaPods cannot find Capacitor pods after reinstalling dependencies, run `bun install` from the workspace root, then rerun `bun run sync`.
- If connecting to a remote OpenChamber server fails from the app while `/health` works in curl, check that the server build includes the packaged-client CORS allowlist for `capacitor://localhost` and local dev origins.
- If `serve-sim` preview says the stream is not producing frames, check the raw MJPEG stream before assuming the simulator stopped. In prior testing the raw stream worked while the browser preview UI stayed stale.

## Generated Assets

The native projects currently use Capacitor-generated launcher and splash assets. Replace them before release branding work.
