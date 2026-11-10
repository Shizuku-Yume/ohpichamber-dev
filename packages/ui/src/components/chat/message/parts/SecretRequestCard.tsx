import React from 'react';

import { dispatchPageWaiting } from '@/components/chat/lib/scroll/timelineScrollIntent';
import { Icon } from '@/components/icon/Icon';
import { toast } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';
import type { CanonicalToolView, RequestedSecret } from './toolView';
import { answerSecretRequest } from '@/lib/secretRequestAnswer';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionDirectory } from '@/sync/sync-context';

import ToolPartRow from './ToolPart';

/** A password field with a show/hide toggle that never sends the value anywhere new. */
function SecretInput({ value, onChange, placeholder, ariaLabel, disabled }: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    ariaLabel: string;
    disabled: boolean;
}) {
    const { t } = useI18n();
    const [revealed, setRevealed] = React.useState(false);
    return (
        <div className="relative min-w-0 flex-1">
            <Input
                type={revealed ? 'text' : 'password'}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                aria-label={ariaLabel}
                // Keep password managers from offering to store or fill it.
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-bwignore
                disabled={disabled}
                className="w-full pe-9"
            />
            <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute inset-e-1 top-1/2 size-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={t(revealed ? 'chat.secretRequest.hideSecret' : 'chat.secretRequest.showSecret')}
                aria-pressed={revealed}
                title={t(revealed ? 'chat.secretRequest.hideSecret' : 'chat.secretRequest.showSecret')}
                disabled={disabled}
                onClick={() => setRevealed((current) => !current)}
            >
                <Icon name={revealed ? 'eye-off' : 'eye'} className="size-4" />
            </Button>
        </div>
    );
}

/** The chat brings a card that waits into view, like a page that waits. */
function useWaitingIntoView(waiting: boolean) {
    const blockRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        if (waiting) dispatchPageWaiting(blockRef.current);
    }, [waiting]);
    return blockRef;
}

/**
 * The call's ordinary tool row, for the moments the card asks nothing: while
 * OpenCode asks to approve the command, while the command runs, and right
 * after this client answered. A finished call is that row anyway
 * (`isShownInPlace`), so the card never leaves a look of its own behind.
 */
function SecretCallRow({ part }: { part: CanonicalToolView }) {
    const isMobile = useUIStore((state) => state.isMobile);
    const [expanded, setExpanded] = React.useState(false);
    const toggle = React.useCallback(() => setExpanded((current) => !current), []);
    return <ToolPartRow part={part.call} pairedCall={part.call} isExpanded={expanded} onToggle={toggle} isMobile={isMobile} />;
}

/**
 * The card a `secret.request` asks on. The value goes straight to the
 * server, which writes it to a private file; the call, the transcript and the
 * agent's context only ever see the file's path. Once this client answered,
 * the call shows as its tool row.
 */
export function SecretRequestCard({ part, request }: { part: CanonicalToolView; request: RequestedSecret }) {
    const { t } = useI18n();
    const directory = useSessionDirectory(part.sessionID);
    const [value, setValue] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    // This client answered; the call completes a moment later.
    const [sent, setSent] = React.useState(false);

    const send = React.useCallback(async (answer: { value: string } | { declined: true }) => {
        setBusy(true);
        try {
            await answerSecretRequest({ sessionId: part.sessionID, callId: part.callID, ...answer }, directory);
            setValue('');
            setSent(true);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            toast.error(t('chat.secretRequest.saveFailed'), { description: message });
        } finally {
            setBusy(false);
        }
    }, [directory, part.callID, part.sessionID, t]);

    const blockRef = useWaitingIntoView(!sent);
    if (sent) return <SecretCallRow part={part} />;

    return (
        <div ref={blockRef} className="oc-tile my-2 rounded-xl p-4" data-secret-request-status="waiting" data-waiting-page={part.id}>
            <div className="typography-ui-label font-semibold text-foreground">{request.label}</div>
            <p className="mt-1 whitespace-pre-wrap break-words typography-markdown text-muted-foreground">{request.reason}</p>
            <form
                className="mt-3 flex items-center gap-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (value.trim() && !busy) void send({ value });
                }}
            >
                <SecretInput
                    value={value}
                    onChange={setValue}
                    placeholder={request.placeholder ?? t('chat.secretRequest.placeholder')}
                    ariaLabel={t('chat.secretRequest.inputLabel')}
                    disabled={busy}
                />
                <Button type="submit" disabled={busy || !value.trim()}>{t('chat.secretRequest.save')}</Button>
            </form>
            <div className="mt-2 flex items-center gap-1.5 typography-meta text-muted-foreground">
                <Icon name="shield-check" className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1">{t('chat.secretRequest.privacy')}</span>
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void send({ declined: true })}>
                    {t('chat.secretRequest.decline')}
                </Button>
            </div>
        </div>
    );
}

