import { expect, test } from 'bun:test';
import type { Part, ReasoningPart, TextPart, ToolCallPart, ToolResultPart } from '@openchamber/agent-contract';
import { projectTurnRecords } from './projectTurnRecords';
import { estimateTimelineRowSize, type RowSizeMetrics } from './rowSizeEstimate';
import { buildTimelineRows, type TimelineRow } from './timelineRows';
import type { TimelineEntry } from './timelineEntries';
import type { ChatMessageEntry } from './types';

const metrics: RowSizeMetrics = { columnWidth: 360, lineHeight: 36, showReasoningTraces: true, collapsibleThinkingBlocks: true };

const text = (partId: string, content: string): TextPart => ({ type: 'text', partId, content });
const reasoning = (partId: string, content: string): ReasoningPart => ({ type: 'reasoning', partId, content });
const toolCall = (partId: string, toolName: string, editPreview?: ToolCallPart['editPreview']): ToolCallPart => {
    const part: ToolCallPart = {
        type: 'tool_call',
        partId,
        toolCallId: partId,
        toolName,
        input: {},
        status: 'completed',
    };
    if (editPreview) part.editPreview = editPreview;
    return part;
};
const toolResult = (partId: string, toolName: string, output?: ToolResultPart['output']): ToolResultPart => {
    const part: ToolResultPart = {
        type: 'tool_result',
        partId: `${partId}-result`,
        toolCallId: partId,
        toolName,
        isError: false,
    };
    if (output !== undefined) part.output = output;
    return part;
};
const assistant = (messageId: string, parts: Part[]): ChatMessageEntry => ({
    messageId,
    sessionId: 'session',
    turnId: 'user',
    role: 'assistant',
    createdAt: 2,
    parts,
});

const rowsOf = (messages: ChatMessageEntry[], prompt = 'Explain'): TimelineRow[] => {
    const turn = projectTurnRecords([
        { messageId: 'user', sessionId: 'session', turnId: 'user', role: 'user', createdAt: 1, parts: prompt ? [text('prompt', prompt)] : [] },
        ...messages,
    ]).turns[0]!;
    const entry: TimelineEntry = { kind: 'turn', key: `turn:${turn.turnId}`, turn, isLastTurn: true };
    return buildTimelineRows([entry], { collapsedActivity: false, keepActivityText: false, expandedTurns: new Map(), showReasoningTraces: true }, []);
};

const messageRow = (rows: TimelineRow[], messageId: string) => rows.find((row) => row.kind === 'turn-message' && row.messageId === messageId)!;

test('a tool step is one line, and reasoning the model kept to itself adds nothing', () => {
    const rows = rowsOf([
        assistant('step', [reasoning('hidden', ''), toolCall('bash', 'bash'), toolResult('bash', 'bash')]),
        assistant('answer', [text('done', 'Done.')]),
    ]);
    expect(estimateTimelineRowSize(messageRow(rows, 'step'), metrics)).toBe(36);
});

test('reasoning shown and each tool add a line', () => {
    const rows = rowsOf([
        assistant('step', [reasoning('thought', 'Looking at the file first.'), toolCall('read', 'read'), toolCall('grep', 'grep')]),
        assistant('answer', [text('done', 'Done.')]),
    ]);
    expect(estimateTimelineRowSize(messageRow(rows, 'step'), metrics)).toBe(108);
});

test('a patch across many files grows with the rows of files it lists', () => {
    const files = (count: number): ToolCallPart['editPreview'] => ({
        files: Array.from({ length: count }, (_, index) => ({ path: `f${index}.ts` })),
    });
    const rows = rowsOf([
        assistant('one', [toolCall('p1', 'edit', files(1))]),
        assistant('many', [toolCall('p15', 'edit', files(15))]),
        assistant('answer', [text('done', 'Done.')]),
    ]);
    const one = estimateTimelineRowSize(messageRow(rows, 'one'), metrics)!;
    const many = estimateTimelineRowSize(messageRow(rows, 'many'), metrics)!;
    expect(one).toBeLessThan(60);
    expect(many).toBeGreaterThan(one + 80);
});

test('text grows with its length at the column width', () => {
    const short = estimateTimelineRowSize(messageRow(rowsOf([assistant('a', [toolCall('t', 'bash')]), assistant('b', [text('x', 'Short.')])]), 'b'), metrics)!;
    const long = estimateTimelineRowSize(messageRow(rowsOf([assistant('a', [toolCall('t', 'bash')]), assistant('b', [text('x', 'Word '.repeat(400))])]), 'b'), metrics)!;
    expect(long - short).toBeGreaterThan(1000);
    expect(long - short).toBeLessThan(1400);
});

test('a prompt with nothing of its own is a thin row', () => {
    const rows = rowsOf([assistant('answer', [text('done', 'Done.')])], '');
    expect(estimateTimelineRowSize(rows[0]!, metrics)).toBe(40);
});

test('nothing is estimated before the column has a width', () => {
    const rows = rowsOf([assistant('answer', [text('done', 'Done.')])]);
    expect(estimateTimelineRowSize(rows[0]!, { ...metrics, columnWidth: 0 })).toBeUndefined();
});

test('reasoning drawn as text when thinking blocks do not fold', () => {
    const rows = rowsOf([
        assistant('step', [reasoning('thought', 'Thinking it through. '.repeat(40)), toolCall('bash', 'bash')]),
        assistant('answer', [text('done', 'Done.')]),
    ]);
    const folded = estimateTimelineRowSize(messageRow(rows, 'step'), metrics)!;
    const open = estimateTimelineRowSize(messageRow(rows, 'step'), { ...metrics, collapsibleThinkingBlocks: false })!;
    expect(folded).toBe(72);
    expect(open).toBeGreaterThan(400);
});

test('Show notes adds the kept lines to the answer row, or to the fold row of a turn without an answer', () => {
    const line = 'A line the agent wrote between its steps.';
    const build = (messages: ChatMessageEntry[], keepActivityText: boolean): TimelineRow[] => {
        const turn = projectTurnRecords([
            { messageId: 'user', sessionId: 'session', turnId: 'user', role: 'user', createdAt: 1, parts: [text('prompt', 'Explain')] },
            ...messages,
        ]).turns[0]!;
        const entry: TimelineEntry = { kind: 'turn', key: `turn:${turn.turnId}`, turn, isLastTurn: true, hasLaterAssistant: true };
        return buildTimelineRows([entry], { collapsedActivity: true, keepActivityText, expandedTurns: new Map(), showReasoningTraces: true }, []);
    };
    const size = (rows: TimelineRow[], kind: TimelineRow['kind']) => estimateTimelineRowSize(rows.find((row) => row.kind === kind)!, metrics) ?? 0;
    const step = assistant('step', [text('note', line), toolCall('read', 'read')]);
    const answered = [step, assistant('answer', [text('done', 'Done.')])];
    expect(size(build(answered, true), 'turn-message')).toBeGreaterThan(size(build(answered, false), 'turn-message'));
    expect(size(build(answered, true), 'turn-fold')).toBe(size(build(answered, false), 'turn-fold'));
    expect(size(build([step], true), 'turn-fold')).toBeGreaterThan(size(build([step], false), 'turn-fold'));
});
