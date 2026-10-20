# 62: Restore running-session Stop visibility

**Effort:** omp-through-m3
**Task type:** bugfix
**Base commit:** e848504602333955b1d134bba3345d8bbc2ed065

**Delivers:** The original Composer shows Stop for an actual running canonical run and cancels through the canonical abort owner. Unknown live coverage is not treated as authoritative idle; pending approval/question precedence and runtime-switch safety remain intact.

**Blocked by:** None
**Files:** `packages/ui/src/hooks/useSessionActivity.ts`, focused hook/composer tests
**Read first:** Task36 packaged receipt `stopControlGap`, `packages/ui/src/sync/global-session-status.ts`, `packages/ui/src/sync/sync-context.tsx`, `packages/ui/src/components/chat/ChatInput.tsx`, `.workflow/specs/omp-through-m3.md` W7
**Covers:** W7, W10

**Check:** Focused hook/composer behavior tests, strict UI type-check (`bun run --cwd packages/ui type-check`), parent UI build, and actual Web plus packaged Electron running prompt showing Stop and cancelling through the canonical abort path.

- [ ] Treat `unavailable` or invalidated directory status as unknown, not authoritative idle.
- [ ] Establish the native run/status authority causing the observed mismatch before choosing a fix. A global-index fallback alone cannot cover disconnect because that path invalidates both indexes.
- [ ] Keep runtime identity and canonical abort ownership unchanged.
- [ ] Verify the Stop control and keyboard abort on Web and packaged Electron after the original UI restoration slices land.

## Progress

The running-session activity model in `packages/ui/src/hooks/useSessionActivity.ts` and `packages/ui/src/sync/event-reducer.ts` enforces three core invariants:
1. **Unknown status retains abort control:** When live status is missing or invalidated (`unavailable`), an existing native run binding places the session in `unknown` phase rather than authoritative idle (`deriveSessionActivity`), keeping the Stop control available so the user can cancel an active run.
2. **Authoritative snapshot replacement:** Materialized snapshots serve as replacement authority (`selectBoundRunId`); a stale projected session fallback cannot resurrect a run that an authoritative snapshot already released as idle/null.
3. **Request baseline against late HTTP acks:** When acknowledging a live run, `installRuntimeRun` compares the current session against the request-start `epoch` and `headSequence` baseline, preventing an in-flight HTTP acknowledgement from resurrecting a run that completed or cancelled before the response arrived.

Runtime verification:
- **Web (`final-actual-ui-acceptance.json`, `phase2-commands-receipt.json`):**
  - Narrow Web execution on session `17be6e2b-e084-41d1-8a4e-61772e183304` (`m3fixture/think-30s`) verified the Stop control present at snapshot 200 (`activeRun: 6712ee92`). Clicking Stop via `/tmp/ohpi-stop.js` succeeded (`stopClicked: true`), after which the session transitioned through a transient 503 to snapshot 200 idle with `activeRun: null`, Stop removed, and Send restored (recorded in `/tmp/ui-restored-web-stop-before.png`).
  - **Keyboard abort:** In actual Web UI, pressing `Escape` twice cancelled the active exact run and settled the session to idle.
  - **Fresh composer run creation:** Verified with `editonly` profile (`POST /sessions` 200, executing canonical native edit and live inline diff). Prior failure was traced to known unsupported `editor` profile returning 503 (`UNSUPPORTED_CAPABILITY`), not a product composer submission bug.
  - Stream reload persistence verified on session `a3e326aa-ee7b-44e8-847e-833130ce657d` (`m3fixture/stream-300cps`, 2 messages); reload retained prompt and 5742-char document (`evidence/25-reload-persistence.png`).
  - Live snapshot latency measured across 2 sequential calls at 10.1 ms and 9.4 ms with unchanged epoch `e5ca0ffa-ccd3-4fdf-8f47-4963b063a9c5` and headSequence 2459.
- **Packaged Electron (`ACCEPTANCE-RECEIPT.md`):** Packaged verification confirmed the active composer Stop button clicked and cancelled exact runId `14aadd55-091d-4679-a230-60d90f6e0aca`, settling the session to idle with a null run binding. Keyboard abort in packaged Electron was later retested on the final rebundle (see the 2026-10-21 observation below).

## 2026-10-21 final AppImage observation

Task55's final rebundle (`packages/electron/dist/OpenChamber-2.2.0-linux-x86_64.AppImage`, sha256 `598bf5823785ccf5b3f36d4e49bb950638e77b3eff35a5b3fc7b3e3259eabad9`, built after Task44 `cacbaf042`) was exercised under Xvfb with an isolated HOME. Running session `39950efe-7e04-4e93-9172-77ecd65d5419` rendered `button[aria-label="Stop generating"]`; clicking it set `activeRun:null`, runtime `idle`, turn `cancelled`. A second running session `4945a980-3356-48b7-b5c8-bd6167bbf4ba` cancelled through Escape twice with the same result. Screenshots: `/home/shizuku/.cache/ohpi-acceptance/evidence-electron/t55-final-stop-before.png`, `t55-final-stop-clicked.png`, `t55-final-stop-after.png`, `t55-final-keyboard-abort.png`. Full auth/packaging context is in Task55's receipt `.workflow/omp-migration/m3/task55-packaged-electron-2026-10-21.json`. Task55 did not modify or stage this file; Task62 remains open for its own review/archive and no M3 gate is claimed.

This task stays open. No M3 gate or task complete claims.
