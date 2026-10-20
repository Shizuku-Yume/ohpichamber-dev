import React from 'react';
import { getLanguageFromExtension } from '@/lib/toolHelpers';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { getMarkdownSyntaxVars } from '@/components/chat/markdown/markdownSyntaxVars';
import {
  useWorkerHighlightedLines,
  type WorkerHighlightedLinesResult,
} from '@/components/code/useWorkerHighlightedLines';

// Keep the line's layout stable while a cold worker request finishes. Plain
// text appears only if highlighting fails, avoiding a visible color flash.
interface CodeLineContentProps {
  content: string;
  html: string | undefined;
  status: WorkerHighlightedLinesResult['status'];
}

const CodeLineContent: React.FC<CodeLineContentProps> = ({ content, html, status }) => {
  // Ready lines, and unchanged lines carried while an update tokenizes.
  if (html !== undefined) {
    return <span className="whitespace-pre-wrap break-all" dangerouslySetInnerHTML={{ __html: html }} />;
  }
  if (status === 'loading') {
    return <span aria-hidden className="invisible whitespace-pre-wrap break-all">{content}</span>;
  }
  return <span className="whitespace-pre-wrap break-all">{content}</span>;
};

interface WritePreviewProps {
    content: string;
    filePath?: string;
}

export const WritePreview: React.FC<WritePreviewProps> = ({ content, filePath }) => {
    const { currentTheme } = useThemeSystem();
    const syntaxVars = React.useMemo(() => getMarkdownSyntaxVars(currentTheme), [currentTheme]);
    const lines = React.useMemo(() => content.split('\n'), [content]);
    const language = getLanguageFromExtension(filePath ?? '') || 'text';
    const displayPath = filePath?.split('/').pop() || 'New file';
    const lineCount = Math.max(lines.length, 1);
    const headerLineLabel = lineCount === 1 ? 'line 1' : `lines 1-${lineCount}`;
    const highlighted = useWorkerHighlightedLines(content, language);
    // SAFETY: getMarkdownSyntaxVars maps CSS custom-property names to string
    // values, which React passes through to the style attribute unchanged.
    const syntaxStyle = syntaxVars as React.CSSProperties;

    return (
        <div className="w-full min-w-0" style={syntaxStyle}>
            <div className="bg-muted/20 px-2 py-1 typography-meta font-medium text-muted-foreground border border-border/10 rounded-lg mb-1">
                {`${displayPath} (${headerLineLabel})`}
            </div>
            <div className="space-y-0">
                {lines.map((line, lineIdx) => {
                    const html = highlighted.status === 'loading'
                        ? highlighted.carriedLines[lineIdx]
                        : highlighted.lines?.[lineIdx];
                    return (
                        <div key={lineIdx} className="typography-code font-mono px-2 py-0.5 flex -mx-1">
                            <span className="w-10 flex-shrink-0 text-right pr-3 select-none border-r mr-3 -my-0.5 py-0.5" style={{ color: 'var(--tools-edit-line-number)', borderColor: 'var(--tools-border)' }}>
                                {lineIdx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                                <CodeLineContent
                                    content={line || ' '}
                                    html={html}
                                    status={highlighted.status}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
