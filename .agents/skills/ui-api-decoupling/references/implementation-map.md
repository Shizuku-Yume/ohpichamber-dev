# Runtime Implementation Map

## Shared UI

- `packages/ui/src/api/canonicalClient.ts`: Canonical Client for the Host Agent Service; current runtime URL and auth flow through `runtimeFetch`.
- `packages/ui/src/lib/runtime-fetch.ts`: resolves the active Host API URL and auth at request time.
- `packages/ui/src/lib/runtime-url.ts`: browser/realtime URL construction.
- `packages/ui/src/lib/runtime-auth.ts`: bearer state and short-lived URL-token minting.
- `packages/ui/src/lib/api/types.ts`: shared `RuntimeAPIs` contract.
- `packages/ui/src/contexts/RuntimeAPIProvider.tsx`: React provider and runtime API wrappers.
- `packages/ui/src/hooks/useRuntimeAPIs.ts`: React consumption path.

## Web And Server

- `packages/web/src/runtimeConfig.ts`: initializes runtime URL/auth and web APIs.
- `packages/web/src/api/index.ts`: composes web `RuntimeAPIs`.
- `packages/web/server/lib/host/core-routes.js`: installs OpenChamber route families.
- `packages/web/server/lib/host/feature-routes-runtime.js`: explicit feature route registration.
- `packages/web/server/lib/host/settings-routes.js`: Host-owned `GET`/`PUT /api/config/settings` registration, composed from `packages/web/server/index.js` before feature routes.
- `packages/web/server/lib/opencode/proxy.js`: unmounted legacy proxy fixture for M5 spaces tests; not a production fallback.
- `packages/web/server/lib/ui-auth/ui-auth.js`: session and URL-token route gates.

Production OpenChamber routes are explicit; the legacy OpenCode proxy is not mounted as a generic `/api/*` fallback.


## Runtime Switching

`packages/ui/src/lib/runtime-switch.ts` updates endpoint/auth state and emits the runtime-change event. Canonical Client requests resolve the active runtime through `runtimeFetch`; app roots reset runtime-scoped stores/transports.

Review every cache keyed only by session ID, directory, URL, or entity ID. Add runtime identity when local and remote runtimes can collide.

## Tests To Prefer

- HTTP/request fidelity: `packages/ui/src/lib/runtime-fetch.test.ts`
- URL/auth: `packages/ui/src/lib/runtime-url.test.ts`, `runtime-auth.test.ts`
- Server auth: `packages/web/server/lib/ui-auth/ui-auth.test.js`
- Legacy proxy fixture: `packages/web/server/lib/opencode/proxy.test.js` (spaces/test coverage only).
- Dev-server tunnel: `packages/web/server/lib/dev-tunnel/tunnel.test.js`

Also run focused tests beside new runtime implementations and validation required by each affected workspace.
