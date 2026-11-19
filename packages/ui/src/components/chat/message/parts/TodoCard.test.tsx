import { describe, expect, test } from 'bun:test';
import type { JsonValue } from '@openchamber/agent-contract';
import { TodoCard } from './TodoCard';
import { activeTodoTask, todoProgress } from '../../todoProgress';
import { extractTodoPhases, type TodoPhase } from '../../todoData';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '@/lib/i18n';

const renderCard = (phases: TodoPhase[], defaultExpanded = false) =>
  renderToStaticMarkup(<I18nProvider><TodoCard phases={phases} defaultExpanded={defaultExpanded} /></I18nProvider>);

const phases: JsonValue = [
  { name: 'Plan', tasks: [{ content: 'Inspect', status: 'completed' }, { content: 'Implement', status: 'in_progress' }] },
  { name: 'Verify', tasks: [{ content: 'Run checks', status: 'pending' }] },
];

describe('OMP todo rendering', () => {
  test('parses native phases and displays each phase, item and status', () => {
    const parsed = extractTodoPhases({ phases });
    expect(parsed).toEqual(phases);
    const html = renderToStaticMarkup(<I18nProvider><TodoCard phases={parsed ?? []} defaultExpanded /></I18nProvider>);
    expect(html).toContain('Plan');
    expect(html).toContain('Inspect');
    expect(html).toContain('Implement');
    expect(html).toContain('Verify');
    expect(html).toContain('Run checks');
  });

  test('folds to the active item and its progress', () => {
    const parsed = extractTodoPhases({ phases }) ?? [];
    expect(todoProgress(parsed)).toEqual({ closed: 1, total: 3 });
    expect(activeTodoTask(parsed)?.content).toBe('Implement');
    const html = renderToStaticMarkup(<I18nProvider><TodoCard phases={parsed} /></I18nProvider>);
    expect(html).toContain('Implement');
    expect(html).toContain('1/3');
    // Folded, the other phases and items stay out of the row.
    expect(html).not.toContain('Run checks');
    expect(html).toContain('aria-expanded="false"');
  });

  test('names the next pending item when nothing is in progress', () => {
    const parsed = extractTodoPhases({
      phases: [
        { name: 'Plan', tasks: [{ content: 'Inspect', status: 'completed' }] },
        { name: 'Verify', tasks: [{ content: 'Run checks', status: 'pending' }, { content: 'Ship', status: 'pending' }] },
      ]
    }) ?? [];
    expect(activeTodoTask(parsed)?.content).toBe('Run checks');
    const html = renderToStaticMarkup(<I18nProvider><TodoCard phases={parsed} /></I18nProvider>);
    expect(html).toContain('Run checks');
    expect(html).toContain('1/3');
  });

  test('rejects malformed phase snapshots instead of inventing an empty list', () => {
    expect(extractTodoPhases({ phases: [{ name: 'bad', tasks: [{ content: 'x', status: 'todo' }] }] })).toBeNull();
    expect(extractTodoPhases({})).toBeNull();
  });

  test('renders no card when no phase carries a task, folded or expanded', () => {
    expect(renderCard([])).toBe('');
    expect(renderCard([], true)).toBe('');
    expect(renderCard([{ name: 'Empty phase', tasks: [] }])).toBe('');
    expect(renderCard([{ name: 'Empty phase', tasks: [] }, { name: 'Also empty', tasks: [] }], true)).toBe('');
  });

  test('leaves a cleared todo result with no card body, so the tool row keeps only its text', () => {
    const cleared = extractTodoPhases({ phases: [], op: 'rm' });
    expect(cleared).toEqual([]);
    expect(renderCard(cleared ?? [])).toBe('');
    expect(renderCard(extractTodoPhases({ phases: [{ name: '间距修正', tasks: [], op: 'rm' }] }) ?? [], true)).toBe('');
  });

  test('keeps the card when a phase has a task, even if another phase was emptied', () => {
    const mixed: TodoPhase[] = [
      { name: 'Emptied phase', tasks: [] },
      { name: 'Shipped', tasks: [{ content: 'Release the fix', status: 'completed' }] },
    ];
    expect(todoProgress(mixed)).toEqual({ closed: 1, total: 1 });

    const folded = renderCard(mixed);
    expect(folded).toContain('data-testid="todo-card"');
    expect(folded).toContain('Release the fix');
    expect(folded).toContain('1/1');
    expect(folded).not.toContain('Emptied phase');

    const expanded = renderCard(mixed, true);
    expect(expanded).toContain('Emptied phase');
    expect(expanded).toContain('Release the fix');
    expect(expanded).toContain('1/1');
  });
});
