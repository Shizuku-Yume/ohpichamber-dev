# Brand assets

## Ownership

`scripts/brand` owns every drawing of the OhPiChamber mark. `geometry.mjs` describes the shapes; `raster.mjs` turns them into PNG, the pixel-exact small cube and `.ico` files; `generate.mjs` writes each file where its runtime reads it. `bun run brand:generate` rewrites all of them; `bun run brand:generate --check` fails when a generated text file was edited by hand. `compare-master.mjs` measures the code-drawn icon against the approved master, and `contact-sheet.mjs` renders every generated drawing at 16, 32, 64 and 512 px on dark and light for approval.

The mark is upstream's open shell with OMP's π on its left face, the bar folded over the front edge onto the right face. It has four drawings, each for a kind of place:

| Drawing | Where it shows |
|---|---|
| App icon, an Icon Composer document (`packages/electron/resources/icons/AppIcon.icon`) | macOS Dock and Finder, the iOS app (the Xcode project references the same document). Its layers carry the six macOS appearances: Default, Dark, Clear and Tinted, light and dark |
| Icon without a tile: the open shell with a dark grey inside, white edges, black outline, the π in colour | Windows, Linux; on a black square for phone home screens, PWA and Android |
| In-app logo: the open shell in one colour | Every splash, About, sign-in, empty states, README |
| Glyph: cube outline, two roof rings and the π, one colour | macOS menu bar, favicon, model picker sprite, Android notification, Quick Settings tile and themed icon, iOS Control Center |

This fork ships a single release channel, so there is no second icon set: `packages/electron/resources/icons` is the only one.

The macOS menu bar animation lives in `packages/electron/tray.mjs`; this module only draws its frames. `OpenChamberLogo.tsx` renders the in-app logo from the generated `openChamberLogoArt.ts` and owns its loading animation; the π stays still while the tiers light.

## The π

`PI_GLYPH` holds OMP's mark in its own 200 × 190 box: the bar is `0,0,200,42`, the short left leg `28,42,40,99` and the long right leg `109,42,41,148`. Box columns 0–150 sit on the left face and 150–200 fold onto the right face; the box's left 40 units are the face's margin, so the bar starts 40 glyph units (8.75 cube units) in from the cube's back corner. The 200 columns become 43.756 cube units and the 190 rows the face's 48 units of height, which puts the bar's top edge `PI_EDGE` (1.5 cube units) above the cube's top-left edge, so the glyph covers the shell's white edge rather than being crossed by it.

Two polygons come out of those numbers, each drawn as one path so no anti-aliased seam can show at any zoom:

- `piFacePath(frame)` — bar and both legs on the left face (`PI_FACE_PATH` is the icon's own).
- `piFoldPath(gap, frame)` — the bar's overhang mirrored across the front edge onto the right face, plus the 1.5-unit sliver where the long leg's thickness wraps the front edge, so the leg keeps its width across the fold. Opaque, with no gap by default (`PI_FOLD_PATH`); `gap` shifts it right for the one-colour drawings.

Per drawing the π follows that drawing's paint:

- **Colour drawings** (the icon without a tile) fill the face with white → `#9fa1a6` and the fold with `#d6d7da` → `#85878d`, top to bottom, from the no-tile palette's `pi` entry; `piGradients` builds both gradients with the drawing's `idPrefix`. `ROOF_CENTRE_SCALE` (`0.16`) keeps the white roof centre the tiers frame.
- **One-colour drawings** (in-app logo, glyph) use `piOneColourInner`, which paints both polygons `currentColor` and offsets the fold by `PI_ONE_COLOUR_GAP` (1 unit). Without the gap the two would merge into a cross wherever both are the same paint.
- **Android notification and Quick Settings tile** use the glyph's 32 grid as a vector drawable, so its π is two extra paths filled solid white: `classifyGlyphPaths` splits the glyph into stroked shell lines, the two alpha rings and the solid π, and throws rather than emitting a vector without one.
- **Pixel drawings**: `pixelCube` redraws the π on whole pixels for the 16–24 px `.ico` frames (and favicon-16). `PIXEL_CUBES[16].legs = 'bar'` keeps the 16 px face to the bar and the long leg alone — four face pixels cannot hold three strokes — while 20 and 24 px keep the short leg. The menu bar templates are their own per-pixel drawing: `pixelGlyph`/`pixelGlyphPng` lay the cube, the roof rings and the π out on `PIXEL_GLYPH`'s 18 × 18 grid, and the 36 px `@2x` file is that grid at exactly twice the resolution.
- **macOS document**: `piLayerSvg` renders the π as its own white-on-transparent layer (`pi.png`), placed between `shell` and `roof` in the shell group, so Clear and Tinted draw it as separate glass.

## Invariants

- Every logo file in the repository comes out of `generate.mjs`. A change to the mark is a change to `geometry.mjs` (and, for the pixel-art sizes, `raster.mjs`) and a run of `bun run brand:generate`, never an edit of an output. One exception: the iOS widgets draw the in-app logo in SwiftUI (`CubeLogoView` in `packages/mobile/ios/App/OpenChamberWidget/WidgetShared.swift`), by hand from the same numbers. A change to the in-app logo updates it in the same change; `--check` does not cover it.
- The two HTML documents that show before React (the web `index.html` and the Electron splash in `early-startup.mjs`) and `OpenChamberLogo.tsx` draw the same in-app logo. The HTML documents carry it between `<!-- brand:flat-logo:start -->` and `<!-- brand:flat-logo:end -->`; the generator rewrites only that region.
- The in-app logo is drawn in `currentColor` (or the splash stroke colour), never a fixed colour, so it follows every theme.
- Text outputs are checked by `generate.test.mjs`; image bytes are not, because they depend on the libvips build.
- The committed Android launcher layers, Android notification icon, iOS Control Center symbol and mobile `assets/icon-*.png` are brand outputs; `packages/mobile/ios/App/App/Assets.xcassets` (app icon, splash) belongs to the Capacitor shell and the app icon there is a placeholder, because the iOS target builds its icon from the Icon Composer document.

## Comparing against the master

`bun scripts/brand/compare-master.mjs` compares the icon without a tile with the approved master (`ohpichamber-icon-i2.svg`) at 512 px and writes `compare-master.png`, `compare-generated.png`, a side-by-side, a difference image and `compare-result.txt` into the evidence directory. Both drawings are resized with the same kernel and alpha-composited over the same background, so the number measures the drawing rather than the rasteriser. The acceptance number is under 2 % mean absolute per-channel difference; it is 0.000 % today.

`--generated` defaults to the committed `packages/electron/resources/icons/icon.png`, so a stale output fails the measurement instead of hiding behind a fresh in-memory render; `--generated -` renders `noTileIconSvg()` from `geometry.mjs` for tuning before the outputs are written. `--master`, `--out`, `--size` and `--background` override the rest. `BRAND_MASTER_SVG` and `BRAND_EVIDENCE_DIR` set the master and output paths; both defaults point at the effort's artifact directories outside the repository (`icon-concepts-2026-11-16` and `rebrand-01-2026-11-16`), so pass `--master` when the approved drawing moves.

## Platform limits

`actool`, ictool and `swiftdraw` exist only on macOS with Xcode 26. On Linux (and any machine without those tools) the generator writes every other file and leaves `Assets.car`, `icon.icns`, `dev-icon.png` and the Control Center symbol untouched; it prints which ones it skipped. `--check` covers only the text outputs that every platform can write, so it passes without them.

A packaged macOS build ships the committed `Assets.car`, `icon.icns` and `dev-icon.png`, so the macOS release step runs `bun run brand:generate` once on a machine with Xcode 26 before packaging. Neither desktop workflow runs it today. Until that run happens after a mark change, the committed `Assets.car` and `icon.icns` still show the previous drawing: the macOS app icon, the dev Dock icon and the iOS Control Center symbol stay unverified.

## Decisions

### Why one script and not exported files

The logo used to live in about forty hand-exported files and six inline drawings that had to be kept in step by hand. A redesign touched all of them. With the shapes in code, the next change is one edit and one run, and a test catches a file edited on its own.

### Why the π is one polygon per face

The bar and each leg are rectangles, but the faces are sheared, so adjacent rectangles share anti-aliased edges. At small sizes those edges show as a lighter seam through the glyph. One path per face removes the seams; the fold stays a second path because it lands on another face and takes its own gradient.

### Why the app icon is layered and not one picture

macOS turns a single flat picture into a grey smudge in Clear and Tinted: it can only reduce it to its brightness. Separate layers (shell, three tiers) let the system draw each as its own glass, and `piLayerSvg` draws the π as a layer of its own for the same reason. The tiers appear twice: white with baked opacity for the light Default, opaque and coloured for Dark, Clear and Tinted, so each tier keeps its own tone there. A layer hidden in an appearance keeps glass off in it, or its glass still shows.

### Why the small Windows sizes are pixel art and not scaled vector

At 16 to 24 px the 30 degree edges fall between pixels and the cube blurs. `pixelCube` redraws it with 2:1 edges on whole pixels, no anti-aliasing, and a 1 px black outline for light taskbars. The `.ico` carries these for 16, 20 and 24 px and the vector rendering above that.

### Why the macOS dev icon is rendered by ictool and not drawn

The release Dock icon is glass rendered by the system. A flat drawing next to it looked like a different app. `ictool` renders the real document the way the Dock does, and the tape goes on top.
