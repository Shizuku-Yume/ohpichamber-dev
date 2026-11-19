<<<<<<< HEAD
import React from 'react';
import type { CustomRendererProps } from 'streamdown';
import { useMarkdownPresentation } from './MarkdownPresentationContext';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { sanitizeSvg } from './sanitizeSvg';

export function MarkdownSvg({ code, isIncomplete }: CustomRendererProps) {
  const { purpose } = useMarkdownPresentation();
  const { t } = useI18n();
  const rawId = React.useId();
  const idPrefix = React.useMemo(() => `oc-svg-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`, [rawId]);

  if (isIncomplete) {
    return (
      <div className="my-2 p-3 rounded-lg border border-border/40 bg-muted/10 text-muted-foreground text-xs font-mono">
        Rendering SVG figure…
      </div>
    );
  }

  const { svg, error } = sanitizeSvg(code, idPrefix);

  if (!svg || error) {
    return (
      <div className="my-2 rounded-lg border border-status-error/30 bg-status-error/5 p-3 space-y-2">
        <div className="flex items-center gap-1.5 text-status-error text-xs font-medium">
          <Icon name="alert" className="size-4 shrink-0" />
          <span>{t('markdownRenderer.svg.invalid') || 'Invalid or disallowed SVG figure'}{error ? `: ${error}` : ''}</span>
        </div>
        <pre className="p-2 rounded bg-muted/20 text-xs font-mono overflow-x-auto whitespace-pre-wrap text-muted-foreground">
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  return (
    <figure
      data-oc-svg-figure=""
      className={cn(
        'group/svg-figure my-2 w-full max-w-full overflow-x-auto rounded-lg border border-border/40 bg-card p-4 flex justify-center items-center',
        purpose === 'image' && 'border-none p-0 bg-transparent'
      )}
    >
      <div
        className="max-w-full flex justify-center [&>svg]:max-w-full [&>svg]:h-auto [&>svg]:overflow-visible"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </figure>
  );
}
||||||| bc50ba56aa
=======
import React from 'react';
import type { CustomRendererProps } from 'streamdown';
import { MarkdownSvgFailureContext } from './MarkdownPresentationContext';

const svgDataUrl = (source: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;

export function MarkdownSvg({ code }: CustomRendererProps) {
  const fail = React.useContext(MarkdownSvgFailureContext);
  return (
    <div data-streamdown="svg-block" data-oc-svg-source={code}>
      <img
        src={svgDataUrl(code)}
        alt="svg"
        className="max-w-full rounded-md bg-white"
        onError={() => fail?.()}
      />
    </div>
  );
}
>>>>>>> upstream/main
