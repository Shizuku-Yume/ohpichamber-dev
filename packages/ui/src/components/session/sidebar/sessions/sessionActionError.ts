import type { useI18n } from '@/lib/i18n';
import { CanonicalApiError } from '@/api/canonicalClient';

type Translate = ReturnType<typeof useI18n>['t'];

export const describeSessionActionError = (error: Error, t: Translate): string => {
  if (error instanceof CanonicalApiError) {
    const problem = error.problem;
    if (problem.status !== undefined && problem.instance) {
      return t('sessions.sidebar.session.action.upstreamErrorWithRef', {
        status: problem.status,
        name: problem.code,
        ref: problem.instance,
      });
    }
    if (problem.status !== undefined) {
      return t('sessions.sidebar.session.action.upstreamError', {
        status: problem.status,
        message: problem.detail || problem.code || t('sessions.sidebar.session.action.noDetails'),
      });
    }
  }
  return error.message || t('sessions.sidebar.session.action.noDetails');
};
