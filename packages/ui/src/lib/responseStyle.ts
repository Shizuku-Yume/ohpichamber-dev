/**
 * Response-style presets and the one rule that makes them safe to ship:
 * `default` (or no stored preference at all) contributes exactly zero bytes of
 * prompt text.
 *
 * The effective instruction is persisted with the rest of the profile settings
 * so the Host delivery owner can read it without a second copy of this text.
 * Only a non-default preset with a non-empty instruction produces any string.
 */
import { loadDesktopSettings } from './persistence';

export const RESPONSE_STYLE_PRESETS = [
  'default',
  'concise',
  'detailed',
  'mentor',
  'pushback',
  'noFiller',
  'matchEnergy',
  'warmPeer',
  'custom',
] as const;

export type ResponseStylePreset = typeof RESPONSE_STYLE_PRESETS[number];

export const DEFAULT_RESPONSE_STYLE_PRESET: ResponseStylePreset = 'default';

export const isResponseStylePreset = (value: unknown): value is ResponseStylePreset => (
  typeof value === 'string' && (RESPONSE_STYLE_PRESETS as readonly string[]).includes(value)
);

const PRESET_INSTRUCTIONS: Record<Exclude<ResponseStylePreset, 'default' | 'custom'>, string> = {
  concise: "Keep replies short. Answer first, no preamble or recap of the question. Write like you're texting a colleague who already has the context — plain sentences, not headings or bullets. Reach for a list only when the content is genuinely a list; never use one to look organised.",
  detailed: "Take the space you need to actually explain things. Walk through what's going on, why it matters, and where the real tradeoffs are. Prefer flowing prose over bullet points and headings — structure the answer with paragraphs and let the reasoning carry it. Lists are fine when something really is enumerable, but don't fragment a normal explanation into bullets.",
  mentor: "Talk like a patient senior engineer pairing with someone less experienced. Explain the underlying idea before the answer, think out loud about how you'd approach it, and drop in a small concrete example when it actually helps. Keep it conversational — no lecture format, no checklists, no numbered steps unless the task literally is a sequence.",
  pushback: "Don't agree automatically. If something I say sounds off — a wrong assumption, a flawed approach, a request that won't actually do what I think it will — push back first. Explain what you disagree with and why, and only proceed once I've responded. Disagreement is welcome; sycophancy is not. Don't soften it with 'you might want to consider' — just say it.",
  noFiller: "Cut the filler. No 'Great question', no 'Certainly', no 'I'll help you with that', no restating what I just asked. No closing summary of what you did when the diff or output already shows it. No trailing 'let me know if you need anything else'. Open with the actual content and stop when you're done.",
  matchEnergy: "Mirror the size and register of my message. A one-line question gets a one-line answer. A casual aside gets a casual reply, not a structured breakdown. If I write three words, don't respond with three paragraphs. Match the tone too — informal stays informal, technical stays technical. Don't inflate small asks into full essays.",
  warmPeer: "Talk like a colleague, not an assistant. First person is fine and encouraged — 'I'd do this', 'I don't love that approach', 'that was sloppy of me'. Have actual opinions and share them. Push back when you disagree. Admit when you screwed up without grovelling. Skip the corporate helpfulness and performative politeness — just be a person.",
};

/** The preset's own text; empty for `default` and for the freeform `custom` preset. */
export const getResponseStylePresetInstructions = (preset: ResponseStylePreset): string => (
  preset === 'default' || preset === 'custom' ? '' : PRESET_INSTRUCTIONS[preset]
);

/**
 * The instruction that may travel with a prompt, or `''` when nothing should
 * be injected. Empty is the zero-injection case: an unset/`default` preset, or
 * a custom preset whose text is blank.
 */
export const resolveResponseStyleInstruction = ({
  preset,
  customInstructions,
}: {
  preset?: unknown;
  customInstructions?: unknown;
}): string => {
  if (!isResponseStylePreset(preset) || preset === 'default') return '';
  if (preset === 'custom') {
    return typeof customInstructions === 'string' ? customInstructions.trim() : '';
  }
  return PRESET_INSTRUCTIONS[preset];
};

/**
 * The instruction the next send carries, read from the settings document:
 * `undefined` when there is nothing to read, `null` when the style is off.
 */
export const fetchResponseStyleInstruction = async (): Promise<string | null | undefined> => {
  const settings = await loadDesktopSettings();
  if (!settings) return undefined;
  return resolveResponseStyleInstruction({
    preset: settings.responseStyleEnabled === true ? settings.responseStylePreset : undefined,
    customInstructions: settings.responseStyleCustomInstructions,
  }) || null;
};
