import fs from 'fs';
import path from 'path';
import yaml from 'yaml';


// ============== MARKDOWN FILE OPERATIONS ==============

// Mirror of OpenCode's markdown frontmatter sanitizer (packages/opencode/src/
// config/markdown.ts): other coding agents accept unquoted colons in YAML
// values (e.g. `description: Build agent: creates builds`), which strict YAML
// rejects. Rewrite those values as block scalars and retry the parse, so files
// OpenCode accepts are parsed identically here.
function sanitizeFrontmatter(frontmatter) {
  return frontmatter
    .split(/\r?\n/)
    .flatMap((line) => {
      if (line.trim().startsWith('#') || line.trim() === '' || /^\s+/.test(line)) return [line];
      const entry = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
      if (!entry) return [line];
      const value = entry[2].trim();
      if (value === '' || value === '>' || value === '|' || value.startsWith('"') || value.startsWith("'")) return [line];
      if (!value.includes(':')) return [line];
      return [`${entry[1]}: |-`, `  ${value}`];
    })
    .join('\n');
}

function parseMdFile(filePath) {
  return parseMdContent(fs.readFileSync(filePath, 'utf8'), filePath);
}


function parseMdContent(rawContent, filePath) {
  // Strip a UTF-8 BOM so frontmatter is recognized regardless of the editor
  // that saved the file.
  const content = rawContent.charCodeAt(0) === 0xfeff ? rawContent.slice(1) : rawContent;
  // The closing `---` may sit at end-of-file without a trailing newline.
  // gray-matter (used by OpenCode) accepts that, so we must too: otherwise the
  // whole file is treated as the prompt body and a later save rewrites the
  // existing YAML block into the body, duplicating the frontmatter.
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);

  if (!match) {
    return { frontmatter: {}, body: content.trim() };
  }

  let frontmatter = {};
  try {
    frontmatter = yaml.parse(match[1]) || {};
  } catch (error) {
    // Lenient fallback for frontmatter that strict YAML rejects but OpenCode
    // still accepts (unquoted colons in scalar values).
    try {
      frontmatter = yaml.parse(sanitizeFrontmatter(match[1])) || {};
    } catch {
      console.warn(`Failed to parse markdown frontmatter ${filePath}, treating as empty:`, error);
      frontmatter = {};
    }
  }

  const body = match[2].trim();
  return { frontmatter, body };
}

// `flag: 'wx'` creates the file and fails with EEXIST when it is already
// there; that error is passed on as is so a caller can tell it apart.
function writeMdFile(filePath, frontmatter, body, { flag = 'w' } = {}) {
  try {
    const cleanedFrontmatter = Object.fromEntries(
      Object.entries(frontmatter).filter(([, value]) => value != null)
    );
    const yamlStr = yaml.stringify(cleanedFrontmatter);
    const content = `---\n${yamlStr}---\n\n${body}`;
    fs.writeFileSync(filePath, content, { encoding: 'utf8', flag });
    console.log(`Successfully wrote markdown file: ${filePath}`);
  } catch (error) {
    if (error?.code === 'EEXIST') throw error;
    console.error(`Failed to write markdown file ${filePath}:`, error);
    throw new Error('Failed to write agent markdown file');
  }
}



function getAncestors(startDir, stopDir) {
  if (!startDir) return [];
  const result = [];
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

function findWorktreeRoot(startDir) {
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
