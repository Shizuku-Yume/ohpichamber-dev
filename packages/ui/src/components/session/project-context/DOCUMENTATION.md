# Project Context Panel

Notes, todos, saved plans, and agent memory for the active project. Rendered by
the `notes` surface in the desktop context rail and by the mobile workspace
drawer.

## Files

| File | Owns |
|---|---|
<<<<<<< HEAD
| `ProjectNotesTodoPanel.tsx` | container: store subscription, load, failure toast, section sidebar, search query, the todo write |
| `NotesSection.tsx` | note composer, note list, per-note edit/pin/delete |
| `TodosSection.tsx` | todo list, add/toggle/delete/clear, drag reorder, list resize |
| `PlansSection.tsx` | plan list, import, pin, delete, open |
| `MemorySection.tsx` | agent memory list, project/global scope switch, new/changed badges, edit, forget |
| `KnowledgeCard.tsx` | the shared card shell and expand interaction every entry list uses |
=======
| `ProjectNotesTodoPanel.tsx` | container: store subscription, visible-owner observation, failure toast, header tabs and search toggle, open entry, the todo write |
| `KnowledgeSearchBar.tsx` | the floating search bar |
| `NotesSection.tsx` | note list, per-note title/preview, the open note, pin, delete |
| `NoteEditor.tsx` | the note editor: Markdown that reads formatted while you type |
| `TodosSection.tsx` | todo list, add/toggle/delete/clear, drag reorder |
| `PlansSection.tsx` | plan list, create, import, pin, share, delete, open |
| `MemorySection.tsx` | agent memory list, project/global scope switch, new/changed badges, edit, forget, the Tidy up button |
| `memoryTidy.ts` | starting the tidy-up session: the store as prompt text, the default model, the send |
| `KnowledgeCard.tsx` | the list card for notes and memory: fixed height, opens on click |
| `KnowledgeSplit.tsx` | the wide layout: list column and open entry side by side |
| `KnowledgeEntryView.tsx` | the shell an opened note or memory renders in, in place of the list |
| `KnowledgeComposer.tsx` | the add field every section except memory uses |
| `KnowledgeActions.tsx` | the row actions: pin toggle, the ⋯ menu, the row's right-click menu, hover reveal |
| `pendingKnowledgeDeletes.ts` | deletes that wait out an undo window |
| `knowledgeFormat.ts` | note title from the first line, entry dates |
>>>>>>> bc50ba56a
| `useProjectTodoSend.ts` | sending a todo to a current/new/worktree session |

## Layout

Content on the left, a section sidebar on the right with a drag-to-resize edge —
the same arrangement the files surface uses, so the two panels do not disagree
about where navigation lives. The sections were a horizontal tab strip until four of them stopped
fitting: a strip has one line of width to divide, and each section added took
width from the rest, while a vertical list grows downwards where there is room.
The surface's default width matches the files surface for the same reason; at a
third of the window the content column is too narrow to read a note in.

<<<<<<< HEAD
Search shares the title row rather than owning one of its own: it filters what
is already on screen, and a full-width field read as the panel's primary control.
It stays above both columns. Sections divide, and search is the one thing
=======
When the labelled tabs do not fit, the active tab keeps its label and the
others show an icon and their count; the mobile drawer always does this. When
even that does not fit, the active tab drops its label too, so every tab stays
in view. The row compares its width with invisible copies of itself in the
first two forms. A
fixed width threshold it replaced went stale as tabs, counts and translations
grew, and the row scrolled sideways between the threshold and the real width.

Search is a toggle. The button opens a bar floating over the top of the list,
the way the chat's search floats over the conversation; opening it moves
nothing underneath. An earlier version pushed the list down to make room, and
the whole panel jumped each time search opened. Escape or the close button closes
it and clears the query, so a list never stays filtered by text nobody can see.
The bar hides while an entry is open and comes back with the list.

The project has no title row. The search names it ("Search openchamber",
"Search Chats") in the button's tooltip and the bar's placeholder, which is
where the panel says whose knowledge it shows.

One search covers every section. Sections divide, and search is the one thing
>>>>>>> bc50ba56a
that division would hurt — you do not always remember whether something was
written as a note or lives in a plan — so each sidebar entry carries its own
match count.

## One card, one interaction

Every entry list renders `KnowledgeCard`. Notes and memories had drifted into
two different-looking rows in the same panel — one a bare block of text opened by
clicking the text, the other a bordered card opened by a chevron — which is the
kind of split that makes a panel feel unfinished regardless of how either half
behaves.

<<<<<<< HEAD
A collapsed card opens on a click anywhere on it. An expanded card closes only
through its collapse action, because its body is editable and a stray click in
the text must not throw the editor away.
=======
Opened notes and memories keep a readable line length (`max-w-3xl`) at any
width. Todos open nothing, so a wide panel shows them as one centred column of
the same width. Touch layouts always stack.

The single column stretched to an expanded panel ran note lines 1500px long and
still swapped the whole list away to open one entry.

## Adding entries

Notes, todos and plans add through the same `KnowledgeComposer`: one line that
grows with its text, Enter to add, the add button at its end. Notes follow the
chat composer: Shift+Enter starts a new line on desktop, and on a phone, whose
keyboard has no Shift+Enter, Return starts a new line and the add button adds.
Todos and plan titles are one line, and pasted line breaks become spaces. The length counter appears
only near the limit. An empty, always-open 3000-character box used to take a
third of the panel above notes that are read far more often than written.

The field clears as soon as an entry is sent and stays enabled while it saves,
so the next entry can be typed right away; a failed add puts the text back if
nothing new was typed. Disabling the field during the save dropped its focus,
and an entry typed straight after the first one went nowhere.

With no notes yet, the notes tab shows only the field: its placeholder already
says what goes there, and a second line repeating it was noise.

A plan is created from its title and opens straight away in the editor. Import
from a file is a button inside the same field.

## Row actions

Every row has the same actions in the same place: at most one direct control
(pin for notes and plans, send for todos), then a menu with the rest (share,
delete). With a mouse the menu is the row's right click (Shift+F10 from the
keyboard, `KnowledgeRowContextMenu`), and the direct control appears on hover
or keyboard focus; touch screens show it always, with a ⋯ button for the menu.
An opened entry keeps its ⋯ in the toolbar. A pinned entry keeps its filled
pin visible.

The pin attaches a note or plan to the current session's context, and a pinned
note says so in its footer. The icon alone read as "pin to the top of the
list".

## Delete with undo

Deleting a note, plan or memory hides it at once and shows a toast with Undo.
The delete is sent only when the undo window ends (`pendingKnowledgeDeletes`).
The window is a timer, not the toast: Sonner pauses a hovered toast and never
closes one without a mounted Toaster. When the delete goes out the toast is
dismissed, so Undo never outlives it. A project memory delete carries the
project it was asked in, because the panel may have moved to another project
before it runs.
Waiting beats re-creating on undo: a re-created note or plan gets a new id and
loses its pins and its origin. The pending set is module state, so the delete
still goes out if the panel unmounts; if the app closes inside the window the
delete is never sent and the entry stays. A failed delete brings the entry back
with an error toast.

## Lists never move; entries open in place

Every section works the same way: the list shows fixed-height cards, and in a
narrow panel a click opens the entry in place of the list, with the back control at the start
of the entry's own toolbar, so the tabs above never shift. Plans open
`PlanView`, which takes the control as `leading` in its title row; notes and
memories open in `KnowledgeEntryView`. The panel owns which entry is open
(`openEntry`); leaving the section or the project closes it.
Escape goes back too.

Notes and memories used to expand inside the list instead. Every open and close
pushed every card below it down and back up, and an expanded 3000-character note
turned the list into a wall of text. Nothing in a list changes height now.

A note card has a header line with the title and the row actions, a rendered
Markdown preview of the rest that fades out where it is cut, and a footer with
the source ("From chat" links to the message the note came from), the date and
the pin state. A note's title is its first non-empty line with Markdown markers
dropped. A link in a preview opens the link.

An open note is `NoteEditor`, a CodeMirror editor that is always editable and
always reads as formatted text: headings, emphasis, code and links keep their
look while you type, and Markdown markers (`#`, `**`, backticks, link targets)
are hidden except on the lines the cursor is on. List markers show as bullets.
Without focus every line is formatted. An earlier version opened the note
rendered and swapped it for a plain textarea on click, so the same note looked
like two different things depending on whether you were touching it. Escape
leaves the note; the toolbar carries the source, date, pin and menu. The stored
text is plain Markdown either way. The editor loads lazily, since it brings
CodeMirror and most visits never open a note.

An open memory has its title and text as plain fields that save on blur and
when the entry is left. The toolbar shows the new/changed badge, the scope and
the type. `MemorySection` stays mounted while one is open, so the "last looked"
mark is not advanced by opening a single entry.

An entry deleted elsewhere while open (an agent, another window) closes, and a
delete from the open entry's menu closes it before the undo toast appears.
>>>>>>> bc50ba56a

## Plans open in place

Clicking a plan replaces the list with its editor, and the back control appears
in the panel header beside the project name — PlanView titles the plan itself, so
a title row above it would say the same thing twice. A plan belongs to the project this
panel is about, and sending the reader to another tab to read it made them leave
the surface they were browsing.

The editor is `PlanView`, lazily imported — it is a large view and most panel
visits never open one. It scrolls itself, so the content column stops scrolling
while a plan is open; two scrollbars for one document is what nesting them gives.
Leaving the section or the project closes it, so its editor never sits over a
list it no longer matches. Hosts that own a fullscreen plan surface (mobile)
still pass `onOpenPlan` and keep theirs.

The panel owns the only source of truth for which project a plan belongs to,
and it never lets the editor guess. `PlanView` receives the owner as
`savedProjectPlan={{ projectRef, planId }}` — load and autosave both go to that
exact project. An earlier version let the editor re-derive the project from the
current directory, which silently opened an empty document for plans stored
under the managed Chats owner (`openchamber:chats`), for plans opened from a
worktree the directory lookup missed, and for plan tabs restored after a
reload. Persisted plan tabs carry `projectPlanRef` for the same reason; a saved-plan
tab persisted with an id but no owner is dropped on rehydrate rather than
reopened against a guessed project. A plain session plan tab legitimately has
neither an id nor an owner and is kept.

## Pins belong to one session

Notes and plans are project data, but attaching one writes its id to the current
session metadata. Other sessions in the project do not inherit it. A pin made
while a new-session draft is open lives on that draft and transfers only to the
session created by its first message. Work status lists and detaches draft pins
before that first message, then reads them from the created session metadata.

## Memory is not a fifth kind of note

The first four tabs hold what the user wrote. Memory holds what the **agent**
wrote for itself, in its own store (`packages/web/server/lib/agent-memory`) and
through its own client (`useAgentMemoryStore`). They share the panel and nothing
else — keeping the stores apart is what stops an agent mistake from landing in
the user's notes.

Two consequences shape this tab:

- **Entries are editable.** A memory worded badly enough to mislead should be
  fixable where it is read; deleting it and hoping the agent learns it again,
  better, is not a repair. The agent rewrites by saving the same memory again,
  so `PATCH` exists for the panel alone.
- **Nothing gates the agent, and nothing asks the user to click.** An earlier
  version had a confirm button. It was theatre: the agent already had the
  memory whether or not the button was pressed, so the click bought the user
  nothing. Entries now carry `new` and `changed` badges derived from
  `createdAt` / `updatedAt` against a per-scope "last looked" mark, and looking
  at the tab is the acknowledgement. Nothing about review is stored server-side.
- **The scopes are a switch, never one merged list.** A claim about the user
  reaches every project, so which store an entry sits in is the most important
  thing about it and must not be something the reader has to infer. The switch
  is a chip group, not a tab strip: it picks which store you are reading, not
  which view you are in, and the pressed state reads plainly against the
  panel background.

The mark is frozen while the tab is open and advanced on the way out, or every
badge would clear the instant the tab appeared — the one moment the user is
trying to read them. Each project keeps its own mark, so opening one project
cannot silently clear another's badges.

The store is loaded by `useAgentMemorySync` in `App.tsx` and reloads on
`openchamber:agent-memory-changed`, because the agent writes mid-turn through
its own tool. It feeds this panel only. Session prompts do not copy memory
titles or save guidance: the model reaches memory through the Host memory tool,
and `packages/web/server/lib/session-knowledge` delivers only the user's pinned
notes and plans (to any sender, including headless ones, and again after
compaction).

`useProjectContextOwner` is the client authority shared by this panel and the
memory sync. It resolves managed chat directories to the Chats root and a
worktree to its project before either consumer touches a store. The server uses
`agent-memory/project-resolution` for the same worktree rule. Keying by a
worktree session directory would file memories under a project nothing reads.

Project memory is rendered only when the store's `projectPath` matches the
panel owner. An owner switch hides the previous project's entries before the
new request starts. A failed request marks the new owner unavailable instead of
presenting that hidden list as authoritative empty memory.

Turning the switch back on re-reads the store only after the setting has
finished being written. The switch flips the client immediately, which makes the
panel ask the server straight away — and mid-write the server truthfully answers
"disabled", which used to latch the tab hidden until a restart. Loads are also
sequenced, so that stale answer cannot land after the good one.

`agentMemoryToolEnabled` is one switch for the whole feature: it removes the
tool from the agent, this tab from the panel, and the index from new sessions.
The tab also hides when the server reports the surface disabled, so a stale
client cannot keep showing memory that is off. A persisted `memory` tab
selection falls back to `notes` rather than opening a tab that no longer exists.

## Data flow

Storage is server-owned; see
`packages/web/server/lib/project-context/DOCUMENTATION.md`. The panel never
touches `/api/fs/*` and never handles a plan path — plans are addressed by id.

```
useProjectContextStore  ->  ProjectNotesTodoPanel  ->  sections
      (server cache)          (load + shared write)
```

There is deliberately no cross-panel event. An earlier version broadcast
`openchamber:project-notes-updated` / `openchamber:project-plan-saved` on the
window and every mounted panel re-read the whole config in response. Writers now
mutate the store and readers re-render from it.

## Where writes live

Notes, todos, and plans each have their own routes, so each section owns its
writes end to end and no section has to persist a neighbour's state alongside
its own. `NotesSection` and `PlansSection` call the store directly. Todos still
route through the container only because the container already holds the list it
sorts for display.

An earlier version wrote notes and todos together in one request. That forced
the container to own the notes draft, because otherwise a todo toggle would
persist whatever notes were last committed and discard unsaved typing. Splitting
the routes removed the coupling rather than managing it.

## Layout

The three lists are tabs, not one stacked column. Stacking gave each list its
own scroller inside the panel's scroller, and it only got worse as lists grew —
the todo list had to carry a manual resize handle just to stay usable. With
tabs there is exactly one scroller: the panel's. The resize handle and its
persisted `todoPanelHeight` are gone with it, and each section renders its list
at natural height.

The host (`RightSidebarTabs`) therefore sets `overflow-hidden`; putting a
scroller there again would nest one inside the other.

Section headers no longer repeat their own name or count — the tab carries both.

The active tab persists in `useUIStore` so switching surfaces or remounting the
panel returns to where the user was.

## Search

One query in the container filters all three tabs, and the tab bar doubles as
the result summary: each tab shows its match count. Tabs divide, and search is
the one thing division would hurt — you do not always remember whether
something was written as a note or lives in a plan — so search deliberately
stays above the tabs rather than becoming per-tab.

If the active tab has no matches and another does, the panel follows the search
there. Without that, typing a query whose hits live elsewhere shows an empty
list and the user has to guess which tab to try.

Filtering is display-only: every mutation still acts on the full list, so
reordering or clearing completed todos while a filter is active cannot drop
hidden items. The query resets when the project changes, since a query that
matched the old project would silently hide everything in the new one.

## Invariants

- **Each note row keeps a local, debounced draft.** Writing on every keystroke
  would put a request behind every character, and re-reading the store each
  render would fight the caret.
- **An external note change is adopted only while that row is untouched** since
  its last save. "Add to notes" from a chat selection must reach an open panel,
  but must never overwrite what the user is typing.
- **Only one note is expanded at a time, and collapsed notes are clamped.**
  Notes run to 3000 characters each; with the panel owning the only scroller,
  unbounded rows turn the tab into one unbroken wall of text. A collapsed note
  shows a three-line preview and expands into its editor on click.
- **A blanked note body is never persisted.** The server rejects it, so the row
  restores its last saved text on blur rather than showing a phantom failure.
  Deleting is an explicit action.
- **A load failure never blanks the panel.** The store keeps the last good
  snapshot; the panel toasts once, and only when nothing had loaded yet.
- **Completed todos sink to the bottom for display only.** Stored order is what
  the user dragged.
- **Plan creation is not optimistic.** The id and file name come from the
  server, and a row that cannot be opened is worse than a brief wait.

## Why list rows share one tooltip

The lists are not virtualized and every row keeps its buttons mounted, so a
tooltip per button would mount several tooltip roots per row. A control in a
list carries its text in `data-row-tooltip`, and `DelegatedTooltip`
(`ui/row-tooltip.tsx`) listens on the panel and anchors one tooltip to it. That also covers the same
controls in an open entry's toolbar. It answers a mouse or the keyboard; a touch
gets no tooltip on these controls.

## Pinned context

The pin toggle on a note or plan attaches it to the current session or draft.
Assembly and delivery live in `packages/web/server/lib/session-knowledge`.

## Related

- Store: `packages/ui/src/stores/useProjectContextStore.ts`
- HTTP client: `packages/ui/src/lib/projectContextApi.ts`
- Plan viewer/editor: `packages/ui/src/components/views/PlanView.tsx`
- User docs: `packages/docs/content/docs/notes-todos-plans.mdx`
