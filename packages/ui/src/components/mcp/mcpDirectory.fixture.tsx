import { afterEach, beforeEach, mock, spyOn } from 'bun:test';
import { Window } from 'happy-dom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TooltipProvider } from '@/components/ui/tooltip';
import { hostFilesystem } from '@/lib/host-filesystem';
import { I18nProvider } from '@/lib/i18n';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useMcpConfigStore } from '@/stores/useMcpConfigStore';
import { useSessionUIStore } from '@/sync/session-ui-store';

type LoadMcpConfigs = (options?: { force?: boolean; directory?: string | null }) => Promise<boolean>;

type McpDirectoryHarness = {
  root: Root | null;
  extraSpies: Array<{ mockRestore: () => void }>;
  configRequests: Array<Parameters<LoadMcpConfigs>[0]>;
};

export const setupMcpDirectoryHarness = () => {
  const harness: McpDirectoryHarness = {
    root: null,
    extraSpies: [],
    configRequests: [],
  };
  const initialSessionState = useSessionUIStore.getState();
  let restoreGlobals = () => {};
  let originalLoadMcpConfigs: LoadMcpConfigs;
  const loadMcpConfigs = mock(async (options?: Parameters<LoadMcpConfigs>[0]) => {
    harness.configRequests.push(options);
    return true;
  });

  beforeEach(() => {
    const dom = new Window();
    const globals = {
      window: dom,
      document: dom.document,
      Event: dom.Event,
      PointerEvent: dom.PointerEvent,
      KeyboardEvent: dom.KeyboardEvent,
      HTMLElement: dom.HTMLElement,
      Element: dom.Element,
      Node: dom.Node,
      requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
      cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    const descriptors = Object.getOwnPropertyDescriptors(globalThis);
    Object.assign(globalThis, globals);
    restoreGlobals = () => {
      for (const key of Object.keys(globals)) {
        const descriptor = descriptors[key];
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    };

    useDirectoryStore.setState({ currentDirectory: 'C:/proj-a' });
    useSessionUIStore.setState({
      currentSessionId: null,
      currentSessionDirectory: null,
      newSessionDraft: { ...initialSessionState.newSessionDraft, open: false },
    });
    harness.configRequests.length = 0;
    originalLoadMcpConfigs = useMcpConfigStore.getState().loadMcpConfigs;
    useMcpConfigStore.setState({ loadMcpConfigs });
  });

  afterEach(async () => {
    if (harness.root) {
      const mounted = harness.root;
      harness.root = null;
      await act(async () => mounted.unmount());
    }
    useMcpConfigStore.setState({ loadMcpConfigs: originalLoadMcpConfigs });
    for (const spy of harness.extraSpies.splice(0)) spy.mockRestore();
    useSessionUIStore.setState(initialSessionState);
    restoreGlobals();
  });

  const renderNode = async (element: React.ReactNode) => {
    const host = document.createElement('div');
    document.body.append(host);
    const mounted = createRoot(host);
    harness.root = mounted;
    await act(async () => {
      mounted.render(
        <I18nProvider>
          <TooltipProvider>
            {element}
          </TooltipProvider>
        </I18nProvider>,
      );
    });
    return host;
  };

  const openChatDraft = (draftId = 100) => {
    useSessionUIStore.setState({
      currentSessionId: null,
      currentSessionDirectory: null,
      newSessionDraft: {
        ...initialSessionState.newSessionDraft,
        draftId, open: true, target: 'chat', preparedChatDirectory: null,
      },
    });
  };

  const openProjectDraft = (directoryOverride: string) => {
    useSessionUIStore.setState({ newSessionDraft: {
      ...initialSessionState.newSessionDraft, open: true, target: 'project', directoryOverride,
    } });
  };

  const prepareFixture = () => {
    const homeSpy = spyOn(hostFilesystem, 'getFilesystemHomeInfo').mockResolvedValue({ home: '/home/test', chatsRoot: '/chats' });
    const createSpy = spyOn(hostFilesystem, 'createDirectory').mockImplementation(async (path) => ({ success: true, path }));
    harness.extraSpies.push(homeSpy, createSpy);
    return createSpy;
  };

  return { harness, renderNode, openChatDraft, openProjectDraft, prepareFixture };
};
