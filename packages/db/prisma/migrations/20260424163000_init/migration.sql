PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS "projects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "root_path" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "builds" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "profile" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "version" TEXT,
    "build_number" TEXT,
    "artifact_path" TEXT,
    "log_path" TEXT,
    "started_at" DATETIME NOT NULL,
    "finished_at" DATETIME,
    "duration_ms" INTEGER,
    "error_code" TEXT,
    "error_message" TEXT,
    CONSTRAINT "builds_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "submissions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "build_id" TEXT,
    "platform" TEXT NOT NULL,
    "store" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "remote_id" TEXT,
    "log_path" TEXT,
    "started_at" DATETIME NOT NULL,
    "finished_at" DATETIME,
    "error_code" TEXT,
    "error_message" TEXT,
    CONSTRAINT "submissions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "releases" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "profile" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "version" TEXT,
    "build_number" TEXT,
    "build_id" TEXT,
    "submission_id" TEXT,
    "release_notes" TEXT,
    "started_at" DATETIME NOT NULL,
    "finished_at" DATETIME,
    "error_message" TEXT,
    CONSTRAINT "releases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "doctor_checks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "fix_command" TEXT,
    "checked_at" DATETIME NOT NULL,
    CONSTRAINT "doctor_checks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "builds_project_id_idx" ON "builds"("project_id");
CREATE INDEX IF NOT EXISTS "submissions_project_id_idx" ON "submissions"("project_id");
CREATE INDEX IF NOT EXISTS "releases_project_id_idx" ON "releases"("project_id");
CREATE INDEX IF NOT EXISTS "doctor_checks_project_id_idx" ON "doctor_checks"("project_id");
CREATE INDEX IF NOT EXISTS "doctor_checks_checked_at_idx" ON "doctor_checks"("checked_at");

PRAGMA foreign_keys=ON;
