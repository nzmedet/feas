#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();

program
  .name("feas")
  .description("Local release automation for Expo and React Native apps.")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize FEAS project state")
  .action(() => {
    process.stdout.write("feas init is scaffolded and ready for implementation.\n");
  });

program
  .command("config")
  .description("Show resolved FEAS config")
  .action(() => {
    process.stdout.write("feas config is scaffolded and ready for implementation.\n");
  });

program.parse();
