# 02: Provider & Model Editing Progressive-Disclosure UX Redesign

**Effort:** ux-audit-remediation-2026-11-24
**Blocked by:** None
**Covers:** W2

**Files:**
- `packages/ui/src/components/sections/providers/CustomProviderForm.tsx`
- `packages/ui/src/components/sections/providers/CustomProviderModelRow.tsx`
- `packages/ui/src/components/sections/providers/OmpProviderSubforms.tsx`
- `packages/ui/src/components/sections/providers/custom-provider-form.ts`
- `packages/ui/src/components/sections/providers/ProvidersPage.tsx`
- `packages/ui/src/components/sections/providers/*.test.ts`
- `packages/ui/src/components/sections/providers/*.test.tsx`
- `packages/ui/src/lib/i18n/messages/omp-provider-config.i18n.ts`
- `packages/ui/src/lib/i18n/messages/providers.i18n.ts`

**Read first:**
- `.workflow/specs/ux-audit-remediation-2026-11-24.md`
- `packages/ui/src/components/sections/PATTERNS.md`
- `packages/ui/src/components/sections/references/layout.md`
- `packages/ui/src/components/sections/references/controls.md`
- `packages/ui/src/lib/theme/STYLING.md`
- `packages/agent-contract/src/omp-provider-config.ts`
- `.agents/skills/locale-ui-patterns/SKILL.md`

**Check:** `bun run --cwd packages/ui test src/components/sections/providers/ src/components/sections/settingsLayoutGuard.test.ts && bun run --cwd packages/ui type-check`

## Context

Maintainer feedback (Image #2): Provider editing dumps every OMP 19.1 parameter flat in the user's face regardless of usage frequency or UX.
Audit findings:
- `CustomProviderForm.tsx` puts ~10 rows before Models including rarely-used `authHeader`, `configApiKey`, a huge icon grid, and logo upload; mounts `headers` and `overrides` as top-level always-visible sections; and **auto-expands** `discoveryOpen`, `compatOpen` (raw `compatJson` textarea), `bedrockOpen`, and `remoteCompactionOpen` on edit whenever values exist (`lines 117-133`).
- `apiDisplayLabel` only prettifies 3 of 16 provider APIs, so the protocol `<Select>` and the model protocol filter pills (`openai-codex-responses (2)`, `openai-images (3)`, `anthropic-messages (4)`, `openai-completions (9)`) print ugly raw wire identifiers.
- Model rows in `CustomProviderModelRow.tsx` render a cluttered 3-line summary when collapsed and explode into ~10 always-visible fields (including 24-item raw `api` select, 9-item `kind` select, `baseUrl`, `maxContext`, tri-states, modality checkboxes) plus 3 nested disclosures when expanded.

## Checklist

- [x] **Human-Readable API/Protocol Labels Everywhere (`custom-provider-form.ts`)**:
  - Extend `apiDisplayLabel(api)` (and add a companion `modelApiDisplayLabel(api)` if needed) to map ALL 16 `OMP_PROVIDER_APIS` and ALL 24 `OMP_MODEL_APIS` to clean, concise human-readable names (e.g., `openai-completions` → `OpenAI Chat Completions`, `openai-responses` → `OpenAI Responses`, `openai-codex-responses` → `OpenAI Codex Responses`, `openai-images` → `OpenAI Images`, `anthropic-messages` → `Anthropic Messages`, `google-generative-ai` → `Google Gemini`, `google-vertex` → `Google Vertex AI`, `google-gemini-cli` → `Google Gemini CLI`, `bedrock-converse-stream` → `AWS Bedrock`, `azure-openai-responses` → `Azure OpenAI Responses`, etc.).
  - Use these clean labels in: the provider Protocol `<Select>`, the model protocol filter chips, each collapsed model row's summary, and the per-model API `<Select>` (never bare raw slugs when a label exists).
- [x] **Tier 1 Provider Identity — Essential Connection Fields Only (`CustomProviderForm.tsx`)**:
  - Keep ONLY frequent connection fields directly visible in the top Connection section:
    - Provider Name (`name`)
    - Provider ID (`providerId` — editable on create, quiet read-only metadata or disabled on edit)
    - Protocol (`api`)
    - Base URL (`baseUrl`)
    - API Key (`apiKey`)
    - Auth Mode (`authMode` — keep clean single row, or hide/collapse if default API-key-only unless configured/changed)
  - Move cosmetic and low-frequency provider identity fields (`icon` picker, `logo` upload, `authHeader` tri-state, `configApiKey` action/secret) out of the top wall into a **default-collapsed** `SettingsDisclosure` ("Appearance & auth overrides" / "外观与认证覆盖") with a concise `secondary` summary (e.g., icon/logo/auth status).
  - For built-in provider edit (`isBuiltIn`), move verbose override explanation behind `info=` per `PATTERNS.md`.
- [x] **Tier 2 Models Section — Clean 2-Line Rows & 5 Essential Expanded Fields (`CustomProviderForm.tsx`, `CustomProviderModelRow.tsx`)**:
  - Only show protocol filter chips when the provider has ≥2 distinct protocols; render human-readable labels via `apiDisplayLabel`.
  - Clean up each collapsed `CustomProviderModelRow` into a scannable **2-line layout**:
    - Line 1: **Model Name** + subtle mono `modelId` (only when distinct from name) + copy & delete icon buttons (`SETTINGS_ICON_BUTTON_CLASS`).
    - Line 2: compact single-line muted metadata summary (e.g., `OpenAI Codex Responses · 600K ctx · 128K out`, truncated cleanly — no overflowing tag soup or redundant domain repeats when it matches provider baseURL).
  - When a user expands a model row, show **ONLY 5 essential fields directly**:
    1. Model ID (`id`)
    2. Display Name (`name`)
    3. Context Window (`contextWindow`)
    4. Max Output (`maxOutput`)
    5. Core Capabilities (compact inline switches/checkboxes for `Tools`, `Reasoning`, and input modalities like `Vision/Image` — NOT raw tri-state dropdowns unless explicitly in Advanced; preserve tri-state `'default'` fidelity without cluttering the common path, or keep compact `Tools` / `Reasoning` controls clean and non-overwhelming).
  - Fold ALL other per-model fields into **default-collapsed** `SettingsDisclosure` rows inside the model editor (each with a concise `secondary` summary when non-default):
    1. **Protocol & endpoint override** (`api`, `kind`, `baseUrl`, `maxContext`)
    2. **Thinking & effort** (`thinking.mode`, `defaultLevel`, efforts, `effortMap`)
    3. **Pricing** (7 numeric cost fields)
    4. **Advanced & compatibility** (`websockets`, `omitMaxOutput`, `tokenizer`, `imageCountBudget`, `imageInputDecoder`, `contextPromotionTarget`, `compactionModel`, 12 `COMPAT_BOOLEAN_FLAGS`, `maxTokensField`, raw `compatJson`, per-model `remoteCompaction`, per-model `headers`)
- [x] **Tier 3 Provider Advanced Section — ALL Default-Collapsed Disclosures (`CustomProviderForm.tsx`)**:
  - NEVER auto-expand `discoveryOpen`, `compatOpen`, `bedrockOpen`, or `remoteCompactionOpen` on initial open just because values exist (`useState(false)` for all of them!).
  - Move provider-wide **Custom Headers** (`headers`) and **Model Overrides** (`overrides`) from top-level sections into default-collapsed `SettingsDisclosure` rows inside the single `Advanced` section, alongside `Discovery`, `Compatibility`, `Bedrock`, and `Remote Compaction`.
  - Every disclosure MUST display an informative `secondary` summary when configured (e.g., `3 headers`, `2 overrides`, `Custom JSON`, `Guardrail configured`, `Endpoint set`) so the user can see at a glance what is active without walls of inputs.
  - Auto-open a specific disclosure ONLY when: (a) form validation fails on a field inside that disclosure, OR (b) the user interactively switches the provider protocol to `bedrock-converse-stream` (for Bedrock).
- [x] **Lossless Round-Trip, i18n & Tests**:
  - Preserve 100% of existing OMP provider & model serialization, validation, and round-trip behavior (zero data loss when saving a provider without opening collapsed disclosures!).
  - Translate every new/updated string across ALL 15 locales in `omp-provider-config.i18n.ts` / `providers.i18n.ts`.
  - Update and expand provider tests verifying: human-readable protocol labels, default-collapsed disclosures even when populated with compat/headers/bedrock/discovery/remoteCompaction, lossless save while collapsed, and auto-open on validation error.

## Progress

- Implemented exhaustive human-readable protocol/API labels (`apiDisplayLabel` for 16 `OMP_PROVIDER_APIS`, `modelApiDisplayLabel` for 24 `OMP_MODEL_APIS`) in `custom-provider-form.ts` using `ReadonlyMap` lookup (no type assertions, no prototype-property leakage), applied across `CustomProviderForm.tsx`, `CustomProviderModelRow.tsx`, and `OmpProviderSubforms.tsx`.
- Redesigned `CustomProviderForm.tsx` Tier 1 (6 essential connection fields + default-collapsed "Appearance & auth overrides" disclosure, built-in override prose moved behind `info=`) and Tier 3 (all 6 Advanced disclosures including Headers and Model overrides default-collapsed via `useState(false)` with localized `secondary` summaries, auto-opening only on validation errors or interactive `bedrock-converse-stream` selection), plus protocol filter chips rendered only when `>= 2` protocols exist with `aria-pressed`.
- Redesigned `CustomProviderModelRow.tsx` Tier 2 into a 2-line collapsed summary (human API label, deduplicated `modelId`, omitted matching `providerBaseUrl` host, no capability badges), 5 essential direct expanded fields, and 4 default-collapsed nested disclosures (`Protocol & endpoint override`, `Thinking & effort`, `Pricing & cache`, `Advanced & compatibility`) that re-open on repeated invalid submits via `validationAttempt` while keeping lossless state in `ModelRow`.
- Added real 15-locale translations (`ar`, `de`, `en`, `es`, `fr`, `he`, `ja`, `ko`, `nl`, `pl`, `pt-BR`, `tr`, `uk`, `zh-CN`, `zh-TW`) in `providers.i18n.ts` and `omp-provider-config.i18n.ts`.
- Expanded unit and component tests in `custom-provider-form.test.ts`, `CustomProviderForm.test.tsx`, and `CustomProviderModelRow.test.tsx`.
- Independent read-only review findings (`task02/review.md`) resolved: replaced `as` casts and prototype-lookup hazard with `ReadonlyMap`, removed unused `_t` parameter across all callers/tests, added `validationAttempt` so nested model disclosures re-open on repeated invalid submits, and added `aria-pressed` to protocol filter chips.
- Verification (Check command's `run-isolated-tests.mjs` only accepts directories, so `settingsLayoutGuard.test.ts` and `messages.test.ts` were run directly via `bun test` alongside the isolated directory runner):
  - `node scripts/run-isolated-tests.mjs packages/ui/src/components/sections/providers`: 7/7 test files passed (`CustomProviderForm.test.tsx`, `CustomProviderModelRow.test.tsx`, `custom-provider-form.test.ts`, `ProviderAccounts.test.tsx`, `ProviderOAuthMethods.test.tsx`, `ProviderSelectionCompatibility.test.tsx`, `ProvidersPage.test.ts`).
  - `(cd packages/ui && bun test src/components/sections/settingsLayoutGuard.test.ts)`: 14 pass, 0 fail (57 expects).
  - `(cd packages/ui && bun test src/components/sections/settingsSearchAnchors.test.ts)`: 7 pass, 0 fail (59 expects).
  - `(cd packages/ui && bun test src/lib/i18n/messages.test.ts)`: 17 pass, 0 fail (4,860 expects).
  - `bun run --cwd packages/ui type-check`: 0 type errors across 4,434 files.
  - `bunx oxlint` on all 9 changed/created files: 0 findings (exit 0).
- Check after: final edits (`node scripts/run-isolated-tests.mjs packages/ui/src/components/sections/providers`, `(cd packages/ui && bun test src/components/sections/settingsLayoutGuard.test.ts)`, `(cd packages/ui && bun test src/lib/i18n/messages.test.ts)`, `bun run --cwd packages/ui type-check`, `bunx oxlint`) — all passed with 0 errors/findings.
- Review: pass (base 1637a063b39aacc078b88188b8821ad176dc1f1f) — independent read-only reviewer findings (`task02/review.md`) fixed and re-verified.
