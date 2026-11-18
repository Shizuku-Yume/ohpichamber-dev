import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Model } from '@openchamber/agent-contract';
import { cycleThinkingVariant } from './cycleThinkingVariant';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSelectionStore, ROOT_SELECTION_AGENT } from '@/sync/selection-store';

const PROVIDER_ID = 'omp';
const MODEL_ID = 'reasoning-model';
const SESSION_ID = 'ses_effort';

const reasoningModel: Model = {
  modelId: MODEL_ID,
  provider: PROVIDER_ID,
  name: MODEL_ID,
  modalities: ['text'],
  contextWindow: 200_000,
  maxOutputTokens: 8_000,
  reasoningEffortSupported: true,
  reasoningOptions: [
    { reasoningEffort: 'low', label: 'Low', budgetTokens: null },
    { reasoningEffort: 'medium', label: 'Medium', budgetTokens: null },
    { reasoningEffort: 'high', label: 'High', budgetTokens: null },
  ],
  variants: [],
  pricing: null,
};

const configInitial = useConfigStore.getState();
const selectionInitial = useSelectionStore.getState();

const install = (model: Model, effort: string | undefined) => {
  useConfigStore.setState({
    providers: [{ providerId: PROVIDER_ID, name: PROVIDER_ID, endpoint: null, protocol: null, authMethods: [], auth: { status: 'missing' }, models: [model] }],
    providersLoaded: true,
    currentProviderId: PROVIDER_ID,
    currentModelId: MODEL_ID,
    currentAgentName: ROOT_SELECTION_AGENT,
    currentReasoningEffort: effort,
    currentVariant: undefined,
    currentVariantSelection: { override: undefined, inherited: undefined },
  });
};

beforeEach(() => install(reasoningModel, 'medium'));
afterEach(() => {
  useConfigStore.setState(configInitial, true);
  useSelectionStore.setState(selectionInitial, true);
});

describe('cycleThinkingVariant', () => {
  test('steps a reasoning model through its effort options and records the session level', () => {
    expect(cycleThinkingVariant(undefined)).toBe(true);
    expect(useConfigStore.getState().currentReasoningEffort).toBe('high');
    // The top wraps to off, the same order the desktop panel lists.
    expect(cycleThinkingVariant(undefined)).toBe(true);
    expect(useConfigStore.getState().currentReasoningEffort).toBe('off');
  });

  test('records both the effort and a cleared route for the session', () => {
    install(reasoningModel, 'low');
    expect(cycleThinkingVariant(SESSION_ID)).toBe(true);
    expect(useConfigStore.getState().currentReasoningEffort).toBe('medium');
    expect(useSelectionStore.getState().getAgentModelVariantForSession(
      SESSION_ID, ROOT_SELECTION_AGENT, PROVIDER_ID, MODEL_ID,
    )).toBeNull();
    expect(cycleThinkingVariant(SESSION_ID)).toBe(true);
    expect(useSelectionStore.getState().getAgentModelReasoningEffortForSession(
      SESSION_ID, ROOT_SELECTION_AGENT, PROVIDER_ID, MODEL_ID,
    )).toBe('high');
  });

  test('keeps the legacy route cycle working for a variants-only catalog', () => {
    const legacy: Model = {
      ...reasoningModel,
      reasoningEffortSupported: false,
      reasoningOptions: [],
      variants: [{ variant: 'low', label: 'Low', reasoningEffort: null }, { variant: 'high', label: 'High', reasoningEffort: null }],
    };
    install(legacy, undefined);
    expect(cycleThinkingVariant(undefined)).toBe(true);
    expect(useConfigStore.getState().currentVariant).toBe('low');
    expect(useSelectionStore.getState().getAgentModelVariantForSession(
      SESSION_ID, ROOT_SELECTION_AGENT, PROVIDER_ID, MODEL_ID,
    ) ?? undefined).toBeUndefined();
  });

  test('reports false for a model without effort levels or routes', () => {
    install({ ...reasoningModel, reasoningEffortSupported: false, reasoningOptions: [], variants: [] }, 'medium');
    expect(cycleThinkingVariant(undefined)).toBe(false);
    expect(useConfigStore.getState().currentReasoningEffort).toBe('medium');
  });
});
