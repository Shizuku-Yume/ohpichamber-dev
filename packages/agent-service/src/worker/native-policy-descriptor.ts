import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { editInspect } from '@oh-my-pi/pi-natives';
import { parseArchivePathCandidates } from '@oh-my-pi/pi-utils/ar';
import { toPathList } from '@oh-my-pi/pi-tui/render/render-utils';
import { splitPathAndSel } from '@oh-my-pi/pi-tui/tools/read';
import { expandDelimitedPathEntries, normalizePathLikeInput, parseFindPattern, parseSearchPathPreferringLiteral, resolveReadPathAsync, resolveToCwd, splitDelimitedPathEntry, splitMixedUrlPathList, splitPathAndSelPreferringLiteral } from '@oh-my-pi/pi-coding-agent/tools/path-utils';
import { unwrapHashlineHeaderPath } from '@oh-my-pi/pi-coding-agent/tools/hashline-header-path';
import { splitJsonQueryTarget } from '@oh-my-pi/pi-coding-agent/tools/read-json';
import { parseSqlitePathCandidates } from '@oh-my-pi/pi-coding-agent/tools/sqlite-reader';
import { splitVideoReadTarget } from '@oh-my-pi/pi-coding-agent/utils/video';
import { splitPdfImageReadPath } from '@oh-my-pi/pi-coding-agent/tools/read-pdf';
import { InternalUrlRouter } from '@oh-my-pi/pi-coding-agent/internal-urls';
import { NativeOperationDescriptorSchema, OMP_INTERNAL_URL_SCHEMES, type NativeOperationDescriptor, type NativePolicyContext } from '../native-policy-protocol.ts';
import type { WorkerPolicyRequest } from '../protocol.ts';

const OMP_INTERNAL_URL_SCHEME_SET: Record<string, true> = Object.fromEntries(OMP_INTERNAL_URL_SCHEMES.map(scheme => [scheme, true]));
const URL_SCHEME_PREFIX = /^([A-Za-z][A-Za-z0-9+.-]*):\/\//;

/**
 * The normalized URL only when OMP itself would dispatch it to one of the
 * allowlisted internal schemes. OMP's router owns aliases and selectors; the
 * Host neither parses nor resolves the target.
 */
function ompInternalUrl(value: string): string | null {
 const router = InternalUrlRouter.instance();
 const normalized = router.normalize(value);
 const match = URL_SCHEME_PREFIX.exec(normalized);
 return match !== null && OMP_INTERNAL_URL_SCHEME_SET[match[1]!.toLowerCase()] === true && router.canHandle(normalized)
  ? normalized : null;
}

/**
 * A write only ever reaches OMP's `local://` session artifact sandbox, where
 * Plan mode drafts its plan file. Every other scheme stays a read source or a
 * device transport, so a write to it is refused before any Host capability is
 * asked for.
 */
function ompWritableUrl(value: string): string | null {
 const normalized = ompInternalUrl(value);
 if (normalized === null) return null;
 return URL_SCHEME_PREFIX.exec(normalized)?.[1]?.toLowerCase() === 'local' ? normalized : null;
}

function requireNoNul(raw: string): void {
 if (raw.includes('\0')) throw new Error('Native target contains an invalid byte');
}

function localPath(raw: string, cwd: string): string {
 requireNoNul(raw);
 const value = normalizePathLikeInput(raw);
 // Remote/internal device ownership is not a filesystem capability.
 if (value.includes('://')) throw new Error('Target requires a separate Host capability');
 return resolveToCwd(value, cwd);
}
function parseLspPath(raw: string, cwd: string): string {
 requireNoNul(raw);
 let targetPath = raw.trim();
 if (targetPath.startsWith('file://')) {
  try {
   targetPath = fileURLToPath(targetPath);
  } catch {
   throw new Error('Invalid file URL in LSP request');
  }
 }
 return localPath(targetPath, cwd);
}

function resolveLspMethod(action: string, input: Record<string, unknown>): string {
 switch (action) {
  case 'hover': return 'textDocument/hover';
  case 'definition': return 'textDocument/definition';
  case 'type_definition': return 'textDocument/typeDefinition';
  case 'implementation': return 'textDocument/implementation';
  case 'references': return 'textDocument/references';
  case 'diagnostics': return typeof input.file === 'string' && input.file.trim() !== '*' ? 'textDocument/diagnostic' : 'workspace/diagnostic';
  case 'symbols': return typeof input.file === 'string' && input.file.trim() !== '*' ? 'textDocument/documentSymbol' : 'workspace/symbol';
  case 'status': return 'status';
  case 'capabilities': return 'capabilities';
  case 'code_actions': return input.apply === true ? 'codeAction/resolve' : 'textDocument/codeAction';
  case 'rename': return 'textDocument/rename';
  case 'rename_file': return 'workspace/renameFile';
  case 'reload': return 'workspace/reload';
  case 'request': return typeof input.query === 'string' && input.query.trim().length > 0 ? input.query.trim() : 'request';
  default: return action;
 }
}


async function fileTargets(raw: string, cwd: string, read: boolean): Promise<{ targets: string[]; internalUrls: string[] }> {
 requireNoNul(raw);
 const normalized = unwrapHashlineHeaderPath(normalizePathLikeInput(raw));
 const targets = new Set<string>();
 const internalUrls: string[] = [];
 let parts = read ? await splitDelimitedPathEntry(normalized, cwd, { splitter: item => ({ basePath: splitPathAndSel(item).path }) }) ?? [normalized] : [normalized];
 if (read && parts.length === 1) parts = await splitMixedUrlPathList(parts[0]!, cwd, part => ompInternalUrl(part) !== null) ?? parts;
 for (const part of parts) {
  // OMP owns the URL grammar, including selectors; the Host neither peels nor
  // resolves these targets and only admits the allowlisted scheme.
  const internal = read ? ompInternalUrl(part) : ompWritableUrl(part);
  if (internal !== null) {
   internalUrls.push(internal);
   continue;
  }
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
 return { targets: [...targets], internalUrls };
}

/** Execution-free first-party grammar inspection, only in the trusted Bun supervisor. */
export async function describeNativeOperation(cwd: string, request: WorkerPolicyRequest, context?: NativePolicyContext): Promise<NativeOperationDescriptor | undefined> {
 if (request.type === 'shell') return NativeOperationDescriptorSchema.parse({ toolName: 'bash', command: request.request.command, sourcePaths: [cwd], destinationPaths: [], fileOps: [] });
 if (request.type !== 'tool') return undefined;
 const { toolName, input } = request;
 const sourcePaths: string[] = [];
 const destinationPaths: string[] = [];
 const base = { toolName, sourcePaths, destinationPaths, fileOps: [], ...context };
 const { editMode: effectiveMode, ...effective } = base;
 if (toolName === 'edit') {
  if (!context) throw new Error('SDK effective edit mode is unavailable');
  const inspection = editInspect(context.editMode, JSON.stringify(input));
  const fileOps = inspection.fileOps.map(operation => {
   const fileOp: NativeOperationDescriptor['fileOps'][number] = { kind: operation.kind, path: localPath(operation.path, cwd) };
   if (operation.to !== undefined) fileOp.to = localPath(operation.to, cwd);
   return fileOp;
  });
  const sourcePaths = [...new Set([...inspection.paths.map(target => localPath(target, cwd)), ...fileOps.map(operation => operation.path)])];
  if (sourcePaths.length === 0) throw new Error('Native edit input has no targets');
  return NativeOperationDescriptorSchema.parse({ ...effective, effectiveMode, sourcePaths, destinationPaths: [...new Set([...sourcePaths, ...fileOps.flatMap(operation => operation.to === undefined ? [] : [operation.to])])], fileOps });
 }
 if (toolName === 'read' || toolName === 'write') {
  const path = z.string().safeParse(input.path);
  if (!path.success) throw new Error('Native file path is missing');
  const { targets, internalUrls } = await fileTargets(path.data, cwd, toolName === 'read');
  if (toolName === 'write') {
   const descriptor = { ...effective, destinationPaths: targets };
   return NativeOperationDescriptorSchema.parse(internalUrls.length > 0 ? { ...descriptor, internalWriteUrls: internalUrls } : descriptor);
  }
  const descriptor = { ...effective, sourcePaths: targets };
  return NativeOperationDescriptorSchema.parse(internalUrls.length > 0 ? { ...descriptor, internalReadUrls: internalUrls } : descriptor);
 }
 if (toolName === 'grep' || toolName === 'glob') {
  const path = z.string().safeParse(input.path);
  const entries = await expandDelimitedPathEntries(toPathList(path.success ? path.data : '.'), cwd, toolName === 'glob' ? { splitter: parseFindPattern } : {});
  const sourcePaths: string[] = [];
  for (const entry of entries) {
   const split = toolName === 'grep' ? await splitPathAndSelPreferringLiteral(entry, cwd) : { path: entry };
   const parsed = toolName === 'glob' ? parseFindPattern(split.path) : await parseSearchPathPreferringLiteral(split.path, cwd);
   sourcePaths.push(localPath(parsed.basePath, cwd));
  }
  return NativeOperationDescriptorSchema.parse({ ...effective, sourcePaths });
 }
 if (toolName === 'bash') {
  const command = z.object({ command: z.string(), cwd: z.string().optional() }).safeParse(input);
  if (!command.success) throw new Error('Native command is invalid');
  return NativeOperationDescriptorSchema.parse({ ...effective, command: command.data.command, sourcePaths: [command.data.cwd === undefined ? cwd : localPath(command.data.cwd, cwd)] });
 }
 if (toolName === 'provider.use') {
  return NativeOperationDescriptorSchema.parse({ ...effective, providerId: input.providerId, modelId: input.modelId, endpoint: input.endpoint, purpose: input.purpose });
 }
 if (toolName === 'lsp') {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new Error('Native LSP input is invalid');
  const rawAction = input.action;
  if (typeof rawAction !== 'string' || rawAction.trim().length === 0) {
   throw new Error('Native LSP action is missing');
  }
  const action = rawAction.trim();
  const lspMethod = resolveLspMethod(action, input);

  if (action === 'status') {
   return NativeOperationDescriptorSchema.parse({
    ...effective,
    lspAction: action,
    lspMethod,
    sourcePaths: [cwd],
   });
  }

  if (action === 'capabilities') {
   const file = typeof input.file === 'string' ? input.file.trim() : undefined;
   const target = file && file !== '*' ? parseLspPath(file, cwd) : cwd;
   return NativeOperationDescriptorSchema.parse({
    ...effective,
    lspAction: action,
    lspMethod,
    sourcePaths: [target],
   });
  }

  if (action === 'diagnostics') {
   const file = typeof input.file === 'string' ? input.file.trim() : undefined;
   if (!file || file === '*') {
    return NativeOperationDescriptorSchema.parse({
     ...effective,
     lspAction: action,
     lspMethod,
     sourcePaths: [cwd],
    });
   }
   return NativeOperationDescriptorSchema.parse({
    ...effective,
    lspAction: action,
    lspMethod,
    sourcePaths: [parseLspPath(file, cwd)],
   });
  }

  if (action === 'symbols') {
   const file = typeof input.file === 'string' ? input.file.trim() : undefined;
   if (!file || file === '*') {
    return NativeOperationDescriptorSchema.parse({
     ...effective,
     lspAction: action,
     lspMethod,
     sourcePaths: [cwd],
    });
   }
   return NativeOperationDescriptorSchema.parse({
    ...effective,
    lspAction: action,
    lspMethod,
    sourcePaths: [parseLspPath(file, cwd)],
   });
  }

  if (['hover', 'definition', 'type_definition', 'implementation', 'references'].includes(action)) {
   if (typeof input.file !== 'string' || input.file.trim().length === 0 || input.file.trim() === '*') {
    throw new Error(`Native LSP ${action} requires a valid file target`);
   }
   return NativeOperationDescriptorSchema.parse({
    ...effective,
    lspAction: action,
    lspMethod,
    sourcePaths: [parseLspPath(input.file, cwd)],
   });
  }

  if (action === 'code_actions') {
   if (typeof input.file !== 'string' || input.file.trim().length === 0 || input.file.trim() === '*') {
    throw new Error('Native LSP code_actions requires a valid file target');
   }
   const target = parseLspPath(input.file, cwd);
   if (input.apply === true) {
    return NativeOperationDescriptorSchema.parse({
     ...effective,
     lspAction: action,
     lspMethod,
     sourcePaths: [target],
     destinationPaths: [target],
    });
   }
   return NativeOperationDescriptorSchema.parse({
    ...effective,
    lspAction: action,
    lspMethod,
    sourcePaths: [target],
   });
  }

  if (action === 'rename') {
   if (typeof input.file !== 'string' || input.file.trim().length === 0 || input.file.trim() === '*') {
    throw new Error('Native LSP rename requires a valid file target');
   }
   if (typeof input.new_name !== 'string' || input.new_name.trim().length === 0) {
    throw new Error('Native LSP rename requires a new name');
   }
   const target = parseLspPath(input.file, cwd);
   return NativeOperationDescriptorSchema.parse({
    ...effective,
    lspAction: action,
    lspMethod,
    sourcePaths: [target],
    destinationPaths: [target],
   });
  }

  if (action === 'rename_file') {
   if (typeof input.file !== 'string' || typeof input.new_name !== 'string') {
    throw new Error('Native LSP rename_file requires file and new_name');
   }
   const source = parseLspPath(input.file, cwd);
   const dest = parseLspPath(input.new_name, cwd);
   return NativeOperationDescriptorSchema.parse({
    ...effective,
    lspAction: action,
    lspMethod,
    sourcePaths: [source],
    destinationPaths: [dest],
    fileOps: [{ kind: 'rename', path: source, to: dest }],
   });
  }

  return NativeOperationDescriptorSchema.parse({
   ...effective,
   lspAction: action,
   lspMethod,
   sourcePaths: typeof input.file === 'string' && input.file.trim() !== '*' ? [parseLspPath(input.file, cwd)] : [cwd],
  });
 }
 if (toolName === 'find') {
  const rawPath = typeof input?.path === 'string' && input.path.trim().length > 0 ? input.path.trim() : '.';
  const entries = await expandDelimitedPathEntries(toPathList(rawPath), cwd);
  const sourcePaths = entries.map(entry => localPath(entry, cwd));
  return NativeOperationDescriptorSchema.parse({ ...effective, sourcePaths: sourcePaths.length > 0 ? sourcePaths : [cwd] });
 }
 if (toolName === 'ast_grep') {
  const rawPaths = Array.isArray(input?.paths) ? input.paths : typeof input?.path === 'string' ? [input.path] : ['.'];
  const rawList = rawPaths.flatMap(p => typeof p === 'string' ? toPathList(p) : []);
  const entries = await expandDelimitedPathEntries(rawList, cwd);
  const sourcePaths = entries.map(entry => localPath(entry, cwd));
  return NativeOperationDescriptorSchema.parse({ ...effective, sourcePaths: sourcePaths.length > 0 ? sourcePaths : [cwd] });
 }
 if (toolName === 'ast_edit') {
  const rawPaths = Array.isArray(input?.paths) ? input.paths : typeof input?.path === 'string' ? [input.path] : ['.'];
  const rawList = rawPaths.flatMap(p => typeof p === 'string' ? toPathList(p) : []);
  const entries = await expandDelimitedPathEntries(rawList, cwd);
  const destinationPaths = entries.map(entry => localPath(entry, cwd));
  return NativeOperationDescriptorSchema.parse({ ...effective, destinationPaths: destinationPaths.length > 0 ? destinationPaths : [cwd] });
 }
 return NativeOperationDescriptorSchema.parse({ ...effective });
}
