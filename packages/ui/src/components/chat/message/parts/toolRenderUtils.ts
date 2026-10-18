import { NATIVE_TOOLS, type ToolName } from '@/lib/toolHelpers';

// Only native reads have a direct file-navigation destination. Custom tools
// always expose their full input and output in the expandable renderer.
export const isExpandableTool = (toolName: ToolName): boolean => toolName !== NATIVE_TOOLS.read;
export const isStandaloneTool = (toolName: ToolName): boolean => toolName === NATIVE_TOOLS.task;
export const isStaticTool = (toolName: ToolName): boolean => toolName === NATIVE_TOOLS.read;
