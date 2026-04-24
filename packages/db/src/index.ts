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

export interface ReleaseRecordInput {
  id: string;
  projectId: string;
  platform: string;
  profile: string;
  status: string;
  version?: string;
  buildNumber?: string;
  buildId?: string;
  submissionId?: string;
  releaseNotes?: string;
  startedAt: Date;
  finishedAt?: Date;
  errorMessage?: string;
}

export interface ProjectSummaryRow {
  id: string;
  status: string;
  platform: string;
  profile?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  artifactPath?: string | null;
  logPath?: string | null;
  errorMessage?: string | null;
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

export async function createReleaseRecord(input: { databasePath: string; release: ReleaseRecordInput }): Promise<void> {
  const prisma = createPrismaClient(input.databasePath);

  try {
    await prisma.release.create({
      data: input.release,
    });
  } finally {
    await prisma.$disconnect();
  }
}

export async function getProjectBuilds(databasePath: string, limit = 50): Promise<ProjectSummaryRow[]> {
  const prisma = createPrismaClient(databasePath);
  try {
    const rows = await prisma.build.findMany({
      orderBy: { startedAt: "desc" },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      platform: row.platform,
      profile: row.profile,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      artifactPath: row.artifactPath,
      logPath: row.logPath,
      errorMessage: row.errorMessage,
    }));
  } finally {
    await prisma.$disconnect();
  }
}

export async function getProjectReleases(databasePath: string, limit = 50): Promise<ProjectSummaryRow[]> {
  const prisma = createPrismaClient(databasePath);
  try {
    const rows = await prisma.release.findMany({
      orderBy: { startedAt: "desc" },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      platform: row.platform,
      profile: row.profile,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      artifactPath: null,
      logPath: null,
      errorMessage: row.errorMessage,
    }));
  } finally {
    await prisma.$disconnect();
  }
}

export async function getProjectDoctorChecks(databasePath: string, limit = 100): Promise<
  Array<{
    id: string;
    category: string;
    name: string;
    status: string;
    message: string | null;
    fixCommand: string | null;
    checkedAt: string;
  }>
> {
  const prisma = createPrismaClient(databasePath);
  try {
    const rows = await prisma.doctorCheck.findMany({
      orderBy: { checkedAt: "desc" },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      category: row.category,
      name: row.name,
      status: row.status,
      message: row.message,
      fixCommand: row.fixCommand,
      checkedAt: row.checkedAt.toISOString(),
    }));
  } finally {
    await prisma.$disconnect();
  }
}

export async function getBuildById(databasePath: string, id: string): Promise<ProjectSummaryRow | null> {
  const prisma = createPrismaClient(databasePath);
  try {
    const row = await prisma.build.findUnique({ where: { id } });
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      status: row.status,
      platform: row.platform,
      profile: row.profile,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      artifactPath: row.artifactPath,
      logPath: row.logPath,
      errorMessage: row.errorMessage,
    };
  } finally {
    await prisma.$disconnect();
  }
}

export async function getReleaseById(databasePath: string, id: string): Promise<ProjectSummaryRow | null> {
  const prisma = createPrismaClient(databasePath);
  try {
    const row = await prisma.release.findUnique({ where: { id } });
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      status: row.status,
      platform: row.platform,
      profile: row.profile,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      artifactPath: null,
      logPath: null,
      errorMessage: row.errorMessage,
    };
  } finally {
    await prisma.$disconnect();
  }
}

export async function getProjectSubmissions(
  databasePath: string,
  limit = 50,
): Promise<
  Array<{
    id: string;
    platform: string;
    status: string;
    store: string;
    startedAt: string;
    finishedAt: string | null;
    logPath: string | null;
    errorMessage: string | null;
  }>
> {
  const prisma = createPrismaClient(databasePath);
  try {
    const rows = await prisma.submission.findMany({
      orderBy: { startedAt: "desc" },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      platform: row.platform,
      status: row.status,
      store: row.store,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      logPath: row.logPath,
      errorMessage: row.errorMessage,
    }));
  } finally {
    await prisma.$disconnect();
  }
}
