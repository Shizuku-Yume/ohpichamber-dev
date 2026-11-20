import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContextUsageDisplay } from './ContextUsageDisplay';
import { I18nProvider } from '@/lib/i18n';

describe('ContextUsageDisplay', () => {
  test('renders circular progress with threshold tick marks when specified', () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <ContextUsageDisplay
          reading={{ state: 'measured', totalTokens: 160000, percentage: 80 }}
          contextLimit={200000}
          showPercentIcon
          thresholdPercent={85}
          speculationPercent={75}
        />
      </I18nProvider>
    );
    expect(html).toContain('data-testid="compaction-threshold-tick"');
    expect(html).toContain('data-testid="speculation-threshold-tick"');
  });

  test('does not render tick marks when thresholds are undefined or unset', () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <ContextUsageDisplay
          reading={{ state: 'measured', totalTokens: 100000, percentage: 50 }}
          contextLimit={200000}
          showPercentIcon
          thresholdPercent={undefined}
          speculationPercent={undefined}
        />
      </I18nProvider>
    );
    expect(html).not.toContain('data-testid="compaction-threshold-tick"');
    expect(html).not.toContain('data-testid="speculation-threshold-tick"');
  });
});
