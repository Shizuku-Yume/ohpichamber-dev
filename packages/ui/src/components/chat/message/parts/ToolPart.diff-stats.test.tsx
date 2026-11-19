import { act } from 'react';
import { expect, test } from 'bun:test';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { ToolCallPart, ToolResultPart } from '@openchamber/agent-contract';
import { SyncProvider } from '@/sync/sync-context';
import { I18nProvider } from '@/lib/i18n';
import { ThemeSystemContext, type ThemeContextValue } from '@/contexts/theme-system-context';
import { getDefaultTheme } from '@/lib/theme/themes';
import { useGuestsStore } from '@/lib/guests/store';

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
              <ToolPart part={part} pairedCall={call} isExpanded={expanded} isMobile={false} onToggle={() => { }} />
            </ThemeSystemContext.Provider>
          </I18nProvider>
        </SyncProvider>,
      ));
    };
<<<<<<< HEAD
    await render({
      type: 'tool_result', partId: 'edit-result', toolCallId: 'edit', toolName: 'edit', isError: false,
      output: {
        content: [{ type: 'text', text: 'Updated src/example.ts' }], details: {
          path: 'src/example.ts', diff: '-1|old\n+1|new\n+2|another',
        }
      },
    }, true);
    expect(container.textContent).toContain('src/example.ts');
    expect(container.textContent).toContain('+2/-1');
    // The performed diff renders through the rich viewer; a plain patch is the
    // oversized/error fallback. Either surface must be present for the result.
    expect(container.querySelector('diffs-container, pre')).not.toBeNull();
    await render({
      type: 'tool_call', partId: 'write-call', toolCallId: 'write', toolName: 'write',
      input: { path: 'new.ts', content: 'one\ntwo' }, status: 'completed'
    });
    expect(container.textContent).not.toContain('+2');
    const runningEditWithPreview: ToolCallPart = {
      type: 'tool_call', partId: 'live-edit-call', toolCallId: 'live-edit', toolName: 'edit',
      input: { path: 'src/live.ts' }, status: 'running',
      editPreview: {
        files: [{ path: 'src/live.ts', diff: '-1|before\n+1|after', firstChangedLine: 1, op: 'update' }],
        streaming: true,
      },
    };
    await render(runningEditWithPreview, true);
    const rAF1 = Promise.withResolvers<void>();
    happyWindow.requestAnimationFrame(() => rAF1.resolve());
    await act(async () => rAF1.promise);
    const rAF2 = Promise.withResolvers<void>();
    happyWindow.requestAnimationFrame(() => rAF2.resolve());
    await act(async () => rAF2.promise);
    expect(container.textContent).toContain('src/live.ts');
    expect(container.textContent).toContain('+1/-1');
    expect(container.querySelector('diffs-container, pre')).not.toBeNull();
    await render({
      type: 'tool_result', partId: 'edit-error', toolCallId: 'edit', toolName: 'edit',
      isError: true, error: 'Permission denied', output: { content: [{ type: 'text', text: 'Cannot edit src/example.ts' }] }
    }, true);
    // Re-expanding a collapsed row defers its body by two animation frames, so
    // the error text only exists after that mount has settled.
    await act(async () => {
      await new Promise<void>((resolve) => happyWindow.requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => happyWindow.requestAnimationFrame(() => resolve()));
    });
    expect(container.textContent).toContain('Permission denied');
    expect(container.textContent).toContain('Cannot edit src/example.ts');
    expect(container.textContent).not.toContain('+2/-1');
||||||| bc50ba56aa

    for (const tool of ['patch', 'edit']) {
      await render(tool, {});
      expect(container.textContent).not.toContain('+7');
      await render(tool, { files: [{ file: 'src/example.ts', additions: 7, deletions: 3, status: 'modified' }] });
      expect(container.textContent).toContain('+7/-3');
      // Canonical counts win even when a legacy diff is also present.
      await render(tool, { files: [{ file: 'src/example.ts', additions: 0, deletions: 4, status: 'deleted' }], diff: '+wrong' });
      expect(container.textContent).toContain('+0/-4');
      expect(container.textContent).not.toContain('+7/-3');
      await render(tool, { files: [{ file: 'src/example.ts', additions: 0, deletions: 0, status: 'modified' }] });
      expect(container.textContent).toContain('+0/-0');
      await render(tool, { files: [{ file: 'src/example.ts', additions: 7 }] });
      expect(container.textContent).not.toContain('+7');
    }
    await render('patch', { files: [
      { file: 'src/one.ts', additions: 7, deletions: 3 },
      { file: 'src/two.ts', additions: 2, deletions: 0 },
    ] });
    expect(container.textContent).toContain('+7');
    expect(container.textContent).toContain('-3');
    expect(container.textContent).toContain('+2');

    await render('edit', { diff: '@@ -1 +1 @@\n-old\n+new\n+another' });
    expect(container.textContent).toContain('+2/-1');
    await render('write', {}, { path: 'new.ts', content: 'one\ntwo' });
    expect(container.textContent).toContain('+2');
=======

    for (const tool of ['patch', 'edit']) {
      await render(tool, {});
      expect(container.textContent).not.toContain('+7');
      await render(tool, { files: [{ file: 'src/example.ts', additions: 7, deletions: 3, status: 'modified' }] });
      expect(container.textContent).toContain('+7 −3');
      // Canonical counts win even when a legacy diff is also present.
      await render(tool, { files: [{ file: 'src/example.ts', additions: 0, deletions: 4, status: 'deleted' }], diff: '+wrong' });
      expect(container.textContent).toContain('+0 −4');
      expect(container.textContent).not.toContain('+7 −3');
      await render(tool, { files: [{ file: 'src/example.ts', additions: 0, deletions: 0, status: 'modified' }] });
      expect(container.textContent).toContain('+0 −0');
      await render(tool, { files: [{ file: 'src/example.ts', additions: 7 }] });
      expect(container.textContent).not.toContain('+7');
    }
    await render('patch', { files: [
      { file: 'src/one.ts', additions: 7, deletions: 3 },
      { file: 'src/two.ts', additions: 2, deletions: 0 },
    ] });
    expect(container.textContent).toContain('+7');
    expect(container.textContent).toContain('−3');
    expect(container.textContent).toContain('+2');

    await render('edit', { diff: '@@ -1 +1 @@\n-old\n+new\n+another' });
    expect(container.textContent).toContain('+2 −1');
    await render('write', {}, { path: 'new.ts', content: 'one\ntwo' });
    expect(container.textContent).toContain('+2');
>>>>>>> upstream/main
  } finally {
    await act(async () => { root.unmount(); });
    await happyWindow.happyDOM.abort();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
