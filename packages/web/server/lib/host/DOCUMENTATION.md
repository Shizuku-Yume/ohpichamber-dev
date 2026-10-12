# Host Runtime Documentation

## Purpose

`packages/web/server/lib/host/` owns Host Gateway infrastructure that is retained independently of the OpenCode integration. These modules keep settings, themes, projects, networking, tunnels, startup, static serving, and managed-process cleanup available to Web, PWA, Electron, and hosted mobile surfaces.

## Modules

- `settings-runtime.js`, `settings-files.js`, `settings-helpers.js`, `settings-normalization-runtime.js`, `settings-registry.json`, and `input-history-scope.js` implement the four-tier Host settings document, normalization, persistence, and input-history policy.
- `theme-runtime.js`, `theme-catalog.js`, and `theme-archive.js` validate custom themes, discover remote theme packages, and import selected VS Code palette data from bounded `.vsix` archives. Theme import consumes data only; it never executes extension code.
- `tunnel-auth.js` and `tunnel-wiring-runtime.js` protect and compose retained development-tunnel and relay routes.
- `pwa-manifest-routes.js` generates the dynamic install manifest and recent-session shortcuts.
- `project-directory-runtime.js` resolves and validates workspace roots; `project-icon-routes.js` owns project icon upload, discovery, and serving.
- `network-runtime.js` builds the managed OpenCode connection URL and performs readiness checks. Compatibility parsing is supplied by composition as required dependencies so this Host module does not import the legacy integration path.
- `login-shell-env.js` provides the login-shell environment snapshot used when embedding the server in Electron and when starting host commands.
- `server-startup-runtime.js`, `startup-pipeline-runtime.js`, and `static-routes-runtime.js` own Host HTTP startup, static assets, SPA fallback, and manifest wiring.
- `managed-process-registry.js` and its declaration file track managed child processes and reap only verified orphaned processes. `startup-performance.js` records opt-in startup diagnostics shared by lifecycle, proxy, and startup callers.

## Ownership boundary

The Host modules do not own OpenCode lifecycle, proxying, SSE watching, snippets, agent configuration, credentials, filesystem APIs, Git, PTY, guest services, or environment stores. Those remain in their existing modules until their coordinated migration tasks. The OpenCode integration may compose Host routes and inject retained engine dependencies, but Host modules do not provide path aliases or compatibility re-exports for the old directory.

## Retained behavior

Settings are persisted atomically with profile/device/surface scope handling. Theme imports validate package identity, checksums, archive bounds, and authored palette data. Project and network routes preserve path validation and rebinding protections. Startup continues to publish the listener before managed lifecycle work, serves static/PWA routes, and records the same diagnostic phases. Managed-process cleanup remains asynchronous and verifies process identity before reaping.
