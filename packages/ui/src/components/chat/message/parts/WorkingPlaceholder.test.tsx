import { afterAll, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';
import { I18nProvider } from '@/lib/i18n';
import type { ModelMetadata } from '@/types';
import { useConfigStore } from '@/stores/useConfigStore';
import { useUIStore } from '@/stores/useUIStore';
import { WorkingPlaceholder } from './WorkingPlaceholder';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser,
  document: browser.document,
  navigator: browser.navigator,
  Node: browser.Node,
  Element: browser.Element,
  HTMLElement: browser.HTMLElement,
  SVGElement: browser.SVGElement,
  Event: browser.Event,
  MouseEvent: browser.MouseEvent,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
});

afterAll(() => {
  browser.close();
});

const renderPlaceholder = async (element: React.ReactElement) => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<I18nProvider>{element}</I18nProvider>);
  });
  return {
    container,
    rerender: async (next: React.ReactElement) => {
      await act(async () => {
        root.render(<I18nProvider>{next}</I18nProvider>);
      });
    },
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
};

describe('WorkingPlaceholder provider mark', () => {
  test('a chosen provider icon wins over the remote logo', async () => {
    useUIStore.setState({ customProviderIcons: { sharellm: 'server' } });
    const view = await renderPlaceholder(
      <WorkingPlaceholder
        isWorking
        status={{ key: 'chat.agentStatus.thinking' }}
        providerId="sharellm"
      />,
    );

    const mark = view.container.querySelector('use');
    expect(mark?.getAttribute('href')).toBe('#oc-server');
    expect(view.container.querySelector('img')).toBeNull();

    await view.unmount();
    useUIStore.setState({ customProviderIcons: {} });
  });

  test('a failed remote logo leaves the chip empty and is not announced', async () => {
    useUIStore.setState({ customProviderIcons: {} });
    // A remote logo is only drawn for a provider the catalog carries; a custom
    // id gets the bundled fallback instead and never requests one.
    const initialMetadata = useConfigStore.getState().modelsMetadata;
    useConfigStore.setState({
      modelsMetadata: new Map<string, ModelMetadata>([['sharellm/sharellm-model', { id: 'sharellm-model', providerId: 'sharellm' }]]),
    });
    const view = await renderPlaceholder(
      <WorkingPlaceholder
        isWorking
        status={{ key: 'chat.agentStatus.thinking' }}
        providerId="sharellm"
      />,
    );

    const image = view.container.querySelector('img');
    expect(image?.getAttribute('alt')).toBe('');
    expect(image?.getAttribute('aria-hidden')).toBe('true');
    await act(async () => {
      image?.dispatchEvent(new Event('error'));
    });
    expect(view.container.querySelector('img')).toBeNull();
    expect(view.container.querySelector('use')).toBeNull();

    await view.unmount();
    useConfigStore.setState({ modelsMetadata: initialMetadata });
  });
});

describe('WorkingPlaceholder status text', () => {
  test('shows the intent the moment it changes, with no dwell', async () => {
    const view = await renderPlaceholder(
      <WorkingPlaceholder isWorking status={{ key: 'chat.agentStatus.working' }} />,
    );
    expect(view.container.textContent).toContain('Working');

    await view.rerender(
      <WorkingPlaceholder isWorking status={{ key: 'chat.agentStatus.usingTool', name: 'read', text: 'Reading the config' }} />,
    );
    // The old 1.2s queue would still show "Working" here.
    expect(view.container.textContent).toContain('Reading the config');

    await view.rerender(
      <WorkingPlaceholder isWorking status={{ key: 'chat.agentStatus.thinking' }} />,
    );
    expect(view.container.textContent).toContain('Thinking');

    await view.unmount();
  });

  test('a permission wait replaces the intent at once and is announced assertively', async () => {
    const view = await renderPlaceholder(
      <WorkingPlaceholder isWorking status={{ key: 'chat.agentStatus.usingTool', name: 'bash', text: 'Running the tests' }} />,
    );
    expect(view.container.querySelector('[role="status"]')?.getAttribute('aria-live')).toBe('polite');

    await view.rerender(
      <WorkingPlaceholder isWorking status={{ key: 'chat.agentStatus.usingTool', name: 'bash', text: 'Running the tests' }} isWaitingForPermission />,
    );
    const row = view.container.querySelector('[role="status"]');
    expect(row?.getAttribute('aria-live')).toBe('assertive');
    expect(row?.getAttribute('data-waiting')).toBe('true');
    expect(view.container.textContent).toContain('Waiting for permission');

    await view.unmount();
  });

  test('retry state shows its countdown instead of the status text', async () => {
    const view = await renderPlaceholder(
      <WorkingPlaceholder isWorking status={{ key: 'chat.agentStatus.usingTool', name: 'bash', text: 'Running the tests' }} retryInfo={{ attempt: 2, maxAttempts: 5, next: 30 }} />,
    );
    expect(view.container.textContent).toContain('Retrying');
    expect(view.container.textContent).toContain('attempt 2 of 5');
    expect(view.container.textContent).not.toContain('Running the tests');

    await view.unmount();
  });
});
