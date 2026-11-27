import crypto from 'node:crypto';

import { SpaceError } from './errors.js';

export const LABEL_MARKER = 'openchamber.space';
const LABEL_ID = 'openchamber.space.id';
const LABEL_ROLE = 'openchamber.space.role';
export const LABEL_OWNER = 'openchamber.space.owner';
const LABEL_PROJECT = 'openchamber.space.project';
const LABEL_NAME = 'openchamber.space.name';
const LABEL_CREATED = 'openchamber.space.created';

const MARKER_VALUE = 'true';

export const ROLE_SPACE = 'space';
export const ROLE_SETUP = 'setup';
export const ROLE_NETWORK = 'network';
export const ROLE_VOLUME = 'volume';
export const ROLE_GATEKEEPER = 'gatekeeper';
export const ROLE_OUTER_NETWORK = 'outer-network';

export type SpaceRole =
  | typeof ROLE_SPACE
  | typeof ROLE_SETUP
  | typeof ROLE_NETWORK
  | typeof ROLE_VOLUME
  | typeof ROLE_GATEKEEPER
  | typeof ROLE_OUTER_NETWORK;

const ROLES: ReadonlySet<string> = new Set([
  ROLE_SPACE,
  ROLE_SETUP,
  ROLE_NETWORK,
  ROLE_VOLUME,
  ROLE_GATEKEEPER,
  ROLE_OUTER_NETWORK,
]);

const LABEL_TOOLS_KEY = 'openchamber.space.tools.key';
const LABEL_TOOLS_DESCRIPTION = 'openchamber.space.tools.description';
export const ROLE_TOOLS = 'tools';
export const ROLE_TOOLS_FILL = 'tools-fill';
export const ROLE_TOOLS_CHECK = 'tools-check';

export type ToolsRole =
  | typeof ROLE_TOOLS
  | typeof ROLE_TOOLS_FILL
  | typeof ROLE_TOOLS_CHECK;

const TOOLS_ROLES: ReadonlySet<string> = new Set([
  ROLE_TOOLS,
  ROLE_TOOLS_FILL,
  ROLE_TOOLS_CHECK,
]);
const TOOLS_KEY_PATTERN = /^[0-9a-f]{16}$/;
const SPACE_ID_PATTERN = /^[0-9a-f]{12}$/;
const OWNER_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const PROJECT_PATTERN = /^[0-9a-f]{16}$/;
const SUFFIX_PATTERN = /^[a-z0-9]{1,16}$/;
const MAX_NAME_LENGTH = 100;

export type DockerLabels = Record<string, string | undefined>;

export interface SpaceLabels {
  id: string;
  role: SpaceRole;
  owner: string;
  project: string;
  name: string;
  created: string;
}

export interface ToolsLabels {
  role: ToolsRole;
  owner: string;
  key: string;
  description: string;
  created: string;
}

export interface SpaceLabelFilterOptions {
  owner: string;
  spaceId?: string | null | undefined;
}

export interface BuildToolsLabelsInput {
  role: ToolsRole;
  owner: string;
  key: string;
  description: string;
  created: string;
}

export interface ToolsLabelFilterOptions {
  owner: string;
  role?: ToolsRole | null | undefined;
  key?: string | null | undefined;
}

const isSpaceRole = (value: string | undefined): value is SpaceRole =>
  value !== undefined && ROLES.has(value);

const isToolsRole = (value: string | undefined): value is ToolsRole =>
  value !== undefined && TOOLS_ROLES.has(value);

const hasControlCharacter = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f || code === 0x85 || code === 0x2028 || code === 0x2029) {
      return true;
    }
  }
  return false;
};

export const createSpaceId = (): string => crypto.randomBytes(6).toString('hex');

export const isSpaceId = (value: string): boolean => SPACE_ID_PATTERN.test(value);

export function requireSpaceId(value: string): string {
  if (!isSpaceId(value)) {
    throw new SpaceError('invalid_space_id', 'A space id is 12 lowercase hex characters');
  }
  return value;
}

const isOwner = (value: string | undefined): value is string =>
  value !== undefined && OWNER_PATTERN.test(value);

export function requireOwner(value: string | null | undefined): string {
  if (!isOwner(value ?? undefined)) {
    throw new SpaceError('invalid_owner', 'The installation id may hold only letters, digits, dots, dashes and underscores, 64 at most');
  }
  return value ?? '';
}

export function normalizeSpaceName(value: string | null | undefined): string {
  const name = String(value ?? '').trim();
  if (name.length === 0 || name.length > MAX_NAME_LENGTH || hasControlCharacter(name)) {
    throw new SpaceError('invalid_space_name', `A space name is 1 to ${MAX_NAME_LENGTH} characters on one line`);
  }
  return name;
}

export function hashProjectDirectory(directory: string | null | undefined): string {
  const text = String(directory ?? '');
  if (text.trim().length === 0) {
    throw new SpaceError('invalid_project_directory', 'A space needs the project directory it was created for');
  }
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

export function spaceResourcePrefix(spaceId: string): string {
  return `openchamber-space-${requireSpaceId(spaceId)}-`;
}

export function spaceResourceName(spaceId: string, role: SpaceRole, suffix = ''): string {
  if (!isSpaceRole(role)) {
    throw new SpaceError('invalid_role', `Unknown space resource role '${role}'`);
  }
  if (suffix === '') {
    return `${spaceResourcePrefix(spaceId)}${role}`;
  }
  if (!SUFFIX_PATTERN.test(suffix)) {
    throw new SpaceError('invalid_resource_suffix', 'A resource suffix is 1 to 16 lowercase letters or digits');
  }
  return `${spaceResourcePrefix(spaceId)}${role}-${suffix}`;
}

export function buildSpaceLabels({ id, role, owner, project, name, created }: SpaceLabels) {
  if (!isSpaceRole(role)) {
    throw new SpaceError('invalid_role', `Unknown space resource role '${role}'`);
  }
  if (!PROJECT_PATTERN.test(project)) {
    throw new SpaceError('invalid_project', 'A project label is the 16 character hash from hashProjectDirectory');
  }
  if (Number.isNaN(Date.parse(created))) {
    throw new SpaceError('invalid_created', 'A creation time is an ISO date string');
  }
  return {
    [LABEL_MARKER]: MARKER_VALUE,
    [LABEL_ID]: requireSpaceId(id),
    [LABEL_ROLE]: role,
    [LABEL_OWNER]: requireOwner(owner),
    [LABEL_PROJECT]: project,
    [LABEL_NAME]: normalizeSpaceName(name),
    [LABEL_CREATED]: created,
  };
}

export const labelArgs = (labels: Record<string, string>): string[] =>
  Object.entries(labels).flatMap(([key, value]) => ['--label', `${key}=${value}`]);

export function labelFilterArgs({ owner, spaceId = null }: SpaceLabelFilterOptions): string[] {
  const filters = ['--filter', `label=${LABEL_MARKER}=${MARKER_VALUE}`, '--filter', `label=${LABEL_OWNER}=${requireOwner(owner)}`];
  if (spaceId !== null) {
    filters.push('--filter', `label=${LABEL_ID}=${requireSpaceId(spaceId)}`);
  }
  return filters;
}

export function parseSpaceLabels(labels: DockerLabels | null | undefined): SpaceLabels | null {
  if (!labels || labels[LABEL_MARKER] !== MARKER_VALUE) {
    return null;
  }
  const id = labels[LABEL_ID];
  const role = labels[LABEL_ROLE];
  const owner = labels[LABEL_OWNER];
  if (id === undefined || !isSpaceId(id) || !isSpaceRole(role) || !isOwner(owner)) {
    return null;
  }
  return {
    id,
    role,
    owner,
    project: labels[LABEL_PROJECT] ?? '',
    name: labels[LABEL_NAME] ?? '',
    created: labels[LABEL_CREATED] ?? '',
  };
}

const isToolsKey = (value: string | undefined): value is string =>
  value !== undefined && TOOLS_KEY_PATTERN.test(value);

export function requireToolsKey(value: string | null | undefined): string {
  if (!isToolsKey(value ?? undefined)) {
    throw new SpaceError('invalid_tools_key', 'A tools key is 16 lowercase hex characters');
  }
  return value ?? '';
}

export function toolsResourceName(owner: string, key: string, role: ToolsRole = ROLE_TOOLS): string {
  if (!isToolsRole(role)) {
    throw new SpaceError('invalid_role', `Unknown tools resource role '${role}'`);
  }
  const volume = `openchamber-tools-${requireOwner(owner)}-${requireToolsKey(key)}`;
  return role === ROLE_TOOLS ? volume : `${volume}-${role.slice(ROLE_TOOLS.length + 1)}`;
}

export function toolsKeyFromVolumeName(name: string | null | undefined, owner: string): string | null {
  const prefix = `openchamber-tools-${requireOwner(owner)}-`;
  const text = String(name ?? '');
  const key = text.slice(prefix.length);
  return text.startsWith(prefix) && isToolsKey(key) ? key : null;
}

export function buildToolsLabels({ role, owner, key, description, created }: BuildToolsLabelsInput) {
  if (!isToolsRole(role)) {
    throw new SpaceError('invalid_role', `Unknown tools resource role '${role}'`);
  }
  if (Number.isNaN(Date.parse(created))) {
    throw new SpaceError('invalid_created', 'A creation time is an ISO date string');
  }
  const text = String(description ?? '').trim();
  if (text.length === 0 || text.length > MAX_NAME_LENGTH || hasControlCharacter(text)) {
    throw new SpaceError('invalid_tools_description', `A tools description is 1 to ${MAX_NAME_LENGTH} characters on one line`);
  }
  return {
    [LABEL_MARKER]: MARKER_VALUE,
    [LABEL_ROLE]: role,
    [LABEL_OWNER]: requireOwner(owner),
    [LABEL_TOOLS_KEY]: requireToolsKey(key),
    [LABEL_TOOLS_DESCRIPTION]: text,
    [LABEL_CREATED]: created,
  };
}

export function toolsLabelFilterArgs({ owner, role = null, key = null }: ToolsLabelFilterOptions): string[] {
  const filters = labelFilterArgs({ owner });
  if (role !== null) {
    filters.push('--filter', `label=${LABEL_ROLE}=${role}`);
  }
  if (key !== null) {
    filters.push('--filter', `label=${LABEL_TOOLS_KEY}=${requireToolsKey(key)}`);
  }
  return filters;
}

export function parseToolsLabels(labels: DockerLabels | null | undefined): ToolsLabels | null {
  if (!labels || labels[LABEL_MARKER] !== MARKER_VALUE) {
    return null;
  }
  const role = labels[LABEL_ROLE];
  const owner = labels[LABEL_OWNER];
  const key = labels[LABEL_TOOLS_KEY];
  if (!isToolsRole(role) || !isOwner(owner) || !isToolsKey(key)) {
    return null;
  }
  return {
    role,
    owner,
    key,
    description: labels[LABEL_TOOLS_DESCRIPTION] ?? '',
    created: labels[LABEL_CREATED] ?? '',
  };
}
