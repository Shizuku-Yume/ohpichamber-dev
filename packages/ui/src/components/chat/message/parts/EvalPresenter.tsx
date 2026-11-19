import type { ToolCallPart, ToolResultPart } from '@openchamber/agent-contract';
import type { ToolPopupContent } from '../types';
import React from 'react';

import { SimpleMarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { useEvalView } from '@/lib/toolPresentation';
import { EvalCellBlock } from './EvalCellBlock';
import { EvalStepList } from './EvalStepList';

interface EvalPresenterProps {
    call: ToolCallPart | undefined;
    result: ToolResultPart | undefined;
    onShowPopup?: (content: ToolPopupContent) => void;
}

export const EvalPresenter: React.FC<EvalPresenterProps> = ({
    call,
    result,
    onShowPopup,
}) => {
    const { t } = useI18n();
    const evalData = useEvalView(call, result);

    const openImagePreview = (index: number) => {
        if (!onShowPopup || evalData.images.length === 0) return;
        const gallery = evalData.images.map((img, imgIdx) => ({
            url: `data:${img.mediaType};base64,${img.data}`,
            mimeType: img.mediaType,
            filename: img.title ?? `eval output ${imgIdx + 1}`,
        }));
        onShowPopup({
            open: true,
            title: gallery[index]?.filename ?? 'eval output',
            content: '',
            image: { ...gallery[index]!, gallery, index },
        });
    };

    return (
        <div data-testid="eval-presenter" className="space-y-3 w-full min-w-0">
            {/* Cell blocks */}
            <div className="space-y-2.5">
                {evalData.cells.map((cell, idx) => (
                    <EvalCellBlock
                        key={idx}
                        cell={cell}
                        cellIndex={idx}
                        totalCells={evalData.cells.length}
                        onShowPopup={onShowPopup}
                    />
                ))}
            </div>

            {/* Top-level status events if present without cells or in addition */}
            {evalData.statusEvents && evalData.statusEvents.length > 0 && evalData.cells.every((c) => !c.statusEvents?.length) ? (
                <EvalStepList
                    statusEvents={evalData.statusEvents}
                    statusEventsElided={evalData.statusEventsElided}
                    isCellRunning={evalData.isRunning}
                    onShowPopup={onShowPopup}
                />
            ) : null}

            {/* out:// replies */}
            {evalData.replies && evalData.replies.length > 0 ? (
                <div data-testid="eval-replies" className="space-y-1.5 pt-1">
                    {evalData.replies.map((reply, rIdx) => (
                        <div
                            key={rIdx}
                            className="rounded-lg border border-border/30 bg-muted/20 p-2.5 text-sm text-foreground/90"
                        >
                            <SimpleMarkdownRenderer content={reply} variant="tool" onShowPopup={onShowPopup} />
                        </div>
                    ))}
                </div>
            ) : null}

            {/* Images */}
            {evalData.images.length > 0 ? (
                <div data-testid="eval-images" className="flex flex-wrap gap-2 pt-1">
                    {evalData.images.map((img, imgIdx) => (
                        <button
                            key={imgIdx}
                            type="button"
                            onClick={() => openImagePreview(imgIdx)}
                            className="relative group rounded-lg overflow-hidden border border-border/40 hover:border-primary/60 transition-colors cursor-pointer"
                        >
                            <img
                                src={`data:${img.mediaType};base64,${img.data}`}
                                alt={img.title ?? `eval image ${imgIdx + 1}`}
                                className="h-24 w-auto max-w-[200px] object-cover"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs">
                                <Icon name="zoom-in" className="size-4" />
                            </div>
                        </button>
                    ))}
                </div>
            ) : null}

            {/* Footer notices (notice, meta truncation, async badge) */}
            <div className="space-y-1 pt-1 text-xs text-muted-foreground/80">
                {evalData.async ? (
                    <div
                        data-testid="eval-async-badge"
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[11px]"
                    >
                        <Icon name="history" className="size-3" />
                        <span>
                            {t('chat.eval.backgroundJob', { id: evalData.async.jobId })} · {evalData.async.state}
                        </span>
                    </div>
                ) : null}

                {evalData.notice ? (
                    <div data-testid="eval-notice" className="text-muted-foreground/80 select-text">
                        {evalData.notice}
                    </div>
                ) : null}

                {evalData.meta?.truncated ? (
                    <div data-testid="eval-meta-truncated" className="text-[var(--status-warning-text)] flex items-center gap-1">
                        <Icon name="error-warning" className="size-3" />
                        <span>{t('chat.toolPart.outputTruncated')}</span>
                    </div>
                ) : null}
            </div>
        </div>
    );
};
