import React from 'react';
import type { ToolCallPart } from '@openchamber/agent-contract';
import { SimpleMarkdownRenderer } from '../../../MarkdownRenderer';
import { HighlightedCode } from '@/components/code/HighlightedCode';
import type { ToolPopupContent } from '../../types';
import { tryParseJsonOutput } from '../../toolRenderers';
import { GuestToolCard } from '../GuestToolCard';
import { GuestToolTable } from '../GuestToolTable';
import { guestToolTableRows, resolveGuestToolCard, type GuestToolRule } from '@/lib/guests/tool-presentation';
import { isShellTool } from '@/lib/toolHelpers';
import { TOOL_COLLAPSED_CUSTOM_STYLE, CODE_TAG_PROPS } from './toolRowStyles';
import { getToolOutputLanguage, getToolOutputText } from './toolOutputText';
import { StreamingPlainTextOutput } from './StreamingPlainTextOutput';
import { JsonToolOutput } from './JsonToolOutput';
import { CommandOutput } from './CommandOutput';

export const ToolScrollableTextOutput: React.FC<{
    output: string;
    toolName: string;
    input: ToolCallPart['input'] | undefined;
    isStreaming?: boolean;
    presentation?: GuestToolRule | null;
    onShowPopup?: (content: ToolPopupContent) => void;
}> = ({ output, toolName, input, isStreaming = false, presentation = null, onShowPopup }) => {
    const renderedOutput = React.useMemo(() => getToolOutputText(output, toolName), [output, toolName]);
    const outputLanguage = getToolOutputLanguage(renderedOutput, toolName, input);
    const jsonResult = React.useMemo(() => tryParseJsonOutput(renderedOutput), [renderedOutput]);
    const forcedMode = presentation?.output && presentation.output !== 'auto' ? presentation.output : null;
    const card = React.useMemo(
        () => (forcedMode === 'card' && presentation && jsonResult.isJson ? resolveGuestToolCard(presentation, jsonResult.data) : null),
        [forcedMode, presentation, jsonResult],
    );

    if (isShellTool(toolName) && isStreaming) {
        return (
            <div className="typography-code text-muted-foreground">
                <StreamingPlainTextOutput output={renderedOutput} />
            </div>
        );
    }

    if (forcedMode === 'markdown') {
        return (
            <div className="w-full min-w-0">
                <SimpleMarkdownRenderer content={renderedOutput} variant="tool" onShowPopup={onShowPopup} />
            </div>
        );
    }

    if (forcedMode === 'table' && presentation?.columns?.length) {
        const rows = jsonResult.isJson ? guestToolTableRows(jsonResult.data) : guestToolTableRows(renderedOutput);
        if (rows) {
            return <GuestToolTable rows={rows} columns={presentation.columns} />;
        }
    }

    if (card) return <GuestToolCard result={card} />;

    if (forcedMode === 'text' || forcedMode === 'code') {
        return (
            <HighlightedCode
                language={forcedMode === 'code' && presentation?.language ? presentation.language : 'text'}
                code={renderedOutput}
                style={TOOL_COLLAPSED_CUSTOM_STYLE}
                codeStyle={CODE_TAG_PROPS.style}
                wrap
            />
        );
    }

    if (jsonResult.isJson) {
        return <JsonToolOutput jsonResult={jsonResult} renderedOutput={renderedOutput} />;
    }

    if (isShellTool(toolName)) {
        return <CommandOutput output={renderedOutput} language={outputLanguage} />;
    }

    return (
        <div>
            <HighlightedCode
                language={outputLanguage}
                code={renderedOutput}
                style={TOOL_COLLAPSED_CUSTOM_STYLE}
                codeStyle={CODE_TAG_PROPS.style}
                wrap
            />
        </div>
    );
};

ToolScrollableTextOutput.displayName = 'ToolScrollableTextOutput';
