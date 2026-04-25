import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "../lib/api";
import { toErrorMessage, tokenFromUrl } from "../lib/utils";
import type {
  BuildRow,
  CredentialsPayload,
  DoctorRow,
  LogRow,
  MetadataPayload,
  MetadataPlatform,
  Project,
  ReleaseRow,
  RunPlatform,
  SubmissionRow,
  SubmitPlatform,
} from "../types";

type MessageKind = "running" | "success" | "error";

export type DashboardContextValue = {
  token: string;
  loading: boolean;
  error: string | null;
  projects: Project[];
  selectedProjectId: string;
  project: Project | null;
  builds: BuildRow[];
  releases: ReleaseRow[];
  submissions: SubmissionRow[];
  doctor: DoctorRow[];
  logs: LogRow[];
  metadata: MetadataPayload;
  credentials: CredentialsPayload | null;
  metadataKeys: string[];
  selectedMetadataFile: string;
  metadataDraft: string;
  selectedLogId: string;
  latestLogContent: string;
  actionBusy: string | null;
  actionMessage: string | null;
  actionMessageKind: MessageKind;
  runPlatform: RunPlatform;
  runProfile: string;
  runDryRun: boolean;
  allowPrebuild: boolean;
  skipSubmit: boolean;
  submitPlatform: SubmitPlatform;
  submitPath: string;
  metadataPlatform: MetadataPlatform;
  projectPathInput: string;
  initProfile: string;
  iosKeyId: string;
  iosIssuerId: string;
  iosPrivateKeyPath: string;
  androidServiceAccountPath: string;
  setRunPlatform: (value: RunPlatform) => void;
  setRunProfile: (value: string) => void;
  setRunDryRun: (value: boolean) => void;
  setAllowPrebuild: (value: boolean) => void;
  setSkipSubmit: (value: boolean) => void;
  setSubmitPlatform: (value: SubmitPlatform) => void;
  setSubmitPath: (value: string) => void;
  setMetadataPlatform: (value: MetadataPlatform) => void;
  setSelectedMetadataFile: (value: string) => void;
  setMetadataDraft: (value: string) => void;
  setProjectPathInput: (value: string) => void;
  setInitProfile: (value: string) => void;
  setIosKeyId: (value: string) => void;
  setIosIssuerId: (value: string) => void;
  setIosPrivateKeyPath: (value: string) => void;
  setAndroidServiceAccountPath: (value: string) => void;
  setSelectedProjectId: (value: string) => void;
  load: () => Promise<void>;
  runBuild: () => Promise<void>;
  runDoctor: () => Promise<void>;
  runRelease: () => Promise<void>;
  runSubmit: () => Promise<void>;
  initializeProject: () => Promise<void>;
  submitBuild: (buildId: string) => Promise<void>;
  rebuildBuild: (buildId: string) => Promise<void>;
  deleteBuild: (buildId: string) => Promise<void>;
  runMetadataAction: (mode: "pull" | "push" | "validate") => Promise<void>;
  saveMetadataFile: () => Promise<void>;
  selectLog: (logId: string) => Promise<void>;
  configureIosCredentials: () => Promise<void>;
  configureAndroidCredentials: () => Promise<void>;
};

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [project, setProject] = useState<Project | null>(null);
  const [builds, setBuilds] = useState<BuildRow[]>([]);
  const [releases, setReleases] = useState<ReleaseRow[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [doctor, setDoctor] = useState<DoctorRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [metadata, setMetadata] = useState<MetadataPayload>({});
  const [credentials, setCredentials] = useState<CredentialsPayload | null>(null);

  const [selectedLogId, setSelectedLogId] = useState<string>("");
  const [latestLogContent, setLatestLogContent] = useState<string>("No log selected.");
  const [selectedMetadataFile, setSelectedMetadataFile] = useState<string>("");
  const [metadataDraft, setMetadataDraft] = useState<string>("");

  const [runPlatform, setRunPlatform] = useState<RunPlatform>("all");
  const [runProfile, setRunProfile] = useState<string>("production");
  const [runDryRun, setRunDryRun] = useState<boolean>(true);
  const [allowPrebuild, setAllowPrebuild] = useState<boolean>(false);
  const [skipSubmit, setSkipSubmit] = useState<boolean>(false);
  const [submitPlatform, setSubmitPlatform] = useState<SubmitPlatform>("ios");
  const [submitPath, setSubmitPath] = useState<string>("");
  const [metadataPlatform, setMetadataPlatform] = useState<MetadataPlatform>("ios");
  const [projectPathInput, setProjectPathInput] = useState<string>("");
  const [initProfile, setInitProfile] = useState<string>("production");
  const [iosKeyId, setIosKeyId] = useState<string>("");
  const [iosIssuerId, setIosIssuerId] = useState<string>("");
  const [iosPrivateKeyPath, setIosPrivateKeyPath] = useState<string>("");
  const [androidServiceAccountPath, setAndroidServiceAccountPath] = useState<string>("");

  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionMessageKind, setActionMessageKind] = useState<MessageKind>("success");

  const token = useMemo(() => tokenFromUrl(), []);
  const metadataKeys = useMemo(() => Object.keys(metadata).sort(), [metadata]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const projectsPayload = await apiGet<{ projects: Project[] }>("/api/projects", token);
      const availableProjects = projectsPayload.projects ?? [];
      setProjects(availableProjects);
      const preferredProjectId = selectedProjectId || availableProjects[0]?.id || "";
      const current = availableProjects.find((item) => item.id === preferredProjectId) ?? availableProjects[0] ?? null;

      if (!current) {
        setSelectedProjectId("");
        setProject(null);
        setBuilds([]);
        setReleases([]);
        setSubmissions([]);
        setDoctor([]);
        setLogs([]);
        setMetadata({});
        setCredentials(null);
        setLatestLogContent("No initialized FEAS projects found.");
        return;
      }

      if (current.id !== selectedProjectId) {
        setSelectedProjectId(current.id);
      }

      const [buildsPayload, releasesPayload, submissionsPayload, doctorPayload, logsPayload, metadataPayload, credentialsPayload] =
        await Promise.all([
          apiGet<{ builds: BuildRow[] }>(`/api/projects/${current.id}/builds`, token),
          apiGet<{ releases: ReleaseRow[] }>(`/api/projects/${current.id}/releases`, token),
          apiGet<{ submissions: SubmissionRow[] }>(`/api/projects/${current.id}/submissions`, token),
          apiGet<{ checks: DoctorRow[] }>(`/api/projects/${current.id}/doctor`, token),
          apiGet<{ logs: LogRow[] }>(`/api/projects/${current.id}/logs`, token),
          apiGet<{ metadata: MetadataPayload }>(`/api/projects/${current.id}/metadata`, token),
          apiGet<CredentialsPayload & { project: unknown }>(`/api/projects/${current.id}/credentials`, token),
        ]);

      setProject(current);
      setBuilds(buildsPayload.builds ?? []);
      setReleases(releasesPayload.releases ?? []);
      setSubmissions(submissionsPayload.submissions ?? []);
      setDoctor(doctorPayload.checks ?? []);
      setLogs(logsPayload.logs ?? []);
      setMetadata(metadataPayload.metadata ?? {});
      setCredentials({
        ios: credentialsPayload.ios,
        android: credentialsPayload.android,
      });

      const preferredLogId = selectedLogId || logsPayload.logs[0]?.id;
      if (preferredLogId) {
        const logPayload = await apiGet<{ content: string }>(`/api/projects/${current.id}/logs/${encodeURIComponent(preferredLogId)}`, token);
        setSelectedLogId(preferredLogId);
        setLatestLogContent(logPayload.content || "No content");
      } else {
        setLatestLogContent("No logs found.");
      }
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [token, selectedLogId, selectedProjectId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (metadataKeys.length === 0) {
      setSelectedMetadataFile("");
      setMetadataDraft("");
      return;
    }

    if (!selectedMetadataFile || !metadata[selectedMetadataFile]) {
      const next = metadataKeys[0];
      setSelectedMetadataFile(next);
      setMetadataDraft(metadata[next]?.content ?? "");
      return;
    }

    setMetadataDraft(metadata[selectedMetadataFile]?.content ?? "");
  }, [metadata, metadataKeys, selectedMetadataFile]);

  const runAction = useCallback(
    async (label: string, action: () => Promise<void>) => {
      setActionBusy(label);
      setActionMessageKind("running");
      setActionMessage(`${label} running...`);
      try {
        await action();
        await load();
        setActionMessageKind("success");
        setActionMessage(`${label} completed.`);
      } catch (err) {
        setActionMessageKind("error");
        setActionMessage(`${label} failed: ${toErrorMessage(err)}`);
      } finally {
        setActionBusy(null);
      }
    },
    [load],
  );

  const runDoctor = useCallback(async () => {
    if (!project) {
      return;
    }
    await runAction("Doctor", async () => {
      await apiPost(`/api/projects/${project.id}/doctor/run`, token, {
        platform: runPlatform,
        profile: runProfile || undefined,
      });
    });
  }, [project, runAction, token, runPlatform, runProfile]);

  const runBuild = useCallback(async () => {
    if (!project) {
      return;
    }
    await runAction("Build", async () => {
      await apiPost(`/api/projects/${project.id}/builds`, token, {
        platform: runPlatform,
        profile: runProfile || undefined,
        dryRun: runDryRun,
        allowPrebuild,
      });
    });
  }, [project, runAction, token, runPlatform, runProfile, runDryRun, allowPrebuild]);

  const runRelease = useCallback(async () => {
    if (!project) {
      return;
    }
    await runAction("Release", async () => {
      await apiPost(`/api/projects/${project.id}/releases`, token, {
        platform: runPlatform,
        profile: runProfile || undefined,
        dryRun: runDryRun,
        skipSubmit,
        allowPrebuild,
      });
    });
  }, [project, runAction, token, runPlatform, runProfile, runDryRun, skipSubmit, allowPrebuild]);

  const runSubmit = useCallback(async () => {
    if (!project || !submitPath.trim()) {
      return;
    }
    await runAction("Submit", async () => {
      await apiPost(`/api/projects/${project.id}/submissions`, token, {
        platform: submitPlatform,
        profile: runProfile || undefined,
        path: submitPath.trim(),
        dryRun: runDryRun,
      });
    });
  }, [project, runAction, token, submitPlatform, runProfile, submitPath, runDryRun]);

  const initializeProject = useCallback(async () => {
    if (!projectPathInput.trim()) {
      return;
    }
    await runAction("Initialize project", async () => {
      await apiPost("/api/projects", token, {
        rootPath: projectPathInput.trim(),
        profile: initProfile || undefined,
      });
    });
  }, [projectPathInput, initProfile, runAction, token]);

  const submitBuild = useCallback(
    async (buildId: string) => {
      if (!project) {
        return;
      }
      await runAction(`Submit ${buildId}`, async () => {
        await apiPost(`/api/projects/${project.id}/builds/${buildId}/submit`, token, {
          profile: runProfile || undefined,
          dryRun: runDryRun,
        });
      });
    },
    [project, runAction, token, runProfile, runDryRun],
  );

  const rebuildBuild = useCallback(
    async (buildId: string) => {
      if (!project) {
        return;
      }
      await runAction(`Rebuild ${buildId}`, async () => {
        await apiPost(`/api/projects/${project.id}/builds/${buildId}/rebuild`, token, {
          dryRun: runDryRun,
          allowPrebuild,
        });
      });
    },
    [project, runAction, token, runDryRun, allowPrebuild],
  );

  const deleteBuild = useCallback(
    async (buildId: string) => {
      if (!project) {
        return;
      }
      await runAction(`Delete ${buildId}`, async () => {
        await apiDelete(`/api/projects/${project.id}/builds/${buildId}`, token);
      });
    },
    [project, runAction, token],
  );

  const runMetadataAction = useCallback(
    async (mode: "pull" | "push" | "validate") => {
      if (!project) {
        return;
      }
      await runAction(`Metadata ${mode}`, async () => {
        await apiPost(`/api/projects/${project.id}/metadata/${mode}`, token, {
          platform: metadataPlatform,
        });
      });
    },
    [project, runAction, token, metadataPlatform],
  );

  const saveMetadataFile = useCallback(async () => {
    if (!project || !selectedMetadataFile) {
      return;
    }
    await runAction("Metadata save", async () => {
      await apiPut(`/api/projects/${project.id}/metadata`, token, {
        files: {
          [selectedMetadataFile]: metadataDraft,
        },
      });
    });
  }, [project, selectedMetadataFile, metadataDraft, runAction, token]);

  const selectLog = useCallback(
    async (logId: string) => {
      if (!project || !logId) {
        return;
      }
      setSelectedLogId(logId);
      try {
        const payload = await apiGet<{ content: string }>(`/api/projects/${project.id}/logs/${encodeURIComponent(logId)}`, token);
        setLatestLogContent(payload.content || "No content");
      } catch (err) {
        setLatestLogContent(`Failed to load log: ${toErrorMessage(err)}`);
      }
    },
    [project, token],
  );

  const configureIosCredentials = useCallback(async () => {
    if (!project) {
      return;
    }
    await runAction("Configure iOS credentials", async () => {
      await apiPost(`/api/projects/${project.id}/credentials/ios`, token, {
        keyId: iosKeyId || undefined,
        issuerId: iosIssuerId || undefined,
        privateKeyPath: iosPrivateKeyPath || undefined,
      });
    });
  }, [project, runAction, token, iosKeyId, iosIssuerId, iosPrivateKeyPath]);

  const configureAndroidCredentials = useCallback(async () => {
    if (!project) {
      return;
    }
    await runAction("Configure Android credentials", async () => {
      await apiPost(`/api/projects/${project.id}/credentials/android`, token, {
        serviceAccountPath: androidServiceAccountPath || undefined,
      });
    });
  }, [project, runAction, token, androidServiceAccountPath]);

  const value = useMemo<DashboardContextValue>(
    () => ({
      token,
      loading,
      error,
      projects,
      selectedProjectId,
      project,
      builds,
      releases,
      submissions,
      doctor,
      logs,
      metadata,
      credentials,
      metadataKeys,
      selectedMetadataFile,
      metadataDraft,
      selectedLogId,
      latestLogContent,
      actionBusy,
      actionMessage,
      actionMessageKind,
      runPlatform,
      runProfile,
      runDryRun,
      allowPrebuild,
      skipSubmit,
      submitPlatform,
      submitPath,
      metadataPlatform,
      projectPathInput,
      initProfile,
      iosKeyId,
      iosIssuerId,
      iosPrivateKeyPath,
      androidServiceAccountPath,
      setRunPlatform,
      setRunProfile,
      setRunDryRun,
      setAllowPrebuild,
      setSkipSubmit,
      setSubmitPlatform,
      setSubmitPath,
      setMetadataPlatform,
      setSelectedMetadataFile,
      setMetadataDraft,
      setProjectPathInput,
      setInitProfile,
      setIosKeyId,
      setIosIssuerId,
      setIosPrivateKeyPath,
      setAndroidServiceAccountPath,
      setSelectedProjectId,
      load,
      runBuild,
      runDoctor,
      runRelease,
      runSubmit,
      initializeProject,
      submitBuild,
      rebuildBuild,
      deleteBuild,
      runMetadataAction,
      saveMetadataFile,
      selectLog,
      configureIosCredentials,
      configureAndroidCredentials,
    }),
    [
      token,
      loading,
      error,
      projects,
      selectedProjectId,
      project,
      builds,
      releases,
      submissions,
      doctor,
      logs,
      metadata,
      credentials,
      metadataKeys,
      selectedMetadataFile,
      metadataDraft,
      selectedLogId,
      latestLogContent,
      actionBusy,
      actionMessage,
      actionMessageKind,
      runPlatform,
      runProfile,
      runDryRun,
      allowPrebuild,
      skipSubmit,
      submitPlatform,
      submitPath,
      metadataPlatform,
      projectPathInput,
      initProfile,
      iosKeyId,
      iosIssuerId,
      iosPrivateKeyPath,
      androidServiceAccountPath,
      setSelectedProjectId,
      load,
      runBuild,
      runDoctor,
      runRelease,
      runSubmit,
      initializeProject,
      submitBuild,
      rebuildBuild,
      deleteBuild,
      runMetadataAction,
      saveMetadataFile,
      selectLog,
      configureIosCredentials,
      configureAndroidCredentials,
    ],
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard(): DashboardContextValue {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error("useDashboard must be used within DashboardProvider");
  }
  return context;
}
