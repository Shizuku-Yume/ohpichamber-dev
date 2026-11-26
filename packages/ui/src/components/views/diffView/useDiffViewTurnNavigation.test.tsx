import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';

import { useSessionUIStore } from '@/sync/session-ui-store';
import { useDiffViewTurnNavigation } from './useDiffViewTurnNavigation';
import type { DiffScope } from './types';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser, document: browser.document, navigator: browser.navigator,
  Node: browser.Node, Element: browser.Element, HTMLElement: browser.HTMLElement,
  Event: browser.Event, IS_REACT_ACT_ENVIRONMENT: true,
});

const ROOT = '/repo';
const PANEL_SESSION = 'panel-session';
const PINNED_SESSION = 'pinned-session';

type Request = { file: string; sessionId: string | null; turnId?: string; panelSessionId: string | null };

let reactRoot: Root | null = null;
let shown: string[] = [];

type ProbeProps = {
  request: Request | null;
  initialScope?: DiffScope;
  panelSessionId?: string;
  turnDiffSettled?: boolean;
  turnRows?: { file?: string }[];
};

const Probe: React.FC<ProbeProps> = ({ request, initialScope = 'turn', panelSessionId = PANEL_SESSION, turnDiffSettled = true, turnRows = [] }) => {
  const [activeDiffScope] = React.useState<DiffScope>(initialScope);
  const [pending, setPending] = React.useState(request);
  const [, setDisplayFile] = React.useState<string | null>(null);
  const [, setDisplayFileStaged] = React.useState(false);
  const [, setScrollRequestNonce] = React.useState(0);
  const shouldPinAfterAlignRef = React.useRef(false);
  const pendingScrollTargetRef = React.useRef<string | null>(null);
  useDiffViewTurnNavigation({
    visible: true, activeDiffScope, setDisplayFile, setDisplayFileStaged,
    shouldPinAfterAlignRef, pendingScrollTargetRef, expandStackedFile: (path) => { shown.push(path); },
    setScrollRequestNonce, pendingTurnDiffFile: pending, setPendingTurnDiffFile: setPending, diffScope: 'turn',
    panelSessionId, turnDiffSettled, rootDirectory: ROOT,
    lastTurnDiffs: turnRows,
  });
  return null;
};

const pinnedChip: Request = { file: 'src/a.ts', sessionId: PINNED_SESSION, turnId: 'older-turn', panelSessionId: PANEL_SESSION };

const render = async (props: ProbeProps) => {
  reactRoot ??= createRoot(document.createElement('div'));
  await act(async () => reactRoot?.render(<Probe {...props} />));
};

beforeEach(() => {
  shown = [];
  useSessionUIStore.setState({ currentSessionId: PANEL_SESSION });
});

afterEach(async () => {
  await act(async () => reactRoot?.unmount());
  reactRoot = null;
});

describe('useDiffViewTurnNavigation', () => {
  test('a pinned chip whose file is in the turn rows reveals it inside the turn scope', async () => {
    await render({ request: pinnedChip, turnRows: [{ file: 'src/a.ts' }] });
    expect(shown).toEqual(['src/a.ts']);
  });

  test('a pinned chip whose file is absent from the turn rows stays on the turn scope and reveals nothing', async () => {
    await render({ request: pinnedChip, turnRows: [] });
    expect(shown).toEqual([]);
  });

  test('a ready turn that lists other files still does not substitute the workspace diff', async () => {
    await render({ request: pinnedChip, turnRows: [{ file: 'src/other.ts' }] });
    expect(shown).toEqual([]);
  });

  test('an unsettled read keeps the request pending instead of concluding absence', async () => {
    await render({ request: pinnedChip, turnDiffSettled: false, turnRows: [] });
    expect(shown).toEqual([]);
    await render({ request: pinnedChip, turnDiffSettled: true, turnRows: [{ file: 'src/a.ts' }] });
    expect(shown).toEqual(['src/a.ts']);
  });

  test('a chip for another panel session is dropped without revealing', async () => {
    await render({ request: pinnedChip, panelSessionId: 'another-session', turnRows: [{ file: 'src/a.ts' }] });
    expect(shown).toEqual([]);
  });

  test('a consumed request does not reveal again on the next render', async () => {
    await render({ request: pinnedChip, turnRows: [{ file: 'src/a.ts' }] });
    expect(shown).toEqual(['src/a.ts']);
    await render({ request: null, turnRows: [{ file: 'src/a.ts' }] });
    expect(shown).toEqual(['src/a.ts']);
  });
});
