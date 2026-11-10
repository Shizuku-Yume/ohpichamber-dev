# Runtime API And Parity

## Extending `RuntimeAPIs`

1. Add or extend the shared interface in `packages/ui/src/lib/api/types.ts`.
2. Implement web behavior under `packages/web/src/api/*` and compose it in `packages/web/src/api/index.ts`.
3. Keep Electron shared through the web runtime unless behavior is inherently native.
4. Support hosted-mobile and Capacitor mobile requirements as applicable to the surface.
5. Register APIs through app entrypoints and consume via `RuntimeAPIProvider` hooks.

React components use `useRuntimeAPIs()` or `useRuntimeAPI()`. Non-React modules use `getRegisteredRuntimeAPIs()` only when hooks are impossible. Do not introduce direct reads of `window.__OPENCHAMBER_RUNTIME_APIS__` in feature code.

<<<<<<< HEAD
=======
## VS Code Route Decisions

| Route type | VS Code behavior |
|---|---|
| OpenChamber local route | Handle in the webview and bridge to extension host when needed |
| Official OpenCode route | Forward through the generic OpenCode proxy |
| SSE | Use the dedicated SSE bridge, never generic proxy |
| Session message POST | Use the dedicated session-message path |
| Unsupported native feature | Return stable explicit unsupported behavior, normally 501 JSON |

Silent empty fallback is not parity.
>>>>>>> bc50ba56a

## Electron Boundary

Electron normally reuses the web runtime/server implementation. Keep privileged shell behavior behind main/preload IPC and local-page gates.

- API base and shell identity may be broadly available for routing.
- Client tokens, home paths, filesystem/shell access, and privileged IPC remain local-page gated.
- Do not trust arbitrary loopback, `file://`, or `about:blank` origins as packaged UI.
- Remote pages and preview iframes must not gain local host privileges.

## Shared Contract Rule

For every shared capability, decide web, Electron, hosted-mobile, and Capacitor behavior explicitly across retained surfaces. A stable unsupported response is acceptable; accidental fallthrough is not.
