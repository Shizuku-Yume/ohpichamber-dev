import React from 'react';
import type { SkillRepositoryInstallRequest } from '@openchamber/agent-contract';
import { toast } from '@/components/ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { useSkillsCatalogStore, type SkillsCatalogItem } from '@/stores/useSkillsCatalogStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { InstallConflictsDialog, type SkillConflict, type ConflictDecision } from './InstallConflictsDialog';

type InstallInput = Omit<SkillRepositoryInstallRequest, 'expectedSourceRevision'>;

interface InstallSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: SkillsCatalogItem[];
}

export const InstallSkillDialog: React.FC<InstallSkillDialogProps> = ({ open, onOpenChange, items }) => {
  const { t } = useI18n();
  const installSkills = useSkillsCatalogStore(state => state.installSkills);
  const loadSource = useSkillsCatalogStore(state => state.loadSource);
  const isInstalling = useSkillsCatalogStore(state => state.isInstalling);
  const projects = useProjectsStore(state => state.projects);
  const activeProjectId = useProjectsStore(state => state.activeProjectId);
  const settingsDirectory = useSettingsDirectory();
  const [scope, setScope] = React.useState<'workspace' | 'agent'>('agent');
  const [targetProjectId, setTargetProjectId] = React.useState<string | null>(null);
  const [conflicts, setConflicts] = React.useState<SkillConflict[]>([]);
  const [conflictsOpen, setConflictsOpen] = React.useState(false);
  const [baseRequest, setBaseRequest] = React.useState<{ input: InstallInput; directory: string } | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setScope('agent');
    setTargetProjectId(activeProjectId);
    setConflicts([]);
    setConflictsOpen(false);
    setBaseRequest(null);
  }, [open, activeProjectId]);

  const resolvedTargetProjectId = React.useMemo(() => {
    if (projects.length === 0) return null;
    if (targetProjectId && projects.some(project => project.id === targetProjectId)) return targetProjectId;
    if (activeProjectId && projects.some(project => project.id === activeProjectId)) return activeProjectId;
    return projects[0]?.id ?? null;
  }, [activeProjectId, projects, targetProjectId]);

  const selectedProject = projects.find(project => project.id === resolvedTargetProjectId) ?? null;
  // The native install call always resolves one workspace; `workspace` scope
  // writes into the chosen project while `agent` scope writes the global root.
  const directory = scope === 'workspace' ? selectedProject?.path ?? null : settingsDirectory;

  const doInstall = async (input: InstallInput, targetDirectory: string) => {
    const result = await installSkills(input, { directory: targetDirectory });
    if (!result.ok) {
      if (result.error.kind === 'conflicts') {
        setBaseRequest({ input, directory: targetDirectory });
        setConflicts(result.error.conflicts ?? []);
        setConflictsOpen(true);
        return;
      }
      if (result.error.kind === 'authRequired') {
        toast.error(result.error.message || t('settings.skills.catalog.installSkill.toast.authRequired'));
        return;
      }
      toast.error(result.error.message || t('settings.skills.catalog.installSkill.toast.installFailed'));
      return;
    }

    if (result.commit && (!result.commit.apply || !['applied', 'no-active-workers'].includes(result.commit.apply.status))) {
      toast.warning(t('settings.skills.page.status.sourceCommittedApplyFailed'));
    } else if (result.skipped.length > 0) {
      toast.warning(t('settings.skills.catalog.installSkill.toast.skipped', {
        skills: result.skipped.map(entry => `${entry.skillName} (${entry.reason})`).join(', '),
      }));
    } else {
      toast.success(t('settings.skills.catalog.installSkill.toast.installed'));
    }
    onOpenChange(false);
    await Promise.all([...new Set(items.map(item => item.sourceId))].filter(Boolean).map(sourceId => loadSource(sourceId, { refresh: true })));
  };

  if (items.length === 0) return null;

  const canInstall = Boolean(directory)
    && !isInstalling
    && items.every(item => item.installable);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {items.length === 1 ? t('settings.skills.catalog.installSkill.title') : t('settings.skills.catalog.installFromRepo.title')}
            </DialogTitle>
            <DialogDescription>
              {items.length === 1 ? (
                <>
                  {t('settings.skills.catalog.installSkill.descriptionPrefix')}
                  {' '}
                  <span className="font-semibold text-foreground">{items[0].skillName}</span>
                </>
              ) : t('settings.skills.catalog.installFromRepo.selectedCount', { selected: items.length, total: items.length })}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="typography-ui-label text-foreground">{t('settings.skills.catalog.installSkill.field.destination')}</span>
              <Select
                value={scope}
                onValueChange={value => {
                  if (value === 'workspace' || value === 'agent') setScope(value);
                }}
              >
                <SelectTrigger className="w-fit gap-1.5">
                  {scope === 'agent'
                    ? <Icon name="user-3" className="h-3.5 w-3.5" />
                    : <Icon name="folder" className="h-3.5 w-3.5" />}
                  <span>{scope === 'agent' ? t('settings.common.scope.global') : t('settings.common.scope.project')}</span>
                </SelectTrigger>
                <SelectContent align="start" portalToBody>
                  <SelectItem value="agent" className="pr-2 [&>span:first-child]:hidden">
                    <div className="flex items-center gap-2">
                      <Icon name="user-3" className="h-3.5 w-3.5" />
                      <span>{t('settings.common.scope.global')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="workspace" className="pr-2 [&>span:first-child]:hidden">
                    <div className="flex items-center gap-2">
                      <Icon name="folder" className="h-3.5 w-3.5" />
                      <span>{t('settings.common.scope.project')}</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {scope === 'workspace' ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="typography-ui-label text-foreground">{t('settings.skills.catalog.installSkill.field.project')}</span>
                {projects.length === 0 ? (
                  <span className="typography-meta text-muted-foreground">{t('settings.skills.catalog.installSkill.field.noProjects')}</span>
                ) : (
                  <Select
                    value={resolvedTargetProjectId ?? ''}
                    onValueChange={value => setTargetProjectId(value)}
                    disabled={projects.length === 1}
                  >
                    <SelectTrigger className="w-fit">
                      <SelectValue placeholder={t('settings.skills.catalog.installSkill.field.chooseProjectPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent align="start" portalToBody>
                      {projects.map(project => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.label || project.path}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ) : null}

            {items.flatMap(item => item.warnings ?? []).length ? (
              <div className="typography-micro text-[var(--status-warning)] bg-[var(--status-warning)]/10 px-2 py-1.5 rounded">
                {items.flatMap(item => item.warnings ?? []).join(' · ')}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('settings.common.actions.cancel')}
            </Button>
            <Button
              size="sm"
              disabled={!canInstall}
              onClick={() => {
                if (!directory) return;
                void doInstall({
                  sourceId: items[0].sourceId,
                  scope,
                  selections: items.map(item => ({ skillDir: item.skillDir })),
                  conflictPolicy: 'prompt',
                }, directory);
              }}
            >
              {isInstalling ? t('settings.skills.catalog.installSkill.actions.installing') : t('settings.skills.catalog.installSkill.actions.install')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InstallConflictsDialog
        open={conflictsOpen}
        onOpenChange={setConflictsOpen}
        conflicts={conflicts}
        onConfirm={(decisions: { [skillName: string]: ConflictDecision }) => {
          if (!baseRequest) return;
          void doInstall({
            ...baseRequest.input,
            conflictDecisions: Object.entries(decisions).map(([skillName, decision]) => ({ skillName, decision })),
          }, baseRequest.directory);
          setConflictsOpen(false);
        }}
      />
    </>
  );
};
