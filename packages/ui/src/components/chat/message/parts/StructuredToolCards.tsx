import React from 'react';
import type { JsonObject, JsonValue } from '@openchamber/agent-contract';
import { toolBaseName } from '@/lib/toolPresentation';
import type { ToolPopupContent } from '../types';
import { DebugCard, GithubCard } from './structuredCards/DebugAndGithubCards';
import { GoalCard, SecurityScanCard } from './structuredCards/GoalAndSecurityCards';
import {
    CheckpointCard,
    ReportIssueCard,
    ResolveActionCard,
    RewindCard,
    ThinkCard,
    YieldCard,
} from './structuredCards/WorkflowTextCards';

interface StructuredToolCardProps {
    toolName: string | undefined;
    input?: JsonObject;
    details?: JsonValue;
    output?: string;
    onShowPopup?: (content: ToolPopupContent) => void;
}

export const StructuredToolCard: React.FC<StructuredToolCardProps> = React.memo(({
    toolName,
    input,
    details,
    output,
    onShowPopup,
}) => {
    const base = toolBaseName(toolName);
    switch (base) {
        case 'debug':
            return <DebugCard input={input} details={details} output={output} onShowPopup={onShowPopup} />;
        case 'github':
            return <GithubCard input={input} details={details} output={output} onShowPopup={onShowPopup} />;
        case 'goal':
            return <GoalCard input={input} details={details} output={output} onShowPopup={onShowPopup} />;
        case 'security_scan':
            return <SecurityScanCard input={input} details={details} output={output} onShowPopup={onShowPopup} />;
        case 'checkpoint':
            return <CheckpointCard input={input} details={details} output={output} onShowPopup={onShowPopup} />;
        case 'rewind':
            return <RewindCard input={input} details={details} output={output} onShowPopup={onShowPopup} />;
        case 'yield':
            return <YieldCard input={input} details={details} output={output} onShowPopup={onShowPopup} />;
        case 'think':
            return <ThinkCard input={input} details={details} output={output} onShowPopup={onShowPopup} />;
        case 'report_issue':
            return <ReportIssueCard input={input} details={details} output={output} onShowPopup={onShowPopup} />;
        case 'resolve':
            return <ResolveActionCard variant="resolve" input={input} details={details} output={output} onShowPopup={onShowPopup} />;
        case 'reject':
            return <ResolveActionCard variant="reject" input={input} details={details} output={output} onShowPopup={onShowPopup} />;
        case 'propose':
            return <ResolveActionCard variant="propose" input={input} details={details} output={output} onShowPopup={onShowPopup} />;
        default:
            return null;
    }
});

StructuredToolCard.displayName = 'StructuredToolCard';
