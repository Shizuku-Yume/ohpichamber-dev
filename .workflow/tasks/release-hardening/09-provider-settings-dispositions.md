# 09: Place or explain every provider protocol/tier, usage and voice setting

**Effort:** release-hardening
**Blocked by:** None
**Covers:** W1
**Files:** `packages/agent-service/src/worker/settings-ui.ts` and its test, provider, usage and voice Settings pages under `packages/ui/src/components/sections/{providers,usage,openchamber}/**`, `packages/ui/src/lib/settings/search.ts`, `packages/ui/src/lib/i18n/messages/omp-settings.i18n.ts`
**Read first:** `.workflow/specs/release-hardening.md`; AGENTS.md rule on what Settings show; `.workflow/development.md` sentence "Provider protocol/tier, usage, and voice controls still need their owner-specific work."; `settings-ui.ts` entries for `providers.*`, `provider.*`, `tts.*`, `stt.*`, `speech.*` and the usage reset-policy switches; `packages/ui/src/components/sections/PATTERNS.md`; `.agents/skills/locale-ui-patterns/SKILL.md`; `.agents/skills/enterprise-boundary/SKILL.md`
**Check:** `TMPDIR=<task tmp> bun run --cwd packages/agent-service test -- src/worker/settings-ui.test.ts && cd packages/ui && bun test src/components/sections/providers src/components/sections/usage src/components/sections/settingsSearchAnchors.test.ts src/components/sections/settingsLayoutGuard.test.ts src/lib/i18n/messages.test.ts` → pass. `task09/dispositions.md` lists every such setting with its placement or its config-only reason; a real isolated run shows each new control saving and reloading; screenshots in `task09/`.

- [ ] Each setting a GUI user acts on gets a control on its owner page (protocol and tier on the provider, reset-policy switches on Usage, voice on the existing OpenChamber voice page) with search anchors and 15-locale copy.
- [ ] Internal knobs, terminal presentation and duplicates of an existing OpenChamber control stay config-only, each with its reason in `settings-ui.ts`.
- [ ] Replace the stale development.md sentence with the current state.
