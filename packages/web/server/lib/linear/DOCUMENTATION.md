# Linear Module Documentation

## Purpose

This module owns Linear as the first work-item tracker (`../trackers/`): Linear OAuth, issue lookup, Linear-team-to-project mapping, issue status updates, and session status comments on Linear issues. Credentials live on the OpenChamber server, so web, desktop, and a phone paired to that host share them. You can store more than one Linear workspace; exactly one is current. Issue list, mapping, and new OAuth default to the current workspace. Session status comments use the workspace that started the session. The right-hand context panel lists issues for the current workspace, can switch workspace, filters the list, shows a read-only card, changes status or closes the issue, and starts a session or worktree. Start session stays visible in a footer while the issue card scrolls. The chat picker lists issues and attaches them to a message. New Worktree can also start from a Linear issue in the currently active project. A session started from a Linear issue can post started/completed/failure comments, each with an OpenChamber session link. Those comments are opt-in and only appear when this server has a publicly reachable address.

Hide Linear UI when the API is missing.

## Entrypoints and structure

The `.js` paths below are import specifiers. The auth, client, issues, OAuth
and session-status implementations have `.ts` source files.

- `packages/web/server/lib/linear/index.ts`: the lazy boundary. It exports one object, `linearLibraries`, with exactly what `routes.js`, `tracker.js` and `auth-status.ts` take; `routes.js` and `tracker.js` load it with `await import('./index.js')` on first use and hand it to `auth-status.ts`, so Linear's libraries stay out of server startup. One named export keeps that boundary visible to the dead-code check (a namespace read through a variable is not).
- `packages/web/server/lib/linear/routes.js`: Express registration for the public callback, `/api/linear/auth/*`, `/api/linear/issues/*`, `/api/linear/mapping`, and `/api/linear/session-status`. These are the legacy Linear-shaped routes; they stay for older bundled phone UIs and the SDK's host-Linear guests (see `../trackers/DOCUMENTATION.md`).
- `packages/web/server/lib/linear/tracker.js`: Linear as the first tracker. Holds the plain-JSON descriptor and the adapter that maps Linear shapes to the neutral tracker contract (`../trackers/tracker-contract.d.ts`): state type to category (`triage`, `backlog`, `unstarted` → `todo`, `started` → `in-progress`, `completed` → `done`, `canceled` and `duplicate` → `canceled`), priority 0–4 to `none`/`urgent`/`high`/`medium`/`low`, team to container, `subIssueProgress` to progress, `subIssues` to children, comment `user` to author, workspaces to accounts. Neutral state filter ids map to the list `status` (`in-progress` → `started`, `done` → `completed`; `inReview` and `duplicate` are Linear's own extras). `matchUrl` follows the descriptor's URL pattern; the session-link writer (`../openchamber-sessions/session-link.js`) calls each registered tracker's `matchUrl` directly, and the UI matches links against the served descriptor's patterns. Both sides assert one URL table (`packages/ui/src/lib/trackers/linearUrlCases.fixture.ts`). Live summaries keep `state.type` beside `state.category` for older bundled UIs. A state type this build does not map (one Linear adds later) reads as `todo` in live summaries, because the live-summary category cannot be null in the UI's schema: the item keeps its badge and the open cadence instead of dropping out as no longer answered, which would blank its state. It loads the Linear libraries lazily through its registry entry.
- `packages/web/server/lib/linear/auth-status.ts`: auth status (broker claim, identity refresh, 401 handling), storing an OAuth result, and disconnecting the current workspace. Shared by `routes.js` and `tracker.js` so both answer from one code path.
- `packages/web/server/lib/linear/auth.js`: auth file, client id, scopes, redirect URI.
- `packages/web/server/lib/linear/oauth.js`: authorization-code + PKCE S256, public callback broker handoff, refresh, revoke.
- `packages/web/server/lib/linear/client.js`: GraphQL helper, viewer/organization lookup, and access-token refresh. GraphQL errors prefer `extensions.userPresentableMessage` / validation constraints over the generic `Argument Validation Error` label. User-facing Linear errors set `LinearApiError.userError`. Requests send `public-file-urls-expire-in: 3600` so file URLs in issue descriptions and comments are temporarily readable in the issue preview.
- `packages/web/server/lib/linear/issues.js`: list/search/get issues, team workflow states, `issueUpdate`, and `commentCreate`. Parses identifiers and Linear URLs. `issueUpdate` resolves identifiers to UUIDs first because Linear's mutation does not accept `ENG-12`. List/get include `state.id`, `priority` (0–4), and labels (`id`, `name`, sanitized hex `color`) so the board can show them and update status. Every issue also carries `parent` (the issue's own fields without labels) and `subIssueProgress` (`{ total, done, more }`, done counts completed, canceled and duplicate states, null without sub-issues). Linear has no sub-issue count and every connection multiplies a query's complexity by its page size (one query may not exceed 10,000 points), so a list asks only the first 20 sub-issue states per issue; `more` says there are others. Get and update add `subIssues` (first 100, related-issue fields, in Linear's `subIssueSortOrder`) and `subIssuesMore`.
- `packages/web/server/lib/linear/teams.ts`: list Linear teams for mapping UI.
- `packages/web/server/lib/linear/mapping.js`: persist default and per-team OpenChamber project paths. Separate from the auth file so disconnect does not wipe maps.
- `packages/web/server/lib/linear/status.js`: persist per-session started/completed/failure flags and post the matching Linear comment with an open-session URL. Posts nothing unless the user opted in and the session origin is public; `isPublicSessionOrigin` rejects loopback, private LAN, carrier-grade NAT, link-local and single-label hosts. The dedupe file keeps the newest 500 sessions.
- `packages/web/server/lib/linear/status-runtime.js`: on the OpenCode event hub, first `session.status` idle after started posts completed once; `session.error` (except abort) posts failure once.
- `packages/web/src/api/linear.ts`: web client wrapper. Electron and hosted/Capacitor mobile reuse it.

## Public routes

The shared UI reads Linear through the neutral tracker routes, `/api/tracker/linear/*` (`../trackers/DOCUMENTATION.md`), which call the same functions. The routes below are the legacy Linear-shaped set.

- `GET /linear/oauth/callback`: public fallback for an explicitly configured direct redirect URI. When a broker URL is configured, the flow uses the stable callback broker instead, because desktop and self-hosted instances may have private or dynamic addresses.
- `GET /api/linear/auth/status`: connected flag, current user/organization/scope, and `workspaces` (id, name, current, user, authorizedAt). Never returns tokens. A 401 on the current workspace drops that workspace only; if another remains, status returns that one instead of disconnected. Identity refresh does not bump `authorizedAt`.
- `POST /api/linear/auth/start`: returns `{ authorizationUrl, expiresIn, scope }`. Body may include `origin: "desktop"` so the callback page can raise the desktop window. The authorize URL uses `prompt=consent` so Add workspace can pick a different Linear org. Completing OAuth stores or replaces that org and makes it current.
- `POST /api/linear/auth/activate`: body `{ organizationId }`. Makes that stored workspace current. 400 if the id is missing, 404 if it is not stored.
- `DELETE /api/linear/auth`: revokes the current workspace refresh token when present, then drops that workspace only. Other stored workspaces stay. Mapping is kept.
- `GET /api/linear/issues/list?query=&cursor=&status=&assignee=&teamId=&priority=`: issues from the current workspace. Omitted `status` is incomplete states (same as the chat picker). The board sends `all`, `backlog`, `todo` (Linear `unstarted`), `started` (In Progress, excluding the In Review name), `inReview` (state name In Review), `completed` (Done), `canceled` (excluding the Duplicate name), or `duplicate` (state type or name Duplicate). `assignee` is `any` (default) or `me`. `teamId` limits the list to that Linear team. `priority` is `all` (default), `none`, `urgent`, `high`, `medium`, or `low`. An identifier or Linear URL returns that issue even if it is completed and ignores the other filters. Each issue includes `state.id` when Linear sends it, plus `priority` (0 none through 4 low), `labels` and `updatedAt`. Never returns tokens.
- `GET /api/linear/issues/get?id=`: one issue by UUID or identifier, including description, comments, team, `state.id`, priority, and labels. The host Linear guest panel uses this route for the issue card so comment images keep public file URLs. Guest request does not add Linear headers.
- `GET /api/linear/issues/states?teamId=`: workflow states for that Linear team (`id`, `name`, `type`, `position`), ordered like Linear's workflow: type (backlog, unstarted, started, completed, canceled) then position. Missing `teamId` is 400. Linear not-found or validation errors are 400 with Linear's presentable message. Disconnected is `{ connected: false }` with HTTP 200.
- `POST /api/linear/issues/update`: body `{ id, stateId }`. `id` may be a UUID, identifier, or Linear URL; identifiers are resolved before `issueUpdate` because Linear's mutation requires a UUID. Returns the updated issue. Closing an issue is this same call with the team's first `type: completed` state. Missing `id` or `stateId` is 400. Linear validation (for example a non-UUID `stateId`) is 400 with Linear's presentable message. A GraphQL 401 clears that workspace only. Disconnected is `{ connected: false }` with HTTP 200.
- `GET /api/linear/mapping`: stored default project plus live Linear teams with their mapped paths. Missing file is empty mapping. Malformed file is 500, not empty success. Disconnected is `{ connected: false }` with HTTP 200.
- `PUT /api/linear/mapping`: replace default project and per-team paths. Body `{ defaultProjectPath, teamProjectPaths }`. Failed write does not touch tokens. Disconnected is `{ connected: false }` and does not save.
- `GET /api/linear/preferences`: `{ sessionComments }`. `PUT /api/linear/preferences` with body `{ sessionComments: boolean }` replaces it and returns the stored value. A non-boolean body is 400. The preference is server-side because the event hub posts completed/failure without going through the interface.
- `POST /api/linear/session-status`: post a started/completed/failure comment on the linked Linear issue. Body `{ kind, sessionId, issueIdentifier?, sessionOrigin? }`. `started` requires `issueIdentifier`. `completed` and `failure` reuse the stored issue and open URL from `started`. Each kind posts at most once per session. Answers in this order: disconnected is `{ connected: false }` with HTTP 200; comments turned off is `skipped: 'disabled'`; a `sessionOrigin` nobody else can reach is `skipped: 'origin-not-public'`. `sessionOrigin` must be `http` or `https` with no path, and must resolve to a public host — loopback, private LAN and desktop deep links post no comment at all rather than a link only its author can open. Comment bodies are one markdown link: `[OpenChamber session started](url)` so Linear keeps the `?session=` query. The comment carries no issue or session title: it already sits on the issue, and titles routinely contain brackets that would break the link. Invalid body is 400.

`POST /api/linear/auth/start`, `PUT /api/linear/mapping`, `POST /api/linear/issues/update`, and `POST /api/linear/session-status` parse JSON on the route (`16kb`). They are not on the `/api` 50mb allowlist.

Disconnected list/get/states/update/mapping/session-status return `{ connected: false }` with HTTP 200 so the picker and board can show an empty state. Missing `id` on get is 400. Missing `teamId` on states is 400.

## Invariants

- `readLinearAuthStatus` claims a finished broker result before it reads the stored workspace, so the first status poll after OAuth already reports connected.
- Session status checks disconnection before the comment preference, so a disconnected user keeps the connect prompt whatever the preference says.
- The descriptor's `stateFilters` order is the filter menu's. It has no triage entry because Linear has no triage list filter; `inReview` and `duplicate` are Linear's name-based filters, not neutral categories.
- A state type `duplicate` maps to the `canceled` category. Some workspaces report it as its own type, and every category-based surface (badge, cadence, progress) treats it as canceled.
- Related-issue fields (parent, sub-issue) leave labels out. Every field and connection multiplies a query's cost against Linear's 10,000-point limit, and a related issue's row and preview header do not show labels.
- Linked-issue summaries ask at most 50 identifiers per request. The sidebar shows a handful and Linear rates by query complexity.
- `hostAccess` serves a host-Linear SDK guest through the guest proxy, which keeps the token on `apiOrigin`; no method here returns it to a client.

## Auth storage and config

- Auth storage: `~/.config/ohpichamber/linear-auth.json` (or `$OPENCHAMBER_DATA_DIR/linear-auth.json`). Shape is `{ workspaces: [ { accessToken, refreshToken, user, organization, workspaceId, current, authorizedAt, ... } ] }`. `workspaceId` is the Linear organization id, or `user:<id>` when there is no org, or `legacy` for a migrated token with neither. A legacy single-object file is rewritten to this list on read. Reconnecting the same org replaces that slot.
- Mapping storage: `~/.config/ohpichamber/linear-mapping.json` (same data dir). Shape is `{ workspaces: { [workspaceId]: { defaultProjectPath, teamProjectPaths } } }`. Reads and writes use the current workspace slice. A legacy flat file is wrapped under the current workspace id on read. Disconnect does not wipe maps. Writes are atomic and file mode is `0o600`.
- Session status storage: `~/.config/ohpichamber/linear-session-status.json` (same data dir). Writes are atomic and file mode is `0o600`. Dedupes started/completed/failure per OpenChamber session id.
- Writes are atomic and file mode is `0o600`.
- Client ID: `OPENCHAMBER_LINEAR_CLIENT_ID` -> `settings.json` `linearClientId` -> a baked-in default. A self-hosted broker's Linear application has its own client id, so set it here.
- Client secret: `OPENCHAMBER_LINEAR_CLIENT_SECRET` -> `settings.json` `linearClientSecret`. Optional with PKCE. Do not commit a secret.
- Scopes: `OPENCHAMBER_LINEAR_SCOPES` -> `settings.json` `linearScopes` -> `read,write,comments:create`.
- Session comments: `settings.json` `linearSessionComments`, boolean, absent means off. Written only through `PUT /api/linear/preferences`.
- Broker URL: `OPENCHAMBER_LINEAR_BROKER_URL` -> `settings.json` `linearBrokerUrl` -> none. The fork ships no default broker. Redirect URI: `OPENCHAMBER_LINEAR_REDIRECT_URI` -> `settings.json` `linearRedirectUri` -> `<broker-url>/callback`. Sign-in is available only when one of those is set, so an explicit redirect URI alone configures it too.
- Unavailable sign-in: `POST /api/linear/auth/start` answers 400 with `code: 'LINEAR_BROKER_NOT_CONFIGURED'` (and no client id is `LINEAR_CLIENT_ID_MISSING`); any other failure stays 500. `GET /api/linear/auth/status` and the tracker status add `signIn: { reason: 'broker-url-missing', setting: 'OPENCHAMBER_LINEAR_BROKER_URL', settingsKey: 'linearBrokerUrl' }`, so the card shows the reason and the enabling setting instead of a button that fails on click. Connected workspaces and every non-OAuth path (issue list/get/update, mapping, session comments) keep working.

Linear requires an exact callback match. A self-hosted broker registers its own Linear OAuth application and uses its own callback, for example `https://broker.example.com/v1/oauth/linear/callback`; the broker holds only the short-lived authorization code. The local OpenChamber server keeps the claim secret and PKCE verifier, exchanges the code for tokens locally, then acknowledges the handoff. A broker must expose `/start`, `/callback`, `/poll`, and `/complete` with the same contract. The built-in Linear application and its hosted callback are not part of this fork.

## OAuth contract

- Authorization code + PKCE S256. Linear has no device flow.
- The broker stores hashes of OAuth state and a separate claim secret for ten minutes. It never receives the PKCE verifier or Linear tokens. The local status polling path claims a completed broker result and persists tokens on the OpenChamber server.
- Access tokens expire in 24 hours. Refresh tokens rotate; persist the new refresh token from every successful refresh. Concurrent refreshes share one in-flight promise per workspace.
- `invalid_grant` / 401 on refresh clears that workspace only so a dead token cannot loop. If it was the last workspace, status becomes disconnected.
- A GraphQL 401 after a valid-looking token also clears that workspace. A network failure while a token is stored does not: status stays connected with the last known user.

## Project mapping

OpenChamber has projects (directories), not accounts or organizations. Mapping is how starting a session from an issue (the board and the picker) picks a directory:

1. If the issue's Linear team has a project path, use that.
2. Otherwise use the default project path.
3. If neither is set, the UI tells the user to map the team in Settings → Integrations. It does not fall back to the currently active project.

A worktree started from the board or picker is created in that mapped project. New Worktree from Git is different: it stays in the currently active project.

## Shared UI

- Auth and settings: the shared UI uses `useTrackerAuthStore` and the descriptor-driven `TrackerSettings`, `TrackerProjectMapping`, and `TrackerSessionComments` components through `RuntimeAPIs.trackers`. App startup refreshes tracker providers and auth; a runtime switch resets their state. Settings supports account authorization, switching and disconnect, project mapping, and optional session-status comments where the served capabilities permit them.
- Chat and worktree surfaces consume neutral tracker references and mappings. Existing Linear session links and `linear-issue` context remain readable; Linear links retain their compatible stored `kind: 'linear'`. A worktree started from an issue uses the selected project rather than silently falling back to an unrelated one.
- Session status comments remain opt-in. The Host sends started, completed and failure events only when enabled and only with an appropriate publicly reachable session URL; failed posts do not fail session creation.
- Magic prompts: `linear.issue.review.visible` / `.instructions`. Do not reuse the GitHub issue-review templates for Linear.

## Notes for contributors

The broker contract and the deployment hand-off for a self-hosted callback
broker are in [`OAUTH-BROKER-HANDOFF.md`](./OAUTH-BROKER-HANDOFF.md). It records
the redirect URI the broker's Linear application must register and why the
original loopback callback could not support packaged desktop or arbitrary
self-hosted servers.

- Do not log tokens, codes, verifiers, or the client secret.
- Do not add Linear under Git or as a third-party plugin row.
- Actor is `user`. Do not enable Linear client-credentials tokens for this flow.
- One OAuth grant is still one Linear organization. The server stores many grants and keeps one current. Webhooks and inbound Linear issue actions are out of scope until a later change.

## Decisions

### Why parsed values and wire fields have separate contracts

The shared `isString` checks primitive strings. `readTrimmedString`
therefore returns a string, and `readFiniteNumber` returns a finite number or
null. Auth and issue contracts describe those validated results. Raw file,
OAuth and GraphQL fields remain unchecked until their existing readers run.
`issue-contracts.ts` owns the issue shapes shared by readers and adapters.

The parser re-exports shared predicates by identity. Its text and number
parsers accept unchecked inputs and preserve their original fallback values.

### Why mapping retains its stored lookup semantics

`readStoredLinearMapping` returns `document.workspaces[mappingOrgKey()]`
without checking ownership. A stored workspace id of `constructor` can
therefore return the inherited `Object` constructor. `mergeLinearMappingView`
then reads its unchecked fields and can throw while indexing
`mapping.teamProjectPaths`. A team id of `constructor` can likewise produce an
inherited function as `projectPath`. Declaring these results to be normalized
mapping slices or string paths would promise validation that has not occurred.
The TypeScript mapping and tracker keep the existing lookup behavior.

### Why legacy route rejection handling retains unchecked fields

`registerLinearRoutes` reads `error.message` directly from caught rejections.
`isLinearUserError` checks `code` and `userError` without establishing a message
shape. A null rejection throws during that property access. Error-only types
would overstate the contract; adding a fallback would change the failure
behavior. Type-only changes to neighbouring modules cannot constrain arbitrary
JavaScript rejections.

### Why permission failures do not abort storage writes

Auth and session-status storage keep best-effort `chmod` calls before and after
the atomic rename. A platform's unsupported permission operation must not
prevent the file write. Their empty handlers use the repository's `void 0`
precedent so the handlers need no product-code comments.

### Why event fields retain their existing declarations

`status-runtime.ts` implements `TrackerSessionStatusRuntime` and keeps nested
event fields unchecked. It compares parsed event names and passes the session
id to the status writer, which validates it. Its alias order, abort handling
and stopped-runtime behavior remain unchanged. The auth-status rejection guard
also retains handling for inherited status properties and plain-object errors.

### Why the mapping mode assertion runs only on POSIX

Windows reports the mapping file's mode as `0666` after `chmod(0600)`.
The storage code keeps its best-effort permission calls on every platform;
the test checks exact POSIX bits only outside Windows. Its round-trip assertions
still run on Windows.
