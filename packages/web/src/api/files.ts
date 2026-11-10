import type {
  DirectoryListResult,
  FileSearchQuery,
  FileSearchResult,
  FilesAPI,
} from '@openchamber/ui/lib/api/types';
import {
  FilesystemError,
  parseFilesystemErrorReason,
  type FilesystemErrorReason,
} from '@openchamber/ui/lib/api/files-errors';
import { runtimeFetch } from '@openchamber/ui/lib/runtime-fetch';
import { hostFilesystem } from '@openchamber/ui/lib/host-filesystem';
import { shareFileFromNativeApp } from '@openchamber/ui/lib/nativeFileShare';

const normalizePath = (path: string): string => path.replace(/\\/g, '/');

interface WebFilesAPIOptions {
  urls?: unknown;
  getDirectory?: () => string | undefined;
}

type WebDirectoryEntry = {
  name?: string;
  path?: string;
  isDirectory?: boolean;
  isFile?: boolean;
  isSymbolicLink?: boolean;
};

type WebDirectoryListResponse = {
  directory?: string;
  path?: string;
  entries?: WebDirectoryEntry[];
};

type WebFileMutationResponse = {
  success?: boolean;
  path?: string;
  error?: string;
  reason?: FilesystemErrorReason;
  maxBytes?: number;
};

const toDirectoryListResult = (fallbackDirectory: string, payload: WebDirectoryListResponse): DirectoryListResult => {
  if (!payload || !Array.isArray(payload.entries)) {
    throw new FilesystemError('Directory listing returned an invalid response', {
      reason: 'invalid-response',
    });
  }
  const directory = normalizePath(payload?.directory || payload?.path || fallbackDirectory);

  return {
    directory,
    entries: payload.entries
      .filter((entry): entry is Required<Pick<WebDirectoryEntry, 'name' | 'path'>> & { isDirectory?: boolean } =>
        Boolean(entry && typeof entry.name === 'string' && typeof entry.path === 'string')
      )
      .map((entry) => ({
        name: entry.name,
        path: normalizePath(entry.path),
        isDirectory: Boolean(entry.isDirectory),
      })),
  };
};

const requestDirectory = (getDirectory?: () => string | undefined, override?: string): string | undefined =>
  override || getDirectory?.();

const withDirectoryQuery = (query: URLSearchParams, directory: string | undefined): URLSearchParams => {
  if (directory) {
    query.set('directory', directory);
  }
  return query;
};

export const createWebFilesAPI = ({ getDirectory }: WebFilesAPIOptions): FilesAPI => ({
  async listDirectory(path: string, options): Promise<DirectoryListResult> {
    const target = normalizePath(path);
    const params = new URLSearchParams();
    if (target) {
      params.set('path', target);
    }
    if (options?.respectGitignore) {
      params.set('respectGitignore', 'true');
    }

    const response = await runtimeFetch('/api/fs/list', {
      query: withDirectoryQuery(params, requestDirectory(getDirectory)),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText })) as {
        error?: string;
        reason?: unknown;
      };
      throw new FilesystemError(
        error.error || 'Failed to list directory',
        {
          reason: parseFilesystemErrorReason(error.reason),
          status: response.status,
        },
      );
    }

    const result = (await response.json()) as WebDirectoryListResponse;
    return toDirectoryListResult(target, result);
  },

  async search(payload: FileSearchQuery): Promise<FileSearchResult[]> {
    const hits = await hostFilesystem.searchFiles(payload.query, {
      directory: normalizePath(payload.directory),
      limit: payload.maxResults,
      type: 'file',
      includeHidden: payload.includeHidden,
      respectGitignore: payload.respectGitignore,
    });
    return hits.map((hit) => ({ path: hit.path, preview: [hit.relativePath] }));
  },

  async createDirectory(path: string): Promise<{ success: boolean; path: string }> {
    const target = normalizePath(path);
    const directory = requestDirectory(getDirectory);
    const response = await runtimeFetch('/api/fs/mkdir', {
      method: 'POST',
      query: directory ? { directory } : undefined,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: target }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error((error as { error?: string }).error || 'Failed to create directory');
    }

    const result = await response.json();
    return {
      success: Boolean(result?.success),
      path: typeof result?.path === 'string' ? normalizePath(result.path) : target,
    };
  },

  async statFile(path: string, options): Promise<{ path: string; isFile: boolean; size: number; mtimeMs?: number }> {
    const target = normalizePath(path);
    const params = new URLSearchParams({ path: target });
    if (options?.allowOutsideWorkspace) {
      params.set('allowOutsideWorkspace', 'true');
    }
    if (options?.outsideFileGrant) {
      params.set('outsideFileGrant', options.outsideFileGrant);
    }
    const response = await runtimeFetch('/api/fs/stat', {
      query: withDirectoryQuery(params, requestDirectory(getDirectory, options?.directory)),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error((error as { error?: string }).error || 'Failed to stat file');
    }

    const result = await response.json().catch(() => ({}));
    return {
      path: typeof (result as { path?: string }).path === 'string' ? normalizePath((result as { path: string }).path) : target,
      isFile: Boolean((result as { isFile?: boolean }).isFile),
      size: typeof (result as { size?: number }).size === 'number' ? (result as { size: number }).size : 0,
      mtimeMs: typeof (result as { mtimeMs?: number }).mtimeMs === 'number' ? (result as { mtimeMs: number }).mtimeMs : undefined,
    };
  },

  async readFile(path: string, options): Promise<{ content: string; path: string }> {
    const target = normalizePath(path);
    const params = new URLSearchParams({ path: target });
    if (options?.allowOutsideWorkspace) {
      params.set('allowOutsideWorkspace', 'true');
    }
    if (options?.outsideFileGrant) {
      params.set('outsideFileGrant', options.outsideFileGrant);
    }
    if (options?.optional) {
      params.set('optional', 'true');
    }
    const response = await runtimeFetch('/api/fs/read', {
      query: withDirectoryQuery(params, requestDirectory(getDirectory, options?.directory)),
      signal: AbortSignal.timeout(30_000),
      cache: options?.optional || options?.fresh ? 'no-store' : 'default',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error((error as { error?: string }).error || 'Failed to read file');
    }

    const content = await response.text();
    return { content, path: target };
  },

  async writeFile(path: string, content: string): Promise<{ success: boolean; path: string }> {
    const target = normalizePath(path);
    const directory = requestDirectory(getDirectory);
    const response = await runtimeFetch('/api/fs/write', {
      method: 'POST',
      query: directory ? { directory } : undefined,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: target, content }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error((error as { error?: string }).error || 'Failed to write file');
    }

    const result = await response.json().catch(() => ({}));
    return {
      success: Boolean((result as { success?: boolean }).success),
      path: typeof (result as { path?: string }).path === 'string' ? normalizePath((result as { path: string }).path) : target,
    };
  },

  async uploadFile(path: string, file: Blob, options): Promise<{ success: boolean; path: string }> {
    const target = normalizePath(path);
    const response = await runtimeFetch('/api/fs/upload', {
      method: 'POST',
      query: {
        path: target,
        overwrite: options?.overwrite ? 'true' : undefined,
        directory: requestDirectory(getDirectory, options?.directory),
      },
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: file,
    });

    if (!response.ok) {
      const error: WebFileMutationResponse = await response.json().catch(() => ({ error: response.statusText }));
      throw new FilesystemError(error.error || 'Failed to upload file', {
        reason: parseFilesystemErrorReason(error.reason),
        status: response.status,
        maxBytes: error.maxBytes,
      });
    }

    const result: WebFileMutationResponse = await response.json().catch(() => ({}));
    return {
      success: Boolean(result.success),
      path: result.path ? normalizePath(result.path) : target,
    };
  },

  async delete(path: string): Promise<{ success: boolean }> {
    const target = normalizePath(path);
    const directory = requestDirectory(getDirectory);
    const response = await runtimeFetch('/api/fs/delete', {
      method: 'POST',
      query: directory ? { directory } : undefined,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: target }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error((error as { error?: string }).error || 'Failed to delete file');
    }

    const result = await response.json().catch(() => ({}));
    return { success: Boolean((result as { success?: boolean }).success) };
  },

  async rename(oldPath: string, newPath: string): Promise<{ success: boolean; path: string }> {
    const directory = requestDirectory(getDirectory);
    const response = await runtimeFetch('/api/fs/rename', {
      method: 'POST',
      query: directory ? { directory } : undefined,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath, newPath }),
    });

    if (!response.ok) {
      const error: WebFileMutationResponse = await response.json().catch(() => ({ error: response.statusText }));
      throw new FilesystemError(error.error || 'Failed to rename file', {
        reason: parseFilesystemErrorReason(error.reason),
        status: response.status,
      });
    }

    const result: WebFileMutationResponse = await response.json().catch(() => ({}));
    return {
      success: Boolean(result.success),
      path: result.path ? normalizePath(result.path) : newPath,
    };
  },

  async revealPath(targetPath: string): Promise<{ success: boolean }> {
    const directory = requestDirectory(getDirectory);
    const response = await runtimeFetch('/api/fs/reveal', {
      method: 'POST',
      query: directory ? { directory } : undefined,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: normalizePath(targetPath) }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error((error as { error?: string }).error || 'Failed to reveal path');
    }

    const result = await response.json().catch(() => ({}));
    return { success: Boolean((result as { success?: boolean }).success) };
  },

  async downloadFile(path: string, options): Promise<void> {
    const target = normalizePath(path);
    const params = new URLSearchParams({ path: target, download: 'true' });
    if (options?.allowOutsideWorkspace) {
      params.set('allowOutsideWorkspace', 'true');
    }
    if (options?.outsideFileGrant) {
      params.set('outsideFileGrant', options.outsideFileGrant);
    }
    const response = await runtimeFetch('/api/fs/raw', {
      query: withDirectoryQuery(params, requestDirectory(getDirectory, options?.directory)),
    });
    if (!response.ok) {
      throw new Error(`Download failed (${response.status})`);
    }

    const blob = await response.blob();
    const filename = target.split('/').pop() || 'file';
    const capacitor = (window as typeof window & {
      Capacitor?: { isNativePlatform?: () => boolean };
    }).Capacitor;
    if (capacitor?.isNativePlatform?.() === true) {
      await shareFileFromNativeApp(new File([blob], filename, { type: blob.type || 'application/octet-stream' }));
      return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  },
});
