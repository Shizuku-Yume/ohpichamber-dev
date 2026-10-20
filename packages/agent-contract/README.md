# @openchamber/agent-contract

Shared JSON wire types and Zod validation for the Canonical Agent API at `/api/agent/v1`. The Host, Agent Service and clients import this package; OMP SDK objects stay private to the Agent Service. The separate `@openchamber/sdk` package remains the Guest extension contract.

Session metadata retains typed OpenChamber workflow fields, including review offers and the `btwPromoted` marker. `SessionMetadataPatch` accepts native field updates and explicit `null` deletion; review-offer timestamps and promotion markers are validated rather than carried in an untyped extension object.

`src/index.ts` exports each DTO and its `<Type>Schema`. Public package imports resolve to compiled JavaScript and declarations in `dist/`, so Node Hosts do not need a TypeScript loader or Bun. The package depends on Zod, not an agent SDK, UI framework or runtime implementation.

Historical usage contracts (`usage.ts`) accept optional inclusive `from` and exclusive `to` epoch-millisecond bounds; omitted `to` defaults to now. The viewer IANA timezone is explicit. Optional opaque project/workspace IDs narrow Host-authorized registered sources; no filesystem paths or report-range shortcuts are accepted. Reports distinguish partial per-session failures from complete empty success. Unavailable reasoning tokens and tool duration medians are `null`; tool outcomes account for successful, failed, and unfinished calls. Native source parsing remains worker-private.

From this directory:

```sh
bun run build
bun run test
bun run lint
```

The [protocol contract](../../.workflow/omp-migration/contracts.md) owns routing, state authority, revisions, recovery and execution semantics. Schema validation checks wire records; it does not establish provider availability, dynamic JSON-schema support, authorization or endpoint implementation. Runtime owners must sanitize SDK errors, secrets and private paths before publishing their projections.

Native plugin contracts in `src/plugins.ts` distinguish global npm/git package installation from native marketplace user/project installation. Project scope is never synthesized for `PluginManager.install`, which has no scope parameter. Plugin settings are JSON-safe and described by native setting definitions; declared secret values are excluded from public catalogs. Local extension IDs identify flat source files under workspace `.omp/extensions/`.

Mutation results report committed persistence separately from each worker's applied revision. Installing or editing a module does not imply that a running session reloaded it. Explicit apply requests carry `strategy: "restart-idle-sessions"`; the service owns the safe worker-generation transition and reports actual outcomes. All counters are canonical uint64 decimal strings.

Catalog runtime rows belong to the requested workspace. Global package, user-marketplace and global-settings mutations, and explicit Apply, may return worker outcomes from sibling workspaces sharing the same private native plugin root; those outcomes retain each worker's real workspace and generation identity rather than being relabeled as the requesting workspace. Plugin revisions are owned by that actual native config/profile/XDG root, independently of provider catalogs and the agent-directory override. Native project marketplace mutations select affected roots by the actual nearest project registry identity.

Plugin setting writes explicitly carry `settingsScope: "global"`, independently of installation scope. `globalSettings` contains saved declared nonsecret global values; `settings` contains native effective values after existing project overrides. Per-setting `globalConfigured`, `configured`, and `overridden` flags describe those distinct sources without disclosing secrets. Editing global settings never synthesizes or writes a project override file, and a project override can remain effective after a global save.
`file-resources.ts` defines strict command, prompt-template, and authored skill file records. Command/template mutation requests carry the selected catalog's decimal uint64 `expectedRevision`; authored skill mutations carry the Host source's independent `expectedSourceRevision`. Markdown bodies, argument hints, groups, canonical agent IDs, and canonical provider/model selections remain typed wire fields. Native discovery IDs are opaque and grant no filesystem authority; a skill's optional `authoredSkillId` explicitly maps a discovered managed file to the Host authoring catalog.
