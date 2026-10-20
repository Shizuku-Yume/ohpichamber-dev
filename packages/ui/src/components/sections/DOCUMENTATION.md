# Settings sections

One directory per Settings page. `shared/` holds the page chrome and controls
every page is built from; see [PATTERNS.md](PATTERNS.md#quick-primitive-selection) for
primitive selection and [layout](references/layout.md), [controls](references/controls.md)
or [search](references/search.md) for the affected branch.

## Project settings and the personal setup file

`projects/ProjectSettingsPanel.tsx` composes the project Settings page from
identity, actions, environment, the worktree section and the shared repository
file. Per-user project setup values are read and written through
`lib/openchamberConfig.ts`, which speaks only to the Host route
`GET/PUT /api/projects/:projectId/config`; it never reads or composes a file
path, so Web/PWA, Electron, hosted mobile and Capacitor behave the same.

`openchamber/WorktreeSectionContent.tsx` edits the personal worktree directory:
the base folder where new worktrees are created. It is a per-user value on the
project's setup, not part of the repository's shared
`.openchamber/project.json`. The field saves on blur or Enter through the same
personal setup write as the other values; empty input clears the override
(`null`) so new worktrees use the default location. The field keeps the path
syntax as typed — `~`, relative segments and absolute paths pass through
unchanged — because the Host owns resolution: relative paths start at the
primary worktree, `~` at the user's home, and absolute paths stay absolute. A
failed write shows the section's save-failed toast and restores the last saved
value.

## About and local connection setup

About displays the application and native app versions supplied by the connected Host or native shell. No OMP SDK build version is exposed, and the agent protocol version is not a build version. OpenCode installation, binary-path, restart and upgrade controls are retired. Application updates, native app updates and remote OpenChamber Host selection remain independent and available.

The desktop first-launch chooser records the user's local or remote Host choice without probing for an agent executable. Local startup failures use the existing Retry Local and remote connection recovery, not an engine installer. Environment variable editing remains Host-owned and no longer offers an OpenCode restart banner.


## Autosave on configuration and behavior pages

Settings entity pages (`agents/`, `commands/`, `skills/`, `mcp/`, `plugins/`, and
prompt templates) persist through Canonical APIs and the Bun Agent Service. Host
authentication and workspace authorization remain authoritative. Mutations use
structured Canonical API contracts with revision CAS and report typed outcomes.
These pages have no page-level Save, Apply or Discard button. The plugins page
also shows applied state; applying persisted plugins to idle sessions requires a
separate confirmation. `behavior/` writes profile response-style preferences
through `updateDesktopSettings` with the same silent-success and error-toast
autosave contract.

The contract, implemented by `shared/SettingsAutosave.tsx`:

- Toggles, chips, selects, pickers and row removals write immediately. They call
  `requestSave()` right after setting state; the hook runs the save after the
  render commits, so the routine reads the value the control just set.
- Text fields write when they lose focus. `SettingsPageLayout` takes the hook's
  `onBlurCapture`, which fires for any input, textarea or editor inside the
  page, so individual fields need no handler. Long editors (the skill document,
  a plugin file) also write on Cmd/Ctrl+Enter.
- A page's save routine compares the form against what it last wrote and returns
  `AUTOSAVE_UNCHANGED`, `AUTOSAVE_SAVED` or `autosaveFailed(reason)`. Success is
  silent and there is no inline "Saving…"/"Saved" indicator: a write is not
  something the user waits for. A failure is an error toast,
  "Couldn't save: <reason>", raised by the hook itself.
- **One page, one save routine.** All writes on a page go through that page's
  save routine, so a failure is reported once.
- Saves run serially. A save request received during a write queues one follow-up
  using the latest committed form state. Unmounting prevents that follow-up.

Do not route these pages through `reportSettingsSaveState` / `showSaveStatus`.
That indicator belongs to settings persisted by `updateDesktopSettings`, and it
is deliberately silent on success.

### Reconciliation

Store and catalog refreshes from the Bun Agent Service or Host can arrive before the
save promise settles, while the user is already editing the next version.
Commands compare incoming values with both the saved baseline and the normalized
submitted snapshot. Successful saves keep that normalized baseline for late
echoes. Agents and MCP preserve dirty drafts and their baseline during refreshes
of the same entity; successful saves advance that baseline. Skills and plugins
preserve dirty drafts while updating their server baseline. A failed write leaves
the form dirty for retry. Superseded skill detail reads are ignored.

Scope reconciliation to the selected entity and Settings directory. Selecting
another entity hydrates its form, and an older save completion must not replace
its baseline. Runtime endpoint changes remount Settings through the keyed
`SyncProvider` in `App.tsx`.

### Creating an entity

A new agent, command, skill or MCP server begins as an in-memory draft in its store.
Nothing is written while the draft is being filled in: the page shows Create and
Cancel, Create validates (name, and whatever else the entity needs) and writes
once, and Cancel drops the draft. Abandoning a half-typed entity leaves nothing
persisted. Once the entity exists, the page switches to the autosave rules above.

`skills/` follows the same split for supporting files: editing an existing file
writes when the dialog closes, while a new file is only created on confirm.

## Native plugins

`plugins/` consumes canonical native plugin DTOs through `usePluginsStore` and the
namespaced `canonicalClient.plugins` API on Web/PWA, Electron, hosted mobile and
Capacitor. SDK managers and extension execution remain private to the Bun service.
The Settings page uses the native plugin catalog and management actions; it does
not use an agent-auth integration catalog.

Package install, marketplace install, enable/disable, update and uninstall retain
native target identity. Plugin setting writes always target native global settings,
independently of installation scope. The editable JSON uses `globalSettings` and
sends explicit `settingsScope: "global"`; omitted declared nonsecret global values
are removed, while omitted secrets remain unchanged. Declared secret values are
never read back; separate masked replacement inputs use `globalConfigured`.
Existing native project overrides remain read inputs, never synthesized writes.
When overrides exist, the editor explains the distinction and shows effective
nonsecret `settings` as read-only JSON. JSON and local extension text autosave on
blur or Cmd/Ctrl+Enter; dirty drafts survive same-entity catalog refreshes and failed
writes. A failed local source read stays visibly failed rather than opening a
synthetic empty file.

Mutation banners distinguish committed persistence from applied, partially
applied, failed and no-active-worker outcomes. The runtime list shows each worker's
actual applied revision and errors. A separate confirmation explicitly restarts
idle sessions to apply persisted plugins; ordinary saves never restart sessions.
Marketplace discovery and doctor checks run only on explicit user action. Local
extension creation/edit/removal remains available independently of marketplace
egress policy; only the Host authorizes external operations.

## Providers

The page owns a non-persisted provider/model catalog store scoped to the selected
workspace and active runtime. It resolves the workspace through
`CanonicalClient`, then loads the canonical provider and model catalogs. A
failed request stays an error; it does not become an empty provider list. The
store contains no credentials or header values and resets when the runtime
endpoint changes.

Provider accounts, configuration, and OAuth methods are separate canonical
reads. Account mutation, API-key writes, OAuth completion, and custom-provider
updates use `CanonicalClient`; the page refreshes authoritative catalogs after
successful changes. Public catalog records never expose stored credential
values. Provider discovery is an explicit action and its result is a prefill,
not a recurring synchronization process.

The settings directory comes from `useSettingsDirectory`. The same page-owned
flow is used in Web/PWA, Electron, hosted mobile, and Capacitor; transport and
authentication stay in the Canonical Client and Host Gateway. Enterprise policy
continues to control which credential and custom-provider actions are shown and
accepted by the server.

The native custom-provider editor uses canonical configuration revisions and
the service's provider mutation contract. Catalog refreshes reflect the
authoritative result; a partial result remains distinct from an empty success.
Host-owned provider classification stays in its existing host-owned settings
surface.

### MCP OAuth

MCP OAuth is native and workspace-scoped through `CanonicalClient`. `mcp/McpOAuthSignIn.tsx`
resolves the workspace directory with `canonicalClient.resolveWorkspace` and reads
server OAuth state through `canonicalClient.getWorkspaceMcpOAuth`.

Flow mutations coordinate revision and worker ownership using `persistedRevision`
and `workerGeneration`. Actions (`start`, `complete`, `disconnect`) submitted via
`canonicalClient.submitWorkspaceMcpOAuth` pass both identifiers. Client secrets are
stored via a write-only credential reference using
`canonicalClient.writeWorkspaceMcpCredential`: the returned `credentialRef` is
passed as `oauth.clientSecretRef` on flow start, while the plaintext secret is
cleared immediately and never included in requests or catalog reads. Once the
flow yields an `authenticated` status, the page reconnects the MCP server to
update runtime connectivity.

### Authored resource visibility and authorization

Commands, prompt templates and skills use the native file-resource catalogs through `CanonicalClient.fileResources`. SDK discovery and filtering remain in the Bun worker. The renderer does not reconstruct legacy integration-use policies, and `allowedTools` is not treated as a file-resource authorization rule. Host authorization and native execution policy remain authoritative. The settings skill roster also exposes authored files that native discovery rejects, so malformed Markdown can be repaired without making it available to the composer.

Authored files use the native workspace or selected-agent roots and canonical revision CAS. Commands and templates preserve Markdown bodies, source/group metadata and canonical `agentId`/`modelSelection`; inherited definitions are read-only. Rename uses the canonical update operation rather than a create/delete pair. Skills preserve raw `SKILL.md` and supporting-file contents through Host source commits; a committed source revision is distinct from worker apply success.

Templates invoke native `/name` argument rules, not legacy aliases or `#` substitution. Argument parsing and expansion are worker-owned. All retained Web/PWA, Electron, hosted-mobile and Capacitor settings surfaces use the same authenticated Canonical gateway contract.

## Canonical entity ownership and shapes

Entity configuration and authored resources are owned by Canonical APIs and the
Bun Agent Service. Host authentication and workspace authorization remain
authoritative across Web/PWA, Electron, hosted mobile, and Capacitor. Mutations
use canonical revision CAS (`expectedRevision`, `expectedPersistedRevision`, or
`expectedSourceRevision`), ensuring concurrent or outdated mutations are detected
and rejected.

| Entity | What the page reads and writes |
|---|---|
| Agent | Canonical native profile: `name`, `description`, `model` (`{ providerId, modelId }` or `null`), `allowedTools`, optional `systemPromptOverride`, optional `permissionPresetId` |
| Command | Canonical authored entry: `name`, `description`, `content`, `argumentHint`, `scope` (`workspace` \| `agent`), `group`, `agentId`, `modelSelection`; worker-owned expansion |
| Prompt template | Canonical authored entry: `name`, `description`, `content`, `scope` (`workspace` \| `agent`), `group`, `agentId`, `modelSelection`; worker-owned expansion |
| Skill | Authored `SKILL.md` and supporting files scoped to workspace or agent; discovered skills report runtime metadata and content |
| MCP server | Canonical `MCPServerConfig`: `serverId`, `label`, `enabled`, `transport` (`stdio` with `command`, `args`, optional `envCredentialRefs`; `http` or `sse` with `url`, optional `credentialRef`, optional `headerCredentialRefs`) |
| Provider | Canonical `ProviderConfiguration`: `providerId`, `name`, `endpoint`, `protocol`, `credentialRef`; associated models and secret credentials |
| Plugin | Canonical `InstalledPluginEntry`: `id`, `target`, `name`, `version`, `description`, `scope`, `enabled`, `enabledFeatures`, `settingsScope: "global"`, `globalSettings`, `settings`, `settingDefinitions`; local extensions in `.omp/extensions/` |

Core ownership rules:

- **Edit stored canonical entries directly.** Stores read canonical DTOs and
  submit explicit mutation payloads. Pages avoid round-tripping resolved runtime
  defaults back into canonical storage.
- **MCP server enablement and per-write runtime guards.** The `enabled` boolean
  field controls whether the server is active. Setting `enabled: false` leaves the
  server configuration intact in the catalog while inactive. Mutations enforce
  per-write runtime guards: transport fields are validated per transport type
  (`stdio` requires command/args; `http` and `sse` require valid endpoint URLs),
  sensitive headers, URLs, and environment variables require write-only credential
  references (`credentialRef`, `headerCredentialRefs`, `envCredentialRefs`), and
  updates enforce `expectedPersistedRevision` CAS checks to prevent concurrent
  overwrites. Plaintext secrets are never accepted in configuration DTOs.
- **Agent allowedTools and execution authorization.** Agent `allowedTools`
  describes tool availability for the profile. Approval authorization belongs to
  Host authorization and native runtime execution policy (`respondApproval`).
  Agent profiles do not expose an ordered permission rules editor or preset
  catalog. Native profiles do not have hidden-agent flags.
