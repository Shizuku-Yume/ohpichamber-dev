# OpenChamber Control Service

## Purpose

This module owns the typed control contract shared by the OpenChamber CLI and
the native Agent Service's Host tool boundary. Both adapters delegate to
`createOpenChamberControlService()`; neither adapter may call or spawn the
other.

## Boundaries

- `service.js` validates and executes the fixed project, model, session, and
  scheduled-task action allowlist. `actions.js` marks CLI-only actions with
  `agentExposed: false` (currently `schedule.status`); the agent tool consumes
  the filtered `OPENCHAMBER_AGENT_TOOL_*` exports. `schedule.toggle` requires
  the `disabled` boolean and replaces separate enable/disable actions;
  `schedule.list` also returns scheduler status as `scheduler`.
- `routes.js` is the authenticated CLI HTTP adapter. It forwards one action,
  preserves service status and partial-result details, and propagates request
  cancellation. It also carries the chat's answer to a waiting page.
- `render-page.js` owns `render.page`, the page an agent shows inline in the
  chat. The chat draws the page from the call's own input; the service checks
  it is a drawable page, applies the render feature policy
  (`agentRenderToolEnabled`), and with `awaitAnswer` waits for the user's
  answer keyed by session and tool call id (`pageAnswers`). Every inner host
  action request for `openchamber_render` carries that `toolCallId`, so an
  answer reaches the call that showed the page.
  Operator-child eligibility reads the Host metadata through the Canonical
  session metadata service, not the SDK transcript or a second session store.
  An unavailable metadata read fails the waiting action rather than treating
  the child as a human-facing session.
  With `answerLater` the call returns at once and `later-pages.js` keeps the
  page, across restarts, in `render-later-pages.json`; `GET
  /api/openchamber/render/later` serves its snapshot and the answer route
  falls back to it when no call waits. With `share` the page goes to
  `../share-pages/runtime.js` (see its DOCUMENTATION.md).
- `synthetic-delivery.js` posts a later or shared page's answer into the
  author's session as synthetic context through the canonical session
  service: a send keyed by the answer's message id when the session is idle, a
  steer into its active run on `RUN_ACTIVE`. The steer has its own stable
  command ID so it cannot reuse the send admission with a different action.
  A message with `resume: false`
  (an archived session) is not posted, since a canonical send always starts a
  run; the answer still shows under the page.
- `../agent-tool/runtime.js` is the managed-tool adapter. It wraps service
  results in the versioned native-tool envelope and uses a separate ephemeral
  loopback credential.
- `../openchamber-sessions/routes.js` and `../scheduled-tasks/service.js` own
  their domain operations and are composed into this service.

## Invariants

- `openchamber_secret` carries the calling session and tool call id over the
  authenticated worker channel. Before `secret.run`, the worker asks the
  Canonical Bash approval owner for the exact command and reauthorizes its
  one-shot receipt against Host policy. Public control calls cannot authorize
  secret execution. The Host runs directly in the captured workspace, kills
  the process tree on cancellation or timeout, and redacts secret values from
  stdout, stderr and execution errors before returning them.
- Secret card values travel only through `POST /api/openchamber/secret/answer`
  into Host memory and the approved child's environment. The fields endpoint
  returns only environment names for the exact waiting session/call. Optional
  ten-minute leases are session-scoped and memory-only; `secret.forget` clears
  them. `secret.request` file mode always refuses: no secret files are written.
  Tool arguments, results, wait events and application persistence contain no
  submitted values. An explicitly approved command itself is not a sandbox.

- `terminal.list` and `terminal.read` use the Host terminal owner on all four
  retained client surfaces. They require the explicit, default-off terminal
  reading preference. Agent calls cannot select another workspace, and a read
  checks membership in that folder before accessing output. Results omit Host
  cwd fields and redact captured Host paths. Missing panels fail with 503.

- Session status and messages come from the Canonical session service. The
  Host control read views expose status or text-only history, not SDK records.
  `contracts.ts` owns these CLI and Guest read shapes, cancellation options and
  dispatch results. A status/message result does not promise a directory.
- Wait never treats an initial idle response as completion after dispatch. It
  requires observed activity or a newly completed assistant message.
- Timeout and cancellation are failures, never authoritative idle results.
- Validation that protects side effects runs before session creation or
  dispatch. Model, agent and variant selection uses the native catalogs and
  session options; no OpenCode configuration or provider client is consulted.
- `promptDispatched` becomes true after a Canonical send acknowledgement or
  goal start. It does not promise completion. With no prompt or goal, creation
  alone leaves it false.
- Send and fork dispatches without an explicit model/agent/variant reuse the
  target session's last user-message selection before falling back to the
  configured defaults; only session creation resolves defaults directly.
- Default agents resolve from the owning project before global settings and
  native defaults. Directory-based requests identify the project before
  creating a worktree; existing linked worktrees resolve through Git's primary
  worktree root. Send/fork fallback uses that same owner. Configured model IDs
  and effort preferences survive missing catalog entries rather than silently
  dispatching with a different model.
- Usage errors name the missing or conflicting input so CLI and agent-tool
  callers can correct an invalid request without an upfront usage manual.
- Explicit `projectId` or `directory` scope takes precedence over the managed
  tool's current-session directory fallback; the fallback never creates a
  conflicting second scope.
- One failed directory status lookup produces `unknown` for only that
  directory and does not erase other session results.
- Destructive session/worktree deletion and project-path registration are not
  part of the action contract.
- `file.open` shows a file in the user's viewer. `file-open.js` resolves a
  relative path against the session directory (an explicit `directory` wins),
  refuses a relative path with no directory at all, checks the target is an
  existing file, then hands `{ path, directory, sessionId }` to the injected
  `emit`, which `index.js` writes to every UI control stream as
  `openchamber:file-open-request`. Nothing comes back: opening a tab does not
  fail quietly on a client, so the count of clients reached is the signal, and
  zero is a 503, never a claimed success. Paths outside the workspace are
  allowed on purpose: screenshots and recordings often land in a temp
  directory, and the viewer already reads such files.
- `browser.capture` writes its image on the server, into
  `.openchamber/screenshots/` under the scoped project directory, and returns
  the project-relative path rather than the image bytes. The client that took
  the picture may be on a different machine than the repository, and a path is
  what an answer, a commit, or a review can use; base64 in a tool result cannot
  be any of those. The agent's label is reduced to a filename fragment, never
  used as a path. The result also states how to present the image, because chat
  renders the image paths written in a finished answer below that message —
  saving the file is not what shows it to anyone.
- `browser.close` removes a browser tab the calling session opened, and is
  refused for any other tab, including the user's own tab an action without
  `tabId` might otherwise fall back to (`../browser-control/DOCUMENTATION.md`).
  Closing is panel state, so the client that owns the tab performs it through a
  registered closer, not the page view; the server only validates `tabId` and
  forwards the action like the rest.

## Decisions

### Why a dispatched session links back from its prompt and does not nest in the sidebar

A dispatched session used to nest under the caller's work in the sidebar
(`metadata.openchamber.originSessionID` on the session). These sessions are
the user's own conversations, such as PRs a triage session splits off for a
separate discussion: nesting hid them under one chevron, reshuffled them when
the caller was archived, and made `work.name` in each of them rename the
caller. They stay roots now, and the link sits on the prompt that started
them, where it says who sent which message.
