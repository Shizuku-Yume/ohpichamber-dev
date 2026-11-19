import type { useI18n } from '@/lib/i18n';
import { CanonicalApiError } from '@/api/canonicalClient';

type Translate = ReturnType<typeof useI18n>['t'];

<<<<<<< HEAD
/**
 * One sentence a person can act on when a session action fails. A canonical
 * failure names the status, problem code and occurrence reference, because
 * "500" alone sends whoever reads it hunting for a server that is in fact up.
 */
||||||| bc50ba56aa
/**
 * One sentence a person can act on when a session action fails. An OpenCode
 * failure names the status, the error class and the log ref, because "500"
 * alone sends whoever reads it hunting for a server that is in fact up.
 */
=======
>>>>>>> upstream/main
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
