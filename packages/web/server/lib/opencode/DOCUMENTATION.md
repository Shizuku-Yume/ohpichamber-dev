# Legacy OpenCode integration and test fixtures

## Current Boundary

All retained Host Gateway infrastructure previously residing in `packages/web/server/lib/opencode/` has been extracted to `packages/web/server/lib/host/` (documented in [`../host/DOCUMENTATION.md`](../host/DOCUMENTATION.md)).

The only remaining code in this directory is the unmounted legacy OpenCode proxy fixture (`proxy.js`) and its test suites, retained exclusively for isolated-spaces integration tests (`grants.docker.live.test.js`, `sessions.docker.live.test.js`) and unit test coverage (`proxy.test.js`, `proxy-agent-wiring.test.js`, `proxy-host-metadata.test.js`).

## Migration status

Normal agent execution uses the Bun Agent Service through Canonical `/api/agent/v1` routes; isolated-space container engines remain milestone M5 scope. The production Host Gateway has no production proxy registration or Host-managed OpenCode lifecycle.

`RUNTIME_NOTES.md` and `references/mcp-spawn-probe.md` are historical diagnostics. They do not describe current OMP Canonical APIs.

## File Inventory

- `proxy.js`: Unmounted legacy OpenCode HTTP/SSE proxy registrar, retained solely as a test fixture.
- `proxy.test.js`: Unit tests for proxy connection pooling, options, and error handling.
- `proxy-agent-wiring.test.js`: Tests verifying keep-alive agent wiring and directory header normalization.
- `proxy-host-metadata.test.js`: Tests verifying Host session metadata projection through the proxy fixture.
- `RUNTIME_NOTES.md`: Historical notes covering inherited OpenCode 2.x behaviors; retained for diagnostic reference.
- `references/mcp-spawn-probe.md`: Historical probe notes for MCP fan-out startup diagnosis.

## Module Contracts

### proxy.js (Unmounted Test Fixture)
`proxy.js` is not mounted by the production server bootstrap. It is retained strictly as a test fixture for spaces integration tests and unit test suites:
- `createOpenCodeProxyAgent(target)`: Builds keep-alive `http.Agent` or `https.Agent` with connection pooling.
- `createDirectoryQueryCanonicalizer({ realpath, ...cacheOptions })`: Canonicalizes directory query parameters with caching.
- `normalizeForwardedDirectoryHeaders(headers)`: Ensures consistent directory header formatting.
- `createSseBoundaryTracker()`: Tracks SSE chunk boundaries across network frames.
- `registerOpenCodeProxy(app, deps)`: Registers legacy `/api/*` proxy middleware, SSE forwarding (`GET /api/global/event`, `GET /api/event`), session message posting (`POST /api/session/:sessionId/message`), session CRUD mutations, and session list projections.
