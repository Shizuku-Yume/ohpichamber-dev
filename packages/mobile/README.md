# OhPiChamber Mobile

This package owns the Capacitor native shells (iOS and Android) for the dedicated OhPiChamber mobile web surface.

The mobile package reuses the web build, then rewrites `mobile.html` to `index.html` in `packages/mobile/dist` so native iOS/Android always launch `MobileApp` instead of the hosted surface selector.

### Migration status

Under `SCOPE-2.4` in `.workflow/omp-migration/scope.md`, the Capacitor shell bundles `MobileApp` on the Canonical Client and connects to a Host Gateway serving `/api/agent/v1` (with fetch-based SSE event streaming and native header-bearing terminal WebSockets). Mobile embeds neither the Host Gateway nor the OMP Agent Service or background child processes. Guest SDK iframes and Guest extension services are not mounted on mobile today (`loadGuestCatalog` marks the mobile surface `unsupported`, leaving Guest panels, actions, and commands web/desktop-only). Physical-device runtime verification—Android APK pairing, canonical chat streaming, reconnects, approvals, and unsigned/ad-hoc iOS IPA artifacts—is owned by M7 (`.workflow/specs/m7-release-verification.md`).

## Runtime Model

- The native app bundles the mobile UI only; it does not embed the OhPiChamber web server or agent runtime.
- On first launch in Capacitor, the app shows a connection screen for an existing OhPiChamber server.
- Connections are saved locally in the app and can be managed from `Instances` in the sessions drawer footer (a persistent left sidebar on tablets).
- If a connected server stops responding, the app keeps the workspace open and shows a reconnect banner. Resume also checks alternate saved transports; an unreachable server alone does not send the user back to the instance picker. The authenticated Host event stream clears the banner when it is ready again.
- The connection screen and the `Instances` entry are Capacitor-only. Hosted `mobile.html` in a normal browser keeps the regular web behavior.
- Phones and tablets share one navigation model: a sessions drawer/sidebar on the left, the workspace drawer (Work status / Changes / Files / Terminal / Notes) on the right, and no overflow menu. Tablets differ only in that the sessions list is a resizable persistent sidebar and the header dropdowns are anchored popovers.
- The tablet layout is a live size class (`useTabletLayout`), not a device check: any surface whose short side is at least 600px gets it. Where the width hosts the sidebar, the workspace panel and a readable chat at once (1000px, landscape), both panels can be open; where it hosts one of them (from 900px: an unfolded iPhone Duo, a 13-inch iPad in portrait), both are side panels but only one is open at a time, and that class keeps the phone's composer. Narrower tablets and near-square book foldables keep the sidebar as a guest and the workspace as a full-cover drawer. Foldables pick the tablet layout up when unfolded and drop back to the phone layout when folded shut. The Android activity declares the matching `configChanges`, so folding resizes the WebView instead of recreating it. The soft keyboard shrinks the Android layout viewport while it is up, so the short side is judged with the height it took added back: without that, typing on an unfolded foldable would drop to the phone layout mid-keystroke, remount the surface holding the focused field and close the keyboard.
- Password-protected OhPiChamber servers can be unlocked from the mobile app. The app stores the issued client token with the saved connection.
- **Additional headers** in Connect by address and the Instances add/edit form accepts proxy headers. Values use native secure storage and apply only to the entered address, including connection checks, password sign-in, HTTP event streams and native terminal WebSockets. Authorization is reserved for the client token. Files images, PDF, audio, video and font previews and prepared chat images load through header-aware HTTP. Files media is buffered up to the existing 10 MiB file-open limit, with a 30-second read deadline. HTML previews and inline Markdown video still use browser URLs and can fail behind a header-protected proxy.
- The Terminal workspace surface runs its PTY on the active OhPiChamber server over the shared authenticated runtime transport; it never opens a local shell on the phone or tablet. Closing the surface detaches the renderer while the server session remains available for reattachment. On touch devices, dragging scrolls the buffer while long-pressing and dragging selects terminal text. The terminal toolbar's Paste button reads the clipboard: iOS through the web Clipboard API, which shows the system Paste bubble first; Android through the app-local `ClipboardText` plugin (`android/app/src/main/java/dev/ohpichamber/app/ClipboardTextPlugin.java`, registered in `MainActivity`), because Android WebView rejects `navigator.clipboard.readText()` and has no prompt to grant it.
- iOS 18 and later offer a "New OhPiChamber Session" action in Shortcuts and Siri (`ios/App/App/OpenChamberAppShortcuts.swift`). It takes an optional project and an optional message: it opens the app on a new session draft in that project, or where the user last worked, and sends the message as the first one once the project's models and agents are loaded. The project picker lists the projects the app last wrote into the widget snapshot (`packages/ui/src/apps/mobileWidgetSnapshot.ts`); a project the connected server no longer has opens an unsent draft with the message in the composer. A push from another server resets the snapshot to that server, which leaves the picker empty until the app is opened again. A draft whose composer already holds text, files or attached context gets the message appended and sends nothing. The request reaches the page through the app-local `ShortcutRequests` plugin (`ShortcutRequests.swift`), never through an `ohpichamber://` link, because any app or web page can open a link and a link must not send a prompt.
- Downloads (file viewer, saved message images) open the native share sheet instead of a browser download, because a WebView has no download manager. iOS uses the Web Share API; Android WebView lacks it, so Android goes through the app-local `FileShare` plugin (`android/app/src/main/java/dev/ohpichamber/app/FileSharePlugin.java`, registered in `MainActivity`), which writes the file to the cache directory and shares it through the manifest's `FileProvider`. The shared helper is `packages/ui/src/lib/nativeFileShare.ts`.
- Image paste on Android goes through the input method, not the page. The IME reads the content types the focused editor declares in `EditorInfo.contentMimeTypes` and refuses an image paste when it finds none, which is why Gboard answers "image paste is not supported here" in a WebView and no paste event ever fires. `android/app/src/main/java/dev/ohpichamber/app/OpenChamberWebView.java` declares image content and hands whatever the IME commits to the page as an `openchamber-native-image-paste` window event; `packages/ui/src/lib/nativeImagePaste.ts` turns that into a file and the composer attaches it the same way it attaches a pasted image. `MainActivity.load()` inflates that WebView in place of Capacitor's own, which is what makes the declaration take effect. The WebView is a single input connection for every editable element, so `ImagePastePlugin` narrows the declaration to the composer on focus and blur, and asks the IME to read it again when the composer takes focus, since the IME reads it at focus time and that can be before the report arrives. The media type comes from the bytes rather than from the clipboard description. Gboard is the only input method confirmed to insert content this way, and Android Chrome refuses the same paste, so a hosted mobile page still cannot do it.
- The Changes workspace has a top-level Changes / Branch / Commit / Pull Requests selector. Checkout, Sync, staging, and commit controls appear only under Changes. Comparisons show a read-only file list that opens one diff at a time. Their shared source pickers use bottom sheets on phones and anchored popovers on tablets. Commit lists the latest 50 commits of the checked-out branch. Pull Requests shows the published GitHub diff, excluding local edits and unpushed commits, with search and an explicit refresh action. Closing the workspace preserves the current detail and suspends comparison reads; changing repository or instance resets navigation, and a new file link from chat opens the working-tree diff.

Android read-aloud requests transient audio focus through the app-local `ReadingAudioFocus` plugin before playback. Manual readings, automatic readings, and Settings voice previews use the same focus lease. Other media is asked to pause; whether it does depends on that player. Transient focus loss, including MAY_DUCK, pauses playback and resumes from the same position when focus returns. Permanent loss stops playback. Existing playback keeps its lease when the user switches apps. Completion, stop, errors, and native teardown release it. No background playback service is added.

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

`scripts/with-mobile-env.mjs` resolves toolchain paths per platform, with explicit `DEVELOPER_DIR`, `JAVA_HOME`, `ANDROID_HOME`, and `ANDROID_SDK_ROOT` environment variables always taking precedence:

- **macOS (`darwin`)**:
  - `DEVELOPER_DIR`: `$DEVELOPER_DIR` → `xcode-select -p` → `/Applications/Xcode.app/Contents/Developer`
  - `JAVA_HOME`: `$JAVA_HOME` → Homebrew OpenJDK 21 (`/opt/homebrew/opt/openjdk@21`, or `/usr/local/opt/openjdk@21` if installed)
  - `ANDROID_HOME` / `ANDROID_SDK_ROOT`: `$ANDROID_HOME` → `$ANDROID_SDK_ROOT` → Homebrew `/opt/homebrew/share/android-commandlinetools` (or `~/Library/Android/sdk` if present)
- **Linux (`linux`)**:
  - `DEVELOPER_DIR`: left unset unless explicitly provided (iOS builds and Simulator require macOS with Xcode)
  - `JAVA_HOME`: `$JAVA_HOME` → first existing JDK 21 directory under `/usr/lib/jvm` (`java-21-openjdk-amd64`, `java-21-openjdk-arm64`, `java-21-openjdk`, `temurin-21-jdk*`, `zulu-21`, `jdk-21`) or Linuxbrew; left unset if none exists so `java` on `PATH` or the caller's environment applies
  - `ANDROID_HOME` / `ANDROID_SDK_ROOT`: `$ANDROID_HOME` → `$ANDROID_SDK_ROOT` → first existing SDK directory (`~/Android/Sdk`, `~/Android/sdk`, `/opt/android-sdk`, `/usr/lib/android-sdk`, or Linuxbrew); left unset if none exists
- **`PATH`**: prepends `$JAVA_HOME/bin` and `$ANDROID_HOME/platform-tools` when resolved.

Required local tools:

- JDK 21 for Android Gradle builds (Linux and macOS).
- Android SDK command-line tools with platform/build-tools 35 (Linux and macOS).
- Xcode with iOS Simulator support and CocoaPods for iOS builds (macOS only).

## Cloudflare Access setup

This setup uses a named Cloudflare Tunnel, a hostname such as `oc.example.com`, and an Access service token. It supports HTTP requests, streamed chat updates, terminal WebSockets, Files media previews and prepared chat images in the native iOS and Android apps. HTML previews and inline Markdown video still require browser access without custom headers.

1. In **Zero Trust → Access controls → Service credentials → Service tokens**, create a service token and save its Client ID and Client Secret.
2. In **Access controls → Applications**, add a self-hosted application for `oc.example.com`, with no path restriction. Add a policy with **Action: Service Auth**, **Include: Service Token**, and select the token from step 1.
3. In the tunnel's published application routes, map `oc.example.com` to the OhPiChamber server, for example `http://127.0.0.1:3000` when both run on the same machine. Use the server's actual listening port.
4. In the Access application's **Advanced settings → CORS settings**, configure Cloudflare to answer preflight requests:
   - Allowed origins: `capacitor://localhost` and `https://localhost`.
   - Allow credentials: enabled.
   - Allowed methods: `GET, POST, PUT, PATCH, DELETE, OPTIONS`.
   - **Bypass OPTIONS requests to origin**: off.
   - Allowed headers: all names in the following list.

   ```text
   Content-Type
   Authorization
   Accept
   X-Requested-With
   Cache-Control
   Last-Event-ID
   X-OpenChamber-Directory
   X-OpenChamber-Directory-Encoding
   Ngrok-Skip-Browser-Warning
   X-OpenChamber-Surface
   X-OpenChamber-Provider
   X-OpenChamber-Model
   CF-Access-Client-Id
   CF-Access-Client-Secret
   ```

5. In the mobile app, select **Connect by address**, enter `https://oc.example.com`, and add `CF-Access-Client-Id` and `CF-Access-Client-Secret` under **Additional headers**. Enter their corresponding service-token values. Leave Client token empty for password sign-in, then enter the OhPiChamber password when asked. Use the final HTTPS address. Requests with custom headers refuse redirects so proxy credentials cannot reach a different address.

The Service Auth policy still protects actual requests. Preflight requests contain header names but no service-token values, so Access must answer them before the app can send authenticated HTTP requests. Without this configuration, native sign-in can succeed while session loading and chat fail.

To check the preflight without sending credentials:

```sh
curl -i -X OPTIONS https://oc.example.com/api/config/settings \
  -H 'Origin: capacitor://localhost' \
  -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: authorization,cf-access-client-id,cf-access-client-secret'
```

Expect a successful response that allows the requested origin and headers. Repeat with `Origin: https://localhost` for Android. A GET to `/health` without service-token headers should still return `403` with this Service Auth policy. Then check streamed chat, terminal input/output and reconnect on the device.

See Cloudflare's [service-token documentation](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/) and [preflight response configuration](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/#configure-response-to-preflight-requests).

## Troubleshooting

- If `xcodebuild` reports that the active developer directory is Command Line Tools, keep using the provided scripts or set `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`.
- If Android builds fail with `Unable to locate a Java Runtime` or `source release: 21`, install/use JDK 21 and set `JAVA_HOME` accordingly.
- If Android SDK packages are missing, install `platform-tools`, `platforms;android-35`, and `build-tools;35.0.0`, then accept SDK licenses.
- If CocoaPods cannot find Capacitor pods after reinstalling dependencies, run `bun install` from the workspace root, then rerun `bun run sync`.
- If connecting to a remote OhPiChamber server fails from the app while `/health` works in curl, check that the server build includes the packaged-client CORS allowlist for `capacitor://localhost` and local dev origins.
- Header-protected proxies must answer CORS preflight requests for `capacitor://localhost` on iOS and `https://localhost` on Android. See [Cloudflare Access setup](#cloudflare-access-setup) for the tested configuration. Native WebSockets reject redirects; enter the final server address in the app.
- If `serve-sim` preview says the stream is not producing frames, check the raw MJPEG stream before assuming the simulator stopped. In prior testing the raw stream worked while the browser preview UI stayed stale.


## Build Targets and Unsigned Installation

### Build Targets

- **Android**: Debug APK (`assembleDebug`), Release APK (`assembleRelease`), and Play Store bundle (`bundleRelease`).
- **iOS**: Simulator bundle (Debug `iphonesimulator` for Apple Silicon) and Release `.ipa` / `.xcarchive`.

### Android APK Installation

Debug and unsigned release APKs can be installed directly without Google Play:

```sh
adb install packages/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

On physical devices, transfer the `.apk` file and enable "Install unknown apps" under **Settings -> Security / Apps**.

### iOS Sideloading (Unsigned / Ad-hoc IPA)

When Apple Developer ID, distribution certificates, or TestFlight credentials are not configured, builds emit unsigned or ad-hoc `.ipa` artifacts. To install an unsigned `.ipa` on a physical iPhone or iPad:

1. **Sideloadly / AltStore / SideStore**: Connect the iOS device to a Mac or PC over USB/Wi-Fi and use Sideloadly or AltServer to install the `.ipa` with a free personal Apple ID.
2. **Xcode Devices Window**: On macOS with Xcode installed, open **Window -> Devices and Simulators**, select the device, and drag `App.ipa` into the **Installed Apps** list.
3. **Device Trust & Developer Mode**:
   - On the iOS device, go to **Settings -> General -> VPN & Device Management**, tap your personal Apple ID developer certificate under Enterprise/Developer App, and select **Trust**.
   - On iOS 16 and later, enable **Settings -> Privacy & Security -> Developer Mode** and reboot when prompted.
## Generated Assets

Launcher icons (Android adaptive, legacy, round and themed layers, `assets/icon-*.png`), the Android notification icon and the iOS Control Center symbol are committed assets from the upstream brand set, not generated by this workspace. The iOS app icon is the desktop's `AppIcon.icon`. Launch splash images are still Capacitor's placeholders.
