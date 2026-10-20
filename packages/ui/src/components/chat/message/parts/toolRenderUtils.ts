import { NATIVE_TOOLS, type ToolName } from '@/lib/toolHelpers';

// Only tools with a direct in-app navigation destination stay compact. Every
// other tool uses ToolPart so custom, plugin, and MCP calls expose their input
// and output through the common expandable renderer.
const STATIC_TOOL_NAMES = { [NATIVE_TOOLS.read]: true, skill: true };

/** Runtime tool aliases keep their dotted prefix and may carry a stream index. */
const staticToolBaseName = (toolName: ToolName): string => {
    const name = (toolName ?? '').trim().replace(/:\d+$/, '');
    return name.startsWith('runtime.') ? name.slice('runtime.'.length) : name;
};

export const isStaticTool = (toolName: ToolName): boolean => Object.hasOwn(STATIC_TOOL_NAMES, staticToolBaseName(toolName));
export const isExpandableTool = (toolName: ToolName): boolean => !isStaticTool(toolName);
export const isStandaloneTool = (toolName: ToolName): boolean => staticToolBaseName(toolName) === NATIVE_TOOLS.task;
