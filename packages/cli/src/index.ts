#!/usr/bin/env node
import { promises as fs, readFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { startLocalApiServer } from "feas-api";
import {
  cleanProject,
  configureAndroidCredentials,
  configureIosCredentials,
  initFeasProject,
  listCredentialProfiles,
  listLogs,
  resolveFeasConfig,
  runBuild,
  runDoctor,
  runMetadataPull,
  runMetadataPush,
  runMetadataValidate,
  runRelease,
  runSubmit,
  validateCredentials,
} from "feas-core";
import { Command } from "commander";

const program = new Command();
const PRODUCTION_PROFILE = "production";

function resolveProductionProfile(profile: string | undefined, commandName: string): string {
  const resolved = (profile ?? PRODUCTION_PROFILE).trim() || PRODUCTION_PROFILE;
  if (resolved !== PRODUCTION_PROFILE) {
    throw new Error(`FEAS supports only '${PRODUCTION_PROFILE}' profile for ${commandName}.`);
  }
  return PRODUCTION_PROFILE;
}

function resolveCliVersion(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(currentDir, "../package.json"),
    path.resolve(currentDir, "../../package.json"),
    path.resolve(currentDir, "../../../package.json"),
  ];

  let fallbackVersion: string | null = null;
  for (const candidate of candidates) {
    try {
      const raw = readFileSync(candidate, "utf8");
      const parsed = JSON.parse(raw) as { name?: unknown; version?: unknown };
      const version = typeof parsed.version === "string" ? parsed.version : null;
      if (version && !fallbackVersion) {
        fallbackVersion = version;
      }
      if (parsed.name === "@nzmedet/feas" && version) {
        return version;
      }
    } catch {
      // Continue scanning parent package.json files.
    }
  }

  return fallbackVersion ?? "0.0.0";
}

async function directoryExists(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function resolveDashboardDistPath(): Promise<string | undefined> {
  if (process.env.FEAS_DASHBOARD_DIST) {
    return process.env.FEAS_DASHBOARD_DIST;
  }

  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(currentDir, "../../dashboard/dist"),
    path.resolve(currentDir, "../packages/dashboard/dist"),
  ];

  for (const candidate of candidates) {
    if (await directoryExists(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

async function promptRequired(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(`Missing ${label}. Provide it with a flag when running non-interactively.`);
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const value = (await rl.question(`${label}: `)).trim();
    if (!value) {
      throw new Error(`${label} is required.`);
    }
    return value;
  } finally {
    rl.close();
  }
}

async function withProgress<T>(label: string, enabled: boolean, task: () => Promise<T>): Promise<T> {
  if (!enabled) {
    return task();
  }

  if (!process.stdout.isTTY) {
    process.stdout.write(`${label}...\n`);
    return task();
  }

  const frames = ["⠋", "⠙", "⠸", "⠴", "⠦", "⠇"];
  let index = 0;
  const startedAt = Date.now();
  const timer = setInterval(() => {
    const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    process.stdout.write(`\r${frames[index % frames.length]} ${label} (${elapsedSeconds}s)`);
    index += 1;
  }, 120);

  try {
    const result = await task();
    const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    process.stdout.write(`\r✔ ${label} completed (${elapsedSeconds}s)\n`);
    return result;
  } catch (error) {
    process.stdout.write(`\r✖ ${label} failed\n`);
    throw error;
  } finally {
    clearInterval(timer);
  }
}

function green(value: string): string {
  if (!process.stdout.isTTY || process.env.NO_COLOR) {
    return value;
  }
  return `\u001b[32m${value}\u001b[0m`;
}

function successLine(message: string): void {
  process.stdout.write(`${green("✔")} ${message}\n`);
}

async function withProgressStages<T>(options: {
  enabled?: boolean;
  finalLabel: string;
  stages: string[];
  task: () => Promise<T>;
}): Promise<T> {
  const enabled = options.enabled ?? true;
  if (!enabled || options.stages.length === 0) {
    return withProgress(options.finalLabel, enabled, options.task);
  }

  if (!process.stdout.isTTY) {
    return withProgress(options.stages[0], enabled, options.task);
  }

  const frames = ["⠋", "⠙", "⠸", "⠴", "⠦", "⠇"];
  let tick = 0;
  const startedAt = Date.now();
  const timer = setInterval(() => {
    const stage = options.stages[Math.floor(tick / 8) % options.stages.length] ?? options.stages[0];
    const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    process.stdout.write(`\r${frames[tick % frames.length]} ${stage} (${elapsedSeconds}s)`);
    tick += 1;
  }, 120);

  try {
    const result = await options.task();
    const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    process.stdout.write(`\r${green("✔")} ${options.finalLabel} (${elapsedSeconds}s)\n`);
    return result;
  } catch (error) {
    process.stdout.write(`\r✖ ${options.finalLabel} failed\n`);
    throw error;
  } finally {
    clearInterval(timer);
  }
}

program
  .name("feas")
  .description("Local release automation for Expo and React Native apps.")
  .version(resolveCliVersion());

program
  .command("init")
  .description("Initialize FEAS project state")
  .option("--profile <profile>", "EAS profile to use", "production")
  .option("--force", "Regenerate FEAS project state", false)
  .action(async (options) => {
    const profile = resolveProductionProfile(options.profile, "init");
    const result = await withProgressStages({
      finalLabel: "Project initialized",
      stages: ["Detecting project", "Creating FEAS state", "Preparing local database"],
      task: () => initFeasProject({
        cwd: process.cwd(),
        profile,
        force: options.force,
      }),
    });

    process.stdout.write(`Initialized FEAS project: ${result.detection.displayName}\n`);
    process.stdout.write(`Project ID: ${result.projectId}\n`);
    process.stdout.write(`Project root: ${result.detection.rootPath}\n`);
    process.stdout.write(`FEAS home: ${result.feasHomePath}\n`);
    process.stdout.write(`State path: ${result.projectPath}\n`);
  });

program
  .command("config")
  .description("Show resolved FEAS config")
  .option("--profile <profile>", "EAS profile to use", "production")
  .option("--json", "Print JSON output", false)
  .action(async (options) => {
    const profile = resolveProductionProfile(options.profile, "config");
    const config = await resolveFeasConfig({
      cwd: process.cwd(),
      profile,
    });

    if (options.json) {
      process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
      return;
    }

    const project = config.project as Record<string, unknown>;
    const platforms = project.platforms as Record<string, boolean>;
    const currentProfile = config.profile as string;
    const projectId = config.projectId as string;
    const paths = config.paths as Record<string, string>;

    process.stdout.write(`Project: ${project.displayName}\n`);
    process.stdout.write(`Project ID: ${projectId}\n`);
    process.stdout.write(`Root: ${project.rootPath}\n`);
    process.stdout.write(`Profile: ${currentProfile}\n`);
    process.stdout.write(`State Path: ${paths.projectPath}\n`);
    process.stdout.write(`Platform iOS: ${platforms.ios ? "yes" : "no"}\n`);
    process.stdout.write(`Platform Android: ${platforms.android ? "yes" : "no"}\n`);
  });

program
  .command("build")
  .description("Build local binary only")
  .argument("<platform>", "Target platform: ios | android | all")
  .option("--profile <profile>", "EAS profile to use", "production")
  .option("--dry-run", "Preview build without executing native build tools", false)
  .option("--prebuild", "Allow FEAS to run Expo prebuild when native folders are missing", false)
  .option("--json", "Print JSON output", false)
  .action(async (platformArg, options) => {
    const profile = resolveProductionProfile(options.profile, "build");
    if (platformArg !== "ios" && platformArg !== "android" && platformArg !== "all") {
      throw new Error(`Invalid platform '${platformArg}'. Use ios, android, or all.`);
    }

    if (options.json) {
      const result = await runBuild({
        cwd: process.cwd(),
        platform: platformArg,
        profile,
        dryRun: options.dryRun,
        allowPrebuild: options.prebuild,
      });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    const result = await withProgress("Running build", true, () =>
      runBuild({
        cwd: process.cwd(),
        platform: platformArg,
        profile,
        dryRun: options.dryRun,
        allowPrebuild: options.prebuild,
      }),
    );

    process.stdout.write(`Build profile: ${result.profile}\n`);
    process.stdout.write(`Project: ${result.project.displayName}\n`);
    process.stdout.write(`Root: ${result.project.rootPath}\n`);
    process.stdout.write("\n");

    let hasFailures = false;
    for (const build of result.builds) {
      const icon = build.status === "success" ? "PASS" : "FAIL";
      process.stdout.write(`[${icon}] ${build.platform.toUpperCase()} build ${build.id}\n`);
      process.stdout.write(`  Mode: ${build.dryRun ? "dry-run" : "real"}\n`);
      process.stdout.write(`  Artifact: ${build.artifactPath}\n`);
      process.stdout.write(`  Log: ${build.logPath}\n`);
      process.stdout.write(`  Command: ${build.command}\n`);
      process.stdout.write(`  Duration: ${build.durationMs}ms\n`);
      if (build.errorMessage) {
        process.stdout.write(`  Error: ${build.errorMessage}\n`);
      }
      if (build.status === "failed") {
        hasFailures = true;
      }
    }

    if (hasFailures) {
      process.exitCode = 1;
    }
  });

program
  .command("submit")
  .description("Submit existing binary")
  .argument("<platform>", "Target platform: ios | android")
  .requiredOption("--path <path>", "Path to artifact (.ipa or .aab)")
  .option("--profile <profile>", "EAS profile to use", "production")
  .option("--dry-run", "Preview submit without calling store APIs", false)
  .option("--json", "Print JSON output", false)
  .action(async (platformArg, options) => {
    const profile = resolveProductionProfile(options.profile, "submit");
    if (platformArg !== "ios" && platformArg !== "android") {
      throw new Error(`Invalid platform '${platformArg}'. Use ios or android.`);
    }

    const execute = () =>
      runSubmit({
        cwd: process.cwd(),
        platform: platformArg,
        path: options.path,
        profile,
        dryRun: options.dryRun,
      });
    const result = options.json
      ? await execute()
      : await withProgressStages({
          finalLabel: "Submit completed",
          stages: ["Preparing submission", "Uploading to store", "Finalizing submission"],
          task: execute,
        });

    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    const submission = result.submission;
    const icon = submission.status === "success" ? "PASS" : "FAIL";

    process.stdout.write(`Submit profile: ${result.profile}\n`);
    process.stdout.write(`Project: ${result.project.displayName}\n`);
    process.stdout.write(`Root: ${result.project.rootPath}\n`);
    process.stdout.write("\n");
    process.stdout.write(`[${icon}] ${submission.platform.toUpperCase()} submission ${submission.id}\n`);
    process.stdout.write(`  Mode: ${submission.dryRun ? "dry-run" : "real"}\n`);
    process.stdout.write(`  Store: ${submission.store}\n`);
    process.stdout.write(`  Artifact: ${submission.artifactPath}\n`);
    process.stdout.write(`  Log: ${submission.logPath}\n`);
    process.stdout.write(`  Command: ${submission.command}\n`);
    process.stdout.write(`  Duration: ${submission.durationMs}ms\n`);
    if (submission.errorMessage) {
      process.stdout.write(`  Error: ${submission.errorMessage}\n`);
    }

    if (submission.status === "failed") {
      process.exitCode = 1;
    }
  });

program
  .command("release")
  .description("Bump, build, submit")
  .argument("<platform>", "Target platform: ios | android | all")
  .option("--profile <profile>", "EAS profile to use", "production")
  .option("--dry-run", "Preview release without executing native build/store APIs", false)
  .option("--skip-submit", "Skip submit step", false)
  .option("--no-bump", "Do not bump build numbers/versionCode", false)
  .option("--prebuild", "Allow FEAS to run Expo prebuild when native folders are missing", false)
  .option("--json", "Print JSON output", false)
  .action(async (platformArg, options) => {
    const profile = resolveProductionProfile(options.profile, "release");
    if (platformArg !== "ios" && platformArg !== "android" && platformArg !== "all") {
      throw new Error(`Invalid platform '${platformArg}'. Use ios, android, or all.`);
    }

    const execute = () =>
      runRelease({
        cwd: process.cwd(),
        platform: platformArg,
        profile,
        dryRun: options.dryRun,
        skipSubmit: options.skipSubmit,
        noBump: options.noBump,
        allowPrebuild: options.prebuild,
      });
    const result = options.json
      ? await execute()
      : await withProgressStages({
          finalLabel: "Release completed",
          stages: ["Preparing release", "Running build", "Submitting release"],
          task: execute,
        });

    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    process.stdout.write(`Release profile: ${result.profile}\n`);
    process.stdout.write(`Project: ${result.project.displayName}\n`);
    process.stdout.write(`Root: ${result.project.rootPath}\n`);
    process.stdout.write("\n");

    let hasFailures = false;
    for (const release of result.releases) {
      const icon = release.status === "success" ? "PASS" : "FAIL";
      process.stdout.write(`[${icon}] ${release.platform.toUpperCase()} release ${release.id}\n`);
      if (release.buildId) {
        process.stdout.write(`  Build: ${release.buildId}\n`);
      }
      if (release.submissionId) {
        process.stdout.write(`  Submission: ${release.submissionId}\n`);
      }
      if (release.version || release.buildNumber) {
        process.stdout.write(`  Version: ${release.version ?? "unknown"} (${release.buildNumber ?? "unknown"})\n`);
      }
      if (release.errorMessage) {
        process.stdout.write(`  Error: ${release.errorMessage}\n`);
      }
      if (release.status === "failed") {
        hasFailures = true;
      }
    }

    if (hasFailures) {
      process.exitCode = 1;
    }
  });

program
  .command("logs")
  .description("Show logs")
  .option("--latest", "Show latest log only", false)
  .option("--id <id>", "Filter log entries by id substring")
  .option("--raw", "Print raw log content", false)
  .option("--json", "Print JSON output", false)
  .action(async (options) => {
    const execute = () =>
      listLogs({
        cwd: process.cwd(),
        latest: options.latest,
        id: options.id,
      });
    const result = options.json
      ? await execute()
      : await withProgressStages({
          finalLabel: "Logs loaded",
          stages: ["Loading logs"],
          task: execute,
        });

    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    process.stdout.write(`Project: ${result.project.displayName}\n`);
    process.stdout.write(`Root: ${result.project.rootPath}\n`);
    process.stdout.write(`Logs found: ${result.logs.length}\n`);
    process.stdout.write("\n");

    if (result.logs.length === 0) {
      process.stdout.write("No logs found.\n");
      return;
    }

    for (const log of result.logs) {
      process.stdout.write(`[${log.type.toUpperCase()}] ${log.id}\n`);
      process.stdout.write(`  File: ${log.filePath}\n`);
      process.stdout.write(`  Created: ${log.createdAt}\n`);

      if (options.raw) {
        const rawContent = await fs.readFile(log.filePath, "utf8");
        process.stdout.write("  Raw:\n");
        for (const line of rawContent.split("\n")) {
          if (line.length === 0) {
            continue;
          }
          process.stdout.write(`    ${line}\n`);
        }
      }
    }
  });

program
  .command("open")
  .description("Start local dashboard API")
  .option("--port <port>", "Local dashboard/API port", "4545")
  .action(async (options) => {
    const parsedPort = Number(options.port);
    if (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
      throw new Error(`Invalid port '${options.port}'.`);
    }

    const dashboardDistPath = await resolveDashboardDistPath();
    const server = await startLocalApiServer({
      port: parsedPort,
      dashboardDistPath,
    });

    process.stdout.write(`FEAS local API started on 127.0.0.1:${parsedPort}\n`);
    process.stdout.write(`Open dashboard URL: ${server.url}\n`);
    process.stdout.write("Press Ctrl+C to stop.\n");
  });

const metadata = program.command("metadata").description("Manage local and remote store metadata");

metadata
  .command("pull")
  .argument("<platform>", "ios | android")
  .option("--real", "Pull remote store metadata with Fastlane credentials", false)
  .action(async (platformArg, options) => {
    if (platformArg !== "ios" && platformArg !== "android") {
      throw new Error(`Invalid platform '${platformArg}'. Use ios or android.`);
    }
    const previous = process.env.FEAS_METADATA_REAL;
    if (options.real) {
      process.env.FEAS_METADATA_REAL = "1";
    }
    let result;
    try {
      result = await withProgressStages({
        finalLabel: "Metadata pull completed",
        stages: options.real
          ? ["Authenticating with store", "Pulling metadata", "Writing metadata files"]
          : ["Preparing local metadata files"],
        task: () => runMetadataPull({
          cwd: process.cwd(),
          platform: platformArg,
        }),
      });
    } finally {
      if (previous === undefined) {
        delete process.env.FEAS_METADATA_REAL;
      } else {
        process.env.FEAS_METADATA_REAL = previous;
      }
    }
    successLine(`Successfully pulled ${result.mode === "real" ? "remote" : "local"} metadata for ${result.platform}.`);
    process.stdout.write(`Metadata path: ${result.metadataRoot}\n`);
    if (result.logPath) {
      process.stdout.write(`Log: ${result.logPath}\n`);
    }
  });

metadata
  .command("push")
  .argument("<platform>", "ios | android")
  .option("--real", "Push local metadata to the store with Fastlane credentials", false)
  .action(async (platformArg, options) => {
    if (platformArg !== "ios" && platformArg !== "android") {
      throw new Error(`Invalid platform '${platformArg}'. Use ios or android.`);
    }
    const previous = process.env.FEAS_METADATA_REAL;
    if (options.real) {
      process.env.FEAS_METADATA_REAL = "1";
    }
    let result;
    try {
      result = await withProgressStages({
        finalLabel: "Metadata push completed",
        stages: options.real
          ? ["Validating metadata", "Uploading metadata", "Finalizing push"]
          : ["Validating local metadata"],
        task: () => runMetadataPush({
          cwd: process.cwd(),
          platform: platformArg,
        }),
      });
    } finally {
      if (previous === undefined) {
        delete process.env.FEAS_METADATA_REAL;
      } else {
        process.env.FEAS_METADATA_REAL = previous;
      }
    }
    successLine(`${result.mode === "real" ? "Successfully pushed" : "Successfully validated"} metadata for ${result.platform}.`);
    process.stdout.write(`Files: ${result.files.length}\n`);
    if (result.logPath) {
      process.stdout.write(`Log: ${result.logPath}\n`);
    }
  });

metadata
  .command("validate")
  .argument("<platform>", "ios | android")
  .action(async (platformArg) => {
    if (platformArg !== "ios" && platformArg !== "android") {
      throw new Error(`Invalid platform '${platformArg}'. Use ios or android.`);
    }
    const result = await withProgressStages({
      finalLabel: "Metadata validation completed",
      stages: ["Validating metadata files"],
      task: () => runMetadataValidate({
        cwd: process.cwd(),
        platform: platformArg,
      }),
    });
    if (result.valid) {
      successLine(`Metadata is valid for ${result.platform}.`);
    } else {
      process.stdout.write(`Metadata validation for ${result.platform}: invalid\n`);
    }
    if (!result.valid) {
      for (const missing of result.missingFiles) {
        process.stdout.write(`  Missing: ${missing}\n`);
      }
      process.exitCode = 1;
    }
  });

metadata
  .command("open")
  .argument("<platform>", "ios | android")
  .action(async (platformArg) => {
    if (platformArg !== "ios" && platformArg !== "android") {
      throw new Error(`Invalid platform '${platformArg}'. Use ios or android.`);
    }
    const result = await withProgressStages({
      finalLabel: "Metadata directory resolved",
      stages: ["Resolving metadata directory"],
      task: () => runMetadataPull({
        cwd: process.cwd(),
        platform: platformArg,
      }),
    });
    process.stdout.write(`Metadata directory: ${result.metadataRoot}\n`);
  });

const credentials = program.command("credentials").description("Configure and validate credentials");

credentials
  .command("ios")
  .option("--key-id <keyId>", "App Store Connect API key id")
  .option("--issuer-id <issuerId>", "App Store Connect issuer id")
  .option("--private-key-path <path>", "Path to .p8 private key file")
  .option("--save-as <name>", "Save these credentials as a reusable local profile")
  .option("--use <name>", "Attach a saved reusable iOS credential profile to this project")
  .action(async (options) => {
    const keyId = options.use ? options.keyId : options.keyId ?? await promptRequired("App Store Connect API Key ID");
    const issuerId = options.use ? options.issuerId : options.issuerId ?? await promptRequired("App Store Connect Issuer ID");
    const privateKeyPath = options.use ? options.privateKeyPath : options.privateKeyPath ?? await promptRequired("Path to App Store Connect .p8 key");
    await withProgressStages({
      finalLabel: "iOS credentials configured",
      stages: ["Saving iOS credentials"],
      task: () => configureIosCredentials({
        cwd: process.cwd(),
        keyId,
        issuerId,
        privateKeyPath,
        saveAs: options.saveAs,
        use: options.use,
      }),
    });
    successLine(`iOS credentials ${options.use ? `attached from '${options.use}'` : "saved"}.`);
    if (options.saveAs) {
      process.stdout.write(`Reusable iOS profile saved as '${options.saveAs}'.\n`);
    }
  });

credentials
  .command("android")
  .option("--service-account-path <path>", "Path to Google Play service account JSON")
  .option("--save-as <name>", "Save these credentials as a reusable local profile")
  .option("--use <name>", "Attach a saved reusable Android credential profile to this project")
  .action(async (options) => {
    const serviceAccountPath = options.use
      ? options.serviceAccountPath
      : options.serviceAccountPath ?? await promptRequired("Path to Google Play service account JSON");
    await withProgressStages({
      finalLabel: "Android credentials configured",
      stages: ["Saving Android credentials"],
      task: () => configureAndroidCredentials({
        cwd: process.cwd(),
        serviceAccountPath,
        saveAs: options.saveAs,
        use: options.use,
      }),
    });
    successLine(`Android credentials ${options.use ? `attached from '${options.use}'` : "saved"}.`);
    if (options.saveAs) {
      process.stdout.write(`Reusable Android profile saved as '${options.saveAs}'.\n`);
    }
  });

credentials
  .command("list")
  .description("List reusable local credential profiles")
  .action(async () => {
    const profiles = await listCredentialProfiles();
    process.stdout.write("Reusable credential profiles\n");
    process.stdout.write(`  iOS: ${profiles.ios.length ? profiles.ios.join(", ") : "none"}\n`);
    process.stdout.write(`  Android: ${profiles.android.length ? profiles.android.join(", ") : "none"}\n`);
  });

credentials
  .command("validate")
  .action(async () => {
    const result = await withProgressStages({
      finalLabel: "Credentials validation completed",
      stages: ["Validating credentials"],
      task: () => validateCredentials({
        cwd: process.cwd(),
      }),
    });

    process.stdout.write(`Credentials for ${result.project.displayName}\n`);
    process.stdout.write(`  iOS: ${result.ios.configured ? "configured" : "missing"}\n`);
    if (!result.ios.configured) {
      for (const key of result.ios.missing) {
        process.stdout.write(`    missing: ${key}\n`);
      }
    }
    process.stdout.write(`  Android: ${result.android.configured ? "configured" : "missing"}\n`);
    if (!result.android.configured) {
      for (const key of result.android.missing) {
        process.stdout.write(`    missing: ${key}\n`);
      }
    }

    if (!result.ios.configured || !result.android.configured) {
      process.exitCode = 1;
    }
  });

program
  .command("clean")
  .description("Clean local FEAS build/runtime artifacts")
  .option("--all", "Remove entire local project state under ~/.feas/projects/<id>", false)
  .action(async (options) => {
    const result = await withProgressStages({
      finalLabel: "Cleanup completed",
      stages: ["Cleaning local FEAS artifacts"],
      task: () => cleanProject({
        cwd: process.cwd(),
        all: options.all,
      }),
    });

    successLine(`Clean completed for ${result.project.displayName}.`);
    for (const entry of result.removed) {
      process.stdout.write(`  removed: ${entry}\n`);
    }
  });

program
  .command("doctor")
  .description("Check if the machine and project are release-ready")
  .argument("[platform]", "Target platform: ios | android")
  .option("--profile <profile>", "EAS profile to use", "production")
  .option("--json", "Print JSON output", false)
  .action(async (platformArg, options) => {
    const profile = resolveProductionProfile(options.profile, "doctor");
    const normalizedPlatform =
      platformArg === "ios" || platformArg === "android" ? platformArg : ("all" as const);

    if (platformArg && normalizedPlatform === "all") {
      throw new Error(`Invalid platform '${platformArg}'. Use ios or android.`);
    }

    const execute = () =>
      runDoctor({
        cwd: process.cwd(),
        profile,
        platform: normalizedPlatform,
      });
    const result = options.json
      ? await execute()
      : await withProgressStages({
          finalLabel: "Doctor checks completed",
          stages: ["Running doctor checks"],
          task: execute,
        });

    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    process.stdout.write(`Doctor profile: ${result.profile}\n`);
    process.stdout.write(`Project: ${result.project.displayName}\n`);
    process.stdout.write(`Root: ${result.project.rootPath}\n`);
    process.stdout.write("\n");

    for (const check of result.checks) {
      const icon = check.status === "pass" ? "☑" : check.status === "warn" ? "◩" : check.status === "fail" ? "☒" : "☐";
      process.stdout.write(`[${icon}] ${check.category.toUpperCase()} - ${check.name}\n`);
      process.stdout.write(`  ${check.message}\n`);
      if (check.fixCommand) {
        process.stdout.write(`  Fix: ${check.fixCommand}\n`);
      }
    }

    process.stdout.write("\n");
    process.stdout.write(
      `Summary: pass=${result.summary.pass} warn=${result.summary.warn} fail=${result.summary.fail} skip=${result.summary.skip}\n`,
    );
    process.stdout.write(
      `Doctor history: ${result.persistence.saved ? `saved (${result.persistence.databasePath})` : `not saved (${result.persistence.reason})`}\n`,
    );

    if (result.summary.fail > 0) {
      process.exitCode = 1;
    }
  });

async function main() {
  try {
    await program.parseAsync();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    process.stderr.write(`FEAS error: ${message}\n`);
    process.exitCode = 1;
  }
}

void main();
