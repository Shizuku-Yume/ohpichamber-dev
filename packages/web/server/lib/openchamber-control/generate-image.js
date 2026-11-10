/**
 * `image.generate`: an image model the user chose in Settings makes or edits
 * pictures for any agent, through the canonical OMP Bun Agent Service endpoint
 * `POST /api/agent/v1/workspaces/:id/images/generate` (commit 5469bb0).
 *
 * The bytes go to a host-owned file, never back into the conversation: an
 * inline picture would be stored with the session and synced to every client,
 * several megabytes per call. The agent receives the saved file path and reads
 * it on demand. Without a requested path of its own, the file lands in
 * OpenChamber's host-owned generated images directory. The chat draws the files
 * from the call's result envelope (`../markdown-image-grants/routes.js`).
 */

import { constants as fsConstants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { z } from 'zod';
import {
 ImageGenerateRequestSchema,
 ImageGenerateResultSchema,
 ProblemDetailsSchema,
} from '@openchamber/agent-contract';

import { asNonEmptyString } from '../shared/guards.js';
import { OpenChamberControlError } from './error.js';

/** Host-owned generated images folder. */
export const GENERATED_IMAGE_DIRECTORY = os.tmpdir();

const MAX_PROMPT_LENGTH = 8_000;
const MAX_SOURCE_IMAGES = 8;
const MAX_COUNT = 4;
const SOURCE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const GENERATION_TIMEOUT_MS = 5 * 60 * 1000;

const EXTENSION_BY_MIME = {
 'image/png': 'png',
 'image/jpeg': 'jpg',
 'image/webp': 'webp',
 'image/gif': 'gif',
};

const MIME_BY_SIGNATURE = [
 { mime: 'image/png', match: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
 { mime: 'image/jpeg', match: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
 { mime: 'image/gif', match: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
 { mime: 'image/webp', match: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
];

const countSchema = z.coerce.number().int().min(1).max(MAX_COUNT);
const sourcesSchema = z.array(z.string().min(1)).max(MAX_SOURCE_IMAGES);

const pad = (value, length = 2) => String(value).padStart(length, '0');

/** File-safe local timestamp matching the user's clock that sorts chronologically. */
const stamp = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}-${pad(date.getMilliseconds(), 3)}`;

const detectMime = (bytes) => {
 if (bytes.length < 12) return null;
 return MIME_BY_SIGNATURE.find(({ match }) => match(bytes))?.mime ?? null;
};

const resolvePath = (candidate, directory) => {
 if (path.isAbsolute(candidate)) return path.normalize(candidate);
 if (!directory) throw new OpenChamberControlError(`Cannot resolve relative path "${candidate}" without an absolute path for the session folder`, 400);
 return path.resolve(directory, candidate);
};

const readSourceImage = async (fsPromises, source, directory) => {
 const file = resolvePath(source, directory);
 try {
  await fsPromises.access(file, fsConstants.R_OK);
 } catch {
  throw new OpenChamberControlError(`Image not found: ${source}`, 400);
 }
 const stat = await fsPromises.stat(file);
 if (stat.size > SOURCE_IMAGE_MAX_BYTES) {
  throw new OpenChamberControlError(`Image exceeds 10MB: ${source}`, 400);
 }
 const buffer = await fsPromises.readFile(file);
 const mime = detectMime(buffer);
 if (!mime) throw new OpenChamberControlError(`File is not an image (expected png, jpeg, webp or gif): ${source}`, 400);
 return { data: buffer.toString('base64'), mime, name: path.basename(file) };
};

const targetPath = ({ requested, directory, index, count, mime, now }) => {
 const extension = EXTENSION_BY_MIME[mime] ?? 'png';
 if (!requested) {
  const suffix = count > 1 ? `-${index + 1}` : '';
  return path.join(GENERATED_IMAGE_DIRECTORY, `omp-image-${stamp(now)}${suffix}.${extension}`);
 }
 const resolved = resolvePath(requested, directory);
 const parsed = path.parse(resolved);
 const ext = parsed.ext || `.${extension}`;
 const suffix = index > 0 ? `-${index + 1}` : '';
 return path.join(parsed.dir, `${parsed.name}${suffix}${ext}`);
};

/** `provider/model`; the model id may hold slashes of its own. */
const parseModel = (value) => {
 const text = asNonEmptyString(value);
 const separator = text ? text.indexOf('/') : -1;
 if (separator <= 0 || separator === text.length - 1) return null;
 return { providerID: text.slice(0, separator), id: text.slice(separator + 1) };
};

/**
 * Creates the Host `image.generate` action backed exclusively by the canonical
 * OMP Bun Agent Service endpoint.
 */
export const createImageGenerationAction = ({
 service,
 resolveWorkspaceScope,
 readSettings,
 fsPromises,
 now = () => new Date(),
}) => {
 if (!service || typeof service.request !== 'function') {
  throw new TypeError('Agent Service is required for image generation action');
 }

 return async (input, { directory, workspaceId, sessionId, signal } = {}) => {
  const settings = await readSettings().catch(() => null);
  if (settings?.agentImageToolEnabled !== true) {
   throw new OpenChamberControlError('The image tool is turned off in OpenChamber settings', 403);
  }
  const model = parseModel(settings?.agentImageModel);
  if (!model) {
   throw new OpenChamberControlError('No image model is chosen. Ask the user to pick one in Settings > General > OpenChamber Tools > Image model', 409);
  }
  const modelName = `${model.providerID}/${model.id}`;

  const prompt = asNonEmptyString(input.prompt);
  if (!prompt) throw new OpenChamberControlError('prompt is required', 400);
  if (prompt.length > MAX_PROMPT_LENGTH) throw new OpenChamberControlError(`prompt is longer than ${MAX_PROMPT_LENGTH} characters`, 400);
  const parsedCount = input.count === undefined ? { success: true, data: 1 } : countSchema.safeParse(input.count);
  if (!parsedCount.success) {
   throw new OpenChamberControlError(`count must be a whole number from 1 to ${MAX_COUNT}`, 400);
  }
  const count = parsedCount.data;
  const aspect = asNonEmptyString(input.aspect);
  if (aspect && !/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(aspect)) {
   throw new OpenChamberControlError('aspect is width:height, such as 16:9', 400);
  }
  const resolution = asNonEmptyString(input.resolution);
  if (resolution && !/^[0-9A-Za-z]{1,8}$/.test(resolution)) {
   throw new OpenChamberControlError('resolution is a size tier such as 1K, 2K or 4K', 400);
  }
  const parsedSources = input.images === undefined ? { success: true, data: [] } : sourcesSchema.safeParse(input.images);
  if (!parsedSources.success) {
   throw new OpenChamberControlError(`images is a list of at most ${MAX_SOURCE_IMAGES} image file paths`, 400);
  }
  const sources = parsedSources.data;
  const requestedPath = asNonEmptyString(input.path);
  const workDirectory = asNonEmptyString(directory);
  if (requestedPath) resolvePath(requestedPath, workDirectory);
  const images = await Promise.all(sources.map((source) => readSourceImage(fsPromises, source, workDirectory)));

  // Resolve authoritative workspace from Host session or directory context
  let effectiveWorkspaceId = asNonEmptyString(workspaceId);
  if (!effectiveWorkspaceId && typeof resolveWorkspaceScope === 'function') {
   const scope = await resolveWorkspaceScope({ directory: workDirectory, sessionId });
   effectiveWorkspaceId = asNonEmptyString(scope?.workspaceId) || (typeof scope === 'string' ? asNonEmptyString(scope) : null);
  }
  if (!effectiveWorkspaceId) {
   throw new OpenChamberControlError('Cannot determine authoritative workspace scope for image generation', 400);
  }

  const canonicalPayload = ImageGenerateRequestSchema.parse({
   workspaceId: effectiveWorkspaceId,
   selection: { providerId: model.providerID, modelId: model.id },
   prompt,
   ...(images.length > 0 ? { inputImages: images.map((img) => ({ data: img.data, mimeType: img.mime })) } : {}),
   ...(aspect ? { aspectRatio: aspect } : {}),
   ...(resolution ? { imageSize: resolution } : {}),
   ...(count > 1 ? { count } : {}),
  });

  const deadline = AbortSignal.timeout(GENERATION_TIMEOUT_MS);
  const combinedSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  let res;
  try {
   res = await service.request(`/api/agent/v1/workspaces/${encodeURIComponent(effectiveWorkspaceId)}/images/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(canonicalPayload),
    signal: combinedSignal,
   });
  } catch (error) {
   if (deadline.aborted) throw new OpenChamberControlError(`${modelName} did not finish within 5 minutes`, 504);
   if (signal?.aborted) throw error;
   throw new OpenChamberControlError(error?.message || 'Image generation request failed', 502);
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
   const parsedProblem = ProblemDetailsSchema.safeParse(body);
   if (parsedProblem.success) {
    const problem = parsedProblem.data;
    if (problem.code === 'MODEL_UNAVAILABLE') {
     throw new OpenChamberControlError(`The image model ${modelName} is disabled or unavailable. Ask the user to choose another in Settings > General > OpenChamber Tools`, 409);
    }
    if (problem.code === 'PROVIDER_UNAVAILABLE') {
     throw new OpenChamberControlError(`The provider for ${modelName} is disabled or has no usable credentials`, 409);
    }
    throw new OpenChamberControlError(problem.detail || problem.title || 'Image generation failed', problem.status || res.status);
   }
   const message = body?.error?.message || body?.message || body?.detail || 'Image generation failed';
   throw new OpenChamberControlError(message, res.status >= 400 && res.status < 500 ? res.status : 502);
  }

  const parsedResult = ImageGenerateResultSchema.safeParse(body);
  if (!parsedResult.success) {
   throw new OpenChamberControlError('Invalid image generation response from agent service', 502);
  }
  const result = parsedResult.data;
  if (result.model.providerId !== model.providerID || result.model.modelId !== model.id) {
   throw new OpenChamberControlError(`Generated image response model does not match requested model ${modelName}`, 502);
  }

  const generated = result.images;
  const moment = now();
  const saved = [];
  for (const [index, image] of generated.entries()) {
   const file = targetPath({ requested: requestedPath, directory: workDirectory, index, count: generated.length, mime: image.mimeType, now: moment });
   await fsPromises.mkdir(path.dirname(file), { recursive: true });
   await fsPromises.writeFile(file, Buffer.from(image.data, 'base64'));
   saved.push({ path: file, mime: image.mimeType });
  }
  const output = { model: modelName, images: saved };
  if (result.text) output.text = result.text;
  return output;
 };
};

/**
 * The files an `image.generate` result names, from the text the tool stored:
 * the plugin's JSON envelope. Anything else names none.
 */
export const generatedImagePaths = (text) => {
 let envelope;
 try {
  envelope = JSON.parse(text);
 } catch {
  return [];
 }
 const images = envelope?.ok === true ? envelope.data?.images : null;
 return Array.isArray(images)
  ? images.map((image) => asNonEmptyString(image?.path)).filter(Boolean)
  : [];
};
