import type { ToolCallPart } from '@openchamber/agent-contract';

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
 askAnswers,
 toolBaseName,
 toolPresentation,
} from '@/lib/toolPresentation';

<<<<<<< HEAD
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
 askAnswers,
 isFindTool,
 isGlobTool,
 isGrepTool,
 isWebSearchTool,
 toolBaseName,
 toolPresentation,
||||||| bc50ba56aa
/** v2 file tools report `path`; the other keys cover MCP and plugin tools. */
const readInputPath = (input: Record<string, unknown> | undefined): string | null => {
  const value = input?.path ?? input?.filePath ?? input?.file_path ?? input?.sourcePath;
  return typeof value === 'string' && value.length > 0 ? value : null;
=======
const readInputPath = (input: Record<string, unknown> | undefined): string | null => {
  const value = input?.path ?? input?.filePath ?? input?.file_path ?? input?.sourcePath;
  return typeof value === 'string' && value.length > 0 ? value : null;
>>>>>>> upstream/main
};

/** Inline native selectors are presentation instructions, never editor paths. */
export function parseNativeReadPath(rawPath: string): { path: string; line?: number } {
 const selectorIndex = rawPath.search(/:(?=\d|-\d|raw(?:$|:)|img$|conflicts$)[^/]*$/);
 if (selectorIndex < 0) return { path: rawPath };
 const selector = rawPath.slice(selectorIndex + 1).replace(/^raw:/, '');
 const firstLine = /^(\d+)(?=$|[-+,:])/.exec(selector);
 return { path: rawPath.slice(0, selectorIndex), ...(firstLine ? { line: Number(firstLine[1]) } : {}) };
}

<<<<<<< HEAD
const inputPathOf = (input: ToolCallPart['input'] | undefined): string | null => {
 const path = input?.path;
 if (typeof path === 'string' && path.trim()) return path;
 const filePath = input?.file_path;
 return typeof filePath === 'string' && filePath.trim() ? filePath : null;
||||||| bc50ba56aa
const TOOL_METADATA: Record<string, ToolMetadata> = {

  read: {
    displayName: 'Read File',
    category: 'file',
    outputLanguage: 'auto',
    inputFields: [
      { key: 'path', label: 'File Path', type: 'file' },
      { key: 'offset', label: 'Start Line', type: 'text' },
      { key: 'limit', label: 'Lines to Read', type: 'text' }
    ]
  },
  write: {
    displayName: 'Write File',
    category: 'file',
    outputLanguage: 'auto',
    inputFields: [
      { key: 'path', label: 'File Path', type: 'file' },
      { key: 'content', label: 'Content', type: 'code' }
    ]
  },
  edit: {
    displayName: 'Edit File',
    category: 'file',
    outputLanguage: 'diff',
    inputFields: [
      { key: 'path', label: 'File Path', type: 'file' },
      { key: 'oldString', label: 'Find', type: 'code' },
      { key: 'newString', label: 'Replace', type: 'code' },
      { key: 'replaceAll', label: 'Replace All', type: 'text' }
    ]
  },
  patch: {
    displayName: 'Apply Patch',
    category: 'file',
    outputLanguage: 'diff',
    inputFields: [
      { key: 'patchText', label: 'Patch', type: 'code', language: 'diff' }
    ]
  },

  // OpenCode 2 Code Mode: one tool whose input is a short JS script that calls
  // the MCP and integration tools as functions.
  execute: {
    displayName: 'Script',
    category: 'code',
    outputLanguage: 'json',
    inputFields: [
      { key: 'code', label: 'Script', type: 'code', language: 'javascript' }
    ]
  },

  shell: {
    displayName: 'Shell Command',
    category: 'system',
    outputLanguage: 'text',
    inputFields: [
      { key: 'command', label: 'Command', type: 'command', language: 'bash' },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'timeout', label: 'Timeout (ms)', type: 'text' },
      { key: 'background', label: 'Background', type: 'text' }
    ]
  },

  grep: {
    displayName: 'Search Files',
    category: 'search',
    outputLanguage: 'text',
    inputFields: [
      { key: 'pattern', label: 'Pattern', type: 'pattern' },
      { key: 'path', label: 'Directory', type: 'file' },
      { key: 'include', label: 'Include Pattern', type: 'pattern' },
      { key: 'literal', label: 'Literal Match', type: 'text' },
      { key: 'caseSensitive', label: 'Case Sensitive', type: 'text' }
    ]
  },
  glob: {
    displayName: 'Find Files',
    category: 'search',
    outputLanguage: 'text',
    inputFields: [
      { key: 'pattern', label: 'Pattern', type: 'pattern' },
      { key: 'path', label: 'Directory', type: 'file' }
    ]
  },
  subagent: {
    displayName: 'Agent Task',
    category: 'ai',
    outputLanguage: 'markdown',
    inputFields: [
      { key: 'description', label: 'Task', type: 'text' },
      { key: 'prompt', label: 'Instructions', type: 'text' },
      { key: 'agent', label: 'Agent', type: 'text' }
    ]
  },

  webfetch: {
    displayName: 'Fetch URL',
    category: 'web',
    outputLanguage: 'auto',
    inputFields: [
      { key: 'url', label: 'URL', type: 'text' },
      { key: 'format', label: 'Format', type: 'text' },
      { key: 'timeout', label: 'Timeout', type: 'text' }
    ]
  },

   websearch: {
     displayName: 'Web Search',
     category: 'web',
     outputLanguage: 'markdown',
     inputFields: [
       { key: 'query', label: 'Search Query', type: 'text' },
       { key: 'numResults', label: 'Results Count', type: 'text' },
       { key: 'type', label: 'Search Type', type: 'text' }
     ]
   },
   codesearch: {
     displayName: 'Code Search',
     category: 'web',
     outputLanguage: 'markdown',
     inputFields: [
       { key: 'query', label: 'Search Query', type: 'text' },
       { key: 'tokensNum', label: 'Tokens', type: 'text' }
     ]
   },

   skill: {
     displayName: 'Load Skill',
     category: 'ai',
     outputLanguage: 'markdown',
     inputFields: [
       { key: 'id', label: 'Skill', type: 'text' }
     ]
   },
    question: {
       displayName: 'Question',
       category: 'ai',
       outputLanguage: 'text',
       inputFields: [
         { key: 'questions', label: 'Questions', type: 'code', language: 'json' }
       ]
     },

    openchamber: {
      displayName: 'OpenChamber',
      category: 'system',
      outputLanguage: 'json',
      inputFields: []
    },

    openchamber_schedule: {
      displayName: 'OpenChamber Schedule',
      category: 'system',
      outputLanguage: 'json',
      inputFields: []
    },

    openchamber_web: {
      displayName: 'OpenChamber Web',
      category: 'system',
      outputLanguage: 'json',
      inputFields: []
    },

    openchamber_memory: {
      displayName: 'OpenChamber Memory',
      category: 'system',
      outputLanguage: 'json',
      inputFields: []
    },

    openchamber_knowledge: {
      displayName: 'OpenChamber Knowledge',
      category: 'system',
      outputLanguage: 'json',
      inputFields: []
    },

    openchamber_notify: {
      displayName: 'OpenChamber Notify',
      category: 'system',
      outputLanguage: 'json',
      inputFields: []
    },

    openchamber_usage: {
      displayName: 'OpenChamber Usage',
      category: 'system',
      outputLanguage: 'json',
      inputFields: []
    },

    openchamber_render: {
      displayName: 'OpenChamber Render',
      category: 'system',
      outputLanguage: 'json',
      inputFields: []
    },

    openchamber_image: {
      displayName: 'OpenChamber Image',
      category: 'system',
      outputLanguage: 'json',
      inputFields: []
    },

    openchamber_secret: {
      displayName: 'OpenChamber Secret',
      category: 'system',
      outputLanguage: 'json',
      inputFields: []
    },

    openchamber_workflow: {
      displayName: 'OpenChamber Workflow',
      category: 'system',
      outputLanguage: 'json',
      inputFields: []
    },

    plan_enter: {
      displayName: 'Plan Mode',
      category: 'ai',
      outputLanguage: 'text',
      inputFields: []
    },

    plan_exit: {
      displayName: 'Build Mode',
      category: 'ai',
      outputLanguage: 'text',
      inputFields: []
    },

    StructuredOutput: {
      displayName: 'Structured Output',
      category: 'ai',
      outputLanguage: 'json',
      inputFields: []
    },

    structuredoutput: {
      displayName: 'Structured Output',
      category: 'ai',
      outputLanguage: 'json',
      inputFields: []
    }
  };

function formatUnknownToolDisplayName(toolName: string): string {
  return toolName
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^./, (char) => char.toUpperCase());
}

// OpenCode's `opencode` namespace goes by one name, as OpenChamber's tools do;
// what each call did is the row's description.
const OPENCODE_NAMESPACE_METADATA: ToolMetadata = {
  displayName: 'OpenCode',
  category: 'system',
  outputLanguage: 'json',
  inputFields: []
=======
const TOOL_METADATA: Record<string, ToolMetadata> = {

  read: {
    displayName: 'Read File',
    category: 'file',
    outputLanguage: 'auto',
    inputFields: [
      { key: 'path', label: 'File Path', type: 'file' },
      { key: 'offset', label: 'Start Line', type: 'text' },
      { key: 'limit', label: 'Lines to Read', type: 'text' }
    ]
  },
  write: {
    displayName: 'Write File',
    category: 'file',
    outputLanguage: 'auto',
    inputFields: [
      { key: 'path', label: 'File Path', type: 'file' },
      { key: 'content', label: 'Content', type: 'code' }
    ]
  },
  edit: {
    displayName: 'Edit File',
    category: 'file',
    outputLanguage: 'diff',
    inputFields: [
      { key: 'path', label: 'File Path', type: 'file' },
      { key: 'oldString', label: 'Find', type: 'code' },
      { key: 'newString', label: 'Replace', type: 'code' },
      { key: 'replaceAll', label: 'Replace All', type: 'text' }
    ]
  },
  patch: {
    displayName: 'Apply Patch',
    category: 'file',
    outputLanguage: 'diff',
    inputFields: [
      { key: 'patchText', label: 'Patch', type: 'code', language: 'diff' }
    ]
  },

  execute: {
    displayName: 'Script',
    category: 'code',
    outputLanguage: 'json',
    inputFields: [
      { key: 'code', label: 'Script', type: 'code', language: 'javascript' }
    ]
  },

  shell: {
    displayName: 'Shell Command',
    category: 'system',
    outputLanguage: 'text',
    inputFields: [
      { key: 'command', label: 'Command', type: 'command', language: 'bash' },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'timeout', label: 'Timeout (ms)', type: 'text' },
      { key: 'background', label: 'Background', type: 'text' }
    ]
  },

  grep: {
    displayName: 'Search Files',
    category: 'search',
    outputLanguage: 'text',
    inputFields: [
      { key: 'pattern', label: 'Pattern', type: 'pattern' },
      { key: 'path', label: 'Directory', type: 'file' },
      { key: 'include', label: 'Include Pattern', type: 'pattern' },
      { key: 'literal', label: 'Literal Match', type: 'text' },
      { key: 'caseSensitive', label: 'Case Sensitive', type: 'text' }
    ]
  },
  glob: {
    displayName: 'Find Files',
    category: 'search',
    outputLanguage: 'text',
    inputFields: [
      { key: 'pattern', label: 'Pattern', type: 'pattern' },
      { key: 'path', label: 'Directory', type: 'file' }
    ]
  },
  subagent: {
    displayName: 'Agent Task',
    category: 'ai',
    outputLanguage: 'markdown',
    inputFields: [
      { key: 'description', label: 'Task', type: 'text' },
      { key: 'prompt', label: 'Instructions', type: 'text' },
      { key: 'agent', label: 'Agent', type: 'text' }
    ]
  },

  webfetch: {
    displayName: 'Fetch URL',
    category: 'web',
    outputLanguage: 'auto',
    inputFields: [
      { key: 'url', label: 'URL', type: 'text' },
      { key: 'format', label: 'Format', type: 'text' },
      { key: 'timeout', label: 'Timeout', type: 'text' }
    ]
  },

   websearch: {
     displayName: 'Web Search',
     category: 'web',
     outputLanguage: 'markdown',
     inputFields: [
       { key: 'query', label: 'Search Query', type: 'text' },
       { key: 'numResults', label: 'Results Count', type: 'text' },
       { key: 'type', label: 'Search Type', type: 'text' }
     ]
   },
   codesearch: {
     displayName: 'Code Search',
     category: 'web',
     outputLanguage: 'markdown',
     inputFields: [
       { key: 'query', label: 'Search Query', type: 'text' },
       { key: 'tokensNum', label: 'Tokens', type: 'text' }
     ]
   },

   skill: {
     displayName: 'Load Skill',
     category: 'ai',
     outputLanguage: 'markdown',
     inputFields: [
       { key: 'id', label: 'Skill', type: 'text' }
     ]
   },
    question: {
       displayName: 'Question',
       category: 'ai',
       outputLanguage: 'text',
       inputFields: [
         { key: 'questions', label: 'Questions', type: 'code', language: 'json' }
       ]
     },

    todowrite: {
      displayName: 'Tasks',
      category: 'ai',
      outputLanguage: 'text',
      inputFields: []
    },

    openchamber: {
      displayName: 'OpenChamber',
      category: 'system',
      outputLanguage: 'json',
      inputFields: []
    },

    openchamber_schedule: {
      displayName: 'OpenChamber Schedule',
      category: 'system',
      outputLanguage: 'json',
      inputFields: []
    },

    openchamber_web: {
      displayName: 'OpenChamber Web',
      category: 'system',
      outputLanguage: 'json',
      inputFields: []
    },

    openchamber_memory: {
      displayName: 'OpenChamber Memory',
      category: 'system',
      outputLanguage: 'json',
      inputFields: []
    },

    openchamber_knowledge: {
      displayName: 'OpenChamber Knowledge',
      category: 'system',
      outputLanguage: 'json',
      inputFields: []
    },

    openchamber_notify: {
      displayName: 'OpenChamber Notify',
      category: 'system',
      outputLanguage: 'json',
      inputFields: []
    },

    openchamber_usage: {
      displayName: 'OpenChamber Usage',
      category: 'system',
      outputLanguage: 'json',
      inputFields: []
    },

    openchamber_render: {
      displayName: 'OpenChamber Render',
      category: 'system',
      outputLanguage: 'json',
      inputFields: []
    },

    openchamber_image: {
      displayName: 'OpenChamber Image',
      category: 'system',
      outputLanguage: 'json',
      inputFields: []
    },

    openchamber_secret: {
      displayName: 'OpenChamber Secret',
      category: 'system',
      outputLanguage: 'json',
      inputFields: []
    },

    openchamber_workflow: {
      displayName: 'OpenChamber Workflow',
      category: 'system',
      outputLanguage: 'json',
      inputFields: []
    },

    plan_enter: {
      displayName: 'Plan Mode',
      category: 'ai',
      outputLanguage: 'text',
      inputFields: []
    },

    plan_exit: {
      displayName: 'Build Mode',
      category: 'ai',
      outputLanguage: 'text',
      inputFields: []
    },

    StructuredOutput: {
      displayName: 'Structured Output',
      category: 'ai',
      outputLanguage: 'json',
      inputFields: []
    },

    structuredoutput: {
      displayName: 'Structured Output',
      category: 'ai',
      outputLanguage: 'json',
      inputFields: []
    }
  };

function formatUnknownToolDisplayName(toolName: string): string {
  return toolName
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^./, (char) => char.toUpperCase());
}

const OPENCODE_NAMESPACE_METADATA: ToolMetadata = {
  displayName: 'OpenCode',
  category: 'system',
  outputLanguage: 'json',
  inputFields: []
>>>>>>> upstream/main
};

<<<<<<< HEAD
export const toolInputPath = inputPathOf;
||||||| bc50ba56aa
export function getToolMetadata(toolName: string): ToolMetadata {
  // The namespace itself names a script whose calls all went to it.
  if (toolName === 'opencode' || opencodeNamespaceTool(toolName)) return OPENCODE_NAMESPACE_METADATA;
  // Namespaced tools (`opencode.session_rename`) are keyed by their last segment.
  return TOOL_METADATA[toolName] || TOOL_METADATA[normalizeToolName(toolName)] || {
    displayName: formatUnknownToolDisplayName(toolName),
    category: 'system',
    outputLanguage: 'text',
    inputFields: []
  };
}
=======
export function getToolMetadata(toolName: string): ToolMetadata {
  if (toolName === 'opencode' || opencodeNamespaceTool(toolName)) return OPENCODE_NAMESPACE_METADATA;
  return TOOL_METADATA[toolName] || TOOL_METADATA[normalizeToolName(toolName)] || {
    displayName: formatUnknownToolDisplayName(toolName),
    category: 'system',
    outputLanguage: 'text',
    inputFields: []
  };
}
>>>>>>> upstream/main

export function toolInputPaths(call: ToolCallPart): string[] {
 const path = toolInputPath(call.input);
 const paths = path ? [path] : [];
 if (isEditTool(call.toolName) && Array.isArray(call.input.edits)) {
  for (const edit of call.input.edits) {
   if (edit && typeof edit === 'object' && !Array.isArray(edit) && typeof edit.rename === 'string' && !paths.includes(edit.rename)) paths.push(edit.rename);
  }
 } else if (isAstEditTool(call.toolName)) {
  if (Array.isArray(call.input.paths)) {
   for (const candidate of call.input.paths) {
    if (typeof candidate === 'string' && !paths.includes(candidate)) paths.push(candidate);
   }
  } else if (typeof call.input.path === 'string' && !paths.includes(call.input.path)) {
   paths.push(call.input.path);
  }
 }
 // Raw edit modes carry a native program, not a path field. Their resolved
 // targets come from the result's details, not a guessed client-side parser.
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
<<<<<<< HEAD
 const ext = filePath.split('.').pop()?.toLowerCase();
||||||| bc50ba56aa
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
=======
  const ext = filePath.split('.').pop()?.toLowerCase();
  
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
>>>>>>> upstream/main

<<<<<<< HEAD
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
||||||| bc50ba56aa
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
=======
  const languageMap: Record<string, string> = {
    'js': 'javascript',
    'jsx': 'jsx',
    'ts': 'typescript',
    'tsx': 'tsx',
    'mjs': 'javascript',
    'cjs': 'javascript',
    'mts': 'typescript',
    'cts': 'typescript',
>>>>>>> upstream/main

<<<<<<< HEAD
 if (filenameMap[filename]) {
  return filenameMap[filename];
 }
||||||| bc50ba56aa
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
=======
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
>>>>>>> upstream/main

<<<<<<< HEAD
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
||||||| bc50ba56aa
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
=======
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
>>>>>>> upstream/main

<<<<<<< HEAD
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
||||||| bc50ba56aa
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
=======
    'py': 'python',
    'pyw': 'python',
    'pyx': 'python',
    'pxd': 'python',
    'pxi': 'python',
    'pyi': 'python',
    'gyp': 'python',
    'gypi': 'python',
    'bzl': 'python',
>>>>>>> upstream/main

<<<<<<< HEAD
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
||||||| bc50ba56aa
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
=======
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
>>>>>>> upstream/main

<<<<<<< HEAD
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
||||||| bc50ba56aa
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
=======
    'php': 'php',
    'phtml': 'php',
    'php3': 'php',
    'php4': 'php',
    'php5': 'php',
    'php7': 'php',
    'phps': 'php',
    'tpl': 'php',
    'ctp': 'php',
    'phpt': 'php',
    'inc': 'php',
    'blade.php': 'php',
>>>>>>> upstream/main

<<<<<<< HEAD
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
||||||| bc50ba56aa
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
=======
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
>>>>>>> upstream/main

<<<<<<< HEAD
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
||||||| bc50ba56aa
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
=======
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
>>>>>>> upstream/main

<<<<<<< HEAD
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
||||||| bc50ba56aa
    // C#/F#/.NET
    'cs': 'csharp',
    'csx': 'csharp',
    'cake': 'csharp',
    'fs': 'fsharp',
    'fsx': 'fsharp',
    'fsi': 'fsharp',
    'vb': 'vbnet',
=======
    'cs': 'csharp',
    'csx': 'csharp',
    'cake': 'csharp',
    'fs': 'fsharp',
    'fsx': 'fsharp',
    'fsi': 'fsharp',
    'vb': 'vbnet',
>>>>>>> upstream/main

<<<<<<< HEAD
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
||||||| bc50ba56aa
    // Go
    'go': 'go',
    'mod': 'go',
    'sum': 'text',
=======
    'go': 'go',
    'mod': 'go',
    'sum': 'text',
>>>>>>> upstream/main

<<<<<<< HEAD
  // C#/F#/.NET
  'cs': 'csharp',
  'csx': 'csharp',
  'cake': 'csharp',
  'fs': 'fsharp',
  'fsx': 'fsharp',
  'fsi': 'fsharp',
  'vb': 'vbnet',
||||||| bc50ba56aa
    // Rust
    'rs': 'rust',
=======
    'rs': 'rust',
>>>>>>> upstream/main

<<<<<<< HEAD
  // Go
  'go': 'go',
  'mod': 'go',
  'sum': 'text',
||||||| bc50ba56aa
    // Swift
    'swift': 'swift',
=======
    'swift': 'swift',
>>>>>>> upstream/main

<<<<<<< HEAD
  // Rust
  'rs': 'rust',
||||||| bc50ba56aa
    // Dart
    'dart': 'dart',
=======
    'dart': 'dart',
>>>>>>> upstream/main

<<<<<<< HEAD
  // Swift
  'swift': 'swift',
||||||| bc50ba56aa
    // Lua
    'lua': 'lua',
=======
    'lua': 'lua',
>>>>>>> upstream/main

<<<<<<< HEAD
  // Dart
  'dart': 'dart',
||||||| bc50ba56aa
    // Perl
    'pl': 'perl',
    'pm': 'perl',
    'pod': 'perl',
    't': 'perl',
=======
    'pl': 'perl',
    'pm': 'perl',
    'pod': 'perl',
    't': 'perl',
>>>>>>> upstream/main

<<<<<<< HEAD
  // Lua
  'lua': 'lua',
||||||| bc50ba56aa
    // R
    'r': 'r',
    'R': 'r',
    'rmd': 'markdown',
    'rnw': 'r',
=======
    'r': 'r',
    'R': 'r',
    'rmd': 'markdown',
    'rnw': 'r',
>>>>>>> upstream/main

<<<<<<< HEAD
  // Perl
  'pl': 'perl',
  'pm': 'perl',
  'pod': 'perl',
  't': 'perl',
||||||| bc50ba56aa
    // Julia
    'jl': 'julia',
=======
    'jl': 'julia',
>>>>>>> upstream/main

<<<<<<< HEAD
  // R
  'r': 'r',
  'R': 'r',
  'rmd': 'markdown',
  'rnw': 'r',
||||||| bc50ba56aa
    // Haskell
    'hs': 'haskell',
    'lhs': 'haskell',
=======
    'hs': 'haskell',
    'lhs': 'haskell',
>>>>>>> upstream/main

<<<<<<< HEAD
  // Julia
  'jl': 'julia',
||||||| bc50ba56aa
    // Elixir/Erlang
    'ex': 'elixir',
    'exs': 'elixir',
    'eex': 'html',
    'heex': 'html',
    'leex': 'html',
    'erl': 'erlang',
    'hrl': 'erlang',
=======
    'ex': 'elixir',
    'exs': 'elixir',
    'eex': 'html',
    'heex': 'html',
    'leex': 'html',
    'erl': 'erlang',
    'hrl': 'erlang',
>>>>>>> upstream/main

<<<<<<< HEAD
  // Haskell
  'hs': 'haskell',
  'lhs': 'haskell',
||||||| bc50ba56aa
    // Clojure
    'clj': 'clojure',
    'cljs': 'clojure',
    'cljc': 'clojure',
    'edn': 'clojure',
=======
    'clj': 'clojure',
    'cljs': 'clojure',
    'cljc': 'clojure',
    'edn': 'clojure',
>>>>>>> upstream/main

<<<<<<< HEAD
  // Elixir/Erlang
  'ex': 'elixir',
  'exs': 'elixir',
  'eex': 'html',
  'heex': 'html',
  'leex': 'html',
  'erl': 'erlang',
  'hrl': 'erlang',
||||||| bc50ba56aa
    // Lisp/Scheme
    'lisp': 'lisp',
    'cl': 'lisp',
    'el': 'lisp',
    'scm': 'scheme',
    'ss': 'scheme',
    'rkt': 'scheme',
=======
    'lisp': 'lisp',
    'cl': 'lisp',
    'el': 'lisp',
    'scm': 'scheme',
    'ss': 'scheme',
    'rkt': 'scheme',
>>>>>>> upstream/main

<<<<<<< HEAD
  // Clojure
  'clj': 'clojure',
  'cljs': 'clojure',
  'cljc': 'clojure',
  'edn': 'clojure',
||||||| bc50ba56aa
    // OCaml/ReasonML
    'ml': 'ocaml',
    'mli': 'ocaml',
    're': 'reason',
    'rei': 'reason',
=======
    'ml': 'ocaml',
    'mli': 'ocaml',
    're': 'reason',
    'rei': 'reason',
>>>>>>> upstream/main

<<<<<<< HEAD
  // Lisp/Scheme
  'lisp': 'lisp',
  'cl': 'lisp',
  'el': 'lisp',
  'scm': 'scheme',
  'ss': 'scheme',
  'rkt': 'scheme',
||||||| bc50ba56aa
    // Nim
    'nim': 'nim',
    'nims': 'nim',
    'nimble': 'nim',
=======
    'nim': 'nim',
    'nims': 'nim',
    'nimble': 'nim',
>>>>>>> upstream/main

<<<<<<< HEAD
  // OCaml/ReasonML
  'ml': 'ocaml',
  'mli': 'ocaml',
  're': 'reason',
  'rei': 'reason',
||||||| bc50ba56aa
    // Zig
    'zig': 'zig',
=======
    'zig': 'zig',
>>>>>>> upstream/main

<<<<<<< HEAD
  // Nim
  'nim': 'nim',
  'nims': 'nim',
  'nimble': 'nim',
||||||| bc50ba56aa
    // V
    'v': 'v',
    'vsh': 'v',
=======
    'v': 'v',
    'vsh': 'v',
>>>>>>> upstream/main

<<<<<<< HEAD
  // Zig
  'zig': 'zig',
||||||| bc50ba56aa
    // Crystal
    'cr': 'crystal',
=======
    'cr': 'crystal',
>>>>>>> upstream/main

<<<<<<< HEAD
  // V
  'v': 'v',
  'vsh': 'v',
||||||| bc50ba56aa
    // D
    'd': 'd',
    'di': 'd',
=======
    'd': 'd',
    'di': 'd',
>>>>>>> upstream/main

<<<<<<< HEAD
  // Crystal
  'cr': 'crystal',
||||||| bc50ba56aa
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
=======
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
>>>>>>> upstream/main

<<<<<<< HEAD
  // D
  'd': 'd',
  'di': 'd',
||||||| bc50ba56aa
    // SQL
    'sql': 'sql',
    'psql': 'sql',
    'plsql': 'sql',
    'mysql': 'sql',
    'pgsql': 'sql',
    'sqlite': 'sql',
=======
    'sql': 'sql',
    'psql': 'sql',
    'plsql': 'sql',
    'mysql': 'sql',
    'pgsql': 'sql',
    'sqlite': 'sql',
>>>>>>> upstream/main

<<<<<<< HEAD
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
||||||| bc50ba56aa
    // GraphQL
    'graphql': 'graphql',
    'gql': 'graphql',
=======
    'graphql': 'graphql',
    'gql': 'graphql',
>>>>>>> upstream/main

<<<<<<< HEAD
  // SQL
  'sql': 'sql',
  'psql': 'sql',
  'plsql': 'sql',
  'mysql': 'sql',
  'pgsql': 'sql',
  'sqlite': 'sql',
||||||| bc50ba56aa
    // Solidity
    'sol': 'solidity',
=======
    'sol': 'solidity',
>>>>>>> upstream/main

<<<<<<< HEAD
  // GraphQL
  'graphql': 'graphql',
  'gql': 'graphql',
||||||| bc50ba56aa
    // Assembly
    'asm': 'nasm',
    's': 'nasm',
    'S': 'nasm',
=======
    'asm': 'nasm',
    's': 'nasm',
    'S': 'nasm',
>>>>>>> upstream/main

<<<<<<< HEAD
  // Solidity
  'sol': 'solidity',
||||||| bc50ba56aa
    // Nix
    'nix': 'nix',
=======
    'nix': 'nix',
>>>>>>> upstream/main

<<<<<<< HEAD
  // Assembly
  'asm': 'nasm',
  's': 'nasm',
  'S': 'nasm',
||||||| bc50ba56aa
    // Terraform/HCL
    'tf': 'hcl',
    'tfvars': 'hcl',
    'hcl': 'hcl',
=======
    'tf': 'hcl',
    'tfvars': 'hcl',
    'hcl': 'hcl',
>>>>>>> upstream/main

<<<<<<< HEAD
  // Nix
  'nix': 'nix',
||||||| bc50ba56aa
    // Docker
    'dockerignore': 'text',
=======
    'dockerignore': 'text',
>>>>>>> upstream/main

<<<<<<< HEAD
  // Terraform/HCL
  'tf': 'hcl',
  'tfvars': 'hcl',
  'hcl': 'hcl',
||||||| bc50ba56aa
    // Puppet
    'pp': 'puppet',
=======
    'pp': 'puppet',
>>>>>>> upstream/main

<<<<<<< HEAD
  // Docker
  'dockerignore': 'text',
||||||| bc50ba56aa
    // LaTeX
    'tex': 'latex',
    'latex': 'latex',
    'sty': 'latex',
    'cls': 'latex',
    'bib': 'bibtex',
    'bst': 'bibtex',
=======
    'tex': 'latex',
    'latex': 'latex',
    'sty': 'latex',
    'cls': 'latex',
    'bib': 'bibtex',
    'bst': 'bibtex',
>>>>>>> upstream/main

<<<<<<< HEAD
  // Puppet
  'pp': 'puppet',
||||||| bc50ba56aa
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
=======
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
>>>>>>> upstream/main

<<<<<<< HEAD
  // LaTeX
  'tex': 'latex',
  'latex': 'latex',
  'sty': 'latex',
  'cls': 'latex',
  'bib': 'bibtex',
  'bst': 'bibtex',
||||||| bc50ba56aa
    // Vim
    'vim': 'vim',
    'vimrc': 'vim',
=======
    'vim': 'vim',
    'vimrc': 'vim',
>>>>>>> upstream/main

<<<<<<< HEAD
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
||||||| bc50ba56aa
    // Makefile variants
    'mk': 'makefile',
=======
    'mk': 'makefile',
>>>>>>> upstream/main

<<<<<<< HEAD
  // Vim
  'vim': 'vim',
  'vimrc': 'vim',
||||||| bc50ba56aa
    // CMake
    'cmake': 'cmake',
=======
    'cmake': 'cmake',
>>>>>>> upstream/main

<<<<<<< HEAD
  // Makefile variants
  'mk': 'makefile',
||||||| bc50ba56aa
    // Diff/Patch
    'diff': 'diff',
    'patch': 'diff',
=======
    'diff': 'diff',
    'patch': 'diff',
>>>>>>> upstream/main

  // CMake
  'cmake': 'cmake',

  // Diff/Patch
  'diff': 'diff',
  'patch': 'diff',

<<<<<<< HEAD
  // Prisma
  'prisma': 'prisma',
||||||| bc50ba56aa
    // Prisma
    'prisma': 'prisma',
=======
    'prisma': 'prisma',
>>>>>>> upstream/main

<<<<<<< HEAD
  // Protocol Buffers
  'proto': 'protobuf',
||||||| bc50ba56aa
    // Protocol Buffers
    'proto': 'protobuf',
=======
    'proto': 'protobuf',
>>>>>>> upstream/main

<<<<<<< HEAD
  // Thrift
  'thrift': 'thrift',
||||||| bc50ba56aa
    // Thrift
    'thrift': 'thrift',
=======
    'thrift': 'thrift',
>>>>>>> upstream/main

<<<<<<< HEAD
  // WASM
  'wat': 'wasm',
  'wast': 'wasm',
||||||| bc50ba56aa
    // WASM
    'wat': 'wasm',
    'wast': 'wasm',
=======
    'wat': 'wasm',
    'wast': 'wasm',
>>>>>>> upstream/main

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

<<<<<<< HEAD
  // Kubernetes
  'kubeconfig': 'yaml',
||||||| bc50ba56aa
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
=======
    'glsl': 'glsl',
    'vert': 'glsl',
    'frag': 'glsl',
    'geom': 'glsl',
    'comp': 'glsl',
    'hlsl': 'hlsl',
    'fx': 'hlsl',
    'cg': 'cg',
    'shader': 'glsl',
>>>>>>> upstream/main

<<<<<<< HEAD
  // Ansible
  'ansible': 'yaml',
 };
||||||| bc50ba56aa
    // Apache/Nginx config
    'htaccess': 'apacheconf',
    'nginx': 'nginx',
=======
    'htaccess': 'apacheconf',
    'nginx': 'nginx',
>>>>>>> upstream/main

<<<<<<< HEAD
 return languageMap[ext || ''] || null;
||||||| bc50ba56aa
    // Kubernetes
    'kubeconfig': 'yaml',

    // Ansible
    'ansible': 'yaml',
  };

  return languageMap[ext || ''] || null;
=======
    'kubeconfig': 'yaml',

    'ansible': 'yaml',
  };

  return languageMap[ext || ''] || null;
>>>>>>> upstream/main
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
<<<<<<< HEAD
/** Office documents the viewer can draw. The older doc, xls and ppt formats stay downloads. */
const OFFICE_PREVIEW_EXTENSIONS: Record<string, true> = {
 docx: true, xlsx: true, pptx: true, odt: true, ods: true, odp: true,
};
||||||| bc50ba56aa

/** Office documents the viewer can draw. The older doc, xls and ppt formats stay downloads. */
const OFFICE_PREVIEW_EXTENSIONS = new Set(['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp']);
=======

const OFFICE_PREVIEW_EXTENSIONS = new Set(['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp']);
>>>>>>> upstream/main

export function isOfficePreviewFile(filePath: string): boolean {
<<<<<<< HEAD
 return Boolean(OFFICE_PREVIEW_EXTENSIONS[getFileExtension(filePath)]);
||||||| bc50ba56aa
  return OFFICE_PREVIEW_EXTENSIONS.has(getFileExtension(filePath));
}

export function isNotebookFile(filePath: string): boolean {
  return getFileExtension(filePath) === 'ipynb';
}

/** Zip archives under the names they go by. */
export function isArchiveFile(filePath: string): boolean {
  return ['zip', 'jar', 'war'].includes(getFileExtension(filePath));
}

/** Tables kept in a binary file, read in the viewer. */
export function isDataFile(filePath: string): boolean {
  return ['sqlite', 'sqlite3', 'db', 'parquet'].includes(getFileExtension(filePath));
}

/** Files whose diff is the two versions themselves, not a text patch. */
export function hasFileVersionsDiff(filePath: string): boolean {
  return isImageFile(filePath) || isOfficePreviewFile(filePath);
=======
  return OFFICE_PREVIEW_EXTENSIONS.has(getFileExtension(filePath));
}

export function isNotebookFile(filePath: string): boolean {
  return getFileExtension(filePath) === 'ipynb';
}

export function isArchiveFile(filePath: string): boolean {
  return ['zip', 'jar', 'war'].includes(getFileExtension(filePath));
}

export function isDataFile(filePath: string): boolean {
  return ['sqlite', 'sqlite3', 'db', 'parquet'].includes(getFileExtension(filePath));
}

export function hasFileVersionsDiff(filePath: string): boolean {
  return isImageFile(filePath) || isOfficePreviewFile(filePath);
>>>>>>> upstream/main
}

export function isMermaidFile(filePath: string): boolean {
 const ext = getFileExtension(filePath);
 return ext === 'mmd' || ext === 'mermaid';
}

const BINARY_FILE_EXTENSIONS = new Set([
<<<<<<< HEAD
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
||||||| bc50ba56aa
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
=======
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp',
  'zip', 'rar', '7z', 'gz', 'tgz', 'tar', 'bz2', 'xz', 'jar', 'war', 'apk', 'dmg', 'iso',
  'deb', 'rpm', 'msi',
  ...IMAGE_EXTENSIONS.filter((ext) => ext !== 'svg'),
  ...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS, 'wma', 'avi', 'wmv',
  ...FONT_EXTENSIONS, 'eot',
  'exe', 'dll', 'so', 'dylib', 'bin', 'class', 'o', 'a', 'lib', 'wasm', 'node',
  'sqlite', 'sqlite3', 'db', 'dat', 'parquet', 'feather', 'pickle', 'pyc', 'pyo', 'lockb',
>>>>>>> upstream/main
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

<<<<<<< HEAD
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
||||||| bc50ba56aa
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
=======
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
>>>>>>> upstream/main

<<<<<<< HEAD
 let suspicious = 0;
 for (let index = 0; index < sample.length; index += 1) {
  const code = sample.charCodeAt(index);
  if (code === 0xFFFD) {
   suspicious += 1;
   continue;
||||||| bc50ba56aa
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
=======
  let suspicious = 0;
  for (let index = 0; index < sample.length; index += 1) {
    const code = sample.charCodeAt(index);
    if (code === 0xFFFD) {
      suspicious += 1;
      continue;
    }
    if (code < 9 || (code > 13 && code < 32) || code === 127) {
      suspicious += 1;
    }
>>>>>>> upstream/main
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
 if (isEvalTool(toolName) && typeof input.code === 'string') return input.code;
 // Keep complete structured native edit/task/custom-tool inputs visible.
 return JSON.stringify(input, null, 2);
}
