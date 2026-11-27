import React from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui';
import { copyTextToClipboard } from '@/lib/clipboard';
import { delay } from '@/lib/timing/delay';
import { Icon } from '@/components/icon/Icon';
import { HoverTooltip } from '@/components/ui/row-tooltip';
import { useI18n } from '@/lib/i18n';

export const CopyToolOutputButton: React.FC<{ output: string }> = ({ output }) => {
    const { t } = useI18n();
    const [copied, setCopied] = React.useState(false);
    const [prevOutput, setPrevOutput] = React.useState(output);
    const copyTokenRef = React.useRef(0);

    if (prevOutput !== output) {
        setPrevOutput(output);
        copyTokenRef.current += 1;
        setCopied(false);
    }

    const handleCopy = React.useCallback(async (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        const token = ++copyTokenRef.current;
        const result = await copyTextToClipboard(output);
        if (!result.ok) {
            toast.error(t('chat.toolPart.copyOutputFailed'));
            return;
        }
        if (copyTokenRef.current !== token) {
            return;
        }
        setCopied(true);
        void delay(1200).then(() => {
            if (copyTokenRef.current === token) {
                setCopied(false);
            }
        });
    }, [output, t]);

    return (
        <HoverTooltip label={copied ? t('chat.toolPart.copiedOutput') : t('chat.toolPart.copyOutput')}>
            <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-md bg-[var(--surface-elevated)]/80 text-muted-foreground hover:text-foreground"
                onClick={handleCopy}
                onPointerDown={(event) => event.stopPropagation()}
                aria-label={copied ? t('chat.toolPart.copiedOutput') : t('chat.toolPart.copyOutput')}
            >
                <Icon name={copied ? 'check' : 'file-copy'} className="h-3.5 w-3.5" />
            </Button>
        </HoverTooltip>
    );
};
