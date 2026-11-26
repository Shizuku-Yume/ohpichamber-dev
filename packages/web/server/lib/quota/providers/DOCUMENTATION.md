# Quota providers

## Ownership

This folder owns the built-in quota readers and registry. Nested provider folders
own their authentication and transforms. `../utils` owns shared formatting and
result construction; `../credentials` owns managed credential storage.
`../native.ts` owns the native-backed entries: providers OMP's usage probes
cover (`claude`, `codex`, `github-copilot` and its add-on, `cursor`, `xai`,
`cline-pass`, `hyper`, `zai-coding-plan`, `minimax-coding-plan`) answer from the
canonical OMP usage report instead of a Host scraper, so the scraper modules
that used to live here are removed. `zai-gift-reset.ts` keeps only the z.ai
gift-reset activation OMP does not implement.

## Invariants

- File JSON and decoded JWT claims are untrusted. Object checks accept arrays,
  matching the shared `asObject` helper; string checks trim and reject blanks.
- MiniMax status fields remain unchecked values until their existing `Number`
  and `String` conversions. Status `0` is success; `1004` reports that MiniMax
  does not share limits for this key; other failures keep the supplied message.

## Decisions

### Why MiniMax model names keep their native failure

`pickChatModel` checks only that a model name is truthy. The prefix test still
converts it with `String`, as `RegExp.prototype.test` did, and the text-model
match lower-cases it through `lowerCaseLabel`, which throws the original
`m.model_name.toLowerCase is not a function` for a truthy non-string.
`fetchQuota` returns that message to the caller as before. Count comparisons
treat a missing count as not positive, the result `null > 0` gave.

### Why MiniMax status fields remain unknown

The provider response does not validate their types. Declaring numeric codes or
string messages would promise more than the boundary checks. Both web and VS Code
use this same status mapping.

### Why registry IDs retain null

The extension registry exposes nullable IDs in its entries and provider objects.
The dispatcher retains that contract, including nullable IDs and names in an
unsupported result. Result construction copies these fields without validation.
Built-in property lookup converts an ID to its JavaScript property key explicitly
and retains the own-property check, so inherited names remain unsupported.

Configuration failures skip only the failing provider. Pending requests remain
keyed by the original ID and are removed only when that same promise settles.

`getAuthEntry` and `normalizeAuthEntry` do not validate credential fields.
Credential readers narrow the fields they use.

### Why shared readers retain precise window fields

The transformer's string-parser re-export resolves to its TypeScript owner, and the
formatter preserves its supplied percentage type. A shared reader's window
contract retains the numeric fields established by its own parsing, without
promising the same validation for other providers' windows.

### Why unchecked provider fields remain unknown

The field predicates retain identity and inherited properties. A nullish-only
predicate preserves JavaScript property access on primitives; an object predicate
is used where the reader already called `asObject`, which also accepts arrays.
Neither predicate validates individual fields. Credential fields, numeric inputs
and timestamps narrow only at their existing parsing sites. NanoGPT retains its
existing response schema, including unavailable and degraded quota windows.

DeepSeek keeps number and string checks on the raw balance so a blank string
remains unavailable. Its parsed balance is already a number or null, so the
positive-balance filter needs only the null check. OpenRouter retains its
own-property period lookup after converting the JSON field to its property key;
inherited names remain unsupported. Mistral retains dictionary fallback and
truthiness checks. DeepInfra interprets a negative Stripe balance as spendable
funds and a positive balance as money owed, as documented by its account API.

### Why coding plan readers keep coercion and gift resets stay optional

The expiry pattern still tests the string form of the supplied value. A date
inside an array can match the pattern, but it cannot supply a text expiry.

Kimi's legacy durations retain the original truthiness check and numeric
coercion. A numeric string can supply the duration; a nonnumeric truthy value
can produce `NaN`. Only the recognized time-unit strings select a multiplier.
The coding-plan unit lookup retains inherited keys and coerces counts only when
the lookup returns a truthy value. The resulting duration can be `NaN`.
Zhipu reads the merged OpenCode config without a working directory, so no
project layer participates. The provider's `options.apiKey` remains unchecked
until the shared resolver reads it.

### Why the internal OpenAI reader keeps raw window fields

The internal OpenAI reader copies unchecked percentages and window durations to
its result, and uses numeric coercion for reset timestamps. Its result type keeps
those copied fields unchecked. Only finite numeric percentages produce a derived
remaining percentage. The reader stays outside the dispatcher's numeric usage
contract.
