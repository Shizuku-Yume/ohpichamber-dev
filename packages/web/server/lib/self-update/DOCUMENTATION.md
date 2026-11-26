# Host release notes and model metadata

## Ownership

`openchamber-routes.ts` registers the Host enterprise-policy summary, bundled
release notes, public model metadata and Zen model-list reads. Agent execution
and credentials are not owned here.

## Routes

- `GET /api/openchamber/enterprise-policy` returns the public policy summary,
  never pinned credentials or private endpoint settings.
- `GET /api/openchamber/release-notes?version=&since=` reads the bundled changelog
  through `../changelog/update-notes.ts`. Versions must be release versions;
  invalid input is 400, an unavailable bundle is 503, and an unknown version is
  a successful empty list. No remote changelog fetch substitutes for the bundle.
- `POST /api/openchamber/openrouter/model-info` is registered by the existing
  Host model-info owner, which enforces enterprise policy before networking.
- `GET /api/openchamber/models-metadata` reads the Host metadata cache and sets
  cache headers according to freshness. The client projection is serialized
  once per upstream catalog revision and carries an `ETag`; a matching
  `If-None-Match` answers 304 instead of re-sending the multi-megabyte body.
  Timeouts are 504; other failures are 502.

## Boundary

`registerOpenChamberRoutes(app, dependencies)` accepts the shared Host HTTP
application and explicit metadata/model readers. This module does not register
`update-check` or `update-install`, manage agent binaries or check an OpenCode
version. Native release/install work remains with the retained surface owners
and the M5 packaging plan.

The retired OpenCode Zen model-list endpoint is not registered. Its readers
were not supplied by native bootstrap and there are no retained UI callers.
The model picker reads the Canonical workspace catalog instead. Public
models.dev metadata and OpenRouter auto-fill remain Host-owned services.
