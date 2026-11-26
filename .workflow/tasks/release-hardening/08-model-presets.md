# 08: Edit OMP model presets in Settings

**Effort:** release-hardening
**Blocked by:** None
**Covers:** W1
**Files:** `packages/agent-service/src/worker/settings-ui.ts` (`modelPresets` placement), `packages/ui/src/components/sections/model-roles/**`, `packages/ui/src/lib/settings/search.ts`, `packages/ui/src/lib/i18n/messages/omp-settings.i18n.ts`, the model selector where presets are chosen
**Read first:** `.workflow/specs/release-hardening.md`; OMP `modelPresets` semantics in the installed SDK (`packages/agent-service/node_modules/@oh-my-pi/pi-coding-agent/src/config/`); `packages/ui/src/components/sections/PATTERNS.md`; `packages/ui/src/lib/theme/STYLING.md`; `.workflow/development.md` line "The remaining model-role hub, ordered fallback, and preset work is separate."; `.agents/skills/locale-ui-patterns/SKILL.md`
**Check:** `TMPDIR=<task tmp> bun run --cwd packages/agent-service test -- src/worker/settings-ui.test.ts && cd packages/ui && bun test src/components/sections/model-roles src/components/sections/settingsSearchAnchors.test.ts src/components/sections/settingsLayoutGuard.test.ts src/lib/i18n/messages.test.ts` → pass, including new tests for add, edit, delete and selection of a preset with CAS saves. A real isolated run creates a preset, reloads, uses it in a session, and deletes it; screenshots in `task08/`.

- [ ] Confirm what the model roles hub and ordered retry fallback chains already cover; record the result and build only what is missing.
- [ ] `modelPresets` gets a Settings surface built from shared Settings primitives, with search anchors and 15-locale copy, and presets appear where the user picks a model if OMP applies them there.
- [ ] Replace the stale development.md sentence with the current state.
