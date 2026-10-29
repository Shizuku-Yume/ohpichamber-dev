# 21: Diagnostics, overview, quota and session warming

**Effort:** upstream-refresh
**Task type:** feature
**Base commit:** c4ce06dc0fa2bc6228bc0e3c05d7ad3fda1af024
**Finished:** 2026-10-29
**Landed:** `5cd6f16bcc` on `upstream-refresh/integration`

**Delivers:** Upstream's diagnostics export, overview panel, quota/limit-failover handling, session warming and small-model routing work with the fork's providers.

**Blocked by:** 10, 22, 23
**Files:** Path list: `/home/shizuku/Project/ohpichamber-omp-artifacts/upstream-sync-2026-10-27/plan-paths/21.tsv` (80 paths: 52 clean/new, 28 both-side, 19 conflicts). Main locations: `packages/web/server/lib/{diagnostics,overview,quota,limit-failover,session-warming,session-assist,small-model}`, `packages/ui/src/lib/{diagnostics,overview,quota}`, `packages/ui/src/components/{overview,usage}`. Consume task 23's `stores/useSessionWarmingStore.ts` for the warming state/overview; no second warming source.

**Read first:** Spec W6; `.agents/skills/performance-engineering/SKILL.md`; `.agents/skills/enterprise-boundary/SKILL.md` (telemetry redaction); `.agents/skills/locale-ui-patterns/SKILL.md`.
**Covers:** W6

**Check:** `bun install --frozen-lockfile` and `bun run type-check` and `bun run lint` and `bun run test` all exit 0, the diagnostics/quota tests pass, and in the running app the overview lists waiting/running/finished work, the diagnostics export downloads a bounded and redacted timeline, and a quota failure shows its state. Real path: trigger one provider quota response or a named fixture.

## Done when

- [x] Diagnostics output is bounded and contains no tokens, prompts or credentials. Evidence: `diagnostics-export.txt` (2101 chars), zero matches for the prompts and key names; `logs/ui-focused-phase2.log`.
- [x] Overview derives live state and does not block on a slow provider. Evidence: `05-overview-running-and-in-work.png` (live turn counted as Running while it streamed) and `06-overview-needs-you-permission.png` (permission request surfaced as Needs you without a reload).
- Quota/limit-failover per provider is visible only as the unconfigured state here
  (no provider credential, fixed vendor endpoints); the behaviour itself is
  covered by the focused server tests. Reason and the missing fixture run under
  Limits in `## Progress`.
- Warming is observable through task 23's `useSessionWarmingStore` and no duplicate
  source is mounted, but the Host implements no per-session policy: the store
  settles on `unavailable` and the session toggles hide. Removal reason under
  Limits in `## Progress`.

## Progress

### Method and Base

Worktree `upstream-refresh-21`, branch `upstream-refresh/21`, cut from integration tip `aa0954a966`. Bun 1.4.4 from `~/.local/opt/bun/v1.4.4/bun-linux-x64/bun`.

Every path in `/home/shizuku/Project/ohpichamber-omp-artifacts/upstream-sync-2026-10-27/plan-paths/21.tsv` (80 paths) was reconciled against upstream `0056bf6a9` and the fork's canonical OMP contracts.

### Dispositions Summary

- **Adopted (52 paths):**
  - Diagnostics: `packages/ui/src/lib/diagnostics/` (`DOCUMENTATION.md`, `capture.test.ts`, `capture.ts`, `dialog-availability.ts`, `export.ts`, `timeline.test.ts`, `timeline.ts`), `packages/web/server/lib/diagnostics/` (`DOCUMENTATION.md`, `local-files.js`, `local-files.test.js`, `server-journal.js`, `server-journal.test.js`, `vocabulary.js`).
  - Overview: `packages/ui/src/components/overview/` (`ADR.md`, `DOCUMENTATION.md`, `OverviewView.test.tsx`, `OverviewView.tsx`, `overviewActions.ts`, `useOverviewData.ts`, `useWorktreeChangeRequests.ts`), `packages/ui/src/lib/overview/` (`overviewModel.test.ts`, `overviewModel.ts`), `packages/web/server/lib/overview/` (`feature-flag.js`, `feature-flag.test.js`).
  - Limit failover: `packages/web/server/lib/limit-failover/` (`DOCUMENTATION.md`, `policy.js`, `runtime.js`, `runtime.test.js`).
  - Session warming: `packages/web/server/lib/session-warming/` (`DOCUMENTATION.md`, `routes.js`, `routes.test.js`, `runtime.js`, `runtime.test.js`).
  - Quota: `packages/ui/src/lib/quota/` (`model-families.test.ts`, `model-families.ts`, `providers/index.ts`, `utils.test.ts`, `utils.ts`), `packages/web/server/lib/quota/providers/antigravity/` (9 paths: `api.js`, `api.test.js`, `auth.js`, `client.d.ts`, `client.js`, `client.test.js`, `index.js`, `transforms.js`, `transforms.test.js`), `packages/web/server/lib/quota/providers/google/` (`index.test.js`, `oauth.d.ts`, `oauth.js`), `packages/web/server/lib/quota/providers/ollama-cloud.test.js`, `packages/web/server/lib/quota/utils/formatters.js`.

- **Reconciled (22 paths):**
  - Server Quota: `packages/web/server/lib/quota/DOCUMENTATION.md`, `packages/web/server/lib/quota/routes.js`, `packages/web/server/lib/quota/providers/claude/` (`index.js`, `index.test.js`), `packages/web/server/lib/quota/providers/` (`codex.js`, `codex.test.js`, `copilot.js`, `copilot.test.js`, `index.js`, `ollama-cloud.js`, `openrouter.js`, `openrouter.test.js`), `packages/web/server/lib/quota/providers/google/` (`api.js`, `auth.js`, `index.js`, `transforms.js`).
  - Server Session Assist: `packages/web/server/lib/session-assist/` (`DOCUMENTATION.md`, `context.js`, `context.test.js`, `runtime.js`, `runtime.test.js`).
  - Server Small Model: `packages/web/server/lib/small-model/` (`DOCUMENTATION.md`, `client.js`, `index.js`, `index.test.js`).

- **Retired / Excluded (5 paths / symbols):**
  - `packages/web/server/lib/quota/credentials/providers.js`: retired in fork (OpenCode auth.json credentials reader).
  - `packages/web/server/lib/quota/credentials/store.js`: retired in fork (legacy cookie store).
  - `packages/web/server/lib/small-model/routes.js`: retired in fork (public small-model endpoints replaced by canonicalClient).
  - `diagnosticErrorMessage` (`packages/web/server/lib/diagnostics/vocabulary.js:50`): retired because its only upstream consumer (`packages/web/server/lib/opencode/proxy.js:16,99,100`) was deleted in fork during OMP migration (`X-opencode-engine.tsv`).
  - `isLimitFailoverConfigured` (`packages/web/server/lib/limit-failover/policy.js:92`): retired because its only upstream consumer (`packages/web/server/lib/opencode/managed-config-file.js:3,112`) was deleted in fork during OMP migration (`X-opencode-engine.tsv`).

- **Deferred with Owner:**
  - `packages/ui/src/lib/source-control/repositoryUrlMatcher.ts`, `packages/ui/src/lib/trackedItems/*`: Owned by Task 07 (`.workflow/tasks/upstream-refresh/07-review-surfaces-board-file-views.md`).
  - `readWorktreeUse` / `WorktreeUse` (`packages/ui/src/components/overview/overviewActions.ts:73,81`): Owned by Task 31 (`.workflow/tasks/upstream-refresh/31-one-view-sidebar-redesign.md:26`).
  - `packages/web/server/lib/diagnostics/opencode-load.js`: Retired. Not in `21.tsv`, OpenCode-specific process walker; all callers replaced with OMP Agent Service diagnostics (`packages/web/server/lib/host/canonical-routes.js:172-174`) from post-M3 hardening task 16 (`.workflow/done/post-m3-hardening/16-agent-service-diagnostics.md`).
### Missing Canonical Session Fields Evidence

- `session.outcome`: OpenCode 2.x session field was used to detect failure (`overviewModel.ts:88,114`). Canonical `Session` from `@openchamber/agent-contract` does not carry `outcome`; mapped to canonical `session.runtimeStatus === 'unavailable'` without faking or casting.
- `session.time.updated`, `session.time.archived`, `session.parentID`: OpenCode 2.x metadata fields; mapped directly to canonical `updatedAt`, `archivedAt`, `parentSessionId`.
- `session.id`: mapped to canonical `session.sessionId`.

### Fallback Finding and Fix

- Finding: In `packages/ui/src/components/overview/useOverviewData.ts:50-54`, `OverviewData` only computed `ready: hasLoaded || sessionsStatus === 'ready'`, returning `ready: false` when `sessionsStatus === 'error'`, which left the overview screen trapped in an indefinite loading state masquerading a fetch error as loading.
- Fix: Added `error: boolean` to `OverviewData` (`useOverviewData.ts:54,382`), rendered an explicit error banner in `OverviewView.tsx:495-501`, and added test `the page renders an explicit error state when session load fails` in `OverviewView.test.tsx:103-141`.

### Behavior without Task 07 (trackedItems / repositoryUrlMatcher)

- PR review requests: `useOverviewReviewRequests()` in `packages/ui/src/components/overview/useOverviewData.ts:139-141` returns `{ items: [], hasMore: false }`. In `packages/ui/src/components/overview/OverviewView.tsx:572-575`, the review requests section is hidden because `reviews.items.length === 0`.
- Linked issue state: in `useOverviewData.ts:338`, `issues: []` is passed to facts, so `doneSignalOf` in `overviewModel.ts:76-83` relies on PR merge state and agent hints without guessing tracker item resolution.
- Change request summaries: in `useWorktreeChangeRequests.ts:10`, `selectEntryVisualSummary` returns `null`, and unknown branches explicitly set `prsPending: true` (`useOverviewData.ts:335`), preserving the waiting row without premature done-classification.

### Checks at Tip

- `bun run type-check`: exit 0
- `bun run lint`: exit 0
- `bunx oxlint`: exit 0 (0 warnings, 0 errors across all authored files)
- UI focused tests (`bun test packages/ui/src/{lib/diagnostics,components/overview,lib/overview,lib/quota}`): 57/57 passed (including `redacts all tokens, prompts, and credentials from diagnostics output`)
- Server focused tests (`vitest run packages/web/server/lib/{diagnostics,overview,limit-failover,session-warming,session-assist,small-model,quota}`): 478/478 passed across 39 files
- `bun run dead-code`: diff against baseline: 0 new unused files (17 files, identical to baseline); 1 new unused export (`readWorktreeUse` in `overviewActions.ts:81`, deferred to Task 31); 1 consumed export (`resolveProjectColor` in `projectMeta.ts:86`, consumed by `useOverviewData.ts:377`); 1 new unused exported type (`WorktreeUse` in `overviewActions.ts:73`, deferred to Task 31). The namespace rename `openchamberConfig` -> `projectConfig` for `fetchProjectSetup` is caused by `start-session.integration.test.ts:13` importing `* as projectConfig from '@/lib/openchamberConfig'`, which knip associates as the primary namespace consumer instead of `issue-2039.test.ts`.

### Phase 2: heavy gates, real path and findings (2026-10-29)

Worktree `upstream-refresh-21` on `upstream-refresh/21`, rebased onto integration
tip `c4ce06dc0fa2bc6228bc0e3c05d7ad3fda1af024`. Evidence directory:
`/home/shizuku/Project/ohpichamber-omp-artifacts/upstream-refresh-21-2026-10-27/`.

#### Heavy gates (sequential, one at a time)

| Gate | Command | Exit | Log |
|---|---|---|---|
| Install | `bun install --frozen-lockfile` | 0 | `logs/heavy-install.log` |
| Root test | `bun run test` | 0 | `logs/heavy-test.log` |
| Build | `bun run build` | 0 | `logs/heavy-build.log` |

Root test totals: scripts 23/23 files, sdk 26/26, ui 928/928, agent-contract 177
passed, agent-service 246 passed + 7 skipped, electron 54/54, web 7278 passed +
142 skipped (456 files, 9 skipped); `7/7 suites passed`.

#### Real path

Dev server `bun run dev` with `OPENCHAMBER_HMR_UI_PORT=3740`,
`OPENCHAMBER_HMR_API_PORT=3741`, `OPENCHAMBER_OVERVIEW_ENABLED=1`,
`OPENCHAMBER_DATA_DIR=<artifacts>/runtime-data`, provider environment sourced from
`~/.config/ohpichamber/omp-m0-provider.env` (values never printed). Browser:
`chrome-devtools` 1.11.0 daemon in headless mode (`args=["--viaCli","--headless"]`),
isolated context `task21`, page `http://127.0.0.1:3740/`.

Screenshots (`screenshots/`, numbered in capture order):

1. `01-real-chat.png` - a real provider turn (`Reply with exactly: overview-check-ok.`)
   answered in the session, so the overview has finished work to list.
2. `02-overview-error-partial-discovery.png` - overview error state while the
   server reported `METADATA_READ_FAILED` for a stale workspace (see finding 3).
3. `03-real-session-finished.png` - the finished session after the model fix.
4. `04-overview-in-work.png` - overview lists the finished session under In work
   after Track as in work, with its Mark done action.
5. `05-overview-running-and-in-work.png` - "1 running" plus "1 in work": the live
   turn in the Running section and the tracked session below it.
6. `06-overview-needs-you-permission.png` - "1 needs you": a pending bash approval
   shows as Needs you / asks for permission with an Answer action.
7. `07-runtime-status-diagnostics-export.png` - Runtime status dialog with the new
   Download diagnostics action.
8. `08-usage-quota-unconfigured-state.png` - Settings > Usage quota list, every
   provider "Not set" (the quota surface's real failure state here).

Diagnostics export: the dialog action wrote
`openchamber-diagnostics-2026-10-28T17-25-29-422Z.txt` (2101 characters). Saved as
`diagnostics-export.txt`. Its header reports
`Current health: HTTP 200, status=ok, agent service=ready`; the event list holds
nine entries. Grep of the file for `overview-check-ok`, `Write three short
paragraphs`, `echo hi`, `Bearer`, `sk-`, `CLIProxyAPI`, `OPENAI`, `ANTHROPIC`:
0 matches each. The export is bounded by the 1,500-event / 24-hour UI buffer and
the fixed-source coverage lines.

Warming: `GET /api/session-warming` answers 404, so `useSessionWarmingStore`
settles on `unavailable` and both per-session warming surfaces hide
(`SessionWarmingModeField` returns null, `WorkStatusWarmingToggle` is gated on
`enabled`). The workspace-level control in Settings still reads and writes the
canonical `GET/PUT /api/agent/v1/workspaces/:workspaceId/cache-warming`
(`agent service=ready` in `/health`). No second warming source is mounted.

#### Findings fixed in this phase

1. **Overview unreachable although the server enabled it.** The Host reports
   `overviewFeatureAvailable` in the settings payload, but
   `packages/ui/src/lib/settings/registry.ts` had no field for it, so
   `parseSettingsDocument` dropped it and `useUIStore.overviewFeatureAvailable`
   stayed false: no command, no page, no entry point. Registered it as a computed
   instance field next to `routingFeatureAvailable`, regenerated
   `packages/web/server/lib/host/settings-registry.json` (which had also drifted
   behind the registry by 13 keys), and added a regression test. Commit
   `b89a566f1b`.
2. **The diagnostic timeline had no caller.** `buildDiagnosticLog` was exported
   and never imported, and nothing saved the result, so the task's export did not
   exist for a user. Added `downloadDiagnosticLog()` and a Download diagnostics
   action to `RuntimeStatusDialog`, with strings in every locale (ar/he are
   excluded by the parity rule). Commit `9307682332`.
3. **Every export claimed the server was unavailable.** `capture.ts` rejected the
   Host's canonical `/health` payload because it required `openCodeRunning` and
   `isOpenCodeReady`. The schema now accepts `{ status, agentService }` and the
   formatters report `status` and the agent service phase; engine-shaped hosts
   keep the old lines. Test `reports the Host canonical health...`. Commit
   `9307682332`.
4. **A worker could not start for an effort-named model.** `smol: ...:high` and
   the default roles reach the worker as `variant: 'high'`; for a model whose
   thinking is effort-addressed the projection published no variants, so every
   start failed `UNSUPPORTED_CAPABILITY`. A variant name that matches a published
   reasoning effort is now read as that effort. Commit `7cffb1398b`.
5. **Initialization failures lost their reason.** The reply carried only the
   code, so the log and the status dialog said `Worker initialization failed
   (UNSUPPORTED_CAPABILITY)` with no next step. The worker now sends a bounded
   detail and the supervisor puts it in the diagnostic; the status dialog shows
   `...: Selected profile tool is unavailable`. Commit `09bf2d359c`.
6. **The quota catalog failure was silent.** `/api/quota/providers` answered 503
   and discarded the error. It now logs the cause (`Selected credential operation
   failed` here). Commit `dc2393b0d1`.

#### Limits (not exercised, with the reason)

- **Quota 429 / limit failover against the fixture.** The handed-over fixture
  (`/tmp/quota-429-fixture.js`, HTTP 429 with `Retry-After: 60`) no longer exists
  on this machine; it was not recreated, because it cannot be wired into a real
  quota fetch without product changes: every quota provider calls a fixed vendor
  URL (`https://ollama.com/api/balance`, `https://api.github.com/...`, ...) and
  requires a stored provider credential; none is configured here
  (`GET /api/quota/:provider` answers 503 `Selected quota credential
  unavailable`). The UI state captured is the unconfigured one (screenshot 08).
  `limit-failover` and `quota` logic are covered by the focused server tests
  (437 passed, 34 files). A credentialed provider or a dev-only endpoint override
  is needed for the fixture run.
- **Quota credentials panel.** `packages/ui/src/components/sections/usage/QuotaCredentials.tsx`
  calls `/api/quota/credentials/:providerId`; `packages/web/server/lib/quota/routes.js`
  registers no such route (it has `providers`, `:providerId` and
  `gift-reset/use`). Not exercised, not fixed here.
- **Per-session warming runtime: removed by decision.** The modules were mounted
  nowhere and targeted deleted OpenCode endpoints; the maintainer chose to delete
  them rather than rewire them. See `decisions.md: 2026-10-29 - Delete upstream's
  per-session warming instead of rewiring it`, and the follow-up entry
  `Per-session warming has no Agent Service implementation` in
  `.workflow/technical-debt.md`. The canonical workspace control is untouched and
  remains the only warming surface.
- **Default `writer` agent profile.** Its `tools:` list includes tools the worker
  session does not mount, so a session started with it fails
  (`Selected profile tool is unavailable`, now visible in the diagnostic). The
  scenario ran with the `task` agent. The failure policy (reject the session vs
  restrict to the intersection) is a product decision.
- **Partial session discovery blanks the list.** One workspace whose directory
  is gone (`METADATA_READ_FAILED`) makes `/api/agent/v1/sessions` report
  `errors`, and `useGlobalSessionsStore` then sets `status: 'error'` with
  `hasLoaded: false`, so the overview shows only "Could not load sessions." even
  though items were returned (screenshot 02). The store's documented contract
  says an incomplete list is not authoritative, so this was not changed here;
  the zeroed-data run (fresh `runtime-data`) is what unblocked the scenario.
- **Server journal / local files in the export.** `/api/diagnostics/local-files`
  is not registered, so the export says "Local file/SSH diagnostics:
  unavailable"; the timeline is still bounded and redacted.
- **OpenCode-shaped probe block.** The local export still probes `/api/info`,
  `/api/provider`, `/api/session/active`, which answer 404 here and appear as
  failed probes with timings only. Bounded, no secrets, but noise to retire with
  the diagnostics module owner.
- **Waiting type exercised.** Only the permission case was produced. The
  unread-finished case cannot occur yet because the Host viewed watermark is
  task 25's (`session-unread` was deferred in task 23).
- **Visual review of screenshots.** The executing model cannot accept image
  input, so each screenshot was read through its DOM/accessibility tree
  (headings, counts, row labels, button names) rather than by looking at pixels;
  the captured text is quoted above.

#### Check after

`bun install --frozen-lockfile`, `bun run type-check`, `bun run lint`, `bun run test`
and `bun run build` exited 0 (logs listed below and above), and the real path in
headless Chrome showed the overview listing running work, finished work under In
work and a pending permission under Needs you, the diagnostics export downloading
a 2101-character timeline with zero prompt or credential matches, and the quota
surface showing its per-provider state. What could not be reached is listed under
Limits.

#### Follow-up: per-session warming deleted, real path re-checked (2026-10-29)

Branch `upstream-refresh/21-warming` on top of `8ee84af280`. Removed the whole
per-session chain (server modules, store, sync subscriber, Settings field, session
toggle, event type, strings in every locale) and kept the canonical workspace
control. Decision: `decisions.md: 2026-10-29 - Delete upstream's per-session
warming instead of rewiring it`; follow-up:
`Per-session warming has no Agent Service implementation` in
`.workflow/technical-debt.md`.

Real path, headless Chrome on 3740/3741 with the isolated data dir:

- Settings > Sessions shows one warming row, "Keep idle sessions warm":
  `Idle mode` on load, `Off` plus "Saved; applied to active workers." after
  unchecking it, and `Idle mode` plus the same message after re-checking it. The
  canonical `GET/PUT /api/agent/v1/workspaces/ws_9dcd3e0d.../cache-warming`
  answered 200 throughout, with revisions 6 -> 7 -> 8 for the idle, off and idle
  states of the recorded run (the revision is the agent-directory catalog
  counter, shared by every catalog mutation, so it does not restart at 1).
  Captures are viewport shots of the settings dialog, taken in file order: a
  full-page shot resizes the viewport, which remounts the panel and leaves the
  row showing "Loading configured mode…" in the image.
- A session view has no warming control: no `aria-label` or button text matching
  "warm", and no `/api/session-warming` request or console message at all.
- Evidence: `warming-realpath/` (01 idle before, 02 off after save, 03 idle
  restored, 04 session view, 05 session view with the settings panel closed, plus
  the settled DOM text and canonical revision for each, `06-console.txt`,
  `07-network.txt`, `08-cache-warming-requests.txt`) under the task 21 artifacts
  directory.

#### Checks after phase 2

- `bun run type-check`: exit 0 (`logs/type-check-phase2.log`)
- `bun run lint`: exit 0 (`logs/lint-phase2.log`)
- UI focused `bun test packages/ui/src/{lib/diagnostics,lib/settings,lib/i18n/messages.test.ts,stores/useSessionWarmingStore.test.ts}`:
  60 passed, exit 0 (`logs/ui-focused-phase2.log`)
- Agent Service focused `bun test packages/agent-service/src/{worker/catalog-models.test.ts,supervisor/workers.diagnostics.test.ts}`:
  36 passed, exit 0 (`logs/agent-service-focused-phase2.log`)
- Server focused `vitest run lib/{quota,diagnostics,overview,limit-failover}`:
  437 passed across 34 files, exit 0 (`logs/server-focused-phase2.log`)
- The heavy gates above were run before the phase-2 commits; type-check and lint
  were re-run after them.
