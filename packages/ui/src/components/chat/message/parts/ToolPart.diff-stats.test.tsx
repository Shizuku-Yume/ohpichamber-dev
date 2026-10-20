import { act } from 'react';
import { expect, test } from 'bun:test';
import { plugin } from 'bun';
import { pathToFileURL } from 'node:url';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { ToolCallPart, ToolResultPart } from '@openchamber/agent-contract';
import { SyncProvider } from '@/sync/sync-context';
import { I18nProvider } from '@/lib/i18n';
import { ThemeSystemContext, type ThemeContextValue } from '@/contexts/theme-system-context';
import { getDefaultTheme } from '@/lib/theme/themes';
import { useGuestsStore } from '@/lib/guests/store';

// Bun does not implement Vite's worker asset-query imports.
plugin({
  name: 'tool-guest-worker-url',
  setup(build) {
    build.onLoad({ filter: /markdown-shiki\.worker\.ts\?worker&url$/ }, ({ path }) => ({
      contents: `export default ${JSON.stringify(pathToFileURL(path.split('?')[0]).href)};`,
      loader: 'js',
    }));
  },
});

const { default: ToolPart } = await import('./ToolPart');

const unexpectedThemeChange = (): never => { throw new Error('Rendering must not change the theme'); };
const theme = getDefaultTheme(false);
const themeContext: ThemeContextValue = {
  currentTheme: theme,
  availableThemes: [theme],
  setTheme: unexpectedThemeChange,
  customThemesLoading: false,
  reloadCustomThemes: unexpectedThemeChange,
  importTheme: unexpectedThemeChange,
  deleteImportedTheme: unexpectedThemeChange,
  customThemeIds: [],
  isSystemPreference: false,
  setSystemPreference: unexpectedThemeChange,
  themeMode: 'light',
  setThemeMode: unexpectedThemeChange,
  lightThemeId: theme.metadata.id,
  darkThemeId: getDefaultTheme(true).metadata.id,
  setLightThemePreference: unexpectedThemeChange,
  setDarkThemePreference: unexpectedThemeChange,
};

test('native edit results show performed diffs without treating write input as added lines', async () => {
  const happyWindow = new Window({ url: 'http://localhost' });
  const globals = {
    window: happyWindow,
    document: happyWindow.document,
    navigator: happyWindow.navigator,
    localStorage: happyWindow.localStorage,
    customElements: happyWindow.customElements,
    Node: happyWindow.Node,
    Text: happyWindow.Text,
    NodeList: happyWindow.NodeList,
    Element: happyWindow.Element,
    HTMLElement: happyWindow.HTMLElement,
    SVGElement: happyWindow.SVGElement,
    ShadowRoot: happyWindow.ShadowRoot,
    Document: happyWindow.Document,
    DocumentFragment: happyWindow.DocumentFragment,
    Range: happyWindow.Range,
    CSSStyleSheet: happyWindow.CSSStyleSheet,
    Event: happyWindow.Event,
    CustomEvent: happyWindow.CustomEvent,
    requestAnimationFrame: happyWindow.requestAnimationFrame.bind(happyWindow),
    cancelAnimationFrame: happyWindow.cancelAnimationFrame.bind(happyWindow),
    getComputedStyle: happyWindow.getComputedStyle.bind(happyWindow),
    ResizeObserver: happyWindow.ResizeObserver,
    MutationObserver: happyWindow.MutationObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const previous = Object.keys(globals).map(
    (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
  );
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  try {
    useGuestsStore.setState({ status: 'ready', guests: [], runtimeKey: 'test' });
    const call: ToolCallPart = {
      type: 'tool_call', partId: 'edit-call', toolCallId: 'edit', toolName: 'edit',
      input: { path: 'src/example.ts', edits: [{ op: 'update', diff: '@@\n-old\n+new' }] }, status: 'completed',
    };
    const render = async (part: ToolCallPart | ToolResultPart, expanded = false) => {
      await act(async () => root.render(
        <SyncProvider directory="">
          <I18nProvider>
            <ThemeSystemContext.Provider value={themeContext}>
              <ToolPart part={part} pairedCall={call} isExpanded={expanded} isMobile={false} onToggle={() => {}} />
            </ThemeSystemContext.Provider>
          </I18nProvider>
        </SyncProvider>,
      ));
    };
    await render({
      type: 'tool_result', partId: 'edit-result', toolCallId: 'edit', toolName: 'edit', isError: false,
      output: { content: [{ type: 'text', text: 'Updated src/example.ts' }], details: {
        path: 'src/example.ts', diff: '-1|old\n+1|new\n+2|another',
      } },
    }, true);
    expect(container.textContent).toContain('src/example.ts');
    expect(container.textContent).toContain('+2/-1');
    // The performed diff renders through the rich viewer; a plain patch is the
    // oversized/error fallback. Either surface must be present for the result.
    expect(container.querySelector('diffs-container, pre')).not.toBeNull();
    await render({ type: 'tool_call', partId: 'write-call', toolCallId: 'write', toolName: 'write',
      input: { path: 'new.ts', content: 'one\ntwo' }, status: 'completed' });
    expect(container.textContent).not.toContain('+2');
    await render({ type: 'tool_result', partId: 'edit-error', toolCallId: 'edit', toolName: 'edit',
      isError: true, error: 'Permission denied', output: { content: [{ type: 'text', text: 'Cannot edit src/example.ts' }] } }, true);
    // Re-expanding a collapsed row defers its body by two animation frames, so
    // the error text only exists after that mount has settled.
    await act(async () => {
      await new Promise<void>((resolve) => happyWindow.requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => happyWindow.requestAnimationFrame(() => resolve()));
    });
    expect(container.textContent).toContain('Permission denied');
    expect(container.textContent).toContain('Cannot edit src/example.ts');
    expect(container.textContent).not.toContain('+2/-1');
  } finally {
    await act(async () => { root.unmount(); });
    await happyWindow.happyDOM.abort();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
