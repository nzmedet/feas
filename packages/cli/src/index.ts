#!/usr/bin/env node
import { initFeasProject, resolveFeasConfig } from "@feas/core";
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
