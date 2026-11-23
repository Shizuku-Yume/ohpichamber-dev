# Browser Control Broker

## Purpose

This module carries agent browser actions from the server to the client that
owns the in-app browser view, and the result back. The browser lives in a
renderer, not in the server process, so the server can never act on a page
itself; it can only ask and wait.

## Boundaries

- `broker.js` owns request lifetime: it publishes one action through the
  injected `emitRequest`, holds the pending request, and settles it on a client
  result, a timeout, or an abort signal. It knows nothing about transports.
- `routes.js` is the result callback (`POST /api/browser-control/result`). It
  validates the envelope and hands the outcome to the broker.
- `uploads.js` decides which files `browser.upload` may send and holds them
  under a short-lived token for the client that attaches them
  (`GET /api/browser-control/uploads/:token/:index`).
  The runtime shares one upload store between this route and the control
  service. Uploads read only the calling session's folder, including realpath
  checks; model-supplied directory overrides cannot widen that grant. The route
  remains behind normal Host authentication and returns uncached bytes.
- `../../index.js` supplies `emitRequest`, which writes the request to the
  OpenChamber SSE clients and returns how many were reached. The event carries
  the same `context` (`directory`, `sessionId`, each `null` when unknown) the
  extension provider receives, so the in-app browser knows which session asked.
- `provider.js` sits between the control service and the broker. It reads
  the `browserProvider` setting on every action: `builtin` goes to the broker;
  an extension id goes to that extension's service (`contributes.service.provides`
  includes `browser`) as `POST /browser-control` on its loopback through
  `../guests/service.js`, with the open/action timeouts, the response cap, and
  the idle stop from `ohpichamber-sdk`. The body also carries `context`
  (`directory`, `sessionId`, each `null` when unknown): the project and chat the
  tool call came from, threaded from the plugin (`contextDirectory`,
  `contextSessionId`) through the control service; the model never types it.
  The answer is parsed with
  `browserProviderResultSchema`; `ok: false` becomes the agent's error, any
  other status or shape is reported as unknown page state. A selected extension
  that cannot serve (`isBrowserProviderGuest`: enabled, fully approved, has the
  role) resets the setting to `builtin`, emits
  `openchamber:browser-provider-reset`, and runs the action in-app. A settings
  or catalog read that fails is not that: the action fails with 503, nothing
  runs anywhere, and the choice stays, because a read error says nothing
  about the extension and an action must never land in a browser the user
  did not pick. `REQUEST_FAILED` (sent, no answer) is reported to the agent
  as "may or may not have run, read the page first", never as unchanged.
  `handleGuestDeactivated` does the same reset when the guest routes pause,
  remove, or withdraw approval from the selected extension.
  When the extension also shows a shared surface (`../guests/surface.js`),
  an action is refused with 409 while the user holds the surface, and every
  action that runs is reported as agent activity so the panel says "Agent is
  working".
- `preferred-client.js` names the window an action goes to when several
  could serve it: the connection, among those opened with `browser=1`, whose
  window reported input last over `POST /api/browser-control/active`. Each change is broadcast to those
  connections as `openchamber:browser-control-preferred`, and every request
  carries the current value as `preferredConnectionId`, null when the
  preferred connection has closed or nobody has reported. The client half is
  `packages/ui/src/lib/browser/preferredClient.ts`: a window reports its first
  click or key press while another connection is preferred. A window that was
  preferred reports again when its stream reconnects, naming its old
  connection as `previousConnectionId`, and the server hands the preference
  back only if no other window took it meanwhile, since a disconnected window
  missed that broadcast. A window that took it counts even after its own
  stream closed: the hand-back is refused, nobody is preferred, and the next
  click or key press in any window takes the preference. A failed report is
  retried on the next input, except a 404 or 405: a server without the route
  is asked once per connection, never once per key press. An answer that a
  broadcast overtook is ignored, and so is an answer for a connection that has
  since closed. Input that arrives while the window's own report is still out
  is reported once that report settles, if the window is still not preferred. A
  reloaded window starts unpreferred: the page keeps no record of its old
  connection, so its next click or key press takes the preference back.
- `../openchamber-control/service.js` is the only caller. It maps the
  `browser.*` actions of the `openchamber_web` tool onto the router's
  `request()` (same signature as the broker) and owns their parameter
  validation.
- The client half is `packages/ui/src/lib/browser/controlClient.ts`. Every
  mounted browser tab registers its pane under its context-panel tab id, with
  its project and the session whose agent opened it (`ownerSessionId` on the
  tab, null for the user's own). An action with `tabId` runs in that tab,
  whoever opened it. Without one it runs in the calling session's tab: the
  shown tab if it is the session's, else the one the session last opened or
  worked in, else its newest. A session with no tab of its own gets the browser
  tab the user last had in front of them (`setShownBrowserTab`, set by
  `ContextPanel` with the project on screen) only when that tab is the user's
  and in the session's project, and claims it only after a short delay, so a
  client that holds the session's own tab wins the claim; otherwise the agent
  is told so, with the tabs it could name. A request with no session keeps the
  earlier rule within the project on screen: the shown tab, else that
  project's newest tab. An action never switches the user to the tab it acts in.
  `browser.open` without `tabId` never navigates an existing tab: the
  registered opener (`ContextPanel`, `useUIStore.openAgentBrowserTab`) makes a
  new background tab in the calling session's project, owned by that session,
  and the answer carries its `tabId`. `browser.close` removes a tab the calling
  session opened. Closing is panel state rather than a page action, so the
  panel registers a closer the way it registers the opener; without `tabId`
  the session closes its own most recent tab, and a tab the user or another
  session opened is refused, never closed, even when an action without `tabId`
  would otherwise have used it. A close with no calling session, which the
  `POST /api/openchamber/control` route can produce, owns no tab and is
  refused outright: a null session must not match an unowned (the user's) tab.
  When the named tab is gone, a client with the panel mounted answers
  "no such tab" after the claim delay rather than leaving the agent to time out.

## Annotation overlay

The user's annotation (`annotationOverlay.ts`, driven by `annotationSession.ts`
and `BrowserPane`) runs through the same desktop driver, in an isolated world
of its own per session (`annotate` in `browser-panel-driver.mjs`). Its comment
box takes dictation: the overlay asks the app for the microphone through a
`Runtime.addBinding` function scoped to that world's name, and the app answers
through `annotationSend`; `annotationMessage` is the app's long poll for the
overlay's requests. A desktop app without the driver, or a page the debugger
cannot attach to, runs the overlay in the page's own world, without a
microphone. Annotation of a page shown in a frame (`useFrameAnnotation`) has
no isolated world and no microphone either.

### Why an isolated world and not `webview.executeJavaScript`

In the page's own world every script of the page can call whatever the overlay
calls, so a page could start the app's microphone and read the transcript
from the comment box. A binding exposed to an isolated world is a function the
page has no reference to and no way to call. `Runtime` is enabled only while a
session runs, since it streams every console call of the page, and each
session's world has a new name so a binding removed at the end cannot linger
in a world the next session reuses. A `postMessage` or console channel from
the page's world was rejected for the same reason: any page script can forge
it. Polling the isolated world for the overlay's requests would avoid
enabling `Runtime`, but adds latency to every button and polls for the whole
session. The mic sits in the comment box, where the user types; a mic button
in the app's toolbar would be safe too, but away from the comment and without
the dictation shortcut inside the page.

### Why a PDF gets an input layer

Chromium draws a PDF in a viewer frame of its own: pointer and key input over
it never reaches the document the overlay lives in, so marks could not be
drawn. A transparent layer over the viewer takes the input for the session.
The wheel still scrolls the PDF: Chromium routes it to the viewer past the
layer. A PDF has no elements to pick, so the overlay offers Region and Draw
only.

### Why a stroke is drawn as short paths

Rewriting one path's `d` on every pointer move costs time with the stroke's
length, and a long stroke stalled the pointer. The stroke is a group of paths
of at most 64 points, each starting where the last ended, so a move rewrites
only the last one.

## Running the panel's code

The agent tool reaches the panel of the app the agent works from, so a change
to `BrowserPane`, `controlClient`, `pageActions`, `pageDriver` or the desktop
driver shows there only after that
app is rebuilt. Run it in `electron:dev` instead and send the actions to that
instance's API port, the one its log prints after `OpenChamber server
listening on`; the route has no session, so name the tab after the open:

```sh
curl -s -X POST http://127.0.0.1:<api-port>/api/openchamber/control \
  -H 'content-type: application/json' \
  -d '{"action":"browser.open","input":{"url":"http://localhost:<ui-port>/mobile.html","viewport":"mobile"},"contextDirectory":"<repo>"}'
```

`browser.capture`, `browser.snapshot` and the rest take `{"tabId": "<tabId from the open>"}`
in `input`. The tab stays in the background, as an agent's does, and the page
inside it is a `webview` target on the instance's debugging port for reading
what the actions alone do not show (frame rate, animations).

Which window claims needs no Electron. Against `bun run dev`, a web tab of the
UI plays one window, and a short Node script plays a desktop window: it reads
`GET /api/openchamber/events?browser=1`, posts its `connectionId` to
`/api/browser-control/active`, and on each `openchamber:browser-control-request`
claims after a delay and posts a result. The `browser.open` answer then says
who served it: the script's own data, or `drivable: false` from the web tab.

## Invariants

- Capability belongs to the connection, not to configuration. A client declares
  it can drive a page by opening its event stream with `browser=1`, which only
  a Chromium host does; the flag lives and dies with that connection, so there
  is no setting to enable and no restart to remember.
- `emitRequest` counts only clients that can serve the action. `browser.open`
  needs any client, because opening a tab is what creates a view; every other
  action needs a declared-capable one.
- Exactly one client performs a request. The broadcast reaches everyone who
  could serve it, so a client claims the request over
  `POST /api/browser-control/claim` and acts only if granted; the first claim
  wins and every other client does nothing. Deciding by whose result arrives
  first would be too late, because by then each of them has already clicked.
  A claim for a settled request is refused for the same reason.
- What every window could serve goes to the window the user is at. A
  `browser.open` without `tabId`, or an action on the user's tab, is claimed
  at once by the preferred window; the others wait
  `PREFERRED_CLIENT_HEAD_START_MS` (`controlClient.ts`) and claim only if it
  did not. An action on a session's own tab claims at once wherever the user
  is, because that tab lives in one window. A window with no tab for the
  session waits out the head start before saying so, the preferred one too,
  so a window that holds the user's tab and deferred to it can still answer.
  With no preferred window the first claim wins, as before.
- Only a window that can drive a page becomes the preferred one. A browser
  tab never reports, and the route refuses a connection without `browser=1`,
  so a tab that can only display a page never wins a `browser.open` over a
  desktop window that has reported.
- Nobody listening is answered immediately with a 503 describing the
  environment, never by blocking for the full timeout. A blocked wait followed
  by a timeout cannot be told apart from a page that hung.
- A client that accepted a request and then disappeared still times out.
  Assuming success would report a page interaction that never happened.
- A result for an unknown request id is accepted with `matched: false`, not an
  error: a client answering after the timeout has behaved correctly.
- The result route parses its own body. This server has no global body parser,
  and a missing one silently turns every answer into an agent-visible timeout.
- Request payload limits are sized for a page snapshot (visible text plus every
  interactive element), not for a control message.
- The provider path never trusts the setting alone: the extension is
  re-checked against the catalog on every action, and the grant list handed to
  the service proxy is the catalog's effective list, so a version that widened
  its permissions is refused until re-approved.
- `isBrowserProviderGuest` mirrors what the Settings dropdown offers: enabled,
  fully approved, and declaring the browser role. Full approval implies the
  `service` grant, so the check does not look at it separately.
- `browserProvider` is sanitized when written (trimmed, a non-empty string), so
  this module only has to decide builtin or not.
- A caller without a scope (tests, the CLI) is unknown, not empty: its
  `directory` and `sessionId` reach the provider as null, and nothing invents
  them.
- Agent-facing failure text is written for the model that reads it, not the
  user: it states what happened and whether the page changed, and leaves the
  decision to the agent instead of naming a step only the user could take.
- The provider's answer shapes are the desktop panel's own
  (`packages/sdk/src/service-providers.ts`); `browser.capture` still returns
  `base64`/`mime` and the control service writes the file, so the agent sees
  the same result whoever took the picture.
