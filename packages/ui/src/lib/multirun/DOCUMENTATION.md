# Canonical multi-run membership and fusion

## Authority and runtime surfaces

`@openchamber/agent-contract` owns native session, message, history, selection,
attachment and multi-run metadata schemas. `identity.ts` interprets that contract;
it does not maintain an SDK-shaped adapter or a parallel metadata schema.
Each launcher invocation gets a UUID group identity. Prompt groups retain their
`g1`, `g2` names, and members carry their role and owning `sessionID`. Provider
and model identifiers stored in the membership marker retain the contract's
`providerID` / `modelID` spelling; launch selections use native `providerId` /
`modelId`. Display names are not identifiers.

Web/PWA and Electron use the same `canonicalClient` singleton and captured
session actions through the active Host. Hosted mobile and Capacitor use that
same remote canonical contract through their existing controls; no new mobile
launcher or fusion control is added here. Git, filesystem and worktree operations
remain Host APIs: they are not alternate agent engines or configuration readers.

A marker belongs only to its matching native session ID. Copied, pending,
malformed and future markers are ineligible and never fall back to a convincing
title. Metadata is not an access grant; requests use the active canonical runtime.
Workspace directories come from the registered workspace mapping, not a session
path or model field invented on the native record.

## Creation and delivery

`createSession.ts` resolves a native workspace, creates a pending marker with
`sessionID: null`, then sends a wrapped metadata merge patch containing the full
ID-bound marker. Registration and dispatch happen only after the returned
metadata confirms ownership. Merge patches preserve unrelated metadata and Host
extensions, including goals; no replace-object metadata update is used.

A binding failure deletes only the new, undispatched session when still in the
captured runtime. Worktrees remain because setup may have written files. Creation
isolates per-lane failures, reports their count and retains successful siblings.
Runtime changes stop later requests, publication and delivery; cleanup never
moves into another runtime. A pending session is not an eligible member.

Model, variant, reasoning effort and agent ID are captured before asynchronous
setup. Native attachments remain attached to their prompt variant. Lane and
fusion primary prompts use the shared worker-owned combined command/template
expansion once, without catalog lookups or renderer argument parsing. Matched
native model and agent bindings override the captured values; variant and
reasoning effort remain captured. A no-match preserves the raw prompt. Expansion
failure or a stale runtime/directory owner prevents dispatch, never falls back to
the original invocation. Generated context and source transcripts remain literal.
Dispatch reads standing session knowledge and sends a native `PromptRequest`
through `sendMessage`; it does not re-read mutable composer selection after setup.
Knowledge is reported delivered only after guarded send completion. Isolated
worktree creation retains the existing setup/wait ordering.

Before sending either a lane or a fusion run, `observation.ts` uses the existing
canonical message loader to materialize its snapshot and attach replay-backed
observation. An absent loader or failed materialization prevents delivery.
Automatic fusion requires a lane observed running and then explicitly observed
`completed`, `failed` or `cancelled`; absent outcomes never count as terminal.

Added comparison lanes retain the source session's captured agent profile.
Attachments require an explicit source workspace (`attachmentWorkspaceId` for
the launcher). `attachments.ts` reads admitted bytes through the canonical Host
endpoint, uploads them into each distinct destination workspace, and sends only
the new destination-owned references. Same-workspace references remain valid;
scope checks are never relaxed and failures remain isolated to their lane.

## History, overview and fusion

Native history pages are chronological. First-prompt reads continue until a user
message is found; comparison reads the model of that original turn, not the latest
snapshot. Final reply reads traverse every cursor, preserve the last nonempty
assistant text, and separately retain the newest turn's failed/cancelled outcome.
Branch or runtime changes invalidate reads. Failed reads are not empty answers.
Native attachments, message usage costs and turn completion timestamps drive the
overview's files, costs and elapsed time. Summary caches use runtime, session
epoch and head sequence; stale completions cannot overwrite a newer request.

`fusion.ts` authoritatively lists each selected source in its workspace and
rechecks group membership before reading current output. Read failures stop
fusion rather than silently dropping a source. Successfully empty sources are
omitted; no nonempty output means no result session. Results preserve group
identity with role `fusion`, so another fusion can start from the result without
using it as a source. Prompt budgets, private worktree snapshots, shared versus
isolated mode and source exclusions remain unchanged.

## Mutation and cleanup

Renaming reads current native metadata and patches a full updated membership
marker, preserving unrelated fields; each member's failure is isolated. Detaching
atomically clears the marker and changes the title, leaving the workspace alone.
Archive and cancellation continue to use the existing scoped session actions.
Metadata responses publish through `installSessionMetadata`; new native records
use `installHostSession`. Their revision-aware merge and mutation revision retain
newer runtime heads, metadata and archive state while discovery is in flight.

Keeping one member snapshots each discarded worktree before archive and removal. A member of a project opened on a folder of its repository runs in that folder of its worktree (`<worktree>/ai`). `memberLocation.locateRunMember` finds the checkout that holds the member's directory and never answers a checkout that holds a registered project: git lists the primary checkout `repo` among the worktrees of the project `repo/ai`, and removing it would remove the project.
Cleanup rechecks native membership, workspace mapping, runtime and the inclusive
workspace session list. An incomplete list or another unarchived session prevents
removal. A failed step leaves that member's worktree and does not stop siblings.
The project root is never removed. No separate persistence or polling is added;
the canonical global session cache retains metadata across reload and switching.
# Multi-run membership, runs and fusion
A multi-run ("Run in parallel" in the UI) is one prompt, or several prompt
variants, sent to several models at once. Each lane is its own session, usually
in its own worktree. The UI treats the lanes as one run: one sidebar row, one
overview screen, one header tab.
## Authority
`identity.ts` owns the version-1 `session.metadata.openchamber.multirun` contract.
Each launch gets a UUID group identity; its prompt variants keep their `g1`,
`g2` names (`runGroup`, shown as A, B). Provider/model IDs and display labels
are data, not keys. Members carry a `run` or `fusion` role and their owning
`sessionID`. Optional fields: `title` (the run's display title) and
`autoFusion` (judge model plus the launching page id). Older markers lack them
and stay valid; a missing title falls back to the group slug.
OpenCode copies metadata when forking, sometimes without a `parentID`. A marker
belongs only to the matching session ID. A copied, pending, malformed or future
marker is ineligible and never falls back to a title. Metadata is not an access
grant; all reads, writes and deletions still go through the authenticated SDK
and OpenChamber server routes.
`createSession.ts` creates a pending marker with `sessionID: null`, then binds
the server-assigned ID with a second write. Callers register and dispatch only
after the returned metadata confirms binding. OpenCode 2.x accepts `metadata`
only at creation, so the binding write goes to OpenChamber's own metadata route
(`/api/openchamber/sessions/:id/metadata`, see `sync/session-archive-batch.ts`).
That route applies an RFC 7386 merge patch, so only the marker travels and
whatever another feature stored under `openchamber` in the meantime survives.
Renaming a run patches `multirun.title` alone on every member; a member whose
write fails keeps the old title and is reported.
The run's model and agent are set on the session at creation (`selection`),
because v2 pins a session to a model instead of taking one per prompt.
A failed binding attempts to delete only that newly created session. Worktrees
are retained because setup may already have written files. A lane, added lane
or code fusion whose new worktree never populated has nothing in it; that
worktree and its branch are removed (`resolveCreatedWorktreeStartDirectory`)
and the lane counts as failed. Successful siblings
remain usable and creation reports the failed count. Runtime changes stop later
requests, registration and dispatch.
## Runs
`runs.ts` derives runs from active root sessions: `buildMultiRunIndex` groups
by identity key and keeps groups with at least two active members. Archived
sessions never form or join a run, so after "Keep" the survivor is an ordinary
session again without any stored "resolved" state. Parsed identities are cached
per session object (records are replaced on update), so the index can be
rebuilt on every session-list change. Lanes sort by variant then creation;
fusions come first.
Consumers: the sidebar row model and mobile sheet (see the sidebar
DOCUMENTATION), the overview (`useMultiRun`), the header title
(`useMultiRunTitle`) and the header tabs (`useMultiRunMemberIds`: the lanes of a
run share one tab, `useSessionTabsStore.ensureTab` reuses the slot). The last
two read the global cache through primitive selectors because they are always
mounted.
## Launching
The composer's parallel mode (`components/chat/composer/parallel/`) and the
overview's "Ask another model" launch lanes; `useMultiRunStore.createMultiRun`
creates them and `dispatchRunPrompt` sends each lane its prompt with the
project's session knowledge. The Auto routing model is never a lane.
With `goal` set, `dispatchRunPrompt` writes the lane's own goal before its
prompt, the order of an ordinary send. A lane whose goal cannot be written is
not sent and shows as not started. A rejected prompt clears the goal again: with
no turn to audit the server would keep it active, and the lane would stay
working and hold auto-fusion. "Ask another model" adds plain lanes.
`runActions.askOtherModels` turns a chat into a run by writing membership onto
it and adding lanes that re-send its first prompt; it refuses any turn but the
first, because new lanes would start without the conversation that followed.
Launching is desktop, web and VS Code only; mobile shows runs but does not
launch them.
## Keep
Lane work is normally uncommitted: agents do not commit, so a lane's branch
still points at its start commit and `git worktree remove --force` would
destroy the work. `keep.keepRunMember` therefore, for every member other than
the kept one:
1. revalidates membership against the server record;
2. snapshots its worktree (`snapshotGitWorktree`, see the git service
   DOCUMENTATION) into `refs/openchamber/runs/<group>/<session>`: tracked,
   staged, unstaged and untracked-but-not-ignored files, with the real index,
   HEAD and branch untouched;
3. archives its chat;
4. removes its worktree and local branch, unless another active chat still
   lives there.
A member of a project opened on a folder of its repository runs in that folder
of its worktree (`<worktree>/ai`). `memberLocation.locateRunMember` finds the
checkout that holds the member's directory and never answers a checkout that
holds a registered project: git lists the primary checkout `repo` among the
worktrees of the project `repo/ai`, and removing it would remove the project.
OpenCode lists sessions by exact directory, so step 4 asks both the worktree
root and the member's folder for other active chats.
A failed step stops cleanup for that member only and leaves its worktree in
place; the result reports it. The project root is never removed. Snapshot refs
stay until someone deletes them; cleaning them up is not implemented.
## Fusion
`fusion.startRunFusion` fuses the selected finished lanes, across variants.
Sources are revalidated and their latest replies read; a read failure stops the
fusion instead of silently dropping a source, an unanswered lane is left out,
and no answer at all is `NoFusionOutputsError`.
- **Answers mode** (a source shares a directory, or nothing changed): the
  fusion session runs in the project directory and receives the task prompts
  and final answers.
- **Code mode** (every source has a worktree and at least one changed files):
  every source is snapshotted, the fusion gets its own worktree (a fresh `<slug>/fusion-<suffix>` branch) at the lanes'
  starting commit, and receives a manifest: task, final
  answer, change counts and snapshot commit per lane. Diffs are inlined only
  when they fit a tenth of the judge's context window (`shouldInlineDiffs`);
  otherwise the judge reads them with git, as the editable magic prompt
  `session.fusion.codeInstructions` tells it.
Fusion results keep the group identity with role `fusion`, so they join the run
as its first card. `autoFusion.ts` starts the configured fusion exactly once, on
the page that launched the run (`RUN_LAUNCHER_ID`), when every lane was seen
running on this page and has since left the live busy set with an outcome,
with no running subagent below it and no active goal. An active goal idles
between turns with an outcome already recorded, so only its settling (complete,
blocked, paused, out of budget) ends the lane. The descendant check uses the same merged
session map as run membership, so it covers nested children across directories.
An idle lane with a running descendant must record a newer `time.idle` before
it can finish, so a gap between the child settling and the parent resuming
cannot start fusion with the earlier outcome. The completion timestamp also
covers a parent resumption that starts and finishes within one UI update.
The status reducer's synchronous transition subscription records a lane's wait
before the next event in a batch can settle its child. A busy transition clears
that wait for the resumed parent, even if its next completion shares the batch.
Persisted history never counts as finished; another client, or the launcher
after a reload, fuses from the overview instead.
### Why automatic fusion waits for descendants
A parent can report idle with an outcome while a background subagent still
runs, then resume to incorporate its result. Checking the parent's status
alone would send its preliminary answer to fusion. The shared live subagent
check keeps automatic fusion pending through that pause.
## Overview
`components/multirun/RunOverview.tsx` is a main-area surface
(`useUIStore.runOverviewKey`), closed by selecting any session. Cards are not
selectable: "Keep this" sits on each finished card of an isolated run, and
cards turn into checkboxes only while fusion sources are chosen. "Add a model"
sits in the header (per variant section when there are several). Each card can
also archive just that member, or leave the run: `runActions.detachFromRun`
deletes the membership marker with a `null` merge patch and renames the lane to
the run title, so it is an ordinary session in its own directory or worktree.
A run left with one active member stops being a run on its own.
Each card's state comes from `laneStatus.resolveLaneStatus`, over live and
recorded facts only: a pending permission or question (the global blocking
index) wins over busy, then the live busy set or an active goal, then OpenCode's recorded outcome
(`failed`, `interrupted` as stopped), a lane that never ended a turn, and a
normal end with or without answer text. A normal end is grey, never green: it
says the turn ended, not that the work is good; an unread dot marks replies
the user has not opened. A lane with a goal shows the sidebar's goal mark beside
its name, coloured by the goal's status, so a blocked goal reads as blocked on a
card whose turn ended normally. A failed card shows the error recorded on the newest
assistant message (`laneData.loadLaneLastTurn`) or says to open the chat. The
header counts lanes per state, and the bottom bar names lanes waiting for the
user, because they block the run and auto-fusion. Each variant's prompt is one
line until "Show all" expands it into a bounded scrollable block. Cards read each
member's latest reply and worktree changes once per finished turn
(`useLaneSummaries`); a read failure is shown as unavailable, never as an empty
reply or zero changes. Web, desktop and VS Code mount it over the chat; mobile
mounts it in `MobileApp` with its own back button and without "Add a model",
in one card column; while it is open the mobile header names the run and hides
the session metadata button.
## Mobile lists
`MobileSessionsSheet` builds its own lists instead of the sidebar row model, so
each one collapses runs itself: the grouped tree and Recent (`MobileRunRow`) and
the timeline (`TimelineEntry` of kind `run`, `MobileTimelineRows`) put one run
row at the first lane's position, with the lanes' combined activity. Search
results and the header switcher list lanes as sessions.

## Legacy sessions

Unmarked sessions use `title.ts` solely to recognize existing titles, including
embedded model slashes, prompt groups, duplicate indices and empty-group segments.
Legacy groups are scoped to the native project identity, not a host absolute path.
A new fusion retains that opaque legacy scope without rewriting source sessions.
Native and legacy groups never join merely because their labels match.

Old titles ending in `/2` or `/fusion` remain inherently ambiguous. Their previous
suffix interpretation is preserved; guessed membership is never written back.
Legacy names may still collide or stop being recognized after a rename. Only new
ID-bound records provide exact membership.

## Focused regression coverage

Owner tests cover schema-backed identity round trips, pending/copy rejection,
ID-bound creation and cleanup, captured model options, sibling failures, runtime
switch guards, worktree setup ordering, chronological history beyond 100 pages,
attachment preservation, original-turn model selection, branch changes, native
usage and failed/cancelled turns. The parent runs these with the migration's
combined type/build verification after all owners finish.
