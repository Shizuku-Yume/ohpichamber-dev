# Rebrand: OhPiChamber identity, mark and upstream cutoff

**Status:** done
**Priority:** high
**Integration branch:** rebrand/integration

## What this is for

The fork still ships under upstream's identity. Its desktop updater reads `openchamber/openchamber` releases and the CLI update check reads `@openchamber/web`, so an installed fork can update itself into upstream's OpenCode build. It shares app IDs and the `~/.config/openchamber` data directory with upstream, so the two installs overwrite each other. It calls upstream-hosted services (push relay, Linear OAuth broker, changelog API) whose credentials are bound to upstream's app IDs. And it looks like upstream: the name, icon and every UI string say OpenChamber.

This effort gives the fork its own identity before anything is released. Settled choices: `decisions.md` entries dated 2026-11-16 (`Rename what users and the OS see; keep OPENCHAMBER_* variables and private names`, `Cut the fork off from upstream-hosted services`, `First release is 1.0.0 under the ohpichamber package names, stable channel only`, `Rebrand in two phases around the open UX effort`, `The OhPiChamber mark is the upstream cube with an OMP π folded over its front edge`).

## What it does

**Phase A (starts now).**

- **Mark.** Every logo drawing shows the approved mark: upstream's cube with an OMP-proportioned π on its left face, the bar folded over the front edge onto the right face. This covers the macOS Icon Composer document, the no-tile icon (Windows, Linux, PWA, Android, iOS home screen), the in-app one-colour logo (splashes, About, empty states), the glyph (favicon, macOS menu bar and its animation frames, Android notification and themed icon, iOS Control Center), the pixel-art `.ico` sizes, the iOS widget's SwiftUI logo, and the model-picker sprite.
- **Identity.** The packaged app is OhPiChamber everywhere the OS shows it: Electron `appId` `dev.ohpichamber.desktop`, `productName` and `app.setName` `OhPiChamber` (user data in `OhPiChamber/`, dev in `OhPiChamber Dev/`), executable `ohpichamber`, URL scheme `ohpichamber://`. Mobile has app ID `dev.ohpichamber.app` with the widget and notification extensions under it, and display name OhPiChamber. The PWA manifest name and `<title>` change too. The Host's default data directory is `~/.config/ohpichamber`, nothing is migrated from `~/.config/openchamber`, and `OPENCHAMBER_DATA_DIR` still overrides it. Docker uses an `ohpichamber` service and container name and mounts `~/.config/ohpichamber`.
- **Packages and version.** Every release-coupled package is at `1.0.0`. `@openchamber/web` publishes as `ohpichamber` with bin `ohpichamber`, and `@openchamber/sdk` publishes as `ohpichamber-sdk`. Guest imports, examples and SDK docs use the new name. Private workspace packages keep `@openchamber/*`.
- **Updates.** Desktop auto-update reads GitHub Releases of `Shizuku-Yume/ohpichamber` directly. The CLI update check and the `ohpichamber update` command are removed, because both resolve the upstream npm package. The CLI offers no update and shows no version-available notice. (The About-page half of this rule is superseded: `decisions.md: 2026-11-26 - About offers update status and a check-for-updates action`.)
- **Upstream services off.** No code path calls an `openchamber.dev` host. Release notes come from the fork's bundled changelog, with no remote fetch. iOS remote push has no default relay and is unavailable unless a relay URL is configured. Linear OAuth sign-in is shown only when a broker URL is configured. Documentation links point at this repository's docs on GitHub. The R2 mirror script, the `downloads.openchamber.dev` feed and their workflow steps are removed.
- **Single channel.** The canary channel is gone: no Stable | Canary switch in About, no canary icons, build config, notes generator or workflow steps.

**Phase B (after `ux-feedback-2026-11-15` lands on `main`).**

- **Name in copy.** Every user-facing string says OhPiChamber: UI copy in all locales, aria labels, notifications, CLI help and output, README and product docs (`packages/docs`, `docs/`). Exceptions are the About credit "Based on OpenChamber" with upstream's MIT notice, and historical changelog sections.
- **Operator cutover.** The maintainer's operator files in `~/.config/ohpichamber` (`omp-m0-provider.env`, `chats/`) are deleted. From then on that directory is the maintainer's real product data. `standards.md` changes accordingly: dev and test runs still isolate their data, but from the fork's own default directory, and real-provider checks configure the provider through the app.

## How it is built

**Brand pipeline.** Restore upstream's `scripts/brand/generate.mjs`, `raster.mjs`, `generate.test.mjs` and `DOCUMENTATION.md` from `upstream/main`, plus the root `brand:generate` script. Drop the outputs the fork deleted (VS Code webview, OpenCode `static-routes-runtime.js` page) and every canary output. `geometry.mjs` gains the π: glyph rectangles in a 200 × 190 box (bar `0,0,200,42`; left leg `28,42,40,99`; right leg `109,42,41,148`), mapped onto the left face with the right leg spanning the front edge and the bar's overhang folded onto the right face. Each piece is one polygon per face, so no seams show at any zoom. The fold is opaque.

Per drawing:

- **Colour drawings** use the I2 gradients: left `#ffffff → #9fa1a6`, fold `#d6d7da → #85878d`, and a white roof centre on the tiers.
- **One-colour drawings** (in-app logo, glyph) fill the π with `currentColor`. The fold is cut from the face by a 1-unit gap so it reads without shading.
- **Pixel drawings.** The 16–24 px `.ico` cube and the tray templates are redrawn per pixel, with the π reduced to bar and long leg where three strokes do not fit.
- **macOS document.** The π is its own layer, so Clear and Tinted render it as separate glass.

`OpenChamberLogo.tsx` keeps its tier animation. The π is static. `WidgetShared.swift` `CubeLogoView` is updated by hand from the same numbers.

`actool`, `ictool` and `swiftdraw` exist only on macOS with Xcode 26. On Linux the generator writes every other file and leaves `Assets.car`, `icon.icns`, `dev-icon.png` and the Control Center symbol untouched. The macOS release job runs `bun run brand:generate` before packaging, so those files come from the document in CI. Until a macOS run happens, the committed `Assets.car`/`icon.icns` still show the old cube, and the macOS icon stays unverified.

**Identity.** The edits live in `packages/electron/package.json` (build `appId`, `productName`, `executableName`, `protocols`, `publish`) and `entry.mjs` (`setName`, dev user-data folder). `DEEP_LINK_PROTOCOL` and the deep-link parsers in `main.mjs` move to `ohpichamber`, and so does the Linux desktop-entry writer (`linux-package-install.mjs`). Mobile changes in `capacitor.config.json`, `android/app/build.gradle`, `strings.xml` and the Xcode project bundle IDs, extension IDs, display name, app group and keychain group. The Host default root is `packages/web/server/index.js` `OPENCHAMBER_DEFAULT_CONFIG_ROOT`. Docker changes in `Dockerfile` and `docker-compose.yml`. Electron's renderer storage starts empty under the new user-data folder. That is intended: no migration.

**Updates and services.** The `publish` provider becomes `github` with owner `Shizuku-Yume` and repo `ohpichamber`, with no generic mirror feed. `main.mjs` drops the channel argument and the canary feed. The following are removed: `package-manager.js` update check (`UPDATE_CHECK_URL`, dist-tag lookup) and its route and UI; `changelog/update-notes.js` remote fetch; `apns-runtime.js` `DEFAULT_RELAY_URL`; `linear/auth.js` `DEFAULT_LINEAR_BROKER_URL`; `scripts/release-mirror`, `scripts/changelog/canary-notes.mjs`, `scripts/brand/canary.mjs`, `packages/electron/scripts/canary-build-config.mjs`, `resources/icons-canary`, `updateChannel.ts`; and the canary and R2 steps in `.github/workflows/*`. Their docs (`APNS.md`, Linear `DOCUMENTATION.md` and `OAUTH-BROKER-HANDOFF.md`, Electron README release-channel section) change in the same task. A missing relay or broker URL shows the feature as unavailable with the reason. It is never a silent failure.

**Copy (phase B).** One scripted pass replaces the product name in `packages/ui/src/lib/i18n/messages/*` for all 160 files. Each locale keeps its own script and grammar, and the result is reviewed per locale for inflected forms. Non-i18n strings (`index.html`, CLI help, notifications, Electron menus) are edited by hand. The About credit is a new i18n key in every locale. `locale-ui-patterns` governs the copy.

## What it must not do

- Rename `OPENCHAMBER_*` variables, private `@openchamber/*` workspace packages or code identifiers. Every such line becomes a permanent merge conflict with upstream.
- Read, import or migrate anything from `~/.config/openchamber`, `~/.config/OpenChamber` or upstream's renderer storage.
- Keep any `openchamber.dev` default URL "for later". A self-hosted relay or broker is a separate decision.
- Push, tag, publish to npm, or trigger GitHub workflows without explicit maintainer instruction. Release publishing stays with M7.
- Touch UI copy during phase A beyond the strings the canary and update-check removals delete.

## What was considered and rejected

- **Hand-exported icon files.** Exporting each platform file from the approved SVG is faster once. Upstream's generator exists because forty hand-exported files drifted, and the π has to appear in eleven drawings, so a hand pass would repeat that drift.
- **Keep the canary channel with a badge.** It is free to keep the existing switch. But it needs a second release pipeline, feed and icon set, and a single maintainer has no use for it.

## How we will know it works

- **W1 (mark matches the approved master).** `bun run brand:generate --check` and `generate.test.mjs` pass. A script renders the generated no-tile icon and `ohpichamber-icon-i2.svg` at 512 px with `sharp` and compares them; the mean per-pixel difference is under 2%. A contact sheet of every generated drawing at 16, 32, 64 and 512 px, on dark and light, is saved under the effort's artifact directory, and the maintainer approves the small sizes.
- **W2 (packaged desktop identity, real path).** Build the Linux AppImage and launch it with `HOME` pointed at a throwaway directory and no data overrides. The window, the dock entry and the `.desktop` file say OhPiChamber with the new icon. The Host writes `~/.config/ohpichamber/settings.json` and Electron writes `~/.config/OhPiChamber/`, both inside that `HOME`; nothing appears under any `openchamber` path. `xdg-open ohpichamber://host/local` focuses the app. A chat completes through a real provider. The packed `app-update.yml` names `Shizuku-Yume/ohpichamber`.
- **W3 (no upstream endpoints).** `rg -n 'openchamber\.dev|openchamber/openchamber|api\.openchamber' packages scripts .github Dockerfile docker-compose.yml` returns only the About credit, the MIT notice and historical changelog lines. `rg -n -i canary` returns only historical changelog lines.
- **W4 (packages).** `npm pack` produces `ohpichamber-1.0.0.tgz` and `ohpichamber-sdk-1.0.0.tgz`. The first installs into a clean prefix, and `ohpichamber --version` prints `1.0.0`. `ohpichamber serve` starts the Host and the Agent Service, and `/api/agent/v1/ready` returns 200. The hello-kit example builds against `ohpichamber-sdk`.
- **W5 (services off, visible).** In the running app, About shows no channel switch. (The no-update-check-control half of this line is superseded: `decisions.md: 2026-11-26 - About offers update status and a check-for-updates action`.) Linear and iOS push settings show the unavailable state with its reason, and release notes render from the bundled changelog with the network blocked.
- **W6 (mobile build identity).** The Android debug APK builds, and `aapt dump badging` shows `package: name='dev.ohpichamber.app'`, label OhPiChamber and the new adaptive icon. The iOS project's bundle IDs are `dev.ohpichamber.app*` (build only; device checks stay in M7).
- **W7 (copy, phase B).** A script over the built locale catalogs finds no `OpenChamber` outside the About credit key. Screenshots of Settings → About, the sidebar empty state and the CLI `--help` show OhPiChamber. `standards.md` no longer names the operator env file, and that file and `~/.config/ohpichamber/chats` are gone.
- **W8 (gates).** `bun run type-check`, `bun run lint`, `bun run test`, `bun run docs:validate` and `bun run dead-code` (report inspected) pass on the phase-B head.
