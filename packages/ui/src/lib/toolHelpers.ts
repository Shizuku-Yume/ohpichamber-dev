



import type { JsonValue, ToolCallPart } from '@openchamber/agent-contract';
import { z } from 'zod';

import {
 isExplorationTool as registryExploration,
 isFileChangeTool as registryFileChange,
 isQuestionTool as registryQuestion,
 isShellTool as registryShell,
 isEvalTool as registryEval,
 isStaticTool as registryStaticTool,
 isSubagentTool as registrySubagent,
 isTodoTool as registryTodo,
 isWebTool as registryWeb,
 isEditTool as registryEdit,
 isWriteTool as registryWrite,
 isFindTool,
 isGrepTool,
 isGlobTool,
 isReadTool as registryRead,
 isWebSearchTool,
 isAstEditTool as registryAstEdit,
 parseEditInputPaths,
 askAnswers,
 toolBaseName,
 toolPresentation,
} from '@/lib/toolPresentation';

export type ToolName = string | undefined;

export function normalizeToolName(toolName: ToolName): string { return toolName?.trim() ?? ''; }

export const isShellTool = registryShell;
export const isFileChangeTool = registryFileChange;
export const isEvalTool = registryEval;
export const isSubagentTool = registrySubagent;
export const isQuestionTool = registryQuestion;
export const isExplorationTool = registryExploration;
export const isWebTool = registryWeb;
export const isStaticTool = registryStaticTool;
export const isTodoTool = registryTodo;
export const isEditTool = registryEdit;
export const isAstEditTool = registryAstEdit;
export const isReadTool = registryRead;
export const isWriteTool = registryWrite;
export {
 parseEditInputPaths,
 askAnswers,
 isFindTool,
 isGlobTool,
 isGrepTool,
 isWebSearchTool,
 toolBaseName,
 toolPresentation,
};

/** Inline native selectors are presentation instructions, never editor paths. */
export function parseNativeReadPath(rawPath: string): { path: string; line?: number } {
 const selectorIndex = rawPath.search(/:(?=\d|-\d|raw(?:$|:)|img$|conflicts$)[^/]*$/);
 if (selectorIndex < 0) return { path: rawPath };
 const selector = rawPath.slice(selectorIndex + 1).replace(/^raw:/, '');
 const firstLine = /^(\d+)(?=$|[-+,:])/.exec(selector);
 return { path: rawPath.slice(0, selectorIndex), ...(firstLine ? { line: Number(firstLine[1]) } : {}) };
}

const jsonString = (value: JsonValue | undefined): string | undefined => z.string().safeParse(value).data;

const inputPathOf = (input: ToolCallPart['input'] | undefined): string | null => {
 const path = jsonString(input?.path);
 if (path && path.trim()) return path;
 const filePath = jsonString(input?.file_path);
 return filePath && filePath.trim() ? filePath : null;
};

export const toolInputPath = inputPathOf;

export function toolInputPaths(call: ToolCallPart): string[] {
 const path = toolInputPath(call.input);
 const paths = path ? [path] : [];
 const baseName = toolBaseName(call.toolName);
 if (isEditTool(call.toolName) || baseName === 'apply_patch') {
  if (Array.isArray(call.input.edits)) {
   for (const edit of call.input.edits) {
    const rename = z.looseObject({ rename: z.string().optional() }).safeParse(edit).data?.rename;
    if (rename && !paths.includes(rename)) paths.push(rename);
   }
  }
  const rawProgram = jsonString(call.input.input);
  if (rawProgram) {
   for (const extracted of parseEditInputPaths(rawProgram)) {
    if (!paths.includes(extracted)) paths.push(extracted);
   }
  }
 } else if (isAstEditTool(call.toolName)) {
  if (Array.isArray(call.input.paths)) {
   for (const candidate of call.input.paths) {
    const candidatePath = jsonString(candidate);
    if (candidatePath && !paths.includes(candidatePath)) paths.push(candidatePath);
   }
  } else {
   const singlePath = jsonString(call.input.path);
   if (singlePath && !paths.includes(singlePath)) paths.push(singlePath);
  }
 }
 return paths;
}

export function detectToolOutputLanguage(toolName: string, _output: string, input?: ToolCallPart['input']): string {
 const language = toolPresentation(toolName).outputLanguage;
 if (language !== 'auto') return language;
 const path = toolInputPath(input);
 if (path) return getLanguageFromExtension(isReadTool(toolName) ? parseNativeReadPath(path).path : path) ?? 'text';
 return 'text';
}

export function getLanguageFromExtension(filePath: string): string | null {
 const ext = filePath.split('.').pop()?.toLowerCase();

 // Handle special filenames without extensions
 const filename = filePath.split('/').pop()?.toLowerCase() || '';
 const filenameMap: Record<string, string> = {
  'dockerfile': 'dockerfile',
  'makefile': 'makefile',
  'gnumakefile': 'makefile',
  'cmakelists.txt': 'cmake',
  'gemfile': 'ruby',
  'rakefile': 'ruby',
  'podfile': 'ruby',
  'vagrantfile': 'ruby',
  'guardfile': 'ruby',
  'brewfile': 'ruby',
  'fastfile': 'ruby',
  'appfile': 'ruby',
  'matchfile': 'ruby',
  'pluginfile': 'ruby',
  'scanfile': 'ruby',
  'snapfile': 'ruby',
  '.gitignore': 'text',
  '.gitattributes': 'text',
  '.gitmodules': 'ini',
  '.editorconfig': 'ini',
  '.npmrc': 'ini',
  '.yarnrc': 'yaml',
  '.prettierrc': 'json',
  '.eslintrc': 'json',
  '.babelrc': 'json',
  '.browserslistrc': 'text',
  'tsconfig.json': 'jsonc',
  'jsconfig.json': 'jsonc',
  '.env': 'bash',
  '.env.local': 'bash',
  '.env.development': 'bash',
  '.env.production': 'bash',
  '.env.test': 'bash',
  'procfile': 'yaml',
  'codeowners': 'text',
  // Lock files
  'package-lock.json': 'json',
  'composer.lock': 'json',
  'yarn.lock': 'yaml',
  'pnpm-lock.yaml': 'yaml',
  'cargo.lock': 'toml',
  'poetry.lock': 'toml',
  'gemfile.lock': 'ruby',
  'pubspec.lock': 'yaml',
  'packages.lock.json': 'json',
  'bun.lockb': 'text',
  'bun.lock': 'json',
 };

 if (filenameMap[filename]) {
  return filenameMap[filename];
 }

 const languageMap: Record<string, string> = {
  // JavaScript/TypeScript
  'js': 'javascript',
  'jsx': 'jsx',
  'ts': 'typescript',
  'tsx': 'tsx',
  'mjs': 'javascript',
  'cjs': 'javascript',
  'mts': 'typescript',
  'cts': 'typescript',

  // Web markup/styling
  'html': 'html',
  'htm': 'html',
  'xhtml': 'html',
  'vue': 'html',
  'svelte': 'html',
  'astro': 'html',
  'ejs': 'html',
  'cshtml': 'html',
  'razor': 'html',
  'jsp': 'html',
  'gohtml': 'html',
  'tmpl': 'html',
  'hbs': 'handlebars',
  'handlebars': 'handlebars',
  'mustache': 'handlebars',
  'njk': 'twig',
  'jinja': 'twig',
  'jinja2': 'twig',
  'j2': 'twig',
  'nunjucks': 'twig',
  'twig': 'twig',
  'liquid': 'liquid',
  'css': 'css',
  'scss': 'scss',
  'sass': 'sass',
  'less': 'less',
  'styl': 'stylus',
  'stylus': 'stylus',
  'pcss': 'css',
  'postcss': 'css',

  // Data/config formats
  'json': 'json',
  'jsonc': 'json',
  'json5': 'json',
  'jsonl': 'json',
  'ndjson': 'json',
  'geojson': 'json',
  'webmanifest': 'json',
  'code-workspace': 'json',
  'har': 'json',
  'ipynb': 'json',
  'gltf': 'json',
  'tfstate': 'json',
  'tsbuildinfo': 'json',
  'yaml': 'yaml',
  'yml': 'yaml',
  'toml': 'toml',
  'xml': 'xml',
  'xsl': 'xml',
  'xslt': 'xml',
  'xsd': 'xml',
  'dtd': 'xml',
  'plist': 'xml',
  'svg': 'xml',
  'rss': 'xml',
  'atom': 'xml',
  'xaml': 'xml',
  'csproj': 'xml',
  'vbproj': 'xml',
  'fsproj': 'xml',
  'props': 'xml',
  'targets': 'xml',
  'nuspec': 'xml',
  'resx': 'xml',
  'wxs': 'xml',
  'storyboard': 'xml',
  'xib': 'xml',
  'ini': 'ini',
  'cfg': 'ini',
  'conf': 'ini',
  'config': 'ini',
  'properties': 'properties',
  'service': 'ini',
  'desktop': 'ini',
  'env': 'bash',
  'csv': 'text',
  'tsv': 'text',

  // Python
  'py': 'python',
  'pyw': 'python',
  'pyx': 'python',
  'pxd': 'python',
  'pxi': 'python',
  'pyi': 'python',
  'gyp': 'python',
  'gypi': 'python',
  'bzl': 'python',

  // Ruby
  'rb': 'ruby',
  'erb': 'erb',
  'rake': 'ruby',
  'gemspec': 'ruby',
  'ru': 'ruby',
  'podspec': 'ruby',
  'thor': 'ruby',
  'jbuilder': 'ruby',
  'rabl': 'ruby',
  'builder': 'ruby',

  // PHP
  'php': 'php',
  'phtml': 'php',
  'php3': 'php',
  'php4': 'php',
  'php5': 'php',
  'php7': 'php',
  'phps': 'php',
  // PHP templates (Smarty-style .tpl, CakePHP .ctp) and PHP test files.
  'tpl': 'php',
  'ctp': 'php',
  'phpt': 'php',
  'inc': 'php',
  'blade.php': 'php',

  // Java/JVM
  'java': 'java',
  'kt': 'kotlin',
  'kts': 'kotlin',
  'scala': 'scala',
  'sc': 'scala',
  'groovy': 'groovy',
  'gradle': 'groovy',
  'gvy': 'groovy',
  'gy': 'groovy',
  'gsh': 'groovy',

  // C/C++/Objective-C
  'c': 'c',
  'h': 'c',
  'cpp': 'cpp',
  'cc': 'cpp',
  'cxx': 'cpp',
  'c++': 'cpp',
  'hpp': 'cpp',
  'hxx': 'cpp',
  'hh': 'cpp',
  'h++': 'cpp',
  'ino': 'cpp',
  'm': 'objectivec',
  'mm': 'objectivec',

  // C#/F#/.NET
  'cs': 'csharp',
  'csx': 'csharp',
  'cake': 'csharp',
  'fs': 'fsharp',
  'fsx': 'fsharp',
  'fsi': 'fsharp',
  'vb': 'vbnet',

  // Go
  'go': 'go',
  'mod': 'go',
  'sum': 'text',

  // Rust
  'rs': 'rust',

  // Swift
  'swift': 'swift',

  // Dart
  'dart': 'dart',

  // Lua
  'lua': 'lua',

  // Perl
  'pl': 'perl',
  'pm': 'perl',
  'pod': 'perl',
  't': 'perl',

  // R
  'r': 'r',
  'R': 'r',
  'rmd': 'markdown',
  'rnw': 'r',

  // Julia
  'jl': 'julia',

  // Haskell
  'hs': 'haskell',
  'lhs': 'haskell',

  // Elixir/Erlang
  'ex': 'elixir',
  'exs': 'elixir',
  'eex': 'html',
  'heex': 'html',
  'leex': 'html',
  'erl': 'erlang',
  'hrl': 'erlang',

  // Clojure
  'clj': 'clojure',
  'cljs': 'clojure',
  'cljc': 'clojure',
  'edn': 'clojure',

  // Lisp/Scheme
  'lisp': 'lisp',
  'cl': 'lisp',
  'el': 'lisp',
  'scm': 'scheme',
  'ss': 'scheme',
  'rkt': 'scheme',

  // OCaml/ReasonML
  'ml': 'ocaml',
  'mli': 'ocaml',
  're': 'reason',
  'rei': 'reason',

  // Nim
  'nim': 'nim',
  'nims': 'nim',
  'nimble': 'nim',

  // Zig
  'zig': 'zig',

  // V
  'v': 'v',
  'vsh': 'v',

  // Crystal
  'cr': 'crystal',

  // D
  'd': 'd',
  'di': 'd',

  // Shell/Scripts
  'sh': 'bash',
  'bash': 'bash',
  'zsh': 'bash',
  'fish': 'bash',
  'ksh': 'bash',
  'csh': 'bash',
  'tcsh': 'bash',
  'ps1': 'powershell',
  'psm1': 'powershell',
  'psd1': 'powershell',
  'bat': 'batch',
  'cmd': 'batch',

  // SQL
  'sql': 'sql',
  'psql': 'sql',
  'plsql': 'sql',
  'mysql': 'sql',
  'pgsql': 'sql',
  'sqlite': 'sql',

  // GraphQL
  'graphql': 'graphql',
  'gql': 'graphql',

  // Solidity
  'sol': 'solidity',

  // Assembly
  'asm': 'nasm',
  's': 'nasm',
  'S': 'nasm',

  // Nix
  'nix': 'nix',

  // Terraform/HCL
  'tf': 'hcl',
  'tfvars': 'hcl',
  'hcl': 'hcl',

  // Docker
  'dockerignore': 'text',

  // Puppet
  'pp': 'puppet',

  // LaTeX
  'tex': 'latex',
  'latex': 'latex',
  'sty': 'latex',
  'cls': 'latex',
  'bib': 'bibtex',
  'bst': 'bibtex',

  // Markdown/docs
  'md': 'markdown',
  'mdx': 'markdown',
  'markdown': 'markdown',
  'mdown': 'markdown',
  'mkd': 'markdown',
  'rst': 'text',
  'adoc': 'asciidoc',
  'asciidoc': 'asciidoc',
  'org': 'text',
  'txt': 'text',
  'text': 'text',
  'rtf': 'text',

  // Vim
  'vim': 'vim',
  'vimrc': 'vim',

  // Makefile variants
  'mk': 'makefile',

  // CMake
  'cmake': 'cmake',

  // Diff/Patch
  'diff': 'diff',
  'patch': 'diff',

  'prisma': 'prisma',

  'proto': 'protobuf',

  'thrift': 'thrift',

  'wat': 'wasm',
  'wast': 'wasm',

  // GLSL/Shaders
  'glsl': 'glsl',
  'vert': 'glsl',
  'frag': 'glsl',
  'geom': 'glsl',
  'comp': 'glsl',
  'hlsl': 'hlsl',
  'fx': 'hlsl',
  'cg': 'cg',
  'shader': 'glsl',

  // Apache/Nginx config
  'htaccess': 'apacheconf',
  'nginx': 'nginx',

  // Kubernetes
  'kubeconfig': 'yaml',

  // Ansible
  'ansible': 'yaml',
 };

 return languageMap[ext || ''] || null;
}

const DIAGRAM_EXTENSIONS = ['drawio', 'dio'];

export function isDrawioFile(filePath: string): boolean {
 const ext = filePath.split('.').pop()?.toLowerCase();
 return DIAGRAM_EXTENSIONS.includes(ext || '');
}

export function isExcalidrawFile(filePath: string): boolean {
 const lower = filePath.toLowerCase();
 return lower.endsWith('.excalidraw') || lower.endsWith('.excalidraw.md');
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif'];

export function isImageFile(filePath: string): boolean {
 const ext = filePath.split('.').pop()?.toLowerCase();
 return IMAGE_EXTENSIONS.includes(ext || '');
}

export function isPdfFile(filePath: string): boolean {
 const ext = filePath.split('.').pop()?.toLowerCase();
 return ext === 'pdf';
}

export function isSvgFile(filePath: string): boolean {
 return filePath.toLowerCase().endsWith('.svg');
}

const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'oga', 'opus', 'weba'];
const VIDEO_EXTENSIONS = ['mp4', 'm4v', 'webm', 'mov', 'ogv', 'mkv'];
const FONT_EXTENSIONS = ['ttf', 'otf', 'woff', 'woff2'];

export function isAudioFile(filePath: string): boolean {
 return AUDIO_EXTENSIONS.includes(getFileExtension(filePath));
}

export function isVideoFile(filePath: string): boolean {
 return VIDEO_EXTENSIONS.includes(getFileExtension(filePath));
}

export function isFontFile(filePath: string): boolean {
 return FONT_EXTENSIONS.includes(getFileExtension(filePath));
}

export function isDelimitedTableFile(filePath: string): boolean {
 const ext = getFileExtension(filePath);
 return ext === 'csv' || ext === 'tsv';
}
/** Office documents the viewer can draw. The older doc, xls and ppt formats stay downloads. */
const OFFICE_PREVIEW_EXTENSIONS: Record<string, true> = {
 docx: true, xlsx: true, pptx: true, odt: true, ods: true, odp: true,
};

export function isOfficePreviewFile(filePath: string): boolean {
 return Boolean(OFFICE_PREVIEW_EXTENSIONS[getFileExtension(filePath)]);
}

export function isMermaidFile(filePath: string): boolean {
 const ext = getFileExtension(filePath);
 return ext === 'mmd' || ext === 'mermaid';
}

const BINARY_FILE_EXTENSIONS = new Set([
 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp',
 'zip', 'rar', '7z', 'gz', 'tgz', 'tar', 'bz2', 'xz', 'jar', 'war', 'apk', 'dmg', 'iso',
 'deb', 'rpm', 'msi',
 ...IMAGE_EXTENSIONS.filter((ext) => ext !== 'svg'),
 ...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS, 'wma', 'avi', 'wmv',
 ...FONT_EXTENSIONS, 'eot',
 'exe', 'dll', 'so', 'dylib', 'bin', 'class', 'o', 'a', 'lib', 'wasm', 'node',
 'sqlite', 'sqlite3', 'db', 'dat', 'parquet', 'feather', 'pickle', 'pyc', 'pyo', 'lockb',
]);

export function getFileExtension(filePath: string): string {
 const base = filePath.split(/[/\\]/).pop() ?? filePath;
 const dot = base.lastIndexOf('.');
 if (dot <= 0 || dot === base.length - 1) {
  return '';
 }
 return base.slice(dot + 1).toLowerCase();
}

export function isBinaryFile(filePath: string): boolean {
 if (isSvgFile(filePath)) {
  return false;
 }
 const ext = getFileExtension(filePath);
 return BINARY_FILE_EXTENSIONS.has(ext);
}

export function looksLikeBinaryText(content: string): boolean {
 if (!content) {
  return false;
 }

 const sample = content.length > 8192 ? content.slice(0, 8192) : content;
 if (sample.includes('\0')) {
  return true;
 }
 if (sample.startsWith('%PDF')) {
  return true;
 }
 if (sample.startsWith('PK\u0003\u0004') || sample.startsWith('PK\u0005\u0006') || sample.startsWith('PK\u0007\u0008')) {
  return true;
 }

 let suspicious = 0;
 for (let index = 0; index < sample.length; index += 1) {
  const code = sample.charCodeAt(index);
  if (code === 0xFFFD) {
   suspicious += 1;
   continue;
  }
  // C0 controls excluding common whitespace (TAB/LF/VT/FF/CR).
  if (code < 9 || (code > 13 && code < 32) || code === 127) {
   suspicious += 1;
  }
 }

 return sample.length > 0 && suspicious / sample.length > 0.1;
}

export function getImageMimeType(filePath: string): string {
 const ext = filePath.split('.').pop()?.toLowerCase();
 const mimeMap: Record<string, string> = {
  'png': 'image/png',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'gif': 'image/gif',
  'svg': 'image/svg+xml',
  'webp': 'image/webp',
  'ico': 'image/x-icon',
  'bmp': 'image/bmp',
  'avif': 'image/avif',
 };
 return mimeMap[ext || ''] || 'image/png';
}

export function formatToolInput(input: ToolCallPart['input'], toolName: string): string {
 const shellCommand = jsonString(input.command);
 if (isShellTool(toolName) && shellCommand !== undefined) return shellCommand;
 const writeContent = jsonString(input.content);
 if (isWriteTool(toolName) && writeContent !== undefined) return writeContent;
 const evalCode = jsonString(input.code);
 if (isEvalTool(toolName) && evalCode !== undefined) return evalCode;
 const editProgram = jsonString(input.input);
 if ((isEditTool(toolName) || toolBaseName(toolName) === 'apply_patch') && editProgram !== undefined) return editProgram;
 const { i: _intent, ...rest } = input;
 if (Object.keys(rest).length === 0 && _intent !== undefined) return '';
 // Keep complete structured native edit/task/custom-tool inputs visible without duplicating `i` intent.
 return JSON.stringify(rest, null, 2);
}

export function hasFileVersionsDiff(filePath: string): boolean {
 return isImageFile(filePath) || isOfficePreviewFile(filePath);
}

export function isDataFile(filePath: string): boolean {
 return ['sqlite', 'sqlite3', 'db', 'parquet'].includes(getFileExtension(filePath));
}

export function isArchiveFile(filePath: string): boolean {
 return ['zip', 'jar', 'war'].includes(getFileExtension(filePath));
}

export function isNotebookFile(filePath: string): boolean {
 return getFileExtension(filePath) === 'ipynb';
}
