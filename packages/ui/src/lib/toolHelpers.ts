import type { ToolCallPart, ToolResultPart } from '@openchamber/agent-contract';

/** Native SDK tool names; custom tools retain their complete identity. */
export const NATIVE_TOOLS = {
  bash: 'bash',
  edit: 'edit',
  write: 'write',
  read: 'read',
  grep: 'grep',
  glob: 'glob',
  find: 'find',
  task: 'task',
  ask: 'ask',
  webSearch: 'web_search',
  fetch: 'fetch',
} as const;

export type ToolName = string | undefined;
export function normalizeToolName(toolName: ToolName): string {
  return toolName?.trim() ?? '';
}

export const isShellTool = (name: ToolName): boolean => name === NATIVE_TOOLS.bash;
export const isSubagentTool = (name: ToolName): boolean => name === NATIVE_TOOLS.task;
export const isQuestionTool = (name: ToolName): boolean => name === NATIVE_TOOLS.ask;
export const isEditTool = (name: ToolName): boolean => name === NATIVE_TOOLS.edit;
export const isWriteTool = (name: ToolName): boolean => name === NATIVE_TOOLS.write;
export const isFileChangeTool = (name: ToolName): boolean => isEditTool(name) || isWriteTool(name);
export const isExplorationTool = (name: ToolName): boolean => name === NATIVE_TOOLS.read || name === NATIVE_TOOLS.grep || name === NATIVE_TOOLS.glob || name === NATIVE_TOOLS.find;
export const isWebTool = (name: ToolName): boolean => name === NATIVE_TOOLS.fetch || name === NATIVE_TOOLS.webSearch;

export function toolInputPath(input: ToolCallPart['input'] | undefined): string | null {
  return typeof input?.path === 'string' && input.path.trim() ? input.path : null;
}

/** Inline native selectors are presentation instructions, never editor paths. */
export function parseNativeReadPath(rawPath: string): { path: string; line?: number } {
  const selectorIndex = rawPath.search(/:(?=\d|-\d|raw(?:$|:)|img$|conflicts$)[^/]*$/);
  if (selectorIndex < 0) return { path: rawPath };
  const selector = rawPath.slice(selectorIndex + 1).replace(/^raw:/, '');
  const firstLine = /^(\d+)(?=$|[-+,:])/.exec(selector);
  return { path: rawPath.slice(0, selectorIndex), ...(firstLine ? { line: Number(firstLine[1]) } : {}) };
}

export function toolInputPaths(call: ToolCallPart): string[] {
  const path = toolInputPath(call.input);
  const paths = path ? [path] : [];
  if (isEditTool(call.toolName) && Array.isArray(call.input.edits)) {
    for (const edit of call.input.edits) {
      if (edit && typeof edit === 'object' && !Array.isArray(edit) && typeof edit.rename === 'string' && !paths.includes(edit.rename)) paths.push(edit.rename);
    }
  }
  // Raw edit modes carry a native program, not a path field. Their resolved
  // targets come from the result's details, not a guessed client-side parser.
  return paths;
}

export interface ToolMetadata {
  displayName: string;
  outputLanguage: string;
  category: 'file' | 'search' | 'code' | 'system' | 'ai' | 'web';
}

export function getToolMetadata(toolName: string): ToolMetadata {
  const category = isFileChangeTool(toolName) || toolName === NATIVE_TOOLS.read ? 'file'
    : isSubagentTool(toolName) || isQuestionTool(toolName) ? 'ai'
    : isWebTool(toolName) ? 'web'
    : isExplorationTool(toolName) ? 'search' : 'system';
  const outputLanguage = isEditTool(toolName) ? 'diff'
    : toolName === NATIVE_TOOLS.read || isWriteTool(toolName) ? 'auto' : 'text';
  return { displayName: toolName, category, outputLanguage };
}

export type ToolDescription =
  | { kind: 'path'; value: string }
  | { kind: 'text'; value: string }
  | { kind: 'files'; count: number; files: string[] }
  | { kind: 'questions'; count: number };

/** A result may borrow input only from its exact native call identity. */
export function toolDescription(part: ToolCallPart | ToolResultPart, pairedCall?: ToolCallPart): ToolDescription | null {
  const call = part.type === 'tool_call' ? part
    : pairedCall?.toolCallId === part.toolCallId && pairedCall.toolName === part.toolName ? pairedCall : undefined;
  if (!call) return part.type === 'tool_result' && part.error ? { kind: 'text', value: part.error } : null;
  if (isFileChangeTool(call.toolName) || call.toolName === NATIVE_TOOLS.read) {
    const paths = toolInputPaths(call);
    return paths.length > 1 ? { kind: 'files', count: paths.length, files: paths }
      : paths[0] ? { kind: 'path', value: paths[0] } : null;
  }
  const input = call.input;
  if (isQuestionTool(call.toolName) && Array.isArray(call.input.questions) && call.input.questions.length) {
    return { kind: 'questions', count: call.input.questions.length };
  }
  const value = isShellTool(call.toolName) ? input.command
    : call.toolName === NATIVE_TOOLS.grep ? input.pattern
    : call.toolName === NATIVE_TOOLS.glob ? input.path
    : call.toolName === NATIVE_TOOLS.find ? input.query
    : call.toolName === NATIVE_TOOLS.webSearch ? input.query
    : call.toolName === NATIVE_TOOLS.fetch ? input.url
    : isSubagentTool(call.toolName) ? input.name ?? input.task : undefined;
  return typeof value === 'string' && value ? { kind: 'text', value: value.split('\n')[0].slice(0, 160) } : null;
}

export function detectToolOutputLanguage(toolName: string, _output: string, input?: ToolCallPart['input']): string {
  const language = getToolMetadata(toolName).outputLanguage;
  if (language !== 'auto') return language;
  const path = toolInputPath(input);
  if (path) return getLanguageFromExtension(toolName === NATIVE_TOOLS.read ? parseNativeReadPath(path).path : path) ?? 'text';
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



    // Prisma
    'prisma': 'prisma',

    // Protocol Buffers
    'proto': 'protobuf',

    // Thrift
    'thrift': 'thrift',

    // WASM
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

// Playable in a browser media element: the viewer plays these instead of
// offering a download. What a runtime's engine cannot decode (an HEVC .mov,
// a .mkv) still opens; the element reports the failure and the viewer says so.
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

/** Comma- or tab-separated text the viewer can lay out as a table. */
export function isDelimitedTableFile(filePath: string): boolean {
  const ext = getFileExtension(filePath);
  return ext === 'csv' || ext === 'tsv';
}

export function isMermaidFile(filePath: string): boolean {
  const ext = getFileExtension(filePath);
  return ext === 'mmd' || ext === 'mermaid';
}

/** Known non-text extensions that must not be opened or saved as UTF-8 text. */
const BINARY_FILE_EXTENSIONS = new Set([
  // Documents / office
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp',
  // Archives / packages
  'zip', 'rar', '7z', 'gz', 'tgz', 'tar', 'bz2', 'xz', 'jar', 'war', 'apk', 'dmg', 'iso',
  'deb', 'rpm', 'msi',
  // Images (svg is text and is excluded via isSvgFile)
  ...IMAGE_EXTENSIONS.filter((ext) => ext !== 'svg'),
  // Audio / video
  ...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS, 'wma', 'avi', 'wmv',
  // Fonts
  ...FONT_EXTENSIONS, 'eot',
  // Native / bytecode
  'exe', 'dll', 'so', 'dylib', 'bin', 'class', 'o', 'a', 'lib', 'wasm', 'node',
  // Databases / locks / misc binary
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

/** True for known binary extensions (including images/PDF). SVG is not binary. */
export function isBinaryFile(filePath: string): boolean {
  if (isSvgFile(filePath)) {
    return false;
  }
  const ext = getFileExtension(filePath);
  return BINARY_FILE_EXTENSIONS.has(ext);
}

/**
 * Heuristic for UTF-8 text that is actually binary (or was lossily decoded).
 * Used as defense-in-depth when extension checks miss a binary file.
 */
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
  // ZIP-based formats (docx/xlsx/pptx/jar/apk…) and raw ZIP.
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
  if (isShellTool(toolName) && typeof input.command === 'string') return input.command;
  if (isWriteTool(toolName) && typeof input.content === 'string') return input.content;
  // Keep complete structured native edit/task/custom-tool inputs visible.
  return JSON.stringify(input, null, 2);
}
