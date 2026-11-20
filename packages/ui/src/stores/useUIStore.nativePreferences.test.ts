import { beforeEach, expect, test } from 'bun:test';
import { createInitialUIState } from './ui/initialState';
import { uiStorePersistOptions } from './ui/persistence';
import { useUIStore } from './useUIStore';
import { modelRefKey } from '@openchamber/agent-contract';

beforeEach(() => {
  useUIStore.setState(createInitialUIState());
});

test('extracted actions and the thin store share native preferences', () => {
  const state = useUIStore.getState();
  expect(state.defaultSessionMode).toBe('main');
  expect(state.agentWorkflowToolEnabled).toBe(true);
  state.setDefaultSessionMode('plan');
  state.setPlanModeAllowAgents(true);
  state.setSavePastedImagesAsFiles(true);
  state.setChatRenderMode('sorted');
  expect(useUIStore.getState()).toMatchObject({
    defaultSessionMode: 'plan', planModeAllowAgents: true,
    savePastedImagesAsFiles: true, chatRenderMode: 'sorted',
  });
  const persisted = uiStorePersistOptions.partialize(useUIStore.getState());
  expect(persisted).toMatchObject({ defaultSessionMode: 'plan', suggestionGenerator: 'session' });
  expect(persisted).not.toHaveProperty('runtimeStatusText');
  expect(persisted).not.toHaveProperty('isRuntimeStatusDialogOpen');
});

test('an absent persisted state retains native defaults and action owners', () => {
  const restored = uiStorePersistOptions.merge(undefined, useUIStore.getState());
  expect(restored.defaultSessionMode).toBe('main');
  expect(restored.setDefaultSessionMode).toBe(useUIStore.getState().setDefaultSessionMode);
  expect(restored.contextPanelByDirectory).toEqual({});
});

test('invalid persisted layout values do not poison restored native preferences', () => {
  const restored = uiStorePersistOptions.merge({
    defaultSessionMode: 'vibe', contextZoneSizes: { left: Number.NaN, right: Number.POSITIVE_INFINITY },
    contextPanelByDirectory: null, contextRailOrder: [null, '', 'files'],
  }, useUIStore.getState());
  expect(restored.defaultSessionMode).toBe('vibe');
  expect(restored.contextZoneSizes).toEqual({});
  expect(restored.contextRailOrder).toEqual(['files']);
  expect(restored.contextPanelByDirectory).toEqual({});
});

test('model preferences use canonical model reference keys', () => {
  const state = useUIStore.getState();
  state.setLastSelectedModel('provider', 'org/model');
  state.rememberLastUsedEffort('provider', 'org/model', 'high');
  expect(useUIStore.getState().lastSelectedModel).toBe(modelRefKey('provider', 'org/model'));
  expect(useUIStore.getState().lastUsedEfforts[modelRefKey('provider', 'org/model')]).toBe('high');
});
