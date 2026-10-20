import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import * as C from '@openchamber/agent-contract';
import { CanonicalClient } from './canonicalClient';
import { configureRuntimeUrlResolver, getRuntimeUrlResolver, setRuntimeUrlResolver, type RuntimeUrlResolver } from '../lib/runtime-url';

const workspaceId = 'workspace_resource';
const client = new CanonicalClient();
let server: Server;
let previousResolver: RuntimeUrlResolver;
let handler: (request: IncomingMessage, response: ServerResponse) => void;
let calls: string[];
const json = (response: ServerResponse, payload: unknown, status = 200) => {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(payload));
};

beforeEach(async () => {
  calls = [];
  handler = (_request, response) => json(response, {} , 500);
  server = createServer((request, response) => {
    calls.push(`${request.method} ${request.url}`);
    handler(request, response);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  previousResolver = getRuntimeUrlResolver();
  const address = server.address() as AddressInfo;
  configureRuntimeUrlResolver({ apiBaseUrl: `http://127.0.0.1:${address.port}` });
});

afterEach(async () => {
  setRuntimeUrlResolver(previousResolver);
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

describe('CanonicalClient native file resources', () => {
  test('requires exact catalog CAS revisions for command and prompt-template mutations', async () => {
    const commandInput: C.CommandCreateRequest = { expectedRevision: '0', name: 'review', scope: 'workspace', content: 'Review' };
    handler = (_request, response) => json(response, { workspaceId, revision: '2', commands: [] });
    await expect(client.fileResources.createCommand(workspaceId, commandInput)).rejects.toThrow();

    handler = (_request, response) => json(response, { workspaceId, revision: '1', commands: [] });
    await expect(client.fileResources.createCommand(workspaceId, commandInput)).resolves.toMatchObject({ revision: '1' });

    const templateInput: C.PromptTemplateCreateRequest = { expectedRevision: '1', name: 'plan', scope: 'agent', content: 'Plan' };
    handler = (_request, response) => json(response, { workspaceId: 'other_workspace', revision: '2', templates: [] });
    await expect(client.fileResources.createPromptTemplate(workspaceId, templateInput)).rejects.toThrow();

    handler = (_request, response) => json(response, { workspaceId, revision: '2', templates: [] });
    await expect(client.fileResources.createPromptTemplate(workspaceId, templateInput)).resolves.toMatchObject({ revision: '2' });
  });

  test('reads encoded authored skill files and validates mutation source identity', async () => {
    const filePath = 'assets/check list.md';
    const skillId = 'quality/review';
    const read: C.SkillFileRead = { workspaceId, skillId, scope: 'workspace', sourceRevision: '4', filePath, content: '# Checklist' };
    handler = (_request, response) => json(response, read);
    await expect(client.fileResources.readSkillFile(workspaceId, skillId, filePath, 'workspace')).resolves.toEqual(read);
    expect(calls[0]).toContain('/skills/files/quality%2Freview/assets/check%20list.md?scope=workspace');

    const input: C.SkillFileWriteRequest = { expectedSourceRevision: '4', scope: 'workspace', content: '# Updated' };
    const committed: C.SkillInstallResult = { scope: { kind: 'workspace', workspaceId }, sourceRevision: '6', persistence: 'committed', apply: null };
    handler = (_request, response) => json(response, committed);
    await expect(client.fileResources.writeSkillFile(workspaceId, skillId, 'SKILL.md', input)).rejects.toThrow();

    handler = (_request, response) => json(response, { ...committed, sourceRevision: '5' });
    await expect(client.fileResources.writeSkillFile(workspaceId, skillId, 'SKILL.md', input)).resolves.toMatchObject({ sourceRevision: '5' });
  });
});
