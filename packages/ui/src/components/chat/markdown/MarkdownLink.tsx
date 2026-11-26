import { HoverTooltip } from '@/components/ui/row-tooltip';
import React from 'react';
import type { ExtraProps } from 'streamdown';
import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { getExternalFaviconUrl, isAppLinkUrl, isExternalHttpUrl, isLoopbackHttpUrl } from '@/lib/url';
import { parseSessionLink } from '@/lib/sessionLinks';
import { sessionLinkKey } from '@/lib/sessionLinks';
import { openSessionLink } from '@/lib/router/openSessionFromRoute';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { appOwnOrigins } from '@/lib/router/appOrigins';
import { ReferenceLinkChipsContext } from '../message/parts/referenceLinkChips';
import { ReferenceLinkChipButton } from '../message/parts/ReferenceLinkChipButton';
import { SessionMentionChipsContext } from '../message/parts/sessionMentionChips';
import { SessionMentionChipButton } from '../message/parts/SessionMentionChipButton';
import { useUIStore } from '@/stores/useUIStore';
import { useI18n } from '@/lib/i18n';
import { parseAgentHref, parseAttachmentHref, parseSkillHref, INLINE_REFERENCE_CHIP_CLASS, INTERACTIVE_REFERENCE_CHIP_CLASS, REFERENCE_CHIP_LABEL_CLASS } from '@/lib/messages/inlineMessageLinks';
import { openAppLinkWithConfirmation } from '../appLinkConfirmation';
import { useMarkdownPresentation, type FileReferenceSource } from './MarkdownPresentationContext';
import { activateMarkdownFile, resolveMarkdownFile, useOpenMarkdownFile, useOpenTappedMarkdownFile } from './markdownFileReferences';
import { MarkdownMediaLinkContext, useMarkdownMedia } from './markdown-media-context';
import { openMarkdownDocumentLink } from '@/components/views/files/previews/useMarkdownLocalAssets';
import { claimGuestIdentifier, claimGuestUrl } from '@/lib/guests/links';
import { guestPanelOpensHere } from '@/lib/guests/phone';
import { useGuestsStore } from '@/lib/guests/store';
import { useOpenChatLink } from '../useOpenChatLink';
import { isBuiltInLink, runGuestLink } from './guestLinkClick';
import { KatexMath } from './katexRender';


// A path in code text and a path in a link's href parse differently: an href
// may percent-encode spaces and non-ASCII names, which are decoded first.
function useConfirmedInlineFile(raw: string, inputKind: FileReferenceSource = 'path'): string | null {
  const { directory, fileReferences, confirmFile } = useMarkdownPresentation();
  const runtimeKey = getRuntimeKey();
  const [confirmed, setConfirmed] = React.useState<{ raw: string; inputKind: FileReferenceSource; directory: string; runtimeKey: string; path: string } | null>(null);
  React.useEffect(() => {
    if (!fileReferences) return;
    let active = true;
    void confirmFile(raw, inputKind).then((path) => {
      if (active && runtimeKey === getRuntimeKey()) setConfirmed(path ? { raw, inputKind, directory, runtimeKey, path } : null);
    });
    return () => { active = false; };
  }, [raw, inputKind, directory, fileReferences, runtimeKey, confirmFile]);
  return fileReferences && confirmed?.raw === raw && confirmed.inputKind === inputKind && confirmed.directory === directory && confirmed.runtimeKey === runtimeKey ? confirmed.path : null;
}

// remark-math emits inline math as `code.language-math.math-inline` (and
// inline `$$…$$` as `math-display`); with the passthrough rehype plugin the
// typesetting happens here, where the engine can load lazily.
function MarkdownInlineMath({ children, className }: React.ComponentProps<'code'>) {
  const mathClasses = typeof className === 'string' ? className.split(/\s+/) : [];
  return <KatexMath displayMode={mathClasses.includes('math-display')}>{children}</KatexMath>;
}

export function MarkdownInlineCode(props: React.ComponentProps<'code'> & ExtraProps) {
  const isMath = typeof props.className === 'string' && props.className.split(/\s+/).includes('language-math');
  if (isMath) {
    return <MarkdownInlineMath className={props.className}>{props.children}</MarkdownInlineMath>;
  }
  return <MarkdownInlineFileCode {...props} />;
}

function MarkdownInlineFileCode({ children, node: _node, className, ...props }: React.ComponentProps<'code'> & ExtraProps) {
  const raw = _node?.children.map((child) => child.type === 'text' ? child.value : '').join('') ?? '';
  const { directory, fileReferences, fileNavigation } = useMarkdownPresentation();
  const path = useConfirmedInlineFile(raw);
  const open = useOpenMarkdownFile();
  const openTapped = useOpenTappedMarkdownFile();
  const activate = (event: React.MouseEvent | React.KeyboardEvent) => {
    if (path) activateMarkdownFile(event, (external) => { void open(raw, path, external); });
  };
  // The phone keeps navigation without probes. The code stays plain until the
  // tap: role="button" would make it unselectable and 36px tall (mobile.css).
  const checksOnTap = fileNavigation && !fileReferences && resolveMarkdownFile(raw, directory) !== null;
  const tap = (event: React.MouseEvent) => {
    // A surrounding link, button or disclosure keeps its own tap.
    if (event.currentTarget.closest('a, button, [role="button"], summary')) return;
    activateMarkdownFile(event, () => { void openTapped(raw); });
  };
  return (
    <code
      {...props}
      className={className}
      dir="ltr"
      data-streamdown="inline-code"
      data-openchamber-file-link={path ? 'true' : undefined}
      data-openchamber-file-ref={path ? raw : undefined}
      data-openchamber-file-path={path ?? undefined}
      role={path ? 'button' : undefined}
      tabIndex={path ? 0 : undefined}
      onClick={path ? activate : checksOnTap ? tap : undefined}
      onKeyDown={path ? activate : undefined}
    >
      {children}
    </code>
  );
}

export function MarkdownLink(props: React.ComponentProps<'a'> & ExtraProps) {
  const { purpose } = useMarkdownPresentation();
  if (purpose) {
    const { node: _node, children, ...rest } = props;
    return (
      <a {...rest}>
        <MarkdownMediaLinkContext.Provider value={true}>{children}</MarkdownMediaLinkContext.Provider>
      </a>
    );
  }
  return <ScreenMarkdownLink {...props} />;
}

// The favicon sits before its link, framed, loads lazily, and goes away when
// the site has none; a broken-image icon would read as a broken link.
function LinkFavicon({ src }: { src: string }) {
  const [failed, setFailed] = React.useState(false);
  if (failed) return null;
  return (
    <span
      data-message-image-export-exclude="true"
      className="me-1 inline-flex size-[18px] items-center justify-center rounded border border-[var(--border)] bg-[var(--interactive-hover)] align-middle"
    >
      <img src={src} alt="" aria-hidden="true" loading="lazy" decoding="async" className="size-3.5 rounded-sm" onError={() => setFailed(true)} />
    </span>
  );
}

const textOf = (node: ExtraProps['node']): string => {
  if (!node) return '';
  let text = '';
  const visit = (child: NonNullable<ExtraProps['node']>['children'][number]) => {
    if (child.type === 'text') text += child.value;
    else if (child.type === 'element') child.children.forEach(visit);
  };
  node.children.forEach(visit);
  return text.trim();
};

function GuestIdentifierLink({ identifier, className, children }: { identifier: string; className?: string; children: React.ReactNode }) {
  const { guestLinks, directory } = useMarkdownPresentation();
  const { t } = useI18n();
  const claim = guestLinks ? claimGuestIdentifier(guestLinks, identifier) : null;
  const guest = useGuestsStore((state) => (claim ? state.guests.find((entry) => entry.id === claim.guestId) : undefined));
  const openChatLink = useOpenChatLink(directory);
  if (!claim || !guest) return <>{children}</>;
  const pageUrl = claim.action === 'open' && !guestPanelOpensHere(guest) ? claim.url : undefined;
  const activate = (event: React.MouseEvent | React.KeyboardEvent) => {
    if ('key' in event && event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    if (pageUrl) openChatLink(pageUrl);
    else runGuestLink(claim, 'identifier', directory, t);
  };
  const label = pageUrl ?? t(claim.action === 'open' ? 'chat.guestLink.open' : 'chat.guestLink.attach', { identifier, name: guest.name });
  return (
    <a role="button" tabIndex={0} className={className ? `${className} cursor-pointer` : 'cursor-pointer'}
      data-oc-guest-link={claim.guestId} title={label} aria-label={label} onClick={activate} onKeyDown={activate}>
      {children}
    </a>
  );
}

function ScreenMarkdownLink({ href, children: originalChildren, node, ...props }: React.ComponentProps<'a'> & ExtraProps) {
  if (node?.properties.dataOcGuestLink !== undefined) {
    return <GuestIdentifierLink identifier={textOf(node)} className={props.className}>{originalChildren}</GuestIdentifierLink>;
  }
  // The policy dropped an unsafe or unsupported URL: the anchor stays inert,
  // as the old sanitizer left it, instead of opening the app in a new window.
  if (!href) {
    const { target: _target, rel: _rel, ...inert } = props;
    return <a {...inert}><MarkdownMediaLinkContext.Provider value={true}>{originalChildren}</MarkdownMediaLinkContext.Provider></a>;
  }
  return <ScreenMarkdownHref href={href} node={node} {...props}>{originalChildren}</ScreenMarkdownHref>;
}

function ScreenMarkdownHref({ href, children: originalChildren, node, ...props }: React.ComponentProps<'a'> & ExtraProps & { href: string }) {
  const children = <MarkdownMediaLinkContext.Provider value={true}>{originalChildren}</MarkdownMediaLinkContext.Provider>;
  const presentation = useMarkdownPresentation();
  const { directory } = presentation;
  const { t } = useI18n();
  const openFile = useOpenMarkdownFile();
  const media = useMarkdownMedia();
  const openChatLink = useOpenChatLink(directory);
  const text = textOf(node);
  const skill = parseSkillHref(href);
  const agent = parseAgentHref(href);
  const attachment = parseAttachmentHref(href);
  const session = parseSessionLink(href, appOwnOrigins());
  // A session or message the user's message mentioned draws as its chip.
  const referenceChips = React.useContext(ReferenceLinkChipsContext);
  const linkedReference = referenceChips.get(href);
  const mentionChips = React.useContext(SessionMentionChipsContext);
  const mentionChip = session ? mentionChips.get(sessionLinkKey(session)) : undefined;
  const app = isAppLinkUrl(href);
  const file = presentation.fileNavigation && resolveMarkdownFile(href, directory, 'click', 'href');
  // A link whose URL is not a file but whose text is a path opens that file
  // once the file is confirmed, as the old annotation pass did.
  const probe = file || app || session || skill || agent || attachment ? href : text;
  const probeHref = Boolean(file) || (!app && !session && !skill && !agent && !attachment && Boolean(href));
  const path = useConfirmedInlineFile(probe, probeHref ? 'href' : 'path');
  const textFile = Boolean(path && probe !== href);
  const external = isExternalHttpUrl(href);
  // A host's own reference (`#12`, a commit) reads as part of the text, without the site's mark.
  const reference = node?.properties.dataOcReference !== undefined;
  const favicon = external && !path && !reference ? getExternalFaviconUrl(href) : null;
  const showPreview = presentation.loopbackPreview && isLoopbackHttpUrl(href) && directory;
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (media?.documentAssets && openMarkdownDocumentLink(event, media.documentAssets)) return;
    if (textFile && path) {
      activateMarkdownFile(event, (external) => { void openFile(text, path, external); });
      return;
    }
    if (session) {
      if (!external || !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) {
        event.preventDefault();
        void openSessionLink(session.sessionId, session.messageId);
        return;
      }
    }
    if (app) {
      event.preventDefault();
      event.stopPropagation();
      void openAppLinkWithConfirmation(href);
      return;
    }
    if (skill) return;
    if (file) {
      // The href's own parse rules, not the code-text ones: percent-encoded
      // spaces and non-ASCII names decode back to the path on disk.
      activateMarkdownFile(event, (external) => { void openFile(href, path ?? undefined, external, 'href'); });
      return;
    }
    if (href.startsWith('#') && !media?.documentAssets) {
      // In-message anchors (footnotes) scroll within this message.
      event.preventDefault();
      const id = decodeURIComponent(href.slice(1));
      const root = event.currentTarget.closest('[data-markdown-content]');
      const target = root ? Array.from(root.querySelectorAll<HTMLElement>('[id]')).find((element) => element.id === id) : null;
      target?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (external && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) && !isBuiltInLink(href)) {
      const claim = presentation.guestLinks ? claimGuestUrl(presentation.guestLinks, href) : null;
      if (claim && runGuestLink(claim, 'link', directory, t)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    if (external && !presentation.disableLinkSafety && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) {
      event.preventDefault();
      event.stopPropagation();
      openChatLink(href);
    }
  };
  if (attachment) {
    return (
      <span
        className={attachment.openable ? INTERACTIVE_REFERENCE_CHIP_CLASS : INLINE_REFERENCE_CHIP_CLASS}
        data-attachment-citation={attachment.iconId}
        data-attachment-open={attachment.openable ? attachment.filename : undefined}
        role={attachment.openable ? 'button' : undefined}
        tabIndex={attachment.openable ? 0 : undefined}
        title={attachment.filename}
      >
        <svg className="size-[1.1em] shrink-0" aria-hidden="true"><use href={`#${attachment.iconId}`} /></svg>
        <span className={REFERENCE_CHIP_LABEL_CLASS}>{attachment.filename}</span>
      </span>
    );
  }
  if (linkedReference) return <ReferenceLinkChipButton chip={linkedReference.chip} url={linkedReference.url} />;
  if (session && mentionChip) {
    return <SessionMentionChipButton chip={mentionChip} target={session} />;
  }
  if (agent) {
    return (
      <span data-openchamber-agent-mention="true" className="text-primary">
        {children}
      </span>
    );
  }
  return (
    <>
      {favicon && <LinkFavicon src={favicon} />}
      <a
        {...props}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        dir={text === href ? 'ltr' : props.dir}
        className={skill ? INTERACTIVE_REFERENCE_CHIP_CLASS : props.className}
        data-skill-name={skill ?? undefined}
        title={skill ? `$${skill}` : props.title}
        data-openchamber-file-link={path ? 'true' : undefined}
        data-openchamber-file-ref={path ? probe : undefined}
        data-openchamber-file-path={path ?? undefined}
        onClick={handleClick}
        onAuxClick={(event) => {
          if (!app) return;
          event.preventDefault();
          if (event.button === 1) void openAppLinkWithConfirmation(href);
        }}
        onDragStart={app ? (event) => event.preventDefault() : undefined}
      >
        {skill && <Icon name="book-open" className="size-[1.1em] shrink-0" />}
        {skill ? <span className={REFERENCE_CHIP_LABEL_CLASS}>{skill}</span> : children}
      </a>
      {showPreview && (
        <HoverTooltip label={t('terminalView.preview.openTitle')}>
          <Button
            variant="ghost"
            size="xs"
            className="ms-1 align-middle"
            data-export-ignore
            aria-label={t('terminalView.preview.open')}
            onClick={() => useUIStore.getState().openContextPreview(directory, href)}
          >
            <Icon name="global" className="size-3.5" />
          </Button>
        </HoverTooltip>
      )}
    </>
  );
}
