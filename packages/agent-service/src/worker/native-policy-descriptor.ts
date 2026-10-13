import { editInspect, type EditFileOpIntent, type EditInspection } from '@oh-my-pi/pi-natives';
import { NativeOperationDescriptorSchema, type NativeOperationDescriptor } from '../supervisor/host-authorization-protocol.ts';

export function nativeEditDescriptor(mode: string, input: unknown): NativeOperationDescriptor {
  let inspection: EditInspection;
  try { inspection = editInspect(mode, JSON.stringify(input ?? {})); } catch { throw new Error('Native edit input is invalid'); }
  const fileOps = inspection.fileOps.map((operation: EditFileOpIntent) => ({ kind: operation.kind, path: operation.path, ...(operation.to === undefined ? {} : { to: operation.to }) }));
  return NativeOperationDescriptorSchema.parse({ toolName: 'edit', effectiveMode: mode, sourcePaths: [...inspection.paths, ...fileOps.map(operation => operation.path)], destinationPaths: fileOps.flatMap(operation => operation.to === undefined ? [] : [operation.to]), fileOps });
}
