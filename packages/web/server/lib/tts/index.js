/**
 * TTS Module Entry Point
 *
 * Public export surface for the Text-to-Speech domain module.
 */

/** @public */
export {
  TTSService,
  createTTSService,
  TTS_VOICES,
} from './service.js';

/** @public */
export {
  summarizeText,
  sanitizeForTTS,
  sanitizeForNote,
} from '../text/summarization.js';

/** @public */
export { transcribeAudio } from './stt.js';
