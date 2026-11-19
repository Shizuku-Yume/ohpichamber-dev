import { formatAgentStatus, type AgentStatus } from '@/lib/agentStatus';
import { useI18n } from '@/lib/i18n';

<<<<<<< HEAD
/** The status row's and the pill's label in the reader's language. */
||||||| bc50ba56aa
/**
 * The status row's and the pill's label in the reader's language. A block of
 * reasoning now and then says one of the locale's thinking jokes instead of
 * "thinking"; while the locale's jokes load it says "thinking".
 */
=======
>>>>>>> upstream/main
export function useAgentStatusLabel(status: AgentStatus | null, modelName?: string | null): string | null {
  const { t, locale } = useI18n();
  if (!status) return null;
  return formatAgentStatus(t, locale, status, modelName);
}
