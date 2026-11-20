import { describe, expect, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import { I18nProvider } from '@/lib/i18n';
import { TableAutoChart } from './TableAutoChart';
describe('TableAutoChart rendering', () => {
  test('renders SVG chart for tables with numeric columns and labels', () => {
    const headers = ['Model', 'Latency (ms)', 'Throughput (tok/s)'];
    const rows = [
      ['Claude 3.5 Sonnet', '250', '65'],
      ['GPT-4o', '180', '80'],
      ['DeepSeek V3', '120', '95'],
    ];

    const html = renderToString(<I18nProvider><TableAutoChart headers={headers} rows={rows} /></I18nProvider>);
    expect(html).toContain('data-oc-table-chart');
    expect(html).toContain('<svg');
    expect(html).toContain('Claude 3.5 Sonnet');
    expect(html).toContain('GPT-4o');
    expect(html).toContain('DeepSeek V3');
  });

  test('handles negative and positive values properly with origin', () => {
    const headers = ['Metric', 'Delta (%)'];
    const rows = [
      ['Cache hit rate', '+45%'],
      ['Execution time', '-20%'],
      ['Memory overhead', '-5%'],
      ['Throughput', '+15%'],
    ];

    const html = renderToString(<I18nProvider><TableAutoChart headers={headers} rows={rows} /></I18nProvider>);
    expect(html).toContain('data-oc-table-chart');
    expect(html).toContain('<svg');
    expect(html).toContain('Cache hit rate');
    expect(html).toContain('Execution time');
    expect(html).toContain('+45%');
    expect(html).toContain('-20%');
  });

  test('returns null when there are no numeric columns or fewer than 2 rows', () => {
    const textHeaders = ['Name', 'Role'];
    const textRows = [
      ['Alice', 'Engineer'],
      ['Bob', 'Designer'],
    ];
    const textHtml = renderToString(<I18nProvider><TableAutoChart headers={textHeaders} rows={textRows} /></I18nProvider>);
    expect(textHtml).toBe('');
    const singleRow = [['Alice', '100']];
    const singleHtml = renderToString(<I18nProvider><TableAutoChart headers={['Name', 'Score']} rows={singleRow} /></I18nProvider>);
    expect(singleHtml).toBe('');
  });
});
