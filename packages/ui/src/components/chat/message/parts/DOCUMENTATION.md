# Chat Message Parts: Rendering Architecture

This folder contains renderers for chat message parts (text, tools, reasoning, placeholders) and shared tool presentation helpers.

Use this doc when you ask an agent to change tool/header/description behavior.

## High-level flow

- Message parts are rendered from `MessageBody.tsx`, which composes `body/` (`useAssistantRenderedParts.tsx` draws the assistant rows).
- There are two tool rendering paths:
  - **Static grouped tools** -> `StaticToolRow` in `ProgressiveGroup.tsx`
  - **Expandable tools** -> `ToolPart.tsx`
- Shared tool icon mapping is centralized in `toolPresentation.tsx` (`getToolIcon`).

## Which file controls what

- `SecretRequestCard.tsx`
  - Native `{ action, input }` arguments are read from the canonical tool part by `pageRenderView`; upstream flat and `parameters` forms remain supported.
  - Renders the memory-only `secret.run` form from canonical calls in `ShownToolCard`. The Host field lookup selects inputs and remembered-field labels; lookup failures remain visible and retry. Only submitted field values and remembered field names go to the Host answer route, never to chat or browser storage.
  - Completion, decline, expiry, unmount, and runtime switching remove the inputs. Transport errors use generic localized messages, never echoed response bodies. File-mode `secret.request` is refusal-only and cannot collect a value.
  - Shared web/PWA, Electron, hosted mobile, and Capacitor surfaces use authenticated `runtimeFetch` against their connected Host; mobile does not execute commands locally.

- `ProgressiveGroup.tsx`
  - Renders grouped Activity rows and grouped static tools.
  - Contains `StaticToolRow`.
  - Contains static tool short description logic (`getToolShortDescription`).
  - Owns compact `read` call navigation. Results always retain an expandable body.

- `ToolPart.tsx`
  - Renders canonical `tool_call` and `tool_result` rows, headers, reported diff counts, errors, images, and output.
  - Restores the original compact animated tool execution row, hover disclosures, duration labels (from authoritative native records only), and live status feedback.
  - Integrates structured diff presentations (`ToolPartDiffPreview.tsx` via `@pierre/diffs`, lazy loaded with Shiki theme integration, unified/split modes, and line metrics) with fallback to `PlainDiffFallback.tsx` when diffs exceed size thresholds (`isToolDiffPreviewOversized`).
  - Opens `ToolOutputDialog.tsx` for deep inspection of full stdout/stderr streams, raw JSON responses via `JsonTreeView`, worker-highlighted code blocks, and dedicated renderers (`../toolRenderers.tsx` for bash, glob, grep, websearch, JSON).
  - `TaskToolSessions` and collapsed `task` headers subscribe to narrow `useSubagentsStore` slices matched by `toolCallId` (hydrating via `hydrateParent` when `details.async.state === 'running'` even while collapsed, falling back to `async_job_result` report statuses and then `details.progress` while the store is empty) rather than a one-shot `listSubagents` fetch; `TaskToolSessions` renders live per-subagent rows with `OpenSubtaskButton`/`openSubagentsPanel` links and suppresses the model-only `Spawned N background agents … proc://` boilerplate lines when structured rows are shown.
  - Desktop opens a read-only context tab; pinned columns reuse `openSession`; mobile selects the child in place.
  - Failed child queries preserve known rows and expose retry.
  - `TurnActivity` and `ProgressiveGroup` thread addressed session/directory through `MemoExpandableToolRow`, whose comparator includes both.
  - Calls and results keep separate `partId` keys and toggle identities. Results borrow input only from the same turn's exact `toolCallId` and tool name; complete turn context survives segmented Activity rendering.
  - Call/result one-line descriptions come from `lib/toolPresentation` (`describeToolCall`/`describeToolResult` over `TOOL_PRESENTATIONS` in `presentations.ts`), not `toolHelpers`. `toolDiffUtils` owns native result paths and numbered edit/ast_edit diff conversion; input text never proves a performed change.
  - `input.i` tool intent surfaces on collapsed rows via `normalizeIntent` (`lib/toolPresentation/intent.ts`) as a fallback/secondary label when a call has no path/command; `formatToolInput` strips `i` so raw JSON dumps never show it.
  - OMP `edit` inputs (`hashline` `[path#TAG]`, `apply_patch` `*** Add/Update/Delete File:`/`*** Move to:`, `sloppy` `*** Edit File:`) resolve target paths through `lib/toolPresentation/editInputPaths.ts` (`parseEditInputPaths`), so running edits show target file(s) and the quick-open button immediately.
  - `bash` results surface `details.async` (`job {jobId} · {state}`) and `details.service` (`service {name} · ready|pid`) badges in `bashSummary` (`presentations.ts`); `find` output parses indented `  path:start-end  score  snippet` lines into clickable `path:line` hits with score badges; `ask` HTML `<form>` outcomes render `{ data, notes, timedOut }` as structured field/answer rows via `askAnswers`; `tts` is registered in `TOOL_PRESENTATIONS`/`groups.ts`.
- `ReadToolGroup.tsx`
  - Groups consecutive `read` calls within a turn into a collapsible tree row with `├── / └──` guides, line ranges, and status icons.
  - Internal URIs (`proc://`, `agent://`) are rendered as clean non-interactive labels to prevent dead clicks.
  - Preserves error outputs on failed reads when expanded.
- `toolPresentation.tsx`
  - Shared icon mapping for tool names (`getToolIcon`).
  - Used by `ProgressiveGroup.tsx` and `ToolPart.tsx`.
  - Takes an optional guest rule (below) whose `icon` wins when the sprite carries it.

- Guest tool presentations (`contributes.tools` in a guest manifest)
  - The Guest SDK catalog is loaded for retained web/PWA and Electron embedded Node Host runtimes. `useGuestToolPresentation(part.toolName)` / `resolveGuestToolPresentation` select an active matching guest rule. Exact matches beat suffix wildcards.
  - Native and custom tool names retain their full identity. No namespace stripping maps a custom tool onto a built-in.
  - Guest rules customize icons and headers. Result headers can use paired input and decoded output together. JSON table output uses decoded native text content; missing/non-tabular data keeps the generic renderer.
  - `GuestToolTable.tsx` draws the table with the same cell classes the markdown decorator gives assistant tables, capped at 200 rows with a count line.
  - Hosted mobile and Capacitor intentionally mark the guest catalog unsupported; their built-in tool rendering remains unchanged. The Guest SDK manifest, catalog parsing, approvals, and web/Electron presentation behavior remain intact.

- `toolRenderUtils.ts`
  - Core classification helpers:
    - `isExpandableTool`
    - `isStaticTool`
    - `isStandaloneTool`
  - If a tool should switch between static vs expandable, change it here.

- `ReasoningPart.tsx`
  - Thinking block UI (`ReasoningTimelineBlock`), summary + optional duration.
  - Live reasoning displays throttled partial paragraphs, so an expanded trace does not stay empty until a paragraph finishes. The 100 ms throttle limits updates; assistant answer text retains its block-level reveal.
  - The collapsed header keeps up to 400 characters of the summary in the DOM; CSS truncates at the real row width. A per-row measured character budget was rejected because a ResizeObserver per row would re-render the chat on every frame of a sidebar animation, the cost `useWorkStatusVisibility` records.
  - Presentation titles accept inline content. `TimelineNoticeCard.tsx` uses this for completed compactions, appending the recorded `providerID/id` in the description color (also on empty-summary rows). Attribution comes from the stored compaction message or `session.compaction.ended`, never the current session selection. Running, failed, and older model-less compactions have no attribution. `TimelineNoticeCard` also renders `async_job_result` delivery cards (subagent/job result) with a link to open the child session or `SubagentsPanel`. Custom presentation headers can shrink and wrap long identifiers; ordinary thinking rows retain their existing layout.

- `reasoningText.ts`
  - `cleanReasoningText`, the one reasoning text normalization shared by `ReasoningPart.tsx` and `JustificationBlock.tsx`.

- `components/LiveTurnActivity.tsx` (relative to the chat folder)
  - Owns the optional live-only turn disclosure. `MessageList` enables it when
    Activity Default is Collapsed and the turn has visible Activity content.
  - `components/LiveActivityCollapse.tsx` owns the finite height transition;
    `components/liveActivityContext.ts` scopes the final message's non-text
    disclosure without changing sorted message context or tool rendering.
  - `lib/turns/liveActivity.ts` owns final-answer and interruption boundaries.
  - `lib/turns/liveActivitySummary.ts` derives the report from tool results.

- `JustificationBlock.tsx`
  - Justification block wrapper over `ReasoningTimelineBlock`.

## Current important behavior

### Optional live history disclosure

Activity Default is shared by the settings UI in both render modes. In live
mode, Expanded preserves the original timeline without a turn disclosure.
Collapsed adds one Activity header after completion or interruption while preserving the original live rows,
their order, and their individual controls. It adds no tool subgroups, side
line, height cap, or inner scroller. Sorted rendering keeps its existing path
and its own per-turn expansion state.

The active turn stays open without an Activity header. A final assistant message with `finish: stop`
collapses the earlier messages and the final message's non-text parts, keeping
the answer and its existing footer outside. Intermediate-text summary fallback
and compaction summaries never become final answers. An older turn without a
final answer collapses once a later visible turn has an assistant response;
a queued user message alone is not enough. Hidden user continuations retain
the visible-turn mapping established by `projectTurnRecords`.

Manual expansion survives later metadata updates and timeline virtualization
within the session. The disclosure uses a finite 180ms height transition,
respects reduced motion, and delegates end pinning to the existing timeline.
It never calls scroll-to-bottom. Collapsed history does not mount its hidden
message bodies; initial history loads do not animate collapse.
Layout-effect replay after a Suspense hide/reveal must settle the requested
height and retained children even when the expanded target did not change.
Cleanup stops the animation, so a same-target early return can leave a cached
pre-collapse height on the DOM indefinitely. Failed animations also settle;
callbacks from cancelled, superseded animations never settle a newer target.

The virtualizer also adds temporary end padding while compensating prepended
history. The Bun patch for `@legendapp/list@3.3.10` stores that padding's CSSOM
read-back value: Chromium rounds fractional pixel strings, so comparing the
original input with `style.paddingBottom` can skip cleanup permanently. This
leaves a phantom tail even when every Activity region is already zero-height.
The patch covers both web entry points in ESM and CJS; its installed-controller
regression tests live in `scripts/legend-list-padding.test.mjs`. Retain this
fix when updating the dependency unless upstream has equivalent ownership and
cleanup behavior. Chat padding and scroll policies do not compensate for it.

The header retains its report when expanded and has no hover background. Its
left inset matches sorted Activity. Diff deletions use the ASCII hyphen.
The header reports five categories: changed files, codebase
exploration, commands, web research, and subagents. Narrow chat columns only
show file changes. Exploration and research are flags, not synthetic counts.
Subagents count distinct child session IDs; commands count calls, not shell
subcommands. Unknown tools and administrative tools stay in the disclosure
without a guessed summary category.

File statistics come exclusively from successful edit/write/patch tool
results, not user-message summary diffs or the current workspace Git diff.
Unique normalized paths determine file count; renames preserve identities.
Line totals sum performed edits, including lines later removed by another
call. Per-file patches/counts take precedence over a whole-call patch; the two
representations are never added together. Missing or truncated diffs suppress
the line total rather than presenting a partial total as complete. Write input
content is not evidence of added lines. Repeated records of one call count once.

The completed-turn file pills under the final answer (the "show changed files"
setting) use the same tool-result file identities, in first-touch order, with
paths relative to the message's project root. The user message's
`summary.diffs` is a working-tree snapshot between turn start and end, so it
also lists edits made by other sessions or by hand in the same directory; it
never decides which files belong to the turn on its own. It supplies a touched
file's line counts, because those match the turn diff a pill opens; a file the
snapshot does not list falls back to its tool patch and renders as a plain
chip, since the turn diff has nothing to open for it. A file with no
recoverable counts, or a snapshot entry without line changes, shows its name
alone. One exception: edits delegated to `task` subagents live in child
sessions the projection cannot see, so when a turn ran subagents the snapshot
entries no own tool call touched are appended after the turn's own files. The
list is projected once the last assistant message finished with `stop`, so no
tool patch is parsed while the turn streams.

### Why a write row prefers a reported diff to its input preview

A `write` row draws the call's content as a diff preview because the native
tool reports no diff. A plugin that replaces the file tools reports one for the
same call, and the row drew both, so one file's changes appeared twice.
`carriesFileDiffs('write')` answers which tools *produce* per-file diffs, not
which may show one, so the row's gate reads the result's own entries instead of
that predicate. The reported diff wins because it is the only source with
deletions when an existing file is overwritten, and because
`resolveToolQuickOpenTarget` already resolves the row's line from the same
entry. The preview hides only when the result branch actually draws that
patch: an extension's output rule that replaces the result, or metadata whose
diff text is no usable patch (the plain-text fallback entry), keeps the
preview, while a valid patch shown as plain text because of its size still
counts when it carries a hunk header; a long diagnostic in the diff field does
not. Gating the result-diff branch back to edit and patch reopens the
duplicate; `ToolPart.write-row-diff.test.tsx` pins the completed, running,
native, unusable-patch and long-diagnostic cases.

### Message parts

- Assistant markdown treats raw HTML as inert visible text. The final generated
  HTML is sanitized as defense in depth, with script and style elements
  forbidden, so message content cannot inject active DOM or application-wide
  CSS into any retained runtime surface. Safe custom application links,
  including external `vscode://` links, go through the app-link confirmation
  flow in web/PWA, Electron, hosted mobile, and Capacitor renderers.
- Session links to the current instance open in place in all retained
  renderers. Mobile keeps file-reference annotation disabled entirely,
  including filesystem stat probes; web/PWA and Electron retain the normal
  annotation limits and directory-scoped file navigation.
- User text parts carry typed session mention identities when captured at send. The shared plain and Markdown renderers use those identities for chips in live events and reloaded history; links without a captured identity remain ordinary links.
- Final assistant Markdown rendering is independent from image gallery
  extraction: gallery presence never changes the chat body. Assistant image
  syntax consistently renders as a shared image icon followed by its filename,
  without loading the image in the body; tool and simple Markdown retain normal
  inline image rendering. The gallery separately collects embedded and
  workspace-local PNG/JPEG/GIF/WebP candidates into one 100px thumbnail gallery
  in the message-completion area after all message text and above the turn's
  changed files. HTTP(S) images remain intentional links rather than loading
  remote tracking images as thumbnails. Each muted filename caption includes
  the shared image-file icon. Embedded and local images are limited to 10 MiB
  and validated as PNG/JPEG/GIF/WebP. Chat Markdown uses
  the assistant image-label policy without gallery-specific link rewriting,
  completion-state switching, or hidden placeholders. A
  completed assistant message hydrates at most 12 unique image candidates,
  including persisted Canonical text parts.
  In retained web/PWA, Electron embedded Node Host, hosted mobile, and
  Capacitor runtimes, a gallery approaching the viewport prepares all local
  candidates through the host's message-scoped grant route, then reuses the
  authenticated `/api/fs/raw` asset route. Each URL loads only when its
  thumbnail approaches the viewport. No renderer uses a workspace filesystem
  bridge for message images. Mounted historical messages therefore do not
  eagerly read every image.
  Gallery clicks do not introduce or alter preview chrome: desktop and mobile
  both reuse the pre-existing attachment image preview overlay.
  Workspace-external images receive the existing path-bound `outsideFileGrant`
  only when the host verifies the exact source in the owning assistant
  message and the real file is inside the host's dedicated temporary directory.
- Native `read` calls are **static navigation tools** and render via `StaticToolRow`. Their results are separate expandable rows, preserving output, errors, and image attachments.
- Subagent actions reuse the active pinned or embedded chat column when one
  owns navigation. Otherwise mobile navigates to the child session in place;
  web/PWA and Electron open its read-only chat in the context panel. File
  navigation in the dedicated mobile app stages the existing file focus and
  opens its Files pane, while desktop/web keeps context-file navigation.
- Every other native or custom tool is expandable and renders through `ToolPart`; unknown tools expose their complete structured input and result rather than guessed tool-specific metadata.
- The native SDK result envelope is `{ content, details }`. Text blocks render as output, supported embedded raster image blocks render as attachments, and structured details remain inspectable. Unknown blocks remain visible as JSON instead of being dropped.
- JSON output switches between tree and raw display per row. Collapsed rows do not parse/highlight their output body.
- Native edit result diffs use numbered compact lines (`+12|`, `-12|`, ` 12|`). `toolDiffUtils.getToolDiffs` converts successful reported results into unified patches and counts. Tool rows show bounded plain-text patches; separate diff popup actions retain the unified/split renderer. Native write input content does not imply added-line totals.
- Native `bash` command input and terminal text output remain visible. Final result text normalizes ANSI terminal controls with a bounded synthetic-cell budget; there is no legacy mutable-state/metadata output fallback.
- A tool result made of `{type:"text",text}` content blocks is shown as its joined text, not as a JSON envelope the reader has to open. `toolRenderers.unwrapTextBlocks` validates blocks one at a time and unwraps up to four nested serialized envelopes; `nativeToolResultContent` applies it before generic coercion, and the JSON summary view uses it too.
- Thinking/Justification duration is hidden in `sorted` mode (handled in `ReasoningPart.tsx` + `JustificationBlock.tsx`).
- Reasoning streaming presentation derives from the `streaming` live phase only: canonical reasoning parts carry no persisted timing, so a cached part outside that phase renders complete and never streams (issue #2020).
- `reasoningText.ts` owns reasoning normalization for both `ReasoningPart.tsx` and `JustificationBlock.tsx`; there is no second copy. `cleanReasoningText` normalizes CRLF/CR line endings, preserves paragraph breaks (OMP folds provider summary parts with `\n\n`; blank-line suppression had merged a multi-paragraph thought into one running paragraph), keeps genuinely empty lines, turns an invisible-only line (zero-width space and the like) into an empty line instead of deleting it, collapses runs of blank lines to one, and strips a leading `> ` marker. Only whole-line empty HTML comment sentinels are dropped — `<!-- -->` alone on a line, plus an unterminated `<!--` on the last line while streaming — and that rule, like fence detection, is scoped to fenced code only: indented code blocks are ordinary text, and a sentinel sharing its line with prose is left intact. Fenced content is kept verbatim apart from de-quoting: a fence opened inside a blockquote keeps its body's `> ` markers removed along with the opener's, and a backtick opener whose info string contains a backtick is prose, not a fence (CommonMark). The header summary (`stripMarkdown`/`getReasoningSummary`) keeps its own flat single-line wording.
- Single newlines render as line breaks in the reasoning variant only, through the in-repo remark line-break plugin that `MarkdownRenderer` wires for `variant='reasoning'`; assistant and user text rendering are unchanged (user text already applies hard line breaks in `userTextPartContent.ts`).
- Streamed assistant and reasoning text holds back only a still-growing GFM table row (`lib/streamTextCommit.ts`, a port of OMP's `holdPartialTableRow`): the unterminated last line when a run of pipe lines with a header and delimiter row sits above it, outside an open fence. Everything else — a paragraph, a list item, an open fence — appends as it arrives, so the first token shows immediately and thinking streams live while expanded. `AssistantTextPart` and `ReasoningPart` share the one function. The throttle in `hooks/useStreamingTextThrottle.ts` passes streaming text straight through without a second per-part throttle, keeping its identity reset, while the event pipeline flushes at 33 ms.
- Tool result placement: the canonical projection puts a `tool_result` part in the message that made its `tool_call`, at partId `<call-part>:result`, and publishes partial output as `part.updated` while the call still runs. The timeline renders that part beside its call with no client-side pairing, and the live tail overlays a message's live parts over its record without moving parts between messages. Popup inspection (`ChatMessage.handleShowPopup`) preserves non-image output content so `ToolOutputDialog` displays structured diffs and text output.

## Changing native tool descriptions

1. Update the actual native input grammar in `lib/toolPresentation/presentations.ts` (`TOOL_PRESENTATIONS` `describeCall`/`describeResult`).
2. Keep compact `read` navigation and path display in `ProgressiveGroup.tsx`.
3. Keep expandable output/error/attachment behavior in `ToolPart.tsx` and native result decoding in `../toolRenderers.tsx`.
4. Keep icons in `toolPresentation.tsx` and native reported diffs in `toolDiffUtils.ts`.

Descriptions must not invent protocol metadata, aliases, or a successful mutation from call input.


## "I want tool to become expandable" (example)

1. Update `toolRenderUtils.ts`:
   - add/remove a tool name from `STATIC_TOOL_NAMES` only when it has a reliable direct in-app navigation action
2. Ensure `ToolPart.tsx` supports desired header + expanded output format for that tool.
3. Validate both modes (`sorted` and `live`).

## Safe editing checklist

- Do not duplicate icon logic; keep it in `toolPresentation.tsx`.
- For static tool copy changes, prefer `ProgressiveGroup.tsx` first.
- For expanded output changes, edit `ToolPart.tsx` (expanded sections live there; `toolRow/` only retains `OpenSubtaskButton.tsx`).
- After edits run:
  - `bun run type-check`
  - `bun run lint`
  - `bun run build`

## Quick map of files in this folder

- Text: `AssistantTextPart.tsx`, `UserTextPart.tsx`. `UserTextPart` owns the
  user side: it sniffs legacy pre-metadata messages (`<terminal_context>`
  blocks, `GitHub issue context (JSON)` and `Linear issue context (JSON)`
  prefixes) and shows them as context cards. Canonical parts carry the context
  prompt text itself instead of structured metadata (`lib/messages/contextParts.ts`
  owns the send-time builder and the read-back parser), and linked GitHub/Linear
  references render through `lib/linkedIssues.ts` from the composer, work-status
  and sidebar owners. Context cards and linked issue links are retained on
  mobile; phone shells open their URLs rather than relying on a desktop side
  panel, and custom schemes still use confirmation.
  Transcript preview helpers use native `Part.content` and attachment names;
  terminal-only previews reuse the same terminal parser as `UserTextPart`.
  Local composer metadata is formatted before canonical capture, not added to
  transcript parts. Raw context-sidebar rows share `rawMessagePreview.ts`
  rather than maintaining a second part-label/snippet implementation. Token
  extraction reads `Message.usage.totalTokens` only, with no legacy part-token
  fallback. The unused legacy freshness singleton and background-shell part
  adapter have been removed; native tool rows own shell presentation.
  `ToolOutputDialog` receives decoded native output text/language, explicit
  unified patch text (`isDiff`), or typed image/mermaid preview data. It does
  not inspect legacy tool metadata, tool input aliases, or read-output
  envelopes. Generic JSON output still opens the JSON tree; native patch
  popups retain unified/split mode. Image galleries, attachment previews,
  and Mermaid source loading use their dedicated typed payloads unchanged.
- Attachments: `MessageFilesDisplay` accepts native `Part[]` and a required
  workspace binding derived from the addressed canonical session, never the
  active chat column. Only `attachment` parts render. Image thumbnails and
  galleries read upload bytes through `canonicalClient.readAttachment`;
  text/JSON previews decode native Blobs, and full PDF previews retain their
  media type. Upload URIs never become guessed Host paths or legacy data URLs.
  Read failures remain visible failures rather than empty successful previews.
  Object URLs are view-owned and revoked when replaced, removed, or switched
  to another workspace/runtime; stale asynchronous reads cannot reopen a popup.
  Runtime parity uses the same authenticated Host operation:
  - Web: shared Canonical Client and Blob/object URL presentation.
  - Electron: shared Canonical Client against the selected Host.
  - Hosted mobile: active Host via shared runtime transport.
  - Capacitor: active Host via shared runtime transport.
- Tools: `ToolPart.tsx`, `ProgressiveGroup.tsx`, `toolPresentation.tsx`, `toolRenderUtils.ts`, `ToolRevealOnMount.tsx`, `GuestToolTable.tsx`
- Reasoning/justification: `ReasoningPart.tsx`, `JustificationBlock.tsx`, `reasoningText.ts`
- Status/placeholders: `WorkingPlaceholder.tsx`, `SessionActiveSpinner.tsx`, `MigratingPart.tsx`, `BusyDots.tsx`
- Utility renderers: `MinDurationShineText.tsx`
