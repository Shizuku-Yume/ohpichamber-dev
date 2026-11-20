export const normalizeMcpServerName = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9_-]/g, '-');

export const normalizeImportedMcpServerName = (value: string): string =>
  normalizeMcpServerName(value.trim()).replace(/^[-_]+|[-_]+$/g, '');
