import React from 'react';
import { AnimatePresence } from 'motion/react';
import { ComposerFloatingPanel } from './composer/ui/ComposerFloatingPanel';
import { useI18n } from '@/lib/i18n';
import { useScopedBlockingForms } from '@/sync/sync-context';
import { useRequestReveal } from '@/sync/request-reveal';
import { FormCard } from './FormCard';

interface FormDockProps { sessionId: string | null; directory?: string; hidden: boolean }
const FormDockView: React.FC<FormDockProps> = ({ sessionId, directory, hidden }) => {
    const { t } = useI18n();
    const forms = useScopedBlockingForms(sessionId, directory);
    const [collapsed, setCollapsed] = React.useState(false);
    const ids = React.useMemo(() => forms.map((form) => form.questionId), [forms]);
    useRequestReveal(ids, React.useCallback(() => setCollapsed(false), []));
    const form = forms[0];
    // Canonical questions carry a prompt and optional JSON schema, not
    // OpenCode form fields or web-search consent metadata.
    return <AnimatePresence>{hidden || !form ? null : <ComposerFloatingPanel
        role="dialog" ariaLabel={t('chat.formCard.inputNeeded')} compact={collapsed}
        header={<button type="button" aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>{t('chat.formCard.inputNeeded')}</button>}
    >{collapsed ? null : <div className="max-h-[50vh] overflow-y-auto"><FormCard key={form.questionId} form={form} /></div>}</ComposerFloatingPanel>}</AnimatePresence>;
};
export const FormDock = React.memo(FormDockView);
