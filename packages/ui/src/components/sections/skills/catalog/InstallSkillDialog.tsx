import React from 'react';
import type { SkillRepositoryInstallRequest } from '@openchamber/agent-contract';
import { toast } from '@/components/ui';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n';
import { useSkillsCatalogStore, type SkillsCatalogItem } from '@/stores/useSkillsCatalogStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { InstallConflictsDialog, type SkillConflict, type ConflictDecision } from './InstallConflictsDialog';

type InstallInput = Omit<SkillRepositoryInstallRequest, 'expectedSourceRevision'>;
interface InstallSkillDialogProps { open: boolean; onOpenChange: (open: boolean) => void; items: SkillsCatalogItem[] }
export const InstallSkillDialog: React.FC<InstallSkillDialogProps> = ({ open, onOpenChange, items }) => {
  const { t } = useI18n();
  const installSkills = useSkillsCatalogStore(state => state.installSkills);
  const loadSource = useSkillsCatalogStore(state => state.loadSource);
  const isInstalling = useSkillsCatalogStore(state => state.isInstalling);
  const projects = useProjectsStore(state => state.projects);
  const activeProjectId = useProjectsStore(state => state.activeProjectId);
  const [scope, setScope] = React.useState<'workspace' | 'agent'>('agent');
  const [targetProjectId, setTargetProjectId] = React.useState<string | null>(null);
  const [conflicts, setConflicts] = React.useState<SkillConflict[]>([]);
  const [conflictsOpen, setConflictsOpen] = React.useState(false);
  const [baseRequest, setBaseRequest] = React.useState<{ input: InstallInput; directory: string } | null>(null);
  React.useEffect(() => {
    if (!open) return;
    setScope('agent'); setTargetProjectId(activeProjectId); setConflicts([]); setConflictsOpen(false); setBaseRequest(null);
  }, [open, activeProjectId]);
  const selectedProject = projects.find(project => project.id === targetProjectId)
    ?? projects.find(project => project.id === activeProjectId) ?? projects[0];
  const doInstall = async (input: InstallInput, directory: string) => {
    const result = await installSkills(input, { directory });
    if (!result.ok) {
      if (result.error.kind === 'conflicts') {
        setBaseRequest({ input, directory }); setConflicts(result.error.conflicts ?? []); setConflictsOpen(true);
      } else toast.error(result.error.message);
      return;
    }
    if (result.commit && (!result.commit.apply || !['applied', 'no-active-workers'].includes(result.commit.apply.status))) {
      toast.warning(t('settings.skills.page.status.sourceCommittedApplyFailed'));
    } else if (result.skipped.length) {
      toast.warning(t('settings.skills.catalog.installSkill.toast.skipped', { skills: result.skipped.map(entry => `${entry.skillName} (${entry.reason})`).join(', ') }));
    } else toast.success(t('settings.skills.catalog.installSkill.toast.installed'));
    onOpenChange(false);
    await Promise.all([...new Set(items.map(item => item.sourceId))].filter(Boolean).map(sourceId => loadSource(sourceId, { refresh: true })));
  };
  if (!items.length) return null;
  return <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{items.length === 1 ? t('settings.skills.catalog.installSkill.title') : t('settings.skills.catalog.installFromRepo.title')}</DialogTitle>
          <DialogDescription>{t('settings.skills.catalog.installFromRepo.selectedCount', { selected: items.length, total: items.length })}</DialogDescription>
        </DialogHeader>
        <div className="mt-2 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span>{t('settings.skills.catalog.installSkill.field.destination')}</span>
            <Select value={scope} onValueChange={value => { if (value === 'workspace' || value === 'agent') setScope(value); }}>
              <SelectTrigger className="w-fit"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="workspace">{t('settings.skills.sidebar.section.project')} (.omp/skills)</SelectItem>
                <SelectItem value="agent">{t('settings.skills.sidebar.section.user')} (skills)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span>{t('settings.skills.catalog.installSkill.field.project')}</span>
            <Select value={selectedProject?.id ?? ''} onValueChange={setTargetProjectId} disabled={projects.length < 2}>
              <SelectTrigger className="w-fit"><SelectValue placeholder={t('settings.skills.catalog.installSkill.field.chooseProjectPlaceholder')} /></SelectTrigger>
              <SelectContent>{projects.map(project => <SelectItem key={project.id} value={project.id}>{project.label || project.path}</SelectItem>)}</SelectContent>
            </Select>
            {!selectedProject && <span>{t('settings.skills.catalog.installSkill.field.noProjects')}</span>}
          </div>
          {!!items.flatMap(item => item.warnings ?? []).length && <div className="typography-micro text-[var(--status-warning)]">{items.flatMap(item => item.warnings ?? []).join(' · ')}</div>}
        </div>
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>{t('settings.common.actions.cancel')}</Button>
          <Button size="sm" disabled={isInstalling || !selectedProject || items.some(item => !item.installable)} onClick={() => {
            if (!selectedProject) return;
            void doInstall({ sourceId: items[0].sourceId, scope,
              selections: items.map(item => ({ skillDir: item.skillDir })), conflictPolicy: 'prompt' }, selectedProject.path);
          }}>{isInstalling ? t('settings.skills.catalog.installSkill.actions.installing') : t('settings.skills.catalog.installSkill.actions.install')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <InstallConflictsDialog open={conflictsOpen} onOpenChange={setConflictsOpen} conflicts={conflicts} onConfirm={(decisions: { [skillName: string]: ConflictDecision }) => {
      if (!baseRequest) return;
      void doInstall({ ...baseRequest.input, conflictDecisions: Object.entries(decisions).map(([skillName, decision]) => ({ skillName, decision })) }, baseRequest.directory);
      setConflictsOpen(false);
    }} />
  </>;
};
