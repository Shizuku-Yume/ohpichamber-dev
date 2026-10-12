# @openchamber/agent-contract

Shared JSON wire types and Zod validation for the Canonical Agent API at `/api/agent/v1`. The Host, Agent Service and clients import this package; OMP SDK objects stay private to the Agent Service. The separate `@openchamber/sdk` package remains the Guest extension contract.

`src/index.ts` exports each DTO and its `<Type>Schema`. Public package imports resolve to compiled JavaScript and declarations in `dist/`, so Node Hosts do not need a TypeScript loader or Bun. The package depends on Zod, not an agent SDK, UI framework or runtime implementation.

From this directory:

```sh
bun run build
bun run test
bun run lint
```

The [protocol contract](../../.workflow/omp-migration/contracts.md) owns routing, state authority, revisions, recovery and execution semantics. Schema validation checks wire records; it does not establish provider availability, dynamic JSON-schema support, authorization or endpoint implementation. Runtime owners must sanitize SDK errors, secrets and private paths before publishing their projections.
