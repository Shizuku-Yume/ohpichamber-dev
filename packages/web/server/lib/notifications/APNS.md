# APNs remote push — signed relay mode

Native iOS background push (notifications even when the app is **suspended or killed**) is
delivered via APNs through a relay the operator configures; no user configures an Apple key. Each
server signs its relay requests with an auto-generated keypair, and tokens are bound to the
server that registered them — so a leaked device token alone can't be used to push.

The fork configures no relay. Remote push is off until `OPENCHAMBER_PUSH_RELAY_URL` names one,
or direct mode is set up (see *Modes*); local and Web push are unaffected.

## How it works

1. The app registers its APNs device token with **its own server** (`POST /api/push/apns-token`,
   `useNativePushRegistration`). PWA/desktop never register — only the native Capacitor app.
2. The server **binds the token on the relay**: it POSTs `{ token, publicKeyJwk, ts, sig }` to
   `POST /v1/push/register-token`, signed with its auto-generated ECDSA P-256 key
   (`getOrCreateRelayKeypair`, persisted in settings like the VAPID keys). The relay records
   `token → serverId` where `serverId = SHA-256(publicKey)`.
3. On a trigger (ready/error/question/permission), the server composes **generic, content-free**
   clear text (a phone with a push key also gets the real text sealed, see *Data confidentiality*) — a fixed scenario title ("Agent response is ready" / "Agent needs your input" / "Agent
   needs permission" / "Agent hit an error") + the **session name** as the body, no model/project/
   message content — plus a **`badge`** count (see below) — and POSTs `{ tokens, title, body,
   badge, env, data:{sessionId}, publicKeyJwk, ts, sig }` to `POST /v1/push/send`
   (`apns-runtime.js` → `sendViaRelay`). It does **not** gate on UI visibility (see below).
4. The **relay** verifies the signature +
   `ts` freshness, derives `serverId`, and only delivers to tokens bound to that server. It holds
   the project APNs `.p8` key, signs an ES256 JWT with `crypto.subtle`, and sends each
   token to APNs over HTTP/2, returning per-token results; the server drops tokens flagged `drop`
   (410 / BadDeviceToken). The relay stores no secret — only `token → serverId` hashes.
5. Tapping a push deep-links to its session via the forwarded `sessionId`.

## When the relay cannot be reached

Every relay request (send and register-token) gives up after 15 s. The relay answers a send in
0.1-0.4 s, its FCM/APNs call included; before the limit a stalled path held the send for
undici's 300 s and then lost the notification. Sends to different devices run in parallel, so one
send waiting out the limit or a retry does not delay the others.

A request is sent once more, after 5 s, only when it failed before leaving this machine:
connection refused, no DNS answer, no route, or Node's 10 s connect timeout. The 15 s limit sits
above that connect timeout, so a path that never connects is retried. A timeout after the
connection opened, or a reset, is not retried: the relay keeps no record of what it delivered,
and a repeat of a request it already took would alert the phone twice. Such a notification is
lost with a log line that says so. Under Bun, which has no separate connect timeout, a path that
never connects ends at the 15 s limit and is not retried either.

## Foreground suppression

APNs is **not** gated on UI visibility. A backgrounded WKWebView can't reliably report "hidden"
before iOS suspends it, so a server-side visibility gate dropped background push for short
responses. Instead the server always sends, and **iOS** suppresses the foreground banner
(`PushNotifications.presentationOptions: []` in `capacitor.config`) — so there is no notification
while the app is active, with no race. APNs is the native app's **only** channel; local
notifications were removed (a WKWebView can't tell foreground from background — `document.hasFocus()`
is unreliable — so they leaked while the app was open). The relay is contacted only when a native
app with notifications on has a registered token and a trigger fires.

## App-icon badge

Each push carries an **absolute** `aps.badge` = the number of **distinct collapse-ids (`tag`)
pushed since the app was last foregrounded**. It mirrors the lock-screen banner stack.

The count is a `Set<tag>` (`pendingPushTags`) in the trigger runtime (`runtime.js`):
`fanoutPush` in `runtime.js` adds the push `tag` and sends the set size as the badge. We key by **`tag`,
not sessionId**, because the tag *is* the banner identity — iOS uses it as `apns-collapse-id`, so
same-tag pushes replace one banner while different tags are distinct banners. One session can raise
several banners (`ready-<id>`, `question-<id>`, `permission-<requestKey>` are different tags), so
counting sessionIds both over- and under-counts the stack; counting tags matches it.

It is deliberately **not** derived from the in-app unread marks (OpenCode's `time.viewed`): a
backgrounded client can still be on the session, and the mark changes on a separate event that
races the push trigger. The set self-clears via `clearPendingPushBadge` on any signal that the user is engaging
with the app: the visibility beacon (`updateUiVisibility` wrapper, `visible:true`), **plus** opening
a session (`POST /api/sessions/:id/view`) and sending a message (`POST /api/sessions/:id/
message-sent`). The latter two need no auth and fire reliably on the native app when it foregrounds,
so they are the dependable reset — the visibility beacon alone proved unreliable in WKWebView. This
mirrors the device zeroing its icon badge on `sceneDidBecomeActive` (`AppDelegate.swift`), keeping
server and device in sync.

The value flows `runtime.js` (`fanoutPush`) → `apns-runtime.js` (`sendViaRelay` body /
direct-mode `aps.badge`) → relay (`pushSendSchema.badge` → `aps.badge`). It is **not** signed (like
`body`/`data`); the relay still only delivers to bound tokens. The set is server-global, so every
device token of a server sees the same badge.

## Clearing handled notifications

When the cause of a notification is handled (the question answered, the session continued or
viewed on another device), the server sends `POST /v1/push/clear` with the notification tags.
The relay turns it into an APNs background push or an FCM data message, which shows nothing; the
app removes the delivered notifications with those tags and sets the badge to the count that
remains. A tag that is cleared also leaves `pendingPushTags`. Later visible pushes repeat the
recently cleared tags in `data.clear`, for a phone that missed the clearing push. The design and
the events that clear each tag are in `DOCUMENTATION.md`, *Clearing handled notifications*.

## Modes

- **Relay (optional):** server has no Apple key and POSTs to the relay configured with
  `OPENCHAMBER_PUSH_RELAY_URL` (the register URL is derived as `…/register-token`). There is no
  default relay: with no URL set, remote iOS push is unavailable and sends nothing, and the
  mobile push settings say it needs a relay URL.
- **Direct (optional):** set `OPENCHAMBER_APNS_KEY_ID/TEAM_ID/P8` to sign+send from the server
  itself (HTTP/2 + ES256 JWT); no relay binding needed. It is used whenever no relay URL is set,
  and `OPENCHAMBER_PUSH_RELAY_DISABLED=true` forces it when one is.

With neither configured, nothing is sent, the reason is logged once per process, and
`GET /api/push/native-status` tells the client:

- `{ available: true, reason: null, relaySetting }` when a relay URL or a direct APNs config is
  present.
- `{ available: false, reason: 'relay-url-missing', relaySetting: 'OPENCHAMBER_PUSH_RELAY_URL' }`
  when the relay is not disabled but no URL is set.
- `{ available: false, reason: 'direct-config-missing', relaySetting, disabledSetting:
  'OPENCHAMBER_PUSH_RELAY_DISABLED' }` when the relay is disabled and no direct APNs key exists.

`available` is true when either path can send. On the native app the settings page keeps the
delivery toggle and, when this answer says unavailable, shows a warning under it naming
`relaySetting` (and `disabledSetting` for the direct case); it never claims delivery works without
one. The route answers 404 when the server was not wired with `resolveApnsStatus`.

## Config

Server (`apns-runtime.js`):
- `OPENCHAMBER_PUSH_RELAY_URL` (self-hosted relay send endpoint; unset means no remote push),
  `OPENCHAMBER_APNS_ENVIRONMENT` (optional override forcing every send to `sandbox` or
  `production`; normally unset — each token is delivered to the environment it registered with:
  the iOS shell reads the `aps-environment` entitlement from the embedded provisioning profile
  and reports it at registration, so Xcode dev builds go to sandbox and TestFlight/App Store to
  production). The signing keypair is auto-generated — nothing to set.
- Direct fallback: `OPENCHAMBER_APNS_KEY_ID`, `OPENCHAMBER_APNS_TEAM_ID`, `OPENCHAMBER_APNS_P8`
  (or `_P8_PATH`), `OPENCHAMBER_APNS_BUNDLE_ID`; `OPENCHAMBER_PUSH_RELAY_DISABLED=true` forces
  direct send while a relay URL is set.

The relay is deployed by whoever operates it, configured through its own deployment secrets:
`APNS_P8`, `APNS_KEY_ID`, `APNS_TEAM_ID`, optional `APNS_BUNDLE_ID` / `APNS_DEFAULT_ENV`, plus its
`push_tokens` storage table (created by `migrations/0002_push_tokens.sql` in the reference relay).

## Apple setup (one-time)

1. Apple **Keys** (not Certificates) → create an **APNs Auth Key** (`.p8`) → Key ID + Team ID;
   enable **Push Notifications** on App ID `dev.ohpichamber.app`.
2. Configure the relay you operate with the key's secrets (`APNS_P8` PEM, `APNS_KEY_ID`,
   `APNS_TEAM_ID`) through its own deployment, or use direct mode with the same values in the
   server environment.
3. Xcode: confirm the Push Notifications capability; Clean Build Folder; run on device.

## Security posture

- The device token is a per-install secret, but no longer the *only* defence: every relay request
  is signed by the server's private key, and the relay only delivers to a token from its bound
  `serverId`. A leaked token alone is useless — an attacker has neither the private key nor a
  matching binding.
- `serverId` self-certifies (`SHA-256(publicKey)`), so the relay holds no secret; a relay database
  leak exposes only `token → serverId` hashes. The signed `ts` (±5 min window) blocks replay.
- Residual: trust-on-first-bind (whoever registers a token first owns it) — acceptable, since
  registering already requires possessing the token. Relay rate limiting is defence-in-depth.

## Data confidentiality (what the relay / Apple / Google can see)

The request **signature is authentication**: the relay verifies it and it hides nothing. What
hides the text is the **push key** (`push-seal.js`). A current iOS or Android app registers a
32-byte key that stays on the server and the phone. For such a phone the server sends the
generic scenario title in the clear, an empty body, and `data.enc`: AES-256-GCM of what the
phone shows. That is the session name as title and what happened as body: the agent's reply,
the question, the command or file a permission is for, the run's error, the goal outcome
(`runtime.js` `fanoutPush` → `sealed`; the detail is capped at 250 characters before the
prefix is added). The iOS
Notification Service Extension and Android's `SealedPushMessagingService` open it on the device.

Who can read what:

- **Network hops:** nothing (TLS).
- **The relay (operator-run):** the generic title, the device token, `sessionId` and the sealed
  blob. It stores only `token → serverId` hashes (no text, no payload).
- **Apple APNs / Google FCM:** the same as the relay.
- **The device:** opens the blob and shows the real text.

An app that registered without a key gets the generic title and the session name in the clear,
and no message content. Enterprise mode sends no sealed text and drops the session name, so
every phone shows only the scenario title.

## Android (FCM)

The relay forwards Android tokens to FCM. A sealed push goes as a data message, so
`SealedPushMessagingService` runs in the background and builds the notification itself. It posts
one notification per tag, so a newer push about the same thing replaces the older one, as the
collapse id does on iOS. A clear-text push carries the tag as its Android notification tag, so a
clearing message can find it.
