import React, { useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { SimpleMarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { Icon } from "@/components/icon/Icon";
import { Spinner } from "@/components/ui/spinner";
import type { UpdateInfo, UpdateProgress } from '@/lib/desktop';
import { updateProgressPercent } from './updateProgress';
import { openExternalUrl } from '@/lib/url';
import { useI18n } from '@/lib/i18n';
import { formatReleaseDate, linkReleaseNoteMentions, parseReleaseNotesMarkdown, type ReleaseNotesContent } from '@/components/update/releaseNotes';
import { ReleaseNotesBody } from '@/components/update/ReleaseNotesBody';

interface UpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  info: UpdateInfo | null;
  downloading: boolean;
  downloaded: boolean;
  installing?: boolean;
  progress: UpdateProgress | null;
  error: string | null;
  onDownload: () => void;
  onRestart: () => void;
<<<<<<< HEAD
||||||| bc50ba56aa
  /** Runtime type to show different UI for desktop vs web */
  runtimeType?: 'desktop' | 'web' | 'vscode' | 'mobile' | null;
=======
  runtimeType?: 'desktop' | 'web' | 'vscode' | 'mobile' | null;
>>>>>>> upstream/main
}

const GITHUB_RELEASES_URL = 'https://github.com/Shizuku-Yume/ohpichamber/releases';

type ChangelogSection = {
  version: string;
  date: string;
  start: number;
  raw: string;
};

type ParsedChangelog =
<<<<<<< HEAD
  | { kind: 'raw'; content: string }
  | { kind: 'sections'; sections: Array<{ version: string; dateLabel: string; content: string; notes: ReleaseNotesContent | null }> };
||||||| bc50ba56aa
  | {
      kind: 'raw';
      title: string;
      content: string;
    }
  | {
      kind: 'sections';
      title: string;
      // A Canary night comes as groups, each folded to CANARY_GROUP_LIMIT lines.
      // A stable release comes as data, drawn the way Settings > About draws it.
      sections: Array<{ version: string; dateLabel: string; content: string; canaryGroups: NotesGroup[] | null; notes: ReleaseNotesContent | null }>;
    };
=======
  | {
      kind: 'raw';
      title: string;
      content: string;
    }
  | {
      kind: 'sections';
      title: string;
      sections: Array<{ version: string; dateLabel: string; content: string; canaryGroups: NotesGroup[] | null; notes: ReleaseNotesContent | null }>;
    };
>>>>>>> upstream/main

function stripChangelogHeading(sectionRaw: string): string {
  return sectionRaw.replace(/^## \[[^\]]+\] - \d{4}-\d{2}-\d{2}\s*\n?/, '').trim();
}

function compareSemverDesc(a: string, b: string): number {
  const pa = a.split('.').map((v) => Number.parseInt(v, 10));
  const pb = b.split('.').map((v) => Number.parseInt(v, 10));
  for (let i = 0; i < 3; i += 1) {
    const da = Number.isFinite(pa[i]) ? (pa[i] as number) : 0;
    const db = Number.isFinite(pb[i]) ? (pb[i] as number) : 0;
    if (da !== db) {
      return db - da;
    }
  }
  return 0;
}

function parseChangelogSections(body: string): ChangelogSection[] {
<<<<<<< HEAD
  const re = /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})\s*$/gm;
||||||| bc50ba56aa
  // A Canary night is headed by its build's version: 2.5.4-canary.20261031.5.
  const re = /^## \[(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)\] - (\d{4}-\d{2}-\d{2})\s*$/gm;
=======
  const re = /^## \[(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)\] - (\d{4}-\d{2}-\d{2})\s*$/gm;
>>>>>>> upstream/main
  const matches: Array<{ version: string; date: string; start: number }> = [];

  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    matches.push({
      version: m[1] ?? '',
      date: m[2] ?? '',
      start: m.index,
    });
  }

  if (matches.length === 0) {
    return [];
  }

  return matches.map((match, idx) => {
    const end = matches[idx + 1]?.start ?? body.length;
    return { version: match.version, date: match.date, start: match.start, raw: body.slice(match.start, end).trim() };
  });
}

<<<<<<< HEAD
||||||| bc50ba56aa
// A Canary night can list well over a hundred commits; each group shows this
// many until the person asks for the rest.
const CANARY_GROUP_LIMIT = 8;

/** The `### Group` and `- bullet` lines of one night, or null for any other shape. */
function splitNotesGroups(content: string): NotesGroup[] | null {
  const groups: NotesGroup[] = [];
  for (const line of content.split('\n')) {
    const heading = /^### (.+)$/.exec(line);
    if (heading) {
      groups.push({ heading: heading[1] ?? '', bullets: [] });
    } else if (line.startsWith('- ') && groups.length > 0) {
      groups[groups.length - 1]?.bullets.push(line);
    } else if (line.trim()) {
      return null;
    }
  }
  return groups.length > 0 ? groups : null;
}

const NotesGroupList: React.FC<{ group: NotesGroup }> = ({ group }) => {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const hidden = group.bullets.length - CANARY_GROUP_LIMIT;
  const shown = expanded || hidden <= 0 ? group.bullets : group.bullets.slice(0, CANARY_GROUP_LIMIT);
  return (
    <div className="[&+&]:mt-4">
      <SimpleMarkdownRenderer content={`### ${group.heading}\n\n${shown.join('\n')}`} disableLinkSafety={true} enableFileReferences={false} />
      {hidden > 0 && (
        <button
          type="button"
          className="mt-1 typography-meta text-[var(--primary-base)] hover:underline"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? t('updateDialog.changelog.showLess') : t('updateDialog.changelog.showMore', { count: hidden })}
        </button>
      )}
    </div>
  );
};

=======
const CANARY_GROUP_LIMIT = 8;

function splitNotesGroups(content: string): NotesGroup[] | null {
  const groups: NotesGroup[] = [];
  for (const line of content.split('\n')) {
    const heading = /^### (.+)$/.exec(line);
    if (heading) {
      groups.push({ heading: heading[1] ?? '', bullets: [] });
    } else if (line.startsWith('- ') && groups.length > 0) {
      groups[groups.length - 1]?.bullets.push(line);
    } else if (line.trim()) {
      return null;
    }
  }
  return groups.length > 0 ? groups : null;
}

const NotesGroupList: React.FC<{ group: NotesGroup }> = ({ group }) => {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const hidden = group.bullets.length - CANARY_GROUP_LIMIT;
  const shown = expanded || hidden <= 0 ? group.bullets : group.bullets.slice(0, CANARY_GROUP_LIMIT);
  return (
    <div className="[&+&]:mt-4">
      <SimpleMarkdownRenderer content={`### ${group.heading}\n\n${shown.join('\n')}`} disableLinkSafety={true} enableFileReferences={false} />
      {hidden > 0 && (
        <button
          type="button"
          className="mt-1 typography-meta text-[var(--primary-base)] hover:underline"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? t('updateDialog.changelog.showLess') : t('updateDialog.changelog.showMore', { count: hidden })}
        </button>
      )}
    </div>
  );
};

>>>>>>> upstream/main
export const UpdateDialog: React.FC<UpdateDialogProps> = ({
  open,
  onOpenChange,
  info,
  downloading,
  downloaded,
  installing = false,
  progress,
  error,
  onDownload,
  onRestart,
}) => {
  const { t } = useI18n();

<<<<<<< HEAD
  const releaseUrl = info?.version ? (info.releaseUrl || `${GITHUB_RELEASES_URL}/tag/v${info.version}`) : GITHUB_RELEASES_URL;
||||||| bc50ba56aa
  // Every Canary build is on the one `canary` pre-release.
  const releaseUrl = info?.version
    ? (info.releaseUrl || `${GITHUB_RELEASES_URL}/tag/${parseCanaryVersion(info.version) ? 'canary' : `v${info.version}`}`)
    : GITHUB_RELEASES_URL;
  const describeChangeCount = (groups: NotesGroup[]) => {
    const count = groups.reduce((total, group) => total + group.bullets.length, 0);
    return count === 1 ? t('updateDialog.changelog.changeCountSingle') : t('updateDialog.changelog.changeCountPlural', { count });
  };
  // "2.5.4 Canary · Oct 31" for 2.5.4-canary.20261031.5. Between two Canary
  // builds the header names the channel once: "Canary: 2.5.4 · Oct 29 → 2.5.4 · Oct 31",
  // and two builds of one day add their build numbers: "Oct 31 #123 → Oct 31 #124".
  const bothCanary = Boolean(parseCanaryVersion(info?.currentVersion) && parseCanaryVersion(info?.version));
  const describeVersion = (version: string, beside: string | undefined) => {
    const canary = parseCanaryVersion(version);
    if (!canary) return version;
    const values = { version: canary.release, date: formatCanaryBuild(canary, getCurrentIntlLocale(), parseCanaryVersion(beside)) };
    return bothCanary ? t('updateDialog.canary.build', values) : t('updateDialog.canary.version', values);
  };
  const mobileUpdateUrl = info?.downloadUrl || releaseUrl;
=======
  const releaseUrl = info?.version
    ? (info.releaseUrl || `${GITHUB_RELEASES_URL}/tag/${parseCanaryVersion(info.version) ? 'canary' : `v${info.version}`}`)
    : GITHUB_RELEASES_URL;
  const describeChangeCount = (groups: NotesGroup[]) => {
    const count = groups.reduce((total, group) => total + group.bullets.length, 0);
    return count === 1 ? t('updateDialog.changelog.changeCountSingle') : t('updateDialog.changelog.changeCountPlural', { count });
  };
  const bothCanary = Boolean(parseCanaryVersion(info?.currentVersion) && parseCanaryVersion(info?.version));
  const describeVersion = (version: string, beside: string | undefined) => {
    const canary = parseCanaryVersion(version);
    if (!canary) return version;
    const values = { version: canary.release, date: formatCanaryBuild(canary, getCurrentIntlLocale(), parseCanaryVersion(beside)) };
    return bothCanary ? t('updateDialog.canary.build', values) : t('updateDialog.canary.version', values);
  };
  const mobileUpdateUrl = info?.downloadUrl || releaseUrl;
>>>>>>> upstream/main

  const progressPercent = updateProgressPercent(progress);

<<<<<<< HEAD
||||||| bc50ba56aa
  const isWebRuntime = runtimeType === 'web';
  // A desktop host installed from a Linux package asks for the password on its own screen.
  const desktopHostInstall = isWebRuntime && info?.installBlocked === 'desktop-host';
  const needsNewerOpenCode = isWebRuntime && info?.installBlocked === 'opencode-version';
  const isMobileRuntime = runtimeType === 'mobile';
  const updateCommand = info?.updateCommand || 'openchamber update';

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setWebUpdateState('idle');
      setWebError(null);
    }
  }, [open]);

  const handleCopyCommand = async () => {
    const result = await copyTextToClipboard(updateCommand);
    if (result.ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

=======
  const isWebRuntime = runtimeType === 'web';
  const desktopHostInstall = isWebRuntime && info?.installBlocked === 'desktop-host';
  const needsNewerOpenCode = isWebRuntime && info?.installBlocked === 'opencode-version';
  const isMobileRuntime = runtimeType === 'mobile';
  const updateCommand = info?.updateCommand || 'openchamber update';

  useEffect(() => {
    if (!open) {
      setWebUpdateState('idle');
      setWebError(null);
    }
  }, [open]);

  const handleCopyCommand = async () => {
    const result = await copyTextToClipboard(updateCommand);
    if (result.ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

>>>>>>> upstream/main
  const handleOpenExternal = useCallback(async (url: string) => {
    await openExternalUrl(url);
  }, []);

  const changelog = useMemo<ParsedChangelog | null>(() => {
    if (!info?.body) {
      return null;
    }

    const body = info.body.trim();
    if (!body) {
      return null;
    }

    const sections = parseChangelogSections(body);

    if (sections.length === 0) {
      return {
        kind: 'raw',
        content: linkReleaseNoteMentions(body),
      };
    }

    const sorted = [...sections].sort((a, b) => compareSemverDesc(a.version, b.version));
    return {
      kind: 'sections',
      sections: sorted.map((section) => {
        const stripped = stripChangelogHeading(section.raw) || body;
<<<<<<< HEAD
||||||| bc50ba56aa
        const content = linkReleaseNoteMentions(stripped);
        const canary = parseCanaryVersion(section.version);
        // Another build of the same day among the sections adds the build number.
        const sameDayBuild = canary
          ? sorted
            .filter((_, other) => other !== index)
            .map((other) => parseCanaryVersion(other.version))
            .find((other) => other?.builtOn.getTime() === canary.builtOn.getTime())
          : null;
=======
        const content = linkReleaseNoteMentions(stripped);
        const canary = parseCanaryVersion(section.version);
        const sameDayBuild = canary
          ? sorted
            .filter((_, other) => other !== index)
            .map((other) => parseCanaryVersion(other.version))
            .find((other) => other?.builtOn.getTime() === canary.builtOn.getTime())
          : null;
>>>>>>> upstream/main
        return {
          version: section.version,
          dateLabel: formatReleaseDate(section.date),
          content: linkReleaseNoteMentions(stripped),
          notes: parseReleaseNotesMarkdown(stripped),
        };
      }),
    };
  }, [info?.body]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-5 border-[var(--interactive-border)]" showCloseButton={true}>
<<<<<<< HEAD

        {/* Header Section */}
||||||| bc50ba56aa
        
        {/* Header Section */}
=======
        
>>>>>>> upstream/main
        <div className="flex items-center mb-1">
          <DialogTitle className="flex items-center gap-2.5">
            <Icon name="download-cloud" className="h-5 w-5 text-[var(--primary-base)]" />
            <span className="text-lg font-semibold text-foreground">
              {t('updateDialog.header.updateAvailable')}
            </span>
          </DialogTitle>

          {(info?.currentVersion || info?.version) && (
            <div className="flex items-center gap-2 font-mono text-sm ms-3">
              {info?.currentVersion && (
                <span className="text-muted-foreground">{info.currentVersion}</span>
              )}
              {info?.currentVersion && info?.version && (
                <span className="text-muted-foreground/50">→</span>
              )}
              {info?.version && (
                <span className="text-[var(--primary-base)] font-medium">{info.version}</span>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">

<<<<<<< HEAD
          {/* Changelog Rendering */}
          {changelog && (
            <div className="rounded-lg border border-border bg-surface-elevated/20 overflow-hidden">
||||||| bc50ba56aa
          {/* Web update progress */}
          {isWebRuntime && isWebUpdating && (
            <div className="rounded-lg bg-surface-elevated/30 p-5 border border-border">
              <div className="flex items-center gap-3">
                <Spinner className="h-5 w-5 text-[var(--primary-base)]" />
                <div className="typography-ui-label text-foreground">
                  {webUpdateState === 'updating' && t('updateDialog.status.installingUpdate')}
                  {webUpdateState === 'restarting' && t('updateDialog.status.serverRestarting')}
                  {webUpdateState === 'reconnecting' && t('updateDialog.status.waitingForServer')}
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t('updateDialog.status.autoReloadHint')}
              </p>
            </div>
          )}

          {/* Changelog Rendering */}
          {changelog && !isWebUpdating && (
              <div className="rounded-lg border border-border bg-surface-elevated/20 overflow-hidden">
=======
          {isWebRuntime && isWebUpdating && (
            <div className="rounded-lg bg-surface-elevated/30 p-5 border border-border">
              <div className="flex items-center gap-3">
                <Spinner className="h-5 w-5 text-[var(--primary-base)]" />
                <div className="typography-ui-label text-foreground">
                  {webUpdateState === 'updating' && t('updateDialog.status.installingUpdate')}
                  {webUpdateState === 'restarting' && t('updateDialog.status.serverRestarting')}
                  {webUpdateState === 'reconnecting' && t('updateDialog.status.waitingForServer')}
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t('updateDialog.status.autoReloadHint')}
              </p>
            </div>
          )}

          {changelog && !isWebUpdating && (
              <div className="rounded-lg border border-border bg-surface-elevated/20 overflow-hidden">
>>>>>>> upstream/main
              <ScrollableOverlay
                className="max-h-[400px] p-0"
                fillContainer={false}
              >
                {changelog.kind === 'raw' ? (
                  <div
                    className="p-4 typography-markdown-body text-foreground leading-relaxed break-words [&_a]:!text-[var(--primary-base)] [&_a]:!no-underline [&_a:hover]:!underline [&_h3]:!mt-4 [&_h3]:!mb-1.5 [&_h3]:!text-xs [&_h3]:!font-medium [&_h3]:!uppercase [&_h3]:!tracking-wide [&_h3]:!text-muted-foreground [&_h3:first-child]:!mt-0"
                    onClickCapture={(e) => {
                      const target = e.target as HTMLElement;
                      const a = target.closest('a');
                      if (a && a.href) {
                        e.preventDefault();
                        e.stopPropagation();
                        void handleOpenExternal(a.href);
                      }
                    }}
                  >
                    <SimpleMarkdownRenderer content={changelog.content} disableLinkSafety={true} enableFileReferences={false} />
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {changelog.sections.map((section) => (
                      <div key={section.version} className="p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <span className="typography-ui-label font-mono text-[var(--primary-base)] bg-[var(--primary-base)]/10 px-1.5 py-0.5 rounded">
                            {`v${section.version}`}
                          </span>
                          <span className="text-sm font-medium text-muted-foreground">
                            {section.dateLabel}
                          </span>
                        </div>
                        <div
                          className="typography-markdown-body text-foreground leading-relaxed break-words [&_a]:!text-[var(--primary-base)] [&_a]:!no-underline [&_a:hover]:!underline [&_h3]:!mt-4 [&_h3]:!mb-1.5 [&_h3]:!text-xs [&_h3]:!font-medium [&_h3]:!uppercase [&_h3]:!tracking-wide [&_h3]:!text-muted-foreground [&_h3:first-child]:!mt-0"
                          onClickCapture={(e) => {
                            const target = e.target as HTMLElement;
                            const a = target.closest('a');
                            if (a && a.href) {
                              e.preventDefault();
                              e.stopPropagation();
                              void handleOpenExternal(a.href);
                            }
                          }}
                        >
                          {section.notes
                            ? <ReleaseNotesBody notes={section.notes} folded={true} />
                            : <SimpleMarkdownRenderer content={section.content} disableLinkSafety={true} enableFileReferences={false} />}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollableOverlay>
            </div>
          )}

<<<<<<< HEAD
          {/* Desktop progress bar */}
          {downloading && (
||||||| bc50ba56aa
          {/* Web runtime fallback command; it would not update a copy no package manager installed */}
          {isWebRuntime && info?.packageManager !== 'electron' && info?.installBlocked !== 'manual-install' && webUpdateState === 'error' && (
            <div className="space-y-2 mt-4">
              <div className="flex items-center gap-2 typography-meta text-muted-foreground">
                <Icon name="terminal" className="h-4 w-4" />
                <span>{t('updateDialog.fallback.updateViaTerminal')}</span>
              </div>
              <div className="flex items-center gap-2 p-1 ps-3 bg-surface-elevated/50 rounded-md border border-border">
                <ScrollableOverlay as="code" outerClassName="overlay-scrollbar-wrapper--no-gutter flex-1 min-w-0" fillContainer={false} className="font-mono text-sm text-foreground whitespace-nowrap">
                  {updateCommand}
                </ScrollableOverlay>
                <button
                  onClick={handleCopyCommand}
                  className={cn(
                    'flex items-center justify-center p-2 rounded',
                    'text-muted-foreground hover:text-foreground hover:bg-[var(--interactive-hover)]',
                    'transition-colors',
                    copied && 'text-[var(--status-success)]'
                  )}
                  title={copied ? t('updateDialog.actions.copied') : t('updateDialog.actions.copyCommand')}
                >
                  {copied ? (
                    <Icon name="check" className="h-4 w-4" />
                  ) : (
                    <Icon name="clipboard" className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Desktop progress bar */}
          {!isWebRuntime && !isMobileRuntime && downloading && (
=======
          {isWebRuntime && info?.packageManager !== 'electron' && info?.installBlocked !== 'manual-install' && webUpdateState === 'error' && (
            <div className="space-y-2 mt-4">
              <div className="flex items-center gap-2 typography-meta text-muted-foreground">
                <Icon name="terminal" className="h-4 w-4" />
                <span>{t('updateDialog.fallback.updateViaTerminal')}</span>
              </div>
              <div className="flex items-center gap-2 p-1 ps-3 bg-surface-elevated/50 rounded-md border border-border">
                <ScrollableOverlay as="code" outerClassName="overlay-scrollbar-wrapper--no-gutter flex-1 min-w-0" fillContainer={false} className="font-mono text-sm text-foreground whitespace-nowrap">
                  {updateCommand}
                </ScrollableOverlay>
                <button
                  onClick={handleCopyCommand}
                  className={cn(
                    'flex items-center justify-center p-2 rounded',
                    'text-muted-foreground hover:text-foreground hover:bg-[var(--interactive-hover)]',
                    'transition-colors',
                    copied && 'text-[var(--status-success)]'
                  )}
                  title={copied ? t('updateDialog.actions.copied') : t('updateDialog.actions.copyCommand')}
                >
                  {copied ? (
                    <Icon name="check" className="h-4 w-4" />
                  ) : (
                    <Icon name="clipboard" className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          )}

          {!isWebRuntime && !isMobileRuntime && downloading && (
>>>>>>> upstream/main
            <div className="space-y-2 mt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('updateDialog.status.downloadingPayload')}</span>
                <span className="font-mono text-foreground">{progressPercent}%</span>
              </div>
              <div className="h-1.5 bg-[var(--surface-subtle)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--primary-base)] transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

<<<<<<< HEAD
          {error && (
||||||| bc50ba56aa
          {/* Error display */}
          {desktopHostInstall && (
            <p className="mt-4 typography-meta text-muted-foreground">
              {t('updateDialog.desktopHostInstall', { version: info?.version || '' })}
            </p>
          )}

          {needsNewerOpenCode && (
            <p className="mt-4 typography-meta text-[var(--status-warning)]">
              {t('updateDialog.openCodeTooOld', {
                version: describeVersion(info?.version || '', info?.currentVersion),
                required: info?.requiredOpenCodeVersion || '',
                current: info?.openCodeVersion || '',
              })}
            </p>
          )}

          {(error || webError) && (
=======
          {desktopHostInstall && (
            <p className="mt-4 typography-meta text-muted-foreground">
              {t('updateDialog.desktopHostInstall', { version: info?.version || '' })}
            </p>
          )}

          {needsNewerOpenCode && (
            <p className="mt-4 typography-meta text-[var(--status-warning)]">
              {t('updateDialog.openCodeTooOld', {
                version: describeVersion(info?.version || '', info?.currentVersion),
                required: info?.requiredOpenCodeVersion || '',
                current: info?.openCodeVersion || '',
              })}
            </p>
          )}

          {(error || webError) && (
>>>>>>> upstream/main
            <div className="p-3 mt-4 bg-[var(--status-error-background)] border border-[var(--status-error-border)] rounded-lg">
              <p className="text-sm text-[var(--status-error)]">{error}</p>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-4">
          <a
            href={releaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <Icon name="external-link" className="h-4 w-4" />
            GitHub
          </a>

          <div className="flex-1 flex justify-end">
<<<<<<< HEAD
            {!downloaded && !downloading && (
||||||| bc50ba56aa
            {/* Desktop Buttons */}
            {!isWebRuntime && !isMobileRuntime && !downloaded && !downloading && (
=======
            {!isWebRuntime && !isMobileRuntime && !downloaded && !downloading && (
>>>>>>> upstream/main
              <button
                onClick={onDownload}
                className="flex items-center justify-center gap-2 px-5 py-2 rounded-md text-sm font-medium bg-[var(--primary-base)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity"
              >
                <Icon name="download" className="h-4 w-4" />
                {t('updateDialog.actions.downloadUpdate')}
              </button>
            )}

            {downloading && (
              <button
                disabled
                className="flex items-center justify-center gap-2 px-5 py-2 rounded-md text-sm font-medium bg-[var(--primary-base)]/50 text-[var(--primary-foreground)] cursor-not-allowed"
              >
                <Spinner className="h-4 w-4" />
                {t('updateDialog.status.downloading')}
              </button>
            )}

            {downloaded && installing && (
              <button
                disabled
                className="flex items-center justify-center gap-2 px-5 py-2 rounded-md text-sm font-medium bg-[var(--status-success)]/50 text-[var(--status-success-foreground)] cursor-not-allowed"
              >
                <Spinner className="h-4 w-4" />
                {t('updateDialog.status.restarting')}
              </button>
            )}

            {downloaded && !installing && (
              <button
                onClick={onRestart}
                className="flex items-center justify-center gap-2 px-5 py-2 rounded-md text-sm font-medium bg-[var(--status-success)] text-[var(--status-success-foreground)] hover:opacity-90 transition-opacity"
              >
                <Icon name="restart" className="h-4 w-4" />
                {t('updateDialog.actions.restartToUpdate')}
              </button>
            )}
<<<<<<< HEAD
||||||| bc50ba56aa

            {/* Web Buttons */}
            {isMobileRuntime && (
              <Button
                onClick={handleMobileUpdate}
                size="default"
              >
                <Icon name="external-link" className="h-4 w-4" />
                {t('updateDialog.actions.openMobileUpdate')}
              </Button>
            )}

            {isWebRuntime && !isWebUpdating && !desktopHostInstall && (
              <button
                onClick={handleWebUpdate}
                disabled={needsNewerOpenCode}
                className="flex items-center justify-center gap-2 px-5 py-2 rounded-md text-sm font-medium bg-[var(--primary-base)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon name="download" className="h-4 w-4" />
                {t('updateDialog.actions.updateNow')}
              </button>
            )}

            {isWebRuntime && isWebUpdating && (
              <button
                disabled
                className="flex items-center justify-center gap-2 px-5 py-2 rounded-md text-sm font-medium bg-[var(--primary-base)]/50 text-[var(--primary-foreground)] cursor-not-allowed"
              >
                <Spinner className="h-4 w-4" />
                {t('updateDialog.status.updating')}
              </button>
            )}
=======

            {isMobileRuntime && (
              <Button
                onClick={handleMobileUpdate}
                size="default"
              >
                <Icon name="external-link" className="h-4 w-4" />
                {t('updateDialog.actions.openMobileUpdate')}
              </Button>
            )}

            {isWebRuntime && !isWebUpdating && !desktopHostInstall && (
              <button
                onClick={handleWebUpdate}
                disabled={needsNewerOpenCode}
                className="flex items-center justify-center gap-2 px-5 py-2 rounded-md text-sm font-medium bg-[var(--primary-base)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon name="download" className="h-4 w-4" />
                {t('updateDialog.actions.updateNow')}
              </button>
            )}

            {isWebRuntime && isWebUpdating && (
              <button
                disabled
                className="flex items-center justify-center gap-2 px-5 py-2 rounded-md text-sm font-medium bg-[var(--primary-base)]/50 text-[var(--primary-foreground)] cursor-not-allowed"
              >
                <Spinner className="h-4 w-4" />
                {t('updateDialog.status.updating')}
              </button>
            )}
>>>>>>> upstream/main
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
