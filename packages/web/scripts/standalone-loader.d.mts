export interface StandaloneRuntimeManifestFile {
  path: string;
  link?: string;
  sha256?: string;
}

export interface StandaloneRuntimeManifestPackage {
  name: string;
  path: string;
}

export interface StandaloneRuntimeManifest {
  platform: string;
  architecture: string;
  bunVersion?: string;
  files: StandaloneRuntimeManifestFile[];
  packages?: StandaloneRuntimeManifestPackage[];
}

export interface WebAgentRuntime {
  bunPath: string;
  entrypoint: string;
  worker: string;
  root: string;
  manifest: StandaloneRuntimeManifest;
}

export function ensureAgentRuntimeSymlinks(root: string): void;
export function resolveWebAgentRuntime(packageRoot?: string, platform?: NodeJS.Platform): WebAgentRuntime | null;
export function registerStandaloneLoader(options?: { packageRoot?: string; runtimeRoot?: string; sdkRoot?: string }): void;
