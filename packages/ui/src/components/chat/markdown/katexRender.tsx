import React from 'react';
import type katexType from 'katex';
import { importWithChunkRecovery } from '@/lib/chunkLoadRecovery';

// KaTeX (about 260 KB minified, plus its stylesheet and fonts) loads only when
// a document actually contains math. The engine and the stylesheet load
// together the first time a math node renders; documents without math never
// fetch either. While the engine is on the wire the raw TeX source shows in a
// fixed-width font, so a transcript with math settles into its final layout
// instead of flashing empty boxes.

type KatexModule = typeof katexType;

let katexModulePromise: Promise<KatexModule> | null = null;
let katexModule: KatexModule | null = null;

const loadKatexModule = (): Promise<KatexModule> => {
  katexModulePromise ??= Promise.all([
    importWithChunkRecovery(() => import('katex').then((module) => module.default)),
    // The stylesheet rides the same lazy boundary. Vite's JS-import pipeline
    // resolves the font URLs inside it; a CSS `@import` in index.css would not
    // (openchamber/openchamber#1880).
    importWithChunkRecovery(() => import('katex/dist/katex.min.css')),
  ])
    .then(([katex]) => {
      katexModule = katex;
      return katex;
    })
    .catch((error) => {
      katexModulePromise = null;
      throw error;
    });
  return katexModulePromise;
};

const renderKatexToString = (
  tex: string,
  displayMode: boolean,
): { html: string } | { error: string } | null => {
  if (!katexModule) return null;
  const katex = katexModule;
  try {
    return {
      html: katex.renderToString(tex, {
        displayMode,
        throwOnError: true,
        errorColor: 'var(--color-muted-foreground)',
      }),
    };
  } catch {
    try {
      return {
        html: katex.renderToString(tex, {
          displayMode,
          throwOnError: false,
          strict: 'ignore',
          errorColor: 'var(--color-muted-foreground)',
        }),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
};

const mathSourceText = (children: React.ReactNode): string => {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(mathSourceText).join('');
  if (React.isValidElement(children)) {
    const props = children.props as { children?: React.ReactNode };
    return mathSourceText(props.children);
  }
  return '';
};

export function KatexMath({ children, displayMode = false }: {
  children: React.ReactNode;
  displayMode?: boolean;
}) {
  // remark-rehype normalizes CRLF in the tree text; matching that here keeps
  // the formula identical to what rehype-katex typeset.
  const tex = mathSourceText(children).replace(/\r\n?/g, '\n');
  const [ready, setReady] = React.useState(() => katexModule !== null);

  React.useEffect(() => {
    if (ready) return;
    let cancelled = false;
    loadKatexModule().then(
      () => {
        if (!cancelled) setReady(true);
      },
      (error) => {
        console.error('[katex] failed to load', error);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [ready]);

  const html = ready ? renderKatexToString(tex, displayMode) : null;

  if (html && 'html' in html) {
    if (displayMode) {
      return <span className="katex-display" dangerouslySetInnerHTML={{ __html: html.html }} />;
    }
    return <span dangerouslySetInnerHTML={{ __html: html.html }} />;
  }

  if (html && 'error' in html) {
    return <code className="katex-error">{tex}</code>;
  }

  // Engine still loading: keep the source visible so the line never blanks.
  return displayMode
    ? <span className="katex-display"><code>{tex}</code></span>
    : <code>{tex}</code>;
}
