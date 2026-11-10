# Removed OpenCode integration

## Current Boundary

There is no OpenCode code in this directory any more. Normal agent execution uses the Bun Agent Service through Canonical `/api/agent/v1` routes, and isolated spaces run no agent runtime until the OMP space runtime is built (`.workflow/decisions.md: 2026-10-24 - Keep isolated spaces unreleased without the OpenCode runtime`).

`proxy.js`, its three unit suites (`proxy.test.js`, `proxy-agent-wiring.test.js`, `proxy-host-metadata.test.js`) and its two isolated-space live imports were deleted with task 38. The proxy was never mounted by the production server; it existed only as a test fixture, and the spaces tests now use the in-space OpenChamber routes (`packages/web/server/lib/spaces/places/DOCUMENTATION.md`). The `@opencode/client` and `@opencode/schema` dependencies were removed from `packages/web/package.json` with it.

## What Remains

- `RUNTIME_NOTES.md`: historical notes on inherited OpenCode 2.x behaviour, kept for diagnosis only. They do not describe current APIs.
- `references/mcp-spawn-probe.md`: historical probe notes for MCP fan-out startup diagnosis.

## Rules

- Do not add a new OpenCode runtime, proxy, fallback engine or compatibility alias here.
- Read `.workflow/isolated-spaces/DESIGN.md` and the server-owned release gate (`packages/web/server/lib/spaces/release.js`) before touching spaces.
