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

Use the Bun version declared in `package.json` and Node.js 24.14 or later. From the repository root:

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

Product guides under `packages/docs` describe the inherited runtime until their migration is implemented. Keep them for behavior and operation reference, not as evidence of OMP support.

## License

Forked from OpenChamber. Original licensing and attribution are retained in [LICENSE](LICENSE).
