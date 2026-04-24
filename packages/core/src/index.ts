import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  createBuildRecord,
  createReleaseRecord,
  createSubmissionRecord,
  ensureProjectDatabase,
  recordDoctorChecks,
} from "@feas/db";

export interface FeasProjectInfo {
  rootPath: string;
  packageName: string;
  displayName: string;
  easJsonPath: string;
  expoConfigPath: string | null;
  platforms: {
    ios: boolean;
    android: boolean;
  };
  bundleIdentifiers: {
    ios: string | null;
    android: string | null;
  };
}

export interface InitFeasProjectOptions {
  cwd: string;
  profile?: string;
  force?: boolean;
}

export interface InitFeasProjectResult {
  projectId: string;
  projectPath: string;
  feasHomePath: string;
  detection: FeasProjectInfo;
}

export type BuildPlatform = "ios" | "android" | "all";

export interface RunBuildOptions {
  cwd: string;
  platform: BuildPlatform;
  profile?: string;
  dryRun?: boolean;
  verbose?: boolean;
}

export interface BuildExecution {
  id: string;
  platform: "ios" | "android";
  profile: string;
  status: "success" | "failed";
  dryRun: boolean;
  artifactPath: string;
  logPath: string;
  command: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface RunBuildResult {
  profile: string;
  project: FeasProjectInfo;
  builds: BuildExecution[];
}

export type SubmitPlatform = "ios" | "android";

export interface RunSubmitOptions {
  cwd: string;
  platform: SubmitPlatform;
  path: string;
  profile?: string;
  dryRun?: boolean;
}

export interface SubmissionExecution {
  id: string;
  platform: SubmitPlatform;
  profile: string;
  status: "success" | "failed";
  dryRun: boolean;
  store: "app-store-connect" | "google-play";
  artifactPath: string;
  logPath: string;
  command: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface RunSubmitResult {
  profile: string;
  project: FeasProjectInfo;
  submission: SubmissionExecution;
}

export interface RunReleaseOptions {
  cwd: string;
  platform: BuildPlatform;
  profile?: string;
  dryRun?: boolean;
  skipSubmit?: boolean;
}

export interface ReleaseExecution {
  id: string;
  platform: "ios" | "android";
  profile: string;
  status: "success" | "failed";
  buildId?: string;
  submissionId?: string;
  startedAt: string;
  finishedAt: string;
  errorMessage?: string;
}

export interface RunReleaseResult {
  profile: string;
  project: FeasProjectInfo;
  releases: ReleaseExecution[];
}

export type DoctorPlatform = "all" | "ios" | "android";
export type DoctorStatus = "pass" | "warn" | "fail" | "skip";

export interface DoctorCheck {
  id: string;
  category: "general" | "ios" | "android";
  name: string;
  status: DoctorStatus;
  message: string;
  fixCommand?: string;
}

export interface RunDoctorOptions {
  cwd: string;
  platform?: DoctorPlatform;
  profile?: string;
}

export interface RunDoctorResult {
  platform: DoctorPlatform;
  profile: string;
  project: FeasProjectInfo;
  checks: DoctorCheck[];
  summary: {
    pass: number;
    warn: number;
    fail: number;
    skip: number;
  };
  persistence: {
    saved: boolean;
    databasePath?: string;
    reason?: string;
  };
}

interface EasBuildProfile {
  ios?: Record<string, unknown>;
  android?: Record<string, unknown>;
  env?: Record<string, string>;
}

interface EasConfig {
  build?: Record<string, EasBuildProfile>;
  submit?: Record<string, unknown>;
  cli?: {
    version?: string;
  };
}

interface PackageJson {
  name?: string;
}

interface AppJsonConfig {
  expo?: {
    name?: string;
    ios?: {
      bundleIdentifier?: string;
    };
    android?: {
      package?: string;
    };
  };
}

interface FeasGlobalConfig {
  projects: Record<
    string,
    {
      name: string;
      root: string;
      lastOpenedAt: string;
    }
  >;
}

const execFileAsync = promisify(execFile);

function getFeasVersion(): string {
  return "0.1.0";
}

function getFeasHomeDir(): string {
  const override = process.env.FEAS_HOME;
  if (override && override.trim().length > 0) {
    return path.resolve(override);
  }

  return path.join(os.homedir(), ".feas");
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function findProjectRoot(startDir: string): Promise<string> {
  let current = path.resolve(startDir);

  while (true) {
    const packageJsonPath = path.join(current, "package.json");
    if (await fileExists(packageJsonPath)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("No package.json found. Run FEAS inside your app repository.");
    }

    current = parent;
  }
}

function hasEasPlatformConfig(easConfig: EasConfig, platform: "ios" | "android"): boolean {
  if (!easConfig.build) {
    return false;
  }

  return Object.values(easConfig.build).some((profile) => {
    if (!profile) {
      return false;
    }

    return typeof profile[platform] === "object";
  });
}

function createProjectId(rootPath: string, packageName: string, bundleIdentifier: string): string {
  return createHash("sha256")
    .update(`${rootPath}|${packageName}|${bundleIdentifier}`)
    .digest("hex");
}

function resolveProjectIdentity(detection: FeasProjectInfo): { projectId: string; primaryBundleId: string } {
  const primaryBundleId = detection.bundleIdentifiers.ios ?? detection.bundleIdentifiers.android ?? "unknown.bundle";
  const projectId = createProjectId(detection.rootPath, detection.packageName, primaryBundleId);

  return { projectId, primaryBundleId };
}

function resolveProjectStoragePaths(detection: FeasProjectInfo): {
  projectId: string;
  feasHomePath: string;
  projectPath: string;
  databasePath: string;
  internalConfigPath: string;
} {
  const { projectId } = resolveProjectIdentity(detection);
  const feasHomePath = getFeasHomeDir();
  const projectPath = path.join(feasHomePath, "projects", projectId);

  return {
    projectId,
    feasHomePath,
    projectPath,
    databasePath: path.join(projectPath, "database.sqlite"),
    internalConfigPath: path.join(projectPath, "internal.config.json"),
  };
}

async function readAppJsonConfig(projectRoot: string): Promise<{
  appConfigPath: string | null;
  appConfig: AppJsonConfig | null;
}> {
  const appJsonPath = path.join(projectRoot, "app.json");
  if (await fileExists(appJsonPath)) {
    const parsed = await readJsonFile<AppJsonConfig>(appJsonPath);
    return { appConfigPath: appJsonPath, appConfig: parsed };
  }

  const appConfigTsPath = path.join(projectRoot, "app.config.ts");
  if (await fileExists(appConfigTsPath)) {
    return { appConfigPath: appConfigTsPath, appConfig: null };
  }

  const appConfigJsPath = path.join(projectRoot, "app.config.js");
  if (await fileExists(appConfigJsPath)) {
    return { appConfigPath: appConfigJsPath, appConfig: null };
  }

  return { appConfigPath: null, appConfig: null };
}

async function detectProject(cwd: string): Promise<{ detection: FeasProjectInfo; easConfig: EasConfig }> {
  const rootPath = await findProjectRoot(cwd);

  const packageJsonPath = path.join(rootPath, "package.json");
  const packageJson = await readJsonFile<PackageJson>(packageJsonPath);

  if (!packageJson.name || packageJson.name.trim().length === 0) {
    throw new Error(`package.json at ${packageJsonPath} is missing a valid name.`);
  }

  const easJsonPath = path.join(rootPath, "eas.json");
  if (!(await fileExists(easJsonPath))) {
    throw new Error("Missing eas.json. FEAS requires eas.json for profile resolution.");
  }

  const easConfig = await readJsonFile<EasConfig>(easJsonPath);
  const { appConfigPath, appConfig } = await readAppJsonConfig(rootPath);

  const iosDirPath = path.join(rootPath, "ios");
  const androidDirPath = path.join(rootPath, "android");

  const iosDetected =
    (await fileExists(iosDirPath)) ||
    Boolean(appConfig?.expo?.ios?.bundleIdentifier) ||
    hasEasPlatformConfig(easConfig, "ios");

  const androidDetected =
    (await fileExists(androidDirPath)) ||
    Boolean(appConfig?.expo?.android?.package) ||
    hasEasPlatformConfig(easConfig, "android");

  if (!iosDetected && !androidDetected) {
    throw new Error("No iOS or Android platform detected. Ensure native folders or eas.json platform config exists.");
  }

  const displayName =
    appConfig?.expo?.name && appConfig.expo.name.trim().length > 0
      ? appConfig.expo.name.trim()
      : packageJson.name;

  return {
    detection: {
      rootPath,
      packageName: packageJson.name,
      displayName,
      easJsonPath,
      expoConfigPath: appConfigPath,
      platforms: {
        ios: iosDetected,
        android: androidDetected,
      },
      bundleIdentifiers: {
        ios: appConfig?.expo?.ios?.bundleIdentifier ?? null,
        android: appConfig?.expo?.android?.package ?? null,
      },
    },
    easConfig,
  };
}

async function commandExists(command: string): Promise<boolean> {
  try {
    await execFileAsync("which", [command]);
    return true;
  } catch {
    return false;
  }
}

function parseMajor(version: string): number {
  const major = Number(version.split(".")[0]);
  return Number.isFinite(major) ? major : 0;
}

function summarizeChecks(checks: DoctorCheck[]): RunDoctorResult["summary"] {
  return checks.reduce(
    (acc, check) => {
      acc[check.status] += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0, skip: 0 },
  );
}

function sanitizeForFileName(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function timestampForFileName(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function buildCommandForPlatform(platform: "ios" | "android"): string {
  if (platform === "ios") {
    return "fastlane ios build";
  }

  return "fastlane android build";
}

function submitCommandForPlatform(platform: SubmitPlatform): string {
  if (platform === "ios") {
    return "fastlane ios submit";
  }

  return "fastlane android submit";
}

function buildInternalConfig(result: {
  detection: FeasProjectInfo;
  profile: string;
  projectId: string;
}): Record<string, unknown> {
  const { detection, profile, projectId } = result;

  return {
    schemaVersion: 1,
    projectId,
    projectRoot: detection.rootPath,
    displayName: detection.displayName,
    platforms: {
      ios: detection.platforms.ios
        ? {
            bundleIdentifier: detection.bundleIdentifiers.ios,
            scheme: null,
            workspacePath: null,
            exportMethod: "app-store",
            appleTeamId: null,
            appStoreConnectAppId: null,
          }
        : null,
      android: detection.platforms.android
        ? {
            applicationId: detection.bundleIdentifiers.android,
            gradleTask: ":app:bundleRelease",
            playPackageName: detection.bundleIdentifiers.android,
          }
        : null,
    },
    release: {
      defaultProfile: profile,
      bumpStrategy: "build-number",
      requireCleanGit: true,
      autoCommitVersionBump: false,
    },
    metadata: {
      localPath: "metadata",
      syncMode: "explicit",
    },
    dashboard: {
      port: 4545,
    },
    generatedAt: new Date().toISOString(),
  };
}

export async function initFeasProject(options: InitFeasProjectOptions): Promise<InitFeasProjectResult> {
  const profile = options.profile ?? "production";
  const { detection } = await detectProject(options.cwd);
  const { projectId, feasHomePath, projectPath, databasePath, internalConfigPath } = resolveProjectStoragePaths(detection);

  if (!options.force && (await fileExists(internalConfigPath))) {
    throw new Error(`Project already initialized at ${projectPath}. Re-run with --force to regenerate FEAS state.`);
  }

  await fs.mkdir(projectPath, { recursive: true });

  const directories = [
    "fastlane",
    "metadata/ios",
    "metadata/android",
    "artifacts/ios",
    "artifacts/android",
    "logs/builds",
    "logs/submissions",
    "logs/releases",
    "credentials",
    "cache",
  ];

  for (const relativePath of directories) {
    await fs.mkdir(path.join(projectPath, relativePath), { recursive: true });
  }

  const globalConfigPath = path.join(feasHomePath, "config.json");
  const existingConfig = (await fileExists(globalConfigPath))
    ? await readJsonFile<FeasGlobalConfig>(globalConfigPath)
    : { projects: {} };

  const now = new Date().toISOString();
  const nextGlobalConfig: FeasGlobalConfig = {
    projects: {
      ...existingConfig.projects,
      [projectId]: {
        name: detection.displayName,
        root: detection.rootPath,
        lastOpenedAt: now,
      },
    },
  };

  await writeJsonFile(globalConfigPath, nextGlobalConfig);

  await writeJsonFile(internalConfigPath, buildInternalConfig({ detection, profile, projectId }));

  await writeJsonFile(path.join(projectPath, "project.json"), {
    id: projectId,
    name: detection.displayName,
    packageName: detection.packageName,
    rootPath: detection.rootPath,
    profile,
    platforms: detection.platforms,
    createdAt: now,
    updatedAt: now,
  });

  await ensureProjectDatabase({
    databasePath,
    project: {
      id: projectId,
      name: detection.displayName,
      rootPath: detection.rootPath,
    },
  });

  return {
    projectId,
    projectPath,
    feasHomePath,
    detection,
  };
}

export async function resolveFeasConfig(options: { cwd: string; profile?: string }): Promise<Record<string, unknown>> {
  const profile = options.profile ?? "production";
  const { detection, easConfig } = await detectProject(options.cwd);

  const selectedBuildProfile = easConfig.build?.[profile] ?? null;
  const selectedSubmitProfile = easConfig.submit?.[profile] ?? null;

  return {
    schemaVersion: 1,
    profile,
    project: {
      rootPath: detection.rootPath,
      packageName: detection.packageName,
      displayName: detection.displayName,
      expoConfigPath: detection.expoConfigPath,
      easJsonPath: detection.easJsonPath,
      platforms: detection.platforms,
      bundleIdentifiers: detection.bundleIdentifiers,
    },
    eas: {
      profileExists: Boolean(selectedBuildProfile),
      build: selectedBuildProfile,
      submit: selectedSubmitProfile,
    },
    feas: {
      homePath: getFeasHomeDir(),
      version: getFeasVersion(),
    },
  };
}

export async function runBuild(options: RunBuildOptions): Promise<RunBuildResult> {
  const profile = options.profile ?? "production";
  const dryRun = options.dryRun ?? false;
  const { detection, easConfig } = await detectProject(options.cwd);
  const { projectId, projectPath, databasePath, internalConfigPath } = resolveProjectStoragePaths(detection);

  if (!(await fileExists(internalConfigPath))) {
    throw new Error("Project is not initialized. Run `feas init` before running build.");
  }

  if (!easConfig.build?.[profile]) {
    throw new Error(`Build profile '${profile}' not found in eas.json.`);
  }

  await ensureProjectDatabase({
    databasePath,
    project: {
      id: projectId,
      name: detection.displayName,
      rootPath: detection.rootPath,
    },
  });

  const targetPlatforms: Array<"ios" | "android"> = [];
  if (options.platform === "all") {
    if (detection.platforms.ios) {
      targetPlatforms.push("ios");
    }
    if (detection.platforms.android) {
      targetPlatforms.push("android");
    }
  } else {
    targetPlatforms.push(options.platform);
  }

  if (targetPlatforms.length === 0) {
    throw new Error("No target platforms available for build.");
  }

  for (const platform of targetPlatforms) {
    if (!detection.platforms[platform]) {
      throw new Error(`Platform '${platform}' is not configured for this project.`);
    }
  }

  const builds: BuildExecution[] = [];

  for (const platform of targetPlatforms) {
    const startedAt = new Date();
    const buildId = randomUUID();
    const command = buildCommandForPlatform(platform);
    const timestamp = timestampForFileName(startedAt);
    const artifactExtension = platform === "ios" ? "ipa" : "aab";
    const artifactPath = path.join(
      projectPath,
      "artifacts",
      platform,
      `${sanitizeForFileName(detection.displayName)}-${sanitizeForFileName(profile)}-${timestamp}.${artifactExtension}`,
    );
    const logPath = path.join(projectPath, "logs", "builds", `build-${timestamp}-${platform}-${buildId}.log`);

    await fs.mkdir(path.dirname(artifactPath), { recursive: true });
    await fs.mkdir(path.dirname(logPath), { recursive: true });

    let status: BuildExecution["status"] = "success";
    let errorCode: string | undefined;
    let errorMessage: string | undefined;
    const logLines: string[] = [];
    logLines.push(`[feas] build id: ${buildId}`);
    logLines.push(`[feas] platform: ${platform}`);
    logLines.push(`[feas] profile: ${profile}`);
    logLines.push(`[feas] command: ${command}`);
    logLines.push(`[feas] startedAt: ${startedAt.toISOString()}`);

    if (dryRun) {
      logLines.push("[feas] mode: dry-run");
      logLines.push("[feas] build execution skipped.");
      await fs.writeFile(
        artifactPath,
        `Dry-run placeholder artifact for ${detection.displayName} (${platform}, profile=${profile}).\n`,
        "utf8",
      );
    } else {
      status = "failed";
      errorCode = "BUILD_NOT_IMPLEMENTED";
      errorMessage = "Real native build execution is not implemented yet. Re-run with --dry-run for preview mode.";
      logLines.push("[feas] mode: real");
      logLines.push(`[feas] errorCode: ${errorCode}`);
      logLines.push(`[feas] errorMessage: ${errorMessage}`);
    }

    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    logLines.push(`[feas] finishedAt: ${finishedAt.toISOString()}`);
    logLines.push(`[feas] durationMs: ${durationMs}`);
    logLines.push(`[feas] status: ${status}`);
    await fs.writeFile(logPath, `${logLines.join("\n")}\n`, "utf8");

    await createBuildRecord({
      databasePath,
      build: {
        id: buildId,
        projectId,
        platform,
        profile,
        status,
        artifactPath,
        logPath,
        startedAt,
        finishedAt,
        durationMs,
        errorCode,
        errorMessage,
      },
    });

    builds.push({
      id: buildId,
      platform,
      profile,
      status,
      dryRun,
      artifactPath,
      logPath,
      command,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs,
      errorCode,
      errorMessage,
    });
  }

  return {
    profile,
    project: detection,
    builds,
  };
}

export async function runSubmit(options: RunSubmitOptions): Promise<RunSubmitResult> {
  const profile = options.profile ?? "production";
  const dryRun = options.dryRun ?? false;
  const { detection, easConfig } = await detectProject(options.cwd);
  const { projectId, projectPath, databasePath, internalConfigPath } = resolveProjectStoragePaths(detection);

  if (!(await fileExists(internalConfigPath))) {
    throw new Error("Project is not initialized. Run `feas init` before running submit.");
  }

  if (!detection.platforms[options.platform]) {
    throw new Error(`Platform '${options.platform}' is not configured for this project.`);
  }

  const resolvedArtifactPath = path.resolve(options.cwd, options.path);
  if (!(await fileExists(resolvedArtifactPath))) {
    throw new Error(`Artifact not found at ${resolvedArtifactPath}.`);
  }

  const submitProfile = easConfig.submit?.[profile];
  if (!submitProfile) {
    throw new Error(`Submit profile '${profile}' not found in eas.json.`);
  }

  await ensureProjectDatabase({
    databasePath,
    project: {
      id: projectId,
      name: detection.displayName,
      rootPath: detection.rootPath,
    },
  });

  const startedAt = new Date();
  const submissionId = randomUUID();
  const timestamp = timestampForFileName(startedAt);
  const command = submitCommandForPlatform(options.platform);
  const logPath = path.join(projectPath, "logs", "submissions", `submission-${timestamp}-${options.platform}-${submissionId}.log`);
  const store = options.platform === "ios" ? "app-store-connect" : "google-play";

  await fs.mkdir(path.dirname(logPath), { recursive: true });

  let status: SubmissionExecution["status"] = "success";
  let errorCode: string | undefined;
  let errorMessage: string | undefined;
  const logLines: string[] = [];
  logLines.push(`[feas] submission id: ${submissionId}`);
  logLines.push(`[feas] platform: ${options.platform}`);
  logLines.push(`[feas] profile: ${profile}`);
  logLines.push(`[feas] store: ${store}`);
  logLines.push(`[feas] artifactPath: ${resolvedArtifactPath}`);
  logLines.push(`[feas] command: ${command}`);
  logLines.push(`[feas] startedAt: ${startedAt.toISOString()}`);

  if (dryRun) {
    logLines.push("[feas] mode: dry-run");
    logLines.push("[feas] submission execution skipped.");
  } else {
    status = "failed";
    errorCode = "SUBMIT_NOT_IMPLEMENTED";
    errorMessage = "Real store submission is not implemented yet. Re-run with --dry-run for preview mode.";
    logLines.push("[feas] mode: real");
    logLines.push(`[feas] errorCode: ${errorCode}`);
    logLines.push(`[feas] errorMessage: ${errorMessage}`);
  }

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();
  logLines.push(`[feas] finishedAt: ${finishedAt.toISOString()}`);
  logLines.push(`[feas] durationMs: ${durationMs}`);
  logLines.push(`[feas] status: ${status}`);
  await fs.writeFile(logPath, `${logLines.join("\n")}\n`, "utf8");

  await createSubmissionRecord({
    databasePath,
    submission: {
      id: submissionId,
      projectId,
      platform: options.platform,
      store,
      status,
      logPath,
      startedAt,
      finishedAt,
      errorCode,
      errorMessage,
    },
  });

  return {
    profile,
    project: detection,
    submission: {
      id: submissionId,
      platform: options.platform,
      profile,
      status,
      dryRun,
      store,
      artifactPath: resolvedArtifactPath,
      logPath,
      command,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs,
      errorCode,
      errorMessage,
    },
  };
}

export async function runRelease(options: RunReleaseOptions): Promise<RunReleaseResult> {
  const profile = options.profile ?? "production";
  const dryRun = options.dryRun ?? false;
  const skipSubmit = options.skipSubmit ?? false;
  const { detection } = await detectProject(options.cwd);
  const { projectId, databasePath } = resolveProjectStoragePaths(detection);

  const targetPlatforms: Array<"ios" | "android"> = [];
  if (options.platform === "all") {
    if (detection.platforms.ios) {
      targetPlatforms.push("ios");
    }
    if (detection.platforms.android) {
      targetPlatforms.push("android");
    }
  } else {
    targetPlatforms.push(options.platform);
  }

  if (targetPlatforms.length === 0) {
    throw new Error("No target platforms available for release.");
  }

  const releases: ReleaseExecution[] = [];

  for (const platform of targetPlatforms) {
    const releaseId = randomUUID();
    const startedAt = new Date();
    let finishedAt = startedAt;
    let status: ReleaseExecution["status"] = "success";
    let errorMessage: string | undefined;
    let buildId: string | undefined;
    let submissionId: string | undefined;

    const buildResult = await runBuild({
      cwd: options.cwd,
      platform,
      profile,
      dryRun,
    });
    const buildExecution = buildResult.builds[0];
    buildId = buildExecution?.id;

    if (!buildExecution || buildExecution.status === "failed") {
      status = "failed";
      errorMessage = buildExecution?.errorMessage ?? "Build step failed.";
      finishedAt = new Date();
    } else if (!skipSubmit) {
      const submitResult = await runSubmit({
        cwd: options.cwd,
        platform,
        path: buildExecution.artifactPath,
        profile,
        dryRun,
      });
      submissionId = submitResult.submission.id;
      if (submitResult.submission.status === "failed") {
        status = "failed";
        errorMessage = submitResult.submission.errorMessage ?? "Submit step failed.";
      }
      finishedAt = new Date();
    } else {
      finishedAt = new Date();
    }

    await createReleaseRecord({
      databasePath,
      release: {
        id: releaseId,
        projectId,
        platform,
        profile,
        status,
        buildId,
        submissionId,
        startedAt,
        finishedAt,
        errorMessage,
      },
    });

    releases.push({
      id: releaseId,
      platform,
      profile,
      status,
      buildId,
      submissionId,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      errorMessage,
    });
  }

  return {
    profile,
    project: detection,
    releases,
  };
}

export async function runDoctor(options: RunDoctorOptions): Promise<RunDoctorResult> {
  const profile = options.profile ?? "production";
  const platform = options.platform ?? "all";

  const { detection, easConfig } = await detectProject(options.cwd);
  const checks: DoctorCheck[] = [];

  const nodeVersion = process.versions.node;
  const nodeMajor = parseMajor(nodeVersion);
  checks.push({
    id: "general_node_version",
    category: "general",
    name: "Node version",
    status: nodeMajor >= 20 ? "pass" : "fail",
    message: nodeMajor >= 20 ? `Node ${nodeVersion} is supported.` : `Node ${nodeVersion} detected. FEAS requires Node 20+ for MVP.`,
    fixCommand: nodeMajor >= 20 ? undefined : "Install Node 20+ and retry.",
  });

  const hasPnpmLock = await fileExists(path.join(detection.rootPath, "pnpm-lock.yaml"));
  const hasNpmLock = await fileExists(path.join(detection.rootPath, "package-lock.json"));
  const hasYarnLock = await fileExists(path.join(detection.rootPath, "yarn.lock"));
  const hasBunLock = await fileExists(path.join(detection.rootPath, "bun.lockb"));
  const lockCount = [hasPnpmLock, hasNpmLock, hasYarnLock, hasBunLock].filter(Boolean).length;
  checks.push({
    id: "general_package_manager_lock",
    category: "general",
    name: "Package manager lockfile",
    status: lockCount === 0 ? "warn" : lockCount > 1 ? "warn" : "pass",
    message:
      lockCount === 0
        ? "No lockfile detected. Dependency installs may not be reproducible."
        : lockCount > 1
          ? "Multiple lockfiles detected. Choose one package manager to avoid drift."
          : "Single lockfile detected.",
    fixCommand: lockCount <= 1 ? undefined : "Remove extra lockfiles and keep one package manager.",
  });

  const easProfileExists = Boolean(easConfig.build?.[profile]);
  checks.push({
    id: "general_profile_exists",
    category: "general",
    name: "EAS build profile",
    status: easProfileExists ? "pass" : "fail",
    message: easProfileExists ? `build.${profile} found in eas.json.` : `build.${profile} missing in eas.json.`,
    fixCommand: easProfileExists ? undefined : `Add build.${profile} to eas.json or run with --profile <existing-profile>.`,
  });

  checks.push({
    id: "general_project_root",
    category: "general",
    name: "Project root",
    status: "pass",
    message: `Resolved project root at ${detection.rootPath}.`,
  });

  checks.push({
    id: "general_expo_config",
    category: "general",
    name: "Expo config",
    status: detection.expoConfigPath ? "pass" : "warn",
    message: detection.expoConfigPath
      ? `Expo config detected at ${detection.expoConfigPath}.`
      : "No app.json/app.config.* found. Some FEAS features may be limited.",
  });

  const hasGitBinary = await commandExists("git");
  if (!hasGitBinary) {
    checks.push({
      id: "general_git_installed",
      category: "general",
      name: "Git installed",
      status: "fail",
      message: "git command not found.",
      fixCommand: "Install git and retry.",
    });
  } else {
    checks.push({
      id: "general_git_installed",
      category: "general",
      name: "Git installed",
      status: "pass",
      message: "git command detected.",
    });

    try {
      await execFileAsync("git", ["-C", detection.rootPath, "rev-parse", "--is-inside-work-tree"]);
      checks.push({
        id: "general_git_repo",
        category: "general",
        name: "Git repository",
        status: "pass",
        message: "Project is inside a git repository.",
      });

      const { stdout } = await execFileAsync("git", ["-C", detection.rootPath, "status", "--porcelain"]);
      checks.push({
        id: "general_git_clean",
        category: "general",
        name: "Git working tree",
        status: stdout.trim().length === 0 ? "pass" : "warn",
        message: stdout.trim().length === 0 ? "Working tree is clean." : "Working tree has uncommitted changes.",
      });
    } catch {
      checks.push({
        id: "general_git_repo",
        category: "general",
        name: "Git repository",
        status: "warn",
        message: "Project is not inside a git repository.",
      });
    }
  }

  if (platform === "all" || platform === "ios") {
    const isMac = process.platform === "darwin";
    checks.push({
      id: "ios_macos_required",
      category: "ios",
      name: "macOS required",
      status: isMac ? "pass" : "fail",
      message: isMac ? "Running on macOS." : "iOS workflows require macOS.",
      fixCommand: isMac ? undefined : "Run FEAS iOS workflows on macOS.",
    });

    checks.push({
      id: "ios_platform_detected",
      category: "ios",
      name: "iOS platform detected",
      status: detection.platforms.ios ? "pass" : "fail",
      message: detection.platforms.ios ? "iOS configuration detected." : "No iOS configuration detected.",
      fixCommand: detection.platforms.ios ? undefined : "Add iOS native config or iOS entries in eas.json/app config.",
    });

    if (isMac) {
      const xcodeInstalled = await commandExists("xcodebuild");
      checks.push({
        id: "ios_xcode_installed",
        category: "ios",
        name: "Xcode build tools",
        status: xcodeInstalled ? "pass" : "fail",
        message: xcodeInstalled ? "xcodebuild detected." : "xcodebuild not found.",
        fixCommand: xcodeInstalled ? undefined : "Install Xcode and run xcode-select --switch.",
      });
    } else {
      checks.push({
        id: "ios_xcode_installed",
        category: "ios",
        name: "Xcode build tools",
        status: "skip",
        message: "Skipped because platform is not macOS.",
      });
    }

    const rubyInstalled = await commandExists("ruby");
    checks.push({
      id: "ios_ruby_installed",
      category: "ios",
      name: "Ruby installed",
      status: rubyInstalled ? "pass" : "fail",
      message: rubyInstalled ? "ruby command detected." : "ruby command not found.",
      fixCommand: rubyInstalled ? undefined : "Install Ruby before running iOS release commands.",
    });

    const fastlaneInstalled = await commandExists("fastlane");
    checks.push({
      id: "ios_fastlane_installed",
      category: "ios",
      name: "Fastlane installed",
      status: fastlaneInstalled ? "pass" : "fail",
      message: fastlaneInstalled ? "fastlane command detected." : "fastlane command not found.",
      fixCommand: fastlaneInstalled ? undefined : "Install Fastlane and retry.",
    });
  }

  if (platform === "all" || platform === "android") {
    checks.push({
      id: "android_platform_detected",
      category: "android",
      name: "Android platform detected",
      status: detection.platforms.android ? "pass" : "fail",
      message: detection.platforms.android ? "Android configuration detected." : "No Android configuration detected.",
      fixCommand: detection.platforms.android ? undefined : "Add Android native config or Android entries in eas.json/app config.",
    });

    const javaInstalled = await commandExists("java");
    checks.push({
      id: "android_java_installed",
      category: "android",
      name: "Java installed",
      status: javaInstalled ? "pass" : "fail",
      message: javaInstalled ? "java command detected." : "java command not found.",
      fixCommand: javaInstalled ? undefined : "Install Java (JDK 17+) before Android builds.",
    });

    const androidDirExists = await fileExists(path.join(detection.rootPath, "android"));
    checks.push({
      id: "android_project_exists",
      category: "android",
      name: "Android project folder",
      status: androidDirExists ? "pass" : "warn",
      message: androidDirExists ? "android/ directory exists." : "android/ directory not found (managed Expo without prebuild may still work later).",
    });

    const gradleWrapperExists =
      (await fileExists(path.join(detection.rootPath, "gradlew"))) ||
      (await fileExists(path.join(detection.rootPath, "android", "gradlew")));
    const gradleInstalled = gradleWrapperExists || (await commandExists("gradle"));
    checks.push({
      id: "android_gradle_available",
      category: "android",
      name: "Gradle available",
      status: gradleInstalled ? "pass" : "fail",
      message: gradleInstalled ? "Gradle wrapper or gradle command detected." : "No Gradle wrapper and gradle command not found.",
      fixCommand: gradleInstalled ? undefined : "Generate native Android project or install Gradle.",
    });
  }

  const { projectId, databasePath, internalConfigPath } = resolveProjectStoragePaths(detection);
  let persistence: RunDoctorResult["persistence"] = {
    saved: false,
    reason: "Project not initialized. Run `feas init` to enable doctor history persistence.",
  };

  if (await fileExists(internalConfigPath)) {
    await ensureProjectDatabase({
      databasePath,
      project: {
        id: projectId,
        name: detection.displayName,
        rootPath: detection.rootPath,
      },
    });

    await recordDoctorChecks({
      databasePath,
      projectId,
      checks: checks.map((check) => ({
        category: check.category,
        name: check.name,
        status: check.status,
        message: check.message,
        fixCommand: check.fixCommand,
      })),
    });

    persistence = {
      saved: true,
      databasePath,
    };
  }

  return {
    platform,
    profile,
    project: detection,
    checks,
    summary: summarizeChecks(checks),
    persistence,
  };
}

export function getCoreVersion(): string {
  return getFeasVersion();
}
