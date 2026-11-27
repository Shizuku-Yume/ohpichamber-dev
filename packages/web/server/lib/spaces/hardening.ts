import { SpaceError } from './errors.js';
import {
  ROLE_NETWORK,
  ROLE_OUTER_NETWORK,
  ROLE_TOOLS,
  parseSpaceLabels,
  parseToolsLabels,
  spaceResourceName,
  spaceResourcePrefix,
  toolsKeyFromVolumeName,
} from './labels.js';
import type { DockerLabels } from './labels.js';
import {
  GATEKEEPER_ALIAS,
  GATEKEEPER_COMMAND,
  GATEKEEPER_ENVIRONMENT,
  IMAGE_CAT,
  IMAGE_CHOWN,
  IMAGE_NODE,
  IMAGE_SH,
  SPACE_ENVIRONMENT,
  SPACE_HOME,
  SPACE_SERVER_COMMAND,
  SPACE_USER,
  TOOLS_MARKER_PATH,
  TOOLS_MOUNT_PATH,
  spaceWorkPath,
} from './layout.js';
import { FILLER_PROGRAM } from './tools-filler.js';
import { TOOLS_STAGING_PATH } from './tools.js';

const SPACE_PIDS_LIMIT = 512;
const SPACE_SHM_BYTES = 64 * 1024 * 1024;
const TMPFS_OPTIONS = 'rw,exec,nosuid,size=256m';
const GATEKEEPER_TMPFS_OPTIONS = 'rw,noexec,nosuid,size=16m';
const GATEKEEPER_MEMORY_BYTES = 256 * 1024 * 1024;
const MIN_MEMORY_BYTES = 64 * 1024 * 1024;
const SETUP_MEMORY_BYTES = 128 * 1024 * 1024;
const FILLER_MEMORY_BYTES = 2 * 1024 * 1024 * 1024;
const FILLER_TMPFS_OPTIONS = 'rw,exec,nosuid,size=1g';
const FORBIDDEN_ENVIRONMENT = ['OPENCHAMBER_UI_PASSWORD'];
const BASE_IMAGE_ENVIRONMENT_NAMES = ['PATH', 'NODE_VERSION', 'YARN_VERSION'];
const SPACE_ENVIRONMENT_NAMES = new Set([...Object.keys(SPACE_ENVIRONMENT), ...BASE_IMAGE_ENVIRONMENT_NAMES]);
const GATEKEEPER_ENVIRONMENT_NAMES = new Set([...Object.keys(GATEKEEPER_ENVIRONMENT), ...BASE_IMAGE_ENVIRONMENT_NAMES]);

const LOG_DRIVER = 'local';
const LOG_MAX_SIZE = '10m';
const LOG_MAX_FILE = '1';
const LOG_ARGS = ['--log-driver', LOG_DRIVER, '--log-opt', `max-size=${LOG_MAX_SIZE}`, '--log-opt', `max-file=${LOG_MAX_FILE}`, '--log-opt', 'compress=false'];

const GATEWAY_MODE_OPTION = 'com.docker.network.bridge.gateway_mode_ipv4';
const GATEWAY_MODE = 'isolated';

const NO_NEW_PRIVILEGES = ['no-new-privileges', 'no-new-privileges:true'];
const PRIVATE_NAMESPACE_MODES = ['', 'private'];

const volumeMount = (volume: string, destination: string): string[] => ['--mount', `type=volume,src=${volume},dst=${destination}`];
const readOnlyVolumeMount = (volume: string, destination: string): string[] => ['--mount', `type=volume,src=${volume},dst=${destination},readonly`];
const memoryArgs = (bytes: number): string[] => ['--memory', String(bytes), '--memory-swap', String(bytes)];

export interface HardeningViolation {
  check: string;
  message: string;
}

export interface DockerContainerMount {
  Type?: string | undefined;
  Name?: string | undefined;
  Source?: string | undefined;
  Destination?: string | undefined;
  RW?: boolean | undefined;
}

export interface DockerHostConfig {
  ReadonlyRootfs?: boolean | undefined;
  Privileged?: boolean | undefined;
  CapDrop?: string[] | null | undefined;
  CapAdd?: string[] | null | undefined;
  SecurityOpt?: string[] | null | undefined;
  Init?: boolean | undefined;
  PidsLimit?: number | null | undefined;
  Memory?: number | null | undefined;
  MemorySwap?: number | null | undefined;
  ShmSize?: number | null | undefined;
  LogConfig?: {
    Type?: string | undefined;
    Config?: Record<string, string | undefined> | null | undefined;
  } | null | undefined;
  Tmpfs?: Record<string, string | undefined> | null | undefined;
  Binds?: string[] | null | undefined;
  VolumesFrom?: string[] | null | undefined;
  PidMode?: string | undefined;
  IpcMode?: string | undefined;
  UTSMode?: string | undefined;
  UsernsMode?: string | undefined;
  CgroupnsMode?: string | undefined;
  NetworkMode?: string | undefined;
  Sysctls?: Record<string, string | undefined> | null | undefined;
  Runtime?: string | undefined;
  Devices?: Array<{ PathOnHost?: string | undefined }> | null | undefined;
  PortBindings?: Record<string, Array<{ HostPort?: string | undefined }> | undefined> | null | undefined;
}

export interface DockerNetworkEntry {
  IPAddress?: string | undefined;
  Aliases?: string[] | null | undefined;
  DNSNames?: string[] | null | undefined;
}

export interface DockerContainerInspect {
  Id?: string | undefined;
  Name?: string | undefined;
  State?: { Running?: boolean | undefined; Status?: string | undefined; ExitCode?: number | undefined } | null | undefined;
  Config?: {
    User?: string | undefined;
    Labels?: DockerLabels | null | undefined;
    Env?: string[] | null | undefined;
    Image?: string | undefined;
  } | null | undefined;
  HostConfig?: DockerHostConfig | null | undefined;
  Mounts?: DockerContainerMount[] | null | undefined;
  NetworkSettings?: {
    Networks?: Record<string, DockerNetworkEntry | undefined> | null | undefined;
  } | null | undefined;
}

export interface DockerNetworkInspect {
  Name?: string | undefined;
  Internal?: boolean | undefined;
  EnableIPv6?: boolean | undefined;
  IPAM?: {
    Config?: Array<{ Subnet?: string | undefined; Gateway?: string | undefined }> | null | undefined;
  } | null | undefined;
  Options?: Record<string, string | undefined> | null | undefined;
  Labels?: DockerLabels | null | undefined;
}

export interface DockerVolumeInspect {
  Name?: string | undefined;
  Labels?: DockerLabels | null | undefined;
}

export interface NetworkArgsInput {
  network: string;
  labelArguments: readonly string[];
}

export interface GatekeeperCreateArgsInput {
  containerName: string;
  labelArguments: readonly string[];
  network: string;
  image: string;
}

export interface SpaceCreateArgsInput {
  spaceId: string;
  containerName: string;
  labelArguments: readonly string[];
  network: string;
  workVolume: string;
  homeVolume: string;
  toolsVolume: string;
  memoryBytes: number | null | undefined;
  image: string;
}

export interface VolumeOwnershipRunArgsInput {
  spaceId: string;
  containerName: string;
  labelArguments: readonly string[];
  workVolume: string;
  homeVolume: string;
  image: string;
}

export interface ToolsRunArgsInput {
  containerName: string;
  labelArguments: readonly string[];
  toolsVolume: string;
  image: string;
}

export interface SpaceHardeningInput {
  spaceId: string;
  owner: string;
  container: DockerContainerInspect | null | undefined;
  network: DockerNetworkInspect | null | undefined;
  toolsVolume: DockerVolumeInspect | null | undefined;
}

export interface GatekeeperHardeningInput {
  spaceId: string;
  owner: string;
  container: DockerContainerInspect | null | undefined;
  outerNetwork: DockerNetworkInspect | null | undefined;
}

const isValidMemoryBytes = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= MIN_MEMORY_BYTES;

export function requireMemoryBytes(value: number | null | undefined): number {
  if (!isValidMemoryBytes(value)) {
    throw new SpaceError('invalid_memory_limit', `A space needs a memory limit of at least ${MIN_MEMORY_BYTES} bytes`);
  }
  return value;
}

export function buildSpaceNetworkArgs({ network, labelArguments }: NetworkArgsInput): string[] {
  return [
    'network', 'create',
    '--driver', 'bridge',
    '--internal',
    '--ipv6=false',
    '--opt', `${GATEWAY_MODE_OPTION}=${GATEWAY_MODE}`,
    ...labelArguments,
    network,
  ];
}

export function buildGatekeeperNetworkArgs({ network, labelArguments }: NetworkArgsInput): string[] {
  return [
    'network', 'create',
    '--driver', 'bridge',
    '--ipv6=false',
    ...labelArguments,
    network,
  ];
}

export function buildGatekeeperCreateArgs({
  containerName,
  labelArguments,
  network,
  image,
}: GatekeeperCreateArgsInput): string[] {
  return [
    'create',
    '--name', containerName,
    ...labelArguments,
    '--init',
    '--user', SPACE_USER,
    '--read-only',
    '--tmpfs', `/tmp:${GATEKEEPER_TMPFS_OPTIONS}`,
    '--security-opt', 'no-new-privileges',
    '--cap-drop', 'ALL',
    '--pids-limit', String(SPACE_PIDS_LIMIT),
    ...memoryArgs(GATEKEEPER_MEMORY_BYTES),
    '--shm-size', '64m',
    '--ipc', 'private',
    '--cgroupns', 'private',
    ...LOG_ARGS,
    '--network', network,
    '--network-alias', GATEKEEPER_ALIAS,
    ...Object.entries(GATEKEEPER_ENVIRONMENT).flatMap(([name, value]) => ['--env', `${name}=${value}`]),
    image,
    ...GATEKEEPER_COMMAND,
  ];
}

export function buildSpaceCreateArgs({
  spaceId,
  containerName,
  labelArguments,
  network,
  workVolume,
  homeVolume,
  toolsVolume,
  memoryBytes,
  image,
}: SpaceCreateArgsInput): string[] {
  return [
    'create',
    '--name', containerName,
    ...labelArguments,
    '--init',
    '--user', SPACE_USER,
    '--read-only',
    '--tmpfs', `/tmp:${TMPFS_OPTIONS}`,
    '--security-opt', 'no-new-privileges',
    '--cap-drop', 'ALL',
    '--pids-limit', String(SPACE_PIDS_LIMIT),
    ...memoryArgs(requireMemoryBytes(memoryBytes)),
    '--shm-size', '64m',
    '--ipc', 'private',
    '--cgroupns', 'private',
    ...LOG_ARGS,
    '--network', network,
    ...volumeMount(workVolume, spaceWorkPath(spaceId)),
    ...volumeMount(homeVolume, SPACE_HOME),
    ...readOnlyVolumeMount(toolsVolume, TOOLS_MOUNT_PATH),
    ...Object.entries(SPACE_ENVIRONMENT).flatMap(([name, value]) => ['--env', `${name}=${value}`]),
    image,
    ...SPACE_SERVER_COMMAND,
  ];
}

export function buildVolumeOwnershipRunArgs({
  spaceId,
  containerName,
  labelArguments,
  workVolume,
  homeVolume,
  image,
}: VolumeOwnershipRunArgsInput): string[] {
  return [
    'run', '--rm',
    '--name', containerName,
    ...labelArguments,
    '--user', '0:0',
    '--network', 'none',
    '--cap-drop', 'ALL',
    '--cap-add', 'CHOWN',
    '--security-opt', 'no-new-privileges',
    '--read-only',
    '--ipc', 'private',
    '--cgroupns', 'private',
    ...memoryArgs(SETUP_MEMORY_BYTES),
    ...LOG_ARGS,
    ...volumeMount(workVolume, spaceWorkPath(spaceId)),
    ...volumeMount(homeVolume, SPACE_HOME),
    image,
    IMAGE_CHOWN, SPACE_USER, spaceWorkPath(spaceId), SPACE_HOME,
  ];
}

export function buildToolsFillRunArgs({
  containerName,
  labelArguments,
  toolsVolume,
  image,
}: ToolsRunArgsInput): string[] {
  return [
    'run', '--rm', '--interactive',
    '--name', containerName,
    ...labelArguments,
    '--init',
    '--user', '0:0',
    '--network', 'bridge',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--read-only',
    '--tmpfs', `/tmp:${FILLER_TMPFS_OPTIONS}`,
    '--pids-limit', String(SPACE_PIDS_LIMIT),
    '--ipc', 'private',
    '--cgroupns', 'private',
    ...memoryArgs(FILLER_MEMORY_BYTES),
    ...LOG_ARGS,
    ...volumeMount(toolsVolume, TOOLS_MOUNT_PATH),
    '--env', 'HOME=/tmp',
    image,
    IMAGE_NODE, '-e', FILLER_PROGRAM, TOOLS_MOUNT_PATH, TOOLS_STAGING_PATH,
  ];
}

export const TOOLS_MARKER_MISSING_EXIT_CODE = 42;
const MARKER_CHECK_SCRIPT = `[ -f "$1" ] || exit ${TOOLS_MARKER_MISSING_EXIT_CODE}; ${IMAGE_CAT} "$1"`;

export function buildToolsCheckRunArgs({
  containerName,
  labelArguments,
  toolsVolume,
  image,
}: ToolsRunArgsInput): string[] {
  return [
    'run', '--rm',
    '--name', containerName,
    ...labelArguments,
    '--user', SPACE_USER,
    '--network', 'none',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--read-only',
    '--ipc', 'private',
    '--cgroupns', 'private',
    ...memoryArgs(SETUP_MEMORY_BYTES),
    ...LOG_ARGS,
    ...readOnlyVolumeMount(toolsVolume, TOOLS_MOUNT_PATH),
    image,
    IMAGE_SH, '-c', MARKER_CHECK_SCRIPT, 'sh', TOOLS_MARKER_PATH,
  ];
}

const mentionsRuntimeSocket = (text: string | undefined): boolean => String(text ?? '').includes('docker.sock');

interface CommonViolationsInput {
  container: DockerContainerInspect | null | undefined;
  tmpfsOptions: string;
  networkMode: string;
  mountViolations: (mounts: DockerContainerMount[]) => HardeningViolation[];
  allowedEnvironment: ReadonlySet<string>;
}

function findCommonViolations({
  container,
  tmpfsOptions,
  networkMode,
  mountViolations,
  allowedEnvironment,
}: CommonViolationsInput): HardeningViolation[] {
  const violations: HardeningViolation[] = [];
  const violate = (check: string, message: string): void => { violations.push({ check, message }); };

  const config = container?.Config ?? {};
  const host = container?.HostConfig ?? {};
  const mounts = container?.Mounts ?? [];

  const variableNames = (config.Env ?? []).map((entry) => String(entry).split('=')[0] ?? '');
  const secretVariables = variableNames.filter((name) => FORBIDDEN_ENVIRONMENT.includes(name));
  if (secretVariables.length > 0) violate('environment', `The container environment holds a secret: ${secretVariables.join(', ')}`);
  const unexpectedVariables = variableNames.filter((name) => !FORBIDDEN_ENVIRONMENT.includes(name) && !allowedEnvironment.has(name));
  if (unexpectedVariables.length > 0) violate('environment', `The container environment holds variables nobody set for it: ${unexpectedVariables.join(', ')}`);
  if (config.User !== SPACE_USER) violate('user', `Runs as '${config.User ?? ''}', expected ${SPACE_USER}`);
  if (host.ReadonlyRootfs !== true) violate('read_only', 'The root filesystem is writable');
  if (host.Privileged !== false) violate('privileged', 'The container is privileged');
  if (!(host.CapDrop ?? []).includes('ALL')) violate('cap_drop', 'Capabilities are not all dropped');
  const capAdd = host.CapAdd ?? [];
  if (capAdd.length > 0) violate('cap_add', `Capabilities were added: ${capAdd.join(', ')}`);

  const securityOptions = host.SecurityOpt ?? [];
  if (!securityOptions.some((option) => NO_NEW_PRIVILEGES.includes(option))) {
    violate('no_new_privileges', 'Privilege escalation is not blocked');
  }
  const extraSecurityOptions = securityOptions.filter((option) => !NO_NEW_PRIVILEGES.includes(option));
  if (extraSecurityOptions.length > 0) violate('security_options', `Unexpected security options: ${extraSecurityOptions.join(', ')}`);

  if (host.Init !== true) violate('init', 'There is no init process');
  if (!((host.PidsLimit ?? 0) > 0)) violate('pids_limit', 'There is no process limit');
  if (!((host.Memory ?? 0) > 0)) violate('memory', 'There is no memory limit');
  if (host.MemorySwap !== host.Memory) violate('memory_swap', 'Swap is allowed on top of the memory limit');
  if (host.ShmSize !== SPACE_SHM_BYTES) violate('shm_size', `Shared memory is ${host.ShmSize ?? 'unset'} bytes, expected ${SPACE_SHM_BYTES}`);

  const log = host.LogConfig ?? {};
  if (log.Type !== LOG_DRIVER || log.Config?.['max-size'] !== LOG_MAX_SIZE || log.Config?.['max-file'] !== LOG_MAX_FILE) {
    violate('log_limit', 'Container output is not capped on the Docker host');
  }

  const tmpfs = host.Tmpfs ?? {};
  const tmpOptions = String(tmpfs['/tmp'] ?? '').split(',');
  if (Object.keys(tmpfs).length !== 1 || !tmpfsOptions.split(',').every((option) => tmpOptions.includes(option))) {
    violate('tmpfs', 'The only tmpfs must be /tmp with nosuid and a size limit');
  }

  const binds = host.Binds ?? [];
  if (binds.length > 0) violate('binds', `Host paths are mounted: ${binds.join(', ')}`);
  if ((host.VolumesFrom ?? []).length > 0) violate('volumes_from', 'Volumes of another container are attached');
  violations.push(...mountViolations(mounts));
  const socketMounted = mounts.some((mount) => mentionsRuntimeSocket(mount.Source) || mentionsRuntimeSocket(mount.Destination))
    || binds.some(mentionsRuntimeSocket);
  if (socketMounted) violate('runtime_socket', 'The container runtime socket is mounted');

  const namespaceValues: Array<[string, string | undefined]> = [
    ['PidMode', host.PidMode],
    ['IpcMode', host.IpcMode],
    ['UTSMode', host.UTSMode],
    ['UsernsMode', host.UsernsMode],
    ['CgroupnsMode', host.CgroupnsMode],
  ];
  for (const [field, value] of namespaceValues) {
    if (!PRIVATE_NAMESPACE_MODES.includes(value ?? '')) violate('namespace', `${field} is '${value}', which is not private`);
  }
  if (host.NetworkMode !== networkMode) violate('network_mode', `NetworkMode is '${host.NetworkMode ?? ''}', expected the network of this space`);
  if (Object.keys(host.Sysctls ?? {}).length > 0) violate('sysctls', 'Kernel parameters were changed');
  if (!['', 'runc'].includes(host.Runtime ?? '')) violate('runtime', `Unexpected container runtime '${host.Runtime}'`);
  if ((host.Devices ?? []).length > 0) violate('devices', 'Host devices are attached');
  if (Object.keys(host.PortBindings ?? {}).length > 0) violate('port_bindings', 'Ports are published on the host');

  return violations;
}

interface SpaceMountViolationsInput {
  mounts: DockerContainerMount[];
  prefix: string;
  owner: string;
  toolsVolume: DockerVolumeInspect | null | undefined;
}

function findSpaceMountViolations({ mounts, prefix, owner, toolsVolume }: SpaceMountViolationsInput): HardeningViolation[] {
  const violations: HardeningViolation[] = [];
  const violate = (check: string, message: string): void => { violations.push({ check, message }); };

  for (const mount of mounts.filter((candidate) => candidate.Destination !== TOOLS_MOUNT_PATH)) {
    if (mount.Type !== 'volume' || !String(mount.Name ?? '').startsWith(prefix)) {
      violate('mounts', `Mount at ${mount.Destination} is not a volume of this space`);
    }
  }
  const toolsMounts = mounts.filter((candidate) => candidate.Destination === TOOLS_MOUNT_PATH);
  const [mount] = toolsMounts;
  if (toolsMounts.length !== 1 || !mount) {
    violate('tools_mount', `Expected one tools volume at ${TOOLS_MOUNT_PATH}, found ${toolsMounts.length}`);
    return violations;
  }
  const key = toolsKeyFromVolumeName(mount.Name, owner);
  if (mount.Type !== 'volume' || key === null) {
    violate('tools_mount', `Mount at ${TOOLS_MOUNT_PATH} is not a tools volume of this installation`);
  }
  if (mount.RW !== false) violate('tools_read_only', 'The tools volume is writable from inside the space');
  const toolsLabels = parseToolsLabels(toolsVolume?.Labels);
  if (toolsVolume?.Name !== mount.Name || toolsLabels?.role !== ROLE_TOOLS || toolsLabels?.owner !== owner || toolsLabels?.key !== key) {
    violate('tools_labels', 'The tools volume does not carry the tools labels of this installation');
  }
  return violations;
}

export function findHardeningViolations({
  spaceId,
  owner,
  container,
  network,
  toolsVolume,
}: SpaceHardeningInput): HardeningViolation[] {
  const prefix = spaceResourcePrefix(spaceId);
  const networkName = spaceResourceName(spaceId, ROLE_NETWORK);
  const violations = findCommonViolations({
    container,
    tmpfsOptions: TMPFS_OPTIONS,
    networkMode: networkName,
    mountViolations: (mounts) => findSpaceMountViolations({ mounts, prefix, owner, toolsVolume }),
    allowedEnvironment: SPACE_ENVIRONMENT_NAMES,
  });
  const violate = (check: string, message: string): void => { violations.push({ check, message }); };

  const attached = Object.keys(container?.NetworkSettings?.Networks ?? {});
  if (attached.length !== 1 || attached[0] !== networkName) {
    violate('networks', `Attached to [${attached.join(', ')}], expected only the network of this space`);
  }
  violations.push(...findInnerNetworkViolations({ spaceId, owner, network }));
  return violations;
}

function findInnerNetworkViolations({
  spaceId,
  owner,
  network,
}: {
  spaceId: string;
  owner: string;
  network: DockerNetworkInspect | null | undefined;
}): HardeningViolation[] {
  const violations: HardeningViolation[] = [];
  const violate = (check: string, message: string): void => { violations.push({ check, message }); };

  if (network?.Internal !== true) violate('network_internal', 'The network of this space can reach outside');
  if (network?.EnableIPv6 === true) violate('network_ipv6', 'The network of this space has IPv6');
  const hasGateway = (network?.IPAM?.Config ?? []).some((range) => Boolean(range.Gateway));
  if (network?.Options?.[GATEWAY_MODE_OPTION] !== GATEWAY_MODE || hasGateway) {
    violate('network_host_isolation', 'The network of this space has an address on the Docker host. Docker Engine 28 or newer is needed.');
  }
  const networkLabels = parseSpaceLabels(network?.Labels);
  if (networkLabels?.id !== spaceId || networkLabels?.owner !== owner || networkLabels?.role !== ROLE_NETWORK) {
    violate('network_labels', 'The network does not carry the labels of this space');
  }
  return violations;
}

const aliasesOf = (entry: DockerNetworkEntry | undefined): string[] => [
  ...(entry?.Aliases ?? []),
  ...(entry?.DNSNames ?? []),
];

export function findGatekeeperHardeningViolations({
  spaceId,
  owner,
  container,
  outerNetwork,
}: GatekeeperHardeningInput): HardeningViolation[] {
  const innerName = spaceResourceName(spaceId, ROLE_NETWORK);
  const outerName = spaceResourceName(spaceId, ROLE_OUTER_NETWORK);
  const violations = findCommonViolations({
    container,
    tmpfsOptions: GATEKEEPER_TMPFS_OPTIONS,
    networkMode: innerName,
    mountViolations: (mounts) => (mounts.length === 0 ? [] : [{
      check: 'mounts',
      message: `The gatekeeper has ${mounts.length} mount(s) and must have none: ${mounts.map((mount) => mount.Destination).join(', ')}`,
    }]),
    allowedEnvironment: GATEKEEPER_ENVIRONMENT_NAMES,
  });
  const violate = (check: string, message: string): void => { violations.push({ check, message }); };

  const host = container?.HostConfig ?? {};
  if ((host.Memory ?? 0) > 0 && host.Memory !== GATEKEEPER_MEMORY_BYTES) {
    violate('memory_limit', `The memory limit is ${host.Memory} bytes, expected ${GATEKEEPER_MEMORY_BYTES}`);
  }

  const networks = container?.NetworkSettings?.Networks ?? {};
  if (Object.keys(networks).sort().join(' ') !== [innerName, outerName].sort().join(' ')) {
    violate('networks', `Attached to [${Object.keys(networks).join(', ')}], expected the inner and the outer network of this space`);
  }
  if (networks[innerName] && !aliasesOf(networks[innerName]).includes(GATEKEEPER_ALIAS)) {
    violate('alias', `The gatekeeper is not reachable as '${GATEKEEPER_ALIAS}' on the inner network of this space`);
  }
  if (outerNetwork?.Internal === true) violate('outer_network', 'The outer network of this space cannot reach outside, so the corridor would have no way out');
  const outerLabels = parseSpaceLabels(outerNetwork?.Labels);
  if (outerLabels?.id !== spaceId || outerLabels?.owner !== owner || outerLabels?.role !== ROLE_OUTER_NETWORK) {
    violate('outer_network_labels', 'The outer network does not carry the labels of this space');
  }

  return violations.map(({ check, message }) => ({ check: `gatekeeper_${check}`, message: `Gatekeeper: ${message}` }));
}
