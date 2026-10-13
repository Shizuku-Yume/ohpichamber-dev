import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describeVoiceKeys, readVoiceKey, updateVoiceKeys } from './voice-keys.js';

describe('voice keys store', () => {
  let dataDir;
  let previousDataDir;

  beforeEach(() => {
    previousDataDir = process.env.OPENCHAMBER_DATA_DIR;
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-voice-keys-'));
    process.env.OPENCHAMBER_DATA_DIR = dataDir;
  });

  afterEach(() => {
    if (previousDataDir === undefined) delete process.env.OPENCHAMBER_DATA_DIR;
    else process.env.OPENCHAMBER_DATA_DIR = previousDataDir;
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('keeps keys in an owner-only file and answers only whether each is set', () => {
    expect(updateVoiceKeys({ stt: ' sk-stt ' })).toEqual({ stt: true });
    expect(readVoiceKey('stt')).toBe('sk-stt');
    expect(JSON.stringify(describeVoiceKeys())).not.toContain('sk-');
    if (process.platform !== 'win32') {
      expect(fs.statSync(path.join(dataDir, 'voice-keys.json')).mode & 0o777).toBe(0o600);
    }
  });

  it('removes the custom transcription key on null', () => {
    updateVoiceKeys({ stt: 'sk-stt' });
    expect(updateVoiceKeys({ stt: null })).toEqual({ stt: false });
    expect(readVoiceKey('stt')).toBeUndefined();
  });

  it('refuses a malformed patch without touching what is stored', () => {
    updateVoiceKeys({ stt: 'sk-stt' });
    expect(() => updateVoiceKeys({ stt: 42 })).toThrow();
    expect(() => updateVoiceKeys({ openai: 'must-not-persist', openaiCompatible: 'must-not-persist' })).toThrow();
    expect(readVoiceKey('stt')).toBe('sk-stt');
  });
});
