import { describe, expect, test } from 'bun:test';

import { chatWorkbenchI18n } from './messages/chat-workbench.i18n';
import { extensionsSettingsI18n } from './messages/extensions.settings.i18n';
import { ompSettingsI18n } from './messages/omp-settings.i18n';
import { usageStatsI18n } from './messages/usage-stats.i18n';
import { dict as zhCnDict } from './messages/zh-CN';
import { settingsDict as zhCnSettingsDict } from './messages/zh-CN.settings';
import { dict as zhTwDict } from './messages/zh-TW';
import { settingsDict as zhTwSettingsDict } from './messages/zh-TW.settings';

/**
 * Narrow explicit allowlist of keys whose zh-CN strings legitimately refer to
 * security, API or authentication credentials ("访问令牌", "API 令牌", "个人访问令牌", etc.).
 *
 * LLM token copy must never use "令牌", "词元", or "詞元"; it writes "Token".
 */
const CREDENTIAL_ALLOWLIST: Record<string, true> = {
  'mobile.connect.headers.hint': true,
  'mobile.connect.firstRun.addressHint': true,
  'mobile.connect.token.label': true,
  'mobile.connect.token.placeholder': true,
  'mobile.connect.token.hint': true,
  'mobile.connect.error.authRequired': true,
  'settings.providers.page.quotaCredentials.accessToken': true,
  'settings.providers.page.quotaCredentials.usageToken': true,
  'settings.providers.page.quotaCredentials.exeDevTokenInstructions': true,
  'settings.providers.page.quotaCredentials.refreshToken': true,
  'settings.providers.page.quotaCredentials.tokenPlaceholder': true,
  'settings.openchamber.tools.field.agentSecretToolSummary': true,
  'settings.remoteInstances.direct.sidebarDescription': true,
  'settings.remoteInstances.direct.addDialog.description': true,
  'settings.remoteInstances.direct.field.tokenPlaceholder': true,
  'settings.remoteInstances.direct.note': true,
  'settings.remoteInstances.direct.headers.description': true,
  'settings.remoteInstances.clientAuth.description': true,
  'settings.remoteInstances.clientAuth.actions.create': true,
  'settings.remoteInstances.clientAuth.createdToken': true,
  'settings.remoteInstances.clientAuth.state.loading': true,
  'settings.remoteInstances.relay.pair.includeToken': true,
  'settings.remoteInstances.relay.pair.noTokenHint': true,
  'settings.gitIdentities.editor.auth.accountHint': true,
  'settings.github.page.ghCli.title': true,
  'settings.sourceControl.token.create': true,
  'settings.sourceControl.token.rejected': true,
  'settings.sourceControl.token.label': true,
  'settings.sourceControl.token.info': true,
  'settings.sourceControl.accountSource.pat': true,
  'settings.gitlab.status.tokenRejected': true,
  'settings.gitlab.token.label': true,
  'settings.gitlab.token.info': true,
  'settings.classification.custom.key.info': true,
  'settings.integrations.guests.info': true,
  'settings.integrations.guests.field.token': true,
  'settings.integrations.guests.field.token.info': true,
  'settings.integrations.guests.toast.tokenRequired': true,
  'settings.integrations.guests.toast.tokenInvalid': true,
  'settings.extensions.capability.service.providesSourceControl': true,
  'settings.extensions.capability.service.providesNotifications': true,
  'settings.extensions.capability.service.providesTracker.tokens': true,
  'settings.integrations.tracker.field.token': true,
  'settings.integrations.tracker.field.token.info': true,
  'settings.integrations.tracker.field.token.scopes': true,
  'settings.integrations.tracker.method.token': true,
  'settings.integrations.tracker.toast.tokenRequired': true,
  'settings.integrations.tracker.toast.tokenRefused': true,
  'settings.integrations.channels.invalid.hint': true,
  'settings.integrations.channels.field.token.info': true,
  'settings.integrations.channels.field.token.scopes': true,
  'settings.integrations.channels.toast.tokenRefused': true,
  'integrationsCatalog.status.token': true,
  'integrationsCatalog.action.token.install': true,
  'integrationsCatalog.token.label': true,
  'integrationsCatalog.token.placeholder': true,
  'integrationsCatalog.token.required': true,
  'integrationsCatalog.token.getToken': true,
  'integrationsCatalog.entry.github.description': true,
  'integrationsCatalog.entry.github.details': true,
  'integrationsCatalog.entry.stytch.details': true,
  'integrationsCatalog.entry.storyblok.details': true,
};

const FORBIDDEN_TOKEN_TERMS = /[词詞符]元/;

function isCredentialKey(key: string): boolean {
  return (
    Boolean(CREDENTIAL_ALLOWLIST[key]) ||
    key.startsWith('settings.openchamber.tunnel.') ||
    key.startsWith('settings.remoteInstances.') ||
    key.startsWith('settings.sourceControl.') ||
    key.startsWith('settings.gitlab.') ||
    key.startsWith('settings.routing.token.') ||
    key.startsWith('mobile.connect.') ||
    key.startsWith('settings.providers.page.quotaCredentials.')
  );
}

function findViolations(
  dictionary: Record<string, unknown>,
  options: { checkZhTwTokens?: boolean } = {},
): string[] {
  const violations: string[] = [];

  for (const [key, value] of Object.entries(dictionary)) {
    if (typeof value !== 'string') continue;

    if (FORBIDDEN_TOKEN_TERMS.test(value)) {
      violations.push(`${key}: "${value}" contains forbidden token term (词元/詞元/符元)`);
      continue;
    }

    if (value.includes('令牌') && !isCredentialKey(key)) {
      violations.push(`${key}: "${value}" uses token-sense "令牌" instead of "Token"`);
      continue;
    }

    if (options.checkZhTwTokens && value.includes('權杖') && !isCredentialKey(key)) {
      violations.push(`${key}: "${value}" uses token-sense "權杖" instead of "Token"`);
      continue;
    }

    // Catch lowercase "token" / "tokens" in Chinese copy outside parameter placeholders (e.g. {tokens})
    const textWithoutPlaceholders = value.replace(/\{[^{}]*\}/g, '');
    if (/\btokens?\b/.test(textWithoutPlaceholders) && !isCredentialKey(key)) {
      violations.push(`${key}: "${value}" uses lowercase "token(s)" instead of "Token"`);
    }
  }

  return violations;
}

describe('Chinese copy writes LLM tokens as "Token"', () => {
  test('zh-CN dictionary contains no 词元, 詞元 or token-sense 令牌', () => {
    const violations = findViolations(zhCnDict);
    expect(violations).toEqual([]);
  });

  test('zh-TW dictionary contains no 词元, 詞元, 符元 or token-sense 令牌/權杖', () => {
    const violations = findViolations(zhTwDict, { checkZhTwTokens: true });
    expect(violations).toEqual([]);
  });

  test('zh-CN.settings dictionary contains no 词元 or token-sense 令牌', () => {
    const violations = findViolations(zhCnSettingsDict);
    expect(violations).toEqual([]);
  });

  test('zh-TW.settings dictionary contains no 词元, 詞元, 符元 or token-sense 令牌/權杖', () => {
    const violations = findViolations(zhTwSettingsDict, { checkZhTwTokens: true });
    expect(violations).toEqual([]);
  });

  test('per-area i18n modules carry no 词元/詞元/符元 or token-sense 令牌/權杖 in zh-CN and zh-TW', () => {
    const violations: string[] = [];

    const modules = [
      { name: 'chatWorkbenchI18n', module: chatWorkbenchI18n },
      { name: 'extensionsSettingsI18n', module: extensionsSettingsI18n },
      { name: 'ompSettingsI18n', module: ompSettingsI18n },
      { name: 'usageStatsI18n', module: usageStatsI18n },
    ];

    for (const { name, module } of modules) {
      const zhCn = module['zh-CN'] as Record<string, unknown> | undefined;
      const zhTw = module['zh-TW'] as Record<string, unknown> | undefined;

      if (zhCn) {
        for (const violation of findViolations(zhCn)) {
          violations.push(`${name}[zh-CN] ${violation}`);
        }
      }
      if (zhTw) {
        for (const violation of findViolations(zhTw, { checkZhTwTokens: true })) {
          violations.push(`${name}[zh-TW] ${violation}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
