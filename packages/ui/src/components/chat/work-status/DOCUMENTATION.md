# Work-status panel

A card rendered to the right of the transcript inside `ChatContainer`. It
reports the state of the current session, its branch, its quotas and its
subagents.

## Structure

Every readout is a **labelled row**: icon, name, trailing value. A number
without a name is unreadable at a glance, which is what an unlabelled stream of
values degenerates into.

Rows are grouped into **named sections**, one component each, composed in
order by `WorkStatusPanel`. The separator between them is a
`:not(:first-child)` CSS rule rather than a prop, because every section renders
conditionally; passing "am I first?" down would mean each one tracking what the
sections above it decided to render.

Sections render nothing when they have no rows, so the panel collapses upward
instead of reserving empty space. Turn stats keeps its header for a
selected session even without metrics, so a saved collapsed state can reopen.

## What it is not

It is **not** a context-panel surface. It is not registered in
`lib/surfaces/registry.ts`, has no rail icon, no tab, no persisted width and no
resizer. It is a card floating inside the chat column — rounded border, faint
fill, its own margin — rather than a docked pane flush against the window edge.
When it overlays the transcript, it uses the shared `oc-glass-panel` surface;
the inline card keeps its lighter, non-blurred fill instead.

## Placement

`ChatContainer`'s top-level return is a flex row:

- the existing chat column (`data-composer-bound`, `flex-1 min-w-0`), holding
  the viewport, the composer and the timeline dialog;
- `WorkStatusPanel`, a fixed-width `shrink-0` sibling.

<<<<<<< HEAD
Nothing inside `ChatViewport` changed. The virtualizer sees the column shrink
exactly as it already does when the context panel opens.
=======
When the chat area also fits the context panel (`roomyBesidePanel`), the card
keeps its column beside the open panel (`besidePanel`). The slot then grows
to the panel plus the card's column, the card's host anchors to the slot's
start and the panel card is offset past it, so the card stays between the
chat and the panel. Opening the panel slides it in from the window's edge
while the card moves with the chat's edge; closing reverses that. The
answer is known while the panel is closed too, so the commit that opens it
already animates to the final width.

The card has the lowest priority in the row: it claims no room from the left
zone and never makes the session sidebar fold. A panel dragged wider stops
where the chat would drop under its own minimum next to the card, and the card
yields once the panel is released wider than it fits beside.

The overlay form stays inside the chat column in `ChatContainer`.
>>>>>>> bc50ba56a

### Why the header carries context, Open In and the project action

The card yields whenever a rail panel needs its room, so anything that lives
only in the card disappears while the user reads a diff or a file. The context
fill, the Open In app and the project action are what people check or press
throughout a session, so the header carries them in every layout
(`HeaderContextUsage`, `HeaderProjectControls`). Open In and the project
action live only there: in the card the app icon had no reading of its own,
and the action row added only the action's name, which the header button's
tooltip shows. The context row stays in the card as well, because it carries
what the header has no room for: the cache-warming switch, the cost at rest
with its subagent split, and the note after a compaction. Hiding the header's
context while the card shows the same figure was rejected: the reading then
jumps between two places as panels open and close, and the user has to look
for it each time.

### Why the card docks beside the panel instead of floating over the chat

A pinned card that floats over the transcript while a side panel is open was
weighed against it. Floating covers the transcript it reports on and needs an
opaque surface over moving text plus a rule for narrow windows. Docking uses
room the window already has and adds no setting: where the room is missing,
the card yields exactly as it did before, and the header still offers the
overlay.

## Visibility

`useWorkStatusVisibility` hides the panel when any of these hold:

- the user switched it off;
<<<<<<< HEAD
- the layout is mobile (including hosted mobile and Capacitor phone shells);
- the context panel is open for the directory the app is effectively on —
  looked up through `useEffectiveDirectory` and `normalizeContextPanelDirectoryKey`,
  the same key the rail and the panel use. It is deliberately **not** the
  directory this panel reports about: a managed Chat reports about none, and
  that empty key answered "closed" for a context panel that was plainly open;
- the row cannot fit `WORK_STATUS_MIN_CHAT_WIDTH` of transcript alongside
  `WORK_STATUS_PANEL_WIDTH` of panel.
=======
- the runtime is mobile or VS Code (the phone shows the sections in its own
  tab, see below);
- the row cannot fit `WORK_STATUS_MIN_CHAT_WIDTH` of transcript alongside
  `WORK_STATUS_PANEL_WIDTH` of panel. Only the threshold decisions are state
  (`roomy`, `roomyBesidePanel`); the width itself is not, because it changes
  on every frame of a sidebar animation and storing it re-rendered the whole
  chat each frame;
- the right zone's context panel is open and the row cannot also fit that
  panel at its own width (`sideZoneWidth`: the zone's stored size, or the tree
  width for Files showing only its tree), or the panel is expanded. The panel
  is looked up for the directory the app is effectively on, through
  `useEffectiveDirectory` and `normalizeContextPanelDirectoryKey`, the same
  key the rail and the panel use. It is deliberately **not** the directory
  this panel reports about: a managed Chat reports about none, and that empty
  key answered "closed" for a context panel that was plainly open.

The panel's width comes from the store, never from the DOM: it is the user's
setting, so a resize or a surface switch moves the threshold and the last
area reading is re-decided before paint.
>>>>>>> bc50ba56a

`ChatContainer` additionally suppresses it in mini-chat and in expanded-input
mode. It remains available on a new-session draft: when the draft targets a
project or pending worktree, the panel uses that directory for project, MCP,
and usage readouts before a session exists.

Managed Chats never render or warm the Project repository section. A Chat draft
also passes no fallback directory to the panel, so an active project's branch
cannot leak into the draft while directory-independent sections remain
available.

`rowRef` is a **callback ref, not an object ref**. An object ref gives no signal
when the node attaches, so the measuring effect read `.current`, found nothing
whenever the row mounted after the effect first ran, and only recovered on the
next unrelated dependency change — in practice, opening and closing the context
panel. `useWorkStatusVisibility.test.ts` covers a row that attaches late.

### Why the chat area is measured, not the chat column

**The width test must observe something the panel cannot resize.** The chat
column's width is an *output* of the visibility decision: hiding the panel
widens the chat, which would re-satisfy a chat-width test and re-show the
panel, which narrows the chat again — an infinite oscillation.

It measures the **chat area** — the container holding the chat and the context
panel together, marked `data-chat-area` in `MainLayout`. Measuring the chat row
instead reported a width still catching up while the context panel animated
closed, so the panel reappeared only once that number crossed the threshold:
the chat widened and then narrowed again. The chat area does not move when the
context panel opens. `useWorkStatusVisibility.test.ts` pins both properties.

The context-panel check mirrors `ContextPanel`'s own derivation: `isOpen` alone
is not enough, because a panel with no resolvable active tab renders nothing
and therefore displaces nothing.

## Data sources

Everything is read from already-warm caches. The panel adds no aggregated
endpoint; quota data refreshes through the shared fixed three-minute quota timer,
which requests only providers enabled for this panel.

| Block | Source | Notes |
|---|---|---|
| Context + cost | `contextUsage.ts` over `useSessionMessages`; cost via `useSubagentCostRollup` (own cost + every descendant subagent, recursively) | see below — the store getters cannot serve this |
| Cache hit | `computeLastReplyCacheHit` over `useSessionMessages` | the reply the context reading comes from; see below |
| Branch, ahead/behind, attention | `useGitStore` directory state | warmed via `runBackgroundNetworkTask(ensureStatus)` and refreshed from Git mutation hints |
| Changed files | `useGitStore` status `files` + `diffStats` | working tree, not session-authored edits |
| PR + checks | `useFreshestPrVisualSummaryForBranch` | **read-only**; follows the freshest remote-keyed entry for the branch |
| Subagents | child sessions from `useAllLiveSessions` (`parentID`) + `useAllSessionStatuses`; per-row cost from `useSubagentCostRollup`'s `perChildCost` (each child's own subtree total, so nested subagent-of-subagent cost rolls up under its immediate parent row) | |
| Subagent blockers | directory `permission` / `question` maps | one subscription covers every child |
<<<<<<< HEAD
| Usage | `components/usage/usageGroups.ts` over `useQuotaStore` | grouping shared with the mobile popover; presentation is not |
| Linked threads | `lib/linkedIssues.ts` over session metadata | written by the flows that attach an issue or PR |
| Turn stats | `telemetry.ts` over `useSessionMessageRecords` | computed only while expanded and authoritatively idle; either rate above 5,000 tok/s is reported as unknown (see the two-rate description below) |
| Goal | `useSessionGoal` | respects the Settings toggle |
| MCP | `useMcpStore` | connect/disconnect reuses the dropdown's actions |
| Pinned messages | `getContextObligatoryMessages` + `state.part` | see below |
=======
| Workflows | `useSessionWorkflowRuns` (`lib/workflows/store.ts`): the session's runs read once from the server, then kept current by `openchamber:workflow-run` events | only while workflows are shown: not in VS Code, and only with the workflow tool on (`selectWorkflowsShown`) |
| Usage | `components/usage/usageGroups.ts` over `useQuotaStore` | grouping shared with the mobile popover; presentation is not |
| Linked plans | `useProjectContextStore` plans of the session's project whose `session.sessionId` is this session | refreshed through `observeProjectContext` |
| Linked threads | `lib/linkedIssues.ts` over session metadata; state from tracked items | written by the flows that attach an issue or PR, and removable from the row; a linked PR that is also the checked-out branch's PR shows the branch summary, as its sidebar row does |
| Turn stats | `telemetry.ts` over `useSessionMessageRecords` | computed while authoritatively idle, including when collapsed; active mounts read warm records once for the previous turn; either rate above 5,000 tok/s is reported as unknown (see the two-rate description below) |
| Keep-warm switch | `useSessionWarmingStore`, mirrored from the server's `lib/session-warming` | on the Context row, shown only while Settings chose per-session warming and for a root session outside an isolated space; the tooltip's countdown ticks only while it is open |
| Goal | `useSessionGoal` | respects the Settings toggle |
| MCP | `useMcpStore` | the switch reuses the dropdown's `setEnabled` |
| Pinned messages | `getContextObligatoryMessages` + `state.part`, else one `getSessionMessage` read | see below |
>>>>>>> bc50ba56a
| Todos | live `state.todo[sessionId]`, persisted fallback | live channel wins |

### Turn stats

The section follows Usage by default and reuses the panel's existing rows. Only its header
has an icon; metric rows use labels and values without leading icons. It
reads already-loaded records without fetching history. The newest turn needs a
preceding user message and completed assistant steps. A truncated or unfinished
turn has no whole-turn result; later materialization can supply it. A newest
user message with no reply yet arrives while the session still reports idle, so
the section computes the turn before it instead and flags it as the previous
turn. Computing nothing there would commit an empty result just before the
session turns busy and blank the section for the whole run.

Two rates answer different questions. Response speed uses the final assistant
message's output tokens divided by the union of its nonempty text intervals.
It excludes initial waiting, reasoning tokens and reasoning time, and earlier
tool steps. It requires complete, valid text timing and a final message without
tools, errors, synthetic text or ignored text. This measures text delivery from
stored timestamps, not provider-side decode speed. The header shows only this
rate; unavailable response timing never falls back to whole-turn speed.

Whole-turn speed uses output plus reasoning tokens from every step, divided by
elapsed assistant time minus the union of completed and failed tool intervals.
Waiting for each model response remains included. Invalid or missing inputs
omit the dependent metric rather than becoming zero; reported zeros remain
valid. TTFT averages the earliest text/reasoning start delay from every step,
only when all steps have a valid sample.

Either rate above 5,000 tok/s is reported as unknown. No provider streams that
fast, so such a value means the measured window is broken: a tool that runs
for nearly the whole step leaves a residual of a millisecond, and a text
interval can be equally short. The row is omitted rather than shown wrong.

Metric labels stay short. Every row is a single hover and keyboard-focus target
for a shared tooltip, with a 750ms hover delay and a portal outside the panel's
scroller. Tooltips explain the measurement in every locale. The token row uses
compact input/output arrows; its tooltip gives full counts and explains that
input excludes cached tokens and output includes reasoning across all steps.

<<<<<<< HEAD
Records subscriptions and aggregation stop while collapsed, busy, retrying, or
awaiting status authority. Explicit idle events or a successful directory status
snapshot allow computation. One component-owned committed result keeps the
headline and rows stable during the next active turn. Its identity includes
=======
Records subscriptions stop while busy, retrying, or awaiting
status authority. Explicit idle events or a successful directory status snapshot
allow computation even when collapsed: the response-speed headline remains visible
and updates when a turn completes, after a remount, or when idle records change.
The collapsed body stays unmounted. One component-owned committed result keeps the
headline and rows stable during the next active turn. Whenever the shown numbers
belong to an earlier turn (a pending prompt, or a busy or retrying session), the
header says "Previous turn", followed by the response speed when there is one.
Opening or reopening the section mid-run reads already-loaded, revert-filtered
records once per scope, without fetching history or subscribing to streaming
updates. It excludes the entire newest user-bounded turn, even if some of its
assistant steps have completed. Missing or incomplete previous history shows no
numbers until idle. The retained result's identity includes
>>>>>>> bc50ba56a
runtime, normalized directory and session. Scope changes discard it; fresh empty
or reverted records clear it. There is no global message-ID cache. Corrections
to existing message/part identities invalidate the current result.

### Why active mounts read history once

The mobile drawer unmounts its sections when closed, so component retention alone
loses the previous turn on reopen. One warm-store snapshot recovers that turn
without adding streaming work or history requests. The newest user-bounded turn
is excluded because a completed tool step does not prove that turn has finished.

### Context usage has its own computation, on purpose

`useSessionUIStore.getContextUsage` cannot serve this panel for two reasons:

1. It reads `getSyncMessages(sessionId)` with **no directory**, resolving to the
   *current* directory's child store, and keys off the store's own
   `currentSessionId`. A session held by another directory — a worktree, or the
   moment after a directory switch — reads as "no messages", and the readout
   vanished while the header still showed a value.
2. It is an **imperative getter**, as is `useConfigStore.getCurrentModel`.
   Selecting one yields a reference that never changes, so calling it during
   render subscribes to nothing; the readout went stale across session switches.

`contextUsage.ts` therefore computes the same quantity from messages the panel
has already subscribed to for a known session and directory, and the panel
subscribes to `currentProviderId` / `currentModelId` for the limits.
`contextUsage.test.ts` pins the arithmetic — notably that the *latest*
reporting assistant turn is the answer, not a sum across turns.

Which message is "latest" is decided by `findLatestContextFill` in
`stores/utils/tokenUtils.ts`, shared with the retained web/Electron header,
mini chat, mobile metadata and context sidebar. A finished compaction's own record
(`summary: true`) is not a reading: its tokens describe the summarizing request,
whose input is the pre-compaction history. Until a later response reports
tokens, the fill is `compacted` and every surface shows a dash, never the older
pre-compaction number. A compaction still running, or one that failed, has not
changed the window, so the previous reading stays.

Two further rules on this readout:

- The displayed percentage is computed **unrounded**. `clampPercent` applies
  `Math.round`, so routing the display value through it turned 33.6% into
  "34.0%" and made the panel disagree with the header. Rounding is still right
  for the colour threshold, which is what the header feeds it.
- When the model exposes no context limit, the percentage falls back to the
  store's own default limit instead of disappearing.

There is no cost-only fallback row. A row labelled "Context" showing nothing but
a price is not a context reading; cost rides along with the percentage or waits
for it.

### Why the cache row shows the last reply and not session totals

The row under the context meter answers "what is the provider caching now":
the cache hit of the reply the context reading comes from, on every surface.
Its output was dropped as uninteresting for one reply. Whole-session totals
were tried here and dropped too: they span every
compaction, so a session's 97% average says nothing about the prompt that
goes out next. They stay in the context panel's overview
(`computeSessionTokenTotals`), read off the session record, which OpenCode
adds every step's usage to; summing loaded messages would shrink as a long
session keeps only its tail. Their "Input" counts the whole prompt, cache
included, since OpenCode's `input` is only the uncached part.

### Pinned messages load only what they need

Pins are most useful on a long session — which is exactly when the pinned
<<<<<<< HEAD
message has scrolled far enough back not to be loaded, leaving the row with a
placeholder. The section materialises the session, but only when a pin actually
resolves to nothing: having pins is not a reason to fetch a session, and
neither is something being unloaded in general.
=======
message sits before the loaded part of the transcript. Session metadata keeps
the pin's id, time, role and owning `sessionID`. A child accepts only its own
explicitly owned pins. It accepts a legacy ownerless pin only when its message
was created strictly after the child; missing session ids and incomplete child
timestamps fail closed. Root sessions, including user forks, keep inherited pins.
A pin that is not loaded reads its one
message from OpenCode (`opencodeClient.getSessionMessage`) for the row's text.
That read targets only the displayed session and never walks to a parent, and the
row keeps only a text part whose session and message ids match the pin, so a
parent's text cannot supply the label. No session is materialised for it, a loaded pin
costs nothing, and a failed read leaves the placeholder until the section mounts
again.

### Why pin ownership filtering applies only to child sessions

Child and subagent sessions must not display parent pins. User forks retain
their existing pin inheritance and compaction cursor. Copied messages receive
new ids, so mapping inherited pins to forked messages needs a separate change.
>>>>>>> bc50ba56a

### PR status is deliberately read-only

The panel never calls `startWatching`. PR watching is owned by the background
tracker, and its concurrency gate exists because per-consumer PR fetches once
saturated the browser's connection pool and stalled startup for ~20s. A panel
that started a watch per open session would reintroduce exactly that fan-out.
The PR surface can watch a concrete remote while passive readers initially know
only the automatic remote key, so the panel reads the freshest entry for the
directory and branch across remote keys. This keeps its PR and checks rows in
sync with the live PR surface without adding another request owner.

### Changed files come from git status, not the session

`Session.summary` looks like the obvious source and does not work. OpenCode's
`SessionSummary.summarize` writes `{additions: 0, deletions: 0, files: 0}` at
the start of every turn and then fills only the **message**-level
`summary.diffs`; session-level totals stay zero forever. The `session.diff`
event is reset to `[]` in the same place and carries real content only on
revert, so `state.session_diff` is not an aggregate either.

That leaves two honest options: aggregate per-message `summary.diffs` across
every turn, or read git status. The panel reads git status — it is
authoritative, already cached per directory, costs nothing extra, and sits
directly under the branch row where working-tree state is what a reader
expects.

The consequence is a real semantic difference: this counts the working tree,
including edits the user made by hand and excluding session edits that are
already committed. If a session-authored count is ever needed, it has to come
from aggregating message summaries, not from `Session.summary`.

One exception: while the directory is a worktree whose creation has not
finished (`useWorktreeBootstrapPending`), the working tree transiently holds
bootstrap files that the initial git reset is about to remove. Those are not
changes on the branch, so the panel neither fetches status nor renders the
changed-files row until the bootstrap settles, then forces one status fetch so
the row reflects the reset tree rather than a mid-creation snapshot.

<<<<<<< HEAD
=======
### Workflow rows

The Workflows section lists the runs the session proposed
(`packages/web/server/lib/workflows`), newest first. Where the context panel
exists (desktop and web), a run is one row that opens it in the Workflows
panel (`components/chat/workflows/WorkflowsPanel.tsx`), which shows its agents,
log, result and script. The row carries Run and Don't run while the run waits
for approval and Resume after a failure or a stop; a running run shows its
current phase and how many of its agents finished; a finished run's icon is
its state, with no word beside it, as in Subagents. Stop lives in the panel
and on the chat card. On the phone, which has no context panel, a run's row
carries the same actions plus Stop, an open run lists its phases with how many
agents finished and each phase its agents, and a finished run folds to its row
until pressed. An agent row opens its session like a subagent row
(`useOpenChildSession`, shared with the Subagents section).

A workflow's agents are child sessions of the session too. The Subagents
section leaves them out, so a run of fifty agents does not bury the session's
own subagents and each session shows in one place.

While workflows are not shown (VS Code, or the workflow tool off) the section
exists in no list: the panel and the sections dialog both drop it (`useUnavailableWorkStatusSections`),
so the dialog never offers a section that stays empty. Its id stays in the
saved order, so it comes back where the user put it.

>>>>>>> bc50ba56a
## Section order

The default order is by durability:

1. **Session** (goal, context, cost), **Project** (attention, branch,
<<<<<<< HEAD
   changes, PR, checks), **Usage**, and **Turn stats** (session telemetry:
   throughput, duration, TTFT, cache hit rate) — true for as long as the session
   is open. Usage sits here rather than lower down because a spent quota stops the
   work outright;
2. **Subagents**, **Tasks** — what is happening right now;
3. **MCP**, **Pinned messages**, **Context sources** — supporting material.
=======
   changes, PR, checks), **Usage**, **Context sources**, and **Turn stats**
   (session telemetry: throughput, duration, TTFT, cache hit rate) — true for as
   long as the session is open. Usage sits here rather than lower down because a
   spent quota stops the work outright, and Context sources because it holds the
   linked issue and PR, which tell what the session is about;
2. **Subagents** and **Workflows** — what is happening right now;
3. **MCP** and **Pinned messages** — supporting material.
>>>>>>> bc50ba56a

The sections dialog has drag handles for changing this order, including hidden
sections. A drop updates the panel immediately. `workStatusSectionOrder` is a
profile preference persisted through the settings registry and the local UI
store. Missing or empty order uses the default; duplicate and obsolete ids are
discarded, and newly introduced sections append in default order. Visibility
changes never alter positions.

<<<<<<< HEAD
Guest SDK status sections remain available through the existing guest catalog
on web/PWA and Electron. Only mobile surfaces keep the catalog unsupported;
the panel and section dialog do not add a separate mobile guest path.
=======
Clients saved the default as their order without the user choosing it, so a
saved list can't tell a choice from the default on its own.
`workStatusSectionOrderExplicit` turns true on the first drag. Without it, an
order that matches the old default with Context sources last moves that section
up, on load and on each settings apply; any other order stays. The marker keeps
a user who drags Context sources back to the bottom from being moved again.
>>>>>>> bc50ba56a

`WorkStatusPrimaryGroup` supplies Session and Project through a composition
callback so the panel can place them independently while retaining one set of
data subscriptions. Keyed fragments preserve mounted sections and DOM order;
sections that render nothing leave no spacing wrappers. Secondary elements are
created by the panel, so primary readout updates do not rerender them.

The overlay's outside-click and Escape dismissal pauses while this dialog is
open, since the dialog is portalled outside the panel.

The first rendered section heading reserves space on its right for the panel's
settings button. The scroller selects the first actual section DOM node, so
hidden and empty sections do not claim that space. Both heading variants expose
`data-work-status-heading`; only the heading is inset, leaving body rows at full
width. Heading summaries truncate within a bounded share of the available width
so project names and usage summaries cannot push actions under settings.

## Switching it off

A persisted preference (`workStatusPanelEnabled`) drives a header toggle, and a
dialog behind the equalizer icon switches individual sections off. Hidden
sections are stored rather than visible ones. Every section, including Turn
stats, is enabled by default. UI-store v21 migration and server-list hydration
remove the old automatic telemetry hiding unless `workStatusHiddenSectionsExplicit`
records a user-chosen list. Explicit hiding and other hidden sections survive.
The marker and list travel together through autosave, sanitization, and server
settings; an empty list enables everything. Complete settings
snapshots own this preference; unrelated partial save echoes leave it unchanged.

`workStatusPanelVisible` is separate and transient: the switch can be on while
layout still refuses the panel. The header and the git rail read it to drop the
readouts the panel already carries, and it is deliberately not persisted — it
describes the current frame, not a preference.

## Appearing and disappearing

The panel collapses on the context panel's own curve and duration rather than
unmounting, and slides out to the right with a fade when switched off. It stays
mounted wherever it could ever show, so the collapse has something to animate;
its content is dropped once the collapse finishes.

An empty card is a border around a settings icon, which reads as a fault. Each
section decides for itself that it has nothing to say, so they report through
`presenceContext.ts` and the panel collapses when none rendered. Deriving that
at the panel level would mean duplicating every data source the sections read.

There is one deliberate exception: when the user hides every section, the card
stays visible with a localized empty state and section controls. Collapsing that
state would also hide the only recovery path. A panel with enabled sections but
no data still follows the presence reports and collapses as before.

The scroll offset resets on session change: restoring one session's offset into
another's shorter panel lands somewhere arbitrary.

The Subagents section opens itself when subagents appear where there were none,
on that edge only: re-expanding on every count change would fight a user who
just collapsed it.

Its expanded list is capped at eight rows and scrolls independently, so a
session with many subagents does not crowd every section below it out of the
panel.

## Tasks

Icons and strike-through match the composer's todo dropdown, so one list does
not read as two. Two deliberate differences:

- **Completed items stay.** The dropdown is a queue to work through; this is a
  record of the session.
- **Sorted by status** — in progress, then pending, then completed — and stable
  within each rank, since the agent's own ordering carries meaning.

Rows truncate at this width, so each carries a delayed tooltip with the full
task text.

Tasks starts expanded and stores its collapsed state under the `tasks` section
id. Collapsed, it keeps the heading and completion count, followed by only the
first `in_progress` task in the agent's order. Without an active task, including
pending-only and all-completed lists, it shows no preview row. Live updates
replace the preview without expanding the section. An authoritative empty todo
list clears the section rather than restoring old persisted tasks; persistence
is used only while the scoped live list is missing.

## Collapsed Usage headline

Collapsed, the Usage section shows one quota rather than a mode word: the
**shortest window reported by the provider the composer is pointed at**. A
5-hour bucket answers "will the next turn land"; a monthly one does not.

Selection rules live in `usageHeadline.ts` and are pinned by
`usageHeadline.test.ts`:

- provider ids are matched directly, with a small alias table for the ones that
  diverge from OpenCode's (`openai`/`chatgpt` → `codex`, `anthropic` → `claude`,
  `gemini` → `google`);
- model-scoped rows are skipped while any provider-level row exists — a
  per-model quota is not the provider's;
- rows without a window duration (credit balances, tool counters) are a last
  resort, never preferred over a real window;
- **no match means no headline.** The section falls back to the display-mode
  label, because showing an unmatched provider's quota would read as the active
  one.

## Actions

Rows that name something the app can already show are buttons:

| Row | Opens |
|---|---|
| Context | the context overview (`openContextOverview`), same destination as the header readout |
| Changes | working-tree diff (`openContextPanelTab`, `diffScope: 'working'`, no target path) |
| Branch | git surface (`openContextSurface(dir, 'git')`) |
<<<<<<< HEAD
| Pull request, Checks | PR surface (`openContextSurface(dir, 'pr')`) |
| Subagent | that child session's chat tab, read-only |
| Goal (row) | the composer's own `SessionGoalDialog` |
| Goal (pause/resume) | OMP `goal` control through the composer's `SessionGoalDialog` |
| MCP switch | connects/disconnects the server |
=======
| Pull request, Checks | The Tracker's branch tab (`openContextPanelTab(dir, { mode: 'pr' })`) |
| Subagent | that child session's chat tab, read-only |
| Goal (row) | the composer's own `SessionGoalDialog` |
| Goal (pause/resume) | `setSessionGoalStatus(sessionId, directory, status)` |
| MCP switch | turns the server on or off in its config file (`useMcpStore.setEnabled`) |
>>>>>>> bc50ba56a
| MCP status | the state doubles as the button that reconnects |
| Pinned (pin icon) | unpins the message |
| Pinned (text) | jumps the transcript to that message |

<<<<<<< HEAD
=======
### Project actions

The panel shows no project action; the header button runs or stops the shown
one. The project's own actions come first and auto-discovery last, so with
nothing picked the button offers the first configured action, or
auto-discovery when there is none. The pick is stored per runtime and project
(`lib/projectActionSelection.ts`) and survives remounts and restarts; a pick
that no longer names an action falls back to the first one. A running action
takes the button over an idle pick, and pressing it acts on the action it
shows, through the same shared-setup trust prompt as the menu.

Auto-discovery reuses a personal action when its name identifies a dev server or its command runs a conventional dev script. A shared action needs a matching script command as well as the same trust confirmation as choosing it from the menu: renaming an already trusted shared action does not change its trust hash. Arbitrary `start` substrings and unrelated `start:*` scripts must not launch through discovery.

`components/layout/ProjectActionsProvider` mounts one runner
(`useProjectActionsRunner`) in `MainLayout` for the project
`useProjectActionsContext` resolves. A managed
Chat resolves to none. A draft waiting for a new space has no actions until the
space runs, then runs them in the space (`useDraftSpaceTarget`). Three views read that runner through
`projectActionsRunnerContext`:

- the header's button (`HeaderProjectControls`): the shown action's
  run state as one icon, the preview globe while it serves a page, the action
  list on right click. It observes the run listing while mounted,
  so a run another client started never shows as Run;
- `ProjectActionsDialog`, opened by `open_project_actions` (`mod+alt+r`). It
  lists the actions with their state, opens with the button's action highlighted,
  and Enter picks the action and runs or stops it;
- the command palette's search-only "Run: name" / "Stop: name" entries and its
  "Project actions" entry.

The runner lives above the layout, so a run keeps its output watch (URL
auto-open, exit tracking) whatever is on screen. The server terminal listing
still runs only on demand: each view calls `useObserveProjectActionRuns` while
it is on screen. The shared observer lists once, then refreshes on terminal
lifecycle signals, control-stream connections, runtime switches and visibility,
focus or online recovery. Hidden/offline clients wait for recovery.

### Why events and not polling

The header is nearly always mounted, so a five-second listing loop generated
idle requests even when no action ran. Terminal create, exit, restart and removal
invalidate the list through the existing realtime control stream. A fresh list
on connection or visibility recovery also discovers runs started on another
client during a disconnect, while failed reads preserve the last known state.

>>>>>>> bc50ba56a
The goal icon reproduces the **composer target button's** colour mapping, not
the goal strip's. The two disagree today — the strip paints `paused` muted and
`blocked` warning, the button paints them info and error — and the button is
where this panel's reader last saw the goal. Unifying them is a separate change.

Jumping to a message goes through the `#message-<id>` URL hash, which
`useChatTurnNavigation` listens for inside `ChatContainer`. It is the only
cross-component jump the chat exposes; there is no store action or ref
registry. An unchanged hash fires no event, so the panel clears it first to make
a repeat press work.

Work-status subagent rows open the child's read-only context-panel chat on
web/PWA and Electron. The retained mobile navigation branch selects the child
session in place, matching the transcript's subagent action. Transcript actions
inside a pinned or embedded chat column reuse that column's navigation instead
of nesting another panel. The work-status card itself stays hidden on mobile.

## Context sources

<<<<<<< HEAD
Linked GitHub threads first, then skills and MCP counts.
=======
The plan the session works on and linked issues and change requests first,
then pinned knowledge, memory, skills and MCP counts.

### The plan the session works on

A plan records the session it was sent to (Implement or Improve in the plan,
or an agent's `knowledge.save` with a `sessionId`), and its card in Project
knowledge opens that session. The row here is the way back: it lists every
plan of the session's project whose link names this session, with the plan's
step progress, and opens the plan in place in Project knowledge on desktop and
web (`openProjectKnowledgePlan`, the same request an agent's `knowledge.show`
makes) and full screen on the phone (`MobileAppActions.openPlan`). The plans
come from the project's knowledge store, refreshed through
`observeProjectContext` behind the background gate. A plan both linked and
pinned shows once, as the linked row with the pin as its leading control.
There is no unlink control: the plan's own card owns its link.
>>>>>>> bc50ba56a

Agents are deliberately absent: an agent is who does the work, not material
loaded into the context. Tools are absent too — `Agent.tools` is a per-agent
override map rather than a registry, so its size would be a number that means
something other than "tools available".

### Linked issues and pull requests

Written by the flows that already attach a thread — the composer's issue/PR
pickers, and session creation from an issue or PR in `NewWorktreeDialog` and
`GitHubIssuePickerDialog`. There is no manual "link this" control: attaching a
thread to the work *is* the act of linking it.

Before the close control sits a copy-link control (`useCopyReferenceLink`, the
same one the Tracker preview's header uses). It shows on hover or focus inside
the row, and always on a coarse pointer, which has no hover: at rest a row
keeps one action, and the copy is confirmed by a toast since nothing on screen
changes.

### Why the copy control takes no space at rest and not a reserved slot

A slot kept for it cut every linked title short by an icon's width, though the
control is used now and then. It is out of the layout until the row is hovered
or focused, so the title is full width at rest and narrows only under the
pointer.

Stored in session metadata as a **snapshot** (`lib/linkedIssues.ts`, namespace
`openchamber.linked_issues`), riding the same `patchSessionMetadata` channel as
pinned messages. Number, title, url, author and avatar only — the body,
comments and state belong to GitHub, and mirroring them would mean owning their
staleness. The stored title can drift; that is the price of a store that never
needs refreshing. A GitHub row opens github.com. A Linear row opens the
right-hand Linear panel when Linear is connected on desktop/web; otherwise it
opens the Linear URL. Hosted mobile and Capacitor phone shells have no Linear
rail, and disconnected runtimes also keep the URL destination.

Writes happen **after** the send promise resolves and are deliberately
swallowed on failure: the message went out, and a missing bookkeeping entry
must not surface as a send error.

The entry id comes from the thread URL rather than a separate owner/repo pair,
because every attach flow has the URL and only some carry the repo separately.
Issues and pull requests share one id shape, since they share a numbering space
per repository.

## Loading data the header used to own

Two readouts had no loader of their own and appeared only after the user opened
the matching header dropdown:

- **MCP** — `McpDropdown` was the only mount-time caller of `refresh()`.
- **Usage** — `useQuotaAutoRefresh` owns the initial fetch and the shared
  three-minute refresh while a quota readout is shown. The panel passes its
  visibility through the section list, so retained closing content does no work.
- **Skills** — `loadSkills()` ran only when the composer's slash autocomplete
  opened, so the context-sources count was whatever happened to be cached. The
  section loads them itself, keyed on the directory, since skills are
  discovered relative to the active project. It does not wrap the call in
  `runBackgroundNetworkTask`: the store already gates its own fetch.

Usage waits for the instance to say it is initialised. Quota providers report
themselves as configured only once the instance can read their credentials,
which on a remote instance is not true when the UI mounts — a fetch fired at
mount gets "nothing configured" for every provider, and since each one then has
a result, nothing asks again until the three-minute refresh. That is why Usage
could stay missing from the panel until Settings -> Usage forced a fresh fetch.
`useQuotaStore.ensureLoadedForRuntime` owns the readiness rule and runtime
bookkeeping. `useQuotaAutoRefresh` applies the shared 15-second opening freshness
window and suspends demand while the document or native window is hidden. The
store documentation defines the refresh contract for all quota readouts.

### These readouts belong to the connected instance

Same-origin web pages and Electron's Vite proxy initialize a runtime identity
even when the API base is empty. Requests stay relative to the page origin.
Electron dev uses `local`; hosted pages use their HTTP origin. Without this,
the quota loader treats a working proxy as a transient disconnected runtime
and skips the initial load.

Quotas, MCP status, skills, agent memory and the Linear/GitHub logins are all
served by whichever OpenChamber instance is connected, and each was cached
globally or by directory alone — which two instances can share. A switch left
the previous instance's answers on screen, and its Linear login usable against
a runtime that has no Linear. `apps/runtimeEndpointReset.ts` now drops all of
them, each store guarding its own in-flight requests with a generation so a
response for the previous instance cannot land in the new one. The MCP and
skills effects take `isConnected` as a dependency — not a gate — because
`directory` alone does not change when both instances hold the same path.

The panel now performs these itself, silently and through the
background-network gate, so it cannot compete with chat bootstrap traffic for
sockets. Usage additionally provides an explicit refresh action in its section
header. A panel that reports a subsystem's state cannot depend on an unrelated
component having been mounted or opened.

The repository section follows the same ownership rule. It subscribes directly
to `sessionEvents` Git refresh hints and refreshes its directory's shared Git
cache, rather than relying on the composer's former changed-files row or on the
Git context surface being opened first.

## Persisted panel state

Expanded sections (`workStatusExpandedSections`, keyed by a stable section id)
and the scroll offset (`workStatusScrollTop`) live in the persisted
`useUIStore`. Component state would not do: the panel unmounts every time the
context panel opens, which would silently discard the user's arrangement.

The scroll offset is restored in the scroller's callback ref, at the moment it
attaches, and read through `useUIStore.getState()` rather than a subscription —
subscribing would fight the user mid-scroll. Writes are coalesced to one per
animation frame.

## Not implemented yet

- Test/build/dev-server status and LSP diagnostics — a separate track. Note
  that `state.lsp` already exists in the sync state.
