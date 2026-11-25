import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { OmpSetting, OmpSettingValue } from '@openchamber/agent-contract';
import type { Root } from 'react-dom/client';

const window = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window, document: window.document, HTMLElement: window.HTMLElement, Element: window.Element,
  HTMLInputElement: window.HTMLInputElement, navigator: window.navigator, Node: window.Node, Event: window.Event, CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent, PointerEvent: window.PointerEvent, FocusEvent: window.FocusEvent,
  MutationObserver: window.MutationObserver, ResizeObserver: window.ResizeObserver,
  IntersectionObserver: class { observe() { } unobserve() { } disconnect() { } },
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  localStorage: window.localStorage, sessionStorage: window.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true,
});

// Dynamic imports: happy-dom globals must be installed before React and the
// component modules load, so static imports cannot work here.
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const omp = await import('@/components/sections/shared/useOmpPageSettings');
const { ToolsPage } = await import('./ToolsPage');

afterAll(() => window.close());

describe('ToolsPage OMP tools ownership', () => {
  let host: HTMLDivElement;
  let root: Root;
  let restore: (() => void)[];

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    restore = [];
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    restore.forEach((reset) => reset());
    host.remove();
  });

  const renderWith = (settings: OmpSetting[], form: Record<string, OmpSettingValue> = {}) => {
    const settingsSpy = spyOn(omp, 'useOmpPageSettings').mockReturnValue({
      state: { workspaceId: 'workspace_1', revision: '1', totalCount: settings.length, settings },
      form, loading: false, saving: false,
      pageSettings: settings,
      getSectionSettings: (section: string) => settings.filter((s) => s.placement.type === 'page' && s.placement.section === section),
      updateSetting: async () => { },
      updateSettings: async () => true,
    });
    restore.push(() => settingsSpy.mockRestore());
  };

  test('renders OMP tool rows and no host tool anchors', async () => {
    const browserEnabled: OmpSetting = {
      id: 'browser.enabled', type: 'boolean', default: false, value: true,
      configured: false, placement: { type: 'page', page: 'tools', section: 'available' },
    };
    const todoEnabled: OmpSetting = {
      id: 'todo.enabled', type: 'boolean', default: true, value: true,
      configured: false, placement: { type: 'page', page: 'tools', section: 'available' },
    };
    renderWith([browserEnabled, todoEnabled], { 'browser.enabled': true, 'todo.enabled': true });
    await act(async () => root.render(<I18nProvider><ToolsPage /></I18nProvider>));

    // OMP sections and rows are present.
    expect(host.querySelector('[data-settings-item="tools.section.media"]')).not.toBeNull();
    expect(host.querySelector('[data-settings-item="tools.section.code"]')).not.toBeNull();
    expect(host.querySelector('[data-settings-item="tools.section.specialized"]')).not.toBeNull();
    expect(host.querySelector('[data-settings-item="omp.browser.enabled"]')).not.toBeNull();
    expect(host.querySelector('[data-settings-item="omp.todo.enabled"]')).not.toBeNull();

    // Host tool anchors moved to Settings → General; none remain here.
    for (const id of [
      'sessions.agent-control-tool', 'sessions.agent-terminal-tool', 'sessions.agent-browser-logins',
      'sessions.agent-web-tool', 'sessions.browser-provider', 'sessions.agent-knowledge-tool',
      'sessions.agent-notify-tool', 'sessions.agent-render-tool', 'sessions.agent-workflow-tool',
      'sessions.agent-schedule-tool', 'sessions.agent-secret-tool', 'sessions.agent-memory-tool',
      'sessions.agent-usage-tool', 'sessions.agent-image-tool', 'tools.section.host',
    ]) {
      expect(host.querySelector(`[data-settings-item="${id}"]`), `${id} must not render on ToolsPage`).toBeNull();
    }
  });

  test('hides the media section when the browser setting is absent and keeps the code section first', async () => {
    const todoEnabled: OmpSetting = {
      id: 'todo.enabled', type: 'boolean', default: true, value: true,
      configured: false, placement: { type: 'page', page: 'tools', section: 'available' },
    };
    renderWith([todoEnabled], { 'todo.enabled': true });
    await act(async () => root.render(<I18nProvider><ToolsPage /></I18nProvider>));

    expect(host.querySelector('[data-settings-item="tools.section.media"]')).toBeNull();
    expect(host.querySelector('[data-settings-item="tools.section.code"]')).not.toBeNull();
  });
});
