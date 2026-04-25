export type View = "overview" | "builds" | "releases" | "submissions" | "doctor" | "metadata" | "credentials" | "logs";
export type RunPlatform = "all" | "ios" | "android";
export type MetadataPlatform = "ios" | "android";
export type SubmitPlatform = "ios" | "android";

export type Project = {
  id: string;
  name: string;
  root: string | null;
  lastOpenedAt: string | null;
};

export type BuildRow = {
  id: string;
  status: string;
  platform: string;
  profile: string | null;
  buildNumber?: string | null;
  version?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  artifactPath?: string | null;
  logPath?: string | null;
  errorMessage?: string | null;
};

export type ReleaseRow = {
  id: string;
  status: string;
  platform: string;
  profile: string | null;
  startedAt: string;
  finishedAt?: string | null;
  buildNumber?: string | null;
  version?: string | null;
  errorMessage?: string | null;
};

export type SubmissionRow = {
  id: string;
  platform: string;
  status: string;
  store: string;
  startedAt: string;
  finishedAt?: string | null;
  logPath?: string | null;
  errorMessage?: string | null;
};

export type DoctorRow = {
  id: string;
  category: string;
  name: string;
  status: string;
  message: string | null;
};

export type LogRow = {
  id: string;
  type: string;
  path: string;
  createdAt: string;
};

export type CredentialsPayload = {
  ios: { configured: boolean; missing: string[] };
  android: { configured: boolean; missing: string[] };
};

export type MetadataPayload = Record<string, { path: string; content: string }>;
