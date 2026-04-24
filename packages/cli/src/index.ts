#!/usr/bin/env node
import { initFeasProject, resolveFeasConfig, runDoctor } from "@feas/core";
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

    process.stdout.write(`Project: ${project.displayName}\n`);
    process.stdout.write(`Root: ${project.rootPath}\n`);
    process.stdout.write(`Profile: ${profile}\n`);
    process.stdout.write(`Platform iOS: ${platforms.ios ? "yes" : "no"}\n`);
    process.stdout.write(`Platform Android: ${platforms.android ? "yes" : "no"}\n`);
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
