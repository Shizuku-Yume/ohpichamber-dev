import { type ConfigRuntimeContext } from "./runtime";

export const getConfigLoadKey = (context: ConfigRuntimeContext, directoryKey: string): string => JSON.stringify([context.generation, context.runtimeKey, directoryKey]);
// Share concurrent provider/model loads for the same runtime and directory.
export const _inFlightProviders = new Map<string, Promise<void>>();
