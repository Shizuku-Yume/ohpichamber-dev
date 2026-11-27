import { SpaceError } from '../errors.js';
import type { DockerLabels } from '../labels.js';
import { GATEKEEPER_PROGRAM_PATH, IMAGE_CAT, IMAGE_CURL, IMAGE_SH, SPACE_HOME, SPACE_TOKEN_PATH, TOOLS_MOUNT_PATH } from '../layout.js';
import type { RunCommandOptions, RunCommandResult } from '../run-command.js';
import { SPACE_BASE_IMAGE } from './docker.js';
import type { DockerInspectEntry, DockerResourceKind } from './docker-engine.js';

const ok = (stdout = ''): RunCommandResult => ({ code: 0, stdout, stderr: '' });
const failed = (stderr: string, stdout = ''): RunCommandResult => ({ code: 1, stdout, stderr });

const NOT_FOUND_TEXT = {
  container: (name: string): string => `Error response from daemon: No such container: ${name}`,
  network: (name: string): string => `Error response from daemon: network ${name} not found`,
  volume: (name: string): string => `Error response from daemon: get ${name}: no such volume`,
  image: (name: string): string => `Error response from daemon: No such image: ${name}`,
} satisfies Record<DockerResourceKind, (name: string) => string>;

const ISOLATED_GATEWAY_OPTION = 'com.docker.network.bridge.gateway_mode_ipv4';
const FAKE_BASE_IMAGE = SPACE_BASE_IMAGE;

export interface FakeDockerMountSpec {
  volume: string;
  destination: string;
  readOnly?: boolean | undefined;
}

export interface HardenedContainerEntryOptions {
  name: string;
  labels: DockerLabels;
  network: string;
  volumes?: readonly string[] | undefined;
  toolsVolume?: string | null | undefined;
  mounts?: readonly FakeDockerMountSpec[] | null | undefined;
  env?: string[] | undefined;
  running?: boolean | undefined;
  memoryBytes?: number | undefined;
  tmpfs?: string | undefined;
  aliases?: string[] | undefined;
  image?: string | undefined;
}

export interface InternalNetworkEntryOptions {
  name: string;
  labels: DockerLabels;
  options?: DockerLabels | undefined;
}

export interface BridgeNetworkEntryOptions {
  name: string;
  labels: DockerLabels;
}

export interface FakeDockerResource {
  kind: DockerResourceKind;
  name: string;
  entry: DockerInspectEntry;
  filled?: boolean | undefined;
  token?: string | undefined;
}

export interface FakeDockerRetiredImage {
  name: string;
  bytes: number;
  tags?: string[] | undefined;
}

export interface FakeDockerOptions {
  failAt?: ((args: readonly string[]) => boolean) | undefined;
  timeoutAt?: ((args: readonly string[]) => boolean) | undefined;
  interruptionCode?: string | undefined;
  resources?: readonly FakeDockerResource[] | undefined;
  imagePresent?: boolean | undefined;
  imageBytes?: number | undefined;
  retiredImages?: readonly FakeDockerRetiredImage[] | undefined;
  volumeSizes?: Record<string, string> | undefined;
  engineName?: string | undefined;
  colima?: ((args: readonly string[]) => RunCommandResult) | undefined;
  alterContainer?: ((entry: DockerInspectEntry) => DockerInspectEntry) | undefined;
  serverReady?: boolean | undefined;
  gatekeeperReady?: boolean | undefined;
  beforeFill?: (() => Promise<void>) | undefined;
  start?: Date | undefined;
}

export interface FakeDockerCall {
  file: string;
  args: readonly string[];
  options: RunCommandOptions | undefined;
}

type FakeNetworkEntry = NonNullable<NonNullable<DockerInspectEntry['NetworkSettings']>['Networks']>[string] & { IPAddress: string };

const readPairs = (args: readonly string[], flag: string): DockerLabels => {
  const pairs: DockerLabels = {};
  args.forEach((arg, index) => {
    if (arg === flag) {
      const pair = args[index + 1];
      if (pair !== undefined) {
        pairs[pair.slice(0, pair.indexOf('='))] = pair.slice(pair.indexOf('=') + 1);
      }
    }
  });
  return pairs;
};

const readFlag = (args: readonly string[], flag: string): string => args[args.indexOf(flag) + 1] ?? '';

let nextContainerId = 1;
const newContainerId = (): string => (nextContainerId++).toString(16).padStart(64, 'f');

const volumeMountEntry = ({ volume, destination, readOnly = false }: FakeDockerMountSpec) => ({
  Type: 'volume',
  Name: volume,
  Source: `/var/lib/docker/volumes/${volume}/_data`,
  Destination: destination,
  RW: !readOnly,
});

export function hardenedContainerEntry({
  name,
  labels,
  network,
  volumes = [],
  toolsVolume = null,
  mounts = null,
  env = ['HOME=/home/space'],
  running = true,
  memoryBytes = 4294967296,
  tmpfs = '/tmp:rw,exec,nosuid,size=256m',
  aliases = [],
  image = FAKE_BASE_IMAGE,
}: HardenedContainerEntryOptions): DockerInspectEntry {
  const mountList: readonly FakeDockerMountSpec[] = mounts ?? [
    ...volumes.map((volume) => ({ volume, destination: `/mnt/${volume}` })),
    ...(toolsVolume ? [{ volume: toolsVolume, destination: TOOLS_MOUNT_PATH, readOnly: true }] : []),
  ];
  const [tmpfsPath = '/tmp', tmpfsOptions = ''] = String(tmpfs).split(':');
  const networkEntry: FakeNetworkEntry = { IPAddress: '172.19.0.2' };
  if (aliases.length > 0) networkEntry.Aliases = aliases;
  return {
    Id: newContainerId(),
    Name: `/${name}`,
    State: { Running: running, Status: running ? 'running' : 'created' },
    Config: { User: '1000:1000', Labels: labels, Env: env, Image: image },
    HostConfig: {
      ReadonlyRootfs: true,
      Privileged: false,
      CapDrop: ['ALL'],
      CapAdd: null,
      SecurityOpt: ['no-new-privileges'],
      Init: true,
      PidsLimit: 512,
      Memory: memoryBytes,
      MemorySwap: memoryBytes,
      ShmSize: 67108864,
      LogConfig: { Type: 'local', Config: { compress: 'false', 'max-file': '1', 'max-size': '10m' } },
      Tmpfs: { [tmpfsPath]: tmpfsOptions },
      Binds: null,
      VolumesFrom: null,
      PidMode: '',
      IpcMode: 'private',
      UTSMode: '',
      UsernsMode: '',
      CgroupnsMode: 'private',
      NetworkMode: network,
      Runtime: 'runc',
      Devices: [],
      PortBindings: {},
    },
    Mounts: mountList.map(volumeMountEntry),
    NetworkSettings: {
      Networks: {
        [network]: networkEntry,
      },
    },
  };
}

export const internalNetworkEntry = ({
  name,
  labels,
  options = { [ISOLATED_GATEWAY_OPTION]: 'isolated' },
}: InternalNetworkEntryOptions): DockerInspectEntry => ({
  Name: name,
  Internal: true,
  EnableIPv6: false,
  IPAM: { Config: [options[ISOLATED_GATEWAY_OPTION] === 'isolated' ? { Subnet: '172.19.0.0/16' } : { Subnet: '172.19.0.0/16', Gateway: '172.19.0.1' }] },
  Options: options,
  Labels: labels,
});

export const bridgeNetworkEntry = ({ name, labels }: BridgeNetworkEntryOptions): DockerInspectEntry => ({
  Name: name,
  Internal: false,
  EnableIPv6: false,
  IPAM: { Config: [{ Subnet: '172.20.0.0/16', Gateway: '172.20.0.1' }] },
  Options: {},
  Labels: labels,
});

const HEALTHY_ANSWER = 'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{"status":"ok"}';
const jsonAnswer = (body: string): string => `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n${body}`;
const CONTROL_ANSWERS = new Map<string, string>([
  ['/health', jsonAnswer('{"ready":true,"mode":"allowlist","domains":0,"grants":0}')],
  ['/journal', jsonAnswer('{"records":[],"dropped":0}')],
  ['/network', jsonAnswer('{"ok":true}')],
  ['/grants', jsonAnswer('{"ok":true}')],
]);

const roleOf = (args: readonly string[]): string | undefined => readPairs(args, '--label')['openchamber.space.role'];

const readMounts = (args: readonly string[]): FakeDockerMountSpec[] => args
  .filter((_arg, index) => args[index - 1] === '--mount')
  .map((arg) => {
    const fields = arg.split(',');
    const field = (name: string): string => fields.find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? '';
    return { volume: field('src'), destination: field('dst'), readOnly: fields.includes('readonly') };
  });

export function createFakeDocker({
  failAt = () => false,
  timeoutAt = () => false,
  interruptionCode = 'command_timeout',
  resources = [],
  imagePresent = true,
  imageBytes = 1_632_000_000,
  retiredImages = [],
  volumeSizes = {},
  engineName = 'docker-desktop',
  colima = () => ok(),
  alterContainer = (entry) => entry,
  serverReady = true,
  gatekeeperReady = true,
  beforeFill = async () => { return; },
  start = new Date('2026-09-20T08:00:00.000Z'),
}: FakeDockerOptions = {}) {
  let clock = start.getTime();
  let image = imagePresent;
  const retired = new Map(retiredImages.map((entry, index) => [entry.name, { id: `sha256:4567${index}`, bytes: entry.bytes, tags: entry.tags ?? [entry.name] }]));
  const calls: FakeDockerCall[] = [];
  const late: Array<readonly string[]> = [];
  const state = new Map<string, FakeDockerResource>(resources.map((resource) => [`${resource.kind}:${resource.name}`, resource]));
  const filled = new Map<string, string>(resources.filter((resource) => resource.filled).map((resource) => [resource.name, resource.name.slice(-16)]));
  const tokens = new Map<string, string>(resources.filter((resource) => Boolean(resource.token)).map((resource) => [resource.name, resource.token ?? '']));
  const programs = new Map<string, string>();
  const homeOf = (container: string): string =>
    state.get(`container:${container}`)?.entry.Mounts?.find((mount) => mount.Destination === SPACE_HOME)?.Name ?? container;
  const add = (kind: DockerResourceKind, name: string, entry: DockerInspectEntry): void => {
    state.set(`${kind}:${name}`, { kind, name, entry });
  };
  const containerKey = (nameOrId: string): string | undefined => (state.has(`container:${nameOrId}`)
    ? `container:${nameOrId}`
    : Array.from(state.keys()).find((key) => key.startsWith('container:') && state.get(key)?.entry.Id === nameOrId));
  const nameConflict = (name: string): RunCommandResult =>
    failed(`Error response from daemon: Conflict. The container name "/${name}" is already in use by container "${state.get(`container:${name}`)?.entry.Id ?? ''}". You have to remove (or rename) that container to be able to reuse that name.`);
  const ofKind = (kind: DockerResourceKind): FakeDockerResource[] =>
    Array.from(state.values()).filter((resource) => resource.kind === kind);

  const matchesFilters = (resource: FakeDockerResource, args: readonly string[]): boolean => {
    const labels = (resource.kind === 'container' ? resource.entry.Config?.Labels : resource.entry.Labels) ?? {};
    return args.every((arg, index) => {
      if (args[index - 1] !== '--filter') return true;
      if (arg.startsWith('ancestor=')) return resource.entry.Config?.Image === arg.slice('ancestor='.length);
      const pair = arg.slice('label='.length);
      return labels[pair.slice(0, pair.indexOf('='))] === pair.slice(pair.indexOf('=') + 1);
    });
  };

  const inspect = (kind: DockerResourceKind, names: readonly string[]): RunCommandResult => {
    const keyOf = (name: string): string => (kind === 'container' ? (containerKey(name) ?? `container:${name}`) : `${kind}:${name}`);
    const found = names.flatMap((name) => {
      const item = state.get(keyOf(name));
      return item ? [item.entry] : [];
    });
    const missing = names.filter((name) => !state.has(keyOf(name)));
    const stdout = JSON.stringify(found);
    return missing.length === 0 ? ok(stdout) : failed(missing.map(NOT_FOUND_TEXT[kind]).join('\n'), stdout);
  };

  const addContainer = (args: readonly string[], { running }: { running: boolean }): RunCommandResult => {
    const name = readFlag(args, '--name');
    if (state.has(`container:${name}`)) return nameConflict(name);
    const mounts = readMounts(args);
    for (const { volume } of mounts) {
      if (!state.has(`volume:${volume}`)) add('volume', volume, { Name: volume, Labels: null });
    }
    const entry = hardenedContainerEntry({
      name,
      labels: readPairs(args, '--label'),
      network: readFlag(args, '--network'),
      mounts,
      env: args.filter((_arg, index) => args[index - 1] === '--env'),
      running,
      memoryBytes: Number(readFlag(args, '--memory')),
      tmpfs: args.includes('--tmpfs') ? readFlag(args, '--tmpfs') : undefined,
      aliases: args.includes('--network-alias') ? [readFlag(args, '--network-alias')] : [],
    });
    add('container', name, args[0] === 'create' ? alterContainer(entry) : entry);
    return ok(`${entry.Id}\n`);
  };

  const execInside = (args: readonly string[], stdin: string | Buffer | undefined): RunCommandResult => {
    const container = args[args.indexOf('--user') + 2] ?? '';
    const argv = args.slice(args.indexOf('--user') + 3);
    const containerEntry = state.get(`container:${container}`)?.entry;
    if (!containerEntry?.State?.Running) return failed(`Error response from daemon: container ${container} is not running`);
    if (containerEntry.Config?.Labels?.['openchamber.space.role'] === 'gatekeeper') {
      if (argv[0] === IMAGE_SH && (argv[2] ?? '').includes(`${GATEKEEPER_PROGRAM_PATH}.new`)) {
        programs.set(container, String(stdin ?? ''));
        return ok();
      }
      if (argv[0] !== IMAGE_CURL) return ok();
      if (!gatekeeperReady || !programs.has(container)) return { code: 7, stdout: '', stderr: 'curl: (7) Failed to connect' };
      const controlPath = Array.from(CONTROL_ANSWERS.keys()).find((candidate) => String(stdin ?? '').includes(`${candidate}"`));
      const controlAnswer = controlPath !== undefined ? CONTROL_ANSWERS.get(controlPath) : undefined;
      return controlAnswer !== undefined ? ok(controlAnswer) : ok('HTTP/1.1 404 Not Found\r\n\r\n{"error":"no such control endpoint"}');
    }
    const home = homeOf(container);
    if (argv[0] === IMAGE_CURL) return serverReady && tokens.has(home) ? ok(HEALTHY_ANSWER) : { code: 7, stdout: '', stderr: 'curl: (7) Failed to connect' };
    if (argv[0] === IMAGE_SH && (argv[2] ?? '').includes(`${SPACE_TOKEN_PATH}.new`)) {
      tokens.set(home, String(stdin ?? ''));
      return ok();
    }
    if (argv[0] === IMAGE_CAT && argv[1] === SPACE_TOKEN_PATH) return ok(`${tokens.get(home)}\n`);
    if (argv[0] === IMAGE_SH) return ok();
    return ok('1000\n');
  };

  const runOneShot = (args: readonly string[], { stuck, fails }: { stuck: boolean; fails: boolean }): RunCommandResult => {
    const role = roleOf(args);
    const [toolsMount] = readMounts(args);
    if (role === 'tools-check' && fails) return failed('failed to connect to the docker API at tcp://127.0.0.1:1');
    if (role === 'tools-check') {
      const key = toolsMount ? filled.get(toolsMount.volume) : undefined;
      return key ? ok(key) : { code: 42, stdout: '', stderr: '' };
    }
    const result = addContainer(args, { running: true });
    if (result.code !== 0) return result;
    if (!stuck) state.delete(`container:${readFlag(args, '--name')}`);
    if (fails) return failed('Error response from daemon: simulated failure');
    if (role === 'tools-fill' && !stuck && toolsMount) {
      const toolsKey = readPairs(args, '--label')['openchamber.space.tools.key'];
      if (toolsKey !== undefined) filled.set(toolsMount.volume, toolsKey);
    }
    return result;
  };

  const answer = (args: readonly string[], { stuck = false, fails = false, stdin = '' }: { stuck?: boolean; fails?: boolean; stdin?: string | Buffer | undefined } = {}): RunCommandResult => {
    const [first = '', second = ''] = args;
    if (first === 'run') return runOneShot(args, { stuck, fails });
    if (first === 'create') {
      if (fails) {
        addContainer(args, { running: false });
        return failed('Error response from daemon: simulated failure');
      }
      return addContainer(args, { running: false });
    }
    if (fails) return failed('Error response from daemon: simulated failure');
    if (first === 'inspect') return inspect('container', args.slice(3));
    if (first === 'image' && second === 'inspect') {
      const target = args[2] ?? '';
      const old = retired.get(target);
      if (old) return ok(JSON.stringify([{ Id: old.id, Size: Math.round(old.bytes / 4), RepoTags: old.tags }]));
      return image && target === FAKE_BASE_IMAGE ? ok(JSON.stringify([{ Id: 'sha256:0123', Size: Math.round(imageBytes / 4), RepoTags: [FAKE_BASE_IMAGE] }])) : failed(NOT_FOUND_TEXT.image(target), '[]');
    }
    const lastArg = args[args.length - 1] ?? '';
    if (first === 'image' && second === 'rm' && retired.has(lastArg)) {
      const name = lastArg;
      const old = retired.get(name);
      const user = ofKind('container').find((resource) => resource.entry.Config?.Image === name);
      if (user && !args.includes('--force')) return failed(`Error response from daemon: conflict: unable to delete ${old?.id ?? ''} (must be forced) - image is being used by stopped container ${user.entry.Id ?? ''}`);
      retired.delete(name);
      return ok(`Deleted: ${name}`);
    }
    if (first === 'image' && second === 'rm') {
      if (!image || lastArg !== FAKE_BASE_IMAGE) return failed(NOT_FOUND_TEXT.image(lastArg));
      const user = ofKind('container').find((resource) => resource.entry.Config?.Image === FAKE_BASE_IMAGE);
      if (user && !args.includes('--force')) return failed(`Error response from daemon: conflict: unable to delete 0123 (must be forced) - image is being used by stopped container ${user.entry.Id ?? ''}`);
      image = false;
      return ok('Deleted: sha256:0123');
    }
    if (first === 'system' && second === 'df') {
      const mountedBy = (name: string): number =>
        ofKind('container').filter((resource) => (resource.entry.Mounts ?? []).some((mount) => mount.Name === name)).length;
      return ok(JSON.stringify({
        Images: [
          ...(image ? [{ ID: 'sha256:0123', Size: `${imageBytes / 1e9}GB`, UniqueSize: `${imageBytes / 1e9}GB` }] : []),
          ...Array.from(retired.values(), (old) => ({ ID: old.id, Size: `${old.bytes / 1e9}GB`, UniqueSize: `${old.bytes / 1e9}GB` })),
        ],
        Volumes: ofKind('volume').map((resource) => ({ Name: resource.name, Size: volumeSizes[resource.name] ?? '0B', Links: String(mountedBy(resource.name)) })),
      }));
    }
    if (first === 'info') return ok(`${JSON.stringify(engineName)}\n`);
    if (first === 'pull') return ok();
    if (first === 'ps') return ok(ofKind('container').filter((resource) => matchesFilters(resource, args)).map((resource) => resource.name).join('\n'));
    if (first === 'rm') {
      const name = lastArg;
      const key = containerKey(name);
      if (!args.includes('--force') && key && state.get(key)?.entry.State?.Running) {
        return failed(`Error response from daemon: cannot remove container "/${name}": container is running: stop the container before removing or force remove`);
      }
      return key && state.delete(key) ? ok(name) : failed(NOT_FOUND_TEXT.container(name));
    }
    if (first === 'stop' || first === 'start') {
      const key = containerKey(second);
      const resource = key ? state.get(key) : undefined;
      if (!resource) return failed(NOT_FOUND_TEXT.container(second));
      resource.entry.State ??= {};
      resource.entry.State.Running = first === 'start';
      if (first === 'stop') programs.delete(resource.name);
      return ok(second);
    }
    if (first === 'rename') {
      const [, from = '', to = ''] = args;
      const resource = state.get(`container:${from}`);
      if (!resource) return failed(NOT_FOUND_TEXT.container(from));
      if (state.has(`container:${to}`)) return nameConflict(to);
      state.delete(`container:${from}`);
      add('container', to, { ...resource.entry, Name: `/${to}` });
      return ok();
    }
    if (first === 'exec') return execInside(args, stdin);
    if (first === 'network' && second === 'connect') {
      const [, , network = '', container = ''] = args;
      const key = containerKey(container);
      const resource = key ? state.get(key) : undefined;
      if (!resource) return failed(NOT_FOUND_TEXT.container(container));
      if (!state.has(`network:${network}`)) return failed(NOT_FOUND_TEXT.network(network));
      resource.entry.NetworkSettings ??= {};
      resource.entry.NetworkSettings.Networks ??= {};
      resource.entry.NetworkSettings.Networks[network] = {};
      return ok();
    }
    if (first === 'network' || first === 'volume') {
      const name = lastArg;
      if (second === 'inspect') return inspect(first, args.slice(2));
      if (second === 'ls') return ok(ofKind(first).filter((resource) => matchesFilters(resource, args)).map((resource) => resource.name).join('\n'));
      if (second === 'rm') {
        const user = first === 'volume'
          ? ofKind('container').find((resource) => (resource.entry.Mounts ?? []).some((mount) => mount.Name === name))
          : undefined;
        if (user) return failed(`Error response from daemon: remove ${name}: volume is in use - [${user.name}]`);
        filled.delete(name);
        tokens.delete(name);
        return state.delete(`${first}:${name}`) ? ok(name) : failed(NOT_FOUND_TEXT[first](name));
      }
      if (second === 'create') {
        const labels = readPairs(args, '--label');
        if (first === 'volume') {
          add(first, name, { Name: name, Labels: labels });
        } else {
          add(first, name, args.includes('--internal')
            ? internalNetworkEntry({ name, labels, options: readPairs(args, '--opt') })
            : bridgeNetworkEntry({ name, labels }));
        }
        return ok(name);
      }
    }
    throw new Error(`fake docker has no answer for: ${args.join(' ')}`);
  };

  const runCommand = async (file: string, args: readonly string[], options?: RunCommandOptions): Promise<RunCommandResult> => {
    calls.push({ file, args, options });
    if (String(file).endsWith('colima')) return colima(args);
    if (timeoutAt(args)) {
      late.push(args);
      throw new SpaceError(interruptionCode, `docker ${args[0]} was stopped before it finished`);
    }
    if (args[0] === 'run' && roleOf(args) === 'tools-fill') await beforeFill();
    return answer(args, { fails: failAt(args), stdin: options?.stdin });
  };

  const wait = async (milliseconds = 0): Promise<void> => {
    clock += milliseconds;
    for (const args of late.splice(0)) {
      answer(args, { stuck: true });
    }
  };

  return {
    runCommand,
    wait,
    now: (): Date => new Date(clock),
    calls,
    names: (): string[] => Array.from(state.keys()),
    imagePresent: (): boolean => image,
    retiredImagePresent: (name: string): boolean => retired.has(name),
    token: (container: string): string | undefined => tokens.get(homeOf(container)),
  };
}
