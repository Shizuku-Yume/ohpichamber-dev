import { z } from 'zod';
import type { ModelRefLike } from '@openchamber/agent-contract';
import { asNonEmptyString } from '../../server/lib/shared/object-guards.js';
import { TunnelCliError, EXIT_CODE } from './cli-errors.js';
import { resolveTargetPort } from './cli-api-target.js';
import { requestControlAction } from './cli-control.js';
import { isJsonMode, printJson } from '../cli-output.js';
import type { CliOptions } from './cli-args.js';

const modelRefSchema = z.object({
  provider: z.string().optional(),
  providerId: z.string().optional(),
  providerID: z.string().optional(),
  modelId: z.string().optional(),
  modelID: z.string().optional(),
  id: z.string().optional(),
});

const toModelRefLike = (raw: z.infer<typeof modelRefSchema>): ModelRefLike => {
  const ref: ModelRefLike = {};
  if (raw.provider !== undefined) ref.provider = raw.provider;
  if (raw.providerId !== undefined) ref.providerId = raw.providerId;
  if (raw.providerID !== undefined) ref.providerID = raw.providerID;
  if (raw.modelId !== undefined) ref.modelId = raw.modelId;
  if (raw.modelID !== undefined) ref.modelID = raw.modelID;
  if (raw.id !== undefined) ref.id = raw.id;
  return ref;
};
const modelsSettingsSchema = z.object({
  defaultModel: z.string().nullish(),
  defaultAgent: z.string().nullish(),
  defaultVariant: z.string().nullish(),
  favoriteModels: z.array(modelRefSchema).nullish(),
  recentModels: z.array(modelRefSchema).nullish(),
});

export type ModelsOutputInput = {
  defaultModel?: string | null | undefined;
  defaultAgent?: string | null | undefined;
  defaultVariant?: string | null | undefined;
  favoriteModels?: readonly ModelRefLike[] | null | undefined;
  recentModels?: readonly ModelRefLike[] | null | undefined;
};

const formatDefaultLine = ({ defaultModel, defaultAgent, defaultVariant }: ModelsOutputInput) => {
  const model = asNonEmptyString(defaultModel) || 'none';
  const agent = asNonEmptyString(defaultAgent) || 'none';
  const variant = asNonEmptyString(defaultVariant);
  return `Default: \`${model}${variant ? ` (${variant})` : ''}\` / \`${agent}\``;
};

const formatModelsOutput = (
  settings: ModelsOutputInput = {},
  formatModelRef: (ref: ModelRefLike) => string,
) => {
  const favorites = Array.isArray(settings.favoriteModels)
    ? settings.favoriteModels.map(formatModelRef).filter(Boolean)
    : [];
  const recent = Array.isArray(settings.recentModels)
    ? settings.recentModels.map(formatModelRef).filter(Boolean)
    : [];
  const lines = [
    formatDefaultLine(settings),
    '',
    'Favorites:',
    ...(favorites.length > 0 ? favorites.map((model) => `- \`${model}\``) : ['- none']),
    '',
    'Recent:',
    ...(recent.length > 0 ? recent.map((model) => `- \`${model}\``) : ['- none']),
  ];
  return `${lines.join('\n')}\n`;
};

async function modelsCommand(options: Partial<CliOptions> = {}, action = 'show') {
  if (action === 'help') {
    process.stdout.write(`OhPiChamber Models Commands\n\nUSAGE:\n  ohpichamber models [OPTIONS]\n\nOUTPUT OPTIONS:\n  -p, --port <port>       OhPiChamber server port\n  --json                  Output machine-readable JSON\n`);
    return;
  }
  if (action !== 'show') {
    throw new TunnelCliError(`Unknown models command '${action}'.`, EXIT_CODE.USAGE_ERROR);
  }

  const port = await resolveTargetPort(options);
  const rawResult: unknown = await requestControlAction(port, 'models.list', {}, options);
  const result = modelsSettingsSchema.parse(rawResult ?? {});

  if (isJsonMode(options)) {
    printJson(result);
    return;
  }
  const { formatModelRef } = await import('@openchamber/agent-contract');
  process.stdout.write(formatModelsOutput({
    defaultModel: result.defaultModel,
    defaultAgent: result.defaultAgent,
    defaultVariant: result.defaultVariant,
    favoriteModels: result.favoriteModels?.map(toModelRefLike),
    recentModels: result.recentModels?.map(toModelRefLike),
  }, formatModelRef));
}

export { modelsCommand, formatModelsOutput };
