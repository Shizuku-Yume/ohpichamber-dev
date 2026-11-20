# Work-status panel

A card rendered to the right of the transcript inside `ChatContainer`. It
reports the state of the current session, its branch, its quotas and its
subagents.

## Ownership

This module owns work-status readouts, section composition and the shared row
controls used by the desktop card and phone Status tab. Stores and sync modules
own data fetching and reconciliation; the layout's right slot owns column width.

## Invariants

- Turn telemetry reads canonical message usage and step timing. An authoritative
  idle status permits aggregation even while folded, so the upstream compact
  time/cost or throughput heading remains useful. Busy/waiting states retain
  only the last committed result for the same runtime, directory and session;
  invalidated status or a different scope cannot display it.
- Subagent identities, token counts and costs come from canonical subagent
  records, not legacy session summaries. Warning-only activity uses the shared
  `SubagentLive` owner and authoritative active-run turn membership; an old
  transcript cannot generate a silent-agent warning in a new run.
- Subagent activity reads canonical inline parts only for nonterminal turns in
  the authoritative active run. Historical running calls never prove live work.
  Call and result identities pair before rendering; native retry notices supply
  their attempt and error without inventing a deadline or per-tool start time.
  Web/PWA, Electron, hosted mobile and Capacitor share these projections.
- The Checks dot owns its blinking subscription, so its clock redraws only the
  dot rather than the section.
- Loaded-skill rows include disabled installed skills, because a skill loaded
  before being disabled must still open. Their history subscription watches parts
  because a skill call can finish after its message arrives.
- Installed skills resolve loaded-skill files by id, then name. The tool-reported
  folder supplies a file before the installed list arrives; built-ins and entries
  without a file open in Settings.
- Session knowledge reads its server summary independently of the notes panel.
  OhPiChamber metadata, source content and memory invalidate it; whole-session
  updates would refetch it on every step without changing its contents.
- Linked-item summaries stay associated with their list index, because the same
  repository thread can be linked from different instances. The session's links
  stay observed even when its sidebar row is absent.
- Context-source headings prioritize attached threads and pinned knowledge over
  ambient counts, because these identify the session's chosen material. MCP
  counts include only connected servers, which contribute context.
- Linked rows use kind icons so agent-created links without avatars remain
  distinguishable as issues or change requests. Identifiers and states keep their
  space while titles truncate.
- On the phone, opening a skill in Files switches drawer tabs without closing the
  drawer. Copy and unlink controls have separate touch targets so a missed copy
  cannot unlink an item.
- Pinned-message selectors retain only pinned text. Selecting the entire parts
  map would redraw on every stream update and retain evicted transcript parts
  through render closures.
- Repository readouts use the Git tab's selected nested repository while
  navigation stays keyed to the project root. Project ownership uses the shared
  worktree-aware resolver because worktrees can sit beside their project.
- Changed-file rows remain hidden through bootstrap and the first successful
  status refresh afterward, because the shared cache can hold setup-file changes
  that the initial reset removes.
- Cost formatting keeps 4 decimal places for budget comparisons and drops trailing
  zeros. Recursive cost walks guard against cycles in parent links, and the own
  cost is derived from total minus child costs so the displayed split adds up.
- Context fill stays neutral below its warning band, because green denotes
  completion. A subagent cost split appears only when subagents exist, when it
  explains spend beyond the displayed session.
- Context fill uses the server-reported total for the latest round trip.
  Breakdown counters accumulate across round trips in a multi-step turn, so
  summing them overstates the current window.
- Row values keep their width while labels truncate, so long names cannot hide
  the reading. Authored names and titles use automatic direction, branches and
  paths use left-to-right direction, and translated labels follow the interface.
  Numeric values retain their own direction in RTL layouts.
- Row actions sit above a stretched, explicitly named row button. Nested buttons
  are invalid, and a control press must not also navigate the row. Disabled
  controls use a wrapper to keep their tooltip reachable despite row pointer
  filtering.
- Dense rows indicate interactivity through text rather than hover fills, which
  resemble selection at this density. Tooltips open above rows so they leave
  subsequent rows and their actions visible.
- A nonzero context meter has a visible dot-sized minimum fill and keeps vertical
  room around its text. Its explanatory captions align with the meter and icon
  edge, because label-column indentation makes them look detached from the bar.
- Task ordering preserves the agent's order within each state rank and retains
  completed tasks as a session record. Active work leads because it answers what
  is happening now.
- Confirmed absence of quota providers creates no ongoing refresh demand after
  discovery. Credential changes invalidate that absence.
- Whole-session token totals remain unavailable when counters are stripped from
  a persisted snapshot or contain only zeros, until live usage arrives.
- Telemetry unions overlapping tool intervals before subtracting tool time, so
  parallel tools cannot subtract the same time twice. TTFT excludes creation
  stamps copied onto parts, because they are not observed first-output times.
  Trailing plumbing records do not move a turn's conversation boundary. Positive
  waits below 50ms remain distinguishable from zero when formatting seconds.
- Quota aliases identify the same billed account. `claude-agent` and
  `claude-code` use the Claude subscription reported by `claude`; `kilocode` and
  `kilo-code` use the Kilo Gateway account reported by `kilo`.
- Built-in section ids stay stable because saved order and visibility use them.
  Hidden-state checks test membership of available sections because stale ids
  from removed sections can inflate a count.
- Subagent permission requests remain visible in the work-status section because
  the parent transcript has no representation of those child blockers.
- Presence reports clear on section unmount, so an absent section cannot keep the
  card visible. Hidden retained cards are inert so keyboard focus cannot reach
  invisible controls.
- Overlay dismissal listeners run only while visible and ignore the header
  toggle, which closes the overlay itself. Otherwise a press can be swallowed or
  close and immediately reopen it.
- The card clips its internal scroll shadows to its rounded edge and hides the
  scrollbar, which would consume trailing-value space. Horizontal margins leave
  room for its shadow, and the overlay stays outside flex flow so it cannot push
  the transcript.

## Decisions

### Why guest meters jump and not glide

Guest meters apply each sample immediately and slide a full-width rounded fill
inside a clipped track. Animating every polled sample keeps the GPU drawing
between reads, while the clipped fill preserves its rounded end without a glide.

### Why charts keep chronological direction and not interface direction

Guest charts run from older samples on the left to newer samples on the right in
every locale. Their own hover labels retain the chart's time and value context,
so a row tooltip attaches to the label when a chart occupies the middle.

### Why unknown guest icons stay absent and not use a substitute

An unknown icon has no reliable visual meaning in the host. The row keeps its
label without introducing a replacement glyph.

### Why glass uses an inner layer and not the shadowed card

The overlay separates its glass layer from the card's shadow because combining
them makes Chromium extend the backdrop-filter layer by the shadow blur and paint
a grey band past the edge. The glass and edge fade independently while the outer
overlay keeps full opacity.

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

Nothing inside `ChatViewport` changed. The virtualizer sees the column shrink
exactly as it already does when the context panel opens.

## Visibility

`useWorkStatusVisibility` hides the panel when any of these hold:

- the user switched it off;
- the layout is mobile (including hosted mobile and Capacitor phone shells);
- the context panel is open for the directory the app is effectively on —
  looked up through `useEffectiveDirectory` and `normalizeContextPanelDirectoryKey`,
  the same key the rail and the panel use. It is deliberately **not** the
  directory this panel reports about: a managed Chat reports about none, and
  that empty key answered "closed" for a context panel that was plainly open;
- the row cannot fit `WORK_STATUS_MIN_CHAT_WIDTH` of transcript alongside
  `WORK_STATUS_PANEL_WIDTH` of panel.

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

### Why the area is taken at the width the sidebar leaves it

The session sidebar does move the chat area, over its own animation. The
decision uses the measured width plus what the sidebar still has to travel
(`sidebarPendingWidth`), re-decided in the commit that toggles the sidebar, so
the answer is the settled one from the first frame. The alternative, the width
as measured, flipped the answer mid-animation: collapsing an expanded context
panel unfolds the sidebar, the card took its column beside the panel while the
area was still wide, and gave it back when the area crossed the threshold, so
the slot animated twice.

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
| Branch, ahead/behind, attention | `useGitStore` directory state | warmed via `runBackgroundNetworkTask(ensureStatus)` and refreshed from Git mutation hints |
| Changed files | `useGitStore` status `files` + `diffStats` | working tree, not session-authored edits |
| PR + checks | `useFreshestPrVisualSummaryForBranch` | **read-only**; follows the freshest remote-keyed entry for the branch |
| Subagents | child sessions from `useAllLiveSessions` (`parentID`) + `useAllSessionStatuses`; per-row cost from `useSubagentCostRollup`'s `perChildCost` (each child's own subtree total, so nested subagent-of-subagent cost rolls up under its immediate parent row) | |
| Subagent blockers | directory `permission` / `question` maps | one subscription covers every child |
| Usage | `components/usage/usageGroups.ts` over `useQuotaStore` | grouping shared with the mobile popover; presentation is not |
| Linked threads | `lib/linkedIssues.ts` over session metadata | written by the flows that attach an issue or PR |
| Turn stats | `telemetry.ts` over `useSessionMessageRecords` | computed only while expanded and authoritatively idle; either rate above 5,000 tok/s is reported as unknown (see the two-rate description below) |
| Goal | `useSessionGoal` | respects the Settings toggle |
| MCP | `useMcpStore` | connect/disconnect reuses the dropdown's actions |
| Pinned messages | `getContextObligatoryMessages` + `state.part` | see below |
| Todos | Canonical `snapshot.todos` and ordered `session.updated` | scoped live state; no second cache |

### Turn stats

The section follows Usage by default and reuses the panel's existing rows. Only its header
has an icon; metric rows use labels and values without leading icons. It starts
folded: its rows took more height than the rest of the card, and the header
line carries two of the figures people scan, joined with ` · `, folded and
open alike, so it fits the card: elapsed time plus cost when the turn cost
something, response speed plus elapsed time when its cost is absent or zero
(a subscription, a local model). Once the user opens or folds it,
`workStatusExpandedSections` keeps that choice. It
reads already-loaded records without fetching history. The newest turn needs a
preceding user message and completed assistant steps. A truncated or unfinished
turn has no whole-turn result; later materialization can supply it.

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

"Average first output" is a separate row from OpenCode's `time.firstToken`
on each step: when the provider streamed its first output of any kind, a tool
call included. It is hidden when any step of the turn lacks the field (steps
written before OpenCode 2.3.0). It does not replace TTFT: a step that opens
with a tool call would change what TTFT means, so the number would no longer
be the time to the first visible text.

Either rate above 5,000 tok/s is reported as unknown. No provider streams that
fast, so such a value means the measured window is broken: a tool that runs
for nearly the whole step leaves a residual of a millisecond, and a text
interval can be equally short. The row is omitted rather than shown wrong.

Metric labels stay short. Every row is a single hover and keyboard-focus target
for a shared tooltip, with a 750ms hover delay and a portal outside the panel's
scroller. Tooltips explain the measurement in every locale. The token row uses
compact input/output arrows; its tooltip gives full counts and explains that
input excludes cached tokens and output includes reasoning across all steps.

Records subscriptions and aggregation stop while collapsed, busy, retrying, or
awaiting status authority. Explicit idle events or a successful directory status
snapshot allow computation. One component-owned committed result keeps the
headline and rows stable during the next active turn. Its identity includes
runtime, normalized directory and session. Scope changes discard it; fresh empty
or reverted records clear it. There is no global message-ID cache. Corrections
to existing message/part identities invalidate the current result.

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

### Pinned messages load only what they need

Pins are most useful on a long session — which is exactly when the pinned
message has scrolled far enough back not to be loaded, leaving the row with a
placeholder. The section materialises the session, but only when a pin actually
resolves to nothing: having pins is not a reason to fetch a session, and
neither is something being unloaded in general.

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

## Section order

The default order is by durability:

1. **Session** (goal, context, cost), **Project** (attention, branch,
   changes, PR, checks), **Usage**, and **Turn stats** (session telemetry:
   throughput, duration, TTFT, cache hit rate) — true for as long as the session
   is open. Usage sits here rather than lower down because a spent quota stops the
   work outright;
2. **Subagents**, **Tasks** — what is happening right now;
3. **MCP**, **Pinned messages**, **Context sources** — supporting material.

The sections dialog has drag handles for changing this order, including hidden
sections. A drop updates the panel immediately. `workStatusSectionOrder` is a
profile preference persisted through the settings registry and the local UI
store. Missing or empty order uses the default; duplicate and obsolete ids are
discarded, and newly introduced sections append in default order, except those listed in `PLACED_AFTER` (`sections.ts`), which go right after their default neighbour: Tasks lands after Subagents in every saved list, where the default puts it. Visibility
changes never alter positions.

Guest SDK status sections remain available through the existing guest catalog
on web/PWA and Electron. Only mobile surfaces keep the catalog unsupported;
the panel and section dialog do not add a separate mobile guest path.

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

Its expanded list is capped at eight two-line rows and scrolls independently,
so a session with many subagents does not crowd every section below it out of
the panel.

## Tasks

The section reads Canonical `snapshot.todos` phases through the shared sync
selector, with explicit session/directory scope. It does not fetch the retired
Host `/api/session-todos` endpoint or maintain a second checklist cache. Empty
ordered updates clear the section. Snapshot recovery and errors use the normal
Canonical sync lifecycle rather than independent todo polling.

Icons and strike-through match the composer's todo dropdown, so one list does
not read as two. Two deliberate differences:

- **Completed items stay.** The dropdown is a queue to work through; this is a
  record of the session.
- **Sorted by status** — in progress, blocked, pending, completed, abandoned — and stable
  within each rank, since the agent's own ordering carries meaning.

Rows truncate at this width, so each carries a delayed tooltip with the full
task text.

Tasks starts expanded and stores its collapsed state under the `tasks` section
id. Collapsed, it keeps the heading and completion count, followed by only the
first `in_progress` task in the agent's order. Without an active task, including
pending-only and all-completed lists, it shows no preview row. Live updates
replace the preview without expanding the section. An authoritative empty todo
list clears the section rather than restoring old persisted tasks. Completed
and abandoned rows remain visible as closed tasks; blocked rows retain their
blocker as a tooltip.

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
| Pull request, Checks | PR surface (`openContextSurface(dir, 'pr')`) |
| Subagent | that child session's chat tab, read-only |
| Subagents heading button | the Subagents panel (`openSubagentsPanel`) |
| Goal (row) | the composer's own `SessionGoalDialog` |
| Goal (pause/resume) | OMP `goal` control through the composer's `SessionGoalDialog` |
| MCP switch | connects/disconnects the server |
| MCP status | the state doubles as the button that reconnects |
| Pinned (pin icon) | unpins the message |
| Pinned (text) | jumps the transcript to that message |

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

Linked GitHub threads first, then skills and MCP counts.

Agents are deliberately absent: an agent is who does the work, not material
loaded into the context. Tools are absent too — `Agent.tools` is a per-agent
override map rather than a registry, so its size would be a number that means
something other than "tools available".

### Linked issues and pull requests

Written by the flows that already attach a thread — the composer's issue/PR
pickers, and session creation from an issue or PR in `NewWorktreeDialog` and
`GitHubIssuePickerDialog`. There is no manual "link this" control: attaching a
thread to the work *is* the act of linking it.

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

These readouts had no loader of their own and appeared only after the user
opened the header's MCP or rate-limit dropdown (both since removed):

- **MCP** — `McpDropdown` was the only mount-time caller of `refresh()`.
- **Usage** — `useQuotaAutoRefresh` schedules the shared fixed three-minute
  refresh; the *first* fetch was performed by the dropdown's open handler.
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
`useQuotaStore.ensureLoadedForRuntime` owns both the readiness rule and the
once-per-instance bookkeeping, so every caller can ask on each connection
change.

### These readouts belong to the connected instance

Same-origin web pages and Electron's Vite proxy initialize a runtime identity
even when the API base is empty. Requests stay relative to the page origin.
Electron dev uses `local`; hosted pages use their HTTP origin. Without this,
the quota loader treats a working proxy as a transient disconnected runtime
and skips the initial load.

Quotas, MCP status, skills, agent memory and the Linear/GitHub logins are all
served by whichever OhPiChamber instance is connected, and each was cached
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
