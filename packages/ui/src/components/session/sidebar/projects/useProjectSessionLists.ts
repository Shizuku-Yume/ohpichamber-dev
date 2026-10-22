import React from 'react';
import type { Session } from '@openchamber/agent-contract';

type Args = {
  ownership: SessionOwnershipIndex;
};

export type ProjectSessionLists = {
  getSessionsForProject: (projectId: string) => readonly Session[];
  getArchivedSessionsForProject: (projectId: string) => readonly Session[];
};

export const useProjectSessionLists = (args: Args): ProjectSessionLists => {
  const {
    ownership,
  } = args;

  const getSessionsForProject = React.useCallback(
    (projectId: string) => {
      return ownership.sessionsByProject.get(projectId) ?? [];
    },
    [ownership],
  );

  const getArchivedSessionsForProject = React.useCallback(
    (projectId: string) => {
      return ownership.archivedSessionsByProject.get(projectId) ?? [];
    },
    [ownership],
  );

  return {
    getSessionsForProject,
    getArchivedSessionsForProject,
  };
};
