import { describe, expect, it } from 'bun:test';
import { DisplayPathSchema, ProjectListSchema, ProjectSchema, WorkspaceListSchema, WorkspaceSchema } from './index.ts';

describe('strict project/workspace discovery contracts', () => {
  it('accepts public relative discovery records', () => {
    expect(ProjectSchema.parse({ projectId: 'project_1', name: 'Project', workspaceIds: ['workspace_1'], displayPath: 'src' })).toBeDefined();
    expect(WorkspaceSchema.parse({ workspaceId: 'workspace_1', projectId: 'project_1', name: 'Workspace', displayPath: 'packages/web' })).toBeDefined();
    expect(ProjectListSchema.parse({ items: [], errors: {} })).toEqual({ items: [], errors: {} });
    expect(WorkspaceListSchema.parse({ items: [], errors: {} })).toEqual({ items: [], errors: {} });
  });

  it('rejects absolute paths and private fields', () => {
    const project = { projectId: 'project_1', name: 'Project', workspaceIds: ['workspace_1'] };
    expect(ProjectSchema.safeParse({ ...project, displayPath: '/srv/private' }).success).toBe(false);
    expect(DisplayPathSchema.safeParse('C:\\private').success).toBe(false);
    expect(WorkspaceSchema.safeParse({ workspaceId: 'workspace_1', projectId: 'project_1', name: 'Workspace', cwd: '/srv/private' }).success).toBe(false);
    expect(WorkspaceListSchema.safeParse({ items: [], errors: [] }).success).toBe(false);
  });
});
