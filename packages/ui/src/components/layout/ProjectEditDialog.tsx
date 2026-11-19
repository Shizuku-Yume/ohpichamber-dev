import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { ProjectSettingsPanel } from '@/components/sections/projects/ProjectSettingsPanel';
import type { ProjectIdentitySaveData } from '@/components/sections/projects/useProjectIdentityForm';
import type { ProjectEntry } from '@/lib/api/types';

interface ProjectEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectEntry | null;
  onSave: (data: ProjectIdentitySaveData) => void | Promise<void>;
}

export const ProjectEditDialog: React.FC<ProjectEditDialogProps> = ({
  open,
  onOpenChange,
  project,
  onSave,
}) => {
<<<<<<< HEAD
||||||| bc50ba56aa
  const setWorktreesPageProjectId = useUIStore((state) => state.setWorktreesPageProjectId);
  // Every opening starts on the first tab.
  const [tab, setTab] = React.useState<ProjectSettingsTab>('general');
  React.useEffect(() => {
    if (open) setTab('general');
  }, [open]);

  const projectId = project?.id ?? null;
  const handleOpenWorktrees = React.useMemo(() => {
    if (!projectId) return undefined;
    return () => {
      onOpenChange(false);
      setWorktreesPageProjectId(projectId);
    };
  }, [onOpenChange, projectId, setWorktreesPageProjectId]);

=======
  const setWorktreesPageProjectId = useUIStore((state) => state.setWorktreesPageProjectId);
  const [tab, setTab] = React.useState<ProjectSettingsTab>('general');
  React.useEffect(() => {
    if (open) setTab('general');
  }, [open]);

  const projectId = project?.id ?? null;
  const handleOpenWorktrees = React.useMemo(() => {
    if (!projectId) return undefined;
    return () => {
      onOpenChange(false);
      setWorktreesPageProjectId(projectId);
    };
  }, [onOpenChange, projectId, setWorktreesPageProjectId]);

>>>>>>> upstream/main
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-2xl gap-0 overflow-hidden p-0">
        <ScrollableOverlay outerClassName="max-h-[min(90vh,48rem)]" className="w-full bg-transparent">
          <div className="w-full p-3 sm:p-6 sm:pt-8">
            {open && project ? (
              <ProjectSettingsPanel project={project} onIdentitySave={onSave} showWorktrees={false} />
            ) : null}
          </div>
        </ScrollableOverlay>
      </DialogContent>
    </Dialog>
  );
};
