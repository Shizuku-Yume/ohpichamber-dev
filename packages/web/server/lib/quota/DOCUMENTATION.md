# Quota Module Documentation

## Purpose
This module fetches quota, credit, and usage signals for supported model providers in the web server runtime.

In the Settings Usage page, quota information is consumed as provider-specific quota cards only for configured providers that have active quota metrics. The overarching token analytics, costs, TTFT, tok/s, and error rates are provided by the Agent Service OMP statistics endpoint (`GET /api/agent/v1/usage`), while this module supplies the remaining provider quota windows and balances.

Node server entrypoints apply `../network-defaults.js` before serving requests, including the daemon launched through `server/index.js`. Connection attempts receive 5 seconds without changing address-family selection.
## Entrypoints and structure
- `packages/web/server/lib/quota/index.js`: public entrypoint re-exporting the dispatcher and provider fetchers.
- `packages/web/server/lib/quota/routes.js`: Express route registration for quota endpoints (`registerQuotaRoutes`).
- `packages/web/server/lib/quota/providers/index.js`: provider registry, configured-provider filter, and coalescing dispatcher.
- `packages/web/server/lib/quota/providers/selected-credential.js`: credential extraction (`credentialAccessToken`, `credentialRefreshToken`, `credentialExpiresAt`) and required context validation (`requireSelectedCredential`).
- `packages/web/server/lib/quota/providers/google/`: Google-specific auth, API, and transform modules.
- `packages/web/server/lib/quota/providers/claude/`: Claude usage transforms and rate-limit handling.
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
   Host `private-credential.js` (`createCatalogCredentialSelections`) validates the workspace scope via Host `resolveWorkspaceScope`, queries the workspace provider catalog from Agent Service (`GET /api/agent/v1/workspaces/:workspaceId/providers`), and maps native provider IDs to logical quota IDs using `QUOTA_PROVIDER_RELATIONS`:
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
   `fetchQuotaForProvider` invokes `requireSelectedCredential({ ...selection, purpose: 'quota', resolveCredential })` in `providers/selected-credential.js`. Host `resolveCredential` calls the Agent Service internal endpoint `POST /internal/workspaces/:workspaceId/credentials/resolve`. A missing selected record (`CREDENTIAL_UNAVAILABLE`) becomes an unconfigured result; every other resolution failure keeps the provider configured and returns a sanitized error.
4. **Agent Service storage owner:**
   The dedicated Bun Agent Service worker owns `AuthStorage` and `NativeCredentials`:
   - API key credentials: command-backed credentials (`!`) are rejected with 422; keys are resolved via `resolveConfigValue(credential.key)`.
   - OAuth credentials: fresh access tokens are retrieved via `AuthStorage.oauth.accessById`, which handles OAuth token refresh automatically.
5. **Secret boundary:**
   Resolved credential material remains private to server memory and is never returned in HTTP responses to the browser.

## Supported provider IDs (dispatcher)

These provider IDs are registered in `packages/web/server/lib/quota/providers/index.js` and dispatchable via `fetchQuotaForProvider(providerId)`:

| Provider ID | Display name | Module | Credential source & authority |
| --- | --- | --- | --- |
| `claude` | Claude | `providers/claude/` | Native provider `anthropic`, OAuth method in Agent Service `AuthStorage`. Checks `credential.expires`. |
| `cline-pass` | ClinePass | `providers/cline-pass.js` | Selected API key via Agent Service `AuthStorage`. |
| `codex` | Codex | `providers/codex.js` | Native provider `openai-codex`, OAuth method in Agent Service `AuthStorage`. Optional `accountId` from credential. |
| `cursor` | Cursor | `providers/cursor.js` | Selected API key or OAuth via Agent Service `AuthStorage`. Checks JWT / stored expiration. |
| `deepinfra` | DeepInfra | `providers/deepinfra.js` | Selected API key via Agent Service `AuthStorage`. |
| `deepseek` | DeepSeek | `providers/deepseek.js` | Selected API key via Agent Service `AuthStorage`. |
| `exe-dev` | exe.dev | `providers/exe-dev.js` | Unsupported for selected credential quota (`isConfigured: () => false`). |
| `google` | Google | `providers/google/index.js` | Native provider `google-gemini-cli` or `google-antigravity`, OAuth method in Agent Service `AuthStorage`. Requires `projectId`. |
| `hyper` | Charm Hyper | `providers/hyper.js` | Native provider `charm-hyper`, API key via Agent Service `AuthStorage`. |
| `zai-coding-plan` | z.ai | `providers/zai.js` | Native provider `zai`, API key via Agent Service `AuthStorage`. Supports gift reset activation. |
| `zhipuai-coding-plan` | Zhipu AI Coding Plan | `providers/zhipuai-coding-plan.js` | Native provider `zhipu-coding-plan`, API key via Agent Service `AuthStorage`. |
| `kimi-for-coding` | Kimi for Coding | `providers/kimi.js` | Native provider `kimi-code`, API key via Agent Service `AuthStorage`. Falls back to Moonshot balance on 401/403. |
| `openrouter` | OpenRouter | `providers/openrouter.js` | Selected API key via Agent Service `AuthStorage`. Fixed endpoint `https://openrouter.ai/api/v1/key`. |
| `nano-gpt` | NanoGPT | `providers/nanogpt.js` | Native provider `nanogpt`, API key via Agent Service `AuthStorage`. |
| `github-copilot` | GitHub Copilot | `providers/copilot.js` | Native provider `github-copilot`, API key or OAuth via Agent Service `AuthStorage`. |
| `github-copilot-addon` | GitHub Copilot Add-on | `providers/copilot.js` | Native provider `github-copilot`, API key or OAuth via Agent Service `AuthStorage`. |
| `minimax-coding-plan` | MiniMax Coding Plan (minimax.io) | `providers/minimax-coding-plan.js` / `providers/minimax-shared.js` | Native provider `minimax-code`, API key via Agent Service `AuthStorage`. |
| `minimax-cn-coding-plan` | MiniMax Coding Plan (minimaxi.com) | `providers/minimax-cn-coding-plan.js` / `providers/minimax-shared.js` | Native provider `minimax-code-cn`, API key via Agent Service `AuthStorage`. |
| `ollama-cloud` | Ollama Cloud | `providers/ollama-cloud.js` | Unsupported for selected credential quota (`isConfigured: () => false`). |
| `wafer` | Wafer.ai | `providers/wafer.js` | Native provider `wafer-serverless`, API key via Agent Service `AuthStorage`. |
| `neuralwatt` | NeuralWatt | `providers/neuralwatt.js` | Selected API key via Agent Service `AuthStorage`. |
| `kilo` | Kilo Code | `providers/kilo.js` | Selected API key via Agent Service `AuthStorage`. |
| `zenmux` | ZenMux | `providers/zenmux.js` | Selected API key via Agent Service `AuthStorage`. |
| `xai` | xAI | `providers/xai.js` | Native provider `xai-oauth`, OAuth method in Agent Service `AuthStorage`. Checks stored and JWT expiry. |

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

### Claude
Reports subscription limits from Anthropic's OAuth usage API:
- **Endpoint:** `GET https://api.anthropic.com/api/oauth/usage` with header `anthropic-beta: oauth-2025-04-20`.
- **Authentication:** Selected native `anthropic` OAuth credential from Agent Service `AuthStorage`. Checks `selectedCredential.expires` before sending requests.
- **Rate limiting:** Anthropic rate limits aggressively. Successful usage payloads are cached in memory and served during 429 cooldowns (`Retry-After` header or 5 minutes up to 1 hour). The cache is keyed by sha256 fingerprint of access and refresh tokens.
- **Refresh ownership:** OpenChamber does not initiate OAuth refresh or rotate tokens directly; token refresh is owned by Agent Service `AuthStorage`.

### xAI
Reports SuperGrok billing configuration:
- **Endpoint:** `POST https://grok.com/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig` (gRPC-web).
- **Authentication:** Selected native `xai-oauth` OAuth credential from Agent Service `AuthStorage`. Checks `accessTokenExpired` (stored expiry or JWT `exp` with 120-second skew).
- **Refresh ownership:** Native `AuthStorage` owns OAuth token rotation; the quota module consumes the current access token and returns an expired credential error when stale.

### MiniMax M3 Token Plan & Coding Plan
Supports both the M3 Token Plan and legacy Coding Plan endpoints:
- **Endpoints:** Tries `https://api.minimax.io/v1/token_plan/remains` (international) or `https://api.minimaxi.com/v1/token_plan/remains` (China), falling back to `/v1/api/openplatform/coding_plan/remains`.
- **Field semantics:** On the Token Plan endpoint, `current_interval_usage_count` represents remaining quota, so `used = total - remaining`. On the legacy Coding Plan endpoint, `usage_count` represents consumed quota.
- **Model selection:** Selects chat model candidate from `model_remains` matching `MiniMax-M*`, then `general`/`chat`/`text`, then percentage candidates.
- **Status check:** Window status `3` (`WINDOW_STATUS_INACTIVE`) indicates the window is not applicable for the current plan tier and is omitted.

### Google
Evaluates Google Cloud quota buckets and models:
- **Modules:** Split across `providers/google/index.js`, `auth.js`, `api.js`, and `transforms.js`.
- **Authentication:** Requires an OAuth credential with `projectId` for native `google-gemini-cli` or `google-antigravity`. Checks token expiration before calling Google Cloud APIs.

### Codex
Reports ChatGPT / Codex subscription windows:
- **Endpoint:** `GET https://chatgpt.com/backend-api/wham/usage`.
- **Authentication:** Selected native `openai-codex` OAuth credential. Attaches `ChatGPT-Account-Id` when `credential.accountId` is present.
- **Windows:** Extracts primary and secondary rate limit windows, numeric credits balance (`credits_balance`), and business spend limits (`spend_control.individual_limit`).

### Cursor
Reports Cursor subscription and usage data:
- **Endpoints:** `https://api2.cursor.sh/aiserver.v1.DashboardService/*` and `/auth/*`.
- **Authentication:** Selected API key or OAuth credential. Verifies JWT expiration and stored expiry with a 5-minute buffer.
- **Windows:** Extracts `billing_cycle`, `auto`, `api`, `plan_limit`, and on-demand spend. Falls back to enterprise team profile and spend endpoints when `planUsage` is absent.

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
- **z.ai gift resets:** Discovers claimable package resets via `GET https://api.z.ai/api/biz/customer-package-reset/list?targetType=PERSONAL` and activates them via `POST /api/quota/:providerId/gift-reset/use`.

### Ollama Cloud and exe.dev
Both provider modules export `isConfigured: () => false` and return explicit errors indicating that selected credential quota is unsupported.

#### Cursor individual dollar allowance fallback

When the legacy Enterprise readers produce no billing-cycle meter, the server
and VS Code both call `providers/cursor-summary.js`. It reads the fixed
`https://cursor.com/api/usage-summary` endpoint using the existing access token
in the dashboard's `WorkosCursorSessionToken` cookie. Redirects are refused and
the request has a 15-second deadline. There is at most one additional request
per refresh; Pro and usable request-based Enterprise meters do not call it.

`individualUsage.overall` supplies the individual's used and limit amounts in
cents. Only an explicitly enabled bucket with nonnegative usage and a positive
limit becomes a billing-cycle window, with the summary's billing-cycle end. A
blank or whitespace-only `used` or `limit` is missing data, never zero.
Team pools and team on-demand spending are never substituted for this personal
allowance. An absent bucket or a failed request leaves the legacy result intact.

#### Why the dashboard fallback is shared

Both runtimes need the same cookie construction, cents conversion and personal
scope. Sharing this reader keeps those rules equal without changing the older
provider-specific request and on-demand meters.

## Notes for contributors
- Provider modules must export `providerId`, `providerName`, `isConfigured(credential)`, and `fetchQuota(options)`.
- Use shared helpers from `packages/web/server/lib/quota/utils/index.js` (`buildResult`, `toUsageWindow`, formatting helpers).
- Tests must mock `resolveCredential` returning `{ type: 'api_key', key }` or `{ type: 'oauth', access, refresh, expires }`. Never hardcode secrets in tests or docs.
- Verification is owned by package test suites; Task18 owns integrated workflow verification.
