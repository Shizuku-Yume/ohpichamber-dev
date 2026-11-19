import { beforeEach, describe, expect, test } from 'bun:test';

import { useUIStore } from '@/stores/useUIStore';

<<<<<<< HEAD
const __dirname = dirname(fileURLToPath(import.meta.url));
const contextPanelSource = readFileSync(join(__dirname, '..', 'ContextSurfacePanes.tsx'), 'utf-8');
const browserPaneSource = readFileSync(join(__dirname, '..', '..', 'browser', 'BrowserPane.tsx'), 'utf-8');
||||||| bc50ba56aa
const __dirname = dirname(fileURLToPath(import.meta.url));
// The agent's browser opener is registered once, with the keep-alive panes.
const contextPanelSource = readFileSync(join(__dirname, '..', 'ContextSurfacePanes.tsx'), 'utf-8');
const browserPaneSource = readFileSync(join(__dirname, '..', '..', 'browser', 'BrowserPane.tsx'), 'utf-8');
=======
>>>>>>> upstream/main
const DIRECTORY = '/path/to/repository';

beforeEach(() => {
  useUIStore.setState({ contextPanelByDirectory: {}, contextRailOrder: [] });
});

describe('issue #3175 browser capture while the agent works in the background', () => {
  test('an agent browser.open creates the tab without revealing the panel', () => {
    useUIStore.getState().openAgentBrowserTab(DIRECTORY, 'https://example.com', 'ses_1');

    const panel = useUIStore.getState().contextPanelByDirectory[DIRECTORY];
    expect(panel.isOpen).toBe(false);
    expect(panel.tabs).toHaveLength(1);
    expect(panel.tabs[0]?.mode).toBe('browser');
    expect(panel.tabs[0]?.targetPath).toBe('https://example.com');
  });

});
