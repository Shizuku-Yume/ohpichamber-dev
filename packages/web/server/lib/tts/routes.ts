import express from 'express';
import { normalizeCustomOpenAIBaseURL, normalizeSelectedOpenAIBaseURL } from './base-url.js';
import { summarizeText, sanitizeForTTS, sanitizeForNote } from '../text/summarization.js';

import { detectTextLanguage, languageOfLocale, pickVoiceForLanguage } from './language-detect.js';
import { ENTERPRISE_MODE_ERROR, isEnterpriseMode } from '../enterprise-mode.js';
import { describeVoiceKeys, readVoiceKey, updateVoiceKeys, voiceKeysPatchSchema } from './voice-keys.js';

const optionalText = z.string().optional().catch(undefined);
const optionalNumber = z.number().optional().catch(undefined);

const speakBodySchema = z.object({
  text: optionalText,
  voice: optionalText,
  model: optionalText,
  speed: optionalNumber,
  instructions: optionalText,
  apiKey: optionalText,
  baseURL: z.unknown().optional(),
  endpointPath: z.unknown().optional(),
}).catch({});

const summarizeBodySchema = z.object({
  text: optionalText,
  threshold: optionalNumber,
  maxLength: optionalNumber,
  mode: optionalText,
}).catch({});

const sayBodySchema = z.object({
  text: optionalText,
  voice: optionalText,
  rate: optionalNumber,
  language: z.unknown().optional(),
  languageSample: optionalText,
}).catch({});

const sttHeadersSchema = z.object({
  'content-type': optionalText,
  'x-base-url': optionalText,
  'x-model': optionalText,
  'x-language': optionalText,
  'x-endpoint-path': z.unknown().optional(),
  authorization: optionalText,
}).catch({});

const bodyOf = <Body>(body: Body) => body || {};

export function speechVoiceHeaderValue(voice: string) {
  return encodeURIComponent(voice);
}

export function registerTtsRoutes(app, { sayTTSCapability, ttsService, resolveTtsSelection }) {
  if (!ttsService || typeof ttsService.isAvailable !== 'function') throw new TypeError('TTS routes require the configured TTS service');
  if (typeof resolveTtsSelection !== 'function') throw new TypeError('TTS routes require selected credential context');
  const selectionFor = async (req) => {
    const selection = await resolveTtsSelection(req);
    if (!selection || typeof selection !== 'object') throw new Error('Selected TTS credential is unavailable');
    return selection;
  };

  app.get('/api/voice/keys', (_req, res) => {
    res.json(describeVoiceKeys());
  });

  app.put('/api/voice/keys', express.json({ limit: '16kb' }), (req, res) => {
    try {
      res.json(updateVoiceKeys(voiceKeysPatchSchema.parse(req.body)));
    } catch (error) {
      res.status(400).json({ error: 'Invalid transcription key request' });
    }
  });

  app.post('/api/voice/token', async (req, res) => {
    try {
      if (isEnterpriseMode()) return res.status(403).json({ allowed: false, error: ENTERPRISE_MODE_ERROR });
      const selection = await selectionFor(req);
      if (!await ttsService.isAvailable(selection)) return res.status(503).json({ allowed: false, error: 'Voice service unavailable' });
      return res.json({ allowed: true, provider: 'openai', message: 'OpenAI TTS is available' });
    } catch {
      return res.status(503).json({ allowed: false, error: 'Voice service unavailable' });
    }
  });

  app.post('/api/tts/speak', async (req, res) => {
    try {
      const { text, voice = 'nova', model = 'gpt-4o-mini-tts', speed = 0.9, instructions, baseURL } = req.body || {};
      if (!text || typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'Text is required' });
      const requested = normalizeCustomOpenAIBaseURL(baseURL);
      if (requested.error) return res.status(400).json({ error: requested.error });
      const selection = await selectionFor(req);
      const normalized = normalizeSelectedOpenAIBaseURL(selection.baseURL);
      if (normalized.error) return res.status(isEnterpriseMode() ? 403 : 503).json({ error: isEnterpriseMode() ? ENTERPRISE_MODE_ERROR : 'Selected TTS provider unavailable' });
      if (requested.value && requested.value !== normalized.value) return res.status(400).json({ error: 'TTS endpoint must match the selected provider' });
      if (isEnterpriseMode() && !normalized.value) return res.status(403).json({ error: ENTERPRISE_MODE_ERROR });
      const result = await ttsService.generateSpeechStream({ ...selection, text: text.trim(), voice, model, speed, instructions, baseURL: normalized.value });
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Content-Length', result.buffer.length);
      return res.send(result.buffer);
    } catch {
      if (!res.headersSent) return res.status(503).json({ error: 'TTS service unavailable' });
      return undefined;
    }
  });

  app.post('/api/text/summarize', async (req, res) => {
    try {
      const { text, threshold = 200, maxLength = 500, mode = 'tts' } = summarizeBodySchema.parse(bodyOf(req.body));

      if (!text || !text.trim()) {
        return res.status(400).json({ error: 'Text is required' });
      }

      const result = await summarizeText({
        text,
        threshold,
        maxLength,
        mode,
      });

      return res.json(result);
    } catch {
      const sanitized = typeof req.body?.mode === 'string' && req.body.mode === 'note'
        ? sanitizeForNote(req.body?.text || '')
        : sanitizeForTTS(req.body?.text || '');
      return res.json({ summary: sanitized, summarized: false, reason: 'Summarization unavailable' });
    }
  });

       
  // TTS status endpoint
  app.get('/api/tts/status', async (req, res) => {
    try {
      const selection = await selectionFor(req);
      const enterpriseMode = isEnterpriseMode();
      return res.json({ available: !enterpriseMode && await ttsService.isAvailable(selection), enterpriseMode, voices: ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse', 'marin', 'cedar'] });
    } catch {
      return res.status(503).json({ error: 'TTS service unavailable' });
    }
  });

  app.get('/api/tts/say/status', async (_req, res) => {
    res.json(await sayTTSCapability);
  });

  app.post('/api/tts/say/speak', async (req, res) => {
    try {
      const { text, rate = 200, language, languageSample, voice: requestedVoice } = sayBodySchema.parse(bodyOf(req.body));
      let voice = requestedVoice?.trim() ? requestedVoice.trim() : 'Samantha';

      if (!text || !text.trim()) {
        return res.status(400).json({ error: 'Text is required' });
      }

      if (process.platform !== 'darwin') {
        return res.status(503).json({ error: 'macOS say command not available on this platform' });
      }

      let resolvedLanguage: string | null = null;
      if (language === 'auto') {
        const capability = await sayTTSCapability;
        const voices = Array.isArray(capability?.voices) ? capability.voices : [];
        const sample = languageSample?.trim() ? languageSample.slice(0, 4000) : text;
        resolvedLanguage = detectTextLanguage(sample).language;
        const chosen = voices.find((entry) => entry.name === voice);
        if (languageOfLocale(chosen?.locale) !== resolvedLanguage) {
          const match = pickVoiceForLanguage(resolvedLanguage, voices);
          if (match) voice = match;
        }
      }
      
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const fs = await import('node:fs');
      const os = await import('node:os');
      const path = await import('node:path');
      const execFileAsync = promisify(execFile);

      const tempFile = path.join(os.tmpdir(), `say-${Date.now()}.m4a`);

      console.log('[TTS-Say] Generating speech:', { textLength: text.length, voice, rate });

      await execFileAsync('say', ['-v', voice, '-r', String(rate), '-o', tempFile, '--data-format=aac', text.trim()]);

      const audioBuffer = await fs.promises.readFile(tempFile);

      fs.promises.unlink(tempFile).catch(() => {});

      res.setHeader('Content-Type', 'audio/mp4');
      res.setHeader('X-Speech-Voice', speechVoiceHeaderValue(voice));
      if (resolvedLanguage) res.setHeader('X-Speech-Language', resolvedLanguage);
      res.setHeader('Content-Length', audioBuffer.length);
      res.send(audioBuffer);
    } catch (error) {
      console.error('[TTS-Say] Error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Say command failed'
      });
    }
  });

  app.post(
    '/api/stt/transcribe',
    express.raw({ type: (req) => (req.headers['content-type'] || '').startsWith('audio/'), limit: '20mb' }),
    async (req, res) => {
      try {
        const { transcribeAudio } = await import('./stt.js');

        const mimeType = (req.headers['content-type'] || 'audio/webm').split(',')[0].trim();
        const baseURL = typeof req.headers['x-base-url'] === 'string' ? req.headers['x-base-url'].trim() : '';
        const model = typeof req.headers['x-model'] === 'string' && req.headers['x-model'].trim().length > 0
          ? req.headers['x-model'].trim()
          : 'deepdml/faster-whisper-large-v3-turbo-ct2';
        const language = typeof req.headers['x-language'] === 'string' && req.headers['x-language'].trim().length > 0
          ? req.headers['x-language'].trim()
          : undefined;
        const authHeader = typeof req.headers['authorization'] === 'string' ? req.headers['authorization'].trim() : '';
        const apiKey = (authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined) || readVoiceKey('stt');

        if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
          return res.status(400).json({ error: 'Audio data is required' });
        }

        if (!baseURL) {
          return res.status(400).json({ error: 'X-Base-URL header is required' });
        }

        console.log('[STT] Transcribing audio:', {
          bytes: req.body.length,
          mimeType,
          model,
          baseURL,
          language,
          hasApiKey: !!apiKey,
        });

        const transcript = await transcribeAudio({
          audioBuffer: req.body,
          mimeType,
          model,
          baseURL,
          apiKey,
          language,
        });

        console.log('[STT] Transcript:', transcript?.slice(0, 120));
        res.json({ transcript: transcript ?? '' });
      } catch (error) {
        console.error('[STT] Error:', error);
        if (!res.headersSent) {
          res.status(500).json({
            error: error instanceof Error ? error.message : 'Transcription failed',
          });
        }
      }
    }
  );
}
