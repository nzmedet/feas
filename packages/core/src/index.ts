import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

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

  const primaryBundleId = detection.bundleIdentifiers.ios ?? detection.bundleIdentifiers.android ?? "unknown.bundle";
  const projectId = createProjectId(detection.rootPath, detection.packageName, primaryBundleId);

  const feasHomePath = getFeasHomeDir();
  const projectPath = path.join(feasHomePath, "projects", projectId);
  const internalConfigPath = path.join(projectPath, "internal.config.json");

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

  const sqlitePath = path.join(projectPath, "database.sqlite");
  if (!(await fileExists(sqlitePath))) {
    await fs.writeFile(sqlitePath, "", "utf8");
  }

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

export function getCoreVersion(): string {
  return getFeasVersion();
}
