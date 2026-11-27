# Closeout: release-hardening

**Accepted:** 2026-11-28 by maintainer (autonomous close per the approved plan; sign-off via the recorded W-check evidence in the task-13 gate)

## Shipped

All 13 tasks (`01`–`13`) are archived under `.workflow/done/release-hardening/`.
Every solvable debt item the maintainer approved on 2026-11-26 is cleared on the
final tree: `Status: done` set in `.workflow/specs/release-hardening.md`.

What shipped, by task:

- **01 Composer commands & model label:** exact slash command submits on Enter;
  rejected control commands restore the typed text with a localized toast; the
  streaming first run of a new session shows the model that run uses.
- **02 Image authorization & advisor refusal:** image generation requests
  `provider.use` with `purpose: 'image'`, admitted for an enabled workspace
  provider with the same provider id and endpoint at any model — the embedding
  rule; advisor overflow compaction carries a behavioral test for a refused
  candidate.
- **03 User-file MCP credentials:** a credential reference stored in
  `~/.omp/agent/mcp.json` resolves from every workspace; legacy references are
  migrated so saving from another workspace succeeds; project-file references
  stay workspace-bound.
- **04 Queued messages:** each queued message can be edited or sent right away
  through the Host's atomic take; the original UI draft is preserved beside the
  captured request; take/restore refuses leased or stale items and hands the
  full draft back only after ownership moves; legacy rows restore partially
  with a localized notice.
- **05 Interrupted sends:** durable Canonical receipts keyed by the caller's
  correlation/idempotency ID reconcile sends whose response was lost; accepted
  turns are never duplicated, rejected ones restore the draft; replay binds
  `receipt.operation` (rework round 1).
- **06 Change events & native quotas:** successful Host writes emit scoped
  `guest-marks-changed`/`quota-providers-changed` and clients refresh through
  the shared control stream — the sync composition is actually mounted on web,
  Electron and mobile (rework round 1/2, including the restored
  `tracker-providers-changed` wiring the v2.7.0 merge resolutions had lost);
  ten providers read native OMP account quotas with their Host scrapers
  removed, no provider losing coverage.
- **07 Last-turn diff:** Canonical per-turn diff contract; the surface shows
  normal, empty, unsupported and failed states; one canonical turn is one outer
  run, so the trailing fragment no longer reads permanently empty.
- **08 Model presets:** OMP `modelPresets` listed, created, edited and applied
  in Settings beside the model roles hub and the ordered retry fallback chains.
- **09 Provider settings:** every remaining provider protocol/tier, usage and
  voice setting either has a control on its owner page or is recorded as
  config-only with a reason.
- **10 Transcript:** the chat transcript renders through upstream's
  `column/ChatViewport` with the `timeline/*`, `message/body/*` and
  `message/parts/toolRow/*` owners on Canonical records; the monolithic
  `ChatContainer → MessageList → ChatMessage → MessageBody → ToolPart` path is
  deleted.
- **11 Server types:** the 95 fork-owned server modules carry real TypeScript
  types under strict checks; `fork-owned-server-untyped.json` and its no-check
  project are gone.
- **12 Static hygiene:** `bun run lint` 0 warnings, `bun run dead-code` 0
  findings, with exhaustive-deps findings fixed by reasoning and dead code
  deleted or justified per entry — no rule disables, no widened ignores.
- **13 Release gate:** full root gate, real-path walkthrough, reviews, and the
  close of both efforts (this closeout).

### W-check mapping (`W1`–`W6`)

- **W1 (real-path walkthrough):** Pass. Driven in isolated real-provider Web
  sessions at 1600 px `zh-CN` and `en` plus 390×844 mobile across three rounds
  (rounds 1, 3, 4): composer exact-match dispatch and 422 restore+toast,
  `/compact` accepted to completion (soft-compaction pill `74.5K → 25.8K
  tokens`, desktop one-Enter dispatch proven), queue edit/send-now end-to-end
  with attachments (zh mobile v2 full PASS), interrupted-send exactly-once
  receipts at the wire level, Last-turn diff API + interactive pill→panel in a
  real git workspace (en/zh/mobile), model presets create/apply with the Active
  badge moving on a distinct preset, provider settings surfaces on mobile.
  Zero console errors/unhandled rejections in every completed result JSON.
  Receipts: `task13/LIVE-REPORT.md`, `task13/round3/LIVE-REPORT-R3.md`,
  `task13/round4/LIVE-REPORT-R4.md` with screenshots and result JSONs.
- **W2 (Agent Service/Host behavior tests):** Pass. Image `provider.use`
  admission/refusal, advisor refusal surfacing without a provider request,
  cross-workspace user-file MCP credential save and legacy migration — all in
  the archived tasks' suites, passing in the final gate run.
- **W3 (change events & quota coverage):** Pass. Two-client live probes
  (round 3 desktop, round 3 mobile client A) show exactly one scoped
  `quota-providers-changed` frame and the other client re-fetching without a
  reconnect; quota coverage before/after the scraper removal lists the same
  providers (task 06 evidence).
- **W4 (server types):** Pass. The untyped list and no-check project are gone;
  strict `type-check` exits 0; the Web suite passes (final gate: 615 files /
  10 048 tests passed, 0 failed).
- **W5 (transcript parity):** Pass. 23/23 shots compared against the
  `task10/after` oracle: 11 byte-identical, the rest at noise floor (nonzero ≤
  0.074% of pixels, isolated glyph-edge anti-aliasing), zero console/page
  errors in the capture. `task13/round3/parity-comparison-vs-after.json`.
- **W6 (zero-defect gate):** Pass on the final tree — frozen install,
  `brand:generate --check`, `check` 5/5, `type-check`, `lint` 0 warnings,
  `dead-code` 0 findings, `docs:validate` 720/60, `workflow validate` 366 task
  files, upstream-drift `--markers --check` clean, all exit 0. The full
  `VITEST_MAX_WORKERS=2 bun run test` run passes every test in the repository
  with exactly one exception: the pre-existing upstream-inherited FLAKE-1
  harness teardown race in `scripts/perf/html-render-page-fit.browser.test.mjs`,
  whose assertion passes everywhere (755 ms in-suite) before the harness kills
  the hanging teardown at the 300 s cap — file byte-identical to upstream and
  unchanged in this effort, fully diagnosed in
  `task13/final/html-render-standalone-analysis.md` (6/7 suites green; scripts
  suite 37/38 with only that file failing; web 10 048 passed 0 failed; ui
  1534/1534 files; electron 81/81).
  `.workflow/technical-debt.md` has no entries. Per-command exits and timings:
  `task13/final/gate-*` and `task13/FINAL-AUDIT-REPORT.md`.

## Key decisions & plan changes

Recorded in `.workflow/decisions.md` under the effort's 2026-11-26/27/28
entries, including: exact-slash dispatch semantics; receipts mint their
correlation id per logical send; one canonical turn is one outer run; shutdown
routes fail closed without an auth controller; hook effect dependencies are
corrected rather than suppressed; unreachable upstream leftovers are deleted
rather than carried byte-for-byte; SDK example engine floors follow the fork's
1.0.0 numbering; tracker-providers-changed sync wiring restored.

Rework history: round 1 (GATE-3 stale test expectation, SEC-4 receipt
operation binding, LIVE-1 quota sync mount, SEC-1 dev-shutdown auth, WF-1
ledger reconciliation) — all verified PASS with revert-proofs in the round-2
review; round-2 review found no blocking findings and filed R2-1 (tracker sync
wiring loss), fixed in rework round 2 (`69bf435f08`); minors SEC-2/SEC-3 fixed
in `e19f5e15ac`/`75f16de802` + `2fc25a35ba`/`dace484410`; LIVE-3 closed as a
harness artifact in round 4 with a real hardening (`fd1d1c2e5c`); R3-4 fixed in
`74c1aef722`.

## Waived checks & skipped reviews

- Task 13's own review: the independent workflow review (`REVIEW-workflow.md`,
  effort-close mode) and security review (`REVIEW-security.md`) ran in round
  one over `git diff main...release-hardening/integration`; every blocking and
  major finding was reworked and re-verified. Round-2 re-verification:
  `task13/round2/REVIEW-rework.md` (no blocking findings).
- final-main-audit task 06 review waived by the maintainer (2026-11-26) — see
  `.workflow/done/final-main-audit/closeout.md`.
- Tasks 01–12: individual review records in their archived task files.

## Remaining debt & follow-ups

- `.workflow/technical-debt.md`: no entries.
- Open minors (all non-blocking):
  `/home/shizuku/Project/ohpichamber-omp-artifacts/release-hardening-2026-11-26/followups.md` —
  LIVE-2 queue-failed SSE spam not reproduced in rounds 3–4 (no backoff guard
  exists); WF-3 task-01 en-only evidence note; WF-4 `antigravity` documented
  narrowing; FLAKE-1 scripts-suite isolation timeout; R4-3 mobile IME
  return-key untested on a physical device (`mobileReturnKeySends` defaults
  false — product decision); R4-5 image-preview modal has no Escape dismissal
  (informational); mobile tracker two-client probe not run live; the
  pre-existing `bun test` multi-file `mock.module` contamination in
  `packages/ui` (repo runner isolates; identical at the pre-rework base).
- M7 (`.workflow/specs/m7-release-verification.md`) is untouched here: platform
  verification beyond Linux x64 and release distribution remain open.
