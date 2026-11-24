import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { plugin } from 'bun';
import { pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider, useI18nStore } from '@/lib/i18n';
import { isStructuredCardTool, STRUCTURED_CARD_TOOL_NAMES } from './toolDisplayContent';
import { SyncProvider } from '@/sync/sync-context';

plugin({
    name: 'structured-cards-worker-url',
    setup(build) {
        build.onLoad({ filter: /markdown-shiki\.worker\.ts\?worker&url$/ }, ({ path }) => ({
            contents: `export default ${JSON.stringify(pathToFileURL(path.split('?')[0]).href)};`,
            loader: 'js',
        }));
    },
});

const { StructuredToolCard } = await import('./StructuredToolCards');
// Static loading cannot work here: Bun must register the real worker URL
// loader above before evaluating the MarkdownRenderer dependency graph.
const { loadMarkdownRendererModule } = await import('@/components/chat/markdownRendererLoader');

beforeAll(async () => {
    await loadMarkdownRendererModule();
});

beforeEach(() => {
    useI18nStore.getState().setLocale('en');
});

function renderCard(props: React.ComponentProps<typeof StructuredToolCard>): string {
    return renderToStaticMarkup(
        <SyncProvider directory="/repo">
            <I18nProvider>
                <StructuredToolCard {...props} />
            </I18nProvider>
        </SyncProvider>,
    );
}

describe('StructuredToolCard', () => {
    test('isStructuredCardTool matches all 12 OMP structured card tools and rejects unrelated tools', () => {
        for (const name of STRUCTURED_CARD_TOOL_NAMES) {
            expect(isStructuredCardTool(name)).toBe(true);
        }
        expect(isStructuredCardTool('runtime.debug')).toBe(true);
        expect(isStructuredCardTool('bash')).toBe(false);
        expect(isStructuredCardTool('vibe_spawn')).toBe(false);
        expect(isStructuredCardTool('wait')).toBe(false);
        expect(isStructuredCardTool(undefined)).toBe(false);
    });

    test('renders debug snapshot bar with status, stopReason, source:line, frameName, and text output', () => {
        const html = renderCard({
            toolName: 'debug',
            input: { action: 'step_over', session_id: 'dbg-1' },
            details: {
                action: 'step_over',
                success: true,
                snapshot: {
                    id: 'dbg-1',
                    adapter: 'lldb',
                    status: 'stopped',
                    cwd: '/repo',
                    stopReason: 'step',
                    frameName: 'parseConfig',
                    source: { path: 'src/config.ts' },
                    line: 42,
                    column: 7,
                    needsConfigurationDone: false,
                },
            },
            output: 'Stopped at src/config.ts:42 in parseConfig',
        });

        expect(html).toContain('data-testid="structured-card-debug"');
        expect(html).toContain('data-testid="debug-snapshot-bar"');
        expect(html).toContain('step over');
        expect(html).toContain('stopped');
        expect(html).toContain('step');
        expect(html).toContain('src/config.ts:42:7');
        expect(html).toContain('parseConfig');
        expect(html).toContain('lldb');
        expect(html).toContain('Stopped at src/config.ts:42 in parseConfig');
        expect(html).not.toContain('{"');
    });

    test('renders github header, failedJobs, watch.run.jobs[].steps[] tree, and markdown output', () => {
        const html = renderCard({
            toolName: 'github',
            input: { op: 'run_watch', repo: 'acme/app', run: '987' },
            details: {
                repo: 'acme/app',
                branch: 'feat/ci-fix',
                status: 'completed',
                conclusion: 'failure',
                failedJobs: ['unit-tests'],
                watch: {
                    mode: 'run',
                    state: 'completed',
                    repo: 'acme/app',
                    branch: 'feat/ci-fix',
                    run: {
                        id: 987,
                        workflowName: 'CI Pipeline',
                        status: 'completed',
                        conclusion: 'failure',
                        branch: 'feat/ci-fix',
                        headSha: 'abc1234def5678',
                        jobs: [
                            {
                                id: 11,
                                name: 'unit-tests',
                                status: 'completed',
                                conclusion: 'failure',
                                durationSeconds: 34,
                                steps: [
                                    { number: 1, name: 'Checkout', conclusion: 'success' },
                                    { number: 2, name: 'Run bun test', conclusion: 'failure' },
                                ],
                            },
                        ],
                    },
                    failedLogs: [
                        {
                            runId: 987,
                            jobName: 'unit-tests',
                            available: true,
                            tail: 'FAIL src/app.test.ts > expected 1 to be 2',
                        },
                    ],
                },
            },
            output: 'Workflow **CI Pipeline** finished with 1 failed job.',
        });

        expect(html).toContain('data-testid="structured-card-github"');
        expect(html).toContain('data-testid="github-header"');
        expect(html).toContain('acme/app');
        expect(html).toContain('feat/ci-fix');
        expect(html).toContain('failure');
        expect(html).toContain('data-testid="github-failed-jobs"');
        expect(html).toContain('unit-tests');
        expect(html).toContain('data-testid="github-watch-tree"');
        expect(html).toContain('CI Pipeline');
        expect(html).toContain('abc1234');
        expect(html).toContain('Checkout');
        expect(html).toContain('Run bun test');
        expect(html).toContain('FAIL src/app.test.ts');
        expect(html).toContain('Workflow');
        expect(html).not.toContain('{"');
    });

    test('renders goal objective, status badge, token usage vs budget, and completion report', () => {
        const html = renderCard({
            toolName: 'goal',
            input: { op: 'complete' },
            details: {
                op: 'complete',
                goal: {
                    id: 'goal-1',
                    objective: 'Migrate all tool cards to semantic components',
                    status: 'complete',
                    tokenBudget: 10000,
                    tokensUsed: 3500,
                    timeUsedSeconds: 45,
                },
                remainingTokens: 6500,
                completionBudgetReport: 'Completed under budget with 35% usage.',
            },
            output: 'Goal completed.',
        });

        expect(html).toContain('data-testid="structured-card-goal"');
        expect(html).toContain('complete');
        expect(html).toContain('Migrate all tool cards to semantic components');
        expect(html).toContain('data-testid="goal-budget"');
        expect(html).toContain('3,500');
        expect(html).toContain('10,000');
        expect(html).toContain('6,500');
        expect(html).toContain('45s');
        expect(html).toContain('Completed under budget with 35% usage.');
        expect(html).not.toContain('{"');
    });

    test('renders security_scan action, status badge, and findings summary', () => {
        const html = renderCard({
            toolName: 'security_scan',
            input: { action: 'status', operation_id: 'op-1' },
            details: {
                action: 'status',
                operation: {
                    operationId: 'op-1',
                    planId: 'plan-1',
                    scanId: 'scan-42',
                    phase: 'completed',
                    findingCount: 3,
                },
            },
            output: 'Security scan scan-42: completed; 3 finding(s).',
        });

        expect(html).toContain('data-testid="structured-card-security-scan"');
        expect(html).toContain('status');
        expect(html).toContain('data-testid="security-status-badge"');
        expect(html).toContain('completed');
        expect(html).toContain('data-testid="security-findings-badge"');
        expect(html).toContain('3');
        expect(html).toContain('scan-42');
        expect(html).toContain('plan-1');
        expect(html).not.toContain('{"');
    });

    test('renders checkpoint goal and rewind report as styled text/markdown without raw JSON', () => {
        const checkpointHtml = renderCard({
            toolName: 'checkpoint',
            input: { goal: 'Investigate **memory leak** in worker pool' },
            details: { goal: 'Investigate **memory leak** in worker pool', startedAt: '2026-11-24T00:00:00Z' },
            output: 'Checkpoint created.',
        });
        expect(checkpointHtml).toContain('data-testid="structured-card-checkpoint"');
        expect(checkpointHtml).toContain('Investigate');
        expect(checkpointHtml).toContain('memory leak');
        expect(checkpointHtml).not.toContain('{"');

        const rewindHtml = renderCard({
            toolName: 'rewind',
            input: { report: 'Root cause found in `pool.ts`.' },
            details: { report: 'Root cause found in `pool.ts`.', rewound: true },
            output: 'Rewind requested.',
        });
        expect(rewindHtml).toContain('data-testid="structured-card-rewind"');
        expect(rewindHtml).toContain('Root cause found in');
        expect(rewindHtml).toContain('pool.ts');
        expect(rewindHtml).not.toContain('{"');
    });

    test('renders yield formatted data without raw JSON', () => {
        const html = renderCard({
            toolName: 'yield',
            input: {
                type: 'audit',
                data: {
                    summary: 'All checks passed',
                    passedCount: 12,
                    files: ['src/a.ts', 'src/b.ts'],
                    nested: { clean: true },
                },
            },
            details: {
                status: 'success',
                type: 'audit',
                complete: true,
                data: {
                    summary: 'All checks passed',
                    passedCount: 12,
                    files: ['src/a.ts', 'src/b.ts'],
                    nested: { clean: true },
                },
            },
        });

        expect(html).toContain('data-testid="structured-card-yield"');
        expect(html).toContain('data-testid="yield-status-badge"');
        expect(html).toContain('success');
        expect(html).toContain('audit');
        expect(html).toContain('data-testid="yield-data-body"');
        expect(html).toContain('All checks passed');
        expect(html).toContain('12');
        expect(html).toContain('src/a.ts');
        expect(html).toContain('src/b.ts');
        expect(html).toContain('true');
        expect(html).not.toContain('{"');
        expect(html).not.toContain('":');
    });

    test('renders think thoughts cleanly and ignores ------ placeholder output', () => {
        const html = renderCard({
            toolName: 'think',
            input: { thoughts: 'Compare **Option A** vs Option B before editing.' },
            details: { recorded: true },
            output: '------',
        });

        expect(html).toContain('data-testid="structured-card-think"');
        expect(html).toContain('Compare');
        expect(html).toContain('Option A');
        expect(html).not.toContain('------');
        expect(html).not.toContain('{"');
    });

    test('renders report_issue report cleanly', () => {
        const html = renderCard({
            toolName: 'report_issue',
            input: { report: 'grep: misses multiline pattern when flags omit -U' },
            output: 'Noted, thanks!',
        });

        expect(html).toContain('data-testid="structured-card-report-issue"');
        expect(html).toContain('grep: misses multiline pattern when flags omit -U');
        expect(html).toContain('Noted, thanks!');
        expect(html).not.toContain('{"');
    });

    test('renders resolve, reject, and propose with reason/title and details.action', () => {
        const resolveHtml = renderCard({
            toolName: 'resolve',
            input: { reason: 'Apply the verified patch to src/index.ts.' },
            details: { action: 'apply', reason: 'Apply the verified patch to src/index.ts.', sourceToolName: 'edit' },
            output: 'Applied.',
        });
        expect(resolveHtml).toContain('data-testid="structured-card-resolve"');
        expect(resolveHtml).toContain('apply');
        expect(resolveHtml).toContain('Apply the verified patch to src/index.ts.');
        expect(resolveHtml).toContain('edit');

        const rejectHtml = renderCard({
            toolName: 'reject',
            input: { reason: 'Discard speculative rewrite.' },
            details: { action: 'discard', reason: 'Discard speculative rewrite.' },
        });
        expect(rejectHtml).toContain('data-testid="structured-card-reject"');
        expect(rejectHtml).toContain('discard');
        expect(rejectHtml).toContain('Discard speculative rewrite.');

        const proposeHtml = renderCard({
            toolName: 'propose',
            input: { title: 'refactor-auth-boundary' },
            details: { action: 'propose' },
            output: 'Submitted plan for approval.',
        });
        expect(proposeHtml).toContain('data-testid="structured-card-propose"');
        expect(proposeHtml).toContain('refactor-auth-boundary');
        expect(proposeHtml).toContain('propose');
        expect(proposeHtml).toContain('Submitted plan for approval.');
    });

    test('renders security_scan operation and finding when details omit action', () => {
        const html = renderCard({
            toolName: 'security_scan',
            input: {},
            details: {
                operation: {
                    operationId: 'op-7',
                    scanId: 'scan-9',
                    planId: 'plan-2',
                    phase: 'running',
                },
                finding: { id: 'finding-55', validationStatus: 'pending' },
            },
            output: 'Scan still in progress.',
        });

        expect(html).toContain('data-testid="structured-card-security-scan"');
        expect(html).toContain('data-testid="security-status-badge"');
        expect(html).toContain('running');
        expect(html).toContain('Scan scan-9');
        expect(html).toContain('Plan plan-2');
        expect(html).toContain('Finding finding-55');
        expect(html).toContain('Scan still in progress.');
        expect(html).not.toContain('{"');
    });

    test('renders github watch tree when partial run and job fields are missing', () => {
        const html = renderCard({
            toolName: 'github',
            input: { op: 'run_watch' },
            details: {
                watch: {
                    state: 'watching',
                    run: {
                        workflowName: 'Deploy',
                        status: 'in_progress',
                        jobs: [
                            { name: 'build', status: 'completed' },
                            { id: 22, conclusion: 'running' },
                        ],
                    },
                },
            },
            output: 'Watching workflow run.',
        });

        expect(html).toContain('data-testid="structured-card-github"');
        expect(html).toContain('data-testid="github-watch-tree"');
        expect(html).toContain('Deploy');
        expect(html).toContain('build');
        expect(html).toContain('completed');
        expect(html).toContain('Watching workflow run.');
        expect(html).not.toContain('{"');
    });

    test('falls back safely without throwing or dumping JSON when details are malformed', () => {
        for (const name of STRUCTURED_CARD_TOOL_NAMES) {
            const html = renderCard({
                toolName: name,
                input: {},
                details: { unexpected: ['bad', 123, { nested: true }] },
                output: 'Fallback text output',
            });
            expect(html).toBeTruthy();
            expect(html).not.toContain('{"');
            expect(html).not.toContain('unexpected');
        }
    });
});
