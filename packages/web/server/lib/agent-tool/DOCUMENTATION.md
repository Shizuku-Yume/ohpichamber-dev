# Managed OpenChamber Agent Tools

## Purpose

This directory keeps the callback-address rule that the repository credential
helper shares (`callback-address.js`). The managed tools an agent calls are
declared in `../openchamber-control/actions.js` and dispatched by the same
control service the CLI uses, so tool, UI and CLI behavior have one owner.

<<<<<<< HEAD
The Agent Service exposes five tools to the model from its worker
(`packages/agent-service/src/worker/host-tool.ts`):
=======
- `openchamber` — projects, sessions, worktrees, and showing a file to the
  user (`file.open`). Enabled while the persisted `agentControlToolEnabled`
  setting is not `false`.
- `openchamber_schedule` — the `schedule.*` actions of the same control
  service, for scheduled tasks. Enabled while `agentScheduleToolEnabled` is not
  `false`. It used to be part of `openchamber`; reading settings sets it to
  `false` once for someone who had switched the control tool off
  (`settings-runtime.js`), so the split hands nobody a tool they turned off.
  Like the control tool, a stale plugin is not refused: the CLI runs the same
  actions, so the service cannot tell an agent call from a CLI one.
- `openchamber_web` — looking at and interacting with the page in OpenChamber's
  browser panel. Enabled while `agentWebToolEnabled` is not `false`.
- `openchamber_notify` — `notify.send`, a notification to the user through
  `lib/notifications/emit-route.js` (same limits and rate window as
  `POST /api/notifications/emit`). Off by default: enabled only while
  `agentNotifyToolEnabled` is `true`, and the control service refuses the
  action when the setting is off, so a stale plugin cannot keep paging.
- `openchamber_knowledge` — the project's Notes, Todos and Plans, the items of
  the Project knowledge panel (`knowledge.list`, `save`, `delete`, `show`,
  with `kind` naming note, todo or plan; plans are files, so list and save
  give their path and the agent reads and edits them with its own file tools;
  dispatched by
  `../openchamber-control/project-knowledge.js` into
  `../project-context/runtime.js`). On by default: enabled while
  `agentKnowledgeToolEnabled` is not `false`, and the control service refuses
  these actions when it is, so a stale plugin cannot keep writing. Writes are
  attributed to the session OpenCode reported, never to a payload field.
- `openchamber_render` — `render.page`, a self-contained HTML page (`html`,
  `title`) the chat draws inline above the agent's answer, such as a chart or
  table. The page travels in the call's input, which OpenCode stores and
  syncs, so the server keeps no copy: `../openchamber-control/render-page.js`
  only checks the input (`html` at most 200,000 characters so the callback
  body stays under its 1 MB limit, `title` at most 120) and the setting.
  On by default: enabled while `agentRenderToolEnabled` is not `false`, and the
  control service refuses the action when it is, so a stale plugin cannot
  keep drawing. When to draw is stated only in the line every session carries
  (`../session-knowledge/DOCUMENTATION.md`, *When to draw a page*), along with
  the mockup exception: a mockup of the user's own project takes its look from
  that project's code. The tool description keeps the look rules agents broke
  most (no page background, no outer card, theme variables). How to write the
  page is the `html` input's description: layout, boxes, the theme variables
  the chat injects (`packages/ui/src/components/chat/message/parts/htmlRender.ts`;
  change both together), how a page with its own colors, such as a project
  mockup, keeps clear of them (a color on all its text and a background of its
  own, since the injected base stylesheet colors unset text and the frame is
  transparent), image files by path from anywhere on the machine as
  the image grant route allows. Only complete local paths written literally
  in the HTML are found and inlined before the page runs; the sandbox cannot
  read paths assembled at runtime. The description gives the authoring pattern.
  It also names the temporary directory to save a screenshot in
  (`os.tmpdir()/opencode`) so it stays out of the project. How
  to ask on a page is the `awaitAnswer` input's description.
  With `awaitAnswer` the call waits for the user's answer on the page. The
  plugin sends the call id (`context.id`) with the callback so the server can
  find the waiting call when the chat answers it, and copies the answer into
  the call's metadata (`metadata.openchamber.answer`), so every client shows
  the page as answered. The waiting callback sends Bun's `timeout: false`,
  since Bun's fetch otherwise ends a request with no response after about six
  minutes. While the call waits, OpenCode holds any chat message
  for that session until the call returns, so the plugin registers a
  `session.prompt` hook: a prompt for the session, from any sender, aborts the
  waiting call, which returns `{ answered: false, reason: "chat" }`, and the
  agent reads the message next. A message sent before the page appeared
  fired the hook too early; the server finds it in the inbox instead
  (`render-page.js`).
- `openchamber_image` — `image.generate`, images made or edited by the image
  model the user chose in Settings (`../openchamber-control/generate-image.js`).
  Off by default: enabled only while `agentImageToolEnabled` is `true`, and
  the control service refuses the action when it is not. Never behind Code
  Mode, like render: the chat draws the images in place of the call's row from
  its stored result, which an `execute` script would hide.
- `openchamber_secret` — `secret.run`, `secret.request` and `secret.forget`.
  `secret.run` asks OpenCode's shell permission for its command line in the
  plugin, before the call reaches the server: `ctx.permission.assert` with
  action `shell`, the line `secretRunCommandLine` draws as the resource and
  `<program> *` as the pattern to save, so the session's shell rules apply as
  to any command and a deny never shows a card. The plugin embeds the server's
  `secretRunCommand` and `secretRunCommandLine` with `toString()`, so the line
  the user approves is the one the card shows; a malformed call fails before
  anything is asked. The refusal `assert` throws is rethrown, since a plain
  rejection ends the agent's step. Only a call from this tool reaches the
  server as `secretRunAuthorized`, and secret actions use the session OpenCode
  reported, so no payload field can reach another session's remembered values.
  `secret.request` is a
  card where the user types one secret the agent asked for (`label`, `reason`,
  optional `placeholder`). Both wait, with the same plugin machinery as a page
  with `awaitAnswer` (call id, `timeout: false`, the `session.prompt` hook
  that ends the wait when the user writes in the chat, and the inbox check
  for a message sent before the card appeared). The value never
  travels through the call: the chat posts it to the server, which writes it
  to a private file, and the call returns only `{ status, file }`
  (`../openchamber-control/secret-request.js`). Direct, never behind Code
  Mode, because the chat draws the card from the call. On by default:
  enabled while `agentSecretToolEnabled` is not `false`, and the control
  service refuses the action when it is, so a stale plugin cannot keep asking.
- `openchamber_usage` — `usage.read`, the provider quotas Settings → Usage
  shows (`../openchamber-control/usage-read.js`): every configured provider's
  result as the page gets it, without `accountLabel`, or one with
  `providerId`. Off by default:
  enabled only while `agentUsageToolEnabled` is `true`, and the action reads
  the setting on every call and refuses while it is not. Each call runs the
  page's readers again, so the description tells agents to read once per
  decision and that a rate-limited provider answers with its last sample. It
  sits behind Code Mode like notify, since the chat draws nothing from its
  call, and its catalog line says to read it when the user asks about limits
  or a model choice depends on them, never before every task.
- `openchamber_workflow` — `workflow.*`, scripts that fan a large task out to
  many agents, run by OpenChamber (`../workflows/DOCUMENTATION.md`). Off by
  default: enabled only while `agentWorkflowToolEnabled` is `true`, and the
  workflow runtime refuses every action while it is not. How to write a script is the `script`
  input's description, read while the agent writes one, for the same reason
  render's page rules sit on `html`.
- `openchamber_workflow_answer` — `workflow.answer`, how a workflow agent
  asked for a schema answer hands it over. Registered with the workflow tool,
  but the managed config denies it in every session (`managedPermissionRules`)
  and only the session of such an agent allows it, so no other session carries
  its declaration. Direct, never behind Code Mode: the agent's prompt names it,
  and the sessions that see it are the ones that need it.
>>>>>>> bc50ba56a

- `openchamber` — projects, models, sessions, scheduled tasks, workflows, and
  showing a file to the user (`file.open`). Enabled while
  `agentControlToolEnabled` is not `false`.
- `web` — looking at and interacting with the page in OpenChamber's browser
  panel. Enabled while `agentWebToolEnabled` is not `false`.
- `memory` — `memory.*`, the store that survives across sessions. Enabled
  while `agentMemoryToolEnabled` is `true`.
- `openchamber_knowledge` — the project's Notes, Todos and Plans (below).
  Enabled while `agentKnowledgeToolEnabled` is not `false`.
- `notify` — `notify.send`, a notification through `lib/notifications/emit-route.js`
  (same limits and rate window as `POST /api/notifications/emit`). Off by
  default: enabled only while `agentNotifyToolEnabled` is `true`, and the
  control service refuses the action when the setting is off.

<<<<<<< HEAD
Each tool accepts `{ action, input }`; the Host checks that the action belongs
to that tool's set, applies the feature policy named above, and dispatches.
Actions an agent may not ask for are refused rather than forwarded.
=======
- `openchamber`, `openchamber_schedule`, `openchamber_web`,
  `openchamber_memory`, `openchamber_knowledge` and `openchamber_notify` are
  registered with `codemode: true`, behind OpenCode's Code Mode `execute`
  tool; there is no setting for it. On `scripts/tool-use-bench` with three
  models this cut the first request of a session by about 30% with the same or
  better use of the tools, and one provider's tool-call streaming stalled on
  their direct schemas. `openchamber_render`, `openchamber_secret`,
  `openchamber_image`, `openchamber_workflow` and
  `openchamber_workflow_answer` stay direct (`codemode: false`): the chat
  draws a page, a secret card, images or a run card from the tool's own call,
  and inside an `execute` script that call is only an entry in `execute`'s
  list.
- Behind Code Mode each tool also registers a namespace of its own name with
  a one-line description (`CODE_MODE_CATALOG_LINES`). The catalog always
  lists namespaces with their descriptions but tools only within a small
  budget, and with large MCP servers connected ours showed as bare rows such
  as `openchamber_web (1 tool, none shown)`; agents asked to open a page in the
  browser panel fetched it instead and said they had no browser
  (`scripts/tool-use-bench`). Names and paths stay as they are: agents call
  `tools.openchamber(...)` straight from the session guidance, and both a
  control tool renamed into a shared namespace and one with the other tools
  nested under it made them stop calling it.
- The plugin accepts the action's inputs either inside `parameters` or beside
  `action`, because models produce both shapes; an explicit `parameters` object
  wins on a conflict. Rejecting the flattened shape turned a call that plainly
  carried a `url` into "url is required", which reads as a broken tool rather
  than a malformed call. The schema declares the inputs only inside
  `parameters`, and `additionalProperties: true` at the root lets flattened
  inputs and unknown fields (a stale `wait` or `timeout`) through to the
  adapter.
>>>>>>> bc50ba56a

## Knowledge actions

The `openchamber_knowledge` tool carries the project's Notes, Todos and Plans,
which the user also sees in the Project knowledge panel and every session of
the project shares (`../project-context/DOCUMENTATION.md`):

- `knowledge.list` — notes with text, todos with state and links, plans with
  their file paths and session. `planId` narrows to one plan; `ready` returns
  the unfinished todos whose dependencies are all completed.
- `knowledge.save` — requires `kind` (`note`, `todo` or `plan`) and `body`;
  with `id` it replaces. A plan body is the whole markdown and the answer
  gives its path, because reading and small edits use the agent's own file
  tools. An update may send only the fields it changes: `completed`, `planId`
  or `dependsOn`; `sessionId` on a plan, without `body`.
- `knowledge.delete` — requires `kind` and `id`.
- `knowledge.show` — opens a plan for the user to read, comment on and send to
  a session (`openchamber:plan-open-request`); requires `kind: plan` and `id`.

A note or todo may belong to a plan (`planId`), and a todo may depend on other
todos of the same plan (`dependsOn`). The control service refuses a dependency
on a missing todo, across plans, outside a plan, or in a cycle; deleting a todo
drops it from the todos that depended on it. Replacing a note or plan passes
`expected`, the text as the agent last read it; a mismatch answers 409 so the
agent refreshes and retries rather than overwriting someone else's edit.

The actions are on by default (`agentKnowledgeToolEnabled !== false`). Turning
the setting off makes the control service refuse them with 403, so a stale
session cannot keep writing.

## Runtime flow

1. The Agent Service worker registers `createHostToolExtension`, one tool per
   capability above, each with the session's captured scope.
2. A call sends `worker.action.request` over the supervisor channel with the
   tool name, action, input and the session id.
3. The Host validates the captured scope against the live session
   (`worker-authorization-channel.js`), then applies the tool's feature policy
   and dispatches to the control service.
4. The result returns as one JSON envelope (below). A cancelled turn cancels
   the action: the worker's abort signal reaches the Host request, and a
   `worker.action.cancel` from the child aborts it too.
5. The CLI reaches the same service through its authenticated HTTP adapter, so
   ordering, result delivery, partial-failure reporting and scheduled-task
   contracts have one owner.

## Agent context budget

- Session context, not the tool schema, states when to act: when to link an
  issue, when to draw a page, when to offer a workflow and when to save a
  memory (`../session-knowledge/DOCUMENTATION.md`). A rule read only after the
  tool was chosen is missed by an agent that never thought it applied.
- Each action carries a short presentation title and a separate agent-facing
  description. The description says what the action does and takes; detailed
  combination rules are enforced by the control service and returned as
  actionable usage errors only after an invalid call.
- Session dispatches never wait. An agent that needs the outcome sets
  `returnResult`: the call still returns at once, with
  `resultDelivery.status: 'pending'` and a note telling the agent not to poll
  or sleep, and the session's final answer is delivered into the calling
  session when it finishes (`../dispatch-results/`). `session.messages` reads
  what is there; the control service keeps `wait` for the CLI only.
  It follows canonical history cursors before applying the requested most-recent
  message limit; `all` reads the complete available history. Explicit target
  sessions are resolved through the Host's authoritative workspace scope.
- Optional behavior switches (`worktree`, `pullRequest`, `goal`, `agent`,
  `variant`, `returnResult`) state their default and an explicit "only when
  the user asks" rule so agents do not invent worktrees, goal mode, or result
  deliveries the user never requested.
- `pullRequest` is a pull or merge request number in the project. The session
  starts in a worktree made from it the way the New worktree dialog makes one
  (`../git/DOCUMENTATION.md`, *Worktree creation from a GitHub pull request*);
  everything else about the request is resolved on the server.
- A rule about when to act belongs where the model reads it before choosing a
  tool: the head of the tool description. An action's description is read only
  after the tool was chosen, so a trigger placed there is missed by an agent
  that never thought the tool applied. Action descriptions say what the action
  does and takes. The former mirrored session-context guidance for
  `session.link` was removed with the app-authored prompt block (2026-10-27
  parity work); do not reintroduce save/link instructions into session context.
- Detailed combination rules are enforced by the shared control service and
  returned as actionable usage errors only after an invalid call. Per-action
  examples and a repeated per-action parameter schema are intentionally omitted.

## Security invariants

- The Host binds an action request to the session scope it captured at worker
  start. A scope that no longer matches the live session is refused
  (`UNAUTHORIZED`), so a stale worker cannot act on another project.
- Inputs map to a fixed action allowlist per tool. There is no arbitrary CLI,
  shell, route, or URL forwarding.
- Session/worktree deletion and project-path registration are not exposed.
- A feature that is off is refused at the control service, not merely hidden
  from the model; hiding a tool does not authorize its action.
- `callback-address.js` keeps the same-machine rule the repository credential
  helper uses: a request reaches the server only from this machine, and the
  helper's own token is never persisted, logged, returned to the UI, or
  written into a generated file.

## Result contract

Every completed call returns JSON:

```json
{
  "schemaVersion": 1,
  "ok": true,
  "action": "session.create",
  "data": {}
}
```

Command and operational failures use the same envelope with `ok: false` and
an `error` object. Cancellation can still surface as a native tool error state.

## Runtime parity

- Web, Electron desktop, hosted mobile and Capacitor mobile all call the same
  Host; the tool runs in the Host-owned Agent Service worker, never in the
  renderer.
- A client connected to another Host uses that Host's tools and policy; no
  tool runs in the client runtime.
