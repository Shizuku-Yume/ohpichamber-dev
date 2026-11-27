import React from 'react';
import { useI18n } from '@/lib/i18n';
import { normalizeToolName, toolPresentation } from '@/lib/toolHelpers';
import { areRenderRelevantPartsEqual } from '../renderCompare';
import type { ToolPartProps } from './toolRow/types';
import { ToolPartContent } from './toolRow/ToolPartContent';
import { ToolPartErrorBoundary } from './toolRow/ToolPartErrorBoundary';

const ToolPart: React.FC<ToolPartProps> = (props) => {
    const { t } = useI18n();
    const toolName = normalizeToolName(props.part.toolName) || 'tool';
    const displayName = toolPresentation(toolName).label;

    return (
        <ToolPartErrorBoundary
            displayName={displayName}
            errorLabel={t('chat.toolPart.error')}
            resetKey={props.part}
            toolName={toolName}
        >
            <ToolPartContent {...props} />
        </ToolPartErrorBoundary>
    );
};
export default React.memo(ToolPart, (prev, next) => {
    return areRenderRelevantPartsEqual([prev.part], [next.part])
        && (prev.pairedCall === next.pairedCall || (
            prev.pairedCall !== undefined
            && next.pairedCall !== undefined
            && areRenderRelevantPartsEqual([prev.pairedCall], [next.pairedCall])
        ))
        && prev.sessionId === next.sessionId
        && prev.directory === next.directory
        && prev.isExpanded === next.isExpanded
        && prev.onToggle === next.onToggle
        && prev.isMobile === next.isMobile
        && prev.alwaysShowActions === next.alwaysShowActions
        && prev.onShowPopup === next.onShowPopup
        && prev.animateTailText === next.animateTailText;
});
