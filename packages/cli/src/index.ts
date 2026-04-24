#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startLocalApiServer } from "@feas/api";
import {
  cleanProject,
  configureAndroidCredentials,
  configureIosCredentials,
  initFeasProject,
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
} from "@feas/core";
import { Command } from "commander";

const program = new Command();

program
  .name("feas")
  .description("Local release automation for Expo and React Native apps.")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize FEAS project state")
  .option("--profile <profile>", "EAS profile to use", "production")
  .option("--force", "Regenerate FEAS project state", false)
  .action(async (options) => {
    const result = await initFeasProject({
      cwd: process.cwd(),
      profile: options.profile,
      force: options.force,
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
    const config = await resolveFeasConfig({
      cwd: process.cwd(),
      profile: options.profile,
    });

    if (options.json) {
      process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
      return;
    }

    const project = config.project as Record<string, unknown>;
    const platforms = project.platforms as Record<string, boolean>;
    const profile = config.profile as string;
    const projectId = config.projectId as string;
    const paths = config.paths as Record<string, string>;

    process.stdout.write(`Project: ${project.displayName}\n`);
    process.stdout.write(`Project ID: ${projectId}\n`);
    process.stdout.write(`Root: ${project.rootPath}\n`);
    process.stdout.write(`Profile: ${profile}\n`);
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
  .option("--json", "Print JSON output", false)
  .action(async (platformArg, options) => {
    if (platformArg !== "ios" && platformArg !== "android" && platformArg !== "all") {
      throw new Error(`Invalid platform '${platformArg}'. Use ios, android, or all.`);
    }

    const result = await runBuild({
      cwd: process.cwd(),
      platform: platformArg,
      profile: options.profile,
      dryRun: options.dryRun,
    });

    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

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
    if (platformArg !== "ios" && platformArg !== "android") {
      throw new Error(`Invalid platform '${platformArg}'. Use ios or android.`);
    }

    const result = await runSubmit({
      cwd: process.cwd(),
      platform: platformArg,
      path: options.path,
      profile: options.profile,
      dryRun: options.dryRun,
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
  .option("--json", "Print JSON output", false)
  .action(async (platformArg, options) => {
    if (platformArg !== "ios" && platformArg !== "android" && platformArg !== "all") {
      throw new Error(`Invalid platform '${platformArg}'. Use ios, android, or all.`);
    }

    const result = await runRelease({
      cwd: process.cwd(),
      platform: platformArg,
      profile: options.profile,
      dryRun: options.dryRun,
      skipSubmit: options.skipSubmit,
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
    const result = await listLogs({
      cwd: process.cwd(),
      latest: options.latest,
      id: options.id,
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

    const token = randomBytes(16).toString("hex");
    const dashboardDistPath = path.resolve(fileURLToPath(new URL("../../dashboard/dist", import.meta.url)));
    const server = await startLocalApiServer({
      port: parsedPort,
      token,
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
  .action(async (platformArg) => {
    if (platformArg !== "ios" && platformArg !== "android") {
      throw new Error(`Invalid platform '${platformArg}'. Use ios or android.`);
    }
    const result = await runMetadataPull({
      cwd: process.cwd(),
      platform: platformArg,
    });
    process.stdout.write(`Metadata pulled for ${result.platform} into ${result.metadataRoot}\n`);
  });

metadata
  .command("push")
  .argument("<platform>", "ios | android")
  .action(async (platformArg) => {
    if (platformArg !== "ios" && platformArg !== "android") {
      throw new Error(`Invalid platform '${platformArg}'. Use ios or android.`);
    }
    const result = await runMetadataPush({
      cwd: process.cwd(),
      platform: platformArg,
    });
    process.stdout.write(`Metadata push validated for ${result.platform}. Files: ${result.files.length}\n`);
  });

metadata
  .command("validate")
  .argument("<platform>", "ios | android")
  .action(async (platformArg) => {
    if (platformArg !== "ios" && platformArg !== "android") {
      throw new Error(`Invalid platform '${platformArg}'. Use ios or android.`);
    }
    const result = await runMetadataValidate({
      cwd: process.cwd(),
      platform: platformArg,
    });
    process.stdout.write(`Metadata validation for ${result.platform}: ${result.valid ? "valid" : "invalid"}\n`);
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
    const result = await runMetadataPull({
      cwd: process.cwd(),
      platform: platformArg,
    });
    process.stdout.write(`Metadata directory: ${result.metadataRoot}\n`);
  });

const credentials = program.command("credentials").description("Configure and validate credentials");

credentials
  .command("ios")
  .requiredOption("--key-id <keyId>", "App Store Connect API key id")
  .requiredOption("--issuer-id <issuerId>", "App Store Connect issuer id")
  .requiredOption("--private-key-path <path>", "Path to .p8 private key file")
  .action(async (options) => {
    await configureIosCredentials({
      cwd: process.cwd(),
      keyId: options.keyId,
      issuerId: options.issuerId,
      privateKeyPath: options.privateKeyPath,
    });
    process.stdout.write("iOS credentials saved.\n");
  });

credentials
  .command("android")
  .requiredOption("--service-account-path <path>", "Path to Google Play service account JSON")
  .action(async (options) => {
    await configureAndroidCredentials({
      cwd: process.cwd(),
      serviceAccountPath: options.serviceAccountPath,
    });
    process.stdout.write("Android credentials saved.\n");
  });

credentials
  .command("validate")
  .action(async () => {
    const result = await validateCredentials({
      cwd: process.cwd(),
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
    const result = await cleanProject({
      cwd: process.cwd(),
      all: options.all,
    });

    process.stdout.write(`Clean completed for ${result.project.displayName}\n`);
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
    const normalizedPlatform =
      platformArg === "ios" || platformArg === "android" ? platformArg : ("all" as const);

    if (platformArg && normalizedPlatform === "all") {
      throw new Error(`Invalid platform '${platformArg}'. Use ios or android.`);
    }

    const result = await runDoctor({
      cwd: process.cwd(),
      profile: options.profile,
      platform: normalizedPlatform,
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
      const icon = check.status === "pass" ? "PASS" : check.status === "warn" ? "WARN" : check.status === "fail" ? "FAIL" : "SKIP";
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
