import { describe, expect, test } from 'bun:test';
import { ToolCallPartSchema } from '@openchamber/agent-contract';
import {
  detectToolOutputLanguage, flatScalarInputRows, formatToolInput,
  isEvalTool,
  isFileChangeTool, isQuestionTool, isRawInputSuppressedTool, isShellTool, isSubagentTool, isVibeSubagentTool, normalizeToolName,
  parseNativeReadPath, toolBaseName, toolInputPath, toolInputPaths,
} from './toolHelpers';
import { describeToolCall } from './toolPresentation';

const call = ToolCallPartSchema.parse({
  type: 'tool_call', partId: 'call-part', toolCallId: 'call-1', toolName: 'bash',
  input: { command: 'git status\necho done' }, status: 'completed',
});

describe('native tool helpers', () => {
  test('recognizes actual native identities without legacy aliases or namespace collisions', () => {
    expect(isShellTool('bash')).toBe(true);
    expect(isShellTool('shell')).toBe(false);
    expect(isShellTool('mcp.bash')).toBe(false);
    expect(isShellTool('eval')).toBe(false);
    expect(isEvalTool('eval')).toBe(true);
    expect(isEvalTool('runtime.eval:1')).toBe(true);
    expect(isEvalTool('bash')).toBe(false);
    expect(isSubagentTool('task')).toBe(true);
    expect(isSubagentTool('vibe_spawn')).toBe(false);
    expect(isVibeSubagentTool('vibe_spawn')).toBe(true);
    expect(isSubagentTool('subagent')).toBe(false);
    expect(isRawInputSuppressedTool('vibe_wait')).toBe(true);
    expect(flatScalarInputRows({ a: 'x', b: 1 })).toEqual([{ key: 'a', value: 'x' }, { key: 'b', value: '1' }]);
    expect(isQuestionTool('ask')).toBe(true);
    expect(isFileChangeTool('patch')).toBe(false);
    expect(normalizeToolName('mcp.bash:2')).toBe('mcp.bash:2');
    expect(toolBaseName('runtime.read:2')).toBe('read');
    expect(normalizeToolName(' runtime.read:2 ')).toBe('runtime.read:2');
  });

  test('describes a call from its own input, never a neighbouring result', () => {
    expect(describeToolCall(call.input, call.toolName)).toBe('git status');
    expect(describeToolCall({}, 'mcp__server_custom')).toBeNull();
  });

  test('keeps native structured input and uses only native paths', () => {
    const edit = ToolCallPartSchema.parse({ ...call, toolName: 'edit', input: { path: 'src/main.ts', edits: [{ op: 'update', diff: '@@\n-a\n+b' }] } });
    expect(toolInputPaths(edit)).toEqual(['src/main.ts']);
    expect(toolInputPath({ filePath: 'legacy.ts' })).toBeNull();
    expect(JSON.parse(formatToolInput(edit.input, edit.toolName))).toEqual(edit.input);
    expect(formatToolInput(call.input, 'bash')).toBe('git status\necho done');
    expect(formatToolInput({ path: 'new.ts', content: 'hello' }, 'write')).toBe('hello');
    expect(formatToolInput({ code: 'console.log(1)' }, 'eval')).toBe('console.log(1)');
    expect(detectToolOutputLanguage('read', '', { path: 'src/main.ts' })).toBe('typescript');
    const rename = ToolCallPartSchema.parse({ ...edit, input: { path: 'old.ts', edits: [{ op: 'update', rename: 'new.ts' }] } });
    expect(toolInputPaths(rename)).toEqual(['old.ts', 'new.ts']);
    expect(toolInputPaths({ ...edit, input: { input: '[src/main.ts#A123]\nPUT 1.=1:\n+updated' } })).toEqual(['src/main.ts']);
    expect(toolInputPaths({
      ...edit,
      input: { input: '[src/first.ts#A123]\nPUT 1.=1:\n+a\n[src/second.ts#BEEF]\nMV src/moved.ts' },
    })).toEqual(['src/first.ts', 'src/second.ts', 'src/moved.ts']);
    expect(toolInputPaths({
      ...edit,
      toolName: 'apply_patch',
      input: { input: '*** Begin Patch\n*** Add File: added.ts\n+hi\n*** Update File: src/app.ts\n*** Move to: src/main.ts\n*** End Patch' },
    })).toEqual(['added.ts', 'src/app.ts', 'src/main.ts']);
    expect(toolInputPaths({
      ...edit,
      input: { input: '*** Edit File: src/sloppy.ts\n*** Replace Block: foo\n+bar' },
    })).toEqual(['src/sloppy.ts']);
    expect(describeToolCall({ input: '[src/main.ts#A123]\nPUT 1.=1:\n+updated' }, 'edit')).toBe('src/main.ts');
    expect(describeToolCall({ input: '*** Begin Patch\n*** Update File: src/a.ts\n*** Add File: src/b.ts' }, 'apply_patch')).toBe('src/a.ts (+1)');
    expect(describeToolCall({ query: 'session deletion', grep_keywords: ['delete'] }, 'find')).toBe('session deletion');
    expect(describeToolCall({ agent: 'child', name: 'inspect', task: 'Inspect files' }, 'task')).toBe('inspect');
    expect(describeToolCall({ questions: [{ id: 'q1', question: 'Proceed?', options: [{ label: 'Yes' }] }] }, 'ask')).toBe('Proceed?');
    expect(describeToolCall({ query: 'canonical contracts' }, 'web_search')).toBe('canonical contracts');
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

  test('strips tool intent `i` from raw JSON input dumps while preserving edit payloads', () => {
    expect(JSON.parse(formatToolInput({ i: 'Checking status', flags: '--short' }, 'custom_tool'))).toEqual({ flags: '--short' });
    expect(formatToolInput({ i: 'Only intent' }, 'custom_tool')).toBe('');
    expect(formatToolInput({ i: 'Editing file', input: '[src/a.ts#1234]\nPUT 1.=1:\n+next' }, 'edit')).toBe('[src/a.ts#1234]\nPUT 1.=1:\n+next');
  });
});
