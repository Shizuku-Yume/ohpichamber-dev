import { afterEach, expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { BehaviorFileCatalog, BehaviorFileWrite } from '@openchamber/agent-contract';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser,
  document: browser.document,
  navigator: browser.navigator,
  localStorage: browser.localStorage,
  Node: browser.Node,
  Element: browser.Element,
  HTMLElement: browser.HTMLElement,
  HTMLInputElement: browser.HTMLInputElement,
  HTMLTextAreaElement: browser.HTMLTextAreaElement,
  Event: browser.Event,
  FocusEvent: browser.FocusEvent,
  MouseEvent: browser.MouseEvent,
  PointerEvent: browser.PointerEvent,
  KeyboardEvent: browser.KeyboardEvent,
  CustomEvent: browser.CustomEvent,
  ResizeObserver: browser.ResizeObserver,
  MutationObserver: browser.MutationObserver,
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  getComputedStyle: browser.getComputedStyle.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
});

const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { ThemeSystemProvider } = await import('@/contexts/ThemeSystemContext');
const { canonicalClient, CanonicalApiError } = await import('@/api/canonicalClient');
const { NativeBehaviorFiles } = await import('./NativeBehaviorFiles');
const { BehaviorCreateDialog } = await import('./BehaviorCreateDialog');
const { BehaviorPage } = await import('./BehaviorPage');
const { useProjectsStore } = await import('@/stores/useProjectsStore');

const element = document.createElement('div');
document.body.appendChild(element);
let root = createRoot(element);
const fetchSpy = spyOn(globalThis, 'fetch');
const resolve = spyOn(canonicalClient, 'resolveWorkspace');
const read = spyOn(canonicalClient.fileResources, 'getBehaviorFiles');
const write = spyOn(canonicalClient.fileResources, 'writeBehaviorFile');
const remove = spyOn(canonicalClient.fileResources, 'deleteBehaviorFile');

afterEach(async () => {
  await act(async () => root.unmount());
  root = createRoot(element);
  fetchSpy.mockReset();
  resolve.mockReset();
  read.mockReset();
  write.mockReset();
  remove.mockReset();
});

const workspace = { workspaceId: 'workspace', projectId: 'project', name: 'Demo' };
const catalog: BehaviorFileCatalog = {
  workspaceId: workspace.workspaceId,
  revision: '3',
  scopes: ['workspace', 'agent'],
  files: [
    {
      kind: 'instruction',
      scope: 'workspace',
      name: 'demo.md',
      version: 'a'.repeat(64),
      content: 'A benign instruction.',
      fields: { applyTo: '**/*.ts' },
    },
    {
      kind: 'rule',
      scope: 'workspace',
      name: 'no-console.mdc',
      version: 'b'.repeat(64),
      content: 'Avoid console logs.',
      fields: {
        enabled: true,
        alwaysApply: false,
        globs: ['src/**/*.ts'],
        astCondition: ['console.log($ARG)'],
        interruptMode: 'tool-only',
        repeatMode: 'once',
      },
    },
  ],
};

const settle = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

const setInput = async (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setter) throw new Error('Missing native value setter');
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const findButton = (label: string) =>
  [...element.querySelectorAll('button')].find((button) => button.textContent?.trim() === label);

test('Behavior instruction edits autosave on blur with both revision tokens and zero Save buttons', async () => {
  let currentCatalog = catalog;
  write.mockImplementation(async (_workspaceId: string, input: BehaviorFileWrite) => {
    currentCatalog = {
      ...currentCatalog,
      revision: '4',
      files: [
        { ...currentCatalog.files[0], version: 'c'.repeat(64), fields: input.fields ?? {} },
        currentCatalog.files[1],
      ],
    };
    return currentCatalog;
  });

  await act(async () => {
    root.render(
      <I18nProvider>
        <NativeBehaviorFiles
          directory="/workspace"
          selection={{ type: 'native-file', scope: 'workspace', kind: 'instruction', name: 'demo.md' }}
          catalog={currentCatalog}
          error={null}
          unavailable={false}
          onCatalogChange={(next) => {
            currentCatalog = next;
          }}
          onSelect={() => { }}
          onClearDraft={() => { }}
        />
      </I18nProvider>,
    );
  });

  expect(findButton('Save Changes')).toBeUndefined();
  const applyTo = element.querySelector<HTMLInputElement>('input[aria-label="Apply to files"]')!;
  expect(applyTo.value).toBe('**/*.ts');
  await setInput(applyTo, '**/*.md');
  await act(async () => {
    applyTo.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  await settle();

  expect(write).toHaveBeenCalledWith('workspace', {
    kind: 'instruction',
    scope: 'workspace',
    name: 'demo.md',
    expectedRevision: '3',
    expectedVersion: 'a'.repeat(64),
    fields: { applyTo: '**/*.md' },
    content: 'A benign instruction.',
  });
});

test('an older Host without the opt-in route omits native behavior files in BehaviorPage', async () => {
  resolve.mockResolvedValue(workspace);
  read.mockRejectedValue(
    new CanonicalApiError({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      code: 'NOT_IMPLEMENTED',
      detail: 'Unavailable',
      retryable: false,
    }),
  );
  fetchSpy.mockImplementation(async (input, init) => {
    const request = new Request(input instanceof Request ? input : new URL(String(input), 'http://localhost/'), init);
    const pathname = new URL(request.url).pathname;
    if (pathname === '/api/behavior/agents-md') return Response.json({ content: '', exists: false });
    if (pathname === '/api/config/settings' && request.method !== 'GET') {
      const body = await request.text();
      return Response.json({
        ...JSON.parse(body),
        projects: [{ path: '/workspace' }],
        activeProjectId: 'path_L3dvcmtzcGFjZQ',
      });
    }
    return Response.json({});
  });

  await act(async () => {
    useProjectsStore.setState({
      projects: [{ id: 'path_L3dvcmtzcGFjZQ', path: '/workspace' }],
      activeProjectId: 'path_L3dvcmtzcGFjZQ',
    });
    root.render(<ThemeSystemProvider><I18nProvider><BehaviorPage /></I18nProvider></ThemeSystemProvider>);
  });
  await settle();

  expect(element.querySelector('[data-settings-item="behavior.files.rules-md"]')).toBeNull();
  expect(element.querySelector('[data-settings-item="behavior.files.create"]')).toBeNull();
  expect(element.querySelector('[role="alert"]')).toBeNull();
});

test('a shared catalog revision change does not discard the draft or rebase its file version', async () => {
  let currentCatalog = catalog;
  read.mockResolvedValue({ ...catalog, revision: '4' });
  write
    .mockRejectedValueOnce(
      new CanonicalApiError({
        type: 'about:blank',
        title: 'Conflict',
        status: 409,
        code: 'CATALOG_CONFLICT',
        detail: 'The catalog revision does not match the expected revision',
        retryable: false,
      }),
    )
    .mockResolvedValue({ ...catalog, revision: '5' });

  await act(async () => {
    root.render(
      <I18nProvider>
        <NativeBehaviorFiles
          directory="/workspace"
          selection={{ type: 'native-file', scope: 'workspace', kind: 'instruction', name: 'demo.md' }}
          catalog={currentCatalog}
          error={null}
          unavailable={false}
          onCatalogChange={(next) => {
            currentCatalog = next;
          }}
          onSelect={() => { }}
          onClearDraft={() => { }}
        />
      </I18nProvider>,
    );
  });

  const body = element.querySelector<HTMLTextAreaElement>('textarea')!;
  await setInput(body, 'Unsaved draft.');
  await act(async () => {
    body.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  await settle();

  expect(write.mock.calls.map(([, input]) => [input.expectedRevision, input.expectedVersion, input.content])).toEqual([
    ['3', 'a'.repeat(64), 'Unsaved draft.'],
    ['4', 'a'.repeat(64), 'Unsaved draft.'],
  ]);
  expect(element.querySelector('[role="alert"]')).toBeNull();
});

test('rule editor uses localized structured controls (checkboxes, chips, selects) without raw camelCase labels or JSON strings', async () => {
  write.mockResolvedValue({ ...catalog, revision: '4' });

  await act(async () => {
    root.render(
      <I18nProvider>
        <NativeBehaviorFiles
          directory="/workspace"
          selection={{ type: 'native-file', scope: 'workspace', kind: 'rule', name: 'no-console.mdc' }}
          catalog={catalog}
          error={null}
          unavailable={false}
          onCatalogChange={() => { }}
          onSelect={() => { }}
          onClearDraft={() => { }}
        />
      </I18nProvider>,
    );
  });

  const text = element.textContent ?? '';
  for (const rawKey of ['astCondition', 'alwaysApply', 'interruptMode', 'repeatMode', 'applyTo']) {
    expect(text).not.toContain(rawKey);
  }
  expect(text).toContain('Enabled');
  expect(text).toContain('Always apply');
  expect(text).toContain('File globs');
  expect(text).toContain('AST conditions');
  expect(text).toContain('Interrupt timing');
  expect(text).toContain('Repeat behavior');
  expect(text).toContain('src/**/*.ts');
  expect(text).toContain('console.log($ARG)');

  const alwaysApplyBox = element.querySelector<HTMLElement>('[role="checkbox"][aria-label="Always apply"]')!;
  await act(async () => {
    alwaysApplyBox.click();
  });
  await settle();
  expect(write).toHaveBeenCalledWith(
    'workspace',
    expect.objectContaining({
      kind: 'rule',
      name: 'no-console.mdc',
      fields: { alwaysApply: true },
    }),
  );

  const removeGlob = element.querySelector<HTMLButtonElement>('button[aria-label="Remove src/**/*.ts"]')!;
  await act(async () => {
    removeGlob.click();
  });
  await settle();
  expect(write).toHaveBeenLastCalledWith(
    'workspace',
    expect.objectContaining({
      fields: { globs: null },
    }),
  );
});

test('delete confirmation removes the behavior file via canonical client', async () => {
  const onSelect = spyOn({ fn: () => { } }, 'fn');
  remove.mockResolvedValue({ ...catalog, revision: '4', files: [] });

  await act(async () => {
    root.render(
      <I18nProvider>
        <NativeBehaviorFiles
          directory="/workspace"
          selection={{ type: 'native-file', scope: 'workspace', kind: 'instruction', name: 'demo.md' }}
          catalog={catalog}
          error={null}
          unavailable={false}
          onCatalogChange={() => { }}
          onSelect={onSelect}
          onClearDraft={() => { }}
        />
      </I18nProvider>,
    );
  });

  const deleteTrigger = element.querySelector<HTMLButtonElement>('button[aria-label="Delete"]')!;
  await act(async () => {
    deleteTrigger.click();
  });
  const confirmButton = [...document.querySelectorAll('button')].find(
    (btn) => btn.textContent?.trim() === 'Delete' && btn !== deleteTrigger,
  )!;
  await act(async () => {
    confirmButton.click();
  });
  await settle();

  expect(remove).toHaveBeenCalledWith('workspace', {
    kind: 'instruction',
    name: 'demo.md',
    scope: 'workspace',
    expectedRevision: '3',
    expectedVersion: 'a'.repeat(64),
  });
  expect(onSelect).toHaveBeenCalledWith({ type: 'agents-md', scope: 'project' });
});

test('create dialog validates filename and duplicate entries before staging a draft', async () => {
  const onCreateDraft = spyOn({ fn: () => { } }, 'fn');

  await act(async () => {
    root.render(
      <I18nProvider>
        <BehaviorCreateDialog
          open
          onOpenChange={() => { }}
          availableScopes={['workspace', 'agent']}
          existingFiles={catalog.files}
          onCreateDraft={onCreateDraft}
        />
      </I18nProvider>,
    );
  });

  const createBtn = () =>
    [...document.querySelectorAll('button')].find((btn) => btn.textContent?.trim() === 'Create')!;
  const nameInput = () =>
    document.querySelector<HTMLInputElement>('input[aria-label="Filename"]')!;

  await act(async () => {
    createBtn().click();
  });
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('Enter a file name');
  expect(onCreateDraft).not.toHaveBeenCalled();

  await setInput(nameInput(), 'no-console.mdc');
  await act(async () => {
    createBtn().click();
  });
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('already exists');
  expect(onCreateDraft).not.toHaveBeenCalled();

  await setInput(nameInput(), 'new-rule');
  await act(async () => {
    createBtn().click();
  });
  expect(onCreateDraft).toHaveBeenCalledWith({
    kind: 'rule',
    scope: 'workspace',
    name: 'new-rule.mdc',
  });
});

test('a file removed externally shows a notice instead of an editor that would recreate it', async () => {
  await act(async () => {
    root.render(
      <I18nProvider>
        <NativeBehaviorFiles
          directory="/workspace"
          selection={{ type: 'native-file', scope: 'workspace', kind: 'rule', name: 'gone.mdc' }}
          catalog={catalog}
          error={null}
          unavailable={false}
          onCatalogChange={() => { }}
          onSelect={() => { }}
          onClearDraft={() => { }}
        />
      </I18nProvider>,
    );
  });

  expect(element.querySelector('[role="alert"]')?.textContent).toContain('no longer exists');
  expect(element.querySelector('textarea')).toBeNull();
  expect(write).not.toHaveBeenCalled();
});

test('an uncreated RULES.md opens a ready-to-edit empty editor and saves as a new file', async () => {
  let currentCatalog = catalog;
  write.mockImplementation(async (_workspaceId: string, input: BehaviorFileWrite) => {
    currentCatalog = {
      ...currentCatalog,
      revision: '4',
      files: [
        ...currentCatalog.files,
        {
          kind: 'sticky-rules',
          scope: input.scope,
          name: input.name,
          version: 'd'.repeat(64),
          content: input.content,
          fields: {},
        },
      ],
    };
    return currentCatalog;
  });

  await act(async () => {
    root.render(
      <I18nProvider>
        <NativeBehaviorFiles
          directory="/workspace"
          selection={{ type: 'native-file', scope: 'agent', kind: 'sticky-rules', name: 'RULES.md' }}
          catalog={currentCatalog}
          error={null}
          unavailable={false}
          onCatalogChange={(next) => {
            currentCatalog = next;
          }}
          onSelect={() => { }}
          onClearDraft={() => { }}
        />
      </I18nProvider>,
    );
  });

  expect(element.querySelector('[role="alert"]')).toBeNull();
  const textarea = element.querySelector<HTMLTextAreaElement>('textarea')!;
  expect(textarea).not.toBeNull();
  expect(textarea.value).toBe('');
  expect(element.querySelector('button[aria-label="Delete"]')).toBeNull();

  await setInput(textarea, 'Always answer in Spanish.');
  await act(async () => {
    textarea.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  await settle();

  expect(write).toHaveBeenCalledWith('workspace', {
    kind: 'sticky-rules',
    scope: 'agent',
    name: 'RULES.md',
    expectedRevision: '3',
    expectedVersion: null,
    content: 'Always answer in Spanish.',
  });
});
