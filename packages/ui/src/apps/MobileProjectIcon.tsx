import React from 'react';
import { RiFolder6Line } from '@remixicon/react';

import { Icon } from '@/components/icon/Icon';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { PROJECT_ICON_MAP, ProjectIconImage, resolveProjectColor } from '@/lib/projectMeta';
import { cn } from '@/lib/utils';

/** The project fields the icon needs — a structural subset of the sheet's
    ProjectMeta, so both the sheet and the timeline list can pass their own
    project objects without sharing a type. */
export type MobileProjectIconProject = {
  id: string;
  icon?: string | null;
  color?: string | null;
  iconImage?: { mime: string; updatedAt: number; source: 'custom' | 'auto' } | null;
  iconBackground?: string | null;
};

export const MobileProjectIcon: React.FC<{
  project: MobileProjectIconProject;
  /** xs sits inside a 16px text line, sm in a small row, md in a header's 32px slot. */
  size?: 'xs' | 'sm' | 'md';
}> = ({ project, size = 'md' }) => {
  const { currentTheme } = useThemeSystem();

  const ProjectIcon = project.icon ? PROJECT_ICON_MAP[project.icon] : null;
  // Hex colours are what projects take now; a legacy theme key keeps painting
  // with its variable, and both resolve through the one owner.
  const iconColor = resolveProjectColor(project.color);

  if (size === 'xs') {
    const fallbackIcon = ProjectIcon ? (
      <Icon name={ProjectIcon} className="size-3.5" style={iconColor ? { color: iconColor } : undefined} />
    ) : (
      <RiFolder6Line className="size-3.5" style={iconColor ? { color: iconColor } : undefined} />
    );
    const image = project.iconImage ? (
      <ProjectIconImage
        project={{ id: project.id, iconImage: project.iconImage ?? null }}
        options={{
          themeVariant: currentTheme.metadata.variant,
          iconColor: currentTheme.colors.surface.foreground,
        }}
        className="size-full object-contain"
        fallback={fallbackIcon}
      />
    ) : null;
    // The colour only fills a tile behind an image; a symbol glyph already
    // carries the colour, so painting it behind the glyph would fill a square.
    const imageBackground = project.iconImage && project.iconBackground
      ? { backgroundColor: project.iconBackground }
      : undefined;
    return (
      <span
        className="flex size-3.5 shrink-0 items-center justify-center overflow-hidden rounded-[3px] text-muted-foreground"
        style={imageBackground}
      >
        {image ?? fallbackIcon}
      </span>
    );
  }

  const containerClasses = size === 'sm' ? 'size-6 rounded-md' : 'size-8 rounded-lg';
  const innerClasses = size === 'sm' ? 'size-3.5' : 'size-4';
  const fallbackIcon = ProjectIcon ? (
    <Icon name={ProjectIcon} className={innerClasses} style={iconColor ? { color: iconColor } : undefined} />
  ) : (
    <RiFolder6Line className={innerClasses} style={iconColor ? { color: iconColor } : undefined} />
  );

  return (
    <span
<<<<<<< HEAD
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden text-muted-foreground',
        // The small variant sits inline in a text line and needs no tile.
        size === 'md' && 'bg-[var(--surface-muted)]',
        containerClasses,
      )}
      style={project.iconBackground ? { backgroundColor: project.iconBackground } : undefined}
=======
      className="flex size-3.5 shrink-0 items-center justify-center overflow-hidden rounded-[3px] text-muted-foreground"
      style={image ? imageBackground : undefined}
>>>>>>> bc50ba56a
    >
      {project.iconImage ? (
        <ProjectIconImage
          project={{ id: project.id, iconImage: project.iconImage ?? null }}
          options={{
            themeVariant: currentTheme.metadata.variant,
            iconColor: currentTheme.colors.surface.foreground,
          }}
          className="size-full object-contain"
          fallback={fallbackIcon}
        />
      ) : fallbackIcon}
    </span>
  );
};
