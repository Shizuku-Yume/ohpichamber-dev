import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { OmpSetting, OmpSettingValue, OmpSettingsState } from '@openchamber/agent-contract';
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
const { useUIStore } = await import('@/stores/useUIStore');
const persistence = await import('@/lib/persistence');
const directory = await import('@/hooks/useSettingsDirectory');
const models = await import('@/hooks/useSettingsModels');
const omp = await import('@/components/sections/shared/useOmpPageSettings');
const guests = await import('@/lib/guests/load-catalog');
const desktop = await import('@/lib/desktop');
const { OpenChamberToolsSettings } = await import('./OpenChamberToolsSettings');

afterAll(() => window.close());

const HOST_TOOL_KEYS = [
  'agentControlToolEnabled', 'agentScheduleToolEnabled', 'agentWebToolEnabled', 'browserProvider',
  'agentBrowserSharesLogins', 'agentKnowledgeToolEnabled', 'agentNotifyToolEnabled', 'agentUsageToolEnabled',
  'agentTerminalToolEnabled', 'agentRenderToolEnabled', 'agentSecretToolEnabled', 'agentWorkflowToolEnabled',
  'agentWorkflowFeatureAvailable',
] as const;

interface OmpMock {
  state: OmpSettingsState;
  form: Record<string, OmpSettingValue>;
}

const baseOmpState = (overrides: Record<string, OmpSettingValue> = {}, descriptorOverrides: { memoryDefault?: OmpSettingValue } = {}): OmpMock => {
  const imageEnabled: OmpSetting = {
    id: 'generate_image.enabled', type: 'boolean', default: true,
    value: overrides['generate_image.enabled'] ?? true,
    configured: false, placement: { type: 'page', page: 'general', section: 'tools' },
  };
  const memoryBackend: OmpSetting = {
    id: 'memory.backend', type: 'enum', default: descriptorOverrides.memoryDefault ?? 'off',
    value: overrides['memory.backend'] ?? 'off',
    configured: false, placement: { type: 'page', page: 'memory', section: 'backend' },
    // OMP 19.1's own enum ordering; the enable path reads the first non-off.
    enumValues: ['off', 'local', 'hindsight', 'mnemopi', 'sharpshooter'],
  };
  const modelRoles: OmpSetting = {
    id: 'modelRoles', type: 'record', default: {}, configured: true,
    value: overrides.modelRoles ?? { image: 'provider/image-one' },
    placement: { type: 'owned-by', owner: 'model-roles.section.chat' },
  };
  const settings = [imageEnabled, memoryBackend, modelRoles];
  return {
    state: { workspaceId: 'workspace_1', revision: '1', totalCount: settings.length, settings },
    form: {
      'generate_image.enabled': imageEnabled.value,
      'memory.backend': memoryBackend.value,
      modelRoles: modelRoles.value,
    },
  };
};

describe('OpenChamberToolsSettings', () => {
  let host: HTMLDivElement;
  let root: Root;
  let restore: (() => void)[];
  let previous: Record<string, unknown>;
  let ompWrites: Array<{ id: string; value: unknown }>;

  const mockOmp = (mock: OmpMock) => {
    const settingsSpy = spyOn(omp, 'useOmpPageSettings').mockReturnValue({
      state: mock.state, form: mock.form, loading: false, saving: false,
      pageSettings: mock.state.settings,
      getSectionSettings: (section: string) => mock.state.settings.filter((s) => s.placement.type === 'page' && s.placement.section === section),
      updateSetting: async (settingOrId, value) => {
        ompWrites.push({ id: typeof settingOrId === 'string' ? settingOrId : settingOrId.id, value });
      },
      updateSettings: async (build) => {
        ompWrites.push(...build(mock.state));
        return true;
      },
    });
    restore.push(() => settingsSpy.mockRestore());
  };

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    ompWrites = [];
    restore = [];
    previous = Object.fromEntries(HOST_TOOL_KEYS.map((key) => [key, useUIStore.getState()[key]]));
    useUIStore.setState({
      agentControlToolEnabled: true, agentScheduleToolEnabled: true, agentWebToolEnabled: true,
      agentBrowserSharesLogins: false, agentKnowledgeToolEnabled: true, agentNotifyToolEnabled: false,
      agentUsageToolEnabled: false, agentTerminalToolEnabled: false, agentRenderToolEnabled: true,
      agentSecretToolEnabled: true, agentWorkflowToolEnabled: true, agentWorkflowFeatureAvailable: true,
    });
    mockOmp(baseOmpState());
    const spies = [
      spyOn(directory, 'useSettingsDirectory').mockReturnValue(null),
      spyOn(models, 'useSettingsImageModels').mockReturnValue([{ provider: 'provider', modelId: 'image-one', name: 'Image One' }]),
      spyOn(guests, 'loadGuestCatalog').mockResolvedValue(undefined),
      spyOn(persistence, 'updateDesktopSettings').mockResolvedValue({ ok: true }),
    ];
    restore.push(...spies.map((spy) => () => spy.mockRestore()));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    restore.forEach((reset) => reset());
    useUIStore.setState(previous);
    host.remove();
  });

  const flipSwitch = async (id: string) => {
    const row = host.querySelector(`[data-settings-item="${id}"]`);
    expect(row, `row ${id}`).not.toBeNull();
    const switchEl = row!.querySelector('[role="switch"]');
    expect(switchEl, `switch in ${id}`).not.toBeNull();
    await act(async () => (switchEl as HTMLElement).click());
  };

  test('renders every host tool row on the general page anchors', async () => {
    await act(async () => root.render(<I18nProvider><OpenChamberToolsSettings /></I18nProvider>));
    for (const id of [
      'sessions.agent-control-tool', 'sessions.agent-workflow-tool', 'sessions.agent-schedule-tool',
      'sessions.agent-web-tool', 'sessions.browser-provider', 'sessions.agent-terminal-tool',
      'sessions.agent-render-tool', 'sessions.agent-image-tool', 'sessions.agent-secret-tool',
      'sessions.agent-notify-tool', 'sessions.agent-memory-tool', 'sessions.agent-knowledge-tool',
      'sessions.agent-usage-tool',
    ]) {
      expect(host.querySelector(`[data-settings-item="${id}"]`), `${id} renders`).not.toBeNull();
    }
    // The memory row must not claim the MemoryPage-owned OMP anchor.
    expect(host.querySelector('[data-settings-item="omp.memory.backend"]')).toBeNull();
  });

  test('schedule toggle persists through updateDesktopSettings', async () => {
    await act(async () => root.render(<I18nProvider><OpenChamberToolsSettings /></I18nProvider>));
    await flipSwitch('sessions.agent-schedule-tool');
    expect(useUIStore.getState().agentScheduleToolEnabled).toBe(false);
    expect(persistence.updateDesktopSettings).toHaveBeenCalledWith({ agentScheduleToolEnabled: false });
  });

  test('image tool toggle writes OMP generate_image.enabled', async () => {
    await act(async () => root.render(<I18nProvider><OpenChamberToolsSettings /></I18nProvider>));
    await flipSwitch('sessions.agent-image-tool');
    expect(ompWrites).toEqual([{ id: 'generate_image.enabled', value: false }]);
  });

  test('memory toggle on writes the first non-off enum backend when the default is off', async () => {
    await act(async () => root.render(<I18nProvider><OpenChamberToolsSettings /></I18nProvider>));
    await flipSwitch('sessions.agent-memory-tool');
    expect(ompWrites).toEqual([{ id: 'memory.backend', value: 'local' }]);
  });

  test('memory toggle on writes the descriptor default when it is a real backend', async () => {
    mockOmp(baseOmpState({}, { memoryDefault: 'mnemopi' }));
    await act(async () => root.render(<I18nProvider><OpenChamberToolsSettings /></I18nProvider>));
    await flipSwitch('sessions.agent-memory-tool');
    expect(ompWrites).toEqual([{ id: 'memory.backend', value: 'mnemopi' }]);
  });

  test('memory toggle off writes memory.backend off', async () => {
    mockOmp(baseOmpState({ 'memory.backend': 'hindsight' }));
    await act(async () => root.render(<I18nProvider><OpenChamberToolsSettings /></I18nProvider>));
    await flipSwitch('sessions.agent-memory-tool');
    expect(ompWrites).toEqual([{ id: 'memory.backend', value: 'off' }]);
  });

  test('memory settings jump requests the memory page', async () => {
    mockOmp(baseOmpState({ 'memory.backend': 'mnemopi' }));
    await act(async () => root.render(<I18nProvider><OpenChamberToolsSettings /></I18nProvider>));
    const link = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'Memory settings');
    expect(link).toBeDefined();
    await act(async () => link!.click());
    expect(useUIStore.getState().settingsJumpRequest).toEqual({ page: 'memory', itemId: null });
  });

  test('browser logins checkbox renders only on the electron shell', async () => {
    const shell = spyOn(desktop, 'isElectronShell').mockReturnValue(true);
    restore.push(() => shell.mockRestore());
    await act(async () => root.render(<I18nProvider><OpenChamberToolsSettings /></I18nProvider>));
    expect(host.querySelector('[data-settings-item="sessions.agent-browser-logins"]')).not.toBeNull();
    await act(async () => root.unmount());
    shell.mockReturnValue(false);
    root = createRoot(host);
    await act(async () => root.render(<I18nProvider><OpenChamberToolsSettings /></I18nProvider>));
    expect(host.querySelector('[data-settings-item="sessions.agent-browser-logins"]')).toBeNull();
  });

  test('workflow row hides when the feature is unavailable', async () => {
    useUIStore.setState({ agentWorkflowFeatureAvailable: false });
    await act(async () => root.render(<I18nProvider><OpenChamberToolsSettings /></I18nProvider>));
    expect(host.querySelector('[data-settings-item="sessions.agent-workflow-tool"]')).toBeNull();
  });
});
