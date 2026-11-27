# @openchamber/agent-contract

`SessionUpdatedPayloadSchema` and `SessionStatusPayloadSchema` own the same
cross-field refinements for unstamped worker projections and stamped Canonical
events. Adding the event envelope uses `safeExtend`, without dropping checks.
`SessionSnapshotStateSchema` shares branch/selection/compacting/todo fields with
projection seeds; full snapshot cursor, run and window checks remain on snapshots.

Shared JSON wire types and Zod validation for the Canonical Agent API at `/api/agent/v1`. The Host, Agent Service and clients import this package; OMP SDK objects stay private to the Agent Service. The separate `ohpichamber-sdk` package remains the Guest extension contract.

Provider account rosters retain the strict `{ revision, providerId, accounts }`
shape for shipped clients. Account `active` retains its legacy meaning: the
explicit pin, otherwise the projected stored provider credential. The opt-in
`account-selection` GET returns `ProviderAccountSelection` with selection mode,
explicit `pinnedCredentialRef` (null in automatic mode) and overriding auth source.
The `automatic` mutation takes only `expectedRevision` and returns the legacy
roster; `select` pins a stored ref.

`questions.ts` owns the `omp.ask` control schema. Native HTML forms are parsed inside the worker into optional/required controls, immutable option identifiers with separate display labels, disabled choices, initial values and safe Markdown context. Raw HTML is never mounted. Native hidden fields, numeric conversion and constraint validation stay worker-private. Historical questions without these optional fields retain their existing behavior. `QuestionReply.action: "update"` saves current form values in the worker without answering and advances the pending CAS version. Only native form drafts with `timeoutResetAt` may advance their version while pending. It resets the native inactivity timeout (`timeoutResetAt`); a new-version `question.requested` event updates the countdown without publishing draft contents. Timeout submits the worker's last accepted values, including defaults and incomplete controls, to OMP. A form with no native timeout waits for a reply or run cancellation. All retained clients use this same Host Gateway flow; Guest SDK and remote mobile process ownership are unchanged.

Todos use OMP 19's `pending`, `in_progress`, `completed` and `abandoned` statuses, without blocker metadata. The service restores historical native todo snapshots and reminder notices with `blocked` mapped to `pending`; the UI applies the same normalization to historical tool-result details. Live canonical writes do not accept `blocked`.

Session metadata retains typed OhPiChamber workflow fields, including review offers and the `btwPromoted` marker. `SessionMetadataPatch` accepts native field updates and explicit `null` deletion; review-offer timestamps and promotion markers are validated rather than carried in an untyped extension object. `SessionCreateRequestSchema` accepts an optional `parentSessionId: EntityIdSchema` for establishing child session links within the same authorized workspace and project, and `RuntimeSession` projects this relationship.

`SessionControlRequest` accepts `compact.abort` without a run ID; its acknowledgement reports whether native compaction was active when cancellation was requested. Native lifecycle events, not the acknowledgement, clear the projected compaction state. Subagents may carry `stage`, `completionPercent` (0–100) and `recentOutput`. These are optional observations, not activity heuristics; native terminal status clears active-tool/retry indicators. Ordered task steps remain native and enter the existing canonical `task` as OMP's readable brief, rather than exposing native task files or execution objects. These additive fields and controls apply to all Canonical API clients through the Host Gateway; no Guest SDK or mobile execution changes are required.

The Host keeps the workbench fields in that same operational record because they outlive a page and must reach every device: `pinned: { at }` is the cross-device sidebar pin, `workbench: { lastIdleAt, viewedAt, lastTurnOutcome }` carries the unread watermark (a session is unread while `lastIdleAt` is newer than `viewedAt`) and how the last turn ended, and `turn: { endedAt, durationMs }` is how long it ran. The Host writes `workbench.lastIdleAt`/`lastTurnOutcome` and `turn` from canonical `run.completed`/`run.failed`/`run.cancelled` events, so the sidebar badge and unread dot do not depend on which client watched the turn. Clients advance `workbench.viewedAt` through a metadata patch; no session-record timestamp is reused for these marks.

`src/index.ts` exports each DTO and its `<Type>Schema`. Public package imports resolve to compiled JavaScript and declarations in `dist/`, so Node Hosts do not need a TypeScript loader or Bun. The package depends on Zod, not an agent SDK, UI framework or runtime implementation.

`prompt-receipts.ts` owns the durable prompt-submission receipt contract. `PromptReceiptSchema` records one admission decision keyed by the caller's correlation/idempotency id: an `accepted` row carries the admitted `runId` (plus the authored `userMessageId` once known) and a `rejected` row carries the sanitized Problem `code` and `detail`; both stamp their decision time and a 24-hour `expiresAt` validated to follow it. `PromptReceiptResultSchema` is the three-way query answer (`accepted`/`rejected` with the matching receipt variant, or `unknown` echoing the queried ids) — `unknown` is authoritative "no durable decision", never an error. The Agent Service owns persistence inside `session-references.json`; the Host only proxies the query. Receipts are wire records of outcomes, not part of `PromptRequest`: the correlation id travels by idempotency header and internal envelope, so queue captures never persist it per item.

Historical usage contracts (`usage.ts`) accept optional inclusive `from` and exclusive `to` epoch-millisecond bounds; omitted `to` defaults to now. The viewer IANA timezone is explicit. Optional opaque project/workspace IDs narrow the statistics to their Host-authorized sessions folders; no filesystem paths or report-range shortcuts are accepted. Reports distinguish partial per-source failures from complete empty success. `output` includes reasoning, so `reasoning` is a subset and never added to `total`. Unavailable reasoning tokens and tool duration medians are `null`; tool outcomes account for successful, failed, and unfinished calls. `accounts` projects native AuthStorage usage reports and history to quota fields only, and its strict schema rejects identity and credential fields. Native source parsing remains worker-private.

From this directory:

```sh
bun run build
bun run test
bun run lint
```

The [protocol contract](../../.workflow/omp-migration/contracts.md) owns routing, state authority, revisions, recovery and execution semantics. Schema validation checks wire records; it does not establish provider availability, dynamic JSON-schema support, authorization or endpoint implementation. Runtime owners must sanitize SDK errors, secrets and private paths before publishing their projections.

Native plugin contracts in `src/plugins.ts` distinguish global npm/git package installation from native marketplace user/project installation. Project scope is never synthesized for `PluginManager.install`, which has no scope parameter. Plugin settings are JSON-safe and described by native setting definitions; declared secret values are excluded from public catalogs. Local extension IDs identify flat source files under workspace `.omp/extensions/`.

`ExtensionInventorySchema` describes OMP's native extension control center: `providers` lists every registered discovery provider with a master `enabled` flag, `userSourceEnabled`, `foreignUserSource` and `itemCount` (including providers with no rows); `items` lists discovered rows across all 11 native capability kinds with `id`, `kind`, `providerId`, `scope` (`user | project | builtin`), display-safe `path`, `enabled`, `shadowed`, `shadowedBy`, `disabledReason`, `toggleable`, optional `description`, `triggers`, knowledge `content`, and sanitized `metadata`; `kinds` carries the native display name per kind so no label is invented in the UI. A shadowed row is never `enabled` and never needs a `disabledReason`; every other disabled row names one. `ExtensionInventoryStateSchema` pairs that inventory with the agent-directory owner revision, and `ExtensionToggleRequestSchema` carries `expectedRevision` plus exactly one of a provider switch, a `userSource` opt-in, or an item `extensionId` (item and `userSource` together are rejected). `PluginCatalogStateSchema` embeds the same inventory for its first read, but the extension routes and their revision are owned independently of the plugin registry revision.

Mutation results report committed persistence separately from each worker's applied revision. Installing or editing a module does not imply that a running session reloaded it. Explicit apply requests carry `strategy: "restart-idle-sessions"`; the service owns the safe worker-generation transition and reports actual outcomes. All counters are canonical uint64 decimal strings.

Catalog runtime rows belong to the requested workspace. Global package, user-marketplace and global-settings mutations, and explicit Apply, may return worker outcomes from sibling workspaces sharing the same private native plugin root; those outcomes retain each worker's real workspace and generation identity rather than being relabeled as the requesting workspace. Plugin revisions are owned by that actual native config/profile/XDG root, independently of provider catalogs and the agent-directory override. Native project marketplace mutations select affected roots by the actual nearest project registry identity.

Plugin setting and feature writes explicitly select `settingsScope: "global" | "workspace"`, independently of installation scope. `globalSettings` contains saved declared nonsecret global values; `settings` contains native effective values after project overrides. Per-setting `globalConfigured`, `configured`, and `overridden` flags describe those sources without disclosing secrets. Editing global settings never creates or writes a project override file. `PluginLifecycleStateSchema` is opt-in through the lifecycle route and carries feature metadata and saved nonsecret project settings; it does not extend `PluginCatalogStateSchema` or `PluginMutationResultSchema`.
`file-resources.ts` defines strict command, prompt-template, and authored skill file records. Command/template mutation requests carry the selected catalog's decimal uint64 `expectedRevision`; authored skill mutations carry the Host source's independent `expectedSourceRevision`. Markdown bodies, argument hints, groups, canonical agent IDs, and canonical provider/model selections remain typed wire fields. Native discovery IDs are opaque and grant no filesystem authority; a skill's optional `authoredSkillId` explicitly maps a discovered managed file to the Host authoring catalog.

## Agent tool grants

`Agent.allowedTools` is required and has three meanings: `null` inherits the SDK's captured default active tool set, `[]` grants no model tools, and a non-empty array is the exact allowlist. Canonical profile metadata preserves that distinction; native frontmatter is parsed by the SDK when canonical metadata is absent.
