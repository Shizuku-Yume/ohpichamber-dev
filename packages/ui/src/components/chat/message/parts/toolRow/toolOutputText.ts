import type { ToolCallPart } from '@openchamber/agent-contract';
import { detectToolOutputLanguage, isShellTool } from '@/lib/toolHelpers';
import { capToolOutputText } from '../../toolRenderers';
import { renderTerminalOutput } from '../toolOutput';

const TASK_SPAWN_ACK_LINE_RE = /^(?:Spawned\s+(?:agent\s+`[^`]+`\s+\(job\s+`[^`]+`\)\.?|\d+\s+background\s+agents?(?:\s+using\s+[^.]+)?\.?(?:\s+Failed\s+to\s+schedule\s+.+)?)|Running\s+.+?\s+inline;\s+\d+\s+background\s+agents?\.?|-\s+`[^`]+`\s+\(job\s+`[^`]+`\)|read\s+proc:\/\/\s+lists\s+jobs\/services.*|Job\s+IDs\s+are\s+process-local.*|Tip:\s+this\s+call\s+spawned\s+\d+\s+generic\s+workers.*|\d+\s+siblings\s+run\s+together\..*)$/i;

export const stripTaskSpawnBoilerplate = (raw: string): string => {
    const kept = raw
        .split('\n')
        .filter((line) => !TASK_SPAWN_ACK_LINE_RE.test(line.trim()));
    return kept.join('\n').trim();
};

export const getToolOutputLanguage = (
    output: string,
    toolName: string,
    input: ToolCallPart['input'] | undefined,
): string => {
    if (isShellTool(toolName)) {
        return 'bash';
    }
    return detectToolOutputLanguage(toolName, output, input);
};

export const getToolOutputText = (
    output: string,
    toolName: string,
): string => {
    // external: #2265 Cap tool payloads before JSON parsing, highlighting and DOM allocation.
    const capped = capToolOutputText(output);
    return isShellTool(toolName) ? renderTerminalOutput(capped) : capped;
};
