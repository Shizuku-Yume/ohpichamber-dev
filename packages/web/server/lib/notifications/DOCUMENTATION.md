# Notifications Module Documentation

## Purpose
This module provides notification message preparation utilities for the web server runtime, including text truncation and plain-text normalization for system notifications.

## Entrypoints and structure
- `packages/web/server/lib/notifications/index.js`: public entrypoint imported by `packages/web/server/index.js`.
- `packages/web/server/lib/notifications/routes.js`: route registration for push, visibility, and session status endpoints.
- `packages/web/server/lib/notifications/emit-route.js`: the plugin notification route (`POST /api/notifications/emit`) and its emitter (`createPluginNotificationEmitter`, built in `packages/web/server/index.js`). Registered from `bootstrap-runtime.js`; validates title/body/tag/session/directory, rate-limits to 10 per 10 s per process, respects `nativeNotificationsEnabled`, and sends one desktop + UI notification with `kind: 'plugin'` (`requireHidden`, `showWhenFocused`).
- `packages/web/server/lib/notifications/push-runtime.js`: push subscription persistence, VAPID initialization, and UI visibility runtime.
- `packages/web/server/lib/notifications/apns-runtime.js`: native APNs/FCM token persistence and delivery. Relay mode signs requests through the shared host `relayKeyStore`; it does not create a signing keypair in notification settings. Direct APNs delivery uses ES256 and HTTP/2 when `OPENCHAMBER_PUSH_RELAY_DISABLED=true`. Native delivery is not gated on UI visibility; iOS suppresses foreground banners. A registered device `pushKey` seals notification text, while legacy registrations receive generic text. See `APNS.md`.
- `packages/web/server/lib/notifications/push-seal.js`: end-to-end sealing of native push text. A phone that registers with a `pushKey` (32 bytes, base64; made by the iOS shell in the App Group, by Android's `PushSealKey`) gets each notification as the generic scenario title, an empty body and `data.enc` = `v1.` + base64(nonce || AES-256-GCM ciphertext || tag) of `{ title, body }`. Each such device is its own relay send. The iOS Notification Service Extension and Android's `SealedPushMessagingService` open it; the relay sends a sealed push to Android as a data message (openchamber-website `apps/api/src/lib/fcm.ts`) so that service runs in the background. The sealed text is richer than the clear one: `runtime.js` passes `sealed` = the session name as title and what happened as body (the agent's reply; `Question:`, `Wants to run:` / `Wants to edit:` / `Wants permission:`, `Error:` or the goal title before the detail). The detail goes through the 250-character message cap before the prefix is added. When there is no such text, the phone opens the generic text. Phones without a key keep getting the generic text in the clear. Enterprise mode sends no `sealed` text and strips the session name, so the phone shows only the scenario title.
- `packages/web/server/lib/notifications/session-key.js`: the key both push stores group registrations under, a `sha256:` hash of the UI session token, never the token. Files written before the hashing are rewritten with hashed keys on first read. Both stores are written `0600`.
- `packages/web/server/lib/notifications/emitter-runtime.js`: desktop/stdout + UI SSE notification emission runtime.
- `packages/web/server/lib/notifications/runtime.js`: trigger runtime for canonical OMP session events (run completion/failure, approvals, questions) with debouncing, subtask/goal suppression and push fanout.
- `packages/web/server/lib/notifications/template-runtime.js`: notification template variables and session text/title enrichment over the canonical session service, including the session's project, worktree, branch and Host title.
- `packages/web/server/lib/notifications/template-locales.js`: the notification text OpenChamber writes itself, per interface language. An empty template field means "no custom text", so the notification uses these defaults. The server keeps its own list because it cannot import `packages/ui`; an unknown tag falls back to English.
- `packages/web/server/lib/notifications/message.js`: helper implementation module.
- `packages/web/server/lib/notifications/message.test.js`: unit tests for notification message helpers.

## Plugin notification route
`registerNotificationEmitRoutes(app, { express, emitter })` owns exactly one route,
`POST /api/notifications/emit`. The emitter is created in `packages/web/server/index.js`
(`createPluginNotificationEmitter`) from the same desktop/UI emitters the trigger
runtime uses, so plugin notifications behave like native ones and are not a second
delivery path.

## Public exports

### Notifications API (re-exported from message.js)
- `truncateNotificationText(text, maxLength)`: Truncates text to specified max length, appending `...` if truncated.
- `prepareNotificationLastMessage({ message, settings })`: Prepares the last message for notification display by normalizing and truncating text.

### Route registration API (routes.js)
- `registerNotificationRoutes(app, dependencies)`: Registers notification-owned endpoints:
  - `GET /api/push/vapid-public-key`
  - `POST /api/push/subscribe`
  - `DELETE /api/push/subscribe`
  - `POST /api/push/apns-token` (native iOS APNs device-token registration)
  - `DELETE /api/push/apns-token`
  - `POST /api/push/visibility`
  - `GET /api/push/visibility`
  - `GET /api/notifications/stream`
  - `GET /api/session-activity`
  - `GET /api/sessions/snapshot`
  - `GET /api/sessions/status`
  - `GET /api/sessions/:id/status`
  - `POST /api/sessions/:id/view` and `POST /api/sessions/:id/message-sent`: only reset the native push badge. Whether a session is unread is the Host session projection's own read state.

### Trigger runtime API (runtime.js)
- `createNotificationTriggerRuntime(dependencies)`: creates runtime-owned debounced trigger handling for canonical session events.
- Returned API: `processCanonicalEvent(event, scope)`, `setAutoAcceptSession`, `setGetIsWindowFocused`, `setGetIsSessionAutoAccepting`, `clearPendingPushBadge`, `sendGoalSettlePush`, `invalidateSession`, `stop`.
- Owns:
  - run completion/failure, approval and question trigger routing with a 500 ms debounce and a resolution cancel; permission requests already auto-accepted by the session or an ancestor are suppressed
  - authoritative OMP `SessionMode` lookup on terminal runs; active goal turns suppress ordinary ready notices, and complete/budget-limited goals emit one final goal notification
  - subtask suppression (`notifyOnSubtasks`) and a live-child check, plus goal-driven completion suppression
  - template resolution and fallback: an empty field in `settings.notificationTemplates` resolves to the language default from `template-locales.js`, so notification text follows `settings.locale` unless the user wrote their own
  - native notification fanout and web push payload fanout
  - push suppression while any fresh UI visibility heartbeat reports a focused client
  - sealed phone text: the fanout forwards `sealed = { title, body }` (localized event text, redacted like the clear body) to APNs for devices with a `pushKey`; enterprise mode drops it, as it drops the clear body

### Extension notification channels (extension-channels.js, channel-accounts.js, channel-routes.js)

An installed extension whose service provides `notifications` (SDK `contributes.notifications`) is a delivery channel next to the desktop and the phone. `createExtensionNotificationChannels` owns which channels exist, their accounts and the delivery; `index.js` builds one, hands its `deliver` to `createNotificationTriggerRuntime` as `deliverToExtensionChannels`, and passes it to `feature-routes-runtime.js`, which registers the routes, reconciles it at start and from the guest activation and deactivation listeners.

- The catalog is the authority (`isNotificationChannelGuest`: enabled, fully approved with an effective `service` grant, the role and a parsed contribution). Approving the extension and connecting an account is the switch; pausing it is the off; nothing on the Notifications page refers to a channel. `reconcile()` runs serialized and revokes the handles of a guest that left.
- Accounts are OpenChamber's: one per channel in `{dataDir}/notification-channels.json` (`0o600`, temp file and rename, writes chained per file; a corrupt file is an error, never a disconnected channel). The token leaves the store only to mint a handle. `connect` probes a typed instance (`auth.probe`), verifies the token through the service (`auth.verify`, the handle carries the candidate token) and stores what the server said the account is; connecting again replaces the account. A `user` instance is an https origin or http on this machine; `fixed` is the contribution's origin. A `basic` username must be one the handle minter can send (`isProviderUsername`), refused as 400 `USERNAME_INVALID` before any call. When an update moves a `fixed` channel's server, `reconcile` writes the account off (`invalidReason: 'instance-changed'`) and `deliver` sends nothing to it: the token was given for the old server, and the card asks the user to connect again.
- Every call to the service carries a fresh handle from `../source-control/outbound-handles.js`, bound to the account's origin and token, served on `/notifications/outbound` by the callback listener; the service never holds a token. A `status: 401` writes the account off only when the proxy saw the server answer 401 through that handle; the card then says the account needs attention, and the channel is skipped until the user connects again.
- `deliver({ notification, requireHidden })` is called by `runtime.js` (`sendToChannels`) beside `fanoutPush`, after the kind's toggle, the debounces and the subagent, goal and auto-review suppressions, with the text push gets: in enterprise mode the kind's generic title (`message.js` `genericNotificationTitle`), no body, no session name, no directory, since the channel's server is outside the boundary. The channel rechecks enterprise mode immediately before forwarding, so a policy enabled during a queued call strips that call's content too. The module applies the visibility gate itself (`isAnyUiVisible`, unless `notificationMode` is `always`): the Electron focus gate the desktop branch reads does not exist on web. Delivery is at most once; a failed `notify` is warned once a minute per channel and never retried. Nothing here logs a notification's text.
- Routes: `GET /api/notifications/channels`, `PUT /api/notifications/channels/:providerId/account` (`{ token, username?, instance? }`), `DELETE /api/notifications/channels/:providerId/account`; failures are `{ error, code }` with the module's status (404 `CHANNEL_UNKNOWN`, 400 `TOKEN_REQUIRED` / `USERNAME_REQUIRED` / `USERNAME_INVALID` / `INSTANCE_REQUIRED` / `UNSUPPORTED_INSTANCE`, 401 `TOKEN_REFUSED`, 409 `CONNECT_SUPERSEDED`, 503 `CHANNEL_UNAVAILABLE` / `CHANNEL_BUSY`, 502 `MALFORMED_PROVIDER_RESPONSE`). No answer carries a token.

#### Why account changes use compare-and-set

A Connect captures a per-channel operation identity before verification. Disconnect invalidates that identity even when no account exists, and the store checks it under its write lock before committing. Each stored connection also has a random revision, so a delayed invalidation compares the original account under the same lock and cannot mark a replacement invalid. Older records without a revision remain readable and acquire one on their next connection.

#### Why calls share a bounded channel queue

The SDK promises one notification-role call at a time, including authentication. Each channel serializes at most 200 outstanding calls; newer notifications are dropped with a rate-limited warning and Connect receives a busy error. Deactivation aborts the channel's active request, drops queued calls and revokes handles. Queued notifications recheck visibility and read the current account when their call starts.

#### Why the channel's accounts have their own store and not the source-control auth store

That store models forge users (an integer `id`, `origin#id` identities, Git transport credentials) in `source-control-auth.json`, and a package providing both roles would share one `ext-<id>` section. A channel's account is a string id with one token; a store of its own keeps the shapes honest and removal independent.

#### Why delivery is gated on `isAnyUiVisible` here and not on the trigger runtime's focus check

The desktop branches read `getIsWindowFocused`, which only the Electron shell sets; on web the gate lives inside `fanoutPush` (`isAnyInteractiveClientVisible`) and inside web push (`requireNoSse`). A channel hooked after `fanoutPush` would therefore deliver on web while the user reads the answer. The module reads the push runtime's visibility itself, so a channel behaves like push on every runtime.

### Revoked and expired clients (client-push-access.js)

A registration made with a paired client's token sits under `clientSessionKeyFor(id)`. Two things keep notifications off a client that is no longer valid:

- Revoking a client, and clearing revoked clients from the list, removes the client's devices from both stores (`removeDevicesOfClients`). A failure while revoking is a log line, because the revocation is already written and the settings page acts on its success. The send check below still skips the client's own key, but a device also registered under another key keeps receiving through it until the client is cleared. Clearing removes the devices before the rows go, so a failure there keeps the rows, answers with an error the settings page shows, and can be retried.
- Every send skips the keys of revoked and expired clients in the list (`invalidSessionKeys`). When the list cannot be read the send fails with a log line and nothing goes out.

A valid client's device, a cookie session's device, and a phone that pairs again after being revoked keep or regain their notifications. The phone app registers again each time it connects with a token the server accepts. A browser subscribes only from the switch on the Notifications page, so a browser removed along with a revoked client gets no web push until that switch is turned off and on.

A registration whose client row is gone cannot be stopped. Its key is a hash of an id that no longer exists, and it looks exactly like a cookie session's key, so the send has to deliver to it. That covers a row an older build cleared, and a row replaced by pairing again when the phone's registration under the new client never reached the server. A client revoked by an older build whose device is also registered under a cookie session keeps delivering through that key until the client is cleared from the list.

A server with no UI password accepts requests without any credential, so a revoked token does not lock the phone out: its next registration succeeds as a new cookie session and notifications resume. Revocation on such a server does not cut the device's API access either, and that is `../ui-auth`'s to change.

#### Why a device leaves every key and not only the client's own

Sends deduplicate by device, so a phone that signed in with a cookie session before it paired would keep receiving through the older key. A key of another valid client stays: that pairing still authenticates, and removing its entry would silence a valid device until its next launch. A cookie session's key cannot be told from a stale one, so it goes; a phone whose cookie session is still valid registers again when it next connects, and a browser through its Notifications switch.

#### Why a send fails when the client list cannot be read

Delivery is at most once already (`APNS.md`, *When the relay cannot be reached*), and an unreadable list must not read as "nobody was revoked". One lost notification with a log line costs less than a revoked phone getting the text.

#### Why nothing is unbound on the relay

The relay has no route for it, and sends only ever start from this server's list, so removing the local record stops delivery. The token stays bound to this server, which is what lets the same phone register again after it pairs.

### Push runtime API (push-runtime.js)
- `createPushRuntime(dependencies)`: creates runtime for web push and UI visibility state.
- Returned API:
  - `getOrCreateVapidKeys()`
  - `ensurePushInitialized()`
  - `setPushInitialized(value)`
  - `addOrUpdatePushSubscription(uiSessionToken, subscription, userAgent)`
  - `removePushSubscription(uiSessionToken, endpoint)`
  - `removePushDevicesOfSessions(sessionKeys, keep)`
  - `sendPushToAllUiSessions(payload, options?)`
  - `updateUiVisibility(token, visible)`
  - `isAnyUiVisible()`
  - `isUiVisible(token)`

### APNs runtime API (apns-runtime.js)
- `createApnsRuntime(dependencies)` creates native APNs/device-token persistence and delivery. It receives `fsPromises`, `path`, `crypto`, `http2`, `APNS_TOKENS_FILE_PATH`, `readSettingsFromDiskMigrated`, and the host-owned `relayKeyStore`. Push and private relay share that signing store and server identity; do not create a separate key in notification settings.
- Returned API:
  - `addOrUpdateApnsToken(uiSessionToken, deviceToken, userAgent, platform, environment, pushKey?)` persists the registration and binds a newly seen token on the relay. `environment` is `sandbox` or `production`, defaulting to production for older registrations. A valid 32-byte base64 `pushKey` enables AES-256-GCM sealing; invalid keys are discarded, keeping legacy unsealed delivery.
  - `removeApnsToken(uiSessionToken, deviceToken)`
  - `removeApnsTokenFromAllSessions(deviceToken)`
  - `removeApnsDevicesOfSessions(sessionKeys, keep)`
  - `sendApnsToAllUiSessions(payload)` — `payload.sealed` (`{ title, body }`, optional) is what a phone with a push key opens; it is never sent in the clear. Signs + sends to all registered tokens (no UI-visibility gate; iOS suppresses the foreground banner). No-ops with a single warning when APNs is unconfigured. Drops tokens on `410` / `BadDeviceToken` / `Unregistered`. Relay sends run in parallel, each limited to 15 s and sent once more only when the request never left this machine, since the relay does not deduplicate (`APNS.md`, *When the relay cannot be reached*).
  - `resolveApnsConfig()`
- Configuration (env first, then `settings.apnsConfig`): `OPENCHAMBER_APNS_KEY_ID`, `OPENCHAMBER_APNS_TEAM_ID`, `OPENCHAMBER_APNS_P8` (PEM contents; literal `\n` accepted) or `OPENCHAMBER_APNS_P8_PATH`, `OPENCHAMBER_APNS_BUNDLE_ID` (default `com.openchamber.app`), `OPENCHAMBER_APNS_ENVIRONMENT` (optional override forcing every send to `sandbox` or `production`; when unset, each token is delivered to the environment it registered with, defaulting to `production` for tokens without one).

### Emitter runtime API (emitter-runtime.js)
- `createNotificationEmitterRuntime(dependencies)`: creates runtime for unified notification emission channels.
- Returned API:
   - `writeSseEvent(res, payload, serializedPayload?)`, where broadcast callers may share one JSON encoding across recipients
  - `emitDesktopNotification(payload)`
  - `broadcastUiNotification(payload)`

### Template runtime API (template-runtime.js)
- `createNotificationTemplateRuntime(dependencies)`: creates shared notification/template runtime. Model-backed summarization was retired after the Zen provider became unavailable.
- Requires `sessionService` (with `open` and `history` methods) and `resolveSessionScope(sessionId)`. OMP owns the session title, and each template build reads the canonical title from the session snapshot. A strict read failure propagates to the trigger runtime's existing generic notification fallback.
- Returned API:
  - `resolveNotificationTemplate(template, variables)`
  - `shouldApplyResolvedTemplateMessage(template, resolved, variables)`
  - `fetchFreeZenModels()` compatibility stub returning `[]`
  - `resolveZenModel(override)` compatibility stub preserving stored values without validation
  - `validateZenModelAtStartup()` compatibility no-op
  - `summarizeText(text, targetLength, zenModel)` compatibility stub returning local fallback text
  - `extractLastMessageText(payload, maxLength?)`
  - `fetchLastAssistantMessageText(sessionId, messageId, maxLength?, source?)`
  - `buildTemplateVariables(event, sessionId, scope)`: reads the canonical snapshot (title, mode) and its history through `sessionService`, resolves project, worktree and branch names from the Host scope and the project settings. `{project_name}`, `{worktree}` and `{branch}` come from the event's `directory`, else the session record's `location.directory`; turn-end events carry no location, so they read the record. `{project_name}` is the label of the project the sidebar files that directory under: a directory registered as a project is that project, else its repository's primary worktree (`resolvePrimaryWorktreeRoot`) names it, so a session in a worktree shows its project; a directory under `chatRoots` is `Chats`, since a chat's folder name is a generated id; anything else is its folder name. The project open in the UI is used only when neither names one, as for a form owned by no session, and for a space's chat, whose directory is a path inside the space and is never matched against host projects or run git in on the host.
  - `getCachedZenModels()`

## Constants

### Default values
- `DEFAULT_NOTIFICATION_MESSAGE_MAX_LENGTH`: 250 (default max length for notification text).
- `NOTIFICATION_SSE_HEARTBEAT_INTERVAL_MS`: 20000 (notification SSE comment heartbeat interval).

## Settings object format

The `settings` parameter for `prepareNotificationLastMessage` supports `maxLastMessageLength` (number), the maximum length for the final notification text (default: 250). Legacy summarization settings may still exist in persisted settings but are ignored.

## Response contracts

### `truncateNotificationText`
- Returns empty string for non-string input.
- Returns original text if under max length.
- Returns `${text.slice(0, maxLength)}...` for truncated text.

### `prepareNotificationLastMessage`
- Returns empty string for empty/null message.
- Returns truncated original message. Model-backed notification summarization is retired.
- Normalizes markdown-like formatting to plain text before truncation.
- Always applies `maxLastMessageLength` truncation to final result.

## Notes for contributors

### Why interruption suppression is limited to steps

A cancelled run is a `run.cancelled` event, and it clears a pending notification instead of announcing a failure: the user stopped the turn, so no external notice follows. Terminal `run.failed` events still notify, because a failure there requires the user's attention.

### Adding new notification helpers
1. Add new helper functions to `packages/web/server/lib/notifications/message.js`.
2. Export functions that are intended for public use.
3. Follow existing patterns for input validation (e.g., type checking for strings).
4. Use `resolvePositiveNumber` for numeric parameters with fallbacks to maintain safe defaults.
5. Add corresponding unit tests in `packages/web/server/lib/notifications/message.test.js`.

### Error handling
- `prepareNotificationLastMessage` does not call model summarization.
- Invalid numeric parameters default to safe fallback values.
- Non-string inputs are handled gracefully (return empty string).

### Testing
- Run `bun run type-check`, `bun run lint`, and `bun run build` before finalizing changes.
- Unit tests should cover truncation behavior and edge cases (empty strings, invalid inputs).

## Browser event delivery

Web notifications subscribe to the shared `/api/openchamber/events` control
stream. The emitter sends each notification there and through the existing
global broadcaster. The broadcaster owns the main WebSocket and the legacy
`/api/notifications/stream` endpoint, which remains available to older clients.
Do not call both global and control broadcasters for one notification: they
share the WebSocket client set and would send each frame twice.

The web hook preserves `tag`, `sessionId`, `kind`, and the remaining notification
fields so the web notification API recognizes duplicate control-SSE and main-WS
delivery. Its existing five-second claim suppresses duplicate native alerts.
Native alerts remain best-effort live events, with no historical replay or
synthetic catch-up alerts. Unread marks live in the UI notification store (`packages/ui/src/sync/notification-store.ts`).

This removes one persistent HTTP connection per browser tab in both main-WS and
main-SSE modes. Two tabs use two control SSE connections, or four connections
when their main event pipelines also use SSE. It does not make HTTP/1.1 support
an unlimited number of tabs. The notification hook retains the app's background
work enablement, settings, focus, and runtime gates; it no longer opens a second
connection or switches sources when the main pipeline changes transport.

The control stream retains its browser-control capability declaration, runtime
switch cleanup, stale-source rejection, heartbeat, and reconnect-ready events.
Electron uses its native notification path. Mobile shells retain their existing push behavior.
