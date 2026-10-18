import type { ToolResultPart } from '@openchamber/agent-contract';

export type StreamPhase = 'streaming' | 'cooldown' | 'completed';

export type DiffViewMode = 'side-by-side' | 'unified';

export interface AgentMentionInfo {
    name: string;
    token: string;
}

export interface ToolPopupContent {
    open: boolean;
    title: string;
    content: string;
    toolResult?: ToolResultPart;
    language?: string;
    isDiff?: boolean;
    image?: {
        url: string;
        mimeType?: string;
        filename?: string;
        size?: number;
        gallery?: Array<{
            url: string;
            mimeType?: string;
            filename?: string;
            size?: number;
        }>;
        index?: number;
    };
    mermaid?: {
        url: string;
        mimeType?: string;
        filename?: string;
        source?: string;
    };
}
