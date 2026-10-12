# 20: Move operational session metadata to Host persistence

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** 1a59130b5a2bd56a9757122606093006b0cfaae1
**Base branch:** omp-through-m3/m1-integration
**Started:** 2026-10-12T09:07:08+00:00
**Finished:** 2026-10-12T14:39:12+00:00

**Delivers:** Goals, assist recap, context cursor, pinned notes, folders and retention metadata persist under the Host Gateway independently of the agent transcript or OpenCode session endpoints.

**Blocked by:** 04
**Files:** `packages/web/server/lib/openchamber-sessions/`, Host metadata store/routes, metadata consumers and owning documentation

**Read first:** `.workflow/specs/omp-through-m3.md` M2 ownership prerequisite; architecture ADR-04; `packages/web/server/lib/openchamber-sessions/session-metadata-store.js`; `packages/web/server/index.js` metadata composition; nearest module documentation
**Covers:** W2, W9

**Check:** `bun run --cwd packages/web test -- server/lib/host/session-state.test.js server/lib/openchamber-sessions/session-metadata-store.test.js server/lib/openchamber-sessions/archive-store.test.js server/lib/openchamber-sessions/routes.test.js server/lib/openchamber-sessions/fork-inheritance.test.js server/lib/session-folders/routes.test.js server/lib/notifications/template-runtime.test.js server/lib/session-work/runtime.test.js`, isolated per-file Bun tests for the changed UI consumers, and one connected temporary Host restart scenario → goal, recap, cursor, pins, archive and folders survive restart without an implicit OpenCode metadata read; failed writes preserve valid previous data. Remove the temporary scenario after recording evidence.

- [x] Inventory metadata consumers before changing their persistence owner.
- [x] Keep only operational metadata in Host storage, never copy the OMP conversation transcript.
- [x] Make missing versus corrupt metadata and write failure explicit; retain unrelated valid session data.
- [x] Preserve applicable existing Host metadata through an explicit conversion where needed; do not automatically import OpenCode transcripts.
- [x] Remove the OpenCode metadata accessor once retained callers use Host persistence.

## Progress

Dirty at start: none in `/tmp/ohpi-m1-metadata-20261012`, branch `omp-through-m3/20-host-metadata`, stacked on archived task04. The original dirty main tree is not used for implementation. `M1HostMetadata20` owns the isolated metadata source/consumer slice; the coordinator owns shared gateway/proxy composition, integration and verification.

Check before: reuse task04's reviewed extraction and unchanged passing baseline receipts. Current metadata still depends on OpenCode and legacy Host JSON; durable SQLite conversion/restart behavior does not yet exist. The built-in SQLite runtime availability receipt is reused, not treated as persistence acceptance. Source implementation is active; no task20 behavior is claimed verified.

The complete 38-path metadata payload and incremental01–04 are integrated once on the isolated integration branch; the incomplete initial snapshot was never applied. `M1HostMetadata20` completed the SQLite stores, conversion, service consumers and partial-state UI changes in its isolated worktree and is frozen. `M1ProxyRepair20` completed the inherited proxy slice in its separate worktree; its full payload and final sanitizer/location repair are integrated once. The coordinator owns gateway composition, explicit selected SDK projection, notification dependency injection, connection shutdown, and final verification. Reserved gateway/proxy/global-store paths were preserved by incremental04.

Shared contract: metadata/archive bulk reads return valid `entries`, per-session `errors` and source `conversion`; missing, corrupt and failed remain distinct. Metadata writes return `{metadata, revision, changed}` with decimal-string revisions; the injected writer broadcasts only committed changes once. Selected legacy projections are imported only after explicit intent, consent and origin validation, with per-source/per-session receipts and no transcript fetch or accessor fallback. The selected SDK reader maps object-wire `location.directory` to the operational workspace only in this consent path. Connected conversion/restart/UI acceptance and independent requirements review passed; gate21 closure releases M2.

Failure before: all four registered-route proxy regressions failed in 15.96 seconds; three mutations timed out and a failed Host archive scope retained execution archive state. The first repaired-path run still timed out on the three mutations. Disposable instrumentation identified Node24 `IncomingMessage.signal` cancellation after normal parsed-body completion; forwarding now cancels only on a real aborted request or unfinished response closure. No confirmation rerun was performed. The final five affected HTTP scenarios passed in 921ms, covering pure Host title writes, create/fork IDs and inheritance, partial list scopes, malformed upstream records and official object-wire Host locations. The unchanged partial-creation failure proof is reused. Final independent proxy quality review passed with no findings.

The earlier nine-file Web coverage, 75 related UI cases and repaired folder receipts are reused. Incremental04's new archive/folder/permission/import cases passed 19 tests across four Web files, with 81 unaffected tests filtered out. Eight isolated UI files passed 126 cases covering the new revision rules and changed write-acknowledgement/native-event consumers. Final UI and Web type-checks passed after correcting one typed test fixture; the schema-extraction recheck also passed. The affected Web assets built in 96.10 seconds. Scoped ESLint passed all 27 changed UI TypeScript files. The 58-file oxlint capture found 357 diagnostics: 356 exact unchanged baseline lines and one authored Zod `shape` accessor diagnostic. Sharing the existing revision validator directly fixed that diagnostic; only the two repaired files were rechecked, leaving zero authored findings. Dead-code now reports only the known four i18n exports and eight exported types, with no new unused export. Documentation's unchanged links retain the composed 696-page/58-sidebar-link receipt.

The Check command now uses the owning Web Vitest script: `scripts/run-isolated-tests.mjs` recognizes only Bun/Node imports and would report these Vitest files as unknown rather than execute them. The acceptance criteria are unchanged. The shared UI files still run in separate Bun processes to avoid the established singleton cross-file contamination; no unchanged full suite or earlier passing smoke is scheduled again.

Final narrow source-quality recheck passed all three original findings: archive conversion codes, corrupt-folder preservation and end-to-end Host metadata revision precedence. Final narrow security recheck passed private database/sidecar permissions, selected canonical-directory authorization before the SDK read, returned-scope validation and required origin composition. Native execution records no longer supply Host metadata or archive authority; independent runtime and Host archive updates still apply.

Check after: the connected private Node Host acceptance passed in 19.50 seconds on 2026-10-12. Two fresh Host processes used the same private profile. Goal, recap, context cursor, pins, archive and folder rows plus conversion receipts survived restart unchanged; source JSON bytes stayed unchanged and stale legacy data did not replay. An induced SQLite write failure returned `METADATA_WRITE_FAILED` while retaining the previous committed revision and the unrelated sibling. Missing metadata returned revision0; corrupt metadata returned `METADATA_CORRUPT`. The committed metadata SSE event carried revision2 and occurred once through the archive barrier. Explicit selected import required consent/origin, refused an unauthorized directory before any upstream read, fetched only the selected operational record and requested no transcript. Actual authenticated Git status/stage/commit, linked-worktree create/remove and PTY snapshot/output/resize/close passed. Chrome rendered the Host-backed folder, valid sibling and both archived titles. All Host/fixture listeners, owned children and private profiles were removed. The sanitized receipt is `/tmp/ohpi-m1-metadata-receipt-560917.json`; this is Host acceptance with a controlled external execution-projection fixture, not an Agent Service/provider run.

Failed acceptance attempts were disposable observer errors, not application fixes: the official SDK detail getter needs `{data: SessionInfo}`, repository Git status omits `isGitRepository`, and a strict marker line predicate missed raw PTY output after bracketed-paste control bytes. A focused actual Node Host/PTY observation established the output bytes; printing a leading newline fixed the observer without changing terminal code. Existing M0 environment-stripping proof was reused rather than repeated. Earlier passing tests, builds, quality/security checks and documentation validation were not rerun.

Independent Brief A requirements review passed with zero findings against the absolute integration checkout. Its first three findings were withdrawn because they quoted the unrelated dirty main tree rather than the assigned source. This was a review-root correction, not an application fix. Existing final source-quality and security passes were reused. The four disposable acceptance/UI/PTY scripts were removed; sanitized receipts and rendered screenshots remain outside the repository. No task30/platform, real Agent Service, provider or packaged-surface result is implied.

