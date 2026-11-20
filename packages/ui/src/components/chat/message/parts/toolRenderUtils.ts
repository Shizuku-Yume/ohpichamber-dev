import { isStaticTool as registryStaticTool, isSubagentTool, toolBaseName, type ToolName } from '@/lib/toolHelpers';

// Only tools with a direct in-app navigation destination stay compact. Every
// other tool uses ToolPart so custom, plugin, and MCP calls expose their input
// and output through the common expandable renderer.
export const isStaticTool = (toolName: ToolName): boolean => registryStaticTool(toolBaseName(toolName));
export const isExpandableTool = (toolName: ToolName): boolean => !isStaticTool(toolName);
export const isStandaloneTool = (toolName: ToolName): boolean => isSubagentTool(toolBaseName(toolName));
