import type { AttachmentPart as FilePart, ToolCallPart as NativeToolCallPart, ToolResultPart as NativeToolResultPart } from '@openchamber/agent-contract';
import type { Metadata, ToolInput, ToolState as ToolStateUnion } from '@/lib/opencode/model';
type ToolPartType = NativeToolCallPart | NativeToolResultPart;
import type { ToolPopupContent } from '../../types';

export type ToolJsonViewMode = 'summary' | 'formatted' | 'raw';

export type ToolStateWithMetadata = ToolStateUnion & { metadata?: Metadata; input?: ToolInput; output?: string; error?: string; time?: { start: number; end?: number }; attachments?: Array<FilePart> };

export interface ToolPartProps {
    part: ToolPartType;
    isExpanded: boolean;
    onToggle: (toolId: string) => void;
    isMobile: boolean;
    alwaysShowActions?: boolean;
    onShowPopup?: (content: ToolPopupContent) => void;
    animateTailText?: boolean;
    failureReason?: string;
}

export type ToolRowHeader = {
    label?: 'background' | 'stopped';
    durationUnknown?: boolean;
    stop?: { onStop: () => void; ariaLabel: string };
};
