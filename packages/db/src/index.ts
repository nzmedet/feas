import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

export interface EnsureProjectDatabaseInput {
  databasePath: string;
  project: {
    id: string;
    name: string;
    rootPath: string;
  };
}

export interface DoctorCheckRecordInput {
  category: string;
  name: string;
  status: string;
  message: string;
  fixCommand?: string;
}

export interface BuildRecordInput {
  id: string;
  projectId: string;
  platform: string;
  profile: string;
  status: string;
  version?: string;
  buildNumber?: string;
  artifactPath?: string;
  logPath?: string;
  startedAt: Date;
  finishedAt?: Date;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface SubmissionRecordInput {
  id: string;
  projectId: string;
  buildId?: string;
  platform: string;
  store: string;
  status: string;
  remoteId?: string;
  logPath?: string;
  startedAt: Date;
  finishedAt?: Date;
  errorCode?: string;
  errorMessage?: string;
}

const MIGRATION_PATHS = ["20260424163000_init/migration.sql"];

function toSqliteDatasourceUrl(databasePath: string): string {
  const absolutePath = path.resolve(databasePath);
  return `file:${absolutePath}`;
}

function createPrismaClient(databasePath: string): PrismaClient {
  return new PrismaClient({
    datasourceUrl: toSqliteDatasourceUrl(databasePath),
  });
}

function getMigrationBasePath(): string {
  const currentFilePath = fileURLToPath(import.meta.url);
  const packageRoot = path.resolve(path.dirname(currentFilePath), "..");
  return path.join(packageRoot, "prisma", "migrations");
}

function splitSqlStatements(sql: string): string[] {
  return sql
    .split(";\n")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
    .map((statement) => `${statement};`);
}

async function applyMigrations(prisma: PrismaClient): Promise<void> {
  const migrationBasePath = getMigrationBasePath();

  for (const migrationPath of MIGRATION_PATHS) {
    const fullPath = path.join(migrationBasePath, migrationPath);
    const rawSql = await fs.readFile(fullPath, "utf8");
    const statements = splitSqlStatements(rawSql);

    for (const statement of statements) {
      await prisma.$executeRawUnsafe(statement);
    }
  }
}

export async function ensureProjectDatabase(input: EnsureProjectDatabaseInput): Promise<void> {
  await fs.mkdir(path.dirname(input.databasePath), { recursive: true });

  const prisma = createPrismaClient(input.databasePath);

  try {
    await applyMigrations(prisma);

    await prisma.project.upsert({
      where: { id: input.project.id },
      update: {
        name: input.project.name,
        rootPath: input.project.rootPath,
      },
      create: {
        id: input.project.id,
        name: input.project.name,
        rootPath: input.project.rootPath,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

export async function recordDoctorChecks(input: {
  databasePath: string;
  projectId: string;
  checks: DoctorCheckRecordInput[];
  checkedAt?: Date;
}): Promise<void> {
  if (input.checks.length === 0) {
    return;
  }

  const checkedAt = input.checkedAt ?? new Date();
  const prisma = createPrismaClient(input.databasePath);

  try {
    await prisma.doctorCheck.createMany({
      data: input.checks.map((check) => ({
        id: randomUUID(),
        projectId: input.projectId,
        category: check.category,
        name: check.name,
        status: check.status,
        message: check.message,
        fixCommand: check.fixCommand,
        checkedAt,
      })),
    });
  } finally {
    await prisma.$disconnect();
  }
}

export async function createBuildRecord(input: { databasePath: string; build: BuildRecordInput }): Promise<void> {
  const prisma = createPrismaClient(input.databasePath);

  try {
    await prisma.build.create({
      data: input.build,
    });
  } finally {
    await prisma.$disconnect();
  }
}

export async function createSubmissionRecord(input: {
  databasePath: string;
  submission: SubmissionRecordInput;
}): Promise<void> {
  const prisma = createPrismaClient(input.databasePath);

  try {
    await prisma.submission.create({
      data: input.submission,
    });
  } finally {
    await prisma.$disconnect();
  }
}
