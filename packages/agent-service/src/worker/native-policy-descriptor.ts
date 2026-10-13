import { editInspect } from '@oh-my-pi/pi-natives';
import { parseArchivePathCandidates } from '@oh-my-pi/pi-utils/ar';
import { toPathList } from '@oh-my-pi/pi-tui/render/render-utils';
import { splitPathAndSel } from '@oh-my-pi/pi-tui/tools/read';
import { expandDelimitedPathEntries, normalizePathLikeInput, parseFindPattern, parseSearchPathPreferringLiteral, resolveReadPathAsync, resolveToCwd, splitDelimitedPathEntry, splitPathAndSelPreferringLiteral } from '@oh-my-pi/pi-coding-agent/tools/path-utils';
import { unwrapHashlineHeaderPath } from '@oh-my-pi/pi-coding-agent/tools/plan-mode-guard';
import { splitJsonQueryTarget } from '@oh-my-pi/pi-coding-agent/tools/read-json';
import { parseSqlitePathCandidates } from '@oh-my-pi/pi-coding-agent/tools/sqlite-reader';
import { splitVideoReadTarget } from '@oh-my-pi/pi-coding-agent/utils/video';
import { splitPdfImageReadPath } from '@oh-my-pi/pi-coding-agent/tools/read-pdf';
import { NativeOperationDescriptorSchema, type NativeOperationDescriptor, type NativePolicyContext } from '../native-policy-protocol.ts';
import type { WorkerPolicyRequest } from '../protocol.ts';

function localPath(raw: string, cwd: string): string {
  const value = normalizePathLikeInput(raw);
  // Remote/internal device ownership is not a filesystem capability.
  if (value.includes('://') || value.includes('\0')) throw new Error('Target requires a separate Host capability');
  return resolveToCwd(value, cwd);
}

async function fileTargets(raw: string, cwd: string, read: boolean): Promise<string[]> {
  const normalized = unwrapHashlineHeaderPath(normalizePathLikeInput(raw));
  const targets = new Set<string>();
  const parts = read ? await splitDelimitedPathEntry(normalized, cwd, { splitter: item => ({ basePath: splitPathAndSel(item).path }) }) ?? [normalized] : [normalized];
  for (const part of parts) {
    const split = read ? await splitPathAndSelPreferringLiteral(part, cwd) : { path: part };
    targets.add(localPath(split.path, cwd));
    if (read) targets.add(await resolveReadPathAsync(split.path, cwd));
    const json = splitJsonQueryTarget(split.path);
    if (json) targets.add(localPath(json.jsonPath, cwd));
    for (const candidate of parseArchivePathCandidates(split.path)) targets.add(localPath(candidate.archivePath, cwd));
    if (read) {
      const video = splitVideoReadTarget(part);
      if (video) targets.add(localPath(video.path, cwd));
      const pdf = splitPdfImageReadPath(part);
      if (pdf) targets.add(localPath(pdf.pdfPath, cwd));
    }
    for (const candidate of parseSqlitePathCandidates(split.path)) targets.add(localPath(candidate.sqlitePath, cwd));
  }
  return [...targets];
}

/** Execution-free first-party grammar inspection, only in the trusted Bun supervisor. */
export async function describeNativeOperation(cwd: string, request: WorkerPolicyRequest, context?: NativePolicyContext): Promise<NativeOperationDescriptor | undefined> {
  if (request.type === 'shell') return NativeOperationDescriptorSchema.parse({ toolName: 'bash', command: request.request.command, sourcePaths: [cwd], destinationPaths: [], fileOps: [] });
  if (request.type !== 'tool') return undefined;
  const { toolName, input } = request;
  const base = { toolName, sourcePaths: [] as string[], destinationPaths: [] as string[], fileOps: [], ...context };
  const { editMode: effectiveMode, ...effective } = base;
  if (toolName === 'edit') {
    if (!context) throw new Error('SDK effective edit mode is unavailable');
    const inspection = editInspect(context.editMode, JSON.stringify(input));
    const fileOps = inspection.fileOps.map(operation => ({ kind: operation.kind, path: localPath(operation.path, cwd), ...(operation.to === undefined ? {} : { to: localPath(operation.to, cwd) }) }));
    const sourcePaths = [...new Set([...inspection.paths.map(target => localPath(target, cwd)), ...fileOps.map(operation => operation.path)])];
    if (sourcePaths.length === 0) throw new Error('Native edit input has no targets');
    return NativeOperationDescriptorSchema.parse({ ...effective, effectiveMode, sourcePaths, destinationPaths: [...new Set([...sourcePaths, ...fileOps.flatMap(operation => operation.to === undefined ? [] : [operation.to])])], fileOps });
  }
  if (toolName === 'read' || toolName === 'write') {
    if (typeof input.path !== 'string') throw new Error('Native file path is missing');
    const targets = await fileTargets(input.path, cwd, toolName === 'read');
    return NativeOperationDescriptorSchema.parse({ ...effective, ...(toolName === 'read' ? { sourcePaths: targets } : { destinationPaths: targets }) });
  }
  if (toolName === 'grep' || toolName === 'glob') {
    const entries = await expandDelimitedPathEntries(toPathList(typeof input.path === 'string' ? input.path : '.'), cwd, toolName === 'glob' ? { splitter: parseFindPattern } : {});
    const sourcePaths: string[] = [];
    for (const entry of entries) {
      const split = toolName === 'grep' ? await splitPathAndSelPreferringLiteral(entry, cwd) : { path: entry };
      const parsed = toolName === 'glob' ? parseFindPattern(split.path) : await parseSearchPathPreferringLiteral(split.path, cwd);
      sourcePaths.push(localPath(parsed.basePath, cwd));
    }
    return NativeOperationDescriptorSchema.parse({ ...effective, sourcePaths });
  }
  if (toolName === 'bash') {
    if (typeof input.command !== 'string' || (input.cwd !== undefined && typeof input.cwd !== 'string')) throw new Error('Native command is invalid');
    return NativeOperationDescriptorSchema.parse({ ...effective, command: input.command, sourcePaths: [input.cwd === undefined ? cwd : localPath(input.cwd, cwd)] });
  }
  if (toolName === 'provider.use') {
    return NativeOperationDescriptorSchema.parse({ ...effective, providerId: input.providerId, modelId: input.modelId, endpoint: input.endpoint });
  }
  return undefined;
}
