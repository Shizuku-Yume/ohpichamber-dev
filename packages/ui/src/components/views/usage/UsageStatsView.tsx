import { formatModelRef } from '@openchamber/agent-contract';
import React from 'react';

import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { SettingsChipGroup, SETTINGS_WIDTH_SELECT_CLASS } from '@/components/sections/shared/SettingsSection';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getCurrentIntlLocale, useI18n } from '@/lib/i18n';
import type { I18nKey } from '@/lib/i18n';
import type { UsageModel, UsageProvider, UsageStats } from '@openchamber/agent-contract';
import { formatDateTimeForPreference, formatTimeForPreference } from '@/lib/timeFormat';
import { cn } from '@/lib/utils';
import { useConfigStore } from '@/stores/useConfigStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
// Deferred to task 31; identity ordering in the meantime
const useProjectsInSidebarOrder = <T,>(list: T[]): T[] => list;
import { useUIStore, type TimeFormatPreference } from '@/stores/useUIStore';

import {
  USAGE_RANGES,
  averagePer,
  buildActivitySeries,
  cacheHitRate,
  costPerMillionTokens,
  isEmptyReport,
  isSameLocalDay,
  projectDisplayName,
  reasoningShare,
  tokenSegments,
  toolSuccessRate,
  type ActivityBar,
  type TokenSegmentKey,
  type UsageRange,
} from './usageStatsModel';
import { selectUsageStatsEntry, selectUsageToolsEntry, useTodayRollover, useUsageStatsStore, type UsageToolsEntry } from './usageStatsStore';

const ALL_PROJECTS = '__all__';

const TOKEN_SEGMENT_CLASSES = {
  input: 'bg-chart-1',
  output: 'bg-chart-2',
  cacheRead: 'bg-chart-3',
  cacheWrite: 'bg-chart-4',
} as const satisfies Record<TokenSegmentKey, string>;

const TOKEN_SEGMENT_LABEL_KEYS = {
  input: 'usageStats.tokens.input',
  output: 'usageStats.tokens.output',
  cacheRead: 'usageStats.tokens.cacheRead',
  cacheWrite: 'usageStats.tokens.cacheWrite',
} as const satisfies Record<TokenSegmentKey, I18nKey>;

const RANGE_LABEL_KEYS = {
  '1d': 'usageStats.range.1d',
  '7d': 'usageStats.range.7d',
  '30d': 'usageStats.range.30d',
  '90d': 'usageStats.range.90d',
  all: 'usageStats.range.all',
} as const satisfies Record<UsageRange, I18nKey>;

function useUsageStats(range: UsageRange, projectDirectory: string | null) {
  const selectedProvider = useUsageStatsStore((store) => store.selectedProvider);
  const request = React.useMemo(() => ({ range, projectDirectory, providerId: selectedProvider ?? undefined }), [range, projectDirectory, selectedProvider]);
  const entry = useUsageStatsStore((store) => selectUsageStatsEntry(store, request));
  const load = useUsageStatsStore((store) => store.load);

  React.useLayoutEffect(() => {
    void load(request);
  }, [load, request, entry]);

  const reload = React.useCallback(() => void load(request), [load, request]);
  useTodayRollover(range === '1d', reload);

  const refresh = React.useCallback(() => void load(request, { force: true }), [load, request]);

  const toolsEntry = useUsageStatsStore((store) => selectUsageToolsEntry(store, request));
  const toolsRequested = useUsageStatsStore((store) => store.toolsRequested);
  const loadTools = useUsageStatsStore((store) => store.loadTools);
  const hasReport = Boolean(entry?.stats);
  React.useEffect(() => {
    if (toolsRequested && hasReport) void loadTools(request);
  }, [hasReport, loadTools, request, toolsRequested]);
  const requestTools = React.useCallback(() => void loadTools(request, { force: true }), [loadTools, request]);

  return { entry, refresh, tools: { entry: toolsEntry, load: requestTools } };
}

export function UsageStatsView({ className }: { className?: string }): React.ReactNode {
  return (
    <ScrollableOverlay outerClassName={cn('h-full', className)} disableHorizontal>
      <UsageStatsReport />
    </ScrollableOverlay>
  );
}

/**
 * The token report itself, without a scroll container: the standalone Stats
 * surface wraps it, and the Usage page places it above the quota cards.
 */
export function UsageStatsReport(): React.ReactNode {
  const { t } = useI18n();
  const intlLocale = getCurrentIntlLocale();
  const projects = useProjectsInSidebarOrder(useProjectsStore((store) => store.projects));
  const [range, setRange] = React.useState<UsageRange>('30d');
  const [projectChoice, setProjectChoice] = React.useState<string>(ALL_PROJECTS);
  const selectedProject = projects.find((project) => project.id === projectChoice) ?? null;
  const { entry, refresh, tools } = useUsageStats(range, selectedProject?.path ?? null);
  const timeFormatPreference = useUIStore((store) => store.timeFormatPreference);
  const stats = entry?.stats ?? null;
  const loading = entry?.loading ?? true;

  const formats = React.useMemo(() => {
    return {
      integer: new Intl.NumberFormat(intlLocale),
      compact: new Intl.NumberFormat(intlLocale, { notation: 'compact', maximumFractionDigits: 1 }),
      decimal: new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 1 }),
      percent: new Intl.NumberFormat(intlLocale, { style: 'percent', maximumFractionDigits: 1 }),
      cost: new Intl.NumberFormat(intlLocale, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }),
      day: new Intl.DateTimeFormat(intlLocale, { month: 'short', day: 'numeric', year: 'numeric' }),
      milliseconds: new Intl.NumberFormat(intlLocale, { style: 'unit', unit: 'millisecond', unitDisplay: 'short', maximumFractionDigits: 0 }),
      seconds: new Intl.NumberFormat(intlLocale, { style: 'unit', unit: 'second', unitDisplay: 'short', maximumFractionDigits: 1 }),
      wholeSeconds: new Intl.NumberFormat(intlLocale, { style: 'unit', unit: 'second', unitDisplay: 'short', maximumFractionDigits: 0 }),
      minutes: new Intl.NumberFormat(intlLocale, { style: 'unit', unit: 'minute', unitDisplay: 'short', maximumFractionDigits: 0 }),
    };
  }, [intlLocale]);

  return (
    <div className="@container">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-4 @xl:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SettingsChipGroup
            value={range}
            onChange={setRange}
            aria-label={t('usageStats.range.label')}
            options={USAGE_RANGES.map((option) => ({ value: option, label: t(RANGE_LABEL_KEYS[option]) }))}
          />
          <Select value={selectedProject ? selectedProject.id : ALL_PROJECTS} onValueChange={setProjectChoice}>
            <SelectTrigger className={SETTINGS_WIDTH_SELECT_CLASS} aria-label={t('usageStats.scope.label')}>
              <SelectValue>
                {() => (selectedProject ? projectDisplayName(selectedProject) : t('usageStats.scope.all'))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="start">
              <SelectItem value={ALL_PROJECTS}>{t('usageStats.scope.all')}</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  <span className="truncate" title={project.path}>{projectDisplayName(project)}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ms-auto flex min-w-0 items-center gap-1.5">
            {stats && entry?.fetchedAt ? (
              <span
                className="truncate typography-micro text-muted-foreground"
                title={entry.error ?? undefined}
                role={entry.error ? 'status' : undefined}
              >
                {t(entry.error ? 'usageStats.refresh.failed' : 'usageStats.refresh.updated', {
                  time: formatUpdatedAt(entry.fetchedAt, timeFormatPreference),
                })}
              </span>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  onClick={refresh}
                  disabled={loading}
                  aria-label={t('usageStats.refresh.action')}
                >
                  <Icon name="refresh" className={cn('size-4', loading && 'animate-spin')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>{t('usageStats.refresh.action')}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {stats?.partial ? <PartialUsageNotice errors={stats.errors} /> : null}

        {stats ? (
          isEmptyReport(stats) ? (
            <div className="flex flex-col items-center gap-1 py-16 text-center">
              <p className="typography-ui-label font-semibold text-foreground">{t('usageStats.empty.title')}</p>
              <p className="typography-micro text-muted-foreground">{t('usageStats.empty.description')}</p>
            </div>
          ) : (
            <UsageReport stats={stats} range={range} formats={formats} tools={tools} />
          )
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground" role="status">
            <Icon name="loader-4" className="size-4 animate-spin" />
            <span className="typography-ui-label">{t('usageStats.loading')}</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-16 text-center" role="alert">
            <p className="typography-ui-label font-semibold text-foreground">{t('usageStats.error.title')}</p>
            <p className="max-w-md break-words typography-micro text-muted-foreground">{entry?.error}</p>
            <Button type="button" variant="outline" size="sm" onClick={refresh}>
              {t('usageStats.error.retry')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function formatUpdatedAt(timestamp: number, preference: TimeFormatPreference): string {
  if (isSameLocalDay(timestamp, Date.now())) return formatTimeForPreference(timestamp, preference);
  return formatDateTimeForPreference(timestamp, preference, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

type Formats = {
  integer: Intl.NumberFormat;
  compact: Intl.NumberFormat;
  decimal: Intl.NumberFormat;
  percent: Intl.NumberFormat;
  cost: Intl.NumberFormat;
  day: Intl.DateTimeFormat;
  milliseconds: Intl.NumberFormat;
  seconds: Intl.NumberFormat;
  wholeSeconds: Intl.NumberFormat;
  minutes: Intl.NumberFormat;
};

type ToolsState = { entry: UsageToolsEntry | undefined; load: () => void };

/** Some sessions could not be read; the totals shown are those that could. */
function PartialUsageNotice({ errors }: { errors?: Record<string, string> }): React.ReactNode {
  const { t } = useI18n();
  return (
    <div role="status" className="rounded-lg border border-border/60 px-3 py-2 typography-micro text-muted-foreground">
      <p>{t('usageStats.partial')}</p>
      {errors ? <ul>{Object.entries(errors).map(([sessionId, error]) => <li key={sessionId} className="break-words">{sessionId}: {error}</li>)}</ul> : null}
    </div>
  );
}

function UsageReport({ stats, range, formats, tools }: { stats: UsageStats; range: UsageRange; formats: Formats; tools: ToolsState }): React.ReactNode {
  const { t } = useI18n();
  const cache = stats.tokens.cacheRead + stats.tokens.cacheWrite;
  const today = range === '1d';

  const isScopeFullyUnpriced = React.useMemo(() => {
    if (stats.models.length === 0) {
      return stats.cost === 0 && stats.steps > 0;
    }
    return stats.models.every((m) => m.pricing === null);
  }, [stats.models, stats.cost, stats.steps]);

  const isScopeMixedPricing = React.useMemo(() => {
    if (stats.models.length === 0) return false;
    const hasPriced = stats.models.some((m) => m.pricing !== null);
    const hasUnpriced = stats.models.some((m) => m.pricing === null);
    return hasPriced && hasUnpriced;
  }, [stats.models]);

  const costValue = isScopeFullyUnpriced ? '—' : formats.cost.format(stats.cost);
  const costHint = isScopeMixedPricing ? t('usageStats.costPartialHint') : undefined;

  const baseBreakdown = t('usageStats.metric.tokensBreakdown', {
    input: formats.compact.format(stats.tokens.input),
    output: formats.compact.format(stats.tokens.output),
    cache: formats.compact.format(cache),
  });
  const tokensHint = stats.tokens.reasoning && stats.tokens.reasoning > 0
    ? `${baseBreakdown} · ${t('usageStats.tokens.reasoning')} ${formats.compact.format(stats.tokens.reasoning)}`
    : baseBreakdown;

  return (
    <>
      {stats.providers && stats.providers.length > 1 ? (
        <ProviderComparison providers={stats.providers} formats={formats} />
      ) : null}
      <div className={cn('grid grid-cols-2 gap-2', !today && '@xl:grid-cols-3')}>
        <StatTile
          label={t('usageStats.metric.sessions')}
          value={formats.integer.format(stats.sessions)}
          hint={t('usageStats.metric.subagents', { count: formats.integer.format(stats.subagents) })}
        />
        <StatTile label={t('usageStats.metric.prompts')} value={formats.integer.format(stats.prompts)} />
        <StatTile
          label={t('usageStats.metric.tokens')}
          value={formats.compact.format(stats.tokens.total)}
          hint={tokensHint}
        />
        <StatTile label={t('usageStats.metric.cost')} value={costValue} hint={costHint} />
        {today ? null : (
          <>
            <StatTile label={t('usageStats.metric.activeDays')} value={formats.integer.format(stats.activeDays)} />
            <StatTile label={t('usageStats.metric.streak')} value={formats.integer.format(stats.streak)} />
          </>
        )}
      </div>

      {today ? null : <ActivityChart stats={stats} formats={formats} />}

      <TokenComposition stats={stats} formats={formats} />

      <EfficiencyTiles stats={stats} formats={formats} isFullyUnpriced={isScopeFullyUnpriced} />

      <ModelUsage models={stats.models} formats={formats} />

      <ToolsSection state={tools} formats={formats} />
    </>
  );
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }): React.ReactNode {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-edge bg-[var(--surface-elevated)] px-3 py-2.5">
      <span className="truncate typography-micro text-muted-foreground">{label}</span>
      <span className="truncate text-xl font-semibold tabular-nums text-foreground">{value}</span>
      {hint ? <span className="typography-micro text-muted-foreground whitespace-normal break-words" title={hint}>{hint}</span> : null}
    </div>
  );
}

function Section({
  title,
  caption,
  actions,
  children,
}: {
  title: string;
  caption?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <h2 className="typography-ui-label font-semibold text-foreground">{title}</h2>
        {actions ?? (caption ? <span className="truncate typography-micro text-muted-foreground">{caption}</span> : null)}
      </div>
      {children}
    </section>
  );
}

const parseDay = (key: string): Date => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
};

function ActivityChart({ stats, formats }: { stats: UsageStats; formats: Formats }): React.ReactNode {
  const { t } = useI18n();
  const series = React.useMemo(() => buildActivitySeries(stats), [stats]);
  const [active, setActive] = React.useState<number | null>(null);
  const weekly = series.unit === 'week';
  const title = t(weekly ? 'usageStats.activity.titleWeekly' : 'usageStats.activity.titleDaily');
  const labelFor = (bar: ActivityBar) =>
    bar.start === bar.end
      ? formats.day.format(parseDay(bar.start))
      : `${formats.day.format(parseDay(bar.start))} – ${formats.day.format(parseDay(bar.end))}`;
  const describe = (bar: ActivityBar) => t('usageStats.activity.barLabel', { date: labelFor(bar), count: formats.integer.format(bar.steps) });
  const count = series.bars.length;
  const activeBar = active !== null && active < count ? series.bars[active] : null;
  const first = series.bars[0];
  const last = series.bars[count - 1];

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (count === 0) return;
    const current = active ?? count - 1;
    const next = event.key === 'ArrowLeft' ? Math.max(0, current - 1)
      : event.key === 'ArrowRight' ? Math.min(count - 1, current + 1)
        : event.key === 'Home' ? 0
          : event.key === 'End' ? count - 1
            : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
  };

  return (
    <Section title={title} caption={t(weekly ? 'usageStats.activity.captionWeekly' : 'usageStats.activity.captionDaily')}>
      <div dir="ltr" className="rounded-lg border border-edge bg-[var(--surface-elevated)] px-3 pb-2 pt-3">
        <div
          className="relative flex h-32 items-end gap-px rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]"
          role="group"
          tabIndex={0}
          aria-label={title}
          onKeyDown={handleKeyDown}
          onFocus={() => setActive((value) => value ?? (count > 0 ? count - 1 : null))}
          onBlur={() => setActive(null)}
          onPointerLeave={() => setActive(null)}
        >
          {series.bars.map((bar, index) => {
            const height = series.max > 0 ? Math.max(bar.steps > 0 ? 4 : 0, (bar.steps / series.max) * 100) : 0;
            const dimmed = activeBar !== null && index !== active;
            return (
              <div key={bar.start} className="flex h-full min-w-0 flex-1 items-end" onPointerEnter={() => setActive(index)}>
                <div
                  className={cn(
                    'w-full rounded-t-[2px] transition-opacity duration-100',
                    bar.steps > 0 ? 'bg-chart-1' : 'bg-edge',
                    dimmed && 'opacity-40',
                  )}
                  style={{ height: bar.steps > 0 ? `${height}%` : '1px' }}
                />
              </div>
            );
          })}
          {activeBar && active !== null ? (
            <div
              className="oc-glass-tooltip pointer-events-none absolute bottom-full z-10 mb-1.5 w-max max-w-56 rounded-xl border border-edge px-3 py-1.5 typography-meta text-[var(--surface-elevated-foreground)]"
              style={{
                left: `${((active + 0.5) / count) * 100}%`,
                transform: `translateX(${active < count / 3 ? '-15%' : active > (count * 2) / 3 ? '-85%' : '-50%'})`,
              }}
              aria-live="polite"
            >
              {describe(activeBar)}
            </div>
          ) : null}
        </div>
        {first && last ? (
          <div className="mt-1.5 flex justify-between gap-2 typography-micro text-muted-foreground">
            <span>{formats.day.format(parseDay(first.start))}</span>
            <span>{formats.day.format(parseDay(last.end))}</span>
          </div>
        ) : null}
      </div>
    </Section>
  );
}

function TokenComposition({ stats, formats }: { stats: UsageStats; formats: Formats }): React.ReactNode {
  const { t } = useI18n();
  const segments = tokenSegments(stats.tokens);
  if (stats.tokens.total <= 0) return null;
  return (
    <Section title={t('usageStats.tokens.title')}>
      <div className="flex flex-col gap-2.5 rounded-lg border border-edge bg-[var(--surface-elevated)] px-3 py-3">
        <div className="flex h-2.5 w-full overflow-hidden rounded-full" aria-hidden="true">
          {segments
            .filter((segment) => segment.value > 0)
            .map((segment) => (
              <div
                key={segment.key}
                className={cn('h-full', TOKEN_SEGMENT_CLASSES[segment.key])}
                style={{ width: `${(segment.value / stats.tokens.total) * 100}%` }}
              />
            ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {segments.map((segment) => (
            <div key={segment.key} className="flex items-center gap-1.5 whitespace-nowrap">
              <span className={cn('size-2 shrink-0 rounded-full', TOKEN_SEGMENT_CLASSES[segment.key])} aria-hidden="true" />
              <span className="typography-micro text-muted-foreground whitespace-nowrap">{t(TOKEN_SEGMENT_LABEL_KEYS[segment.key])}</span>
              <span className="ms-1.5 shrink-0 typography-micro tabular-nums text-foreground whitespace-nowrap">
                {t('usageStats.tokens.legendValue', {
                  value: formats.compact.format(segment.value),
                  share: formats.percent.format(segment.value / stats.tokens.total),
                })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

<<<<<<< HEAD
/** Averages that need the whole report: cache reuse, cost of a session, how
 * much of the output the model spent reasoning, and the report's latency,
 * speed and error rate. Rendered for every report, not only comparisons. */
function EfficiencyTiles({ stats, formats, isFullyUnpriced }: { stats: UsageStats; formats: Formats; isFullyUnpriced?: boolean }): React.ReactNode {
||||||| bc50ba56aa
/** Averages that need the whole report: cache reuse, cost of a session, and
 * how much of the output the model spent reasoning. */
function EfficiencyTiles({ stats, formats }: { stats: UsageStats; formats: Formats }): React.ReactNode {
=======
function EfficiencyTiles({ stats, formats }: { stats: UsageStats; formats: Formats }): React.ReactNode {
>>>>>>> upstream/main
  const { t } = useI18n();
  const hitRate = cacheHitRate(stats.tokens);
  const costPerSession = averagePer(stats.cost, stats.sessions);
  const perMillion = costPerMillionTokens(stats.cost, stats.tokens.total);
  const tokensPerSession = averagePer(stats.tokens.total, stats.sessions);
  const stepsPerSession = averagePer(stats.steps, stats.sessions);
  const reasoning = reasoningShare(stats.tokens);
  const ttft = stats.avgTtft ?? null;
  const tokensPerSecond = stats.avgTokensPerSecond ?? null;
  const errorRate = stats.errorRate ?? null;
  return (
    <Section title={t('usageStats.efficiency.title')}>
      <div className="grid grid-cols-2 gap-2 @xl:grid-cols-3">
        <StatTile label={t('usageStats.efficiency.cacheHitRate')} value={hitRate === null ? '—' : formats.percent.format(hitRate)} />
        <StatTile
          label={t('usageStats.efficiency.costPerSession')}
          value={isFullyUnpriced || costPerSession === null ? '—' : formats.cost.format(costPerSession)}
        />
        <StatTile
          label={t('usageStats.efficiency.costPerMillion')}
          value={isFullyUnpriced || perMillion === null ? '—' : formats.cost.format(perMillion)}
        />
        <StatTile
          label={t('usageStats.efficiency.tokensPerSession')}
          value={tokensPerSession === null ? '—' : formats.compact.format(tokensPerSession)}
        />
        <StatTile
          label={t('usageStats.efficiency.stepsPerSession')}
          value={stepsPerSession === null ? '—' : formats.decimal.format(stepsPerSession)}
        />
        <StatTile label={t('usageStats.efficiency.reasoningShare')} value={reasoning === null ? '—' : formats.percent.format(reasoning)} />
        <StatTile label={t('usageStats.providers.table.ttft')} value={ttft === null ? '—' : formats.milliseconds.format(Math.round(ttft))} />
        <StatTile
          label={t('usageStats.providers.table.tps')}
          value={tokensPerSecond === null ? '—' : `${formats.decimal.format(tokensPerSecond)} tok/s`}
        />
        <StatTile label={t('usageStats.providers.table.errorRate')} value={errorRate === null ? '—' : formats.percent.format(errorRate)} />
      </div>
    </Section>
  );
}

function formatDuration(ms: number, formats: Formats): string {
  if (ms < 1000) return formats.milliseconds.format(Math.round(ms));
  const seconds = ms / 1000;
  if (seconds < 60) return formats.seconds.format(seconds);
  return `${formats.minutes.format(Math.floor(seconds / 60))} ${formats.wholeSeconds.format(Math.round(seconds % 60))}`;
}

function ToolsSection({ state, formats }: { state: ToolsState; formats: Formats }): React.ReactNode {
  const { t } = useI18n();
  const tools = state.entry?.tools ?? null;
  if (!tools) {
    const loading = state.entry?.loading ?? false;
    const error = state.entry?.error ?? null;
    return (
      <Section title={t('usageStats.tools.title')} caption={t('usageStats.tools.caption')}>
        {error && !loading ? (
          <div className="flex flex-col items-start gap-2" role="alert">
            <p className="typography-micro text-foreground">{t('usageStats.tools.loadFailed')}</p>
            <p dir="auto" className="max-w-md break-words typography-micro text-muted-foreground">{error}</p>
            <Button type="button" variant="outline" size="sm" onClick={state.load}>
              {t('usageStats.error.retry')}
            </Button>
          </div>
        ) : (
          <div>
            <Button type="button" variant="outline" size="sm" onClick={state.load} disabled={loading} aria-busy={loading}>
              {loading ? <Icon name="loader-4" className="size-4 animate-spin" /> : null}
              {t('usageStats.tools.load')}
            </Button>
          </div>
        )}
      </Section>
    );
  }
  const successRate = toolSuccessRate(tools.totals);
<<<<<<< HEAD
  // Canonical detail rows are sorted by calls; keep the page light past a toolbox.
  const rows = tools.usage.filter((tool) => tool.calls > 0).slice(0, 8);
||||||| bc50ba56aa
  // OpenCode returns detail rows sorted by calls; keep the page light past a toolbox.
  const rows = tools.mode === 'detail' ? tools.usage.filter((tool) => tool.calls > 0).slice(0, 8) : [];
=======
  const rows = tools.mode === 'detail' ? tools.usage.filter((tool) => tool.calls > 0).slice(0, 8) : [];
>>>>>>> upstream/main
  return (
    <Section title={t('usageStats.tools.title')}>
      {tools.partial ? <PartialUsageNotice errors={tools.errors} /> : null}
      {state.entry?.error ? (
        <div role="alert" className="typography-micro text-muted-foreground">
          <p>{t('usageStats.tools.loadFailed')}</p>
          <p className="break-words">{state.entry.error}</p>
          <Button type="button" variant="outline" size="sm" onClick={state.load} disabled={state.entry.loading}>{t('usageStats.error.retry')}</Button>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2 @xl:grid-cols-4">
        <StatTile label={t('usageStats.tools.calls')} value={formats.integer.format(tools.totals.calls)} />
        <StatTile label={t('usageStats.tools.successRate')} value={successRate === null ? '—' : formats.percent.format(successRate)} />
        <StatTile label={t('usageStats.tools.failed')} value={formats.integer.format(tools.totals.failed)} />
        <StatTile label={t('usageStats.tools.unfinished')} value={formats.integer.format(tools.totals.unfinished)} />
      </div>
      {rows.length > 0 ? (
        <ul className="flex flex-col gap-2.5 rounded-lg border border-edge bg-[var(--surface-elevated)] px-3 py-3">
          {rows.map((tool) => (
            <li key={tool.name} className="flex min-w-0 flex-col gap-1">
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate font-mono typography-micro text-foreground" title={tool.name}>
                  {tool.name}
                </span>
                <span className="shrink-0 typography-micro tabular-nums text-muted-foreground">
                  {tool.durationP50 !== null
                    ? t('usageStats.tools.rowStats', {
                      count: formats.integer.format(tool.calls),
                      duration: formatDuration(tool.durationP50, formats),
                    })
                    : t('usageStats.tools.rowStatsNoDuration', { count: formats.integer.format(tool.calls) })}
                </span>
              </div>
              <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-edge" aria-hidden="true">
                {tool.succeeded > 0 ? (
                  <div className="h-full bg-status-success" style={{ width: `${(tool.succeeded / tool.calls) * 100}%` }} />
                ) : null}
                {tool.failed > 0 ? (
                  <div className="h-full bg-status-error" style={{ width: `${(tool.failed / tool.calls) * 100}%` }} />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

type ModelDimension = 'tokens' | 'cost' | 'steps';

const MODEL_DIMENSIONS: readonly ModelDimension[] = ['tokens', 'cost', 'steps'];

const MODEL_DIMENSION_LABEL_KEYS = {
  tokens: 'usageStats.models.byTokens',
  cost: 'usageStats.models.byCost',
  steps: 'usageStats.models.bySteps',
} as const satisfies Record<ModelDimension, I18nKey>;

function ModelUsage({ models, formats }: { models: UsageModel[]; formats: Formats }): React.ReactNode {
  const { t } = useI18n();
  const providers = useConfigStore((state) => state.providers);
  const [dimension, setDimension] = React.useState<ModelDimension>('tokens');
  const valueOf = React.useCallback(
    (model: UsageModel): number =>
    (dimension === 'tokens' ? model.tokens.total : dimension === 'cost' ? model.cost : model.steps),
    [dimension],
  );
  const ranked = React.useMemo(() => [...models].sort((a, b) => valueOf(b) - valueOf(a)), [models, valueOf]);
  const max = ranked.reduce((peak, model) => Math.max(peak, valueOf(model)), 0);

  return (
    <Section
      title={t('usageStats.models.title')}
      actions={
        models.length > 0 ? (
          <SettingsChipGroup
            value={dimension}
            onChange={setDimension}
            aria-label={t('usageStats.models.compareBy')}
            options={MODEL_DIMENSIONS.map((option) => ({ value: option, label: t(MODEL_DIMENSION_LABEL_KEYS[option]) }))}
          />
        ) : undefined
      }
    >
      {models.length === 0 ? (
        <p className="typography-micro text-muted-foreground">{t('usageStats.models.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {ranked.map((model) => {
            const provider = providers.find((entry) => entry.providerId === model.providerId);
            const providerName = provider?.name || model.providerId;
            const name = provider?.models.find((entry) => entry.modelId === model.modelId)?.name || model.modelId;
            const share = max > 0 ? (valueOf(model) / max) * 100 : 0;
            const costLabel = model.pricing === null ? '—' : formats.cost.format(model.cost);
            return (
              <li key={`${formatModelRef(model)}#${model.variant ?? ''}`} className="flex min-w-0 flex-col gap-1">
                <div className="flex min-w-0 items-center gap-2">
                  <ProviderLogo providerId={model.providerId} alt={providerName} className="size-4 shrink-0" />
                  <span className="flex min-w-0 flex-1 items-baseline gap-1.5 truncate" title={`${providerName} · ${formatModelRef(model)}`}>
                    <span className="truncate typography-ui-label text-foreground">{name}</span>
                    {model.variant ? <span className="shrink-0 typography-micro text-muted-foreground">{model.variant}</span> : null}
<<<<<<< HEAD
                    {/* Phones keep the row for the model name; the logo names the provider there. */}
                    <span className="hidden shrink-0 typography-micro text-muted-foreground @xl:inline">{providerName}</span>
||||||| bc50ba56aa
                    {/* Phones keep the row for the model name; the logo names the provider there. */}
                    <span className="hidden shrink-0 typography-micro text-muted-foreground sm:inline">{providerName}</span>
=======
                    <span className="hidden shrink-0 typography-micro text-muted-foreground sm:inline">{providerName}</span>
>>>>>>> upstream/main
                  </span>
                  <span className="shrink-0 typography-micro tabular-nums text-muted-foreground">
                    {dimension === 'steps'
                      ? `${formats.integer.format(model.steps)} · ${costLabel}`
                      : `${formats.compact.format(model.tokens.total)} · ${costLabel}`}
                  </span>
                </div>
                <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-edge" aria-hidden="true">
                  {dimension === 'tokens' ? (
                    <div className="flex h-full" style={{ width: `${share}%` }}>
                      {tokenSegments(model.tokens)
                        .filter((segment) => segment.value > 0)
                        .map((segment) => (
                          <div
                            key={segment.key}
                            className={cn('h-full', TOKEN_SEGMENT_CLASSES[segment.key])}
                            style={{ width: `${(segment.value / model.tokens.total) * 100}%` }}
                          />
                        ))}
                    </div>
                  ) : share > 0 ? (
                    <div className="h-full bg-chart-1" style={{ width: `${share}%` }} />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

type ProviderDimension = 'tokens' | 'cost' | 'steps' | 'ttft' | 'tps' | 'errorRate';
const PROVIDER_DIMENSIONS: readonly ProviderDimension[] = ['tokens', 'cost', 'steps', 'ttft', 'tps', 'errorRate'];
const PROVIDER_DIMENSION_LABEL_KEYS: Record<ProviderDimension, I18nKey> = {
  tokens: 'usageStats.providers.byTokens',
  cost: 'usageStats.providers.byCost',
  steps: 'usageStats.providers.bySteps',
  ttft: 'usageStats.providers.byTtft',
  tps: 'usageStats.providers.byTps',
  errorRate: 'usageStats.providers.byErrorRate',
};

function ProviderComparison({ providers, formats }: { providers: UsageProvider[]; formats: Formats }): React.ReactNode {
  const { t } = useI18n();
  const configuredProviders = useConfigStore((state) => state.providers);
  const setSelectedProvider = useUsageStatsStore((state) => state.setSelectedProvider);
  const [dimension, setDimension] = React.useState<ProviderDimension>('tokens');

  const valueOf = React.useCallback((p: UsageProvider): number => {
    switch (dimension) {
      case 'tokens': return p.tokens.total;
      case 'cost': return p.cost;
      case 'steps': return p.steps;
      case 'ttft': return p.avgTtft ?? 0;
      case 'tps': return p.avgTokensPerSecond ?? 0;
      case 'errorRate': return p.errorRate;
    }
  }, [dimension]);

  const ranked = React.useMemo(() => [...providers].sort((a, b) => valueOf(b) - valueOf(a)), [providers, valueOf]);
  const max = ranked.reduce((peak, p) => Math.max(peak, valueOf(p)), 0);

  return (
    <Section
      title={t('usageStats.providers.title')}
      actions={
        providers.length > 0 ? (
          <SettingsChipGroup
            value={dimension}
            onChange={setDimension}
            aria-label={t('usageStats.providers.compareBy')}
            options={PROVIDER_DIMENSIONS.map((option) => ({ value: option, label: t(PROVIDER_DIMENSION_LABEL_KEYS[option]) }))}
          />
        ) : undefined
      }
    >
      {/* Ranked comparison bars */}
      <ul className="flex flex-col gap-2.5 rounded-lg border border-edge bg-[var(--surface-elevated)] px-3 py-3">
        {ranked.map((p) => {
          const cfg = configuredProviders.find((entry) => entry.providerId === p.providerId);
          const name = cfg?.name || p.providerId;
          const share = max > 0 ? (valueOf(p) / max) * 100 : 0;
          const costLabel = p.pricing === null ? '—' : formats.cost.format(p.cost);
          return (
            <li key={p.providerId} className="flex min-w-0 flex-col gap-1 cursor-pointer group" onClick={() => setSelectedProvider(p.providerId)}>
              <div className="flex min-w-0 items-center gap-2">
                <ProviderLogo providerId={p.providerId} alt={name} className="size-4 shrink-0" />
                <span className="truncate typography-ui-label font-medium text-foreground group-hover:text-primary transition-colors">{name}</span>
                <span className="ms-auto shrink-0 typography-micro tabular-nums text-muted-foreground">
                  {dimension === 'tokens' && `${formats.compact.format(p.tokens.total)} · ${costLabel}`}
                  {dimension === 'cost' && costLabel}
                  {dimension === 'steps' && `${formats.integer.format(p.steps)} ${t('usageStats.models.bySteps')}`}
                  {dimension === 'ttft' && (p.avgTtft !== null ? `${Math.round(p.avgTtft)} ms` : '—')}
                  {dimension === 'tps' && (p.avgTokensPerSecond !== null ? `${formats.decimal.format(p.avgTokensPerSecond)} tok/s` : '—')}
                  {dimension === 'errorRate' && formats.percent.format(p.errorRate)}
                </span>
              </div>
              <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-edge" aria-hidden="true">
                <div className="h-full bg-primary" style={{ width: `${Math.max(2, share)}%` }} />
              </div>
            </li>
          );
        })}
      </ul>

      {/* Comparison table */}
      <div className="overflow-x-auto rounded-lg border border-edge bg-[var(--surface-elevated)]">
        <table className="w-full text-start typography-micro">
          <thead>
            <tr className="border-b border-edge text-muted-foreground">
              <th className="px-3 py-2 text-start font-medium">{t('usageStats.providers.table.provider')}</th>
              <th className="px-3 py-2 text-end font-medium">{t('usageStats.providers.table.tokens')}</th>
              <th className="px-3 py-2 text-end font-medium">{t('usageStats.providers.table.cost')}</th>
              <th className="px-3 py-2 text-end font-medium">{t('usageStats.providers.table.ttft')}</th>
              <th className="px-3 py-2 text-end font-medium">{t('usageStats.providers.table.tps')}</th>
              <th className="px-3 py-2 text-end font-medium">{t('usageStats.providers.table.errorRate')}</th>
              <th className="px-3 py-2 text-end font-medium">{t('usageStats.providers.table.requests')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {providers.map((p) => {
              const cfg = configuredProviders.find((entry) => entry.providerId === p.providerId);
              const name = cfg?.name || p.providerId;
              const costLabel = p.pricing === null ? '—' : formats.cost.format(p.cost);
              return (
                <tr
                  key={p.providerId}
                  className="hover:bg-interactive-hover/40 cursor-pointer transition-colors"
                  onClick={() => setSelectedProvider(p.providerId)}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <ProviderLogo providerId={p.providerId} alt={name} className="size-4 shrink-0" />
                      <span className="font-medium text-foreground">{name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-end tabular-nums text-foreground">{formats.compact.format(p.tokens.total)}</td>
                  <td className="px-3 py-2 text-end tabular-nums text-foreground">{costLabel}</td>
                  <td className="px-3 py-2 text-end tabular-nums text-muted-foreground">{p.avgTtft !== null ? `${Math.round(p.avgTtft)} ms` : '—'}</td>
                  <td className="px-3 py-2 text-end tabular-nums text-muted-foreground">{p.avgTokensPerSecond !== null ? `${formats.decimal.format(p.avgTokensPerSecond)}` : '—'}</td>
                  <td className="px-3 py-2 text-end tabular-nums text-muted-foreground">{formats.percent.format(p.errorRate)}</td>
                  <td className="px-3 py-2 text-end tabular-nums text-muted-foreground">{formats.integer.format(p.steps)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
