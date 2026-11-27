export type SpaceErrorVersion = {
  major: number;
  minor: number;
  patch: number;
};

export type SpaceErrorResourceRef = {
  kind: string;
  name: string;
};

export type SpaceErrorResourceFailure = {
  kind: string;
  name: string;
  message: string;
};

export type SpaceErrorRemovalSummary = {
  removed: SpaceErrorResourceRef[];
  failed: SpaceErrorResourceFailure[];
};

export type SpaceErrorReportedPaths = {
  count: number;
  paths: string[];
};

export type SpaceErrorViolation = {
  check: string;
  message: string;
};

export type SpaceErrorFailureSummary = {
  code: string;
  message: string;
  details: SpaceErrorDetails | null;
};

export type SpaceErrorDetails = {
  exitCode?: number | null | undefined;
  status?: number | undefined;
  execFailed?: boolean | undefined;
  curlExitCode?: number | null | undefined;
  errno?: string | null | undefined;
  step?: string | undefined;
  cause?: string | null | undefined;
  temporaryDirectoryLeft?: string | undefined;
  refNotRemoved?: string | undefined;
  version?: SpaceErrorVersion | undefined;
  limit?: number | undefined;
  limitMs?: number | undefined;
  newBytes?: number | undefined;
  objectType?: string | undefined;
  objectBytes?: number | undefined;
  branch?: string | undefined;
  interrupted?: boolean | undefined;
  recorded?: boolean | undefined;
  thrownAway?: SpaceErrorReportedPaths | undefined;
  stillThere?: SpaceErrorReportedPaths | undefined;
  path?: string | undefined;
  rule?: string | undefined;
  other?: string | null | undefined;
  filteredInTheWay?: SpaceErrorReportedPaths | undefined;
  ignoredInTheWay?: SpaceErrorReportedPaths | undefined;
  violations?: SpaceErrorViolation[] | undefined;
  removal?: SpaceErrorRemovalSummary | undefined;
  removed?: SpaceErrorResourceRef[] | undefined;
  rollbackFailures?: SpaceErrorResourceFailure[] | undefined;
  uncertain?: boolean | undefined;
  original?: SpaceErrorDetails | null | undefined;
  spaces?: string[] | undefined;
  volume?: string | undefined;
  reason?: string | undefined;
  name?: string | undefined;
  tooLarge?: string[] | undefined;
  failed?: number | SpaceErrorResourceFailure[] | undefined;
  listed?: boolean | undefined;
  cleanup?: SpaceErrorFailureSummary[] | undefined;
};

export class SpaceError extends Error {
  code: string;
  details: SpaceErrorDetails | null;

  constructor(code: string, message: string, details: SpaceErrorDetails | null = null) {
    super(message);
    this.name = 'SpaceError';
    this.code = code;
    this.details = details;
  }
}
