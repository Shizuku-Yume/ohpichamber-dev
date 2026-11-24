import {
  MarketplaceErrorCodeSchema,
  MarketplaceErrorDetailsSchema,
  type MarketplaceErrorCode,
  type MarketplaceErrorDetails,
  type MarketplaceSourceFailure,
  type ProblemDetails,
} from '@openchamber/agent-contract';
import type { I18nKey } from '@/lib/i18n';

export type MarketplaceTranslateFn = (key: I18nKey, params?: Record<string, string | number>) => string;

interface ParsedMarketplaceProblem {
  code: MarketplaceErrorCode;
  details: MarketplaceErrorDetails | null;
  detail: string;
}

function parseMarketplaceProblem(problem: ProblemDetails | null): ParsedMarketplaceProblem | null {
  if (!problem) return null;
  const code = MarketplaceErrorCodeSchema.safeParse(problem.code);
  if (!code.success) return null;
  const parsedDetails = problem.details === undefined
    ? null
    : MarketplaceErrorDetailsSchema.safeParse(problem.details);
  return {
    code: code.data,
    details: parsedDetails?.success ? parsedDetails.data : null,
    detail: problem.detail,
  };
}

function translateMarketplaceCode(
  code: MarketplaceErrorCode,
  target: string | undefined,
  t: MarketplaceTranslateFn,
): string {
  switch (code) {
    case 'MARKETPLACE_SOURCE_MISSING':
      return target
        ? t('settings.plugins.marketplace.error.sourceMissingNamed', { target })
        : t('settings.plugins.marketplace.error.sourceMissing');
    case 'MARKETPLACE_SOURCE_EXISTS':
      return target
        ? t('settings.plugins.marketplace.error.sourceExistsNamed', { target })
        : t('settings.plugins.marketplace.error.sourceExists');
    case 'MARKETPLACE_INVALID_SOURCE':
      return target
        ? t('settings.plugins.marketplace.error.invalidSourceNamed', { target })
        : t('settings.plugins.marketplace.error.invalidSource');
    case 'MARKETPLACE_NETWORK_ERROR':
      return target
        ? t('settings.plugins.marketplace.error.networkNamed', { target })
        : t('settings.plugins.marketplace.error.network');
  }
}

export function formatMarketplaceFailure(failure: MarketplaceSourceFailure, t: MarketplaceTranslateFn): string {
  const target = failure.sourceUri ? `${failure.name} (${failure.sourceUri})` : failure.name;
  return translateMarketplaceCode(failure.code, target, t);
}

export function formatMarketplaceProblemLines(problem: ProblemDetails | null, t: MarketplaceTranslateFn): string[] {
  const parsed = parseMarketplaceProblem(problem);
  if (!parsed) {
    if (problem) {
      return [problem.detail || problem.title || t('settings.plugins.error.operation')];
    }
    return [t('settings.plugins.error.operation')];
  }

  const lines: string[] = [];
  const details = parsed.details;
  if (details?.updatedCount !== undefined && details.updatedCount > 0 && details.failures && details.failures.length > 0) {
    const names = details.failures.map(item => item.name).join(', ');
    lines.push(
      details.updatedCount === 1
        ? t('settings.plugins.marketplace.error.partialUpdatedOne', { names })
        : t('settings.plugins.marketplace.error.partialUpdatedMany', { count: details.updatedCount, names }),
    );
  }

  if (details?.failures && details.failures.length > 0) {
    for (const item of details.failures) {
      lines.push(formatMarketplaceFailure(item, t));
    }
    return lines;
  }

  const target = details?.sourceName && details.sourceUri
    ? `${details.sourceName} (${details.sourceUri})`
    : details?.sourceName ?? details?.sourceUri;
  lines.push(translateMarketplaceCode(parsed.code, target, t));
  return lines;
}

export function formatMarketplaceProblem(problem: ProblemDetails | null, t: MarketplaceTranslateFn): string {
  return formatMarketplaceProblemLines(problem, t).join(' ');
}
