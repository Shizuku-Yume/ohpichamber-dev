# Managed OpenChamber Agent Tools

## Purpose

This directory keeps the callback-address rule that the repository credential
helper shares (`callback-address.js`). The managed tools an agent calls are
declared in `../openchamber-control/actions.js` and dispatched by the same
control service the CLI uses, so tool, UI and CLI behavior have one owner.

The Agent Service exposes six tools to the model from its worker
(`packages/agent-service/src/worker/host-tool.ts`):

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
- `openchamber_image` — `image.generate`, an image made or edited by the image
  model the user chose in Settings (`../openchamber-control/generate-image.js`,
  which reads `agentImageModel`). Off by default: the control service runs it
  only while `agentImageToolEnabled` is `true`.

Each tool accepts `{ action, input }`; the Host checks that the action belongs
to that tool's set, applies the feature policy named above, and dispatches.
Actions an agent may not ask for are refused rather than forwarded.

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
