# Release hardening: clear every solvable debt before 1.0

**Status:** done
**Priority:** high
**Integration branch:** release-hardening/integration

## What this is for

OhPiChamber is at its last step before release. The maintainer chose to ship with no technical debt that can be fixed now: no deferred UX defects, no surfaces disabled while waiting for a contract, no untyped fork-owned server modules, and a transcript tree that can follow upstream again. The final-main-audit zero-defect gate (lint 0 warnings, dead-code 0 findings) also has to hold on current `main`, not only on the 2026-11-19 candidate. This effort's gate task closes `final-main-audit` as well.

## What it does

- **Composer.** Pressing Enter when the input exactly matches a slash command submits it. A rejected control command puts the typed text back. While a new session's first run streams, the model label shows the model that run uses.
- **Provider authorization.** Image generation requests `provider.use` with `purpose: 'image'`. The Host admits it when an enabled workspace provider has the same provider id and endpoint, with any model, the same rule as embeddings. Advisor overflow compaction has a behavioral test for a refused candidate.
- **MCP credentials.** A credential reference stored in the user MCP file (`~/.omp/agent/mcp.json`) resolves from every workspace. Project-file references stay bound to their workspace. Existing user-file references are migrated, so saving from another workspace succeeds.
- **Queued messages.** Each queued message can be edited or sent right away. The Host keeps the original UI draft next to its own capture. An atomic take/restore hands the full draft back only after ownership moves to the client, and refuses leased or stale items. Old records without a recoverable original say so instead of failing silently.
- **Interrupted sends.** A send whose response was lost is reconciled through a durable Canonical receipt keyed by the caller's correlation/idempotency ID. Accepted turns are never duplicated, and rejected ones restore the draft.
- **Change events.** Successful Host writes emit scoped `guest-marks-changed` and `quota-providers-changed` events, and clients refresh through the shared control stream instead of waiting for `event-stream-ready`.
- **Quotas.** Guest SDK quotas and Work Status read native OMP account quotas for every provider OMP covers. The Host scrapers for those providers are removed. Providers OMP does not cover keep their Host scraper, and no provider loses coverage.
- **Last-turn diff.** A Canonical per-turn diff contract records each turn's file edits, and the Last-turn diff surface shows normal, empty, unsupported and failed states from it.
- **Model presets.** OMP `modelPresets` are listed and edited in Settings, next to the existing model roles hub and the ordered retry fallback chains.
- **Provider settings.** Every remaining provider protocol/tier, usage and voice setting either gets a control on its owner page or is recorded as config-only with a reason: internal tuning, terminal presentation, or a duplicate of an existing OpenChamber control (AGENTS.md settings rule).
- **Server types.** The 95 fork-owned server modules listed in `packages/web/scripts/fork-owned-server-untyped.json` carry real TypeScript types and pass strict checks. The list and its no-check project are removed.
- **Transcript.** The chat transcript renders through upstream's `column/ChatViewport` with the `timeline/*`, `message/body/*` and `message/parts/toolRow/*` owners, ported onto Canonical session, message and part records. The monolithic `ChatContainer → MessageList → ChatMessage → MessageBody → ToolPart` path is deleted in the same change.
- **Static hygiene.** `bun run lint` reports 0 warnings and `bun run dead-code` 0 findings on the final tree.

## How it is built

- Each change lands in its owning module. Agent Service and SDK patch changes keep SDK objects inside the worker, and Host policy stays in `packages/web/server/lib/host/worker-operation-authorizer.*`. Contract changes go through `packages/agent-contract` with generated clients rebuilt.
- Queue take/restore and interrupted-send receipts are persisted by their current owners (Host message queue, Agent Service prompt submission). Both define behavior for records written before this change.
- The ChatViewport port uses the upstream v2.8.0 sources (`git show 30c70496a5:<path>`) as the reference. It keeps fork behavior that exists only on the Canonical path (subagent child sessions, background shells, prompt origin, OMP tool cards).
- Exhaustive-deps findings are fixed by reasoning about each effect's trigger, never by blanket suppression. Dead-code findings are either deleted or turned into real entry points in `knip.json` when they are genuinely reachable.

## What it must not do

- Split OMP session construction into two phases for faster cold starts. The maintainer declined it (decisions.md, 2026-11-26).
- Add dependencies, edit `changelog/`, run GitHub commands or push.
- Touch the maintainer's data (`~/.config/ohpichamber`, `~/.config/OhPiChamber`, `~/.omp/agent`).
- Silence lint rules, weaken severities, add `as any` or broaden knip ignores to reach zero.

## What was considered and rejected

- **Force project scope for every credential-carrying MCP install.** Smaller, but it removes user-scope installs for token servers.
- **Exact provider/model/endpoint match for image models.** Every image model would need its own enablement, which embeddings do not need.
- **Keep Host quota scrapers alongside native quotas.** Two authorities for one number.
- **Close final-main-audit on its 2026-11-19 result.** Current `main` no longer meets that gate.

## How we will know it works

- **W1.** Composer, queue editing and send-now, interrupted-send reconciliation, Last-turn diff, model presets and the new provider settings controls are driven in a real isolated Web session (1600 px `zh-CN` and `en`, plus 390×844 mobile), with screenshots and zero console errors.
- **W2.** Agent Service and Host tests prove: image `provider.use` with `purpose: 'image'` is admitted and refused as specified; advisor overflow compaction surfaces a refusal without any provider request; a user-file MCP credential saves from a second workspace, and a migrated legacy reference resolves.
- **W3.** Host tests and a two-client run show `guest-marks-changed` and `quota-providers-changed` refreshing the other client. Quota coverage before and after removing scrapers lists the same providers.
- **W4.** `packages/web/scripts/fork-owned-server-untyped.json` and its no-check project are gone, `bun run type-check` passes with strict server checks, and the Web test suite passes.
- **W5.** Transcript parity: one fixed set of sessions (text, reasoning, every OMP tool card, subagents, background shells, compaction, errors) is captured on `main` before the port and on the integration branch after it, and the screenshots are compared side by side with no missing content.
- **W6.** On the integration head, final-main-audit task 06's `Check` passes in full: frozen install, `brand:generate --check`, `check`, `type-check`, `lint` with 0 warnings, `dead-code` with 0 findings, `docs:validate`, `VITEST_MAX_WORKERS=2 bun run test`, `workflow validate`. The rebuilt Linux AppImage passes `verify-linux-appimage` and reaches `/api/agent/v1/ready`. `.workflow/technical-debt.md` has no entries left.
