import { isStaticTool as registryStaticTool, isSubagentTool, toolBaseName, type ToolName } from '@/lib/toolHelpers';

<<<<<<< HEAD
// Only tools with a direct in-app navigation destination stay compact. Every
// other tool uses ToolPart so custom, plugin, and MCP calls expose their input
// and output through the common expandable renderer.
export const isStaticTool = (toolName: ToolName): boolean => registryStaticTool(toolBaseName(toolName));
export const isExpandableTool = (toolName: ToolName): boolean => !isStaticTool(toolName);
export const isStandaloneTool = (toolName: ToolName): boolean => isSubagentTool(toolBaseName(toolName));
||||||| bc50ba56aa
const STANDALONE_TOOL_NAMES = new Set<string>([OPENCODE_TOOLS.subagent]);

export const isExpandableTool = (toolName: ToolName): boolean => {
    return !isStaticTool(toolName);
};

export const isStandaloneTool = (toolName: ToolName): boolean => {
    return STANDALONE_TOOL_NAMES.has(normalizeToolName(toolName));
};

// Keep only tools with a direct in-app navigation destination compact. Every
// other tool uses ToolPart so custom, plugin, and MCP calls expose their input
// and output through the common expandable renderer.
export const isStaticTool = (toolName: ToolName): boolean => isNavigationTool(toolName);
=======
const STANDALONE_TOOL_NAMES = new Set<string>([OPENCODE_TOOLS.subagent]);

export const isExpandableTool = (toolName: ToolName): boolean => {
    return !isStaticTool(toolName);
};

export const isStandaloneTool = (toolName: ToolName): boolean => {
    return STANDALONE_TOOL_NAMES.has(normalizeToolName(toolName));
};

export const isStaticTool = (toolName: ToolName): boolean => isNavigationTool(toolName);
>>>>>>> upstream/main
