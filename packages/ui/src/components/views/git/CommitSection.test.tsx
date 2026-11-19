import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'bun:test';

import { I18nProvider } from '@/lib/i18n';
import { CommitSection } from './CommitSection';

const render = (generationEnabled: boolean) => renderToStaticMarkup(
  <I18nProvider>
    <CommitSection
      stagedCount={1}
      commitMessage="fix: keep the message"
      onCommitMessageChange={() => { }}
      generatedHighlights={[]}
      onInsertHighlights={() => { }}
      onGenerateMessage={() => { }}
      isGeneratingMessage={false}
      onCommit={() => { }}
      onCommitAndPush={() => { }}
      commitAction={null}
      gitmojiEnabled={false}
      onOpenGitmojiPicker={() => { }}
      generationEnabled={generationEnabled}
    />
  </I18nProvider>,
);

describe('commit panel generation gate', () => {
  test('turning generation off removes only the generate action', () => {
    const withGeneration = render(true);
    const withoutGeneration = render(false);

    expect(withGeneration).toContain('ai-generate-2');
    expect(withoutGeneration).not.toContain('ai-generate-2');

    // The manual path is untouched: the message stays on screen and both commit
    // buttons survive with the same enabled state.
    for (const html of [withGeneration, withoutGeneration]) {
      expect(html).toContain('fix: keep the message');
      expect(html).toContain('git-commit');
    }
    const count = 'aria-label="Commit"';
    expect(withoutGeneration).toContain(count);
    expect(withoutGeneration.split(count).length - 1).toBe(withGeneration.split(count).length - 1);
    expect(withoutGeneration).not.toMatch(/disabled=""[^>]*aria-label="Generate commit message/);
  });
});
