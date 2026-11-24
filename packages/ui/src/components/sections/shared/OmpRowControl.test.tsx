/**
 * One OMP registry row per primitive. The rules the pages depend on: the unit
 * chip appears only on a free-form number, the `-1` option is a real choice
 * ("unlimited") rather than the Default sentinel, option copy comes from the
 * locale, and an enum becomes a select once its choices need explaining.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { OmpSetting, OmpSettingValue } from '@openchamber/agent-contract';
import type { Root } from 'react-dom/client';
import { Window } from 'happy-dom';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser,
  document: browser.document,
  navigator: browser.navigator,
  localStorage: browser.localStorage,
  sessionStorage: browser.sessionStorage,
  Node: browser.Node,
  Element: browser.Element,
  HTMLElement: browser.HTMLElement,
  HTMLInputElement: browser.HTMLInputElement,
  HTMLTextAreaElement: browser.HTMLTextAreaElement,
  Event: browser.Event,
  FocusEvent: browser.FocusEvent,
  CustomEvent: browser.CustomEvent,
  KeyboardEvent: browser.KeyboardEvent,
  MouseEvent: browser.MouseEvent,
  PointerEvent: browser.PointerEvent,
  MutationObserver: browser.MutationObserver,
  ResizeObserver: browser.ResizeObserver,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
});

// React DOM reads `document` at module scope, so it must be imported after
// happy-dom installs the globals; a static import would evaluate too early.
// Same reason for the app modules, which reach React and the i18n store.
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nProvider, useI18nStore } = await import('@/lib/i18n');
const { ompSettingsI18n } = await import('@/lib/i18n/messages/omp-settings.i18n');
const { OmpRowControl } = await import('./OmpRowControl');

const settle = async () => {
  await act(async () => {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 0);
    await promise;
  });
};

const assertLeftColumnDescriptionAndHugTrigger = (
  row: HTMLElement,
  descriptionText: string,
) => {
  const leftCol = row.firstElementChild;
  const controlCol = row.lastElementChild;
  const trigger = row.querySelector<HTMLElement>('[role="combobox"]');
  expect(leftCol).not.toBeNull();
  expect(controlCol).not.toBeNull();
  expect(leftCol).not.toBe(controlCol);
  expect(leftCol!.compareDocumentPosition(controlCol!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

  const descParagraph = Array.from(row.querySelectorAll('p')).find((p) =>
    p.textContent?.includes(descriptionText));
  expect(descParagraph).toBeDefined();
  expect(leftCol!.contains(descParagraph!)).toBe(true);
  expect(controlCol!.contains(descParagraph!)).toBe(false);

  expect(trigger).not.toBeNull();
  expect(controlCol!.contains(trigger!)).toBe(true);
  expect(controlCol!.classList.contains('flex-col')).toBe(false);
  expect(controlCol!.classList.contains('items-end')).toBe(false);
  expect(trigger!.classList.contains('w-fit')).toBe(true);
  expect(trigger!.classList.contains('min-w-[8ch]')).toBe(true);
  expect(trigger!.classList.contains('max-w-[28ch]')).toBe(true);
  expect(trigger!.classList.contains('@xl:w-56')).toBe(false);
};
const setting = (overrides: Partial<OmpSetting> & Pick<OmpSetting, 'id' | 'type'>): OmpSetting => ({
  value: null,
  default: null,
  configured: false,
  placement: { type: 'engine' },
  ...overrides,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const render = async (row: OmpSetting, value: OmpSettingValue, onChange: (next: OmpSettingValue) => void = () => { }) => {
  await act(async () => {
    root.render(
      <I18nProvider>
        <OmpRowControl setting={row} value={value} onChange={onChange} />
      </I18nProvider>,
    );
  });
};

/** Open a settings select and return the rows it offers. */
const openOptions = async (row: HTMLElement) => {
  const trigger = row.querySelector<HTMLElement>('[role="combobox"]');
  if (!trigger) throw new Error('select trigger missing');
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
  });
  return Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'));
};

const pick = async (option: HTMLElement) => {
  await act(async () => { option.click(); });
};

describe('units', () => {
  test('a free-form number shows the unit its id implies', async () => {
    await render(setting({ id: 'mcp.startupTimeoutMs', type: 'number' }), 250);
    const row = container.querySelector('[data-settings-item="omp.mcp.startupTimeoutMs"]');
    expect(row?.textContent).toContain('ms');
  });

  test('the unit chip precedes the stepper so every stepper keeps the row right edge', async () => {
    // The control column packs to the row's inline end, so only the trailing
    // element lands on the same right edge as the selects. A chip rendered
    // after the stepper would push that stepper left on unit rows only, which
    // is the ragged edge this row exists to avoid.
    await render(setting({ id: 'read.summarize.minBodyLines', type: 'number' }), 4);
    const stepperRow = container.querySelector<HTMLElement>('[data-settings-item="omp.read.summarize.minBodyLines"]');
    expect(stepperRow).not.toBeNull();
    const unit = Array.from(stepperRow!.querySelectorAll('span')).find((el) => el.textContent === 'lines');
    const stepper = stepperRow!.querySelector('input');
    expect(unit).toBeDefined();
    expect(stepper).not.toBeNull();
    expect(unit!.compareDocumentPosition(stepper!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The stepper is the cluster's last element, so it ends the row.
    const cluster = unit!.parentElement;
    expect(cluster!.lastElementChild!.contains(stepper!)).toBe(true);
  });

  test('a KB row shows KB, and the MB row shows no chip at all', async () => {
    await render(setting({ id: 'tools.artifactTailBytes', type: 'number' }), 20);
    expect(container.querySelector('[data-settings-item="omp.tools.artifactTailBytes"]')?.textContent).toContain('KB');

    await render(setting({ id: 'tools.artifactMaxBytes', type: 'number' }), 16);
    const maxRow = container.querySelector('[data-settings-item="omp.tools.artifactMaxBytes"]');
    expect(maxRow?.textContent).not.toContain('KB');
    expect(maxRow?.textContent).not.toContain('columns');
  });

  test('a number row with options shows the unit in its option labels, not as a chip', async () => {
    await render(setting({
      id: 'lsp.requestTimeout',
      type: 'number',
      options: [
        { value: '10', label: '10 seconds' },
        { value: '60', label: '1 minute' },
      ],
    }), 10);
    const row = container.querySelector<HTMLElement>('[data-settings-item="omp.lsp.requestTimeout"]');
    expect(row).not.toBeNull();
    expect(row?.textContent).toContain('10 seconds');
    // A select row has no stepper, so no unit chip can be appended to it.
    expect(row?.querySelector('input[type="number"], input[inputmode="numeric"]')).toBeNull();
  });

  test('Minutes and Hours suffixes render localized unit badges in English and non-English locales', async () => {
    await render(setting({ id: 'codexResets.minBlockedMinutes', type: 'number' }), 60);
    const enMinutesRow = container.querySelector('[data-settings-item="omp.codexResets.minBlockedMinutes"]');
    expect(enMinutesRow?.textContent).toContain('minutes');

    await render(setting({ id: 'claudeResets.salvageHorizonHours', type: 'number' }), 12);
    const enHoursRow = container.querySelector('[data-settings-item="omp.claudeResets.salvageHorizonHours"]');
    expect(enHoursRow?.textContent).toContain('hours');

    await act(async () => {
      useI18nStore.getState().setLocale('zh-CN');
    });
    while (useI18nStore.getState().loadingLocale) {
      await settle();
    }
    try {
      await render(setting({ id: 'claudeResets.minBlockedMinutes', type: 'number' }), 60);
      expect(container.querySelector('[data-settings-item="omp.claudeResets.minBlockedMinutes"]')?.textContent).toContain('分钟');

      await render(setting({ id: 'codexResets.salvageHorizonHours', type: 'number' }), 12);
      expect(container.querySelector('[data-settings-item="omp.codexResets.salvageHorizonHours"]')?.textContent).toContain('小时');
    } finally {
      await act(async () => {
        useI18nStore.getState().setLocale('en');
      });
      while (useI18nStore.getState().loadingLocale) {
        await settle();
      }
    }
  });
});

describe('the -1 option', () => {
  const recursion = setting({
    id: 'task.maxRecursionDepth',
    type: 'number',
    options: [
      { value: '-1', label: 'Unlimited' },
      { value: '0', label: 'None' },
      { value: '2', label: 'Double' },
    ],
  });

  test('a stored -1 on a row that declares it shows Unlimited, not Default', async () => {
    await render(recursion, -1);
    const row = container.querySelector<HTMLElement>('[data-settings-item="omp.task.maxRecursionDepth"]');
    expect(row?.textContent).toContain('Unlimited');
    expect(row?.textContent).not.toContain('Default');
  });

  test('choosing Unlimited writes -1, never the sentinel', async () => {
    const writes: OmpSettingValue[] = [];
    await render(recursion, 2, (next) => writes.push(next));
    const row = container.querySelector<HTMLElement>('[data-settings-item="omp.task.maxRecursionDepth"]');
    if (!row) throw new Error('row missing');
    const options = await openOptions(row);
    const unlimited = options.find((option) => option.textContent === 'Unlimited');
    if (!unlimited) throw new Error('unlimited option missing');
    await pick(unlimited);
    expect(writes).toEqual([-1]);
  });

  test('choosing Default writes the value the row stores for it (-1)', async () => {
    const writes: OmpSettingValue[] = [];
    await render(setting({
      id: 'compaction.thresholdPercent',
      type: 'number',
      options: [
        { value: 'default', label: 'Default' },
        { value: '50', label: '50%' },
      ],
    }), 50, (next) => writes.push(next));
    const row = container.querySelector<HTMLElement>('[data-settings-item="omp.compaction.thresholdPercent"]');
    if (!row) throw new Error('row missing');
    const options = await openOptions(row);
    const fallback = options.find((option) => option.textContent === 'Default');
    if (!fallback) throw new Error('default option missing');
    await pick(fallback);
    expect(writes).toEqual([-1]);
  });

  test('a stored -1 on a row without that option still reads as Default', async () => {
    await render(setting({
      id: 'compaction.thresholdPercent',
      type: 'number',
      options: [
        { value: 'default', label: 'Default' },
        { value: '50', label: '50%' },
      ],
    }), -1);
    const row = document.querySelector('[data-settings-item="omp.compaction.thresholdPercent"]');
    expect(row?.textContent).toContain('Default');
  });
});

describe('number options', () => {
  test('labels come from the locale and the chosen option explains itself under the field label', async () => {
    await render(setting({
      id: 'compaction.thresholdPercent',
      type: 'number',
      options: [
        { value: 'default', label: 'Default', description: 'Legacy reserve-based threshold' },
        { value: '50', label: '50%', description: 'Halfway point' },
      ],
    }), 50);
    const row = container.querySelector<HTMLElement>('[data-settings-item="omp.compaction.thresholdPercent"]');
    if (!row) throw new Error('row missing');
    expect(row.textContent).toContain('50%');
    assertLeftColumnDescriptionAndHugTrigger(row, 'Halfway point');
  });

  test('a string option value still selects its numeric stored value', async () => {
    await render(setting({
      id: 'lsp.requestTimeout',
      type: 'number',
      options: [
        { value: '10', label: '10 seconds', description: 'Default' },
        { value: '60', label: '1 minute' },
      ],
    }), 60);
    const row = container.querySelector<HTMLElement>('[data-settings-item="omp.lsp.requestTimeout"]');
    expect(row?.textContent).toContain('1 minute');
    expect(row?.textContent).not.toContain('Default');
  });
});

describe('enums', () => {
  test('up to three short unexplained choices stay chips', async () => {
    await render(setting({
      id: 'steeringMode',
      type: 'enum',
      enumValues: ['all', 'one-at-a-time'],
    }), 'all');
    const steeringRow = container.querySelector<HTMLElement>('[data-settings-item="omp.steeringMode"]');
    expect(steeringRow?.querySelector('[role="group"]')).not.toBeNull();
    expect(steeringRow?.querySelector('[role="combobox"]')).toBeNull();
    expect(steeringRow?.textContent).toContain('All at once');

    await render(setting({
      id: 'custom.threeChips',
      type: 'enum',
      enumValues: ['fast', 'balanced', 'thorough'],
    }), 'fast');
    const threeChipRow = container.querySelector<HTMLElement>('[data-settings-item="omp.custom.threeChips"]');
    expect(threeChipRow?.querySelector('[role="group"]')).not.toBeNull();
    expect(threeChipRow?.querySelector('[role="combobox"]')).toBeNull();
  });

  test('more than three choices become a select, translated', async () => {
    await render(setting({
      id: 'edit.mode',
      type: 'enum',
      enumValues: ['apply_patch', 'hashline', 'patch', 'replace', 'sloppy', 'none'],
    }), 'hashline');
    const row = document.querySelector<HTMLElement>('[data-settings-item="omp.edit.mode"]');
    if (!row) throw new Error('row missing');
    expect(row.querySelector('[role="group"]')).toBeNull();
    expect(row.textContent).toContain('Hash-checked lines (default)');

    const options = await openOptions(row);
    const labels = options.map((option) => option.textContent);
    expect(labels).toContain('Apply patch');
    expect(labels).toContain('Off (no edit tool)');
    expect(labels).not.toContain('apply_patch');
  });

  test('an enum with per-option descriptions becomes a select and explains the choice under the field label', async () => {
    await render(setting({
      id: 'ttsr.judge',
      type: 'enum',
      enumValues: ['auto', 'on', 'off'],
      options: [
        { value: 'auto', label: 'Auto', description: 'Judge only when the judge role is a native model' },
        { value: 'on', label: 'On', description: 'Always judge' },
        { value: 'off', label: 'Off', description: 'Never judge' },
      ],
    }), 'on');
    const row = document.querySelector<HTMLElement>('[data-settings-item="omp.ttsr.judge"]');
    if (!row) throw new Error('row missing');
    expect(row.querySelector('[role="combobox"]')).not.toBeNull();
    expect(row.textContent).toContain('Always');
    assertLeftColumnDescriptionAndHugTrigger(row, 'Judge every question rule');
  });

  test('choosing an enum option writes the raw enum value', async () => {
    const writes: OmpSettingValue[] = [];
    await render(setting({
      id: 'edit.mode',
      type: 'enum',
      enumValues: ['apply_patch', 'hashline', 'patch', 'replace', 'sloppy', 'none'],
    }), 'hashline', (next) => writes.push(next));
    const row = document.querySelector<HTMLElement>('[data-settings-item="omp.edit.mode"]');
    if (!row) throw new Error('row missing');
    const options = await openOptions(row);
    const applyPatch = options.find((option) => option.textContent === 'Apply patch');
    if (!applyPatch) throw new Error('apply_patch option missing');
    await pick(applyPatch);
    expect(writes).toEqual(['apply_patch']);
  });
});

describe('booleans and strings', () => {
  test('a boolean is a checkbox row', async () => {
    await render(setting({ id: 'read.summarize.enabled', type: 'boolean' }), true);
    const row = container.querySelector('[data-settings-item="omp.read.summarize.enabled"]');
    expect(row?.textContent).toContain('Read summar');
  });

  test('a string is a short text input', async () => {
    await render(setting({ id: 'custom.endpoint', type: 'string' }), 'https://example.test');
    const input = container.querySelector<HTMLInputElement>('[data-settings-item="omp.custom.endpoint"] input');
    expect(input?.value).toBe('https://example.test');
  });
});

describe('page-placed options in zh-CN', () => {
  test('page-placed number and enum selects render localized zh-CN labels and left-column descriptions', async () => {
    const zhCn: Readonly<Record<string, string>> = ompSettingsI18n['zh-CN'];
    await act(async () => {
      useI18nStore.getState().setLocale('zh-CN');
    });
    while (useI18nStore.getState().loadingLocale) {
      await settle();
    }
    try {
      const samplingPlacement = { type: 'page', page: 'sessions', section: 'sampling' } as const;
      const temperatureSetting = setting({
        id: 'temperature',
        type: 'number',
        placement: samplingPlacement,
        options: [
          { value: '-1', label: 'Default', description: 'Use provider default' },
          { value: '0.2', label: '0.2', description: 'Focused' },
        ],
      });

      await render(temperatureSetting, -1);
      const tempDefaultRow = container.querySelector<HTMLElement>('[data-settings-item="omp.temperature"]');
      if (!tempDefaultRow) throw new Error('temperature row missing');
      const tempDefaultTrigger = tempDefaultRow.querySelector<HTMLElement>('[role="combobox"]');
      const expectedTempDefaultLabel = zhCn['settings.omp.items.temperature.options.unlimited'];
      const expectedTempDefaultDesc = zhCn['settings.omp.items.temperature.options.unlimited.description'];
      expect(expectedTempDefaultLabel).toBeDefined();
      expect(expectedTempDefaultDesc).toBeDefined();
      expect(expectedTempDefaultLabel).not.toBe('Default');
      expect(expectedTempDefaultDesc).not.toBe('Use provider default');
      expect(tempDefaultRow.firstElementChild?.textContent).toContain(zhCn['settings.omp.items.temperature.label']);
      expect(tempDefaultTrigger?.textContent).toBe(expectedTempDefaultLabel);
      assertLeftColumnDescriptionAndHugTrigger(tempDefaultRow, expectedTempDefaultDesc);

      await render(temperatureSetting, 0.2);
      const tempFocusedRow = container.querySelector<HTMLElement>('[data-settings-item="omp.temperature"]');
      if (!tempFocusedRow) throw new Error('temperature focused row missing');
      const tempFocusedTrigger = tempFocusedRow.querySelector<HTMLElement>('[role="combobox"]');
      const expectedTempFocusedLabel = zhCn['settings.omp.items.temperature.options.0-2'];
      const expectedTempFocusedDesc = zhCn['settings.omp.items.temperature.options.0-2.description'];
      expect(expectedTempFocusedLabel).toBeDefined();
      expect(expectedTempFocusedDesc).toBeDefined();
      expect(expectedTempFocusedDesc).not.toBe('Focused');
      expect(tempFocusedTrigger?.textContent).toBe(expectedTempFocusedLabel);
      assertLeftColumnDescriptionAndHugTrigger(tempFocusedRow, expectedTempFocusedDesc);

      await render(setting({
        id: 'textVerbosity',
        type: 'enum',
        placement: samplingPlacement,
        enumValues: ['low', 'medium', 'high'],
        options: [
          { value: 'low', label: 'Low', description: 'Prefer concise responses (default)' },
          { value: 'medium', label: 'Medium', description: 'Balance brevity and detail' },
          { value: 'high', label: 'High', description: 'Prefer detailed responses' },
        ],
      }), 'low');
      const verbosityRow = container.querySelector<HTMLElement>('[data-settings-item="omp.textVerbosity"]');
      if (!verbosityRow) throw new Error('textVerbosity row missing');
      const verbosityTrigger = verbosityRow.querySelector<HTMLElement>('[role="combobox"]');
      const expectedVerbosityLabel = zhCn['settings.omp.items.textVerbosity.options.low'];
      const expectedVerbosityDesc = zhCn['settings.omp.items.textVerbosity.options.low.description'];
      expect(expectedVerbosityLabel).toBeDefined();
      expect(expectedVerbosityDesc).toBeDefined();
      expect(expectedVerbosityLabel).not.toBe('Low');
      expect(expectedVerbosityDesc).not.toBe('Prefer concise responses (default)');
      expect(verbosityRow.firstElementChild?.textContent).toContain(zhCn['settings.omp.items.textVerbosity.label']);
      expect(verbosityTrigger?.textContent).toBe(expectedVerbosityLabel);
      assertLeftColumnDescriptionAndHugTrigger(verbosityRow, expectedVerbosityDesc);
    } finally {
      await act(async () => {
        useI18nStore.getState().setLocale('en');
      });
      while (useI18nStore.getState().loadingLocale) {
        await settle();
      }
    }
  });
});

describe('description and info props', () => {
  test('passes explicit description and info props to boolean and field rows', async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <OmpRowControl
            setting={setting({ id: 'commands.enableClaudeProject', type: 'boolean' })}
            value={true}
            disabled
            description="Overridden by native config"
            info="Custom info text"
            onChange={() => { }}
          />
          <OmpRowControl
            setting={setting({ id: 'custom.endpoint', type: 'string' })}
            value="https://example.test"
            description="Field override notice"
            onChange={() => { }}
          />
        </I18nProvider>,
      );
    });

    const boolRow = container.querySelector('[data-settings-item="omp.commands.enableClaudeProject"]');
    expect(boolRow?.textContent).toContain('Overridden by native config');
    expect(boolRow?.querySelector('button[aria-label="More information"]')).not.toBeNull();

    const stringRow = container.querySelector('[data-settings-item="omp.custom.endpoint"]');
    expect(stringRow?.textContent).toContain('Field override notice');
  });
});
