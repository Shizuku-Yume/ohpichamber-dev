# Routing

## Purpose

Jev model routing, the permission safety net, and the classification provider
that answers both. With the `openchamber/auto` model selected, the server asks
[Jev](https://docs.typesafe.ai) (TypeSafe's System One decision model) which
task category a message belongs to and sends it with that category's model,
thinking variant and agent. In a session whose permission mode is `safety`
(`../permission-auto-accept/DOCUMENTATION.md`), the same kind of call decides
whether a permission is accepted or stays on screen for the user.

Routing needs the OpenChamber server, so it is present wherever that server is.
There is no env gate — the feature shipped dark behind
`OPENCHAMBER_ROUTING_ENABLE` until Jev stopped needing a key of the user's own
(see "Where a Jev request goes"), which was the reason to hide it.

## Files

- `defaults.js` — the Auto sentinel, the Jev endpoints and models, the
  `ZEN_JEV_PROMOTION_ACTIVE` switch, built-in categories, the question wording
  for routing and for the safety net, history excerpt limits.
- `classifier.js` — the classification providers: `resolveClassifier` (the
  user's pick, what is usable, and the source that actually answers) and
  `classifierEndpoint` (where a request for a source goes),
  `legacyClassifier` (the view older clients parse) and
  `parseCustomEndpointUrl` (the custom endpoint's request URL).
- `store.js` — `routing.json` (only deviations from the built-ins),
  `routing-auth.json` (the TypeSafe key alone, mode 0600),
  `classification.json` (the classification provider pick) and
  `classifier-endpoint.json` (the custom endpoint, mode 0600) in the
  OpenChamber data dir. An unreadable pick file reads as no pick, an
  unreadable endpoint file as no endpoint. `resolveEffectiveConfig` merges built-ins with stored overrides;
  `toStoredConfig` is its inverse. A missing file is the defaults, a malformed
  one throws.
- `jev.js` — request builders, answer parsing, and the HTTP call with a
  timeout to the endpoint `classifierEndpoint` chose.
- `history.js` — bounded text excerpts from settled turns. `runtime.js` reads
  chronological canonical session history through session assist's
  `loadSettledTurns`. Only `Turn.status === 'completed'` settles an answer;
  the matching Turn's `finishedAt` establishes the prompt-cache age. It keeps
  the last three turns oldest first. Tool payloads and unfinished answers do
  not establish a warm model.
- `cache.js` — "Try to preserve cache usage": `cacheHoldCategory` chooses
  whether a downward move should stay on the current settled model.
- `runtime.js` — `createRoutingRuntime`, Auto resolution, permission verdicts,
  durable settings, availability and decision events. It requires the Agent
  Service, Host session/workspace scope resolvers and the selected private
  credential resolver. `describe(workspaceId)` reads only catalog presence;
  `classifierEndpoint(workspaceId)` requires an authorized workspace; it and
  `testClassifier(draft, workspaceId)` resolve a selected native provider's
  credential only for execution. Session consumers pass their Host-resolved
  workspace identity, never an unscoped classifier fallback. The classifier
  judges the user's text plus one attachment fact for sends with images
  (`attachmentHint`, `routingRequestTextOf` in `runtime.js`); that fact never
  reaches the Agent Service.
- `routes.js` — `/api/routing` (GET, PUT), `/api/routing/token` (PUT, DELETE),
  `/api/routing/classifier` (PUT), `/api/routing/classifier/custom` (PUT,
  DELETE), and `/api/routing/classifier/test` (POST). State and probe requests
  accept `workspaceId` in the query for workspace-scoped provider availability.

## Invariants

<<<<<<< HEAD
- The Auto sentinel is a Host choice, never an OMP model. A native send passes
  `{ providerId: 'openchamber', modelId: 'auto' }` to `resolveAutoSelection`.
  The returned `{ model: { providerId, modelId, variant? }, agent, decision }`
  is captured by Host prompt delivery before execution. A non-Auto request
  returns null without consulting the service or classifier. There is no
  session Auto mark, model-switch route, proxy rewrite or private selection
  endpoint. Routing category/fallback files retain their own persisted binding
  shape; that binding is projected into native captured send options.
- Host session scope authorizes routing and must match any requested workspace.
  Missing scope and provider/credential service failures remain errors, not
  successful empty availability. Auto without a fallback fails before execution.
=======
- The sentinel never reaches OpenCode. OpenCode 2.x holds the model and agent
  on the session and a prompt body carries only the user's text, so Auto is
  per-session state: `POST /api/session` drops the sentinel from the create
  body (the session starts on OpenCode's default; the first send switches it),
  `POST /api/session/:id/model` with the sentinel is
  swallowed and marks the session (`noteModelSelection`), and every
  `POST /api/session/:id/{prompt,command}` in a marked session is routed
  (`routeSend`) and switches the session onto the answer before the send is
  forwarded. So is `POST /api/session/:id/form/:formId/reply`: the answer
  resumes a turn, so it is routed on the values the user filled in, and a
  failure answers with an error and leaves the form pending. Both sit ahead of
  the generic proxy, which replays a parsed body.
  The message queue calls `resolveAutoSelection` itself and applies the answer
  with the model/agent switches it already makes. Without a fallback model the
  runtime throws 400 rather than forwarding. The OpenChamber session service
  (`openchamber-sessions/routes.js`) talks to OpenCode through the SDK and can
  pick Auto up from Session Defaults, so it calls `resolveAutoSelection` itself
  before switching the session. So do scheduled task runs
  (`scheduled-tasks/runtime.js`): a run on Auto creates its session without a
  model, routes on the expanded task prompt with the new session's id, and
  switches the session before the goal and the first send.
- The mark lives in process memory. A server restart between the model switch
  and the next send drops it (see the TODO in `runtime.js`).
>>>>>>> bc50ba56a
- Routing failures keep the user's own behaviour: a Jev error, timeout, unknown
  category or low confidence routes to the fallback model, and the decision
  carries the reason.
- The routing and safety-net questions send `ROUTING_INSTRUCTIONS` and
  `SAFETY_INSTRUCTIONS` as one string each, the same form as the Test probe,
  and the safety-net `ask` question passes `SAFETY_CRITERIA` (`true` / `false`)
  on `criteria`. TypeSafe and Ollama's `kev` runner accept a list for
  `instructions`, while `@kev-ai/server` answers a list with 400 (#4175);
  without `criteria` on `ask`, Ollama `kev` also scored `brew install` and
  `git checkout -- .` below the 0.6 hold threshold (#6028).
- The safety net accepts only on a verdict from Jev. With no usable
  classification provider it holds quietly (the session behaves like `ask`);
  when Jev fails it holds, broadcasts `openchamber:routing.safety-skipped` with
  the error, and does not remember the failure, so reconnect reconciliation asks
  again. It runs whether or not Auto routing is enabled: the routing config's
  `safetyNet.enabled` is no longer read except once, by
  `legacySafetyNetEnabled`, when the permission policy converts pre-modes
  entries. `safetyNet.threshold` still applies.
- A category without a model uses the fallback model *and* variant; a variant
  only travels with the model it was chosen for. A category agent replaces the
<<<<<<< HEAD
  composer's agent; an empty one keeps it.
- A variant the canonical model catalog excludes is dropped before capture,
  so execution uses the model's default thinking level. An unreadable catalog,
  or one that does not know the model yet, cannot invalidate a saved variant.
=======
  session's agent, and the runtime remembers which agent it replaced. A send
  whose category names no agent, or that falls back, keeps the composer's
  agent, except while the session still runs as the agent routing set: then
  it goes back to the agent from before (#6392). A session found on any other
  agent, a composer agent other than the routed one, or a switch off Auto ends
  that, so an agent the user picked stays. A session that had no agent of its
  own before the category agent has nothing to go back to. The record is
  process memory, like the Auto mark.
- A variant the model's catalog entry does not list is dropped before the
  switch, so the reply runs on the model's default thinking instead of OpenCode
  refusing it (Settings from before #4133 saved list positions like `"2"`).
  An unreadable catalog, or one that does not know the model yet, keeps it.
>>>>>>> bc50ba56a
- A provider's prompt cache belongs to one model, so a model switch makes the
  new model read the whole context uncached. With `preserveCache` on (the
  default; a config without the key reads as on), a send Jev routes to a
  built-in category below the one the session is on runs as that one instead,
  while the cache is likely warm. "Below" is the built-in order trivial <
  research < implement < hard; the session is on the highest enabled built-in
  category whose model wrote the last settled answer. Moving up is never held,
  and neither is a send routed to a user category, a fallback for low
  confidence or an error, or a hold that would change the agent (another
  agent is another system prompt, which misses the cache anyway). Warm means
  strictly less than 5 minutes since the last settled answer completed. No
  retired OpenCode warming/config reader extends this native window. The
  decision names the category used and `cacheHold.requested`, the one Jev chose.
- Auto is offered (`autoReady`) with a usable classification provider
  (`jevAvailable`), `enabled`, a fallback model and at least two enabled
  categories.
- Safety receives a canonical pending `ApprovalRequest`. Jev sees its
  `actionType`, `toolName`, `commandSummary` and `details`, not its identity or
  CAS tokens. Terminal or malformed requests cannot produce acceptance.
- Verdicts are cached for 15 minutes, bound to approval ID, session, epoch,
  worker generation, version, effective source and safety threshold. Availability
  and enterprise policy are rechecked before a cached acceptance. Reconciliation
  cannot reuse a verdict across a worker/epoch or threshold change; forgetting
  one request leaves independent siblings. The permission owner applies approval
  CAS and forgets resolved requests.

## Decisions

### Why the server puts the agent back and not the composer

In Auto the composer hides the agent control and shows the session's agent,
which after a routed Plan is `plan`, so the composer has no agent of its own
to send. Only the runtime knows that it set the agent and which one was there
before. Before #6392 an empty category agent left the routed agent in place,
and every later send stayed in Plan.

## Where a Jev request goes

The user picks a classification provider in Settings → Providers →
Classification providers:

- `off`: no Jev at all. Every Jev feature takes its no-provider path.
- `zen-promo`: `opencode.ai/zen/v1/systemone` as `jev-1.13-free`, which OpenCode
  Zen answers with no credential at all. Usable while
<<<<<<< HEAD
  `ZEN_JEV_PROMOTION_ACTIVE` is true; flip it when OpenCode ends the promotion.
- `zen-key`: the same endpoint as `jev-1.13`, using native provider
  `opencode-zen` with configured API-key authentication. OAuth presence is not
  a usable key for this classifier.
- `openrouter`: `openrouter.ai/api/v1/systemone` as `jev-latest`, using native
  provider `openrouter` with configured API-key authentication.
- `vercel`: `ai-gateway.vercel.sh/typesafe/v1/systemone` as `typesafe-ai/jev`,
  using native provider `vercel-ai-gateway` with configured API-key authentication.
  All gateways use the same System One request and response shapes.
=======
  `ZEN_JEV_PROMOTION_ACTIVE` is true. While it is false, a user who had picked
  it sees it disabled as temporarily unavailable and falls back like any
  unusable pick.
  On 2026-10-27 zen's anti-fraud client check answered the free model with
  429 `FreeUsageLimitError` ("Free models work in OpenCode") to Node and curl
  clients whatever the headers, while Bun clients such as OpenCode got
  through. The server runs on Node, so the promotion was off for a few hours
  until Dax exempted Jev. If that 429 comes back, compare one call from Node
  and one from Bun before anything else, and ask OpenCode in Slack. The other
  route is OpenCode 2.2's `POST /api/experimental/generate/decisions` with the
  `opencode` provider, which serves `jev-1.13-free` without a login and takes
  `x-opencode-client` from `provider.opencode.options.headers`; in 2.2.0 it
  starts a second copy of every local MCP server (anomalyco/opencode#59605)
  and its predicate questions take no `criteria` (anomalyco/opencode#59606).
- `zen-key`: the same endpoint as `jev-1.13` with a Zen API key read from
  OpenCode's credentials (`opencode/auth.js`, entry `opencode`, type `api`).
  An OpenCode account sign-in is an OAuth credential, and zen rejects it as a
  key ("Invalid API key", checked 2026-09-27), so it does not count. A paid
  call from Node with a Zen API key answers (checked 2026-10-27, billed to the
  Zen balance); the client check that blocks the free model does not apply.
- `openrouter`: `openrouter.ai/api/v1/systemone` as `jev-latest` (OpenRouter's
  `~typesafe/jev-latest` alias) with the OpenRouter API key saved in OpenCode
  (entry `openrouter`, type `api`), billed to that OpenRouter account.
- `vercel`: `ai-gateway.vercel.sh/typesafe/v1/systemone` as `typesafe-ai/jev`
  with the Vercel AI Gateway API key saved in OpenCode (entry `vercel`, type
  `api`). Both gateways implement TypeSafe's request and response shapes, so
  `jev.js` is the same for every source. Both answer 401 without a key
  (checked 2026-09-27); a paid call is not verified live yet.
>>>>>>> bc50ba56a
- `typesafe`: `api.typesafe.ai/v1/systemone` as `jev-latest` with the key saved
  in `routing-auth.json`. Saving a key also picks it.
- `custom`: any endpoint that speaks the System One API, with the URL, model
  and optional key the user saved (`classifier-endpoint.json`, mode 0600, its
  own file so a token write never rewrites it). The key goes as a bearer when
  present; `describe` returns `customEndpoint` as URL, model and `keyPresent`,
  never the key. `setCustomEndpoint` stores the request URL exactly as pasted
  (trimmed, without a `#fragment`) and appends nothing: a company proxy can
  serve System One on any path, so only the user knows the full address. Before
  2026-10-05 a `/v1` base or an API root got `/v1/systemone` appended; URLs
  saved then are already full and read back unchanged, but a pin written in
  that short form now needs the full address. Only http(s), no credentials in
  the URL. It does not go through the TTS remote-URL gate: a remote classifier is
  the user's explicit choice, the same as the hosted sources. Saving picks it;
  a missing `key` keeps the saved one, null removes it without changing the
  pick.
  An administrator can pin the endpoint (`readPinnedCustomEndpoint`): `jev` in
  the machine policy file, else `OPENCHAMBER_JEV_URL`, `OPENCHAMBER_JEV_MODEL`
  defaulting to `jev-latest`, optional `OPENCHAMBER_JEV_API_KEY` (source rules
  in `../enterprise-mode.js`). The pin
  replaces the saved endpoint, `customEndpoint.pinned` tells the page to show
  it read-only, and `setCustomEndpoint` / `clearCustomEndpoint` answer 409.

In enterprise mode (policy file or `OPENCHAMBER_ENTERPRISE_MODE`, `../enterprise-mode.js`)
`resolveAccess` treats the pick as `off` whatever is stored (the stored pick is
kept for when the mode is lifted), `setClassifierSource` refuses anything but
`off` and `setToken` and `setCustomEndpoint` refuse every write with 403, and `describe` reports
`enterpriseMode` so the page shows why only Off is offered. With a pinned
endpoint it is the administrator's own infrastructure, so it becomes the
default (`custom` unless the stored pick is `off`) and `custom` is the one
other pick allowed.

Jev reads conversation excerpts, so it is opt-in. Without a stored pick the
default is `typesafe` when a key is saved (saving a key is choosing it, and it
always won before the pick existed) and `off` otherwise. Until v2.0.3 the
default was `zen-promo`, which sent every message of users who never opened
this page to zen (#4109); an install without a stored pick now reads as `off`
with no conversion. A pick that cannot be used falls back to the first usable
key (`typesafe`, `custom`, `openrouter`, `vercel`, `zen-key`: OpenChamber's
own Jev settings before native workspace keys); none usable means no Jev.
`zen-promo` needs no credential, so it is never a fallback: only an explicit
pick sends anything there, and `off` never falls back.

Native availability comes from
`GET /api/agent/v1/workspaces/:workspaceId/providers`: configured API-key
presence identifies the provider and opaque credential reference, never a raw
key. Execution resolves only the chosen provider with the authorized workspace,
agent-directory, provider ID, credential reference and purpose `routing`.
Each execution rechecks presence and enterprise policy. No retired credential
file, OpenCode config or Host environment key reader participates. Unscoped
calls can use Host TypeSafe/custom settings but cannot borrow workspace keys.

Every zen call is tagged `x-opencode-client: openchamber`. Dax approved the
free use in Slack on 2026-09-22 on terms the code and the copy keep together:
zen can identify and throttle our calls through that header, and the
Classification providers page tells the user in plain words that the free model
is a limited-time OpenCode promotion. Zen rejects the `jev-latest` alias, so
versioned ids are sent.

Never make the free tier the only path: the zen docs call it "available for a
limited time", and the keys are what users fall back to when it ends.

## Events

Broadcast on the OpenChamber control stream: `openchamber:routing.updated`
(availability, including `jevAvailable`), `openchamber:routing.decision` (per
send), `openchamber:routing.permission-held`,
`openchamber:routing.safety-skipped`. Showing the held request itself is not
routing's job: the permission auto-accept runtime reports every request it
left for the user (`../permission-auto-accept/DOCUMENTATION.md`).

`/api/routing` keeps `jevSource` (`typesafe` or `zen-free`) for clients from
before the classifier pick and adds `jevAvailable`, `classifier` and
`classification` (both `selected`, `effective`, `sources`). `classification`
is the full picture. `classifier` is what v2.0.2 clients parse: their schema
knows only `zen-promo`, `zen-key` and `typesafe` and rejects the whole state
on any other id, so it lists only those and is null while OpenRouter,
Vercel or a custom endpoint is picked or answering (`legacyClassifier`). Current clients read
`classification` and drop source ids they do not know.

## UI

`packages/ui/src/stores/useRoutingStore.ts` projects `/api/routing` and these
events (`selectSafetyNetAvailable` gates the safety-net mode everywhere);
`hooks/useRoutingSync.ts` keeps it current and shows the skipped-check toast. `lib/routing/autoModel.ts` owns the sentinel; `useConfigStore` accepts it
as a valid selection while `autoReady`. `ModelPickerList` renders it as the
pinned `leadingEntry`; `ModelControls` hides the agent and thinking controls
while Auto is selected. `PermissionCard` shows the hold reason. Settings →
Routing (`components/sections/routing/RoutingPage.tsx`) edits the config with
debounced saves. Settings → Providers → Classification providers
(`components/sections/classification/ClassificationProvidersPage.tsx`) picks
the source and manages the TypeSafe key and, through `CustomEndpointFields.tsx`,
the custom endpoint; `JevAccessNote` links there from the
features that need Jev.

## Tests

`store.test.js` (defaults, deviation round-trip, the cache setting's default,
deleted built-ins, malformed
<<<<<<< HEAD
file, token file mode, classifier pick, custom endpoint file), `runtime.test.js`
(native captured selections, bounded settled history, fallback/confidence,
cache hysteresis, model variants and agent choice, canonical safety inputs,
request-identity cache boundaries, durable settings, enterprise policy and
selected-provider use-time resolution), and `routes.http.test.js` (real runtime
and durable settings through HTTP, scoped catalog presence, secret-free state,
draft probes, preserved service errors and enterprise refusal). Native delivery
and permission auto-accept owner suites exercise their consumers.
=======
file, token file mode, classifier pick, custom endpoint file), `runtime.test.js` (request text,
excerpts, decisions, the agent a category set and the way back from it, cache holds and the warm window, endpoints, custom URL normalization and setter,
classifier fallback, rewrite and fallback
paths, safety net accept/hold/skip/unavailable), `routes.http.test.js`
(sentinel dropped from a create and swallowed on the model switch, routed send
ahead of a stand-in proxy, the routes). The queue and auto-accept tests cover
their hooks.
>>>>>>> bc50ba56a
