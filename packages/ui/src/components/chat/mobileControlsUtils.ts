import type { Agent } from '@openchamber/agent-contract';
import { getProviderModelDisplayName, type DisplayProvider } from '@/lib/modelDisplay';
import type { I18nKey, I18nParams } from '@/lib/i18n';

export type MobileControlsPanel = 'model' | 'agent' | 'variant' | 'effort' | null;

const capitalizeLabel = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export const getAgentDisplayName = (
    agents: readonly Pick<Agent, 'agentId' | 'name'>[],
    agentId?: string,
    fallbackLabel = '',
) => {
    if (agentId) return agents.find((agent) => agent.agentId === agentId)?.name ?? agentId;
    const fallbackAgent = agents.find((agent) => agent.agentId === 'build') ?? agents[0];
    return fallbackAgent?.name ?? fallbackLabel;
};

export const getModelDisplayName = (
    provider: DisplayProvider,
    modelId: string | undefined,
    fallbackLabel = '',
) => {
    return getProviderModelDisplayName(provider, modelId, { fallbackLabel });
};

/**
 * The composer's effort label is tinted by how hard the model thinks: only the
 * `default` level stays grey; light levels and any unknown name read info,
 * medium and high warning, the top levels error. Pure status text colors, so
 * old WebViews without color-mix render them; opacity keeps them quiet.
 */
const EFFORT_TONE_CLASS = {
    default: 'text-muted-foreground',
    info: 'text-[var(--status-info-text)] opacity-75',
    warning: 'text-[var(--status-warning-text)] opacity-75',
    error: 'text-[var(--status-error-text)] opacity-75',
} as const;

type EffortTone = keyof typeof EFFORT_TONE_CLASS;

const getEffortTone = (variant?: string): EffortTone => {
    const name = variant?.trim().toLowerCase();
    if (!name || name === 'default') return 'default';
    if (name === 'medium' || name === 'high') return 'warning';
    if (name === 'xhigh' || name === 'max') return 'error';
    return 'info';
};

export const getEffortToneClass = (variant?: string) => EFFORT_TONE_CLASS[getEffortTone(variant)];

/** Label keys for the effort levels OMP names; unknown labels are shown as typed. */
const EFFORT_LABEL_KEYS = {
    minimal: 'effort.minimal',
    low: 'effort.low',
    medium: 'effort.medium',
    high: 'effort.high',
    xhigh: 'effort.xhigh',
    max: 'effort.max',
    auto: 'effort.auto',
    none: 'effort.none',
} satisfies Record<'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'auto' | 'none', I18nKey>;

type KnownEffortLabel = keyof typeof EFFORT_LABEL_KEYS;

const isKnownEffortLabel = (label: string): label is KnownEffortLabel =>
    Object.hasOwn(EFFORT_LABEL_KEYS, label);

/**
 * The composer's label for one effort level: a known level is translated, a
 * numeric budget (`16000`) is shown as written, and an unrecognised custom
 * name keeps the worker's spelling with only its first letter raised.
 */
export const formatEffortLabel = (
    variant: string | undefined,
    t: (key: I18nKey, params?: I18nParams) => string,
) => {
    const trimmed = variant?.trim() ?? '';
    if (trimmed.length === 0) return t('effort.default');
    if (/^\d+(\.\d+)?$/.test(trimmed)) return trimmed;
    const name = trimmed.toLowerCase();
    return isKnownEffortLabel(name) ? t(EFFORT_LABEL_KEYS[name]) : capitalizeLabel(trimmed);
};

