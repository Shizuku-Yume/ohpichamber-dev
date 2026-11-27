import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import { z } from 'zod';

const FrontmatterSchema = z.looseObject({});
const ErrorCodeSchema = z.object({ code: z.string() });

export type FrontmatterRecord = z.infer<typeof FrontmatterSchema>;

export interface ParsedMarkdownFile {
  frontmatter: FrontmatterRecord;
  body: string;
}

export interface WriteMarkdownOptions {
  flag?: string | undefined;
}

function sanitizeFrontmatter(frontmatter: string): string {
  return frontmatter
    .split(/\r?\n/)
    .flatMap((line) => {
      if (line.trim().startsWith('#') || line.trim() === '' || /^\s+/.test(line)) return [line];
      const entry = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
      const key = entry?.[1];
      const rawValue = entry?.[2];
      if (!entry || key === undefined || rawValue === undefined) return [line];
      const value = rawValue.trim();
      if (value === '' || value === '>' || value === '|' || value.startsWith('"') || value.startsWith("'")) return [line];
      if (!value.includes(':')) return [line];
      return [`${key}: |-`, `  ${value}`];
    })
    .join('\n');
}

function parseMdContent(rawContent: string, filePath: string): ParsedMarkdownFile {
  const content = rawContent.charCodeAt(0) === 0xfeff ? rawContent.slice(1) : rawContent;
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);

  const rawFrontmatter = match?.[1];
  const rawBody = match?.[2];
  if (!match || rawFrontmatter === undefined || rawBody === undefined) {
    return { frontmatter: {}, body: content.trim() };
  }

  let frontmatter: FrontmatterRecord = {};
  try {
    const parsed = FrontmatterSchema.safeParse(yaml.parse(rawFrontmatter));
    frontmatter = parsed.success ? parsed.data : {};
  } catch (error) {
    try {
      const parsed = FrontmatterSchema.safeParse(yaml.parse(sanitizeFrontmatter(rawFrontmatter)));
      frontmatter = parsed.success ? parsed.data : {};
    } catch {
      console.warn(`Failed to parse markdown frontmatter ${filePath}, treating as empty:`, error);
      frontmatter = {};
    }
  }

  const body = rawBody.trim();
  return { frontmatter, body };
}

function parseMdFile(filePath: string): ParsedMarkdownFile {
  return parseMdContent(fs.readFileSync(filePath, 'utf8'), filePath);
}

function writeMdFile(
  filePath: string,
  frontmatter: FrontmatterRecord,
  body: string,
  { flag = 'w' }: WriteMarkdownOptions = {},
): void {
  try {
    const cleanedFrontmatter = Object.fromEntries(
      Object.entries(frontmatter).filter(([, value]) => value != null),
    );
    const yamlStr = yaml.stringify(cleanedFrontmatter);
    const content = `---\n${yamlStr}---\n\n${body}`;
    fs.writeFileSync(filePath, content, { encoding: 'utf8', flag });
    console.log(`Successfully wrote markdown file: ${filePath}`);
  } catch (error) {
    const parsedError = ErrorCodeSchema.safeParse(error);
    if (parsedError.success && parsedError.data.code === 'EEXIST') throw error;
    console.error(`Failed to write markdown file ${filePath}:`, error);
    throw new Error('Failed to write agent markdown file');
  }
}

function getAncestors(startDir: string | null | undefined, stopDir?: string | null): string[] {
  if (!startDir) return [];
  const result: string[] = [];
  let current = path.resolve(startDir);
  const resolvedStop = stopDir ? path.resolve(stopDir) : null;

  while (true) {
    result.push(current);
    if (resolvedStop && current === resolvedStop) {
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return result;
}

function findWorktreeRoot(startDir: string | null | undefined): string | null {
  if (!startDir) return null;
  let current = path.resolve(startDir);

  while (true) {
    if (fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export {
  parseMdFile,
  writeMdFile,
  getAncestors,
  findWorktreeRoot,
};
