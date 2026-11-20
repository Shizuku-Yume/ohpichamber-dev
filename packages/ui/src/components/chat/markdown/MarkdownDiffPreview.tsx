import { parsePatchFiles } from '@pierre/diffs';
import { PlainDiffFallback } from '../message/parts/PlainDiffFallback';
import ToolPartDiffPreview from '../message/parts/ToolPartDiffPreview';

type DiffSection = { name: string; patch: string };

const fileNames = (patch: string): string[] => {
  try {
    return parsePatchFiles(patch, { cacheKeyPrefix: 'markdown-diff', throwOnError: true }).flatMap((parsed) => parsed.files.map((file) => file.name));
  } catch {
    return [];
  }
};

/** Split a fenced diff into one patch per file so each renders its own header. */
const splitPatch = (patch: string, snippet: boolean): DiffSection[] => {
  // A headerless +/- snippet has no file to validate: give the renderer a
  // synthetic file pair so its parser accepts the standalone hunk.
  if (snippet) return [{ name: 'Diff', patch: `--- a/patch\n+++ b/patch\n${patch}` }];
  const gitStarts = [...patch.matchAll(/^diff --git /gm)].map((match) => match.index ?? 0);
  if (gitStarts.length > 1) {
    const sections = gitStarts.map((start, index) => {
      const body = patch.slice(start, gitStarts[index + 1] ?? patch.length);
      const name = /^diff --git a\/(.+?) b\//m.exec(body)?.[1]
        ?? /^\+\+\+ b\/(.+)$/m.exec(body)?.[1]
        ?? 'Diff';
      return { name, patch: body };
    });
    return sections.every((section) => fileNames(section.patch).length > 0) ? sections : [];
  }
  // Plain unified diffs have no `diff --git` line: a new file starts at
  // `--- <path>` immediately followed by `+++ <path>`.
  const unifiedStarts = [...patch.matchAll(/^--- [^\n]*\n\+\+\+ /gm)].map((match) => match.index ?? 0);
  const starts = unifiedStarts.length > 0 ? unifiedStarts : [0];
  const sections = starts.map((start, index) => {
    const body = patch.slice(start, starts[index + 1] ?? patch.length).replace(/\n+$/, '');
    const name = /^\+\+\+ b\/(.+)$/m.exec(body)?.[1] ?? /^\+\+\+ (.+)$/m.exec(body)?.[1] ?? 'Diff';
    return { name, patch: body };
  });
  return sections.every((section) => fileNames(section.patch).length > 0) ? sections : [];
};
export default function MarkdownDiffPreview({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const snippet = lines.some((line) => /^[+-]/.test(line))
    && lines.every((line) => /^[ +-]/.test(line))
    && !lines.some((line) => /^(---|\+\+\+) /.test(line));
  const patch = snippet
    ? `@@ -1,${lines.filter((line) => !line.startsWith('+')).length} +1,${lines.filter((line) => !line.startsWith('-')).length} @@\n${source}`
    : source;
  const sections = splitPatch(patch, snippet);
  if (sections.length === 0) {
    return <PlainDiffFallback diff={source} />;
  }
  return sections.map((section) => (
    <div key={section.patch}>
      {section.name !== 'Diff' && <div className="px-3 py-1 typography-meta text-muted-foreground break-all">{section.name}</div>}
      <ToolPartDiffPreview diff={section.patch} diffViewMode="unified" />
    </div>
  ));
}
