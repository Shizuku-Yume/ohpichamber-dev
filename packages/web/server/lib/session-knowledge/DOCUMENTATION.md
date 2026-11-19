# Session Knowledge

What a session must be told about the project: that session's pinned notes and
plans, and whether it has been told yet.

Memory and session-linking are not prompt background. The model sees what plain
OMP sends for the same session, plus the user's own pins and attachments and the
Host tools' descriptions. No memory index or save/link guidance is copied into a
prompt.

## Why it is here and not in the UI

The client used to own this: it assembled the text, decided when to send it, and
remembered what it had sent in a module-scoped map. Two consequences followed.

A session started without a UI got nothing at all. Scheduled tasks and sessions
the agent dispatches build their prompts on the server and never touch the
browser, so pinned context simply did not exist for them.

And a tab's memory of what it sent survives compaction, while the conversation
does not. After a summary the agent no longer holds the block, but the tab goes
on believing it does and never sends it again.

The UI now reads only the summary and writes pins; every prompt path goes
through the Host, which attaches what the session still owes.

## The contract

`session.metadata.openchamber.project_context_pins` owns the note and plan ids
attached to that session. Pins never come from project-wide note or plan state.
A new-session draft passes its pins into this metadata when its first message
creates the session.

Directories beneath the managed `~/.config/ohpichamber/chats` root resolve to that root before project context is read. Every ordinary chat therefore shares one Chats knowledge owner instead of creating an unreachable context store for each dated session directory.

`session.metadata.openchamber.knowledge_context_delivered` holds the signature
of what the session is carrying. It lives with the session, so it survives the
tab closing and is visible to every sender, including the ones with no tab.

The signature covers content revisions of the pins, not just identity: editing a
pinned note must re-send it, not merely renaming one. With no pins the signature
and the text are empty, so session linking cannot create an otherwise empty
delivery.

## Three moments, one delivery

| Moment | Delivery |
|---|---|
| A message from the UI | the Host attaches the pending pins to that prompt |
| A scheduled task or a session the agent dispatched | the same Host delivery path attaches the pending pins |
| After compaction | the `context-obligatory` turn carries the pins again, alongside the user's pinned messages |

All three moments share the same Host-owned resolution and delivered signature;
the UI never assembles, attaches or reports the block.

The worker renders attached context and pins as hidden user text, never as an
`ohpichamber.context` custom message. A user-requested skill expansion keeps its
developer instruction; no app-authored developer instruction is added.

Upstream writes the same text into OpenCode session instruction entries. That
mechanism is OpenCode surface and does not exist in OMP, so the Agent Service
carries the block as a synthetic part and this module keeps the delivered
signature. The text and the rules below are upstream's; the delivery is the
fork's.

## What the block carries

- Pinned notes and pinned plan bodies (`buildPinnedBlock`). A plan whose
  markdown cannot be read is marked, not dropped: losing one attachment must
  not silently shrink the context.
- In OMP, memory indexes and tool guidance (`SESSION_LINK_GUIDANCE`,
  `RENDER_PAGE_GUIDANCE`, `WORKFLOW_GUIDANCE`) are strictly excluded from
  worker prompts to preserve native prompt parity and prevent prompt injection.
  Knowledge delivery (`buildKnowledgeText`) carries only user pins.

## Failure behaviour

Nothing here may fail a send. A message without its background costs the agent
some context; a failed send costs the user their message. Every caller treats an
error as "no block this time".

A source that will not load never blanks the rest: an unreadable plan is marked
in the block, and a project context that fails to load sends no pins rather than
failing the send.

Pinned text is cut at 8,000 characters and says so.

An availability check that fails means "no tool": its guidance is left out
rather than failing the send.

Delivery is recorded only after the send is accepted. Recording it when the text
is handed over would leave a failed send believing the agent had context it never
received.

## Where memory lives

Long-term memory is OMP's own (`packages/agent-service`), not a Host store: no
memory titles, bodies or guidance are copied into a session prompt. Pinned notes
and plans remain scoped to the session that pinned them.
