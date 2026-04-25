import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, scryptSync } from "node:crypto";
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
} from "feas-db";

export interface FeasProjectInfo {
  rootPath: string;
  packageName: string;
  displayName: string;
  easJsonPath: string;
  expoConfigPath: string | null;
  projectType: "expo" | "react-native" | "hybrid" | "unknown";
  configSources: string[];
  nativeFolders: {
    ios: boolean;
    android: boolean;
  };
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
  allowPrebuild?: boolean;
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
  version?: string;
  buildNumber?: string;
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
  noBump?: boolean;
  allowPrebuild?: boolean;
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
  version?: string;
  buildNumber?: string;
  changedFiles?: string[];
  errorMessage?: string;
}

export interface RunReleaseResult {
  profile: string;
  project: FeasProjectInfo;
  releases: ReleaseExecution[];
}

export interface ListLogsOptions {
  cwd: string;
  latest?: boolean;
  id?: string;
}

export interface FeasLogEntry {
  id: string;
  type: "build" | "submission" | "release" | "doctor" | "metadata" | "credentials" | "unknown";
  filePath: string;
  createdAt: string;
  content?: string;
}

export interface ListLogsResult {
  project: FeasProjectInfo;
  logs: FeasLogEntry[];
}

export interface MetadataOperationResult {
  project: FeasProjectInfo;
  platform: "ios" | "android";
  metadataRoot: string;
  files: string[];
  mode?: "local" | "real";
  logPath?: string;
}

export interface MetadataValidationResult extends MetadataOperationResult {
  valid: boolean;
  missingFiles: string[];
}

export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

export interface CredentialsValidationResult {
  project: FeasProjectInfo;
  ios: {
    configured: boolean;
    missing: string[];
  };
  android: {
    configured: boolean;
    missing: string[];
  };
}

export interface CleanProjectResult {
  project: FeasProjectInfo;
  removed: string[];
}

export interface ConfigureIosCredentialsOptions {
  cwd: string;
  keyId?: string;
  issuerId?: string;
  privateKeyPath?: string;
  saveAs?: string;
  use?: string;
}

export interface ConfigureAndroidCredentialsOptions {
  cwd: string;
  serviceAccountPath?: string;
  saveAs?: string;
  use?: string;
}

export interface CredentialProfileSummary {
  ios: string[];
  android: string[];
}

export type DoctorPlatform = "all" | "ios" | "android";
export type DoctorStatus = "pass" | "warn" | "fail" | "skip";

export interface DoctorCheck {
  id: string;
  category: "general" | "ios" | "android" | "metadata" | "credentials";
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
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface AppJsonConfig {
  expo?: {
    name?: string;
    version?: string;
    ios?: {
      bundleIdentifier?: string;
      buildNumber?: string;
    };
    android?: {
      package?: string;
      versionCode?: number;
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

interface InternalConfig {
  schemaVersion: number;
  projectId: string;
  projectRoot: string;
  displayName: string;
  platforms: {
    ios: {
      bundleIdentifier: string | null;
      scheme: string | null;
      workspacePath: string | null;
      projectPath: string | null;
      exportMethod: string;
      appleTeamId: string | null;
      appStoreConnectAppId: string | null;
    } | null;
    android: {
      applicationId: string | null;
      gradleTask: string;
      artifactSourcePath: string;
      playPackageName: string | null;
    } | null;
  };
  release: {
    defaultProfile: string;
    bumpStrategy: string;
    requireCleanGit: boolean;
    autoCommitVersionBump: boolean;
  };
  metadata: {
    localPath: string;
    syncMode: string;
  };
  dashboard: {
    port: number;
  };
  generatedAt: string;
}

const execFileAsync = promisify(execFile);

interface CommandExecutionResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
}

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

class EncryptedFileSecretStore implements SecretStore {
  private readonly filePath: string;
  private readonly keyPath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.keyPath = `${filePath}.key`;
  }

  private async getKey(): Promise<Buffer> {
    if (await fileExists(this.keyPath)) {
      const raw = await fs.readFile(this.keyPath, "utf8");
      return scryptSync(raw.trim(), "feas-local-secret-store-v1", 32);
    }

    const secret = randomBytes(32).toString("base64url");
    await fs.mkdir(path.dirname(this.keyPath), { recursive: true });
    await fs.writeFile(this.keyPath, `${secret}\n`, { encoding: "utf8", mode: 0o600 });
    return scryptSync(secret, "feas-local-secret-store-v1", 32);
  }

  private async readAll(): Promise<Record<string, string>> {
    if (!(await fileExists(this.filePath))) {
      return {};
    }

    const raw = await fs.readFile(this.filePath, "utf8");
    const parsed = JSON.parse(raw) as { version?: number; iv?: string; tag?: string; data?: string } | Record<string, string>;
    if (!("version" in parsed)) {
      return parsed as Record<string, string>;
    }
    if (parsed.version !== 1 || !parsed.iv || !parsed.tag || !parsed.data) {
      throw new Error(`Unsupported FEAS secret store format at ${this.filePath}.`);
    }

    const decipher = createDecipheriv("aes-256-gcm", await this.getKey(), Buffer.from(parsed.iv, "base64"));
    decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(parsed.data, "base64")), decipher.final()]);
    return JSON.parse(decrypted.toString("utf8")) as Record<string, string>;
  }

  private async writeAll(secrets: Record<string, string>): Promise<void> {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", await this.getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(secrets), "utf8"), cipher.final()]);
    const payload = {
      version: 1,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: encrypted.toString("base64"),
    };

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  }

  async get(key: string): Promise<string | null> {
    const data = await this.readAll();
    return data[key] ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    const data = await this.readAll();
    data[key] = value;
    await this.writeAll(data);
  }

  async delete(key: string): Promise<void> {
    const data = await this.readAll();
    if (!(key in data)) {
      return;
    }
    delete data[key];
    await this.writeAll(data);
  }

  async list(prefix?: string): Promise<string[]> {
    const data = await this.readAll();
    const keys = Object.keys(data);
    if (!prefix) {
      return keys.sort();
    }
    return keys.filter((key) => key.startsWith(prefix)).sort();
  }
}

class EnvSecretStore implements SecretStore {
  private keyToEnvName(key: string): string {
    return `FEAS_SECRET_${key.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}`;
  }

  async get(key: string): Promise<string | null> {
    return process.env[this.keyToEnvName(key)] ?? null;
  }

  async set(): Promise<void> {
    throw new Error("EnvSecretStore is read-only. Set FEAS_SECRET_* environment variables instead.");
  }

  async delete(): Promise<void> {
    throw new Error("EnvSecretStore is read-only.");
  }

  async list(prefix?: string): Promise<string[]> {
    const envPrefix = prefix ? this.keyToEnvName(prefix) : "FEAS_SECRET_";
    return Object.keys(process.env)
      .filter((key) => key.startsWith(envPrefix))
      .sort();
  }
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function resolveInputPath(cwd: string, inputPath: string): string {
  const trimmed = inputPath.trim();
  if (!trimmed) {
    return path.resolve(cwd, trimmed);
  }
  if (trimmed === "~") {
    return os.homedir();
  }
  if (trimmed.startsWith("~/")) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  return path.isAbsolute(trimmed) ? trimmed : path.resolve(cwd, trimmed);
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
  let current = await fs.realpath(path.resolve(startDir));

  while (true) {
    const packageJsonPath = path.join(current, "package.json");
    if (await fileExists(packageJsonPath)) {
      return await fs.realpath(current);
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("No package.json found. Run FEAS inside your app repository.");
    }

    current = parent;
  }
}

function mergeAppConfig(base: AppJsonConfig | null, overlay: AppJsonConfig | null): AppJsonConfig | null {
  if (!base && !overlay) {
    return null;
  }
  return {
    expo: {
      ...(base?.expo ?? {}),
      ...(overlay?.expo ?? {}),
      ios: {
        ...(base?.expo?.ios ?? {}),
        ...(overlay?.expo?.ios ?? {}),
      },
      android: {
        ...(base?.expo?.android ?? {}),
        ...(overlay?.expo?.android ?? {}),
      },
    },
  };
}

function readStaticAppConfigSource(source: string): AppJsonConfig {
  return {
    expo: {
      name: source.match(/\bname\s*:\s*["']([^"']+)["']/)?.[1],
      version: source.match(/\bversion\s*:\s*["']([^"']+)["']/)?.[1],
      ios: {
        bundleIdentifier: source.match(/\bbundleIdentifier\s*:\s*["']([^"']+)["']/)?.[1],
        buildNumber: source.match(/\bbuildNumber\s*:\s*["']([^"']+)["']/)?.[1],
      },
      android: {
        package: source.match(/\bpackage\s*:\s*["']([^"']+)["']/)?.[1],
        versionCode: Number(source.match(/\bversionCode\s*:\s*(\d+)/)?.[1]) || undefined,
      },
    },
  };
}

function detectProjectType(packageJson: PackageJson, appConfigPath: string | null): FeasProjectInfo["projectType"] {
  const deps = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
  };
  const hasExpo = Boolean(deps.expo) || Boolean(appConfigPath);
  const hasReactNative = Boolean(deps["react-native"]);
  if (hasExpo && hasReactNative) {
    return "hybrid";
  }
  if (hasExpo) {
    return "expo";
  }
  if (hasReactNative) {
    return "react-native";
  }
  return "unknown";
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

function getSecretStore(): SecretStore {
  if (process.env.FEAS_SECRET_STORE === "env") {
    return new EnvSecretStore();
  }
  return new EncryptedFileSecretStore(path.join(getFeasHomeDir(), "secrets.enc.json"));
}

function credentialsKey(projectId: string, platform: "ios" | "android", name: string): string {
  return `projects.${projectId}.${platform}.${name}`;
}

function credentialProfileKey(platform: "ios" | "android", profileName: string, name: string): string {
  return `accounts.${platform}.${profileName}.${name}`;
}

function assertCredentialProfileName(profileName: string): void {
  if (!/^[a-zA-Z0-9._-]+$/.test(profileName)) {
    throw new Error("Credential profile names may only contain letters, numbers, dots, underscores, and hyphens.");
  }
}

async function assertReadableFile(filePath: string, label: string): Promise<void> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      throw new Error(`${label} is not a file: ${filePath}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("is not a file")) {
      throw error;
    }
    throw new Error(`${label} was not found or is not readable: ${filePath}`);
  }
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
  appConfigSources: string[];
  appConfig: AppJsonConfig | null;
}> {
  let merged: AppJsonConfig | null = null;
  const sources: string[] = [];

  const appJsonPath = path.join(projectRoot, "app.json");
  if (await fileExists(appJsonPath)) {
    const parsed = await readJsonFile<AppJsonConfig>(appJsonPath);
    merged = mergeAppConfig(merged, parsed);
    sources.push(appJsonPath);
  }

  const appConfigTsPath = path.join(projectRoot, "app.config.ts");
  if (await fileExists(appConfigTsPath)) {
    const parsed = readStaticAppConfigSource(await fs.readFile(appConfigTsPath, "utf8"));
    merged = mergeAppConfig(merged, parsed);
    sources.push(appConfigTsPath);
  }

  const appConfigJsPath = path.join(projectRoot, "app.config.js");
  if (await fileExists(appConfigJsPath)) {
    const parsed = readStaticAppConfigSource(await fs.readFile(appConfigJsPath, "utf8"));
    merged = mergeAppConfig(merged, parsed);
    sources.push(appConfigJsPath);
  }

  return { appConfigPath: sources[0] ?? null, appConfigSources: sources, appConfig: merged };
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
  const { appConfigPath, appConfigSources, appConfig } = await readAppJsonConfig(rootPath);

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
      projectType: detectProjectType(packageJson, appConfigPath),
      configSources: appConfigSources,
      nativeFolders: {
        ios: await fileExists(iosDirPath),
        android: await fileExists(androidDirPath),
      },
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

function collectStringEnv(...sources: Array<Record<string, unknown> | undefined>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const source of sources) {
    if (!source) {
      continue;
    }
    for (const [key, value] of Object.entries(source)) {
      if (typeof value === "string") {
        env[key] = value;
      }
    }
  }
  return env;
}

function resolveBuildProfileEnv(profileConfig: EasBuildProfile, platform: "ios" | "android"): Record<string, string> {
  const platformConfig = profileConfig[platform] as (Record<string, unknown> & { env?: Record<string, unknown> }) | undefined;
  return collectStringEnv(profileConfig.env, platformConfig?.env);
}

function incrementNumericString(value: string | undefined, fallback = 1): string {
  const parsed = Number.parseInt(value ?? "", 10);
  return String(Number.isFinite(parsed) ? parsed + 1 : fallback);
}

async function replaceInFile(filePath: string, replacers: Array<[RegExp, string]>, dryRun: boolean): Promise<boolean> {
  if (!(await fileExists(filePath))) {
    return false;
  }

  const original = await fs.readFile(filePath, "utf8");
  let next = original;
  for (const [pattern, replacement] of replacers) {
    next = next.replace(pattern, replacement);
  }

  if (next === original) {
    return false;
  }

  if (!dryRun) {
    await fs.copyFile(filePath, `${filePath}.feas-backup`);
    await fs.writeFile(filePath, next, "utf8");
  }
  return true;
}

async function findFilesByName(root: string, targetNames: string[], maxDepth: number): Promise<string[]> {
  if (!(await fileExists(root)) || maxDepth < 0) {
    return [];
  }

  const found: string[] = [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isFile() && targetNames.includes(entry.name)) {
      found.push(fullPath);
      continue;
    }
    if (entry.isDirectory() && maxDepth > 0 && !["build", "Pods", ".gradle"].includes(entry.name)) {
      found.push(...(await findFilesByName(fullPath, targetNames, maxDepth - 1)));
    }
  }
  return found;
}

async function gitStatus(projectRoot: string): Promise<{ insideRepo: boolean; clean: boolean; output: string }> {
  try {
    await execFileAsync("git", ["-C", projectRoot, "rev-parse", "--is-inside-work-tree"]);
    const { stdout } = await execFileAsync("git", ["-C", projectRoot, "status", "--porcelain"]);
    return { insideRepo: true, clean: stdout.trim().length === 0, output: stdout.trim() };
  } catch {
    return { insideRepo: false, clean: true, output: "" };
  }
}

async function bumpProjectVersions(projectRoot: string, platforms: Array<"ios" | "android">, dryRun: boolean): Promise<{
  version?: string;
  buildNumber?: string;
  changedFiles: string[];
}> {
  const appJsonPath = path.join(projectRoot, "app.json");
  const changedFiles: string[] = [];
  let version: string | undefined;
  let buildNumber: string | undefined;

  if (await fileExists(appJsonPath)) {
    const config = await readJsonFile<AppJsonConfig>(appJsonPath);
    config.expo ??= {};
    version = config.expo.version;

    if (platforms.includes("ios")) {
      config.expo.ios ??= {};
      buildNumber = incrementNumericString(config.expo.ios.buildNumber, 1);
      config.expo.ios.buildNumber = buildNumber;
    }

    if (platforms.includes("android")) {
      config.expo.android ??= {};
      const nextVersionCode = Number.isFinite(config.expo.android.versionCode)
        ? (config.expo.android.versionCode as number) + 1
        : 1;
      config.expo.android.versionCode = nextVersionCode;
      buildNumber = String(nextVersionCode);
    }

    if (!dryRun) {
      await fs.copyFile(appJsonPath, `${appJsonPath}.feas-backup`);
      await writeJsonFile(appJsonPath, config);
    }
    changedFiles.push(appJsonPath);
  }

  const appConfigFiles = ["app.config.ts", "app.config.js"].map((name) => path.join(projectRoot, name));
  for (const appConfigPath of appConfigFiles) {
    if (!(await fileExists(appConfigPath))) {
      continue;
    }
    const original = await fs.readFile(appConfigPath, "utf8");
    const currentIosBuild = original.match(/buildNumber\s*:\s*["'](\d+)["']/)?.[1];
    const currentAndroidCode = original.match(/versionCode\s*:\s*(\d+)/)?.[1];
    const nextIosBuild = incrementNumericString(currentIosBuild, 1);
    const nextAndroidCode = String((Number.parseInt(currentAndroidCode ?? "", 10) || 0) + 1);
    const replacements: Array<[RegExp, string]> = [];
    if (platforms.includes("ios")) {
      replacements.push([/buildNumber\s*:\s*["']\d+["']/, `buildNumber: "${nextIosBuild}"`]);
      buildNumber = nextIosBuild;
    }
    if (platforms.includes("android")) {
      replacements.push([/versionCode\s*:\s*\d+/, `versionCode: ${nextAndroidCode}`]);
      buildNumber = nextAndroidCode;
    }
    if (await replaceInFile(appConfigPath, replacements, dryRun)) {
      changedFiles.push(appConfigPath);
    }
  }

  if (platforms.includes("ios")) {
    const plistFiles = await findFilesByName(path.join(projectRoot, "ios"), ["Info.plist"], 4);
    for (const plistPath of plistFiles) {
      const original = await fs.readFile(plistPath, "utf8");
      const current = original.match(/<key>CFBundleVersion<\/key>\s*<string>(\d+)<\/string>/)?.[1];
      if (!current) {
        continue;
      }
      const next = incrementNumericString(current, 1);
      if (
        await replaceInFile(
          plistPath,
          [[/<key>CFBundleVersion<\/key>\s*<string>\d+<\/string>/, `<key>CFBundleVersion</key>\n\t<string>${next}</string>`]],
          dryRun,
        )
      ) {
        buildNumber = next;
        changedFiles.push(plistPath);
      }
    }
  }

  if (platforms.includes("android")) {
    const gradleFiles = [
      path.join(projectRoot, "android", "app", "build.gradle"),
      path.join(projectRoot, "android", "app", "build.gradle.kts"),
    ];
    for (const gradlePath of gradleFiles) {
      if (!(await fileExists(gradlePath))) {
        continue;
      }
      const original = await fs.readFile(gradlePath, "utf8");
      const current = original.match(/\bversionCode\s+(\d+)/)?.[1] ?? original.match(/\bversionCode\s*=\s*(\d+)/)?.[1];
      if (!current) {
        continue;
      }
      const next = String(Number.parseInt(current, 10) + 1);
      if (
        await replaceInFile(
          gradlePath,
          [
            [/\bversionCode\s+\d+/, `versionCode ${next}`],
            [/\bversionCode\s*=\s*\d+/, `versionCode = ${next}`],
          ],
          dryRun,
        )
      ) {
        buildNumber = next;
        changedFiles.push(gradlePath);
      }
    }
  }

  return {
    version,
    buildNumber,
    changedFiles,
  };
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

function metadataCommandForPlatform(platform: SubmitPlatform, mode: "pull" | "push"): string {
  return `fastlane ${platform} metadata_${mode}`;
}

async function ensureNativeFolderForBuild(options: {
  detection: FeasProjectInfo;
  platform: "ios" | "android";
  allowPrebuild: boolean;
  logLines: string[];
}): Promise<void> {
  if (options.detection.nativeFolders[options.platform]) {
    return;
  }

  if (!options.allowPrebuild) {
    throw new Error(
      `${options.platform} native folder is missing. This looks like Expo CNG/managed output. FEAS will not regenerate native folders unless explicitly allowed. Run \`npx expo prebuild --platform ${options.platform}\` yourself or rerun with --prebuild.`,
    );
  }

  if (options.detection.projectType !== "expo" && options.detection.projectType !== "hybrid") {
    throw new Error(`${options.platform} native folder is missing and project is not detected as Expo. Cannot prebuild safely.`);
  }

  options.logLines.push(`[feas] prebuild: npx expo prebuild --platform ${options.platform}`);
  const result = await runCommand("npx", ["expo", "prebuild", "--platform", options.platform], options.detection.rootPath);
  if (result.stdout.trim()) {
    options.logLines.push("[feas] prebuild stdout:", result.stdout.trimEnd());
  }
  if (result.stderr.trim()) {
    options.logLines.push("[feas] prebuild stderr:", result.stderr.trimEnd());
  }
  if (!result.success) {
    throw new Error(`Expo prebuild failed for ${options.platform} with exit code ${result.exitCode}.`);
  }
}

function inferLogType(fileName: string): FeasLogEntry["type"] {
  if (fileName.startsWith("build-")) {
    return "build";
  }
  if (fileName.startsWith("submission-")) {
    return "submission";
  }
  if (fileName.startsWith("release-")) {
    return "release";
  }
  if (fileName.startsWith("doctor-")) {
    return "doctor";
  }
  if (fileName.startsWith("metadata-")) {
    return "metadata";
  }
  if (fileName.startsWith("credentials-")) {
    return "credentials";
  }

  return "unknown";
}

function metadataFileNames(platform: "ios" | "android"): string[] {
  if (platform === "ios") {
    return [
      "name.txt",
      "subtitle.txt",
      "promotional_text.txt",
      "description.txt",
      "keywords.txt",
      "support_url.txt",
      "marketing_url.txt",
      "privacy_url.txt",
      "release_notes.txt",
    ];
  }

  return ["title.txt", "short_description.txt", "full_description.txt", "release_notes.txt", "privacy_policy_url.txt"];
}

const DEFAULT_METADATA_LOCALE = "en-US";
const NON_LOCALE_METADATA_DIRECTORIES = new Set(["screenshots", "review_information", "app-previews"]);

function isLocaleDirectoryName(name: string): boolean {
  return /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})+$/i.test(name);
}

async function listMetadataLocaleRoots(platformMetadataRoot: string): Promise<string[]> {
  if (!(await fileExists(platformMetadataRoot))) {
    return [];
  }

  const entries = await fs.readdir(platformMetadataRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !NON_LOCALE_METADATA_DIRECTORIES.has(name))
    .filter((name) => isLocaleDirectoryName(name))
    .sort()
    .map((name) => path.join(platformMetadataRoot, name));
}

async function resolveMetadataLocaleRoot(platformMetadataRoot: string): Promise<string> {
  const localeRoots = await listMetadataLocaleRoots(platformMetadataRoot);
  if (localeRoots.length > 0) {
    return localeRoots[0];
  }
  return path.join(platformMetadataRoot, DEFAULT_METADATA_LOCALE);
}

async function listOrDefaultMetadataLocaleRoots(platformMetadataRoot: string): Promise<string[]> {
  const localeRoots = await listMetadataLocaleRoots(platformMetadataRoot);
  if (localeRoots.length > 0) {
    return localeRoots;
  }
  return [path.join(platformMetadataRoot, DEFAULT_METADATA_LOCALE)];
}

async function runCommand(command: string, args: string[], cwd: string, extraEnv?: Record<string, string>): Promise<CommandExecutionResult> {
  try {
    const result = await execFileAsync(command, args, {
      cwd,
      env: {
        ...process.env,
        ...extraEnv,
      },
      maxBuffer: 20 * 1024 * 1024,
    });

    return {
      success: true,
      exitCode: 0,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  } catch (error: unknown) {
    const maybeError = error as {
      code?: number | string;
      stdout?: string;
      stderr?: string;
    };

    return {
      success: false,
      exitCode: typeof maybeError.code === "number" ? maybeError.code : 1,
      stdout: maybeError.stdout ?? "",
      stderr: maybeError.stderr ?? "",
    };
  }
}

function toProjectRelativePath(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath);
}

async function findFirstFileByExtension(directory: string, extension: ".xcworkspace" | ".xcodeproj"): Promise<string | null> {
  if (!(await fileExists(directory))) {
    return null;
  }

  const entries = await fs.readdir(directory, { withFileTypes: true });
  const match = entries.find((entry) => entry.name.endsWith(extension));
  if (!match) {
    return null;
  }

  return path.join(directory, match.name);
}

async function detectIosNativeSettings(projectRoot: string): Promise<{
  workspacePath: string | null;
  projectPath: string | null;
  scheme: string | null;
}> {
  const iosDirectory = path.join(projectRoot, "ios");
  const workspaceAbsolute = await findFirstFileByExtension(iosDirectory, ".xcworkspace");
  const projectAbsolute = await findFirstFileByExtension(iosDirectory, ".xcodeproj");

  let scheme: string | null = null;
  const workspaceOrProject = workspaceAbsolute ?? projectAbsolute;
  if (workspaceOrProject && (await commandExists("xcodebuild"))) {
    const xcodeArgs = workspaceAbsolute
      ? ["-workspace", workspaceAbsolute, "-list", "-json"]
      : ["-project", projectAbsolute as string, "-list", "-json"];

    const result = await runCommand("xcodebuild", xcodeArgs, projectRoot);
    if (result.success && result.stdout.trim().length > 0) {
      try {
        const parsed = JSON.parse(result.stdout) as { project?: { schemes?: string[] }; workspace?: { schemes?: string[] } };
        const schemes = parsed.workspace?.schemes ?? parsed.project?.schemes ?? [];
        if (schemes.length > 0) {
          scheme = schemes[0] ?? null;
        }
      } catch {
        // Best-effort parsing; keep scheme null if xcodebuild output is unexpected.
      }
    }
  }

  return {
    workspacePath: workspaceAbsolute ? toProjectRelativePath(projectRoot, workspaceAbsolute) : null,
    projectPath: projectAbsolute ? toProjectRelativePath(projectRoot, projectAbsolute) : null,
    scheme,
  };
}

async function detectAndroidNativeSettings(projectRoot: string): Promise<{
  gradleTask: string;
  artifactSourcePath: string;
}> {
  const defaultTask = ":app:bundleRelease";
  const defaultArtifact = "android/app/build/outputs/bundle/release/app-release.aab";
  const buildGradlePath = path.join(projectRoot, "android", "app", "build.gradle");
  const buildGradleKtsPath = path.join(projectRoot, "android", "app", "build.gradle.kts");

  if ((await fileExists(buildGradlePath)) || (await fileExists(buildGradleKtsPath))) {
    return {
      gradleTask: defaultTask,
      artifactSourcePath: defaultArtifact,
    };
  }

  return {
    gradleTask: defaultTask,
    artifactSourcePath: defaultArtifact,
  };
}

async function readInternalConfig(internalConfigPath: string): Promise<InternalConfig> {
  if (!(await fileExists(internalConfigPath))) {
    throw new Error(`Internal FEAS config is missing at ${internalConfigPath}. Re-run \`feas init --force\`.`);
  }

  return readJsonFile<InternalConfig>(internalConfigPath);
}

async function writeInternalFastlaneFiles(projectPath: string): Promise<void> {
  const fastlaneDir = path.join(projectPath, "fastlane");
  await fs.mkdir(fastlaneDir, { recursive: true });

  const fastfilePath = path.join(fastlaneDir, "Fastfile");
  const appfilePath = path.join(fastlaneDir, "Appfile");
  const pluginfilePath = path.join(fastlaneDir, "Pluginfile");

  const fastfileContent = `require "json"
require "shellwords"
require "tmpdir"

default_platform(:ios)

platform :ios do
  lane :build do
    artifact = ENV["FEAS_ARTIFACT_PATH"]
    project_root = ENV["FEAS_PROJECT_ROOT"]
    scheme = ENV["FEAS_IOS_SCHEME"]
    workspace = ENV["FEAS_IOS_WORKSPACE"]
    project = ENV["FEAS_IOS_PROJECT"]
    export_method = ENV["FEAS_IOS_EXPORT_METHOD"] || "app-store"

    UI.user_error!("FEAS_ARTIFACT_PATH is required.") unless artifact
    UI.user_error!("FEAS_PROJECT_ROOT is required.") unless project_root
    UI.user_error!("FEAS_IOS_SCHEME is required.") unless scheme
    UI.user_error!("Either FEAS_IOS_WORKSPACE or FEAS_IOS_PROJECT is required.") unless workspace || project

    output_directory = File.dirname(artifact)
    output_name = File.basename(artifact)

    gym_options = {
      scheme: scheme,
      clean: true,
      output_directory: output_directory,
      output_name: output_name,
      export_method: export_method,
      skip_package_ipa: false
    }

    if workspace
      gym_options[:workspace] = workspace
    else
      gym_options[:project] = project
    end

    gym(**gym_options)
    UI.user_error!("Expected ipa not found at #{artifact}") unless File.exist?(artifact)
  end

  lane :submit do
    artifact = ENV["FEAS_ARTIFACT_PATH"]
    submit_real = ENV["FEAS_IOS_SUBMIT_REAL"] == "1"
    UI.user_error!("FEAS_ARTIFACT_PATH is required.") unless artifact
    UI.user_error!("Artifact does not exist: #{artifact}") unless File.exist?(artifact)

    if submit_real
      key_id = ENV["FEAS_IOS_KEY_ID"]
      issuer_id = ENV["FEAS_IOS_ISSUER_ID"]
      key_path = ENV["FEAS_IOS_API_KEY_PATH"]
      UI.user_error!("Missing FEAS_IOS_KEY_ID for real iOS submit.") unless key_id
      UI.user_error!("Missing FEAS_IOS_ISSUER_ID for real iOS submit.") unless issuer_id
      UI.user_error!("Missing FEAS_IOS_API_KEY_PATH for real iOS submit.") unless key_path

      app_store_connect_api_key(
        key_id: key_id,
        issuer_id: issuer_id,
        key_filepath: key_path
      )

      pilot(
        ipa: artifact,
        skip_waiting_for_build_processing: true
      )
    else
      UI.message("Simulated iOS submit for #{artifact}")
    end
  end

  lane :metadata_pull do
    metadata_path = ENV["FEAS_METADATA_PATH"]
    key_id = ENV["FEAS_IOS_KEY_ID"]
    issuer_id = ENV["FEAS_IOS_ISSUER_ID"]
    key_path = ENV["FEAS_IOS_API_KEY_PATH"]
    app_identifier = ENV["FEAS_IOS_APP_IDENTIFIER"]
    UI.user_error!("FEAS_METADATA_PATH is required.") unless metadata_path
    UI.user_error!("Missing FEAS_IOS_KEY_ID for metadata pull.") unless key_id
    UI.user_error!("Missing FEAS_IOS_ISSUER_ID for metadata pull.") unless issuer_id
    UI.user_error!("Missing FEAS_IOS_API_KEY_PATH for metadata pull.") unless key_path
    UI.user_error!("Missing FEAS_IOS_APP_IDENTIFIER for metadata pull.") unless app_identifier

    api_key_path = File.join(Dir.tmpdir, "feas-asc-api-key-#{Time.now.to_i}-#{rand(1_000_000)}.json")
    api_key_contents = File.binread(key_path)
    File.write(api_key_path, JSON.generate({
      key_id: key_id,
      issuer_id: issuer_id,
      key: api_key_contents
    }))

    begin
      args = [
        "fastlane", "deliver", "download_metadata",
        "--api_key_path", api_key_path,
        "--app_identifier", app_identifier,
        "--metadata_path", metadata_path,
        "--screenshots_path", File.join(metadata_path, "screenshots"),
        "--skip_screenshots", "true",
        "--force", "true"
      ]
      sh(args.shelljoin)
    ensure
      File.delete(api_key_path) if File.exist?(api_key_path)
    end
  end

  lane :metadata_push do
    metadata_path = ENV["FEAS_METADATA_PATH"]
    key_id = ENV["FEAS_IOS_KEY_ID"]
    issuer_id = ENV["FEAS_IOS_ISSUER_ID"]
    key_path = ENV["FEAS_IOS_API_KEY_PATH"]
    app_identifier = ENV["FEAS_IOS_APP_IDENTIFIER"]
    UI.user_error!("FEAS_METADATA_PATH is required.") unless metadata_path
    UI.user_error!("Missing FEAS_IOS_KEY_ID for metadata push.") unless key_id
    UI.user_error!("Missing FEAS_IOS_ISSUER_ID for metadata push.") unless issuer_id
    UI.user_error!("Missing FEAS_IOS_API_KEY_PATH for metadata push.") unless key_path
    UI.user_error!("Missing FEAS_IOS_APP_IDENTIFIER for metadata push.") unless app_identifier

    app_store_connect_api_key(
      key_id: key_id,
      issuer_id: issuer_id,
      key_filepath: key_path
    )

    deliver(
      app_identifier: app_identifier,
      metadata_path: metadata_path,
      screenshots_path: File.join(metadata_path, "screenshots"),
      skip_screenshots: true,
      submit_for_review: false,
      force: true
    )
  end
end

platform :android do
  lane :build do
    artifact = ENV["FEAS_ARTIFACT_PATH"]
    project_root = ENV["FEAS_PROJECT_ROOT"]
    gradle_project_dir = ENV["FEAS_ANDROID_PROJECT_DIR"] || File.join(project_root, "android")
    gradle_task = ENV["FEAS_ANDROID_GRADLE_TASK"] || ":app:bundleRelease"
    source_artifact = ENV["FEAS_ANDROID_ARTIFACT_SOURCE"]

    UI.user_error!("FEAS_ARTIFACT_PATH is required.") unless artifact
    UI.user_error!("FEAS_PROJECT_ROOT is required.") unless project_root
    UI.user_error!("FEAS_ANDROID_ARTIFACT_SOURCE is required.") unless source_artifact

    gradle(task: gradle_task, project_dir: gradle_project_dir)

    unless File.exist?(source_artifact)
      UI.user_error!("Expected Android artifact not found at #{source_artifact}")
    end

    sh("mkdir -p \\"$(dirname '#{artifact}')\\"")
    sh("cp '#{source_artifact}' '#{artifact}'")
  end

  lane :submit do
    artifact = ENV["FEAS_ARTIFACT_PATH"]
    submit_real = ENV["FEAS_ANDROID_SUBMIT_REAL"] == "1"
    UI.user_error!("FEAS_ARTIFACT_PATH is required.") unless artifact
    UI.user_error!("Artifact does not exist: #{artifact}") unless File.exist?(artifact)

    if submit_real
      json_key = ENV["FEAS_ANDROID_SERVICE_ACCOUNT_PATH"]
      package_name = ENV["FEAS_ANDROID_PACKAGE_NAME"]
      track = ENV["FEAS_ANDROID_TRACK"] || "internal"
      UI.user_error!("Missing FEAS_ANDROID_SERVICE_ACCOUNT_PATH for real Android submit.") unless json_key
      UI.user_error!("Missing FEAS_ANDROID_PACKAGE_NAME for real Android submit.") unless package_name

      supply(
        aab: artifact,
        json_key: json_key,
        package_name: package_name,
        track: track
      )
    else
      UI.message("Simulated Android submit for #{artifact}")
    end
  end

  lane :metadata_pull do
    metadata_path = ENV["FEAS_METADATA_PATH"]
    json_key = ENV["FEAS_ANDROID_SERVICE_ACCOUNT_PATH"]
    package_name = ENV["FEAS_ANDROID_PACKAGE_NAME"]
    UI.user_error!("FEAS_METADATA_PATH is required.") unless metadata_path
    UI.user_error!("Missing FEAS_ANDROID_SERVICE_ACCOUNT_PATH for metadata pull.") unless json_key
    UI.user_error!("Missing FEAS_ANDROID_PACKAGE_NAME for metadata pull.") unless package_name

    supply(
      json_key: json_key,
      package_name: package_name,
      metadata_path: metadata_path,
      skip_upload_apk: true,
      skip_upload_aab: true,
      skip_upload_images: true,
      skip_upload_screenshots: true,
      validate_only: true
    )
  end

  lane :metadata_push do
    metadata_path = ENV["FEAS_METADATA_PATH"]
    json_key = ENV["FEAS_ANDROID_SERVICE_ACCOUNT_PATH"]
    package_name = ENV["FEAS_ANDROID_PACKAGE_NAME"]
    UI.user_error!("FEAS_METADATA_PATH is required.") unless metadata_path
    UI.user_error!("Missing FEAS_ANDROID_SERVICE_ACCOUNT_PATH for metadata push.") unless json_key
    UI.user_error!("Missing FEAS_ANDROID_PACKAGE_NAME for metadata push.") unless package_name

    supply(
      json_key: json_key,
      package_name: package_name,
      metadata_path: metadata_path,
      skip_upload_apk: true,
      skip_upload_aab: true,
      skip_upload_images: true,
      skip_upload_screenshots: true
    )
  end
end
`;

  const appfileContent = `# Internal FEAS Appfile placeholder.
# FEAS manages store-specific identifiers via internal config.
`;

  const pluginfileContent = `# Internal FEAS Pluginfile placeholder.
# Add fastlane plugins here if FEAS requires them in later milestones.
`;

  await fs.writeFile(fastfilePath, fastfileContent, "utf8");
  await fs.writeFile(appfilePath, appfileContent, "utf8");
  await fs.writeFile(pluginfilePath, pluginfileContent, "utf8");
}

async function buildInternalConfig(result: {
  detection: FeasProjectInfo;
  profile: string;
  projectId: string;
}): Promise<InternalConfig> {
  const { detection, profile, projectId } = result;
  const iosSettings = detection.platforms.ios ? await detectIosNativeSettings(detection.rootPath) : null;
  const androidSettings = detection.platforms.android ? await detectAndroidNativeSettings(detection.rootPath) : null;

  return {
    schemaVersion: 1,
    projectId,
    projectRoot: detection.rootPath,
    displayName: detection.displayName,
    platforms: {
      ios: detection.platforms.ios
        ? {
            bundleIdentifier: detection.bundleIdentifiers.ios,
            scheme: iosSettings?.scheme ?? null,
            workspacePath: iosSettings?.workspacePath ?? null,
            projectPath: iosSettings?.projectPath ?? null,
            exportMethod: "app-store",
            appleTeamId: null,
            appStoreConnectAppId: null,
          }
        : null,
      android: detection.platforms.android
        ? {
            applicationId: detection.bundleIdentifiers.android,
            gradleTask: androidSettings?.gradleTask ?? ":app:bundleRelease",
            artifactSourcePath: androidSettings?.artifactSourcePath ?? "android/app/build/outputs/bundle/release/app-release.aab",
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
    "logs/metadata",
    "credentials",
    "cache",
  ];

  for (const relativePath of directories) {
    await fs.mkdir(path.join(projectPath, relativePath), { recursive: true });
  }

  await writeInternalFastlaneFiles(projectPath);

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

  const internalConfig = await buildInternalConfig({ detection, profile, projectId });
  await writeJsonFile(internalConfigPath, internalConfig);

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
  const { projectId, projectPath, databasePath, internalConfigPath } = resolveProjectStoragePaths(detection);

  const selectedBuildProfile = easConfig.build?.[profile] ?? null;
  const selectedSubmitProfile = easConfig.submit?.[profile] ?? null;
  const internalConfig = (await fileExists(internalConfigPath))
    ? await readJsonFile<Record<string, unknown>>(internalConfigPath)
    : null;

  return {
    schemaVersion: 1,
    profile,
    projectId,
    project: {
      rootPath: detection.rootPath,
      packageName: detection.packageName,
      displayName: detection.displayName,
      expoConfigPath: detection.expoConfigPath,
      easJsonPath: detection.easJsonPath,
      platforms: detection.platforms,
      bundleIdentifiers: detection.bundleIdentifiers,
      projectType: detection.projectType,
      configSources: detection.configSources,
      nativeFolders: detection.nativeFolders,
    },
    eas: {
      profileExists: Boolean(selectedBuildProfile),
      build: selectedBuildProfile,
      submit: selectedSubmitProfile,
    },
    paths: {
      projectPath,
      databasePath,
      internalConfigPath,
      metadataPath: path.join(projectPath, "metadata"),
      artifactsPath: path.join(projectPath, "artifacts"),
      logsPath: path.join(projectPath, "logs"),
    },
    internal: internalConfig,
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
  const internalConfig = await readInternalConfig(internalConfigPath);

  const selectedBuildProfile = easConfig.build?.[profile];
  if (!selectedBuildProfile) {
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
  const fastfilePath = path.join(projectPath, "fastlane", "Fastfile");

  for (const platform of targetPlatforms) {
    const startedAt = new Date();
    const buildId = randomUUID();
    const command = buildCommandForPlatform(platform);
    const timestamp = timestampForFileName(startedAt);
    const artifactExtension = platform === "ios" ? "ipa" : "aab";
    const profileEnv = resolveBuildProfileEnv(selectedBuildProfile, platform);
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
    logLines.push(`[feas] env keys: ${Object.keys(profileEnv).sort().join(", ") || "none"}`);
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
      logLines.push("[feas] mode: real");
      let platformEnv: Record<string, string> = {};
      try {
        await ensureNativeFolderForBuild({
          detection,
          platform,
          allowPrebuild: options.allowPrebuild ?? false,
          logLines,
        });
      } catch (error) {
        status = "failed";
        errorCode = "NATIVE_FOLDER_MISSING";
        errorMessage = error instanceof Error ? error.message : "Native folder missing.";
      }
      if (platform === "ios") {
        const iosConfig = internalConfig.platforms.ios;
        if (errorCode) {
          // Preserve the native folder/prebuild failure.
        } else if (!iosConfig) {
          status = "failed";
          errorCode = "IOS_CONFIG_MISSING";
          errorMessage = "Missing iOS configuration in internal.config.json. Re-run `feas init --force`.";
        } else if (!iosConfig.scheme || (!iosConfig.workspacePath && !iosConfig.projectPath)) {
          status = "failed";
          errorCode = "IOS_NATIVE_CONFIG_INCOMPLETE";
          errorMessage = "iOS scheme/workspace/project not detected. Set them in config and retry.";
        } else {
          const workspaceAbsolute = iosConfig.workspacePath ? path.join(detection.rootPath, iosConfig.workspacePath) : undefined;
          const projectAbsolute = iosConfig.projectPath ? path.join(detection.rootPath, iosConfig.projectPath) : undefined;
          platformEnv = {
            FEAS_IOS_SCHEME: iosConfig.scheme,
            FEAS_IOS_EXPORT_METHOD: iosConfig.exportMethod,
            ...(workspaceAbsolute ? { FEAS_IOS_WORKSPACE: workspaceAbsolute } : {}),
            ...(projectAbsolute ? { FEAS_IOS_PROJECT: projectAbsolute } : {}),
          };
        }
      } else {
        const androidConfig = internalConfig.platforms.android;
        if (errorCode) {
          // Preserve the native folder/prebuild failure.
        } else if (!androidConfig) {
          status = "failed";
          errorCode = "ANDROID_CONFIG_MISSING";
          errorMessage = "Missing Android configuration in internal.config.json. Re-run `feas init --force`.";
        } else {
          platformEnv = {
            FEAS_ANDROID_GRADLE_TASK: androidConfig.gradleTask,
            FEAS_ANDROID_PROJECT_DIR: path.join(detection.rootPath, "android"),
            FEAS_ANDROID_ARTIFACT_SOURCE: path.join(detection.rootPath, androidConfig.artifactSourcePath),
          };
        }
      }

      let commandResult: CommandExecutionResult | null = null;
      if (!errorCode) {
        commandResult = await runCommand("fastlane", [platform, "build"], path.dirname(fastfilePath), {
          FASTLANE_SKIP_UPDATE_CHECK: "1",
          FASTLANE_FASTFILE_PATH: fastfilePath,
          FEAS_ARTIFACT_PATH: artifactPath,
          FEAS_PROJECT_ROOT: detection.rootPath,
          FEAS_PROFILE: profile,
          ...profileEnv,
          ...platformEnv,
        });
      }

      if (commandResult && commandResult.stdout.trim().length > 0) {
        logLines.push("[feas] stdout:");
        logLines.push(commandResult.stdout.trimEnd());
      }
      if (commandResult && commandResult.stderr.trim().length > 0) {
        logLines.push("[feas] stderr:");
        logLines.push(commandResult.stderr.trimEnd());
      }

      if (commandResult && !commandResult.success) {
        status = "failed";
        errorCode = "BUILD_COMMAND_FAILED";
        errorMessage = `Fastlane build command failed with exit code ${commandResult.exitCode}.`;
      } else if (!errorCode && !(await fileExists(artifactPath))) {
        status = "failed";
        errorCode = "BUILD_ARTIFACT_MISSING";
        errorMessage = `Build completed but artifact was not produced at ${artifactPath}.`;
      }

      if (errorCode) {
        logLines.push(`[feas] errorCode: ${errorCode}`);
      }
      if (errorMessage) {
        logLines.push(`[feas] errorMessage: ${errorMessage}`);
      }
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
        version: undefined,
        buildNumber: undefined,
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
      version: undefined,
      buildNumber: undefined,
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
  const internalConfig = await readInternalConfig(internalConfigPath);

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
  const fastfilePath = path.join(projectPath, "fastlane", "Fastfile");
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
    logLines.push("[feas] mode: real");
    const secretStore = getSecretStore();
    let submitEnv: Record<string, string> = {};

    if (options.platform === "ios") {
      const keyId = await secretStore.get(credentialsKey(projectId, "ios", "key_id"));
      const issuerId = await secretStore.get(credentialsKey(projectId, "ios", "issuer_id"));
      const privateKeyPath = await secretStore.get(credentialsKey(projectId, "ios", "private_key_path"));

      if (!keyId || !issuerId || !privateKeyPath) {
        status = "failed";
        errorCode = "IOS_CREDENTIALS_MISSING";
        errorMessage = "Missing iOS submit credentials. Run `feas credentials ios ...` before submitting.";
      } else if (!(await fileExists(privateKeyPath))) {
        status = "failed";
        errorCode = "IOS_API_KEY_FILE_MISSING";
        errorMessage = `Configured iOS API key file was not found at ${privateKeyPath}.`;
      } else {
        submitEnv = {
          FEAS_IOS_SUBMIT_REAL: "1",
          FEAS_IOS_KEY_ID: keyId,
          FEAS_IOS_ISSUER_ID: issuerId,
          FEAS_IOS_API_KEY_PATH: privateKeyPath,
        };
      }
    } else {
      const serviceAccountPath = await secretStore.get(credentialsKey(projectId, "android", "service_account_path"));
      const packageName = internalConfig.platforms.android?.playPackageName ?? detection.bundleIdentifiers.android;
      if (!serviceAccountPath || !packageName) {
        status = "failed";
        errorCode = "ANDROID_CREDENTIALS_MISSING";
        errorMessage = "Missing Android submit credentials/package name. Run `feas credentials android ...` and verify app id.";
      } else if (!(await fileExists(serviceAccountPath))) {
        status = "failed";
        errorCode = "ANDROID_SERVICE_ACCOUNT_FILE_MISSING";
        errorMessage = `Configured Android service account file was not found at ${serviceAccountPath}.`;
      } else {
        submitEnv = {
          FEAS_ANDROID_SUBMIT_REAL: "1",
          FEAS_ANDROID_SERVICE_ACCOUNT_PATH: serviceAccountPath,
          FEAS_ANDROID_PACKAGE_NAME: packageName,
          FEAS_ANDROID_TRACK: "internal",
        };
      }
    }

    let commandResult: CommandExecutionResult | null = null;
    if (!errorCode) {
      commandResult = await runCommand("fastlane", [options.platform, "submit"], path.dirname(fastfilePath), {
        FASTLANE_SKIP_UPDATE_CHECK: "1",
        FASTLANE_FASTFILE_PATH: fastfilePath,
        FEAS_ARTIFACT_PATH: resolvedArtifactPath,
        FEAS_PROJECT_ROOT: detection.rootPath,
        FEAS_PROFILE: profile,
        ...submitEnv,
      });
    }

    if (commandResult && commandResult.stdout.trim().length > 0) {
      logLines.push("[feas] stdout:");
      logLines.push(commandResult.stdout.trimEnd());
    }
    if (commandResult && commandResult.stderr.trim().length > 0) {
      logLines.push("[feas] stderr:");
      logLines.push(commandResult.stderr.trimEnd());
    }

    if (commandResult && !commandResult.success) {
      status = "failed";
      errorCode = "SUBMIT_COMMAND_FAILED";
      errorMessage = `Fastlane submit command failed with exit code ${commandResult.exitCode}.`;
    }

    if (errorCode) {
      logLines.push(`[feas] errorCode: ${errorCode}`);
    }
    if (errorMessage) {
      logLines.push(`[feas] errorMessage: ${errorMessage}`);
    }
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
  const { detection, easConfig } = await detectProject(options.cwd);
  const { projectId, projectPath, databasePath, internalConfigPath } = resolveProjectStoragePaths(detection);

  if (!(await fileExists(internalConfigPath))) {
    throw new Error("Project is not initialized. Run `feas init` before running release.");
  }
  const internalConfig = await readInternalConfig(internalConfigPath);
  if (!easConfig.build?.[profile]) {
    throw new Error(`Build profile '${profile}' not found in eas.json. Create build.${profile} before running release.`);
  }

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

  for (const platform of targetPlatforms) {
    if (!detection.platforms[platform]) {
      throw new Error(`Platform '${platform}' is not configured for this project.`);
    }
  }

  const doctorResult = await runDoctor({
    cwd: options.cwd,
    platform: options.platform,
    profile,
  });
  if (!dryRun && doctorResult.summary.fail > 0) {
    throw new Error(`Release preflight failed with ${doctorResult.summary.fail} failing doctor check(s). Run \`feas doctor ${options.platform}\`.`);
  }

  if (!dryRun && internalConfig.release.requireCleanGit) {
    const git = await gitStatus(detection.rootPath);
    if (git.insideRepo && !git.clean) {
      throw new Error(`Release requires a clean git working tree. Commit or stash changes before release.\n${git.output}`);
    }
  }

  if (!dryRun) {
    for (const platform of targetPlatforms) {
      const metadataValidation = await runMetadataValidate({ cwd: options.cwd, platform });
      if (!metadataValidation.valid) {
        throw new Error(`Metadata is incomplete for ${platform}. Run \`feas metadata validate ${platform}\` and fill required files.`);
      }
    }
  }

  const versionBump = options.noBump ? { changedFiles: [] } : await bumpProjectVersions(detection.rootPath, targetPlatforms, dryRun);
  const releases: ReleaseExecution[] = [];

  for (const platform of targetPlatforms) {
    const releaseId = randomUUID();
    const startedAt = new Date();
    const timestamp = timestampForFileName(startedAt);
    const logPath = path.join(projectPath, "logs", "releases", `release-${timestamp}-${platform}-${releaseId}.log`);
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    const logLines: string[] = [
      `[feas] release id: ${releaseId}`,
      `[feas] platform: ${platform}`,
      `[feas] profile: ${profile}`,
      `[feas] mode: ${dryRun ? "dry-run" : "real"}`,
      `[feas] skipSubmit: ${skipSubmit}`,
      `[feas] version: ${versionBump.version ?? "unknown"}`,
      `[feas] buildNumber: ${versionBump.buildNumber ?? "unknown"}`,
      `[feas] changedFiles: ${versionBump.changedFiles.join(", ") || "none"}`,
      `[feas] startedAt: ${startedAt.toISOString()}`,
    ];
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
      allowPrebuild: options.allowPrebuild,
    });
    const buildExecution = buildResult.builds[0];
    buildId = buildExecution?.id;
    logLines.push(`[feas] buildId: ${buildId ?? "none"}`);

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
      logLines.push(`[feas] submissionId: ${submissionId}`);
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
        version: versionBump.version,
        buildNumber: versionBump.buildNumber,
        buildId,
        submissionId,
        releaseNotes: undefined,
        startedAt,
        finishedAt,
        errorMessage,
      },
    });

    if (errorMessage) {
      logLines.push(`[feas] errorMessage: ${errorMessage}`);
    }
    logLines.push(`[feas] finishedAt: ${finishedAt.toISOString()}`);
    logLines.push(`[feas] status: ${status}`);
    await fs.writeFile(logPath, `${logLines.join("\n")}\n`, "utf8");

    releases.push({
      id: releaseId,
      platform,
      profile,
      status,
      buildId,
      submissionId,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      version: versionBump.version,
      buildNumber: versionBump.buildNumber,
      changedFiles: versionBump.changedFiles,
      errorMessage,
    });
  }

  return {
    profile,
    project: detection,
    releases,
  };
}

export async function listLogs(options: ListLogsOptions): Promise<ListLogsResult> {
  const { detection } = await detectProject(options.cwd);
  const { projectPath, internalConfigPath } = resolveProjectStoragePaths(detection);

  if (!(await fileExists(internalConfigPath))) {
    throw new Error("Project is not initialized. Run `feas init` before reading logs.");
  }

  const logDirectories = [
    path.join(projectPath, "logs", "builds"),
    path.join(projectPath, "logs", "submissions"),
    path.join(projectPath, "logs", "releases"),
    path.join(projectPath, "logs", "metadata"),
  ];

  const files: Array<{ filePath: string; createdAtMs: number }> = [];

  for (const directory of logDirectories) {
    if (!(await fileExists(directory))) {
      continue;
    }

    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const filePath = path.join(directory, entry.name);
      const stat = await fs.stat(filePath);
      files.push({ filePath, createdAtMs: stat.mtimeMs });
    }
  }

  let filtered = files.sort((a, b) => b.createdAtMs - a.createdAtMs);

  if (options.id) {
    filtered = filtered.filter((file) => path.basename(file.filePath).includes(options.id as string));
  }

  if (options.latest) {
    filtered = filtered.slice(0, 1);
  }

  const logs: FeasLogEntry[] = filtered.map((file) => {
    const fileName = path.basename(file.filePath);
    return {
      id: fileName.replace(/\.log$/, ""),
      type: inferLogType(fileName),
      filePath: file.filePath,
      createdAt: new Date(file.createdAtMs).toISOString(),
    };
  });

  return {
    project: detection,
    logs,
  };
}

async function runMetadataFastlane(options: {
  detection: FeasProjectInfo;
  internalConfig: InternalConfig;
  projectId: string;
  projectPath: string;
  platform: "ios" | "android";
  mode: "pull" | "push";
  metadataRoot: string;
}): Promise<{ logPath: string }> {
  const startedAt = new Date();
  const timestamp = timestampForFileName(startedAt);
  const id = randomUUID();
  await writeInternalFastlaneFiles(options.projectPath);
  const fastfilePath = path.join(options.projectPath, "fastlane", "Fastfile");
  const logPath = path.join(options.projectPath, "logs", "metadata", `metadata-${timestamp}-${options.mode}-${options.platform}-${id}.log`);
  await fs.mkdir(path.dirname(logPath), { recursive: true });

  const secretStore = getSecretStore();
  let env: Record<string, string> = {};
  if (options.platform === "ios") {
    const keyId = await secretStore.get(credentialsKey(options.projectId, "ios", "key_id"));
    const issuerId = await secretStore.get(credentialsKey(options.projectId, "ios", "issuer_id"));
    const privateKeyPath = await secretStore.get(credentialsKey(options.projectId, "ios", "private_key_path"));
    const appIdentifier = options.internalConfig.platforms.ios?.bundleIdentifier ?? options.detection.bundleIdentifiers.ios;
    if (!keyId || !issuerId || !privateKeyPath || !appIdentifier) {
      throw new Error("Missing iOS metadata credentials. Run `feas credentials ios ...` or set FEAS_SECRET_* values.");
    }
    env = {
      FEAS_IOS_KEY_ID: keyId,
      FEAS_IOS_ISSUER_ID: issuerId,
      FEAS_IOS_API_KEY_PATH: privateKeyPath,
      FEAS_IOS_APP_IDENTIFIER: appIdentifier,
    };
  } else {
    const serviceAccountPath = await secretStore.get(credentialsKey(options.projectId, "android", "service_account_path"));
    const packageName = options.internalConfig.platforms.android?.playPackageName ?? options.detection.bundleIdentifiers.android;
    if (!serviceAccountPath || !packageName) {
      throw new Error("Missing Android metadata credentials/package name. Run `feas credentials android ...` and verify app id.");
    }
    env = {
      FEAS_ANDROID_SERVICE_ACCOUNT_PATH: serviceAccountPath,
      FEAS_ANDROID_PACKAGE_NAME: packageName,
    };
  }

  const command = metadataCommandForPlatform(options.platform, options.mode);
  const result = await runCommand("fastlane", [options.platform, `metadata_${options.mode}`], path.dirname(fastfilePath), {
    FASTLANE_SKIP_UPDATE_CHECK: "1",
    FASTLANE_FASTFILE_PATH: fastfilePath,
    FEAS_METADATA_PATH: options.metadataRoot,
    FEAS_PROJECT_ROOT: options.detection.rootPath,
    ...env,
  });

  const lines = [
    `[feas] metadata id: ${id}`,
    `[feas] platform: ${options.platform}`,
    `[feas] mode: ${options.mode}`,
    `[feas] command: ${command}`,
    `[feas] metadataRoot: ${options.metadataRoot}`,
    `[feas] startedAt: ${startedAt.toISOString()}`,
  ];
  if (result.stdout.trim()) {
    lines.push("[feas] stdout:", result.stdout.trimEnd());
  }
  if (result.stderr.trim()) {
    lines.push("[feas] stderr:", result.stderr.trimEnd());
  }
  const finishedAt = new Date();
  lines.push(`[feas] finishedAt: ${finishedAt.toISOString()}`);
  lines.push(`[feas] status: ${result.success ? "success" : "failed"}`);
  await fs.writeFile(logPath, `${lines.join("\n")}\n`, "utf8");

  if (!result.success) {
    throw new Error(`Fastlane metadata ${options.mode} failed with exit code ${result.exitCode}. Log: ${logPath}`);
  }
  return { logPath };
}

export async function runMetadataPull(options: { cwd: string; platform: "ios" | "android" }): Promise<MetadataOperationResult> {
  const { detection } = await detectProject(options.cwd);
  const { projectId, projectPath, internalConfigPath } = resolveProjectStoragePaths(detection);
  if (!(await fileExists(internalConfigPath))) {
    throw new Error("Project is not initialized. Run `feas init` before metadata operations.");
  }
  const internalConfig = await readInternalConfig(internalConfigPath);

  const platformMetadataRoot = path.join(projectPath, "metadata", options.platform);

  if (process.env.FEAS_METADATA_REAL === "1") {
    const realResult = await runMetadataFastlane({
      detection,
      internalConfig,
      projectId,
      projectPath,
      platform: options.platform,
      mode: "pull",
      metadataRoot: platformMetadataRoot,
    });
    const metadataRoot = await resolveMetadataLocaleRoot(platformMetadataRoot);
    const files = metadataFileNames(options.platform).map((fileName) => path.join(metadataRoot, fileName));
    return {
      project: detection,
      platform: options.platform,
      metadataRoot,
      files,
      mode: "real",
      logPath: realResult.logPath,
    };
  }

  const metadataRoot = await resolveMetadataLocaleRoot(platformMetadataRoot);
  await fs.mkdir(metadataRoot, { recursive: true });
  const files: string[] = [];
  for (const fileName of metadataFileNames(options.platform)) {
    const filePath = path.join(metadataRoot, fileName);
    if (!(await fileExists(filePath))) {
      await fs.writeFile(filePath, "", "utf8");
    }
    files.push(filePath);
  }

  return {
    project: detection,
    platform: options.platform,
    metadataRoot,
    files,
    mode: "local",
  };
}

export async function runMetadataValidate(options: {
  cwd: string;
  platform: "ios" | "android";
}): Promise<MetadataValidationResult> {
  const { detection } = await detectProject(options.cwd);
  const { projectPath, internalConfigPath } = resolveProjectStoragePaths(detection);
  if (!(await fileExists(internalConfigPath))) {
    throw new Error("Project is not initialized. Run `feas init` before metadata operations.");
  }

  const platformMetadataRoot = path.join(projectPath, "metadata", options.platform);
  const localeRoots = await listOrDefaultMetadataLocaleRoots(platformMetadataRoot);
  const files = localeRoots.flatMap((localeRoot) => metadataFileNames(options.platform).map((name) => path.join(localeRoot, name)));
  const missingFiles: string[] = [];

  for (const filePath of files) {
    if (!(await fileExists(filePath))) {
      missingFiles.push(filePath);
      continue;
    }
    const content = await fs.readFile(filePath, "utf8");
    if (content.trim().length === 0) {
      missingFiles.push(filePath);
    }
  }

  return {
    project: detection,
    platform: options.platform,
    metadataRoot: platformMetadataRoot,
    files,
    valid: missingFiles.length === 0,
    missingFiles,
  };
}

export async function runMetadataPush(options: { cwd: string; platform: "ios" | "android" }): Promise<MetadataOperationResult> {
  const validation = await runMetadataValidate(options);
  if (!validation.valid) {
    throw new Error(`Metadata is incomplete for ${options.platform}. Run \`feas metadata validate ${options.platform}\` and fill required files.`);
  }

  if (process.env.FEAS_METADATA_REAL === "1") {
    const { detection } = await detectProject(options.cwd);
    const { projectId, projectPath, internalConfigPath } = resolveProjectStoragePaths(detection);
    const internalConfig = await readInternalConfig(internalConfigPath);
    const realResult = await runMetadataFastlane({
      detection,
      internalConfig,
      projectId,
      projectPath,
      platform: options.platform,
      mode: "push",
      metadataRoot: path.join(projectPath, "metadata", options.platform),
    });
    return {
      project: validation.project,
      platform: validation.platform,
      metadataRoot: validation.metadataRoot,
      files: validation.files,
      mode: "real",
      logPath: realResult.logPath,
    };
  }

  return {
    project: validation.project,
    platform: validation.platform,
    metadataRoot: validation.metadataRoot,
    files: validation.files,
    mode: "local",
  };
}

export async function configureIosCredentials(options: ConfigureIosCredentialsOptions): Promise<{ project: FeasProjectInfo }> {
  const { detection } = await detectProject(options.cwd);
  const { projectId, internalConfigPath } = resolveProjectStoragePaths(detection);
  if (!(await fileExists(internalConfigPath))) {
    throw new Error("Project is not initialized. Run `feas init` before credentials setup.");
  }

  const store = getSecretStore();
  let keyId = options.keyId;
  let issuerId = options.issuerId;
  let privateKeyPath = options.privateKeyPath ? resolveInputPath(options.cwd, options.privateKeyPath) : undefined;

  if (options.use) {
    assertCredentialProfileName(options.use);
    keyId = await store.get(credentialProfileKey("ios", options.use, "key_id")) ?? undefined;
    issuerId = await store.get(credentialProfileKey("ios", options.use, "issuer_id")) ?? undefined;
    privateKeyPath = await store.get(credentialProfileKey("ios", options.use, "private_key_path")) ?? undefined;
    if (!keyId || !issuerId || !privateKeyPath) {
      throw new Error(`Saved iOS credential profile '${options.use}' is incomplete or missing.`);
    }
  }

  if (!keyId || !issuerId || !privateKeyPath) {
    throw new Error("Missing required iOS credentials. Provide --key-id, --issuer-id, and --private-key-path, or use --use <profile>.");
  }

  await assertReadableFile(privateKeyPath, "App Store Connect private key");
  await store.set(credentialsKey(projectId, "ios", "key_id"), keyId);
  await store.set(credentialsKey(projectId, "ios", "issuer_id"), issuerId);
  await store.set(credentialsKey(projectId, "ios", "private_key_path"), privateKeyPath);

  if (options.saveAs) {
    assertCredentialProfileName(options.saveAs);
    await store.set(credentialProfileKey("ios", options.saveAs, "key_id"), keyId);
    await store.set(credentialProfileKey("ios", options.saveAs, "issuer_id"), issuerId);
    await store.set(credentialProfileKey("ios", options.saveAs, "private_key_path"), privateKeyPath);
  }

  return { project: detection };
}

export async function configureAndroidCredentials(options: ConfigureAndroidCredentialsOptions): Promise<{ project: FeasProjectInfo }> {
  const { detection } = await detectProject(options.cwd);
  const { projectId, internalConfigPath } = resolveProjectStoragePaths(detection);
  if (!(await fileExists(internalConfigPath))) {
    throw new Error("Project is not initialized. Run `feas init` before credentials setup.");
  }

  const store = getSecretStore();
  let serviceAccountPath = options.serviceAccountPath ? resolveInputPath(options.cwd, options.serviceAccountPath) : undefined;

  if (options.use) {
    assertCredentialProfileName(options.use);
    serviceAccountPath = await store.get(credentialProfileKey("android", options.use, "service_account_path")) ?? undefined;
    if (!serviceAccountPath) {
      throw new Error(`Saved Android credential profile '${options.use}' is incomplete or missing.`);
    }
  }

  if (!serviceAccountPath) {
    throw new Error("Missing required Android credentials. Provide --service-account-path, or use --use <profile>.");
  }

  await assertReadableFile(serviceAccountPath, "Google Play service account JSON");
  await store.set(
    credentialsKey(projectId, "android", "service_account_path"),
    serviceAccountPath,
  );

  if (options.saveAs) {
    assertCredentialProfileName(options.saveAs);
    await store.set(credentialProfileKey("android", options.saveAs, "service_account_path"), serviceAccountPath);
  }

  return { project: detection };
}

export async function listCredentialProfiles(): Promise<CredentialProfileSummary> {
  const store = getSecretStore();
  const keys = await store.list("accounts.");
  const result: CredentialProfileSummary = { ios: [], android: [] };

  for (const key of keys) {
    const match = key.match(/^accounts\.(ios|android)\.([a-zA-Z0-9._-]+)\./);
    if (!match) {
      continue;
    }
    const platform = match[1] as "ios" | "android";
    const profileName = match[2];
    if (!result[platform].includes(profileName)) {
      result[platform].push(profileName);
    }
  }

  result.ios.sort();
  result.android.sort();
  return result;
}

export async function validateCredentials(options: { cwd: string }): Promise<CredentialsValidationResult> {
  const { detection } = await detectProject(options.cwd);
  const { projectId, internalConfigPath } = resolveProjectStoragePaths(detection);
  if (!(await fileExists(internalConfigPath))) {
    throw new Error("Project is not initialized. Run `feas init` before credentials validation.");
  }

  const store = getSecretStore();
  const iosRequired = ["key_id", "issuer_id", "private_key_path"];
  const androidRequired = ["service_account_path"];

  const iosMissing: string[] = [];
  for (const key of iosRequired) {
    const value = await store.get(credentialsKey(projectId, "ios", key));
    if (!value || value.trim().length === 0) {
      iosMissing.push(key);
    }
  }

  const androidMissing: string[] = [];
  for (const key of androidRequired) {
    const value = await store.get(credentialsKey(projectId, "android", key));
    if (!value || value.trim().length === 0) {
      androidMissing.push(key);
    }
  }

  return {
    project: detection,
    ios: {
      configured: iosMissing.length === 0,
      missing: iosMissing,
    },
    android: {
      configured: androidMissing.length === 0,
      missing: androidMissing,
    },
  };
}

export async function cleanProject(options: { cwd: string; all?: boolean }): Promise<CleanProjectResult> {
  const { detection } = await detectProject(options.cwd);
  const { projectPath, internalConfigPath, databasePath } = resolveProjectStoragePaths(detection);
  if (!(await fileExists(internalConfigPath))) {
    throw new Error("Project is not initialized. Run `feas init` before clean.");
  }

  const removed: string[] = [];

  if (options.all) {
    await fs.rm(projectPath, { recursive: true, force: true });
    removed.push(projectPath);
    return { project: detection, removed };
  }

  const targets = [
    path.join(projectPath, "artifacts"),
    path.join(projectPath, "logs"),
    path.join(projectPath, "cache"),
  ];

  for (const target of targets) {
    await fs.rm(target, { recursive: true, force: true });
    await fs.mkdir(target, { recursive: true });
    removed.push(target);
  }

  if (await fileExists(databasePath)) {
    await fs.rm(databasePath, { force: true });
    removed.push(databasePath);
  }

  await ensureProjectDatabase({
    databasePath,
    project: {
      id: resolveProjectIdentity(detection).projectId,
      name: detection.displayName,
      rootPath: detection.rootPath,
    },
  });
  if (!removed.includes(databasePath)) {
    removed.push(databasePath);
  }

  return {
    project: detection,
    removed,
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

  const metadataPlatforms: Array<"ios" | "android"> = [];
  if ((platform === "all" || platform === "ios") && detection.platforms.ios) {
    metadataPlatforms.push("ios");
  }
  if ((platform === "all" || platform === "android") && detection.platforms.android) {
    metadataPlatforms.push("android");
  }

  for (const metadataPlatform of metadataPlatforms) {
    try {
      const result = await runMetadataValidate({ cwd: options.cwd, platform: metadataPlatform });
      checks.push({
        id: `metadata_${metadataPlatform}_completeness`,
        category: "metadata",
        name: `${metadataPlatform} metadata completeness`,
        status: result.valid ? "pass" : "warn",
        message: result.valid
          ? `${metadataPlatform} metadata required files are present.`
          : `${metadataPlatform} metadata is incomplete (${result.missingFiles.length} missing/empty file(s)).`,
        fixCommand: result.valid ? undefined : `Run feas metadata pull ${metadataPlatform}, fill required files, then feas metadata validate ${metadataPlatform}.`,
      });
    } catch {
      checks.push({
        id: `metadata_${metadataPlatform}_completeness`,
        category: "metadata",
        name: `${metadataPlatform} metadata completeness`,
        status: "warn",
        message: `${metadataPlatform} metadata could not be validated. Initialize FEAS and run metadata pull.`,
        fixCommand: `Run feas init, then feas metadata pull ${metadataPlatform}.`,
      });
    }
  }

  try {
    const credentials = await validateCredentials({ cwd: options.cwd });
    if (platform === "all" || platform === "ios") {
      checks.push({
        id: "credentials_ios_configured",
        category: "credentials",
        name: "iOS credentials",
        status: credentials.ios.configured ? "pass" : "warn",
        message: credentials.ios.configured ? "iOS credentials are configured." : `iOS credentials missing: ${credentials.ios.missing.join(", ")}.`,
        fixCommand: credentials.ios.configured ? undefined : "Run feas credentials ios ... before real iOS submit/metadata sync.",
      });
    }
    if (platform === "all" || platform === "android") {
      checks.push({
        id: "credentials_android_configured",
        category: "credentials",
        name: "Android credentials",
        status: credentials.android.configured ? "pass" : "warn",
        message: credentials.android.configured
          ? "Android credentials are configured."
          : `Android credentials missing: ${credentials.android.missing.join(", ")}.`,
        fixCommand: credentials.android.configured ? undefined : "Run feas credentials android ... before real Android submit/metadata sync.",
      });
    }
  } catch {
    checks.push({
      id: "credentials_configured",
      category: "credentials",
      name: "Credentials",
      status: "warn",
      message: "Credentials could not be validated before project initialization.",
      fixCommand: "Run feas init before credentials validation.",
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
