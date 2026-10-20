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

Keeping one member snapshots each discarded worktree before archive and removal.
Cleanup rechecks native membership, workspace mapping, runtime and the inclusive
workspace session list. An incomplete list or another unarchived session prevents
removal. A failed step leaves that member's worktree and does not stop siblings.
The project root is never removed. No separate persistence or polling is added;
the canonical global session cache retains metadata across reload and switching.

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
