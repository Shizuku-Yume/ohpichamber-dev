import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import { canonicalClient } from '@/api/canonicalClient';
import { invalidateSettingsCache } from '@/lib/persistence';
import { switchRuntimeEndpoint } from '@/lib/runtime-switch';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSmallModelStore, type SmallModelAvailabilityScope } from '@/stores/useSmallModelStore';
import { useSmallModelAvailability } from './useSmallModelAvailability';

function Availability({ active = true, scope }: { active?: boolean; scope?: SmallModelAvailabilityScope }) {
  const availability = useSmallModelAvailability('/repo', active, scope);
  return <output>{availability}</output>;
}

let root: Root;
let host: HTMLDivElement;
let dom: Window;
let restorers: Array<() => void>;
let modelFetchCount = 0;
let resolvedWorkspace = false;
let requestedWorkspace: string | null = null;
let descriptors: Record<string, PropertyDescriptor | undefined>;
beforeEach(() => {
  modelFetchCount = 0;
  resolvedWorkspace = false;
  requestedWorkspace = null;
  dom = new Window({ url: 'https://availability-hook.test' });
  const globals = { window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, Event: dom.Event, CustomEvent: dom.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true };
  descriptors = {};
  for (const [key, value] of Object.entries(globals)) {
    descriptors[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  switchRuntimeEndpoint({ apiBaseUrl: 'https://availability-hook.test', runtimeKey: `availability-hook-${crypto.randomUUID()}` });
  invalidateSettingsCache();
  useSmallModelStore.getState().invalidate();
  useConfigStore.setState({ currentProviderId: 'composer', currentModelId: 'haiku' });
  const resolve = spyOn(canonicalClient, 'resolveWorkspace').mockImplementation(async directory => {
    resolvedWorkspace = true;
    return { workspaceId: 'workspace-composer', projectId: 'project-a', name: directory };
  });
  const models = spyOn(canonicalClient, 'getModels').mockImplementation(async workspaceId => {
    modelFetchCount += 1;
    requestedWorkspace = workspaceId;
    return { workspaceId, revision: '0', models: [{ provider: 'composer', modelId: 'haiku', name: 'Haiku', modalities: ['text'], contextWindow: 8000, maxOutputTokens: 2000, reasoningEffortSupported: false, reasoningOptions: [], variants: [], pricing: null }] };
  });
  const fetcher = spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({}));
  restorers = [() => resolve.mockRestore(), () => models.mockRestore(), () => fetcher.mockRestore()];
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  for (const restore of restorers.reverse()) restore();
  invalidateSettingsCache();
  dom.close();
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

describe('observable canonical availability subscription', () => {
  test('a selected provider/model change refreshes an open control without another availability-store mutation', async () => {
    await act(async () => root.render(<Availability />));
    expect(host.textContent).toBe('available');
    await act(async () => { useConfigStore.setState({ currentProviderId: 'missing', currentModelId: 'missing-model' }); });
    expect(host.textContent).toBe('unavailable');
    expect(modelFetchCount).toBe(2);
  });
  test('prepared target preference and workspace outrank an available composer selection', async () => {
    const scope = { workspaceId: 'workspace-target', preferred: { providerId: 'target', modelId: 'target-model' } };
    await act(async () => root.render(<Availability scope={scope} />));
    expect(host.textContent).toBe('unavailable');
    expect(requestedWorkspace).toBe('workspace-target');
    expect(resolvedWorkspace).toBe(false);
    await act(async () => { useConfigStore.setState({ currentProviderId: 'another', currentModelId: 'another-model' }); });
    expect(host.textContent).toBe('unavailable');
    expect(modelFetchCount).toBe(1);
  });
  test('a closed control does not fetch when its selection changes and refreshes when opened', async () => {
    await act(async () => root.render(<Availability active={false} />));
    await act(async () => { useConfigStore.setState({ currentProviderId: 'missing', currentModelId: 'missing-model' }); });
    expect(modelFetchCount).toBe(0);
    await act(async () => root.render(<Availability />));
    expect(host.textContent).toBe('unavailable');
    expect(modelFetchCount).toBe(1);
  });
});
