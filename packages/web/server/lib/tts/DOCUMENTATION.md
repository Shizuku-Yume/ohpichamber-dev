# TTS Module Documentation

## Purpose
This module provides server-side Text-to-Speech (TTS) audio synthesis using OpenAI-compatible APIs, Speech-to-Text (STT) transcription proxying, and local macOS `say` command synthesis. Text summarization in `packages/web/server/lib/text/summarization.js` operates as an offline fallback stub without external model dependencies.

## Entrypoints and structure
- `packages/web/server/lib/tts/service.js`: `TTSService` class and `createTTSService` factory for OpenAI-compatible audio generation.
- `packages/web/server/lib/tts/routes.js`: Express route registration for `/api/voice/*`, `/api/tts/*`, `/api/stt/*`, and `/api/text/summarize` (`registerTtsRoutes`).
- `packages/web/server/lib/tts/voice-keys.js`: local file storage for custom transcription (STT) keys (`voice-keys.json`).
- `packages/web/server/lib/tts/stt.js`: STT proxy for OpenAI-compatible transcription endpoints (`transcribeAudio`).
- `packages/web/server/lib/tts/base-url.js`: base URL validation, normalization, local host checks, and enterprise mode boundary enforcement.
- `packages/web/server/lib/tts/capability-runtime.js`: runtime helper for probing local macOS `say` voice capability (`detectSayTtsCapability`).
- `packages/web/server/lib/tts/language-detect.js`: dependency-free language detection for voice matching in macOS `say` synthesis (`detectTextLanguage`, `pickVoiceForLanguage`, `languageOfLocale`).
- `packages/web/server/lib/text/summarization.js`: offline fallback text summarization and text sanitization helpers (`summarizeText`, `sanitizeForTTS`, `sanitizeForNote`).

## Public exports
- `TTSService` (`service.js`): service class for audio speech generation. Requires `{ resolveCredential }` in its constructor.
- `createTTSService(options)` (`service.js`): factory returning an instance of `TTSService`.
- `transcribeAudio(opts)` (`stt.js`): proxies raw audio to an OpenAI-compatible `/v1/audio/transcriptions` endpoint.
- `summarizeText(opts)` (`text/summarization.js`): offline text summarization fallback stub returning `{ summary, summarized: false, reason }`.
- `sanitizeForTTS(text)` (`text/summarization.js`): strips markdown, URLs, file paths, and formatting for spoken speech.
- `sanitizeForNote(text)` (`text/summarization.js`): strips non-speakable formatting for note-mode callers.

## Credential owners and storage controls

The TTS module separates speech generation credentials from transcription credentials:

### 1. TTS Credentials (Speech generation)
- **Authority and owner:** Owned by Agent Service `AuthStorage`. The server never reads legacy OpenCode `auth.json`, `opencode.json`, or environment variables for TTS credentials.
- **Selection resolution:** The route caller provides workspace context (`workspaceId`, `agentDirectoryId`, `providerId`, `credentialRef`). Host `resolveTtsSelection` in `packages/web/server/lib/host/private-credential.js` reads the workspace provider catalog from Agent Service, validating that `provider.auth.status === 'configured'`, `provider.auth.method === 'api-key'`, `provider.protocol` is `chat-completions` or `responses`, and `provider.endpoint` is set.
- **Secret resolution:** `TTSService` calls `requireSelectedCredential({ ...options, purpose: 'tts', resolveCredential })` in `packages/web/server/lib/quota/providers/selected-credential.js`. Host `resolveCredential` queries Agent Service internal endpoint `POST /internal/workspaces/:workspaceId/credentials/resolve` via `createSelectedCredentialResolver`.
- **Validation:** The resolved credential must be `{ type: 'api_key', key }`. The secret remains in server memory and is never returned in HTTP responses.

### 2. STT Credentials (Transcription)
- **Authority and owner:** Managed directly by the web server in `packages/web/server/lib/tts/voice-keys.js`.
- **File storage:** Stored in `voice-keys.json` under `OPENCHAMBER_DATA_DIR` or `~/.config/openchamber/voice-keys.json`.
- **Access controls:** Stored with POSIX file mode `0o600` via atomic write (`.tmp` file replacement). No encryption is claimed beyond OS filesystem permission controls.
- **Scope:** Manages custom transcription keys (`stt` kind only). Speech generation credentials remain SDK- and Agent-Service-owned.
- **API boundary:** `describeVoiceKeys()` returns `{ stt: boolean }` and never exposes secret keys.

### 3. Enterprise mode and network boundary
Speech and transcription carry conversation content (Enterprise Boundary Egress class):
- In enterprise mode, custom server URLs MUST run on the local machine (`localhost`, `127.0.0.1`, `::1`, `host.docker.internal`).
- Outside enterprise mode, only the Host-selected standard OpenAI endpoint (`https://api.openai.com/v1`) receives policy exemption from remote-URL checks; enterprise mode blocks it. Custom browser-supplied URLs never receive this exemption.
- `POST /api/voice/token` is refused with HTTP 403 (`{ allowed: false, error: ENTERPRISE_MODE_ERROR }` with no `code`).
- Remote OpenAI-compatible endpoints outside enterprise mode require the desktop runtime (`OPENCHAMBER_RUNTIME=desktop`) or explicit `OPENCHAMBER_ALLOW_REMOTE_OPENAI_COMPAT_URLS=true`.

## HTTP routes
`packages/web/server/lib/tts/routes.js` registers Express endpoints (`registerTtsRoutes`):

- `GET /api/voice/keys`:
  Returns `{ stt: boolean }` indicating whether a transcription key is stored. Never returns secrets.
- `PUT /api/voice/keys`:
  Accepts `{ stt: string | '' | null }` (max 16KB JSON body). Updates `voice-keys.json` atomically with mode `0o600` and returns updated `{ stt: boolean }`.
- `POST /api/voice/token`:
  Checks TTS availability for the selected workspace credential. In enterprise mode, returns HTTP 403 (`{ allowed: false, error: ENTERPRISE_MODE_ERROR }`). Otherwise returns `{ allowed: true, provider: 'openai', message: 'OpenAI TTS is available' }` or HTTP 503.
- `POST /api/tts/speak`:
  Body: `{ text, voice = 'nova', model = 'gpt-4o-mini-tts', speed = 0.9, instructions, baseURL }`. Validates that requested `baseURL` matches the selected provider's endpoint, generates audio via `ttsService.generateSpeechStream`, and responds with `audio/mpeg` buffer.
- `GET /api/tts/status`:
  Returns `{ available: boolean, enterpriseMode: boolean, voices: string[] }` for the selected workspace.
- `GET /api/tts/say/status`:
  Returns `{ available: boolean, voices: object[], reason?: string }` from probing local macOS `say` support.
- `POST /api/tts/say/speak`:
  macOS-only endpoint. Synthesizes speech using local `say` command. Supports `language: 'auto'` with language detection (`detectTextLanguage`). Responds with `audio/mp4` and headers `X-Speech-Voice` and `X-Speech-Language`.
- `POST /api/stt/transcribe`:
  Receives raw audio in request body (up to 20MB). Headers: `Content-Type`, `X-Base-URL`, `X-Model`, `X-Language`, and optional `Authorization: Bearer <key>`. Falls back to stored `stt` key from `voice-keys.json`. Calls `transcribeAudio` and returns `{ transcript: string }`.
- `POST /api/text/summarize`:
  Body: `{ text, threshold = 200, maxLength = 500, mode = 'tts' }`. Empty or non-string `text` returns HTTP 400 (`{ error: 'Text is required' }`). When `text.length <= threshold`, returns `{ summary, summarized: false, reason: 'Text under threshold' }`. When `text.length > threshold`, returns `{ summary, summarized: false, reason: 'Model summarization provider unavailable', originalLength, summaryLength }`. The catch fallback returns `{ summary, summarized: false, reason: 'Summarization unavailable' }`.

## TTSService methods

### `constructor({ resolveCredential })`
Requires the real `resolveCredential` function. Throws `TypeError` if missing.

### `isAvailable(options)`
Checks whether the OpenAI client can be initialized for the given workspace credential options (`workspaceId`, `agentDirectoryId`, `providerId`, `credentialRef`, `baseURL`). Returns `true` on success, `false` on failure.

### `generateSpeechStream(options)`
Synthesizes speech and returns an audio buffer with content type:
- Options: `text` (required), `voice` (default `'coral'`), `model` (default `'gpt-4o-mini-tts'`), `speed` (default `1.0`), `instructions`, `baseURL`, `workspaceId`, `agentDirectoryId`, `providerId`, `credentialRef`.
- Returns: `{ buffer: Buffer, contentType: string }`.
- Throws: Error if text is empty, URL is invalid, or credential resolution fails.

### `generateSpeechBuffer(options)`
Synthesizes speech and returns an audio buffer:
- Options: same as `generateSpeechStream`.
- Returns: `Buffer` containing MP3 audio bytes.
- Throws: Error on missing text or generation failure.

### Client caching
`TTSService` caches the official OpenAI client instance across calls when using the standard endpoint as long as the resolved API key matches `_lastApiKey`. Custom endpoints instantiate a dedicated client per request.

## Notes for contributors
- TTS credentials are never resolved from environment variables or local auth files; they are selected via Host workspace context and resolved from Agent Service `AuthStorage`.
- Custom STT keys are managed through `voice-keys.js` with mode `0o600`.
- Keep secrets out of examples and documentation.
- Enterprise mode boundary: never bypass local host restrictions for remote custom speech endpoints.
- Tests mock `resolveCredential` returning `{ type: 'api_key', key }`.
- Verification is owned by package test suites; Task18 owns integrated workflow verification.
