import React from 'react';
import type { JsonObject, JsonValue } from '@openchamber/agent-contract';
import { useI18n } from '@/lib/i18n';
import type { ToolPopupContent } from '../types';
import { StructuredToolCard } from './StructuredToolCards';
import { VibeToolCard } from './VibeToolCard';
import { WaitToolCard } from './WaitToolCard';
import { isStructuredCardTool, isVibeCardTool, isWaitCardTool } from './toolDisplayContent';

const ToolPartErrorBox: React.FC<{ error: string; errorHeading: string }> = ({ error, errorHeading }) => (
    <div>
        <div className="typography-meta font-medium text-muted-foreground/80 mb-1">{errorHeading}</div>
        <div
            className="typography-meta p-2 rounded-xl border"
            style={{
                backgroundColor: 'var(--status-error-background)',
                color: 'var(--status-error)',
                borderColor: 'var(--status-error-border)',
            }}
        >
            {error}
        </div>
    </div>
);

export const ToolScalarInputRows: React.FC<{
    rows: ReadonlyArray<{ key: string; value: string }>;
}> = ({ rows }) => (
    <dl data-testid="tool-input-kv-rows" className="space-y-1">
        {rows.map((row) => (
            <div key={row.key} className="grid grid-cols-[minmax(5.5rem,auto)_minmax(0,1fr)] items-baseline gap-x-3 typography-meta">
                <dt dir="auto" className="truncate font-mono typography-micro text-muted-foreground">{row.key}</dt>
                <dd dir="auto" className="min-w-0 whitespace-pre-wrap break-words text-foreground">{row.value}</dd>
            </div>
        ))}
    </dl>
);

export const ToolStructuredBody: React.FC<{
    toolName: string;
    toolCallId: string;
    input?: JsonObject;
    details?: JsonValue;
    outputText: string;
    sessionId?: string;
    directory?: string;
    isMobile: boolean;
    isError: boolean;
    errorText?: string;
    onShowPopup?: (content: ToolPopupContent) => void;
}> = ({
    toolName,
    toolCallId,
    input,
    details,
    outputText,
    sessionId,
    directory,
    isMobile,
    isError,
    errorText,
    onShowPopup,
}) => {
        const { t } = useI18n();
        const showError = Boolean(errorText && errorText !== outputText.trim());

        if (isVibeCardTool(toolName)) {
            return (
                <>
                    <VibeToolCard
                        toolName={toolName}
                        toolCallId={toolCallId}
                        input={input}
                        details={details}
                        outputText={outputText}
                        sessionId={sessionId}
                        directory={directory}
                        isMobile={isMobile}
                        isError={isError}
                    />
                    {showError && errorText ? <ToolPartErrorBox error={errorText} errorHeading={t('chat.toolPart.error')} /> : null}
                </>
            );
        }

        if (isWaitCardTool(toolName)) {
            return (
                <>
                    {details !== undefined || outputText.trim().length > 0 ? (
                        <WaitToolCard details={details} outputText={outputText} isError={isError} />
                    ) : (
                        <div className="typography-meta text-muted-foreground/70">{t('chat.toolPart.awaitingResponse')}</div>
                    )}
                    {showError && errorText ? <ToolPartErrorBox error={errorText} errorHeading={t('chat.toolPart.error')} /> : null}
                </>
            );
        }

        if (isStructuredCardTool(toolName)) {
            return (
                <>
                    <StructuredToolCard
                        toolName={toolName}
                        input={input}
                        details={details}
                        output={outputText}
                        onShowPopup={onShowPopup}
                    />
                    {showError && errorText ? <ToolPartErrorBox error={errorText} errorHeading={t('chat.toolPart.error')} /> : null}
                </>
            );
        }

        return null;
    };
