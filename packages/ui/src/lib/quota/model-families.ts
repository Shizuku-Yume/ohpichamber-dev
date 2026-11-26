import { parseModelString } from '@openchamber/agent-contract';
import type { QuotaProviderId } from '@/types';
import type { I18nKey } from '@/lib/i18n';

export interface ModelFamily {
  id: string;
  label: string;
  labelKey?: I18nKey;
  matcher: (modelName: string) => boolean;
  order: number;
}

export function getDisplayModelName(modelName: string): string {
  // The split is the selector grammar's: a quota id is `provider/model`.
  const parsed = parseModelString(modelName);
  if (!parsed) return modelName;
  return parsed.providerId === 'gemini' || parsed.providerId === 'antigravity' ? parsed.modelId : modelName;
}

const GOOGLE_MODEL_FAMILIES: ModelFamily[] = [
  {
    id: 'gemini-auth',
    label: 'Gemini',
    matcher: (modelName) => modelName.startsWith('gemini/'),
    order: 1,
  },
];

const ANTIGRAVITY_MODEL_FAMILIES: ModelFamily[] = [
  {
    id: 'antigravity-gemini',
    label: 'Gemini Models',
    matcher: (modelName) => {
      const name = getDisplayModelName(modelName).toLowerCase();
      return name.startsWith('gemini');
    },
    order: 1,
  },
  {
    id: 'antigravity-3p',
    label: 'Claude & Third-Party Models',
    matcher: (modelName) => {
      const name = getDisplayModelName(modelName).toLowerCase();
      return name.startsWith('claude') || name.startsWith('gpt');
    },
    order: 2,
  },
];

const PROVIDER_MODEL_FAMILIES: Partial<Record<QuotaProviderId, ModelFamily[]>> = {
  google: [...GOOGLE_MODEL_FAMILIES, ...ANTIGRAVITY_MODEL_FAMILIES],
};

function getModelFamily(modelName: string, providerId: QuotaProviderId): ModelFamily | null {
  const families = PROVIDER_MODEL_FAMILIES[providerId] ?? [];
  for (const family of families) {
    if (family.matcher(modelName)) {
      return family;
    }
  }
  return null;
}

export function getAllModelFamilies(providerId: QuotaProviderId): ModelFamily[] {
  return PROVIDER_MODEL_FAMILIES[providerId] ?? [];
}

export function sortModelFamilies(families: ModelFamily[]): ModelFamily[] {
  return [...families].sort((a, b) => a.order - b.order);
}

export function groupModelsByFamilyWithGetter<T>(
  models: T[],
  getModelName: (model: T) => string,
  providerId: QuotaProviderId
): Map<string | null, T[]> {
  const groups = new Map<string | null, T[]>();

  for (const model of models) {
    const modelName = getModelName(model);
    const family = getModelFamily(modelName, providerId);
    const familyId = family?.id ?? null;

    if (!groups.has(familyId)) {
      groups.set(familyId, []);
    }
    groups.get(familyId)!.push(model);
  }

  return groups;
}

const GEMINI_3_MODEL = /^gemini-3[.-]/;

export function getDefaultModels(
  providerId: QuotaProviderId,
  availableModels: string[]
): string[] {
  return availableModels.filter((model) => {
    if (providerId === 'claude') return true;
    // A quota row may name its auth source as a `provider/model` prefix.
    const modelName = getDisplayModelName(model).toLowerCase();
    // Gemini 3.x, including the dotted (gemini-3.6-flash) and hyphenated
    // (gemini-3-6-flash) minor versions
    if (GEMINI_3_MODEL.test(modelName)) return true;
    if (modelName.startsWith('claude-')) return true;
    return false;
  });
}
