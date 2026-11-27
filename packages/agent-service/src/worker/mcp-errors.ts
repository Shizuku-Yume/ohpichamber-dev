import type { CatalogOperationError, MCPCatalogRead } from '@openchamber/agent-contract';

export class NativeMcpError extends Error {
  constructor(readonly code: string, detail: string, readonly retryable: boolean, readonly state?: MCPCatalogRead) {
    super(detail);
    this.name = 'NativeMcpError';
  }
  get operationError(): CatalogOperationError {
    return { code: this.code, detail: this.message, retryable: this.retryable };
  }
}
