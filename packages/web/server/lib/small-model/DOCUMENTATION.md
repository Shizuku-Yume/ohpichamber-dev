# Small Model

<<<<<<< HEAD
## Ownership
=======
Background LLM calls for OpenChamber's own features — session titles, goal
distillation, session assist, the changes walkthrough, the dictation
correction pass. Every call goes to the
running OpenCode through `POST /api/experimental/generate/text`; OpenChamber never talks to a
provider directly and never handles a provider credential.
>>>>>>> bc50ba56a

The Host's `generateSmallModelText`, `describeSmallModel`, and
`listAuthenticatedProviders` own background generation for Host features and
Guest grant-enforced generation. They consume the Agent Service's canonical
workspace model/provider catalogs and stateless completion contracts. They do
not read OpenCode configuration, execute session turns, contact providers, or
handle provider credentials.

Shared UI utility generation uses `packages/ui/src/lib/smallModelRequest.ts`
and the `canonicalClient` singleton directly. Git/PR, titles, note and goal
summaries, and spoken summaries do not call `/api/small-model/generate` or create
sessions as a fallback. Guest generation keeps its Host grant owner at
`/api/guests/:id/generate`; its request supplies an admitted canonical workspace
ID, not an engine-specific directory header.

## Modules

- `client.js`: injected Agent Service connection and authorized workspace
  resolver; canonical catalog parsing and per-workspace 30-second caches.
  `completeSmallModel` captures its service owner, preserves result identity,
  and sends cancellation to the matching completion while the start request is
  pending. A signal does not merely abandon HTTP delivery.
- `index.js`: Host selection policy and input/output budgeting. Canonical
  failures and cancellations are distinct errors, not empty text.

The public `/api/small-model` preview and `/api/small-model/generate` routes are
retired; UI utilities use the canonical client, while Guest and session-assist retain injected access to this service.

<<<<<<< HEAD
## Selection and scope

Every operation requires an authorized `workspaceId`. The private Host resolves
that identity to a filesystem scope; public completion bodies carry only opaque
identities. Selection order is an explicit request model, the effective
OpenChamber profile override read by `readMergedSettingsSync`, then a small model
within the caller's preferred provider, then that provider's exact preferred
model. Without a preferred provider, workspace catalog small-family discovery
is permitted. A named provider never falls through to another subscription.
=======
OpenCode's free zen models are listed as enabled without a login, but
`/api/experimental/generate/text` refuses every one of them: "free tier can
only be used in OpenCode" on early 2.x, 429 "Free usage limit reached. Free
models work in OpenCode" on 2.2.1 (checked 2026-10-29). Without a zen login
OpenCode puts the placeholder `apiKey: "public"` in those models' `settings`
on `GET /api/model` and `/api/model/default`; a zen login or key removes the
placeholder and enables the paid models.

A model carrying the placeholder is never resolved here, at any step of
*Model resolution*: a saved Small Model, a walkthrough model, an
`agents.title.model`, the session's own model and OpenCode's default all count
as unset when they name one. Since 2.2 `/api/model/default` answers a free zen
model (`big-pickle`) without a login, so this is what keeps the fresh install
at "no small model" instead of a call that always fails. The pickers leave
them out for the same reason (*Which providers the pickers may offer*). A
model is told apart by the placeholder, which is OpenCode's own test in its
zen plugin (`plugin/provider/opencode.ts`), and never by a `-free` name:
with a zen login the free models stay listed, without the placeholder.

On a fresh install with no provider login `generateSmallModelText` therefore
throws `404`. What happens next is per feature:

- Commit message and PR description (`packages/ui/src/lib/gitApi.ts`) fall back
  to `POST /api/session/:id/generate`, which runs on the open session's own
  model with the session as context and does not touch its history. Verified
  on OpenCode 2.0.2: the reply comes back and the message count stays at zero.
- Session renaming, the session goal and the walkthrough do NOT fall back —
  feeding a whole session into a model to write a title or check a goal is the
  wrong cost. Their entry points read `available` from `GET /api/small-model`
  (`packages/ui/src/stores/useSmallModelStore.ts`) and show a disabled control
  with the reason; the walkthrough uses its own readiness (`no-model`). A goal
  is also allowed when Jev checks it instead (`../session-goal`).
- Session assist is server-side and simply does nothing when
  `describeSmallModel` answers null.
- The dictation correction pass (`../dictation/transcript-correction.js`)
  inserts the text as heard; Settings → Voice says so under the option.
- Notes summarization and spoken summaries keep the original text and silence
  the 404.
>>>>>>> bc50ba56a

UI generation loads profile settings through `loadDesktopSettings`, preserving
runtime and surface scoping and pending settings-write reconciliation. An
explicit canonical selection is exact; a preferred selection permits the
profile override or provider-local small-family choice. Models must be enabled,
active/non-deprecated text models. Unavailable explicit intent is a failure,
never a request to a different engine or provider.

Session rename availability and completion use the prepared target workspace
and the final completed assistant's native provider/model selection, never the
current composer selection. Missing target model identity fails without a
completion dispatch. Availability cache entries include that target scope.

<<<<<<< HEAD
## Completion and cancellation
=======
1. An explicit `model` on the request (`provider/model`), with the thinking
   level the caller names beside it (`variant` for `generateSmallModelText`,
   `overrideVariant` for `describeSmallModel`) — `source: 'request'`.
2. OpenChamber's settings override (Settings → Sessions → Small Model): when
   `smallModelUseDefault` is `false`, `smallModelOverride` wins and
   `smallModelVariant` names the thinking level beside it —
   `source: 'settings'`.
3. The small model configured for OpenCode itself — `source: 'config'`. OpenCode
   2 has no `small_model` key of its own: it migrates the v1 `small_model` onto
   its hidden `title` agent, whose native form is `agents.title.model`, and
   its session titles run on that model before any family scan.
   `getConfiguredSmallModelRef` reads the model and its variant from
   `GET /api/agent/title` in the caller's directory, so OpenCode's own merge of
   global, project and `OPENCODE_CONFIG` layers decides it; nothing here parses
   config files.
   Read on every call, never cached: OpenCode watches its config, so an edit
   applies without a restart. A cold location can answer 404 for a few
   seconds while its agents load; that call falls through to step 4 and the
   next one sees the model. A model OpenCode lists as disabled (the login
   behind it is gone) is skipped the same way, as OpenCode's own titles move
   on to another model then; one it does not list yet (a plugin model still
   loading) is kept. Like the settings override, it is a choice the
   user made on purpose, so it may leave the caller's provider.
4. The small model of the caller's provider (`preferredProviderID`: the
   session's, or the composer's for commit messages, PR descriptions, spoken
   summaries, the diff walkthrough and extensions) —
   `source: 'session-provider-small'` — found by `pickSmallModelInProvider`:
   the newest enabled, active, text-in text-out model of the first tier in
   `SMALL_MODEL_TIER_PRIORITY` (`flash-lite`, `flash`, `luna`, `haiku`) that
   the provider has. When the caller's own model is already in one of these
   tiers, it is used as is (`source: 'session-model'`) and the scan does not
   run. The tiers are OpenCode's own for its session titles
   (`Catalog.model.small`), repeated here because OpenCode does not expose
   them over HTTP. A tier is matched as a name in the models.dev `family` and
   the model id together (`smallModelTierOf`), so every lab's flash counts:
   `deepseek-flash`, `glm-flash`, and `mimo-v2.6-flash`, whose catalog family
   is just `mimo`. A provider with none of these tiers
   takes the caller's own model (`preferredModelID`) — `source:
   'session-model'`: costlier than a small model elsewhere, but never another
   provider's subscription. OpenCode's titles end the same way.
5. Otherwise `GET /api/model/default` — `source: 'default'`. This is
   OpenCode's default chat model, not a small one; it is the last resort, and
   only for a caller that named no provider or whose provider it is on. With
   no default configured OpenCode answers its first available model from any
   provider, so a caller that named a provider and no model gets 404 rather
   than that. Until 2026-10 only callers passing `restrictToPreferredProvider`
   stayed on their provider; commit messages, PR descriptions, spoken
   summaries, the walkthrough and extensions fell to the default. Current
   servers ignore the flag; the UI still sends it for older ones.
>>>>>>> bc50ba56a

Requests use `CompletionRequest`: a caller-owned completion ID, full provider
and model identity, text/JSON format, overflow policy, independent system prompt,
output budget, timeout, and null variant/reasoning defaults. Structured output
is a native canonical JSON completion; the Host does not append schemas or
retry malformed JSON itself. `CompletionResult` preserves completed, cancelled,
and failed outcomes, including typed provider/structured-output failures.

<<<<<<< HEAD
The Host defaults to a 60-second service timeout. External cancellation sends
`POST /api/agent/v1/workspaces/:workspaceId/completions/:completionId/cancel`
to the captured service connection. UI cancellation uses the same canonical
owner; runtime switching cancels before endpoint replacement and rejects stale
responses, including switches away and back.

Host prompt budgeting uses canonical `contextWindow` and `maxOutputTokens` at
approximately four characters per token. The requested output limit is capped
at the model's output limit and used as the input reserve. `truncate` clips a
survivable input tail and reports `inputTruncated`; `error` rejects oversized
input with 413 and dispatches canonical `overflow: 'reject'`.
=======
Inside one provider the tier order differs from OpenCode's, which puts luna
first. A gateway such as OpenCode Go sells many labs under one provider, with
a monthly allowance per model: there luna has a small allowance and keeps
requests at OpenAI for 30 days, while the flash models are open models with
larger allowances and no retention. A session on DeepSeek V4.1 Flash had its
goal checks sent to GPT 6 Luna; it now stays on its own model, and a session
on a large model gets the provider's flash before its luna.

## Thinking variants

The settings override and OpenCode's `title` agent can each name a thinking
variant. It travels as the model's `variant` on `/api/experimental/generate/text`.
The variant is kept when the catalog does not know the model, because a
discovery gap is not evidence against the choice. When the catalog knows the
model, the variant must be listed; a missing or malformed variant list counts as
no levels. A variant the model does not list is dropped and the call runs at the
model default, the same rule session defaults apply
(`../openchamber-sessions/routes.js`, `resolveVariant`).
>>>>>>> bc50ba56a

## Retained surfaces

- Web/PWA: shared canonical client through the authenticated Host Gateway.
- Electron: the same client through the selected embedded or remote Host.
- Hosted mobile: the same client through its selected Host.
- Capacitor mobile: the same client through its paired remote Host; no local
  generation engine.
- Guest panels: Host `model` grant and workspace authorization precede internal
  canonical generation; guests cannot supply provider credentials or select an
  execution engine.

## Regression tests

<<<<<<< HEAD
`index.test.js` exercises the real injected service boundary without module
mocks: workspace/provider scope, profile override, output budgeting, structured
failure, and cancellation reaching the captured owner while completion is
pending. UI request, availability, Git, title, and Guest tests exercise their
observable canonical contracts. Parent verification owns execution of those
suites and package checks.
=======
`/api/experimental/generate/text` takes one prompt and no system message, so `system` leads the
prompt, separated by a blank line.

Input clamp: the prompt is measured against the resolved model's `limit.context`
as OpenCode reports it, minus an output reserve, at ~4 chars/token. A model
OpenCode does not list gets a conservative 64k default. `onOverflow` decides
what an oversized prompt means:

- `truncate` (default) clips the tail and reports `inputTruncated: true`.
  Correct for callers that degrade gracefully (summaries, commit messages).
- `error` throws a `413` with `code: 'context-too-small'` plus
  `requiredChars`/`availableChars`. Correct for callers whose output would be
  quietly wrong on a clipped input, so they can ask the user for a roomier
  model instead of returning confident nonsense.

Output budget: `maxOutputTokens` is capped at the model's `limit.output`, and
the **same number** is reserved from the input allowance. `/api/experimental/generate/text` takes
no output budget of its own, so this number only shapes the reserve — but the
two sides must stay equal or a caller that asks for a large answer overruns the
context and the failure looks like a truncation bug.
`describeSmallModel` takes `outputReserveTokens` so readiness checks agree with
what generation will do. It may be a **function** of
`{ contextTokens, outputTokenLimit }` for callers that want as much answer room
as the resolved model allows — they cannot name a number before knowing which
model they got. The resolved value comes back as `outputTokens`.

Without `timeoutMs`, the deadline derives from the prompt the module actually
sends: 60 s base plus 40 ms per estimated token (~4 chars/token, the input-clamp
heuristic), capped at 900 s — the walkthrough ceiling. An explicit `timeoutMs`
still wins (the walkthrough passes its own per-hunk budget); `signal` aborts a
request that is no longer wanted. The timeout covers generation, retry waits and
structured-output retries together. The deadline is a hang guard, not a
pace-setter: prefill dominates, and issue #5017 measured local-model prefill at
94-187 tok/s on 4 GB-VRAM hardware (~10.6 ms/token worst observed), so 40 ms/token
is ~4x headroom that also absorbs the answer decode and one structured-output
retry. A blown deadline (not caller cancellation) throws `504` with
`code: 'generation-timeout'`, naming the model and the budget; the route maps it
to that message instead of the generic "choose another model" text.

OpenCode 2 can reject an explicit model before its cold catalog finishes loading;
plugin-provided models (Claude Code) stay unavailable for 20-40 s after OpenCode
starts because plugins for the global location load lazily. Generation waits up
to 5 s for those plugins, then answers `ServiceUnavailableError` with
`service: 'plugin'`; a model still missing after them answers
`ModelNotFoundError`. Either, the second only when it names the selected model,
is retried with exponential backoff (0.5, 1,
2, 4, 8, 16 s, ~31 s in total), with the same model and prompt. The rejection
precedes provider dispatch, so retries cost no tokens. Cancellation also stops the wait. Other errors are not retried.
If the model remains unavailable, the route returns 503 with
`code: 'small-model-unavailable'` and the model-specific reason. Commit and PR
generation own their error toast and suppress the shared request toast.

## Structured output

`/api/experimental/generate/text` has no structured-output mode. `responseSchema` is therefore
emulated: the schema is appended to the prompt as "Reply with JSON matching this
schema and nothing else: …", and the reply is parsed here. A ```json fence is
stripped. An unparseable reply is retried **once** — a model that ignored the
shape often honours it on a second pass, and the alternative is failing a
walkthrough over a stray sentence of preamble. A second failure throws with
`code: 'structured-output-unsupported'` (`422`).

`describeSmallModel` reports `structuredOutput: null`, never `false`. The
capability is not knowable before the call, and callers must read `null` as
"try it".

## Which providers the pickers may offer

`listAuthenticatedProviders(directory)` answers one question for the Small Model and
Changes Walkthrough pickers: which providers OpenCode can call right now. A
provider counts when it has at least one enabled model in `GET /api/model` —
the same test OpenCode applies before letting a chat turn use it — other than
zen's free models without a login (*Free tier and the session fallback*). On
a setup with no login both pickers are therefore empty. The model
list is directory-scoped, so `directory` scopes this answer the same way
`describeSmallModel` scopes its own; without one the server default applies,
and a default directory with no model config would report no providers for
models that work perfectly in the user's project.

`GET /api/provider` only contributes names. It comes back empty on setups where
models are perfectly usable, so an empty provider list is never read as "no
providers". Claude Code is removed from the result for the reason above.

The field is served as `authenticatedProviders` on `GET /api/small-model`, and
the route forwards its `?directory=` query to both halves of the answer. The
Settings pickers send the current directory with the request, so the list
matches what the user sees in chat for that project. The name predates this
resolution; it now means "callable".

## describeSmallModel

Reports which model and thinking variant would be used without calling it:
`providerID`, `modelID`, optional `variant`, `source`, plus `inputCharBudget`,
`contextTokens`, `contextKnown`, `outputTokens`, `outputTokenLimit`,
`structuredOutput`, `hasLogin` and `localEndpoint`.

`localEndpoint` is `true` when the model's `settings.baseURL` (as OpenCode
reports it on `GET /api/model`) points at loopback, a private or CGNAT
(Tailscale) address, or a LAN-style host name: single-label, `.local`, `.lan`,
`.internal`, `.home.arpa`, `.localhost`. A model without an endpoint is not
local. Session assist uses it to keep background calls off a local chat model.

`hasLogin` is `false` when OpenCode lists the model as disabled — a settings
override can name a model there is no credential for, and the walkthrough
refuses before the user pays for a failed request. A model OpenCode does not
list at all is not evidence either way, so it counts as usable.

Returns `null` when OpenCode is not reachable.

## Registration

Mounted lazily from `feature-routes-runtime.js` (same pattern as quota): the
module is imported on first request, not at server startup.
>>>>>>> bc50ba56a
