# Small Model

## Ownership

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
retired; UI utilities use the canonical client, while Guest/session-assist/
session-goal retain injected access to this service.

## Selection and scope

Every operation requires an authorized `workspaceId`. The private Host resolves
that identity to a filesystem scope; public completion bodies carry only opaque
identities. Selection order is an explicit request model, the effective
OpenChamber profile override read by `readMergedSettingsSync`, then a small model
within the caller's preferred provider, then that provider's exact preferred
model. Without a preferred provider, workspace catalog small-family discovery
is permitted. A named provider never falls through to another subscription.

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

## Completion and cancellation

Requests use `CompletionRequest`: a caller-owned completion ID, full provider
and model identity, text/JSON format, overflow policy, independent system prompt,
output budget, timeout, and null variant/reasoning defaults. Structured output
is a native canonical JSON completion; the Host does not append schemas or
retry malformed JSON itself. `CompletionResult` preserves completed, cancelled,
and failed outcomes, including typed provider/structured-output failures.

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

`index.test.js` exercises the real injected service boundary without module
mocks: workspace/provider scope, profile override, output budgeting, structured
failure, and cancellation reaching the captured owner while completion is
pending. UI request, availability, Git, title, and Guest tests exercise their
observable canonical contracts. Parent verification owns execution of those
suites and package checks.
