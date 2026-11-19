# Message search

Full-text search is derived Host data over canonical conversations. It does
not read an OpenCode database, client, event envelope or configuration file.

## What is indexed

Settled user messages and agent replies on the selected branch of root
sessions are indexed. Tool output, system context, subagent conversations and
active assistant text stay out. Reasoning is opt-in
(`messageSearchReasoningEnabled`), uses a separate row linked to its assistant
message, and is removed when disabled. A user's trailing terminal-context
attachment is stripped before indexing.

## On by default

Search is on unless `messageSearchEnabled` (instance scope, `settings.json`)
is `false` (`isMessageSearchEnabled` in `settings/settings-helpers.js`). A
settings file that never mentions the key belongs to a user who never chose
and gets the default; an explicit `false` is a choice and stays. The settings
response always carries the resolved value, because the client keeps its own
copy of the switch and has to follow the server's: without that a client that
remembered the old default would show the switch off while the server indexed.
The client's own default stays off until the Host settings arrive. Off means no index file is opened, no
event is looked at, no backfill runs, the route answers 503, and the UI shows
no message search (no Cmd+P group, Cmd+F left alone).

### Why on by default and not opt-in

It was opt-in so that indexing cost nothing on weak hardware unless asked for
(maintainer decision, 2026-10-01). Since conversation search came to the
sidebar and Archive, message text is half of what a search finds, and a user
who never opened Settings got the weaker search without knowing why
(maintainer decision, 2026-11-12). The cost that worried us is bounded: the
backfill starts from the newest sessions, pauses between pages, and never
blocks the event loop for long; the index is about 90 KB per conversation and
its size shows under the switch, with Rebuild beside it. Reasoning stays
opt-in, since it can make the index several times bigger.

The runtime reads the setting at startup; `persistSettings` calls
`setEnabled` when the key changes. Switching off stops the indexer (after the
session being read finishes), closes the file and keeps it. Switching on
opens it and walks the session list, which re-reads every session changed
while search was off and drops deleted ones. Start, stop and delete run one
after another in the order asked. The status endpoint waits for that queue,
so it answers with the state a switch or delete just asked for produced, not
the one before it. Shutdown waits for in-flight session reads and lifecycle
overlays before the file closes under them.

## Ownership

- `sqlite.ts` opens built-in Node/Electron or Bun SQLite. Without either,
  the runtime reports unsupported and search responds 503.
- `store.ts` owns `<dataDir>/message-search.sqlite`, its session/message
  tables, and a trigram FTS5 index. Schema 5 replaces incompatible derived
  caches atomically; a failed schema rebuild rolls back the previous file.
  It does not restore retired per-role OpenCode cursor APIs.
- `indexer.ts` reads canonical session snapshots and paginated selected-branch
  history through the Host session service. Directory filters use the
  registered Host scope's absolute cwd, not a public display path.
- `runtime.ts` owns enablement, reasoning, subscriptions, queries, file size
  and rebuilds. Every query projects current Host archive metadata into the
  cache. An absent record means active only after a complete metadata read.
  Record errors leave that session's lifecycle unknown without blocking
  complete unrelated records. Incomplete reads suppress totals and expose
  `errors` and `archiveError`; a failed archive read fails the query.
- `routes.ts` validates HTTP filters and awaits query results. Agent execution
  remains behind the canonical `/api/agent/v1` boundary.

The cache is disposable. Its `-wal` and `-shm` files count toward size and
are removed with it. Prepared statements are cached per SQL string to keep
preparation out of backfill loops. SQLite's native column values remain
native; snippet construction requires a string body.

## Keeping in step

Canonical run/turn completion queues a debounced session sync; session updates
queue another read, and authoritative session deletion drops the cache row.
Reconnect walks the canonical session list. Failed entity reads do not remove
other complete sessions, and a failed listing is not treated as an empty list.

A sync stages the selected branch's complete history before committing.
Malformed pages, changed snapshots, interrupted pagination and failed commits
retain the previous searchable selection. A successful empty selection removes
old messages. The indexer checks the snapshot and live revision before commit
so an older read cannot overwrite a newer branch or deletion. Reasoning
enablement is checked during processing and at commit.

## Queries

Hits carry the message id; pages are cut by row id, since a reply and its
reasoning share a message. Every word of the query must occur; words shorter than three characters cannot
be looked up and are left out, and a query made only of them answers
`query-too-short` rather than everything. Newest first by default; `before`
pages by creation time with the message id breaking ties, so pages never
repeat or skip. Snippets mark matches with U+E000 / U+E001 and are plain text.
The markers are private-use characters, which ordinary text cannot contain,
and they are not markup, so a snippet is never rendered as HTML. A snippet is
cut in JS rather than by FTS5's `snippet()`, because that counts trigrams and
cuts a hit to a few characters. Where lowercasing changes a string's length
(rare scripts), offsets would drift, so that text is returned unmarked.
The grouped endpoint filters lifecycle, directory and role before grouping. It
uses the newest matching row per session as its representative and counts
distinct message ids, so a reply and its reasoning produce one match count.
Archive state that is still unknown appears only in the `all` lifecycle. Its
repeatable `exclude` parameter accepts at most 200 session ids. Excluded
sessions remain hits but leave the first page's totals and directory counts.
The grouped page walks the chronological message index, chooses each session's
globally newest filtered match, and applies the cursor to those representatives.
It stops after `limit + 1` distinct sessions. A second indexed lookup counts
matching messages only for the selected sessions. Totals inspect at most 20,000
matching rows and return `null` when they reach that cap.

### Why a snippet centres on the longest term

In "git rebase" the rare term says more than a short one that also matches
inside "github", so the window is centred on the longest query term. The cut
is then extended to whole words at both edges.

## HTTP

`GET /api/openchamber/message-search` takes `q` (every word must occur, each
three characters or more), `session` (only this session), repeatable
`directory`, `role` (`user`, `assistant` or `reasoning`), `lifecycle`
(`active`, `archived` or `all`), `reasoning=0` (leave reasoning hits out while
the reader hides them), `order` (`desc`, newest first, or `asc`), `before`
(a previous answer's `next`, `<createdAt>:<id>`) and `limit` (1..200, default
20). It answers `{ status: 'ok', hits, next, index, errors, archiveError }` or
`{ status: 'query-too-short', hits: [] }`, and 503 when no index runs: search
is off, or this server has no SQLite.

`GET .../message-search/sessions` groups hits by session. It requires `q` and
takes the same `directory`, `role`, `reasoning`, `lifecycle` and `before`,
plus `exclude` (up to 200 session ids left out of the first page's totals and
directory counts) and `limit` (1..100, default 20). Its `next` is
`<createdAt>:<sessionId>`, and it answers `{ status, hits, next, totals, index, errors, archiveError }`.

`GET .../message-search/status` answers
`{ state: 'unsupported' | 'off' | 'on' | 'failed', sizeBytes, index }`.
`DELETE .../message-search/index` deletes the file and answers the status
afterwards; while search is on a new one starts at once.

Repeated query keys arrive as arrays, so every field accepts the shape it may
take.
