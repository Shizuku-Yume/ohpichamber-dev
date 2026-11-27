import path from 'node:path';
import fsPromises from 'node:fs/promises';
import { isString } from '../shared/guards.js';

export const SCREENSHOT_DIRECTORY = path.join('.openchamber', 'screenshots');

const MAX_LABEL_LENGTH = 48;

export const screenshotSlug = (label?: string | null | undefined): string => {
  const slug = String(label ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LABEL_LENGTH)
    .replace(/-+$/g, '');
  return slug || 'page';
};

const screenshotStamp = (date: Date): string => date.toISOString().replace(/[:.]/g, '-').replace('Z', '');

const EXTENSIONS = new Map<string, string>([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

export interface ScreenshotFs {
  mkdir: (target: string, options: { recursive: boolean }) => Promise<string | void | undefined>;
  writeFile: (target: string, data: Buffer) => Promise<void>;
}

export interface WriteScreenshotInput {
  directory: string;
  base64: string;
  mime?: string | undefined;
  label?: string | null | undefined;
  now?: Date;
  fs?: ScreenshotFs;
}

export interface WriteScreenshotResult {
  path: string;
  absolutePath: string;
}

export const writeScreenshot = async ({
  directory,
  base64,
  mime = 'image/jpeg',
  label,
  now = new Date(),
  fs = fsPromises,
}: WriteScreenshotInput): Promise<WriteScreenshotResult> => {
  if (!isString(directory) || directory.trim().length === 0) {
    throw new Error('A project directory is required to save a screenshot');
  }
  if (!isString(base64) || base64.length === 0) {
    throw new Error('The browser returned no image');
  }

  const extension = EXTENSIONS.get(mime) || '.jpg';
  const relativePath = path.join(
    SCREENSHOT_DIRECTORY,
    `${screenshotSlug(label)}-${screenshotStamp(now)}${extension}`,
  );
  const absolutePath = path.join(directory, relativePath);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, Buffer.from(base64, 'base64'));

  return { path: relativePath.split(path.sep).join('/'), absolutePath };
};
