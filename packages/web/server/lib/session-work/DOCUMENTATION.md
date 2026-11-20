# Session work ("In work")

## Purpose

Eligibility reads current Git worktree pins through `isWorktreeDirectoryPinned`;
pinned worktrees, managed chats and child sessions never trigger classification.

Keeps the sessions the user is working in in one block at the top of the
sidebar until they mark them done. Sending a message puts a session in work;
the user alone closes it. While a session is in work, Jev says after a turn
whether the work looks done; Jev never decides what goes in. Independently of work, the
same call says whether the turn handed over changes worth a look (the
composer then offers an AI review or a walkthrough). The same turn-end Jev call tells session assist whether the
Small Model is worth waking.

## Files

- `questions.js` — the turn-end Jev questions (measured wording, see
  "Measurement"), the thresholds, and the decisions taken from the answers.
- `state.js` — `metadata.openchamber.work` and the merge patches that change
  it. Every patch is decided against the record at write time.
- `runtime.js` — `createSessionWorkRuntime`: `processCanonicalEvent` (a sent
  message, a turn start), `evaluateTurnEnd` (called by session assist), `stop`.

## State

`metadata.openchamber.work`:

- `state`: `open` | `done`
- `openedAt`, `openedBy` (`auto` for a sent message, `user` for Track; `jev`
  on records from when Jev decided)
- `doneAt` once the user closed it
- `suggestDoneAt` while Jev thinks the last turn closed the work out

`metadata.openchamber.reviewOffer`: `{ at }` while Jev thinks the last turn
handed over changes the user could look over. It lives outside `work` so it
needs neither the In work block nor a session in work.

The UI parser is `packages/ui/src/lib/sessionWorkMetadata.ts`; the user's own
Track / Done go through the Host metadata route
(`setSessionWorkState` in `packages/ui/src/sync/session-actions.ts`). Host SQLite
is the metadata authority; execution session metadata is never a fallback.

## Invariants

The Host injects `activity-probe.ts` into turn-end evaluation. It reads the
Canonical session shell snapshot (`/api/agent/v1/sessions/:id/shell/jobs`) and
live subagent roster (`/api/agent/v1/sessions/:id/subagents`, backed by native
`subagents.list`). Only running background shell jobs and non-persisted running
children/descendants count. Foreground shells, ended jobs, unrelated sessions
and persisted roster rows do not establish live activity.

Background evaluation remains tri-state: true when either source proves work is
running, false only when both reads succeed and neither shows work, and null
when activity is unavailable. As upstream, shell jobs count only when started
in this turn and younger than thirty minutes; other asynchronous job kinds and
working children have no such shell window. Proven background work suppresses
Done and next-step suggestions, including when classification fails. Unknown
activity keeps the existing classifier behavior, not a claim that work stopped.
The Canonical shell surface is available; no OpenCode read or synthetic empty
job fallback is used. Other native async work not represented as a Canonical
shell job or live subagent is not currently observable by this probe.

- Jev only opens. Nothing here ever writes `done`.
- Jev reopens a closed session only for a request sent after the user closed
  it (`openByJevPatch` compares the request's `createdAt` with `doneAt`).
- Writes go through `updateSessionMetadata`, which decides the patch inside the
  store's per-session write queue, so a user's Done written a moment earlier
  is seen and kept.
- A turn-end check is bound to its turn: every turn start and new user
  message advances a per-session counter, and a hint is written only if
  the counter is unchanged when the write runs (decided inside the store's
  queue). A late Jev answer about a turn the user already moved past writes
  nothing.
- A turn writes at most one hint: looks done wins over the review offer.
- A hint is current while its time `>= session.time.idle` (the assist's
  freshness rule). This runtime also deletes a hint it wrote when the next
  turn starts; the rule covers hints written by another process.
- Only top-level, unarchived project sessions that are not review sessions,
  `/btw` side questions or scheduled task runs (`openchamber.kind` `review` /
  `btw` / `scheduled`) open or are asked about. A run's marker is set when
  the scheduled-tasks runtime creates the session; a user fork drops it
  (`fork-inheritance.js`, `sessionForkInheritance.ts`), so the fork counts. Managed Chats (under the
  `chatRoots` the server passes in) are plain conversations and never in work.
  Review eligibility reads the injected Host `readMetadata` dependency, not the
  execution session record. An unreadable Host record keeps the gate unknown.
- A known subsession costs nothing: `../session-lineage.js` remembers which
  sessions have a parent (from `session.created` events and from any record
  read anyway), and a known one is skipped before any read or Jev call.
- Each classifier call resolves the session's Host scope first and passes its
  `workspaceId` to `classifierEndpoint`. Missing scope never selects a global
  endpoint. Canonical history pages are chronological and carry Turns;
  `status: 'completed'` establishes a settled answer, not a message timestamp.
- Every failure (no classification provider, Jev error or timeout, an
  unreadable session) leaves state unchanged and returns an unknown gate, so
  session assist runs exactly as it did without Jev.

## When a session opens

A user message was sent (`message.updated`, role user, from the hub's
translation of `session.inbox.enqueued`), with the feature on: a session not
already in work and eligible opens. A message with only files or attached
context counts too; its text is empty. So does a shell command the user ran
from the composer (`session.shell.started`; OpenCode records it as a shell
message and a synthetic result, never as a user message, and only the user
starts one). Each message id is handled once; a session
already in work reads nothing from OpenCode. No Jev: until 2026-10, Jev judged
whether a message started work, and every session now counts instead.

## When Jev is asked

- A user message was sent (canonical `message.created`, role user): only with
  the feature and auto-open on, a usable classification provider in the Host
  workspace, and the session not already in work.
  History is the three settled turns before it (`loadSettledTurns`). Each
  message id is asked about once.
- A turn ended: session assist calls `evaluateTurnEnd` before it arms its quiet
  window. One call carries only the questions that apply: `wrap_up` while in
  work, `review_ready` while the review offer is on, `recap` / `next_step` for
  the assist fields the user has on. No applicable question, no call.
- Jev reads the request's first 1500 characters, the answer's first and last
  500, and three earlier turns cut as routing cuts them.

## Measurement

156 real sessions (93 work, 50 not, 9 housekeeping, 4 neutral) set the wording;
190 older held-out sessions, labelled before looking at answers, checked it.
`wrap_up >= 0.8`
reads the whole turn (a commit, push, merge, sync or release the answer
reports done closes the work); on the held-out sessions it hinted 80 times
across 106 work sessions, 22 of them followed by more edits, and caught 53 of
81 shipping steps. At 0.85 the same wording hinted 70 times (18) and missed a
closing turn whose answer asked the user for a last check (0.82); the earlier
request-only wording at 0.85 hinted 60 times (16) and caught 33.
Growing the answer excerpt from 300+300 to 500+500 left `wrap_up` where it
was (80 hints, 22 followed by edits; 53 of 77 shipping steps).
`review_ready >= 0.7` was set on the 156 sessions and checked on the 190,
against whether the turn ran an edit tool (Jev sees no tools): with looks
done winning it hinted after 271 of 362 edit turns and after 14 of 823 turns
without edits. The lab is `julia-lab/jev-work` (`run-review.mjs`,
`score-held.mjs`) under `~/projects/openchamber-extensions`.
`recap` stayed high (0.86–0.96) after a closing "thanks"/"commit" that followed
real work, because it reads the same three turns the recap does. Do not change
the wording or thresholds without re-running this measurement.

## Settings

- `sessionWorkEnabled`: the block and the actions, default on.
- `sessionWorkAutoOpen`: Jev opens sessions, default on, and is inert without a classification provider.
- `sessionReviewOfferEnabled`: the review offer, default off (Settings → Chat → Session Assistance), and inert without a classification provider.
- `sessionWorkKeepInGroup`: a tracked session also stays under its project group and folders, default off; Recent, Timeline, and Chats still place it once.

Work state lives on the OpenCode record, the single authority every client
reads. A second store for sessions OpenCode refuses would have to be merged
into every read and cleaned up when the folder returns. Archive is already
OpenChamber's own record, works without the folder, and takes the session out
of In work, which is what the user wanted from Done.

## Runtime parity

- Web, desktop, hosted mobile, Capacitor: all of it; the server owns Jev.

## Tests

`state.test.js` (patches, reopen rule, hint lifecycle), `runtime.test.js`
(open on a sent message without Jev, the reopen rule, one handling per
message, ineligible sessions, the combined turn-end
call, the review offer with and without In work and looks done winning over
it, a late answer after the next turn started, never closing, failure as
unknown), plus the gate cases in
`../session-assist/runtime.test.js`, and `updateSessionMetadata` in
`../openchamber-sessions/session-metadata-store.test.js`.
