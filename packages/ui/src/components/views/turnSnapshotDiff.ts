export type TurnSnapshotDiff = {
    file?: string;
    status?: string;
    before?: string;
    after?: string;
    patch?: string;
    additions?: number;
    deletions?: number;
    previousPath?: string;
};

export const statusToGitCode = (status?: string): string => {
    if (status === 'added') return 'A';
    if (status === 'deleted') return 'D';
    if (status === 'renamed') return 'R';
    return 'M';
};
