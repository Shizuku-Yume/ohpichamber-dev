import { TunnelCliError, EXIT_CODE } from './cli-errors.js';
import { resolveTargetPort } from './cli-api-target.js';
import { requestControlAction } from './cli-control.js';
import { isJsonMode, printJson } from '../cli-output.js';
import type { CliOptions } from './cli-args.js';
import { asNonEmptyString } from '../../server/lib/shared/object-guards.js';

type ModelRefInput = {
  providerID?: unknown;
  providerId?: unknown;
  modelID?: unknown;
  modelId?: unknown;
  id?: unknown;
};

<<<<<<< HEAD:packages/web/bin/lib/commands-models.js
||||||| bc50ba56aa:packages/web/bin/lib/commands-models.js
const formatModelRef = (entry) => {
  const providerID = asNonEmptyString(entry?.providerID) || asNonEmptyString(entry?.providerId);
  const modelID = asNonEmptyString(entry?.modelID) || asNonEmptyString(entry?.modelId) || asNonEmptyString(entry?.id);
  return providerID && modelID ? `${providerID}/${modelID}` : null;
};
=======
export type ModelSettingsInput = {
  defaultModel?: unknown;
  defaultAgent?: unknown;
  defaultVariant?: unknown;
  favoriteModels?: unknown;
  recentModels?: unknown;
};

const formatModelRef = (entry: ModelRefInput | null | undefined) => {
  const providerID = asNonEmptyString(entry?.providerID) || asNonEmptyString(entry?.providerId);
  const modelID = asNonEmptyString(entry?.modelID) || asNonEmptyString(entry?.modelId) || asNonEmptyString(entry?.id);
  return providerID && modelID ? `${providerID}/${modelID}` : null;
};
>>>>>>> upstream/main:packages/web/bin/lib/commands-models.ts

const formatDefaultLine = ({ defaultModel, defaultAgent, defaultVariant }: ModelSettingsInput) => {
  const model = asNonEmptyString(defaultModel) || 'none';
  const agent = asNonEmptyString(defaultAgent) || 'none';
  const variant = asNonEmptyString(defaultVariant);
  return `Default: \`${model}${variant ? ` (${variant})` : ''}\` / \`${agent}\``;
};

<<<<<<< HEAD:packages/web/bin/lib/commands-models.js
const formatModelsOutput = (settings = {}, formatModelRef) => {
||||||| bc50ba56aa:packages/web/bin/lib/commands-models.js
const formatModelsOutput = (settings = {}) => {
=======
const formatModelsOutput = (settings: ModelSettingsInput = {}) => {
>>>>>>> upstream/main:packages/web/bin/lib/commands-models.ts
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
  const result = await requestControlAction(port, 'models.list', {}, options);

  if (isJsonMode(options)) {
    printJson(result);
    return;
  }
  const { formatModelRef } = await import('@openchamber/agent-contract');
  process.stdout.write(formatModelsOutput(result, formatModelRef));
}

export { modelsCommand, formatModelsOutput };
