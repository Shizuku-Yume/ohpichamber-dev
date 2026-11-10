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
- `packages/web/server/lib/opencode/`: historical notes only. The unmounted `proxy.js` fixture was deleted with the in-space runtime (Task38); no OpenCode proxy remains.
- `packages/web/server/lib/ui-auth/ui-auth.js`: session and URL-token route gates.

<<<<<<< HEAD
Production OpenChamber routes are explicit; no generic `/api/*` OpenCode proxy fallback remains.

=======
## VS Code

- `packages/vscode/webview/main.tsx`: webview fetch routing and local-route handling.
- `packages/vscode/webview/api/index.ts`: webview `RuntimeAPIs` composition.
- `packages/vscode/webview/api/bridge.ts`: request, session-message, and SSE bridge helpers.
- `packages/vscode/webview/requestBodyTransport.ts`: byte-preserving request-body extraction.
- `packages/vscode/src/bridge-proxy-runtime.ts`: extension-host OpenCode forwarding.
- `packages/vscode/src/bridge-*-runtime.ts`: owning native/local handlers.
>>>>>>> bc50ba56a

## Runtime Switching

`packages/ui/src/lib/runtime-switch.ts` updates endpoint/auth state and emits the runtime-change event. Canonical Client requests resolve the active runtime through `runtimeFetch`; app roots reset runtime-scoped stores/transports.

## Tests To Prefer

- HTTP/request fidelity: `packages/ui/src/lib/runtime-fetch.test.ts`
- URL/auth: `packages/ui/src/lib/runtime-url.test.ts`, `runtime-auth.test.ts`
- Server auth: `packages/web/server/lib/ui-auth/ui-auth.test.js`
- Dev-server tunnel: `packages/web/server/lib/dev-tunnel/tunnel.test.js`
<<<<<<< HEAD

Also run focused tests beside new runtime implementations and validation required by each affected workspace.
=======
- VS Code bridge: `packages/vscode/webview/api/bridge.test.ts`
- VS Code proxy: `packages/vscode/src/bridge-proxy-runtime.test.js`
>>>>>>> bc50ba56a
