# CLI Module Map

This directory contains the non-entrypoint implementation for the OpenChamber CLI. `packages/web/bin/cli.js` owns source-loader bootstrap and public exports; `cli-runtime.ts` owns command wiring, top-level dispatch and signal/cancel handling. Domain logic belongs in these modules.

### Migration status

In the pre-M0 baseline, the CLI manages both OpenChamber Host Gateway services and the local OpenCode process lifecycle. In the target OhPiChamber architecture, the CLI remains the operator tool for the Host Gateway (startup, tunnels, pairing, and status), while OpenCode lifecycle management is retired in favor of the OMP Agent Service.

## Entrypoint Boundary

Checkout commands run `bin/cli.js` with Bun, including `start:web`.
Published commands run `build/bin/cli.js`.
Each CLI loads its own sibling server tree, so both paths work without a stale
build entering the development loop.
The package also ships `bin/cli.js` as a compatibility entry for startup
services created before the build directory existed. It forwards execution to
the built CLI so those services survive an upgrade.

- `../cli.js`
  - Loads standalone package aliases and the existing Node source resolver before dynamically importing the TypeScript controller. Emitted builds load the corresponding JavaScript controller.
  - Re-exports public entrypoint helpers without a second command table or signal state.
- `../cli-runtime.ts`
  - Owns package/version lookup, command wiring, top-level errors and signal/cancel state.
  - Injects dependencies into command factories and configures the bundled Bun Agent Service. It neither discovers an OpenCode binary nor provides OpenCode update commands.
  - New domain branches belong in a command or helper module, not in the controller.

## Command Modules

Command modules implement user-facing commands and preserve output contracts across interactive, non-TTY, `--quiet`, and `--json` modes. They should use `../cli-output.js` for presentation helpers and keep safety validation in command logic, not prompts.

- `commands-serve.js`
  - Implements `ohpichamber serve`.
  - Owns port resolution, log rotation, PID/instance registry writes, foreground/background Host launch, startup summaries, and foreground shutdown behavior. It does not discover or require an OpenCode executable; the Host supervises the Bun Agent Service and canonical readiness is reported through `/api/agent/v1`.

- `commands-lifecycle.js`
  - Implements `ohpichamber stop` and `ohpichamber restart`.
  - Owns lifecycle stop/restart semantics, desktop-managed port rejection, unmanaged instance shutdown attempts, PID/instance cleanup, and restart reuse of stored instance options.

- `commands-status.js`
  - Implements `ohpichamber status`.
  - Formats discovered instances and tunnel readiness/status for human, quiet, and JSON output.

- `commands-session.js`
  - Implements `ohpichamber session create`, `send`, `fork`, `list`, `status`, and `messages`.
  - Maps CLI options to shared control-service inputs and owns only human, quiet, and JSON presentation.
  - A `--wait` that ends because the session waits for the user exits non-zero, with a line on stderr outside `--json`.
  - Message projection matches Export Markdown semantics: only ordered `text` parts are exposed; tool, reasoning, file, and other parts are omitted.
  - The Host control service (accessed via `commands-session.js` -> `cli-control.js` `POST /api/openchamber/control`) owns create/worktree/prompt orchestration, Host session and control API reads, Goal Mode, wait semantics, and partial failures; the CLI owns no OpenCode lifecycle.

- `commands-schedule.js`
  - Implements scheduled task status/list/create/run/delete/enable/disable.
  - Maps options to control-service inputs and renders results; project resolution, validation, persistence, and execution remain server-owned.

- `commands-models.js`
  - Prints OpenChamber default, favorite, and recent model settings.

- `commands-projects.js`
  - Prints configured project labels, ids, and directories for later control-plane calls.

- `commands-logs.js`
  - Implements `ohpichamber logs`.
  - Resolves log files, tails recent lines, and follows log output.

- `commands-startup.js`
  - Implements `ohpichamber startup`.
  - Handles startup subcommand dispatch and presentation around the lower-level startup service helpers.
  - The standalone tarball carries the Agent runtime and a copy of the SDK under `resources/`; at startup `scripts/standalone-loader.mjs` links them into the package's `node_modules` (`ohpichamber-sdk`, `@openchamber/agent-contract`, `@openchamber/agent-service`). The daemon runs under the bundled Bun, which ignores `node:module` resolve hooks, so those links are the only resolution a packed install has.
  - Installs a user-level OS service named for the product: systemd `ohpichamber.service`, launchd label `dev.ohpichamber.web`, and the Windows task/wrapper `OhPiChamber`. A unit written by an older release is not migrated.

- `commands-connect-url.js`
  - Implements `ohpichamber connect-url`.
  - Finds or starts a local instance and prints the browser/connect URL according to the selected output mode.
  - Emits a **pairing v2** link (`ohpichamber://connect?v=2&p=<base64url>`): it creates a one-time pairing session in the shared store (`client-pairing-sessions.json`) and encodes the pairing id + secret + transport candidates. The client redeems the secret over whichever candidate connects first (`/api/client-auth/pairing/redeem`). No standalone token is embedded; the QR itself is the single-use credential.
  - The default form advertises the resolved server URL as a direct (lan/tunnel) candidate and folds in a relay candidate when the host relay is enabled, so one link works on-LAN and off-network.
  - `--relay` adds the relay transport candidate when sharing with a device that is not on the host's network. There is no built-in default relay URL: the endpoint follows the machine policy file / `OPENCHAMBER_RELAY_URL` / `settings.privateRelay.relayUrl`, matching the running host. With no relay URL configured, `--relay` fails fast with a usage error before starting a server, and plain links omit the relay candidate even when `privateRelay.enabled` is true.

- `commands-tunnel.js`
  - Implements `ohpichamber tunnel` and its subcommands: `profile`, `providers`, `ready`, `doctor`, `status`, `start`, `stop`, and `completion`.
  - Owns tunnel-specific command flow, interactive prompt decisions, managed-local/managed-remote startup, QR display rules, tunnel start/stop API calls, and tunnel profile command handling.
  - Receives `serveCommand` and `stopCommand` by dependency injection. Do not reach back into `cli.js` command globals from this module.

## Shared Helper Modules

CLI settings saves and read/modify/write updates use the same in-process write
queue. Relay key migration receives that queued updater and rereads strictly;
it never replaces unreadable settings with an empty document.

These modules hold reusable, non-presentational logic for commands.

- `cli-args.js`
  - Argument parsing, defaults, help text, completion script generation, and typo suggestions.

- `cli-errors.js`
  - CLI exit codes and typed tunnel CLI errors.

- `cli-paths.js`
  - Data, run, log, settings, tunnel profile, and managed-local config paths.

- `cli-settings-accessors.js`
  - Minimal settings.json read/write for CLI contexts that must not load the
    full web settings runtime (`connect-url` relay identity resolution).
  - Mirrors the settings runtime's guarantees so a CLI read-modify-write can
    never corrupt shared state: atomic tmp+rename writes (no concurrent reader
    in the running app can observe a torn file), a strict read that throws on
    corrupt/unreadable payloads, and the same `0600` file mode.
  - The strict read gates relay identity regeneration exactly like the server
    runtime: a swallowed read failure can never mint a replacement signing or
    encryption keypair, which would change `serverId` and orphan every paired
    device and push binding.

- `cli-process.js`
  - PID files, instance registry files, process identity checks, runtime metadata checks, and process termination helpers.

- `cli-lifecycle.js`
  - Instance discovery, live health probing, attachability checks, provider discovery, and status aggregation used by lifecycle/status/tunnel commands.

- `cli-http.js`
  - HTTP helpers for health checks, shutdown requests, JSON API calls, tunnel provider fetches, and system info fetches.
  - Owns local desktop bearer auth and managed CLI-instance UI password retry for control-plane requests.
  - `requestJson` passes only `method`, `headers` and `body` to `fetch`. Control commands hand it their parsed CLI options, and Bun, which runs the CLI in the Docker image, reads `session` as its own fetch option and rejects `--session`.

- `cli-control.js`
  - Sends one typed action request to the authenticated OpenChamber control endpoint and maps HTTP failures to CLI exit behavior.
  - Must not reproduce session, scheduled-task, project-resolution, or wait orchestration.
  - Every session create reserves the provisioning HTTP window, including a retry in an existing checkout, because it can still await checkout setup before selection. An explicit HTTP timeout remains authoritative.

- `cli-shell.js`
  - Quotes replay arguments for PowerShell on Windows and POSIX shells elsewhere. Session recovery and tunnel replay commands share this formatter.

- `cli-api-target.js`
  - Resolves the target OpenChamber runtime for control-plane commands, preferring desktop unless a port is explicit.

- `cli-goal.js`
  - Owns shared Goal Mode token-budget validation for session and schedule commands.

- `cli-network.js`
  - Host resolution, URL building, LAN detection, unsafe browser port validation, and UI password/network exposure checks.

- `cli-ports.js`
  - Port availability checks and available-port resolution.

- `cli-log-files.js`
  - Log rotation, tail reads, and file-follow streaming.

- `cli-startup.js`
  - Native startup service detection, install/uninstall/status helpers, and platform-specific startup command execution.
  - The service runs the CLI by its resolved path. A pnpm global install resolves into a versioned `.pnpm` store directory that a later install leaves behind, so the entrypoint is mapped back to the stable `node_modules/ohpichamber` link when it exists.
  - pnpm 11 and later install every global update into a new `global/v11/<dir>` and delete the old one; the link `global/v11/<hash>` beside it moves to each new directory, and pnpm's shim starts the CLI through it. When the CLI was started through that link, the service keeps the unresolved path, so a pnpm upgrade does not leave the unit pointing at a deleted directory (#5727).
  - On Linux, `startup enable` restarts the unit after rewriting it. `enable --now` leaves a running service alone, so it kept the old unit and release while reporting `service active` (#5793). macOS already reloads the agent with `kickstart -k`.
  - The macOS LaunchAgent leaves `ProcessType` unset so launchd does not force the server into background-tier scheduling. Re-running `startup enable` replaces an existing plist.
  - The environment snapshot drops the variables a running OpenChamber put into the enabling shell, read from the `OPENCHAMBER_INJECTED_ENV` record (`server/lib/injected-env.js`), so a service enabled from the desktop app's terminal or an agent's shell does not inherit that instance's runtime flags or UI password (#4604). The user's own exports still carry over. `cli-args.js` applies the same record to the `OPENCHAMBER_UI_PASSWORD` default.

- `cli-tunnel-profiles.js`
  - Tunnel profile normalization, token resolution/redaction, profile storage, migration, file-permission warnings, and managed-remote pair persistence.

- `cli-tunnel-utils.js`
  - Tunnel-specific command string builders, TTL parsing/formatting, and replay command helpers.

- `cli-tunnel-capabilities.js`
  - Built-in tunnel provider capability fallbacks used when a live server cannot provide tunnel metadata.

## Placement Rules

- Add new CLI commands as `commands-*.js` modules and wire them from `cli.js`.
- Add reusable logic to the narrow helper module that owns the domain. Create a new helper module before mixing unrelated domains into an existing one.
- Keep command modules responsible for user-visible behavior and mode-specific output. Keep helper modules mostly output-free unless the helper exists specifically for CLI rendering.
- Preserve the mode output contract when moving code (`clack-cli-patterns`, *Mode Contract*).
- Prefer dependency injection from `cli.js` for cross-command behavior, especially when one command needs another command's implementation.
- Do not import `cli.js` from modules in this directory. The dependency direction is `cli.js` -> command modules -> helper modules.

## Verification

For CLI behavior changes, run the focused CLI suite from `packages/web`:

```sh
bun run test -- bin/cli.test.js
```
