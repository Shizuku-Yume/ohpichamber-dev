import { act } from 'react';
import { describe, expect, test } from 'bun:test';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';

import { I18nProvider } from '@/lib/i18n';
import { WaitToolCard, type WaitToolCardProps } from './WaitToolCard';

async function withWaitHarness(
    run: (harness: {
        container: HTMLElement;
        renderCard: (props: WaitToolCardProps) => Promise<void>;
    }) => Promise<void>,
) {
    const happyWindow = new Window({ url: 'http://localhost' });
    const globals = {
        window: happyWindow,
        document: happyWindow.document,
        navigator: happyWindow.navigator,
        localStorage: happyWindow.localStorage,
        Node: happyWindow.Node,
        Text: happyWindow.Text,
        Element: happyWindow.Element,
        HTMLElement: happyWindow.HTMLElement,
        SVGElement: happyWindow.SVGElement,
        requestAnimationFrame: happyWindow.requestAnimationFrame.bind(happyWindow),
        cancelAnimationFrame: happyWindow.cancelAnimationFrame.bind(happyWindow),
        IS_REACT_ACT_ENVIRONMENT: true,
    };
    const descriptors = Object.keys(globals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
    for (const [name, value] of Object.entries(globals)) {
        Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const renderCard = async (props: WaitToolCardProps) => {
        await act(async () => {
            root.render(
                <I18nProvider>
                    <WaitToolCard {...props} />
                </I18nProvider>,
            );
        });
    };

    try {
        await run({ container, renderCard });
    } finally {
        await act(async () => {
            root.unmount();
        });
        await happyWindow.happyDOM.abort();
        for (const [name, descriptor] of descriptors) {
            if (descriptor) Object.defineProperty(globalThis, name, descriptor);
            else Reflect.deleteProperty(globalThis, name);
        }
    }
}

describe('WaitToolCard', () => {
    test('renders jobs, agents (live and non-live), cancelled outcomes, and output text', async () => {
        await withWaitHarness(async ({ container, renderCard }) => {
            await renderCard({
                details: {
                    op: 'wait',
                    jobs: [
                        {
                            id: 'job-bash-1',
                            type: 'bash',
                            status: 'completed',
                            label: 'bun test',
                            intent: 'Run unit tests',
                            durationMs: 2400,
                            exitCode: 0,
                        },
                        {
                            id: 'job-task-2',
                            type: 'task',
                            status: 'running',
                            label: 'Explore codebase',
                            durationMs: 5000,
                            completionPercent: 60,
                            stage: 'Scanning routes',
                        },
                        {
                            id: 'job-eval-3',
                            type: 'eval',
                            status: 'failed',
                            label: 'Check matrix',
                            durationMs: 800,
                            errorText: 'Assertion failed in matrix cell',
                        },
                    ],
                    agents: [
                        {
                            id: 'scout-1',
                            parentId: 'main',
                            activity: 'Reading config files',
                            ageMs: 3200,
                            live: true,
                        },
                        {
                            id: 'idle-agent-2',
                            ageMs: 9000,
                            live: false,
                        },
                    ],
                    cancelled: [
                        {
                            id: 'old-job-9',
                            status: 'cancelled',
                        },
                    ],
                },
                outputText: 'Job job-bash-1 finished cleanly.',
            });

            const text = container.textContent ?? '';
            expect(container.querySelector('[data-testid="wait-job-row-job-bash-1"]')?.getAttribute('data-job-status')).toBe('completed');
            expect(text).toContain('Run unit tests');
            expect(text).toContain('exit 0');
            expect(text).toContain('2s');

            expect(container.querySelector('[data-testid="wait-job-row-job-task-2"]')?.getAttribute('data-job-status')).toBe('running');
            expect(text).toContain('60%');
            expect(text).toContain('Scanning routes');

            expect(container.querySelector('[data-testid="wait-job-row-job-eval-3"]')?.getAttribute('data-job-status')).toBe('failed');
            expect(text).toContain('Assertion failed in matrix cell');

            expect(container.querySelector('[data-testid="wait-agent-row-scout-1"]')?.getAttribute('data-agent-live')).toBe('true');
            expect(text).toContain('Reading config files');
            expect(text).toContain('← main');

            expect(container.querySelector('[data-testid="wait-agent-row-idle-agent-2"]')?.getAttribute('data-agent-live')).toBe('false');
            expect(text).toContain('agent · no turn');

            expect(container.querySelector('[data-testid="wait-cancelled-row-old-job-9"]')?.textContent).toContain('cancelled');
            expect(container.querySelector('[data-testid="wait-output-text"]')?.textContent).toContain('Job job-bash-1 finished cleanly.');
        });
    });

    test('renders interrupted banner when wait was interrupted by a message', async () => {
        await withWaitHarness(async ({ container, renderCard }) => {
            await renderCard({
                details: {
                    op: 'wait',
                    jobs: [],
                    interrupted: true,
                },
                outputText: 'Wait interrupted by message.',
            });

            expect(container.querySelector('[data-testid="wait-interrupted-banner"]')?.textContent).toContain(
                'Wait interrupted by message',
            );
        });
    });

    test('falls back gracefully on malformed details without throwing', async () => {
        await withWaitHarness(async ({ container, renderCard }) => {
            await renderCard({
                details: {
                    jobs: 'invalid-not-array',
                    agents: 42,
                },
                outputText: 'Nothing to wait for.',
            });

            expect(container.querySelector('[data-testid="wait-tool-card"]')).not.toBeNull();
            expect(container.querySelector('[data-testid="wait-output-text"]')?.textContent).toContain('Nothing to wait for.');
            expect(container.textContent).not.toContain('invalid-not-array');
        });
    });
});
