# OhPiChamber

OhPiChamber is an OpenChamber fork. The pinned upstream application source and source-aware documentation audit have been adopted; the technical [M3 W1-W10 gate](.workflow/specs/omp-through-m3.md) is complete, and final maintainer acceptance is pending. M4/M5 remain open and no next implementation is selected.

The checkout executes through the Host-supervised OMP Agent Service after the technical M3 gate; final maintainer acceptance is pending and M0 provider/platform and rebaseline runtime limits remain explicit. OMP is the sole target agent runtime, retaining Web/PWA, Electron, mobile and the Guest SDK, not OpenCode compatibility or the VS Code extension.

## Development documents

- [AGENTS.md](AGENTS.md): global rules and the mandatory `flow-start` conversation entrypoint.
- [Workflow standards](.workflow/standards.md): project facts, task recovery and landing authorization.
- [Development progress and lessons](.workflow/development.md): observed progress, verification limits, and next steps.
- [OMP migration](.workflow/omp-migration/README.md): scope, architecture, canonical contracts, and implementation gates.
- [Historical upstream assessment](.workflow/upstream-review.md): retained selective-sync research; its pick/exclude/defer decisions no longer govern the baseline update.
- [Inherited isolated-space design](.workflow/isolated-spaces/DESIGN.md): sandbox reference and historical experiments, not local product wiring.
- [Latest-upstream rebaseline](.workflow/specs/upstream-rebaseline.md): closed source/document prerequisite and unverified runtime certification.

Start conversations through the workflow and recover tasks with `.workflow/bin/workflow next --no-color`. Keep current evidence and detailed decisions with their owning records rather than copying them into reports.

## Local setup

<<<<<<< HEAD
Use the Bun version declared in `package.json` and Node.js 24.14 or later. From the repository root:
=======
<details>
<summary>More screenshots</summary>

![VS Code Extension](packages/vscode/extension.jpg)

<p>
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/references/mobile/new_session_dark.png"><img src="docs/references/mobile/new_session_light.png" width="30%" alt="OpenChamber mobile new session"></picture>
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/references/mobile/chat_dark.png"><img src="docs/references/mobile/chat_light.png" width="30%" alt="OpenChamber mobile chat"></picture>
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/references/mobile/context_usage_dark.png"><img src="docs/references/mobile/context_usage_light.png" width="30%" alt="OpenChamber mobile context and usage"></picture>
</p>

</details>

## What you can do with OpenChamber

### Goals that continue on their own

Give a session a finish line with **Session Goals**. OpenChamber checks the result after every turn and keeps the agent working until it completes the goal, gets blocked, or reaches the limit you set. It can continue after you close the app.

### Compare and combine runs

Use **Multi-run** to give the same task to up to five models, each in its own session and optionally its own worktree. See what each one actually built, choose the best result, or use **Fusion** to combine the strongest parts into a new session.

### Guided changes walkthroughs

**Changes Walkthrough** turns a large diff into an AI-guided tour of the change. It groups related edits into steps, puts them in the order the change makes sense, and explains how the pieces fit together.

### Inspect a running app

Open your app beside the conversation with **Preview**. Point at an element to send the agent its screenshot, styles, position, and browser errors. No more trying to explain "this thing here." The desktop app can do the same with any web page in its built-in browser.

### GitHub context from issue to pull request

Start a session from a GitHub issue or pull request with its context attached. Send failed checks or review comments back to the agent, then update or merge the pull request from OpenChamber.

### Continue on another device

Open the same projects and sessions from Desktop, Web/PWA, VS Code, iOS, or Android. Check progress, answer questions, review changes, and reattach to a running terminal.

### Private remote access

Pair a device with a one-time QR code and connect through **Private Relay** without opening ports or exposing a public server. The connection is end-to-end encrypted and can be revoked at any time. Direct connections, LAN/VPN access, Cloudflare/Ngrok tunnels, and SSH are also supported.

### Track work across projects

See which sessions are working, waiting, finished, or failed, along with approvals, scheduled tasks, provider limits, token use, and costs. Organize sessions into folders and keep notes, todos, and reusable project actions nearby.

### Schedule recurring work

Run a prompt once, daily, weekly, or on a cron schedule. Scheduled tasks can use Session Goals, so they continue toward an outcome instead of stopping after one response.

## Use it where you work

| Surface | Role |
| --- | --- |
| **Desktop** | The complete workspace for macOS, Windows, and Linux, with multiple windows, Mini Chat, remote machines, SSH, and native notifications |
| **Web / PWA** | Open your workspace in a browser, install it as an app, and stay up to date through background notifications |
| **VS Code** | Keep sessions beside your code, send selections to the agent, open results in the editor, and compare parallel runs |
| **iOS / Android** | Review and steer work away from your desk, receive completion alerts, and use the terminal with touch controls |
| **CLI / Server** | Run OpenChamber on a workstation or server, schedule work, manage remote access, and keep it available after login |

## Quick start

### Desktop for macOS, Windows, and Linux

Download the latest release from [GitHub Releases](https://github.com/openchamber/openchamber/releases/latest). Desktop bundles the matching OpenCode CLI, so no separate OpenCode installation is required.

The nightly build of `main` is in the [Canary release](https://github.com/openchamber/openchamber/releases/tag/canary). Tomorrow's release, available tonight.

Linux releases come for x86_64 and ARM64 as a `.deb` (Debian, Ubuntu), an `.rpm` (Fedora, openSUSE) and an AppImage. The packages install OpenChamber into the app menu, and in-app updates ask for your password to install the new package:
>>>>>>> bc50ba56a

```bash
bun install
bun run dev
```

These commands start the inherited development environment, not a completed OMP integration. Consult the affected package README for runtime prerequisites.

## Development commands

`package.json` is the command source of truth.

| Task | Command |
|---|---|
| Web with HMR and auto-selected ports | `bun run dev` |
| Web server and build watcher without HMR | `bun run dev:web:full` |
| Explicit web HMR entrypoint | `bun run dev:web:hmr` |
| Packaged web server | `bun run start:web` |
| Electron with HMR | `bun run electron:dev` |
| Electron with built web assets | `bun run electron:dev:bundled` |
| Desktop packaging | `bun run electron:build` |
| Shared UI build | `bun run build:ui` |
| Shared UI type check | `bun run type-check:ui` |
| Shared UI lint | `bun run lint:ui` |

See the [Electron README](packages/electron/README.md) for desktop requirements and the [mobile README](packages/mobile/README.md) for native builds. The VS Code extension workspace and its commands are removed; external editor launching and VS Code theme import remain.

## Verification

Choose focused checks according to `AGENTS.md`. Workspace-wide commands remain available when the change crosses package boundaries:

```bash
bun run build
bun run type-check
bun run lint
bun run test
```

The root test command uses `scripts/run-isolated-tests.mjs` for suites with process-level state. Run an individual Bun test with `bun test <path>`. Passing static checks does not establish OMP capability, process cleanup, reconnect, or platform behavior.

## Technical references

- [Host reverse proxy setup](docs/REVERSE_PROXY.md)
- [Custom themes](docs/CUSTOM_THEMES.md)
- [Guest SDK](packages/sdk/DOCUMENTATION.md)
- [Product documentation source](packages/docs/README.md)
- [Security policy](SECURITY.md)

<<<<<<< HEAD
Product guides under `packages/docs` describe the inherited runtime until their migration is implemented. Keep them for behavior and operation reference, not as evidence of OMP support.
=======
### iOS and Android

Join the iOS beta on [TestFlight](https://testflight.apple.com/join/5ek6GU1E). For Android, download the `.apk` from the [Canary release](https://github.com/openchamber/openchamber/releases/tag/canary).

### CLI for Web and PWA

Requires Node.js 24.14+. CLI/Web and VS Code use your installed [OpenCode CLI](https://opencode.ai).

```bash
curl -fsSL https://raw.githubusercontent.com/openchamber/openchamber/main/scripts/install.sh | bash
openchamber --ui-password be-creative-here
```

Common operations:

```bash
openchamber status
openchamber connect-url --qr
openchamber tunnel start --provider cloudflare --mode quick --qr
openchamber startup enable
openchamber logs
openchamber stop
openchamber update
```

OpenChamber binds to localhost by default. Use `--lan` only on a trusted network and protect browser access with `--ui-password`.

## Guides

Go deeper with the OpenChamber guides:

- [Quick start](packages/docs/content/docs/quickstart.mdx)
- [Installation](packages/docs/content/docs/install.mdx)
- [Connect devices](packages/docs/content/docs/connect-devices.mdx)
- [Private Relay](packages/docs/content/docs/private-relay.mdx)
- [Multi-run](packages/docs/content/docs/multi-run.mdx)
- [Session Goals](packages/docs/content/docs/session-goals.mdx)
- [Changes Walkthrough](packages/docs/content/docs/walkthrough.mdx)
- [Preview and dev servers](packages/docs/content/docs/preview.mdx)
- [GitHub workflows](packages/docs/content/docs/github.mdx)
- [Mobile](packages/docs/content/docs/mobile.mdx)
- [Security](packages/docs/content/docs/security.mdx)
- [Troubleshooting](packages/docs/content/docs/troubleshooting.mdx)

For self-hosting details, see the [reverse proxy guide](docs/REVERSE_PROXY.md). For custom theme authoring, see the [custom themes guide](docs/CUSTOM_THEMES.md).

## Why OpenCode?

OpenChamber uses [OpenCode](https://opencode.ai) to run coding agents. We chose it because it is open source, has a solid API, and is easy to extend.

OpenChamber handles the rest of the workflow. You can decide what to try, keep the agent on track, review the result, connect from another device, and ship the change.

OpenChamber is an independent project and is not affiliated with the OpenCode team.

## Contributing

Bug fixes are welcome as PRs that link their bug report. Features and behavior changes start as a [feature request](https://github.com/openchamber/openchamber/issues/new?template=feature_request.yml), and building starts once it is marked `accepted`. Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a PR; it has the setup, the review contract, and what happens to a PR without a linked issue. Documentation authoring guidance lives in [`packages/docs`](packages/docs/README.md).

Bugs go to [issues](https://github.com/openchamber/openchamber/issues/new/choose). Questions go to [Q&A discussions](https://github.com/openchamber/openchamber/discussions/categories/q-a).

## Acknowledgments

Special thanks to:

- [OpenCode](https://opencode.ai) for the API and open-source architecture OpenChamber builds on
- [Pierre](https://pierrejs-docs.vercel.app/) for the diff viewer and syntax highlighting
- The [T3 Code](https://github.com/pingdotgg/t3code) team for their browser adapter for [libghostty-vt](https://github.com/ghostty-org/ghostty), which our terminal is built on
- [Yulia Ivashko](https://github.com/yulia-ivashko), who built the firework celebration that plays on every successful push
- Everyone who contributed code, reported bugs, or shared ideas
>>>>>>> bc50ba56a

## License

Forked from OpenChamber. Original licensing and attribution are retained in [LICENSE](LICENSE).
