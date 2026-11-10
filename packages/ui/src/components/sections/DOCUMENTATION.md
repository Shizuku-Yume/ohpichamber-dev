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

<<<<<<< HEAD
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
=======
Source-control cards whose descriptor carries `auth.login` show its service-owned sign-in hint when that instance has no account. With no PAT method, the instance renders its signed-in user without token, add-account or CLI-switch controls. The service owns sign-in outside the app. Opening that card rechecks status; a failed read keeps the auth store's prior account metadata and reports an error, while only a successful empty result removes the displayed login. The same card is used by the web, desktop and mobile Integrations pages.

`providers/` is not an autosave page. Connecting a provider is an action, not a
setting: an API key is submitted, an OAuth flow is completed, a credential is
removed. OpenCode owns the credential store and announces every change
(`credential.*`, `provider.updated`, `model.updated`), and it watches the config file a custom
provider is written to, so the page never asks for a reload or a restart: it
refetches its own provider sources and integrations and lets the catalog
events refresh the stores. (The old "nudge" went through `/api/config/reload`,
which restarts a managed OpenCode and showed the reload overlay.)

Every credential write (`integration.connect.*`, `integration.oauth.*`) goes
to the location the integration list is read from, through
`getIntegrationClient()` in `lib/opencode/integration-catalog.ts`. OpenCode
registers integrations per location once that location's plugins activate,
and only `integration.list` waits for it. An unscoped write landed in the home
location, which nobody had read yet: it booted there and answered
"Integration not found", so every first connect failed and the retry worked.
`credential.*` routes are not location-bound and stay unscoped.

An integration method can declare a `form` (an Azure resource name, a
Cloudflare account id). OAuth, external and API key methods render it through
the same `ProviderFormFields`, check required fields with the helpers in
`provider-oauth.ts`, and send the answers with the connect call. OpenCode
rejects a key whose required fields are missing. A `custom` field with options
(AWS profiles, Azure resources OpenCode found on the server) offers "Other…"
for a value it did not find.
>>>>>>> bc50ba56a

The settings directory comes from `useSettingsDirectory`. The same page-owned
flow is used in Web/PWA, Electron, hosted mobile, and Capacitor; transport and
authentication stay in the Canonical Client and Host Gateway. Enterprise policy
continues to control which credential and custom-provider actions are shown and
accepted by the server.

<<<<<<< HEAD
The native custom-provider editor uses canonical configuration revisions and
the service's provider mutation contract. Catalog refreshes reflect the
authoritative result; a partial result remains distinct from an empty success.
Host-owned provider classification stays in its existing host-owned settings
surface.
=======
A provider's credentials show as one collapsible card per kind: API key,
browser sign-in, credentials on the server machine
(`providers/ProviderAuthMethodCards.tsx`, built on the Integrations page's
`IntegrationCatalogCard`). The same cards serve the connect page and a
connected provider's page, where they are always on screen. A card names its
kind, says in one line how it works, and carries a pill: In use, Not in use,
Sign in again or Not connected. Opened, it lists the stored accounts of its
kind with their Use, Rename and Remove actions, then the field or button that
adds another. Under a stored account that field or button waits behind "Add
account": an empty key field under a key reads as "replace this key" and a bare
Connect as "reconnect", while both add another account that becomes active. A
provider with one kind starts with its card
open. Keys from environment variables are listed above the cards. A key
OpenCode takes from the environment or the config, or credentials on the
server machine, mark their own card In use, or the key card when the provider
has no card of that kind. In enterprise mode the cards keep the stored accounts and
offer nothing new.

The cards replaced a separate account list over an "Add account" panel that
stacked the key form and the sign-in buttons. That panel read as steps to
complete in order: people saved a key and then signed in as well, and only
learned from "not in use" that one replaces the other, while the account list
repeated what the pills now say. A stored credential records its kind (`key`,
`oauth`, `external`) but not the sign-in method that made it, so the sign-in
methods of one kind (OpenAI's ChatGPT and legacy Codex flows) share one card.
Closing a card unmounts its body, which cancels a sign-in still waiting there,
the same as its Cancel button.

Vertex can sign in through Google Application Default Credentials on the server
machine, which OpenCode neither stores nor reports as a connection. When
OpenCode resolved a project for Vertex (`settings.project` on the provider it
serves), `usesMachineCredentials` counts that as credentials: the card shows
"From environment" and the models section stays open. A provider listed in the
OpenCode config is switched on (`activation: "enabled"`) even without a key, so
activation alone is not a sign-in signal.

The custom-provider form can discover models before save through
`POST /api/provider/discover-models`. Discovery is a one-time prefill the user
starts with "Find models": they pick which returned models to add, the review
panel closes, and nothing stays in sync with the provider afterwards (a
maintainer decision; never add a recurring refresh). Provider metadata wins
field by field and models.dev fills the gaps. Discovery failure never removes
rows or blocks saving.

Model rows render collapsed (name, id, limits, non-text inputs) so a provider
with dozens of models stays scannable; a row added by hand opens, and a row
with a validation error opens on submit. Capabilities are written to the
OpenCode config only when they are known (saved config, discovery, or the
user's edit, `capabilitiesKnown`); otherwise the key is left out so a save
never replaces what OpenCode knows about a model with a text-only default.

Custom-provider icons are OpenChamber profile preferences, keyed by provider
ID. They are not written into OpenCode config because OpenCode has no provider
icon field. "Default" stores nothing, so the provider's own logo (or the
generic fallback) still shows; `ProviderLogo` reads a chosen icon before trying
provider logos, so Settings, every model picker, the agent status chip, and
the message footer agree. The status chip and footer used to draw the logo
URL themselves, which skipped a chosen icon.

Any provider can also carry an uploaded logo image (`lib/customProviderLogos.ts`,
routes in `packages/web/server/lib/opencode/provider-logo-routes.js`).
`ProviderLogo` draws it first, then a chosen icon, an active extension's logo
(`contributes.providerLogos`, `lib/guests/provider-logos.ts`), the bundled logo,
the models.dev logo and the generic fallback. An upload or an extension's logo
keeps its colours, so it gets no `dark:invert`. While one loads the slot stays
empty at its size, except that a bundled logo stays on screen until an
extension's replaces it, and a failed load or draw falls through to the next
mark. VS Code and mobile keep the guest catalog empty, so extension logos do not
reach them. A custom provider sets the image in its edit form, beside the icon
picker, and Save applies what the user did there after the provider itself is
saved: a picked file is uploaded, Remove deletes the stored image, and an
untouched field keeps whatever is stored (a logo kept from when the provider
was last configured, or one another client just uploaded). A failed image write
is its own toast and does not reopen the form, whose next Save would store the
key again. Every other provider, and a custom one while
enterprise mode hides its form, sets it in a Logo section on its page, applied
at once. The chosen icon stays the fallback. VS Code runs no OpenChamber server,
so it neither offers the upload nor draws an uploaded logo; it shows the icon.

The "Connect provider" page lists `GET /api/integration` minus the
integrations that already have a connection, MCP OAuth registrations
(`mcp_*`), web search providers (the ones `websearch` lists, and integrations
a plugin marks with `metadata.websearch`, which it lists for search only once
connected), and providers OpenCode already lists (those
connect from their own page); v2's `GET /api/provider` lists only what is
configured or connected right now, so it cannot offer anything new
(`providers/connectableProviders.ts`). Popular providers come first as cards,
in the fixed order of `POPULAR_PROVIDERS`, with a one-line note and a
Recommended pill on the ones the maintainer recommends; every other provider
is a compact row behind "Show all", and the search covers all of them.

A provider OpenCode lists with no model at all keeps a card on the grid while
its integration holds a stored login (Copilot Free or Student): the login keeps
it off the connect page, so this card is the only way to sign out or switch
accounts. Its page is the usual provider page. Building such a provider from the
integration list was rejected, because OpenCode reports the provider itself and
the page then acts on OpenCode's record. A provider with no model and no stored
login, such as a config entry with an empty model list, has no account to
manage and stays off the grid.

The integration list is kept for the app session by
`lib/opencode/integration-catalog.ts`, so the page opens on it without a
loading state. The desktop/web/VS Code app reads it once at startup when the
browser is idle (`hooks/useIntegrationCatalogPrefetch.ts`); the phone layout
and relay connections skip that read, because relay bytes are paid, and read
it when Settings opens. The snapshot is only a starting point: the page reads
the list again on every visit and after every credential write, a read
started earlier never replaces a later one, and a snapshot from another
runtime is ignored.
>>>>>>> bc50ba56a

### Why runtime-only MCP rows wait for the config read

The MCP grid adds runtime-reported servers only after the directory's first
successful config read, matching configured servers by name so they never appear
twice. Showing runtime rows earlier would make configured servers flash as
read-only while their config loads; a failed initial read therefore keeps
runtime-only rows hidden until a read succeeds. These rows expose neither open
nor delete because no config entry backs them.

### MCP OAuth

<<<<<<< HEAD
MCP OAuth is native and workspace-scoped through `CanonicalClient`. `mcp/McpOAuthSignIn.tsx`
resolves the workspace directory with `canonicalClient.resolveWorkspace` and reads
server OAuth state through `canonicalClient.getWorkspaceMcpOAuth`.
=======
A remote MCP server with OAuth enabled is registered by OpenCode as an
integration (`mcp_<hash>`, `metadata.source: "mcp"`, named after the server)
with `oauth` methods, so signing in is the same connect / status /
complete flow the Providers page runs. `mcp/McpOAuthSignIn.tsx` looks the
integration up by server name in the server's directory (the registration is
per Location) and mounts the shared `providers/ProviderOAuthMethods.tsx`
with that directory. While the server reports `needs_auth`, the status card
shows its sign-in row; once the credential is stored, the page connects the
server again, which is what moves it out of `needs_auth` or `failed`.

A started sign-in keeps its row until it completes or fails, whatever the
status says (`onActiveChange`). A failed one stays only while the status
itself offers a sign-in, so its error never lingers on a connected server.
A sign-in from another machine writes the server's redirect first
(`packages/web/server/lib/opencode/mcp-oauth.js`), OpenCode reconnects the
server and reports `pending` for about a second, and
unmounting the row then cancelled the attempt: the first Connect did nothing
visible and only the second one opened the consent page. The Integrations
catalog keeps its sign-in row the same way.

The detail page looks up the integration for a failed server or a configured
remote server with `oauth !== false`. An absent `oauth` field is included:
OpenCode can discover OAuth without an explicit config entry. The lookup is
scoped to the selected server's directory and stops after 9 reads spaced
750 ms apart, including when a header/token-auth remote server has no OAuth
integration. Leaving the selection discards the result.

### Why a failed OAuth server's header says "Sign in again"

When the service rejects the stored token (a refresh answered with 403
`access_denied`), OpenCode reports the server `failed`, not `needs_auth`, and
keeps the rejected credential. Connect only sends it again. A fresh sign-in
starts with no tokens (it reuses only the earlier client registration) and
its new credential is the one the next connect uses, so signing in is the
whole recovery; no sign-out call is needed.

So for a `failed` server whose OAuth integration exists
(`useMcpOAuthIntegration`), the header's primary button is "Sign in again" in
place of Connect, and the card shows no second sign-in row: each press mounts
a fresh `McpOAuthSignIn` with `autoStart`. A single method starts immediately
with its start button hidden; multiple methods keep their start controls so
the user can choose one. Test connection stays on the status line for
the other cause of `failed`, a server that was down; it retries with the
stored credential. A `failed` server without OAuth keeps Connect.

The Integrations catalog keeps its sign-in row and labels its button "Sign in
again" for `failed`, gated on the entry's `auth: 'oauth'` so a failed
token-based entry gets no sign-in block. It starts the sign-in by itself after
an install only for `needs_auth`: a first connect that failed for another
reason waits for a click.

### Why a connected OAuth server offers Authorize

A connected transport can expose tools that still require user consent. When
an OAuth integration exists, the detail header offers Authorize unless the
server is `needs_auth`, `blocked`, or already offers Sign in again. Authorize
mounts the status card and the same sign-in flow, even while connected;
completion reconnects the server. Only one sign-in panel is mounted if the
runtime changes to `needs_auth` during that flow.

The Integrations catalog also offers sign-in for connected entries with
`auth: 'oauth'`, labeled Authorize. Its view is mounted by `MainLayout` on web
and desktop, not by mobile or VS Code; those use the shared MCP Settings page.
>>>>>>> bc50ba56a

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

<<<<<<< HEAD
The commands catalog projects all 29 built-in OMP commands alongside the dedicated `/btw` control as read-only, inherited entries with native descriptions and argument hints, skipping synthetic records when an inherited template is already discovered. Authored `.omp/commands/*.md` templates remain editable and uniquely addressable. Command selection operates on canonical `commandId` so same-name custom and built-in entries stay distinct in the sidebar and inspector; expansion on synthetic builtins preserves the literal command input rather than expanding empty content.

Authored files use the native workspace or selected-agent roots and canonical revision CAS. Commands and templates preserve Markdown bodies, source/group metadata and canonical `agentId`/`modelSelection`; inherited definitions are read-only. Rename uses the canonical update operation rather than a create/delete pair. Skills preserve raw `SKILL.md` and supporting-file contents through Host source commits; a committed source revision is distinct from worker apply success.
=======
OpenCode drops an MCP server or skill an `mcp.use` or `skill.use` deny names
(the server name or skill id, wildcards allowed) from its own lists, while the
MCP and Skills pages list what the config files and the disk hold.
`shared/useIntegrationPolicyBlock.ts` reads the statements from
`/api/config` (`readIntegrationPolicies`, decided like OpenCode: documents
reversed, last match wins) as `mcp:<name>` and `skill:<id>` resources. It also
takes the legacy `integration.use` statement with that prefix, which OpenCode
decodes into the new actions (since 2.2.3 `/api/config` serves only those), and
no other `integration.use`, which decides providers and accounts. The MCP page marks such a row "Blocked by
policy" and disables Connect and Test. Statements from a connected OpenCode
Console workspace are not in `/api/config`, so a server blocked only there is
not marked.

The Skills page reads the same statements from the skills store. One choice,
"Agents use it" (`skills/SkillUseField.tsx`), answers when agents get a skill:
Automatically, When called (the skill file's `disable-model-invocation` flag)
or Off. A skill's id is its `SKILL.md` folder name, not its display name. Off
writes an exact `skill.use` deny for the id where the skill lives (project config for a
project skill, global config otherwise) and leaves the file's flag alone;
leaving Off removes the exact deny, in either spelling (`skill.use` `<id>` or
the legacy `integration.use` `skill:<id>` an older OpenChamber wrote), from
every config file OpenCode reads for the directory, hand-written ones included. A skill an exact deny turns off
reads "Off" in the sidebar. A wildcard deny is someone else's rule: the choice
is locked, the row reads "Blocked", and the page names the rule and its file.
An allow that decides the skill is named the same way.
>>>>>>> bc50ba56a

Templates invoke native `/name` argument rules, not legacy aliases or `#` substitution. Argument parsing and expansion are worker-owned. All retained Web/PWA, Electron, hosted-mobile and Capacitor settings surfaces use the same authenticated Canonical gateway contract.

## Refreshed settings surfaces

The Settings shell and its shared chrome were refreshed from the 2026-10-26 upstream
tree and re-pointed at the fork's canonical data sources:

- **Chrome and controls.** `shared/SettingsSection.tsx` carries the upstream control
  primitives and size constants the pages now share; `shared/SettingsCards.tsx`
  exports `SettingsCardAction` for the Extensions page cards; the sidebar item and
  search rows take the upstream logical-direction classes. `views/SettingsWindow.tsx`
  focuses the search field through `data-settings-search`, and `views/SettingsView.tsx`
  resolves page titles through `lib/settings/pageTitle.ts` and opens the Chat tab
  that holds a search result through `chatSettingsTabs.ts`.
- **Chat.** `openchamber/ChatSettings.tsx` splits the former long Visual page into
  Messages, Composer and Assistance tabs. Every control still writes through
  `updateDesktopSettings` or `useUIStore`; the tab choice lives in
  `chatSettingsTabs.ts` so a search result or a deep link can select it. The desktop
  return-key and pasted-image preferences wait for their store and settings-registry
  keys (task 23/25), so they are not offered yet.
- **Session goal.** The Assistance tab mounts `openchamber/SessionGoalCheckerField.tsx`:
  the checker chip group selects OMP's native `judge` role (`classifier`) or the
  native small-model resolution (`small-model`), and the max-autoturns field edits
  `sessionGoalMaxAutoTurns` within 1–200 (default 20). A selected small checker
  explains itself and links to the Sessions small-model row; the `classifier` option
  keeps OMP's own `judge` role chain authoritative instead of claiming a Host
  classification provider is missing.
- **Session warming.** Only the workspace control remains:
  `openchamber/SessionWarmingCheckbox.tsx` reads and writes the workspace's cache
  warming through `CanonicalClient.readCacheWarming`/`updateCacheWarming`
  (`GET/PUT /api/agent/v1/workspaces/:workspaceId/cache-warming`) and shows the
  per-worker apply outcome. Upstream's per-session warming, its settings field and
  the session-menu toggle were removed (see the decision in `.workflow/decisions.md`);
  per-session warming returns only once the Agent Service owns it.
- **Extensions.** `extensions/ExtensionsPage.tsx` renders installed and guest
  extensions as cards with a detail view, install-source badges, the approval dialog
  and the website locale links. Guest capabilities and permissions come from the
  Host's extension records; nothing is installed from the page without an explicit
  action.
- **Adopted pages.** Voice, session retention, managed SSH credentials, app-link
  security, notifications, shortcut recording, the theme catalog dialog and picker,
  and the Extensions grid take upstream's current copy and layout.

<<<<<<< HEAD
Deferred to the tasks that own their data, with the dependency named in each commit:
the General/Chat/Appearance page split (`GeneralWorkspaceSettings`,
`DesktopAppSettings`, `FinishedWorktreesSettings`, `MobileWorkspaceTabsSettings`),
the settings-registry keys for helper-model thinking levels and tunnel HTTPS port,
the tracker and source-control provider cards (`lib/trackers/registry`,
`lib/source-control/providers/registry`), the Magic Prompts scoped-override page,
the agent knowledge/workflow/render tool toggles, the tunnel mode rework, passkey
rename, plugin runtime status and the skills catalog rows.
=======
### Switching a plugin off

The Plugins list is the only place a plugin is switched on or off; the detail
page carries no control. The switch records the entry's `plugin:` resource in
OpenChamber's own store, and the config layer of the OpenCode OpenChamber starts
denies it there. The user's OpenCode config is not written, so the TUI and any
external server keep loading the plugin. A switched-off plugin reports what
OpenCode reports for any plugin that does not load: `Not loaded` on the card's
status pill. The pill keeps that wording, and the card never adds a "Disabled"
pill, because the switch beside it already says who turned it off.

The switch belongs to OpenChamber and covers every project of the OpenCode it
starts, while web and VS Code each keep their own. The page description says
that plainly, because a project-scope card suggests otherwise.

When a deny the user wrote themselves blocks the entry, the switch is disabled
and the detail page says under the status banner that a rule in the config
blocks it. The switch also stays disabled until the policy read succeeds, and
while it is failing, because a denied plugin and an enabled one look the same
before the config is read. A runtime OpenChamber did not start, or a store it
cannot read, reports `unavailable`: the switch stays disabled and says the switch
applies only to the OpenCode OpenChamber starts. VS Code renders the same switch
through its bridge; an external OpenCode server (`openchamber.apiUrl`) reports
every row as unavailable because the extension applies a switch only to the
OpenCode it starts.

An allow that OpenCode ranks above the denial makes the denial do nothing, so the
row shows the plugin as on, with the switch disabled and the reason beside it.
The server reports this as `overridden` from the config files it reads and
refuses the change. The grid also treats a stored off as overridden when a real
allow statement decides the plugin in `/api/config`, which is the only view of
system and Console policies. The absence of a deny proves nothing there: OpenCode
applies a rewritten managed file a moment after the write, and the
`OPENCODE_CONFIG_CONTENT` path only at the next launch.

The same delay keeps OpenChamber's own deny in `/api/config` after a plugin is
switched back on. A row switched on ignores an exact deny from that layer
(`opencode.managed.json`, or the pathless `OPENCODE_CONFIG_CONTENT` document),
so the page never tells the user to remove a rule that is ours. `config.updated`
and `plugin.updated` re-read the policies with the plugin list, which also
carries a switch flipped in another client.

Every disabled reason sits in a `SettingsInfoHint` beside the switch. A disabled
switch takes no tap and a native title never shows on touch.

### Why the switch layer is told apart by its document

The page could remember which plugins it just switched on, but that memory is
gone after a reload, and the `OPENCODE_CONFIG_CONTENT` deny lasts until the next
launch. The document a statement came from is in every read. The cost is that a
user's exact deny written into `OPENCODE_CONFIG_CONTENT` by hand reads as ours.

## Skills catalog list
>>>>>>> bc50ba56a

## Canonical entity ownership and shapes

<<<<<<< HEAD
Entity configuration and authored resources are owned by Canonical APIs and the
Bun Agent Service. Host authentication and workspace authorization remain
authoritative across Web/PWA, Electron, hosted mobile, and Capacitor. Mutations
use canonical revision CAS (`expectedRevision`, `expectedPersistedRevision`, or
`expectedSourceRevision`), ensuring concurrent or outdated mutations are detected
and rejected.
=======
### Why a threshold and not a virtualized list for every source

A source can hold thousands of skills: `sickn33/agentic-awesome-skills` has
8,451, and mounting them all froze the page for about 28 seconds on a source
click and up to 47 seconds per search keystroke (#5455). Most built-in
catalogs hold fewer than 60 rows, and a fully mounted short list keeps the
browser's find-in-page and Tab order over every row.

### Why the list waits for the page's scroller

A virtualizer attached before it knows the scroller starts at offset 0 and
scrolls there, so clicking Cursor or a large source on a scrolled page jumped
to the top. The list finds the scroller first, starts from its `scrollTop`,
and holds its estimated height meanwhile, because a list of height 0 for one
render shortens the page and the browser clamps the scroll position.

### Why a row measured at 0 keeps the estimate

A page hidden while the list is mounted measures every row at 0 height. The
virtualizer would then fit the whole list into the viewport, mount all of it,
and re-render without end, so a zero measurement keeps the estimated height.

## Integrations: provider cards

`integrations/IntegrationsPage.tsx` draws one card per source-control provider
and one per tracker the connected server serves, in the registries' order
(`lib/source-control/providers/registry.ts`, `lib/trackers/registry.ts`). No
card names a provider: a provider the server adds (Gitea) appears with no code
here. Source-control cards are left out in VS Code, which uses the editor's own
Git integration; tracker cards exist where the runtime has `RuntimeAPIs.trackers`.

`integrations/SourceControlProviderCard.tsx` takes its name, mark and wording
term from the descriptor. Its body is one `openchamber/ProviderInstanceAccounts`
block per instance of that provider (the default instance stands in until one
is listed), and "Add instance" where the descriptor's settings take an address
(an `instance-url` field) and `instances.multiple` allows another or none is
set up yet. A block offers the sign-in methods the descriptor names *and* the
instance reports available (`capabilities.authenticationMethods`): device
code, personal access token, and the provider's CLI login. When both the
device code and a token are offered, a chip switch (`SettingsChipGroup`)
picks one and only its form shows; it starts on the method an existing
account came from (`oauth` is the device code, `pat` the token), else the
first one the descriptor names. The CLI login keeps its own row. The token
form shows the scopes the descriptor names, literally, under "Create token";
the info hint stays.
Where the descriptor's settings have a `username` field, the token form asks
for a username above the token and sends both (`authSetToken(…, { username })`);
an `http-password` field names the secret an HTTP password instead of a token
(`sourceControlProviderSettings.ts`). Gerrit signs in this way. A settings field
with the id `sshUrl` adds an instance-level SSH address row, saved through
`authSetSshUrl`; Gitea and Forgejo use it when `SSH_DOMAIN` differs from the
web address. Its published kind stays `instance-url` so older clients, which
ignore field ids they do not know, still draw the card.
`normalizeInstanceInput` reads what the user typed the way the descriptor
says: an origin or a bare host, HTTPS only (HTTP on loopback where allowed), a
port only where allowed, reserved instances refused.

Invariants:

- A token field is a password input that starts empty, is cleared once the
  server accepts the token, and is never logged; a rejected token
  (`INVALID_TOKEN`) stays in the field with the rejection under the address.
  An instance the server says belongs on another provider's card
  (`SourceControlInstanceOtherProviderError`) keeps the token too, and the
  line under the address names that provider by its descriptor's label.
- An instance's async work is dropped when the runtime switches mid-flight
  (`captureRuntime`), so a late answer never writes into the next server's state.
- The github.com device flow (`openchamber/GitHubComAccountSection.tsx`) shows
  only for a descriptor whose `instances.legacyFlow.kind` is
  `github-com-device`; the instance list under it, titled "Other instances",
  leaves that instance out.
- A descriptor that names a settings field kind this version cannot draw shows
  an "update OpenChamber" line instead of the instance setup.
- Settings search anchors: the card is `integrations.source-control.<id>`, its
  body `.connect`; tracker cards keep `integrations.<id>` and its
  `.add-workspace`, `.mapping` and `.session-comments` anchors, the ids
  Linear's entries always had.

`integrations/TrackerSettings.tsx` is the tracker card: browser sign-in with a
poll that stops when a new or re-authorized account appears, disconnect, and the
account switch where `multipleAccounts` is set. `TrackerProjectMapping` and
`TrackerSessionComments` show where `projectMapping` and `sessionComments` are
set. A tracker that offers no browser sign-in asks for an update instead of a
dead Connect button.

A tracker an extension serves (`ext-<guest id>`, `lib/trackers/extension.ts`)
gets the same card, drawn by `integrations/GuestIntegrationsSection.tsx` under
"Extension accounts" beside the extension's notification channel, and
`IntegrationsPage.tsx` leaves it out of the built-in list. The card takes the
installed extension and its public tracker contribution (`extension` prop) and
reads the connect form from the auth status's `connect` block, never from the
manifest alone: a `user` instance asks for the server address until an account
lives on one (the first connect fixes it, a saved client alone does not, so a
mistyped address is corrected by typing again; `INSTANCE_MISMATCH` says a
second account must be on the same server); `token` auth shows the token form
with the scopes and "Create token" link the contribution names, and a username
where its scheme is `basic`; `oauth` auth shows the client id and secret form
with the redirect URL to copy until the server holds a client (`hasClient`),
then the browser sign-in. A tracker that takes both shows one form at a time
behind a "Browser sign-in / API token" chip group, with one Connect button.
While an account is connected the forms stay closed: Add account (where
`multipleAccounts` is set) opens them with a Cancel beside, or starts the
browser sign-in at once when that is the only step left. An extension's
account name is the person, so the card names it once. Each failure code the connect routes answer
(`TOKEN_REQUIRED`, `TOKEN_REFUSED`, `USERNAME_REQUIRED`, `USERNAME_INVALID`,
`INSTANCE_REQUIRED`, `INSTANCE_MISMATCH`, `UNSUPPORTED_INSTANCE`,
`CLIENT_MISSING`, `TRACKER_UNAVAILABLE`, `CONNECT_SUPERSEDED`) has its own
toast (`settings.integrations.tracker.toast.*`), so a refused token is said in
the tracker's name and never as "something went wrong"; a code the card does
not know (`ACCOUNTS_FULL`, a route's `INVALID`) shows the server's own
sentence. `trackerSettings.i18n.test.ts` holds every key these files name to
the English dictionary. A written-off account
arrives as `connected: false` with the account in `accounts` (`status:
'invalid'`): the card shows the attention line, the server it was on, the
connect form again and Disconnect, which removes it and frees the server. The
card's description names the extension; its title is the tracker's label. Hosted and Capacitor mobile show
no extension-account cards, as for channels: accounts are connected from web
or desktop, and the phone shows the tracker's items once they are.

### Why the extension tracker card sits under Extension accounts

The maintainer placed it beside the extension's notification channel rather
than among the built-in integrations: everything one extension owns is in one
place, and "Built-in integrations" stays what ships with OpenChamber. The card
itself is `TrackerSettings`, so mapping and session comments read the same.

### Why `{provider}` keys and not keys per provider

The sentences these cards show name the provider through `{provider}` and the
CLI through `{cli}` (`settings.sourceControl.*`, `settings.integrations.tracker.*`),
so a provider the server adds reads correct sentences with no keys of its own.
`openchamber/sourceControlProviderSettings.ts` selects only what really differs:
the description by change-request term and the instance hint by
`allowLoopbackHttp`. `integrations/trackerSettingsCopy.ts` keeps whole sentences
per tracker only where they carry the tracker's own nouns (Linear's workspace
and team), because interpolating a noun breaks case and gender in de, pl, uk
and fr; any other tracker reads the generic account and group sentences.

### Why a method switch and not stacked rows

The sign-in methods used to stack, the device code's Connect above the token
field, so a first visit read as two competing forms. The maintainer chose a
chip switch: the card opens on one Connect choice and the other method is one
click away. A chip group rather than radios because the labels are short and
`settings-ui-patterns` puts short exclusive choices in chips.

## Magic Prompts

`magic-prompts/` is not an autosave page: each prompt block has its own Save
and reset button. Storage and resolution belong to
`packages/web/server/lib/magic-prompts/DOCUMENTATION.md`.

The page opens on the Global scope. The Project scope edits the project the
Settings project selector names, matched by exact path, so a worktree
registered as its own project keeps its own id. Choosing it never moves the
chat. Saving the built-in text in Global removes the global override; in
Project the same text stays an override, because it still wins over a
different global one.

A failed read or an `invalid` scope shows the error with Retry and no editor,
never editable built-in text. Drafts and writes are kept per runtime, scope,
project and prompt. A context runs one write at a time, because every write
answers with the whole scope and overlapping answers could land out of order,
and a read older than the latest write is dropped. File paths render as their
own `dir="ltr"` element so an RTL sentence never reorders them.

The page is hidden in VS Code (`metadata.ts`).

## Plugin duplicate sources

`plugins/PluginsGrid.tsx` keeps every configuration entry and its editing target.
A discovered package card is hidden when its normalized target is already
represented by a declaration or another discovery record. Distinct declarations
and their options remain separate, including declarations of the same target.
Editable local files always keep their own cards and file edit/delete actions,
including files declared in config.

### Why paths determine discovery duplicates

Names can match for unrelated plugins, and OpenCode's runtime list can omit
disabled or not-yet-loaded plugins. Only exact target paths filter discovery;
runtime status never controls card membership. Web, Electron and mobile use the
server's path metadata; VS Code's file-only discovery stays visible.

Discovery records keep their original `absolutePath` for runtime matching and
their canonical `resolvedPath` for duplicate filtering. Resolving symlinks in
the runtime path would lose statuses reported through the original alias.

## Entity shapes: OpenCode 2 only

Every OpenCode entity these pages read and write speaks the v2 shape defined in
`packages/web/server/lib/opencode/DOCUMENTATION.md`, section "Entity routes (v2
shapes)". The server reads v1 files too and rewrites them in place as v2; the UI
only ever sends v2.
>>>>>>> bc50ba56a

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
## Sessions (DefaultsSettings)

`DefaultsSettings.tsx` configures what a new session starts with. Model roles are OMP's own `modelRoles` record, written through `canonicalClient.updateOmpSettings`; the app keeps no second copy.

- **Default model and thinking:** writes `modelRoles.default`, with the chosen thinking level as the `:effort` suffix. `supportsReasoning` decides whether the effort picker is shown.
- **Default agent and auto-apply:** writes `defaultAgent` (the shared settings registry). Picking an agent calls `setAgent(name, { keepModel: !autoApplyAgentModel })`, so auto-apply makes the agent's pinned model win; without it the open chat keeps the model it already had.
- **Small and walkthrough models:** each has its own "use default" checkbox plus a picker. Unchecking enables the picker immediately, even before a value exists, and writes the native role (`smol`, `slow`). The walkthrough pick writes only the native `slow` role, which is exactly what `lib/walkthrough/index.js` resolves (`describeSmallModel(..., { role: 'slow' })`); there is no second Host copy of the choice.
- **Fallback model:** reads and writes native `retry.fallbackChains` for the `default` selector, enables `retry.modelFallback` on a pick, and "None" deletes the whole default chain rather than leaving a hidden later link.
- **Concurrent edits:** a 409 re-fetches the workspace settings and re-applies only the entries this write changed (`changedRoles`); every other role, including array-valued ones, survives. Role values are parsed with the canonical `JsonObjectSchema`, so an array-valued role is never dropped by an unrelated edit.
- **Permissions and Plan mode:** `PermissionDefaultModeField` writes `permissionDefaultMode` (the Host applies it to new top-level sessions). The "allow subagents in Plan mode" row writes `planModeAllowAgents`, which the Host captures into the worker bootstrap and the worker enforces while Plan mode is active.

<<<<<<< HEAD
All labels come from the shared dictionaries; none are hardcoded here.
=======
Settings lists hidden custom agents so their files remain editable, renameable, and deletable. Hidden built-in agents stay out of Settings, and all hidden agents stay out of the composer pickers. Duplicate and rename read the stored entry and preserve its `hidden` flag.

OpenCode 2 replaced the v1 `permission` map (`bash`/`task`/`list`/`lsp` keys with
allow/deny/ask per pattern) with an ORDERED list of `{ action, resource, effect }`
rules where the LAST match wins. The user does not think in ordered rules, so
the editor keeps the v1 mental model: one row per tool with inherit / allow /
ask / deny, an arrow showing what OpenCode will actually do for that tool right
now, and resource patterns under an expanded row. `agents/agentPermissionModel.ts`
translates this view to and from the rule list. Because order is part of the
policy, a save edits the stored list in place: changed effects replace their
rule where it stands, removed rows drop theirs, rules the view cannot show (an
`*` action with a resource pattern) pass through untouched, and only new rules
are inserted (agent wildcard first, a tool's wildcard before its patterns, a
pattern last), so decisions for tools the user did not touch never change. The
arrow is computed from OpenCode's built-in defaults
(`OPENCODE_DEFAULT_RULES`), the global `opencode.json` rules and the agent's
own wildcard, in that order. v1-only keys (`LEGACY_ACTIONS`) are neither shown
nor written back.

Below the built-in tools the editor lists one row per MCP server from the
Settings directory's config (`useMcpConfigStore`), keyed `<server>_*`, which
OpenCode matches against every tool the server exposes. Every configured server
is listed, not only the connected ones, so a rule can be set while a server is
disabled or failing; the live status from `useMcpStore` is shown beside the
name as a hint. A single MCP tool (`<server>_<tool>`) is still reachable
through the custom key input.

### The legacy-format note

Config reads report `legacy: true` when the entity's file still uses v1
spellings, and mutations answer with the `path` they wrote.
`shared/SettingsLegacyFormatNote.tsx` turns that into one quiet line at the top
of the page; the file is never moved, so the note has no action.

## The project page

`projects/ProjectSettingsPanel.tsx` is one project's page, shown by Settings →
Projects (`frame="page"`) and by the sidebar's project edit dialog
(`frame="dialog"`). The header holds the icon, colour and name: the icon opens a
popover with the colour (`shared/SettingsColorField.tsx`, the same field the
Agents page uses) and the symbol or image, and the name is edited in place. Below
it a tab strip splits the rest: General (new-chat defaults, the team file, trust,
plans folder), Actions (a card grid with an editor dialog), Worktrees (setup
commands and a link to the worktrees page) and Environment (not in VS Code).
Identity fields autosave through `useProjectIdentityAutoSave` after 450 ms.
Unmounting flushes the pending valid name. Writes run serially and retain the
latest committed edit during a write, including after unmount, with the captured
project and save callback. Pending snapshots are retained per project when the
mounted panel switches projects. A trailing edit reuses a completed icon operation.
Queues for the same project drain in order across editor remounts; other projects
do not wait for them. Queue tails are released after success or failure.
Empty names are never saved. Failed saves show an error toast.

### Why identity saves finish after unmount

Closing the editor accepts its edits, so canceling the debounce or a queued
follow-up would lose the last name typed. The mobile session sheet's separate
editor keeps its explicit Save action. VS Code rejects project metadata writes.

### Why identity queues share a project tail

An upload may finish after its editor closes. A reopened editor waits for that
editor's writes and trailing edit before saving, so an old snapshot cannot
overwrite the newer name. A per-mount saving flag cannot order these writes.

The Settings page also carries Close project in its header. It calls the same
`removeProject` as the sidebar's Close project, after a confirm dialog like the
other removals in Settings: a header button is easier to hit by accident than a
menu item. The edit dialog leaves it out, because the menu that opens the dialog
already holds Close project. VS Code shows no Projects page in Settings: its
projects are the workspace folders VS Code has open.

A project's setup lives in two files: the team's `.openchamber/project.json` in
the repo and the user's own config (`packages/web/server/lib/projects`). The page
shows one list per kind with every entry marked Team or Only me, and
`projects/projectSetupModel.ts` maps each edit onto the file the entry lives in:

- Team entries are edited in place, in the repo file. Nothing is copied into
  the personal file.
- A move between the files writes the destination first, then removes the
  entry from the source. A failed second write leaves the entry in both files;
  the server's merge shows it once. Every edit ends with a fresh read.
- Hiding a team action writes only the personal `hiddenSharedActionIds`.
- When the repo file exists but cannot be parsed, team writes are refused: a
  write replaces the file, so it would drop what could not be read.
- `projects/useProjectSetup.ts` reads with `fetchProjectSetup`, which throws.
  A failed read shows a retry, never an empty list that a later save would
  write back over the files.

The Settings page keeps its tab in `projects/projectSettingsTabs.ts` so a search
result can open the tab that holds its target (`prepareSettingsSearchTarget`).
The dialog keeps its own tab and starts on General every time.

Project colours are six-digit hex from the same presets as agents
(`lib/colorPresets.ts`), and an image icon takes the colour as its background
(`iconBackgroundForProjectColor`). Projects saved by older builds may carry a
theme key; `resolveProjectColor` in `lib/projectMeta.ts` still paints those,
and the colour field shows them as a selected swatch until the user picks again.

## Appearance: color mode and theme list

`openchamber/ThemeAppearancePicker.tsx` owns the color mode cards and the
theme list; `openchamber/ThemeSchematic.tsx` draws the app on the cards.

- The schematic paints each part with the token the real component uses, with
  `cssGenerator`'s fallback chain and the opacity the component puts on top
  (message text at 90%, the selected session row at 70%, the effort label at
  75%, inline code and its background). A component that changes its token or
  opacity changes the schematic in the same change, or the cards stop showing
  what the theme looks like.
- Colours come from the `Theme` object, never from CSS variables: the cards
  show themes that are not active.
- The drawing follows the device: the phone layout under `isMobile`, the
  desktop layout elsewhere.
- Hovering a theme previews it on the cards and applies nothing. Touch has no
  hover, so a tap selects at once.
- The list keeps the chosen theme in view when it opens, when the tab changes
  and when its column count changes; a scroll that reaches its end goes on to
  the page.
- Imported themes show their delete action in the list at rest, so it is
  clear which themes are imported.

### Why one variant at a time and not both swatches per row

Each row once held a light and a dark swatch with four status dots each; at
thirty themes the list became a wall of dots. A Light / Dark switch shows one
column of choices, the cards above carry the preview, and each row needs only
the theme's canvas and accent.

### Why the list scrolls on its own

Imported themes add up quickly (the catalog, a themes folder). Without a cap
the page below the list moves further down with every import.
>>>>>>> bc50ba56a
