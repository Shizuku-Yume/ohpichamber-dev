# 04: Native forms and selector presentation

**Effort:** omp19-integration
**Blocked by:** None
**Covers:** W7
**Check:** `bun test src/worker/interaction.test.ts src/interaction/manager.test.ts` in packages/agent-service; contract requests and UI question/FormDock suites pass

- [ ] Parse native HTML forms into canonical questions and safe existing UI presentation.
- [ ] Preserve native values, defaults, optional/disabled fields, Other answers and selector hints.
- [ ] Preserve current answers across timeout and message interruption using the canonical CAS flow.

## Progress

Shared Web/PWA, Electron, hosted mobile and Capacitor use FormDock. Guest SDK and mobile execution ownership are unchanged.
