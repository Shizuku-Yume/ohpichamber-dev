import { afterEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';

const browser = new Window();
Object.assign(globalThis, {
    window: browser,
    document: browser.document,
    navigator: browser.navigator,
    HTMLElement: browser.HTMLElement,
    HTMLTextAreaElement: browser.HTMLTextAreaElement,
    Event: browser.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
});

// Exception: DOM globals must be in place before React/ReactDOM initializes its event system.
const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { FormFieldControl } = await import('./FormFieldControl');
import type { AskAnswerState, AskQuestion } from './questionRequest';

const container = document.createElement('div');
document.body.append(container);
let root = createRoot(container);

afterEach(async () => {
    await act(async () => root.unmount());
    root = createRoot(container);
});

// happy-dom has no layout. Model a border-box textarea: scrollHeight includes
// padding and is at least clientHeight, but excludes the two 1px borders.
function installGeometry(textarea: HTMLTextAreaElement) {
    let reads = 0;
    Object.defineProperties(textarea, {
        offsetHeight: { get: () => Math.max(10, Number.parseFloat(textarea.style.height) || 0) },
        clientHeight: { get: () => Math.max(8, textarea.offsetHeight - 2) },
        scrollHeight: {
            configurable: true, get: () => {
                reads += 1;
                return Math.max(textarea.clientHeight, textarea.value.split('\n').length * 20 + 8);
            }
        },
    });
    return () => reads;
}

async function enterText(textarea: HTMLTextAreaElement, text: string) {
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(textarea, text);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

async function mountField(custom: boolean) {
    const question: AskQuestion = {
        id: 'q1',
        question: 'What should we do?',
        options: custom ? [{ label: 'Option 1' }] : [],
        multi: false,
    };
    function Form() {
        const [answer, setAnswer] = React.useState<AskAnswerState>({
            selected: [],
            custom: !custom,
            text: '',
        });
        return (
            <I18nProvider>
                <FormFieldControl
                    question={question}
                    answer={answer}
                    index={0}
                    showErrors={false}
                    isMissing={false}
                    isResponding={false}
                    onChange={(next) => setAnswer(next)}
                    onTextKeyDown={() => { }}
                />
                <output>{answer.text || answer.selected.join(', ')}</output>
            </I18nProvider>
        );
    }
    await act(async () => root.render(<Form />));
    if (custom) {
        const other = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Other'));
        if (other) {
            await act(async () => other.click());
        }
    }
    const textarea = container.querySelector('textarea');
    if (!textarea) throw new Error('Answer textarea missing');
    return textarea;
}

describe('form answer textarea sizing', () => {
    test('renders native values as labels, disabled controls, checkbox markers and unmarked actions without Other', async () => {
        const changed: AskAnswerState[] = [];
        const question: AskQuestion = {
            id: 'select', question: 'Select', multi: false, allowCustom: false, required: false,
            options: [{ label: '0', displayLabel: 'First', disabled: true }, { label: '1', displayLabel: 'Second' }, { label: '2', displayLabel: 'Done' }],
            selectionMarker: 'checkbox', checkedIndices: [0], markableCount: 2,
        };
        await act(async () => root.render(<I18nProvider><FormFieldControl
            question={question} answer={{ selected: ['1'], custom: false, text: '' }} index={0}
            showErrors={false} isMissing={false} isResponding={false} onChange={next => changed.push(next)} onTextKeyDown={() => {}}
        /></I18nProvider>));
        expect(container.textContent).toContain('First');
        expect(container.textContent).not.toContain('Other');
        expect(container.textContent).not.toContain('Required');
        const controls = container.querySelectorAll('[role="checkbox"]');
        expect(controls).toHaveLength(2);
        expect(controls[0]?.getAttribute('aria-checked')).toBe('true');
        expect(controls[0]?.getAttribute('aria-disabled')).toBe('true');
        await act(async () => (controls[1] as HTMLButtonElement).click());
        expect(changed.at(-1)).toMatchObject({ selected: ['1'] });
    });

    test('password controls stay masked and preserve their native defaults', async () => {
        await act(async () => root.render(<I18nProvider><FormFieldControl
            question={{ id: 'password', multi: false, options: [], inputType: 'password', required: false }}
            answer={{ selected: [], custom: false, text: 'example-only' }} index={0}
            showErrors={false} isMissing={false} isResponding={false} onChange={() => {}} onTextKeyDown={() => {}}
        /></I18nProvider>));
        expect(container.querySelector('input')?.type).toBe('password');
        expect(container.querySelector('input')?.value).toBe('example-only');
        expect(container.querySelector('textarea')).toBeNull();
    });

    for (const custom of [false, true]) {
        test(`long answer can be cleared and typed again (${custom ? 'custom' : 'plain'})`, async () => {
            const textarea = await mountField(custom);
            const readCount = installGeometry(textarea);
            await enterText(textarea, 'Long answer\n'.repeat(20));
            expect(textarea.style.height).toBe('200px');
            expect(textarea.style.overflowY).toBe('auto');
            const beforeDeletion = readCount();

            await enterText(textarea, '');

            expect(container.contains(textarea)).toBe(true);
            expect(textarea.value).toBe('');
            expect(textarea.style.height).toBe('40px');
            expect(textarea.style.overflowY).toBe('hidden');
            expect(readCount() - beforeDeletion).toBeLessThan(5);
            await enterText(textarea, 'A revised answer');
            expect(textarea.value).toBe('A revised answer');
            expect(container.querySelector('output')?.textContent).toBe('A revised answer');
        });
    }

    test('measuring an edit at the cap preserves the scrolling parent', async () => {
        const textarea = await mountField(false);
        installGeometry(textarea);
        const parent = textarea.parentElement;
        if (!parent) throw new Error('Field wrapper missing');
        parent.style.minHeight = '12px';
        Object.defineProperty(parent, 'offsetHeight', {
            get: () => Math.max(textarea.offsetHeight + 24, Number.parseFloat(parent.style.minHeight) || 0),
        });
        const scrollHeight = Object.getOwnPropertyDescriptor(textarea, 'scrollHeight')?.get;
        Object.defineProperty(textarea, 'scrollHeight', {
            get: () => {
                parent.scrollTop = Math.min(parent.scrollTop, Math.max(0, parent.offsetHeight - 120));
                return scrollHeight?.call(textarea);
            }
        });
        await enterText(textarea, 'Long answer\n'.repeat(20));
        parent.scrollTop = 104;
        await enterText(textarea, `${textarea.value}x`);
        expect(parent.scrollTop).toBe(104);
        expect(parent.style.minHeight).toBe('12px');
        await enterText(textarea, 'Short answer');
        expect(textarea.style.height).toBe('40px');
        expect(parent.style.minHeight).toBe('12px');
    });
});
