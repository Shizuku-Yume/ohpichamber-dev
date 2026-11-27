# 08: Edit OMP model presets in Settings

**Effort:** release-hardening
**Blocked by:** None
**Covers:** W1
**Files:** `packages/agent-service/src/worker/settings-ui.ts` (`modelPresets` placement), `packages/ui/src/components/sections/model-roles/**`, `packages/ui/src/lib/settings/search.ts`, `packages/ui/src/lib/i18n/messages/omp-settings.i18n.ts`, the model selector where presets are chosen
**Read first:** `.workflow/specs/release-hardening.md`; OMP `modelPresets` semantics in the installed SDK (`packages/agent-service/node_modules/@oh-my-pi/pi-coding-agent/src/config/`); `packages/ui/src/components/sections/PATTERNS.md`; `packages/ui/src/lib/theme/STYLING.md`; `.workflow/development.md` line "The remaining model-role hub, ordered fallback, and preset work is separate."; `.agents/skills/locale-ui-patterns/SKILL.md`
**Check:** `TMPDIR=<task tmp> bun run --cwd packages/agent-service test -- src/worker/settings-ui.test.ts && cd packages/ui && bun test src/components/sections/model-roles src/components/sections/settingsSearchAnchors.test.ts src/components/sections/settingsLayoutGuard.test.ts src/lib/i18n/messages.test.ts` → pass, including new tests for add, edit, delete and selection of a preset with CAS saves. A real isolated run creates a preset, reloads, uses it in a session, and deletes it; screenshots in `task08/`.
**Base commit:** a696927538685b835d65541864f1aa840999e8c5

- [x] Confirm what the model roles hub and ordered retry fallback chains already cover; record the result and build only what is missing.
- [x] `modelPresets` gets a Settings surface built from shared Settings primitives, with search anchors and 15-locale copy, and presets appear where the user picks a model if OMP applies them there.
- [x] Replace the stale development.md sentence with the current state.

## Progress

Check after: pass.
- `cd packages/agent-service && bun test --timeout 15000 src/worker/settings-ui.test.ts` → 39 pass, 0 fail (1907 expect() calls), covering `modelPresets` placement (`owned-by model-roles.section.presets`), CAS writes, project-layer shadowing, invalid-entry pass-through/deletion, and `defaultThinkingLevel` effort validation.
- `cd packages/ui && bun test src/components/sections/model-roles src/components/sections/settingsSearchAnchors.test.ts src/components/sections/settingsLayoutGuard.test.ts src/components/sections/settingsItemOwnership.test.ts src/lib/i18n/messages.test.ts` → 69 pass, 0 fail across 7 files (5275 expect() calls), covering add, edit, delete, apply, invalid-name refusal, active-preset detection, search parity, layout guards, ownership, and 15-locale completeness.
- `bun run type-check` → exit 0 (`check` 5/5: 4,818 files across 5 projects, upstream-drift 0 gaps, error-cause, css-classes 2301 tokens, upstream-gaps 639/639 allowlisted; electron `node --check`; agent-contract, agent-service, mobile `tsc`).
- `bun run lint` → exit 0, 96 warnings vs 96 on base/integration (0 new warnings; 0 on changed files). `bun run dead-code` → 81 unused files, 103 unused exports, 1 namespace export, 41 unused exported types, 1 duplicate export (exact match vs integration; 0 on branch files). `bunx oxlint` and `bunx oxlint -c oxlint.anti-slop.config.ts` on newly created/rewritten files → 0 errors.
- `VITEST_MAX_WORKERS=2 bun run test` → `scripts` 38/38, `sdk` 37/37, `ui` 1522/1523 (`ProjectNotesTodoPanel.test.tsx` hit a lazy-load timing flake under parallel load; passed 12/12 in 2.07s when rerun alone), `agent-contract` 306/306, `agent-service` 867 pass / 26 skip / 0 fail, `electron` 81/81; the combined run hit the 900s bash deadline as `web` started, and `VITEST_MAX_WORKERS=2 bun run --cwd packages/web test` passed 616/616 active files (9 skipped), 10018/10018 active tests (131 skipped), exit 0.

Review: pass (`task08/REVIEW.md`). Round 1 flagged 3 blocking items (missing `development.md` update, 2 unused exports in `modelPresetLayout.ts`, uncompleted closeout/real-path receipts) and 3 minor items (invalid global preset blocking edits to other presets + non-object project preset shadowing; Add-dialog key resetting on background refresh; unused test stub). Rework resolved the unused exports and all 3 minor items; round 2 verified 0 blocking code findings; landing completed `development.md` and task closeout.

**Bugfix root causes:** (1) Unchanged invalid hand-edited global presets previously blocked adding/editing other presets (`400 INVALID_REQUEST`) because `assertModelPresetsWritable` validated every entry in the whole-record write, and `projectRecordKeys` filtered to `JsonObjectSchema` so non-object project overrides did not trigger `409 CATALOG_CONFLICT` — fixed by allowing unchanged stored entries (`Object.hasOwn` + `isDeepStrictEqual`) while still rejecting modified/new invalid entries, and treating any defined non-null project preset key as shadowed. (2) `ModelPresetDialog` used `add:${JSON.stringify(initialEntry)}` as its React key, causing background `OmpSettingsState` refreshes to remount the form and discard unsaved Add input — changed to `'add'`.

**Real-path evidence:** `task08/REPORT.md` + 8 viewed screenshots (`en` and `zh-CN` empty state, add/edit dialogs with `ModelSelector`, persisted list across reload, applied active badge, live streaming session using the applied model/effort, and deleted empty state).

**Limits:**
- Picker slice not applicable per `task08/SCOPE.md` §2 & §4.C: OMP never lists presets in model pickers (`/model`, `model-picker.ts`, `model-selector.ts`, `model-browser.ts`), only in `/modelpreset` and the hub Roles view (whose GUI equivalent is `ModelRolesPage`).
- Cold-start observation (`task08/REPORT.md`): if Settings > Model roles is opened before `/api/agent/v1/ready` returns `200` during initial startup, `useOmpPageSettings('model-roles')` remains at `state: null` until directory or page changes.
- Applying a preset in Settings writes `modelRoles` and `defaultThinkingLevel` in one CAS batch for subsequent runs; OMP TUI's immediate live-session `session.setModel` switch has no GUI equivalent.
