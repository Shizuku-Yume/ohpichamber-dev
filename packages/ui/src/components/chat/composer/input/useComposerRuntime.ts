import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';

import { isVSCodeRuntime } from '@/lib/desktop';


export function useComposerRuntime() {
    const { files: runtimeFiles, git: runtimeGit, vscode: vscodeApi, trackers: runtimeTrackers } = useRuntimeAPIs();
    const isVSCode = isVSCodeRuntime();

    return {
        runtimeFiles, runtimeGit, vscodeApi, runtimeTrackers, isVSCode,
    };
}
