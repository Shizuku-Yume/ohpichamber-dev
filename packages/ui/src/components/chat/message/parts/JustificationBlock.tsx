import React from 'react';
import type { Part } from '@openchamber/agent-contract';
import { ReasoningTimelineBlock } from './ReasoningPart';

const cleanJustificationText = (text: string): string => {
    if (typeof text !== 'string' || text.trim().length === 0) {
        return '';
    }

    return text
        .split('\n')
        .map((line: string) => line.replace(/^>\s?/, '').trimEnd())
        .filter((line: string) => line.trim().length > 0)
        .join('\n')
        .trim();
};

interface JustificationBlockProps {
    part: Part;
    messageId: string;
    actions?: React.ReactNode;
}

const JustificationBlock: React.FC<JustificationBlockProps> = ({
    part,
    messageId,
    actions,
}) => {
    const rawText = part.type === 'text' || part.type === 'reasoning' ? part.content : '';
    const textContent = React.useMemo(() => cleanJustificationText(rawText), [rawText]);

    // Don't render if there's no text content
    if (!textContent || textContent.trim().length === 0) {
        return null;
    }

    return (
        <ReasoningTimelineBlock
            text={textContent}
            variant="justification"
            blockId={part.partId || `${messageId}-justification`}
            actions={actions}
        />
    );
};

export default React.memo(JustificationBlock);
