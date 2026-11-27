# Quota Module Documentation

## Purpose
This module fetches quota, credit, and usage signals for supported model providers in the web server runtime.

In the Settings Usage page, quota information is consumed as provider-specific quota cards only for configured providers that have active quota metrics. The overarching token analytics, costs, TTFT, tok/s, and error rates are provided by the Agent Service OMP statistics endpoint (`GET /api/agent/v1/usage`), while this module supplies the remaining provider quota windows and balances.

## Native-backed providers

Providers OMP's own usage probes cover — `claude`, `codex`, `github-copilot` (and its add-on card), `cursor`, `xai`, `cline-pass`, `hyper`, `zai-coding-plan` and `minimax-coding-plan` — have no Host scraper. Their registry entry is a native-backed reader: `fetchQuota` reads the canonical usage report through `createNativeUsageReader` (`POST /internal/usage` with the smallest window and the probe's provider filter) and `nativeReportsToProviderResult` projects the report into this module's response contract. The credential selection still gates configuration through the workspace catalog, but the selected secret is never resolved in the Host for these providers: OMP's probe reads the credential store it owns. When several accounts of one provider report, the first report wins duplicate limit ids. Provider-wide windows stay on the card; model- or tier-scoped limits become per-model entries. Reset-credit counts render on the Usage page's native account section, not in the window list. Providers OMP does not probe keep their Host scraper, and the z.ai gift-reset activation (`zai-gift-reset.ts`) stays Host-only because OMP exposes no redemption endpoint.

Window keys, ordering and failure semantics of the native conversion:

- Provider-wide windows key on the duration-derived label (`5h`, `weekly`, `30d`). One provider can report several provider-wide windows of the same duration with different units — z.ai reports token, request and credit windows over the same five hours — so a label already taken in the same bucket is disambiguated with the amount's unit (`5h-requests`, `5h-credits`), falling back to the limit id. No window ever overwrites another.
- Several accounts of one provider report the same limit ids. Reports of the selected native provider come first; the rest order by `fetchedAt` descending, so the freshest report wins duplicate limit ids deterministically and the surviving window never flips between accounts across refetches.
- The reader fails the whole read when any requested provider read fails, even if a sibling read returned reports: a partial answer presented as complete would mask one provider's outage behind another's empty success.
- z.ai gift resets are not part of OMP's report, so the native-backed zai provider enriches a successful answer afterwards: it resolves the selected credential, reads `customer-package-reset/list` through `providers/zai-gift-reset.ts` and merges the discovered gift onto one window per reset type — the token-metered window preferred deterministically, since one consumable gift must not render duplicate buttons. A list failure or empty list leaves the quota answer intact — the reset button simply does not render. This is the one Host-side vendor read a native-backed provider keeps, recorded in `.workflow/decisions.md`.

Deliberate non-native providers a probe exists for (verified against vendored OMP probe sources):

- `kimi-for-coding` keeps its scraper: the `kimi-code` probe is OAuth-only, while the scraper also covers API-key accounts through the coding usages endpoint and the Moonshot pay-as-you-go balance fallback. Native backing would strip every API-key user's quota.
- `google` keeps its scraper: the `google-antigravity` probe covers only antigravity accounts; the card also serves `google-gemini-cli` accounts, for which no probe exists.
- `ollama-cloud` stays an explicit no-op: the `ollama-cloud` probe always reports empty limits because Ollama exposes no standalone quota API, so native backing would replace the honest "unsupported" signal with a misleading configured failure.

Node server entrypoints apply `../network-defaults.js` before serving requests, including the daemon launched through `server/index.js`. Connection attempts receive 5 seconds without changing address-family selection.
## Entrypoints and structure
- `packages/web/server/lib/quota/index.js`: public entrypoint re-exporting the dispatcher and provider fetchers.
- `packages/web/server/lib/quota/routes.js`: Express route registration for quota endpoints (`registerQuotaRoutes`).
- `packages/web/server/lib/quota/providers/index.js`: provider registry, configured-provider filter, and coalescing dispatcher.
- `packages/web/server/lib/quota/native.ts`: native OMP usage report reader (`createNativeUsageReader`), the report-to-quota conversion (`nativeReportsToProviderResult`), the native-backed registry entry factory (`createNativeQuotaProvider`), and the logical-to-native provider coverage map (`NATIVE_QUOTA_PROVIDERS`).
- `packages/web/server/lib/quota/providers/selected-credential.ts`: credential extraction (`credentialAccessToken`, `credentialRefreshToken`, `credentialExpiresAt`) and required context validation (`requireSelectedCredential`).
- `packages/web/server/lib/quota/providers/google/`: Google-specific auth, API, and transform modules.
- `packages/web/server/lib/quota/providers/zai-gift-reset.ts`: the z.ai gift-reset activation flow and the gift-reset list read, neither of which OMP implements.
- `packages/web/server/lib/quota/utils/`: shared formatting and transform helpers.

## Credential architecture and resolution flow

`selected-usage.ts` supplies the control service's `usage.read` loader using the
same catalog selectors and private resolver as the HTTP quota routes. Its scope
is the Host-resolved calling workspace and agent directory. A missing selected
record is unconfigured; catalog, scope and resolution failures stay failures.
`listUsagePageProviders` exposes the built-in Usage page cards, excluding the
Copilot add-on card. Extension usage reads remain on their separate quota routes.

Live quota fetches resolve provider credentials dynamically from the selected workspace context. The web server never reads legacy OpenCode `auth.json` or `opencode.json` files, and the obsolete `../opencode/auth.js` and `resolveConfigApiKey` utilities are removed.

1. **Request context:**
   Routes accept request context (`workspaceId`, `agentDirectoryId`, optional `providerId`, optional `credentialRef`) from query parameters or request body.
2. **Catalog selection:**
   Host `private-credential.ts` (`createCatalogCredentialSelections`) validates the workspace scope via Host `resolveWorkspaceScope`, queries the workspace provider catalog from Agent Service (`GET /api/agent/v1/workspaces/:workspaceId/providers`), and maps native provider IDs to logical quota IDs using `QUOTA_PROVIDER_RELATIONS`:
   - `anthropic` (method `oauth`) -> `claude`
   - `openai-codex` (method `oauth`) -> `codex`
   - `google-gemini-cli` / `google-antigravity` (method `oauth`) -> `google`
   - `github-copilot` -> `github-copilot-addon` (and `github-copilot` directly)
   - `charm-hyper` -> `hyper`
   - `zai` -> `zai-coding-plan`
   - `zhipu-coding-plan` -> `zhipuai-coding-plan`
   - `kimi-code` -> `kimi-for-coding`
   - `nanogpt` -> `nano-gpt`
   - `minimax-code` -> `minimax-coding-plan`
   - `minimax-code-cn` -> `minimax-cn-coding-plan`
   - `wafer-serverless` -> `wafer`
   - `xai-oauth` (method `oauth`) -> `xai`
   - Native providers without an explicit alias mapping retain their native `providerId` (for example, `cline-pass`, `cursor`, `deepinfra`, `deepseek`, `openrouter`, `neuralwatt`, `kilo`, `zenmux`).
   Selections are filtered against `listConfiguredQuotaProviders` in `providers/index.js` to ensure the registry supports each logical quota provider ID.
3. **Secret resolution:**
   `fetchQuotaForProvider` invokes `requireSelectedCredential({ ...selection, purpose: 'quota', resolveCredential })` in `providers/selected-credential.ts`. Host `resolveCredential` calls the Agent Service internal endpoint `POST /internal/workspaces/:workspaceId/credentials/resolve`. A missing selected record (`CREDENTIAL_UNAVAILABLE`) becomes an unconfigured result; every other resolution failure keeps the provider configured and returns a sanitized error.
4. **Agent Service storage owner:**
   The dedicated Bun Agent Service worker owns `AuthStorage` and `NativeCredentials`:
   - API key credentials: command-backed credentials (`!`) are rejected with 422; keys are resolved via `resolveConfigValue(credential.key)`.
   - OAuth credentials: fresh access tokens are retrieved via `AuthStorage.oauth.accessById`, which handles OAuth token refresh automatically.
5. **Secret boundary:**
   Resolved credential material remains private to server memory and is never returned in HTTP responses to the browser.

## Change events

The extension usage provider list is a pure function of the extension catalog, so this module owns no write route of its own. Instead, every committed lifecycle write to an extension whose manifest declares `contributes.quota` (install, update, approval or withdrawal, pause or resume, removal) is announced by the guests module on the shared control stream as `openchamber:quota-providers-changed`, scoped to `{ providerId: 'ext-<guestId>' }` and validated against `quotaProvidersChangedPropertiesSchema` in `extension-registry.ts` before broadcast. The same event names a built-in logical provider id (`{ providerId: 'claude' }` and the other registry ids) when a committed canonical provider write changes what feeds its card: account add, remove or selection, an OAuth flow that reaches `authenticated`, provider configuration, provider deletion and credential writes or deletes (`packages/web/server/lib/host/canonical-routes.ts` tags those routes `quotaMutation`; the Host maps the mutated native provider id to the logical ids it feeds through the same relations the credential selection uses and broadcasts one event per id). Refused or failed writes announce nothing, and an OAuth flow that stays pending, cancelled or failed announces nothing either. The UI consumer's copy of the schema lives in `packages/ui/src/lib/quota/extensionProviders.ts`; `extension-registry-events.test.js` keeps the two in step and covers emission.

## Supported provider IDs (dispatcher)

These provider IDs are registered in `packages/web/server/lib/quota/providers/index.js` and dispatchable via `fetchQuotaForProvider(providerId)`:

| Provider ID | Display name | Module | Credential source & authority |
| --- | --- | --- | --- |
| `claude` | Claude | native (`anthropic` probe) | Native-backed: canonical usage report for native provider `anthropic`, read by OMP's probe in Agent Service `AuthStorage`. |
| `cline-pass` | ClinePass | native (`cline-pass` probe) | Native-backed: canonical usage report for native provider `cline-pass`. |
| `codex` | Codex | native (`openai-codex` probe) | Native-backed: canonical usage report for native provider `openai-codex`. |
| `cursor` | Cursor | native (`cursor` probe) | Native-backed: canonical usage report for native provider `cursor`. |
| `deepinfra` | DeepInfra | `providers/deepinfra.js` | Selected API key via Agent Service `AuthStorage`. |
| `deepseek` | DeepSeek | `providers/deepseek.js` | Selected API key via Agent Service `AuthStorage`. |
| `exe-dev` | exe.dev | `providers/exe-dev.js` | Unsupported for selected credential quota (`isConfigured: () => false`). |
| `google` | Google | `providers/google/index.js` | Native provider `google-gemini-cli` or `google-antigravity`, OAuth method in Agent Service `AuthStorage`. Requires `projectId`. |
| `hyper` | Charm Hyper | native (`charm-hyper` probe) | Native-backed: canonical usage report for native provider `charm-hyper`. |
| `zai-coding-plan` | z.ai | native (`zai` probe) + `providers/zai-gift-reset.ts` | Native-backed: canonical usage report for native provider `zai`. Gift reset activation stays Host-only. |
| `zhipuai-coding-plan` | Zhipu AI Coding Plan | `providers/zhipuai-coding-plan.js` | Native provider `zhipu-coding-plan`, API key via Agent Service `AuthStorage`. |
| `kimi-for-coding` | Kimi for Coding | `providers/kimi.js` | Native provider `kimi-code`, API key via Agent Service `AuthStorage`. Falls back to Moonshot balance on 401/403. |
| `openrouter` | OpenRouter | `providers/openrouter.js` | Selected API key via Agent Service `AuthStorage`. Fixed endpoint `https://openrouter.ai/api/v1/key`. |
| `nano-gpt` | NanoGPT | `providers/nanogpt.js` | Native provider `nanogpt`, API key via Agent Service `AuthStorage`. |
| `github-copilot` | GitHub Copilot | native (`github-copilot` probe) | Native-backed: canonical usage report for native provider `github-copilot`. |
| `github-copilot-addon` | GitHub Copilot Add-on | native (`github-copilot` probe) | Native-backed: canonical usage report for native provider `github-copilot`. |
| `minimax-coding-plan` | MiniMax Coding Plan (minimax.io) | native (`minimax-code` probe) | Native-backed: canonical usage report for native provider `minimax-code`. |
| `minimax-cn-coding-plan` | MiniMax Coding Plan (minimaxi.com) | `providers/minimax-cn-coding-plan.js` / `providers/minimax-shared.js` | Native provider `minimax-code-cn`, API key via Agent Service `AuthStorage`. |
| `ollama-cloud` | Ollama Cloud | `providers/ollama-cloud.js` | Unsupported for selected credential quota (`isConfigured: () => false`). |
| `wafer` | Wafer.ai | `providers/wafer.js` | Native provider `wafer-serverless`, API key via Agent Service `AuthStorage`. |
| `neuralwatt` | NeuralWatt | `providers/neuralwatt.js` | Selected API key via Agent Service `AuthStorage`. |
| `kilo` | Kilo Code | `providers/kilo.js` | Selected API key via Agent Service `AuthStorage`. |
| `zenmux` | ZenMux | `providers/zenmux.js` | Selected API key via Agent Service `AuthStorage`. |
| `xai` | xAI | native (`xai-oauth` probe) | Native-backed: canonical usage report for native provider `xai-oauth`. |

## Internal-only provider module
- `providers/openai.js`: logic parity and shared parsing helper module; intentionally not registered for dispatcher ID routing.

## HTTP routes
`packages/web/server/lib/quota/routes.js` registers Express endpoints under `/api/quota/*`:

- `GET /api/quota/providers`:
  Accepts workspace context via query parameters (`workspaceId`, `agentDirectoryId`, optional `providerId`, optional `credentialRef`). Returns `{ providers: string[] }` containing logical quota IDs supported by both the registry and the workspace catalog.
- `GET /api/quota/:providerId`:
  Resolves the workspace credential selection for `:providerId` and executes `fetchQuotaForProvider`. A known provider with no selected credential returns HTTP 200 with `ok: false`, `configured: false`, `usage: null` and no `error`, so the UI shows its normal empty state. A configured provider whose credential resolution or provider request fails returns `configured: true` with a sanitized `error`. Unsupported providers, scope failures and catalog/service failures return HTTP 503.
- `POST /api/quota/:providerId/gift-reset/use`:
  Supported only for `zai-coding-plan` (other provider IDs return HTTP 404). Accepts `{ recordId, resetType }` with workspace context in request body. Calls `useZaiGiftReset` to activate the package reset.

## Response contract
Provider modules return standardized results via shared helpers:
- Required fields: `providerId`, `providerName`, `ok`, `configured`, `usage`, `fetchedAt`.
- Optional field: `error`, `planLabel`.
- Unsupported requests return `ok: false`, `configured: false`, `error: 'Unsupported provider'`.
- An unconfigured provider returns `ok: false`, `configured: false`, `usage: null` and no `error`.
- A configured provider failure returns `ok: false`, `configured: true` and a sanitized `error`; the last successful sample is not replaced by the failure.
- `usage.windows` contains window records keyed by window identifier (such as `5h`, `weekly`, `monthly`, `credits_balance`).
- Optional provider-specific data is exposed under `usage.models` (for example, Google and Claude).
- Concurrent requests for the same provider and credential options are coalesced by `fetchQuotaForProvider` via `pendingFetches`.

## Provider-specific semantics



### MiniMax M3 Token Plan & Coding Plan
The international plan (`minimax-coding-plan`) is native-backed; the China endpoint (`minimax-cn-coding-plan`) keeps the Host scraper. The scraper supports both the M3 Token Plan and legacy Coding Plan endpoints:
- **Endpoints:** Tries `https://api.minimax.io/v1/token_plan/remains` (international) or `https://api.minimaxi.com/v1/token_plan/remains` (China), falling back to `/v1/api/openplatform/coding_plan/remains`.
- **Field semantics:** On the Token Plan endpoint, `current_interval_usage_count` represents remaining quota, so `used = total - remaining`. On the legacy Coding Plan endpoint, `usage_count` represents consumed quota.
- **Model selection:** Selects chat model candidate from `model_remains` matching `MiniMax-M*`, then `general`/`chat`/`text`, then percentage candidates.
- **Status check:** Window status `3` (`WINDOW_STATUS_INACTIVE`) indicates the window is not applicable for the current plan tier and is omitted.

### Google
Evaluates Google Cloud quota buckets and models:
- **Modules:** Split across `providers/google/index.js`, `auth.js`, `api.js`, and `transforms.js`.
- **Authentication:** Requires an OAuth credential with `projectId` for native `google-gemini-cli` or `google-antigravity`. Checks token expiration before calling Google Cloud APIs.



### ZenMux
Reports Pay As You Go credit balance:
- **Endpoint:** `GET https://zenmux.ai/api/v1/management/payg/balance`.
- **Authentication:** Selected API key via Agent Service `AuthStorage`. Extracts `data.total_credits` as USD balance.

### Kimi for Coding
Reports Kimi for Coding usage:
- **Endpoint:** `GET https://api.kimi.com/coding/v1/usages`.
- **Payload shapes:** Supports ratio-based `usages` payload (`limit_5h`, `limit_7d`, `limit_month_total`) and legacy counted payload (`limits[]`).
- **Fallback:** On HTTP 401 or 403, attempts fallback to Moonshot platform balance (`GET https://api.moonshot.ai/v1/users/me/balance`) for pay-as-you-go platform keys.

### OpenRouter
Reports OpenRouter key credits and limits:
- **Endpoint:** Fixed endpoint `GET https://openrouter.ai/api/v1/key`.
- **Authentication:** Selected API key via Agent Service `AuthStorage`. Management keys (`is_management_key: true`) are rejected with an error indicating an inference API key is required.

### Zhipu AI & z.ai
Report coding plan limits from monitor APIs:
- **Endpoints:** `https://open.bigmodel.cn/api/monitor/usage/quota/limit` (Zhipu AI) and `https://api.z.ai/api/monitor/usage/quota/limit` (z.ai).
- **Envelope validation:** Validates business failures inside HTTP 200 responses (`{ code, msg, success: false }`).
- **Limit types:** Maps `TOKENS_LIMIT` and `CREDIT_LIMIT` to hourly and weekly windows, and `TIME_LIMIT` to MCP Tools monthly window.
- **z.ai gift resets:** z.ai windows are read by the native probe; discovery and activation of a banked package reset stay Host-only: the native-backed provider merges `customer-package-reset/list` records onto matching windows, and `POST /api/quota/:providerId/gift-reset/use` activates one (`providers/zai-gift-reset.ts`).

### Ollama Cloud and exe.dev
Both provider modules export `isConfigured: () => false` and return explicit errors indicating that selected credential quota is unsupported.


## Notes for contributors
- Provider modules must export `providerId`, `providerName`, `isConfigured(credential)`, and `fetchQuota(options)`.
- Use shared helpers from `packages/web/server/lib/quota/utils/index.js` (`buildResult`, `toUsageWindow`, formatting helpers).
- Tests must mock `resolveCredential` returning `{ type: 'api_key', key }` or `{ type: 'oauth', access, refresh, expires }`. Never hardcode secrets in tests or docs.
- Verification is owned by package test suites; Task18 owns integrated workflow verification.
