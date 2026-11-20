# Update UI

## Ownership

This module owns release-note parsing and presentation shared by Settings > About and the stable desktop update dialog. The Electron updater owns release availability, downloading and installation through the fork's GitHub Releases feed. Other runtimes install updates outside the app; upstream CLI checks, download mirrors, canary channels and OpenCode compatibility gates are not update sources.

## Surfaces

- Web/PWA reads bundled release notes through the Host; installation remains outside the app.
- Electron uses the same release notes and the stable desktop updater.
- Hosted mobile reads release notes through its connected Host; installation remains outside the app.
- Capacitor reads release notes through its connected Host; native application installation remains outside the app.

## Invariants

- Release notes do not imply an installation is running. Download and restart indicators follow the desktop updater's explicit state.
- Stable changelog sections sort newest first. Arbitrary GitHub release bodies remain readable Markdown.
- Release-note responses use `YYYY-MM-DD` dates, newest-first releases, and non-empty groups in changelog order with Markdown bullets. Unavailable notes return `null`; an empty list means the changelog has no notes for the requested range.
- The Markdown parser accepts the group headings emitted by `packages/web/server/lib/changelog/update-notes.js`. Other formats, including arbitrary GitHub updater notes, remain unparsed.
- Release-note links open in the external browser on desktop as well as web.

## Decisions

The recorded 2026-11-16 release decisions cut upstream-hosted update services off and retain only stable desktop updates. Release notes use the current Host's bundled changelog rather than an upstream service.
