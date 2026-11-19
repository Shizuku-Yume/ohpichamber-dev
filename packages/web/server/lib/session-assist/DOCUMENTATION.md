# Session assist

Next-prompt suggestions run on the OMP worker side at completed `agent_end`
(`packages/agent-service/src/worker/suggestion.ts`), using OMP's
`runEphemeralTurn` with `composer-prediction-user.md` on the session model or the
small model, configured by the setting `suggestion.generator: session | small | off`.
Suggestions are published as transient canonical events (`session.suggestion`),
cleared on the next send, and are no longer persisted in session metadata.

Native recaps are owned by OMP's `enableIdleMaintenance` (`session.recap`).

The legacy Host suggestion runtime, quiet window (`IDLE_QUIET_MS`), metadata
persistence, and `evaluateTurn` suggestion gates have been deleted.

## Retained Host Modules

- `context.js` reads bounded history and constructs human turns. It is retained
  for `routing/runtime.js` and `session-work/runtime.js` (`loadSettledTurns`,
  `loadAssistContext`).
- `prompt.js` contains assist system prompt formatting helpers.
- `runtime.js` provides `createSessionAssistRuntime`, which observes canonical
  events to trigger `onTurnSettled` for stream lease teardown.
