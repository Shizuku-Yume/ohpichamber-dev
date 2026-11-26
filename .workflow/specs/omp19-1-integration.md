# OMP 19.1 integration

**Status:** done
**Priority:** high

## What it does

OhPiChamber uses the provenance-pinned OMP 19.1.0 SDK. Native tool commands and plan review work through the existing Canonical API, and explicit on-demand tool preferences survive the settings rename. The same worker-owned MCP policy, apply/rollback, OAuth and credential boundaries remain in force; MCP does not use the shared daemon. Magic edit mode is not offered or authorized.

## How it is built

Keep patched SDK objects inside the Bun worker and keep the Canonical and Guest contracts unchanged. Web/PWA, Electron and remote mobile consume the same settings and session behavior. Desktop and Docker stage the same SDK revision and platform-specific native leaf. OMP's own RPC, browser relay, and terminal UI are not separate application capabilities.

## How we will know it works

- **W1.** Compare the pinned inputs and runtime with the official 19.1.0 artifacts; package staging and readiness use the exact verified platform leaf.
- **W2.** Agent Service and affected UI/Host tests cover renamed settings, tool and edit authorization, plan review, MCP negotiation and lifecycle, and shell output. Root and Agent Service type-checks pass.
- **W3.** Exercise plan review, tool command authorization, MCP connect and shell output through the real Canonical path; record runtime and platform limits.
