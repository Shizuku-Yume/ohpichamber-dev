import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';

const MAX_RESPONSE_STYLE_LENGTH = 50_000;

const BehaviorSettingsInputSchema = z.looseObject({});
const ResponseStyleSchema = z.object({
  responseStyleEnabled: z.literal(true),
  responseStyleInstruction: z.string(),
});

export type BehaviorPromptSettings = z.infer<typeof BehaviorSettingsInputSchema>;

export interface BehaviorPromptContextEntry {
  kind: 'instruction';
  text: string;
}

export interface BehaviorMergedSettingsReaderOptions {
  fs: typeof fs;
  path: typeof path;
  settingsFilePath: string;
}

export interface BehaviorPromptSourceOptions {
  fsModule?: typeof fs | undefined;
  pathModule?: typeof path | undefined;
  settingsFilePath?: string | undefined;
  readMergedSettings?: ((options: BehaviorMergedSettingsReaderOptions) => BehaviorPromptSettings) | undefined;
}

export const resolveBehaviorPromptContext = (
  settings: BehaviorPromptSettings | null | undefined,
): BehaviorPromptContextEntry[] => {
  const parsed = ResponseStyleSchema.safeParse(settings);
  if (!parsed.success) return [];
  const instruction = parsed.data.responseStyleInstruction.trim();
  if (!instruction) return [];
  return [{
    kind: 'instruction',
    text: instruction.length <= MAX_RESPONSE_STYLE_LENGTH
      ? instruction
      : instruction.slice(0, MAX_RESPONSE_STYLE_LENGTH),
  }];
};

export const createBehaviorPromptSource = ({
  fsModule = fs,
  pathModule = path,
  settingsFilePath = path.join(
    process.env.OPENCHAMBER_DATA_DIR
      ? path.resolve(process.env.OPENCHAMBER_DATA_DIR)
      : path.join(os.homedir(), '.config', 'ohpichamber'),
    'settings.json',
  ),
  readMergedSettings = undefined,
}: BehaviorPromptSourceOptions = {}): (() => BehaviorPromptContextEntry[]) => {
  const parsedReader = z.function().safeParse(readMergedSettings);
  if (!readMergedSettings || !parsedReader.success) {
    throw new TypeError('behavior prompt source requires a merged settings reader');
  }
  const reader = readMergedSettings;
  return () => resolveBehaviorPromptContext(reader({
    fs: fsModule,
    path: pathModule,
    settingsFilePath,
  }));
};
