import type { JsonValue, ToolCallPart, ToolResultPart } from '@openchamber/agent-contract';
import { z } from 'zod';
import type { ToolPopupContent } from '../../types';

export type ToolJsonViewMode = 'summary' | 'formatted' | 'raw';

export interface ToolPartProps {
    part: ToolCallPart | ToolResultPart;
    pairedCall?: ToolCallPart;
    sessionId?: string;
    directory?: string | null;
    isExpanded: boolean;
    onToggle: (toolId: string) => void;
    isMobile: boolean;
    alwaysShowActions?: boolean;
    onShowPopup?: (content: ToolPopupContent) => void;
    animateTailText?: boolean;
}

export interface NativeResultContent {
    text: string;
    images: Array<{ mediaType: string; data: string }>;
    details?: JsonValue;
}

const taskProgressItemSchema = z.object({
    id: z.string(),
    agent: z.string(),
    status: z.string().optional(),
    lastIntent: z.string().optional(),
    currentTool: z.string().optional(),
    currentToolArgs: z.string().optional(),
    stage: z.string().optional(),
});

export const taskResultDetailsSchema = z.object({
    progress: z.array(taskProgressItemSchema).optional(),
    async: z.object({
        state: z.string().optional(),
        jobId: z.string().optional(),
    }).optional(),
});

export const isActiveCallStatus = (status: ToolCallPart['status'] | undefined): boolean =>
    status === 'running' || status === 'approved' || status === 'pending_approval';
