import { describe, expect, test } from 'bun:test';
import { ToolCallPartSchema, ToolResultPartSchema } from '@openchamber/agent-contract';
import {
  detectToolOutputLanguage, formatToolInput, getToolMetadata,
  isFileChangeTool, isQuestionTool, isShellTool, isSubagentTool, normalizeToolName,
  parseNativeReadPath, toolDescription, toolInputPath, toolInputPaths,
} from './toolHelpers';

const call = ToolCallPartSchema.parse({
  type: 'tool_call', partId: 'call-part', toolCallId: 'call-1', toolName: 'bash',
  input: { command: 'git status\necho done' }, status: 'completed',
});
const result = ToolResultPartSchema.parse({
  type: 'tool_result', partId: 'result-part', toolCallId: 'call-1', toolName: 'bash',
  output: { content: [{ type: 'text', text: 'done' }], details: { exitCode: 0 } }, isError: false,
});

describe('native tool helpers', () => {
  test('recognizes actual native identities without legacy aliases or namespace collisions', () => {
    expect(isShellTool('bash')).toBe(true);
    expect(isShellTool('shell')).toBe(false);
    expect(isShellTool('mcp.bash')).toBe(false);
    expect(isSubagentTool('task')).toBe(true);
    expect(isSubagentTool('subagent')).toBe(false);
    expect(isQuestionTool('ask')).toBe(true);
    expect(isFileChangeTool('patch')).toBe(false);
    expect(normalizeToolName('mcp.bash:2')).toBe('mcp.bash:2');
    expect(getToolMetadata('mcp.my_tool').displayName).toBe('mcp.my_tool');
  });

  test('pairs separate result and call identities without borrowing unrelated input', () => {
    expect(toolDescription(result, call)).toEqual({ kind: 'text', value: 'git status' });
    expect(toolDescription(result)).toBeNull();
    expect(toolDescription(result, { ...call, toolCallId: 'other' })).toBeNull();
    expect(toolDescription(result, { ...call, toolName: 'edit' })).toBeNull();
    expect(toolDescription({ ...result, isError: true, error: 'permission denied' })).toEqual({ kind: 'text', value: 'permission denied' });
  });

  test('keeps native structured input and uses only native paths', () => {
    const edit = ToolCallPartSchema.parse({ ...call, toolName: 'edit', input: { path: 'src/main.ts', edits: [{ op: 'update', diff: '@@\n-a\n+b' }] } });
    expect(toolInputPaths(edit)).toEqual(['src/main.ts']);
    expect(toolDescription(edit)).toEqual({ kind: 'path', value: 'src/main.ts' });
    expect(toolInputPath({ filePath: 'legacy.ts' })).toBeNull();
    expect(JSON.parse(formatToolInput(edit.input, edit.toolName))).toEqual(edit.input);
    expect(formatToolInput(call.input, 'bash')).toBe('git status\necho done');
    expect(formatToolInput({ path: 'new.ts', content: 'hello' }, 'write')).toBe('hello');
    expect(detectToolOutputLanguage('read', '', { path: 'src/main.ts' })).toBe('typescript');
    const rename = ToolCallPartSchema.parse({ ...edit, input: { path: 'old.ts', edits: [{ op: 'update', rename: 'new.ts' }] } });
    expect(toolInputPaths(rename)).toEqual(['old.ts', 'new.ts']);
    expect(toolDescription(rename)).toEqual({ kind: 'files', count: 2, files: ['old.ts', 'new.ts'] });
    expect(toolInputPaths({ ...edit, input: { input: '[src/main.ts#A123]\nPUT 1.=1:\n+updated' } })).toEqual([]);
    expect(toolDescription({ ...call, toolName: 'find', input: { query: 'session deletion', grep_keywords: ['delete'] } })).toEqual({ kind: 'text', value: 'session deletion' });
    expect(toolDescription({ ...call, toolName: 'task', input: { agent: 'child', name: 'inspect', task: 'Inspect files' } })).toEqual({ kind: 'text', value: 'inspect' });
    expect(toolDescription({ ...call, toolName: 'ask', input: { questions: [{ id: 'q1', question: 'Proceed?', options: [{ label: 'Yes' }] }] } })).toEqual({ kind: 'questions', count: 1 });
    expect(toolDescription({ ...call, toolName: 'web_search', input: { query: 'canonical contracts' } })).toEqual({ kind: 'text', value: 'canonical contracts' });
  });

  test('opens native inline read selectors without changing filesystem identity', () => {
    expect(parseNativeReadPath('src/main.ts:50-100')).toEqual({ path: 'src/main.ts', line: 50 });
    expect(parseNativeReadPath('src/main.ts:raw:50+10')).toEqual({ path: 'src/main.ts', line: 50 });
    expect(parseNativeReadPath('C:/repo/main.ts:5,10-20')).toEqual({ path: 'C:/repo/main.ts', line: 5 });
    expect(parseNativeReadPath('C:/repo/main.ts')).toEqual({ path: 'C:/repo/main.ts' });
    expect(parseNativeReadPath('src/main.ts:-60')).toEqual({ path: 'src/main.ts' });
    expect(parseNativeReadPath('https://example.test:3127/src/main.ts')).toEqual({ path: 'https://example.test:3127/src/main.ts' });
    expect(detectToolOutputLanguage('read', '', { path: 'src/main.ts:50-100' })).toBe('typescript');
  });
});
