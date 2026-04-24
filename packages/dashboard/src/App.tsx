import { useCallback, useEffect, useMemo, useState } from "react";

type View = "overview" | "builds" | "releases" | "submissions" | "doctor" | "metadata" | "credentials" | "logs";
type RunPlatform = "all" | "ios" | "android";
type MetadataPlatform = "ios" | "android";
type SubmitPlatform = "ios" | "android";

type Project = {
  id: string;
  name: string;
  root: string | null;
  lastOpenedAt: string | null;
};

type BuildRow = {
  id: string;
  status: string;
  platform: string;
  profile: string;
  startedAt: string;
  errorMessage?: string | null;
};

type ReleaseRow = {
  id: string;
  status: string;
  platform: string;
  profile: string;
  startedAt: string;
  errorMessage?: string | null;
};

type SubmissionRow = {
  id: string;
  platform: string;
  status: string;
  store: string;
  startedAt: string;
  errorMessage?: string | null;
};

type DoctorRow = {
  id: string;
  category: string;
  name: string;
  status: string;
  message: string | null;
};

type LogRow = {
  id: string;
  type: string;
  path: string;
  createdAt: string;
};

type CredentialsPayload = {
  ios: { configured: boolean; missing: string[] };
  android: { configured: boolean; missing: string[] };
};

type MetadataPayload = Record<string, { path: string; content: string }>;

function tokenFromUrl(): string {
  const url = new URL(window.location.href);
  return url.searchParams.get("token") ?? "";
}

function statusClass(status: string): string {
  return status === "success" || status === "pass" || status === "configured" ? "status-ok" : "status-bad";
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return "Request failed";
}

async function apiGet<T>(path: string, token: string): Promise<T> {
  const url = new URL(path, window.location.origin);
  url.searchParams.set("token", token);
  const res = await fetch(url.toString(), {
    headers: { "x-feas-token": token },
  });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

async function apiWrite<T>(
  path: string,
  token: string,
  method: "POST" | "PUT",
  body: Record<string, unknown> = {},
): Promise<T> {
  const url = new URL(path, window.location.origin);
  url.searchParams.set("token", token);
  const res = await fetch(url.toString(), {
    method,
    headers: {
      "content-type": "application/json",
      "x-feas-token": token,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export function App() {
  const [view, setView] = useState<View>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [project, setProject] = useState<Project | null>(null);
  const [builds, setBuilds] = useState<BuildRow[]>([]);
  const [releases, setReleases] = useState<ReleaseRow[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [doctor, setDoctor] = useState<DoctorRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [metadata, setMetadata] = useState<MetadataPayload>({});
  const [credentials, setCredentials] = useState<CredentialsPayload | null>(null);

  const [selectedLogId, setSelectedLogId] = useState<string>("");
  const [selectedMetadataFile, setSelectedMetadataFile] = useState<string>("");
  const [metadataDraft, setMetadataDraft] = useState<string>("");

  const [runPlatform, setRunPlatform] = useState<RunPlatform>("all");
  const [runProfile, setRunProfile] = useState<string>("production");
  const [runDryRun, setRunDryRun] = useState<boolean>(true);
  const [skipSubmit, setSkipSubmit] = useState<boolean>(false);
  const [metadataPlatform, setMetadataPlatform] = useState<MetadataPlatform>("ios");
  const [submitPlatform, setSubmitPlatform] = useState<SubmitPlatform>("ios");
  const [submitPath, setSubmitPath] = useState<string>("");
  const [iosKeyId, setIosKeyId] = useState<string>("");
  const [iosIssuerId, setIosIssuerId] = useState<string>("");
  const [iosPrivateKeyPath, setIosPrivateKeyPath] = useState<string>("");
  const [androidServiceAccountPath, setAndroidServiceAccountPath] = useState<string>("");

  const [latestLogContent, setLatestLogContent] = useState<string>("No log selected.");
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const token = useMemo(() => tokenFromUrl(), []);
  const metadataKeys = useMemo(() => Object.keys(metadata).sort(), [metadata]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const projectsPayload = await apiGet<{ projects: Project[] }>("/api/projects", token);
      const current = projectsPayload.projects[0] ?? null;

      if (!current) {
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
  }, [token, selectedLogId]);

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
      setActionMessage(null);
      try {
        await action();
        await load();
        setActionMessage(`${label} completed.`);
      } catch (err) {
        setActionMessage(`${label} failed: ${toErrorMessage(err)}`);
      } finally {
        setActionBusy(null);
      }
    },
    [load],
  );

  const handleRunDoctor = useCallback(async () => {
    if (!project) {
      return;
    }
    await runAction("Doctor", async () => {
      await apiWrite(`/api/projects/${project.id}/doctor/run`, token, "POST", {
        platform: runPlatform,
        profile: runProfile || undefined,
      });
    });
  }, [project, runAction, token, runPlatform, runProfile]);

  const handleRunBuild = useCallback(async () => {
    if (!project) {
      return;
    }
    await runAction("Build", async () => {
      await apiWrite(`/api/projects/${project.id}/builds`, token, "POST", {
        platform: runPlatform,
        profile: runProfile || undefined,
        dryRun: runDryRun,
      });
    });
  }, [project, runAction, token, runPlatform, runProfile, runDryRun]);

  const handleRunRelease = useCallback(async () => {
    if (!project) {
      return;
    }
    await runAction("Release", async () => {
      await apiWrite(`/api/projects/${project.id}/releases`, token, "POST", {
        platform: runPlatform,
        profile: runProfile || undefined,
        dryRun: runDryRun,
        skipSubmit,
      });
    });
  }, [project, runAction, token, runPlatform, runProfile, runDryRun, skipSubmit]);

  const handleRunSubmit = useCallback(async () => {
    if (!project || !submitPath.trim()) {
      return;
    }
    await runAction("Submit", async () => {
      await apiWrite(`/api/projects/${project.id}/submissions`, token, "POST", {
        platform: submitPlatform,
        profile: runProfile || undefined,
        path: submitPath.trim(),
        dryRun: runDryRun,
      });
    });
  }, [project, runAction, token, submitPlatform, runProfile, submitPath, runDryRun]);

  const handleMetadataAction = useCallback(
    async (mode: "pull" | "push" | "validate") => {
      if (!project) {
        return;
      }
      await runAction(`Metadata ${mode}`, async () => {
        await apiWrite(`/api/projects/${project.id}/metadata/${mode}`, token, "POST", {
          platform: metadataPlatform,
        });
      });
    },
    [project, runAction, token, metadataPlatform],
  );

  const handleMetadataSave = useCallback(async () => {
    if (!project || !selectedMetadataFile) {
      return;
    }
    await runAction("Metadata save", async () => {
      await apiWrite(`/api/projects/${project.id}/metadata`, token, "PUT", {
        files: {
          [selectedMetadataFile]: metadataDraft,
        },
      });
    });
  }, [project, selectedMetadataFile, metadataDraft, runAction, token]);

  const handleLogSelect = useCallback(
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

  const handleConfigureIosCredentials = useCallback(async () => {
    if (!project) {
      return;
    }
    await runAction("Configure iOS credentials", async () => {
      await apiWrite(`/api/projects/${project.id}/credentials/ios`, token, "POST", {
        keyId: iosKeyId || undefined,
        issuerId: iosIssuerId || undefined,
        privateKeyPath: iosPrivateKeyPath || undefined,
      });
    });
  }, [project, runAction, token, iosKeyId, iosIssuerId, iosPrivateKeyPath]);

  const handleConfigureAndroidCredentials = useCallback(async () => {
    if (!project) {
      return;
    }
    await runAction("Configure Android credentials", async () => {
      await apiWrite(`/api/projects/${project.id}/credentials/android`, token, "POST", {
        serviceAccountPath: androidServiceAccountPath || undefined,
      });
    });
  }, [project, runAction, token, androidServiceAccountPath]);

  const buildFailed = builds.filter((b) => b.status !== "success").length;
  const doctorFailed = doctor.filter((d) => d.status === "fail").length;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">FEAS</div>
        <div className="section-title">Project</div>
        <div className="project-pill">{project?.name ?? "No project"}</div>

        <div className="section-title">Dashboard</div>
        <div className="menu">
          {([
            ["overview", "Overview"],
            ["builds", "Builds"],
            ["releases", "Releases"],
            ["submissions", "Submissions"],
            ["doctor", "Doctor"],
            ["metadata", "Metadata"],
            ["credentials", "Credentials"],
            ["logs", "Logs"],
          ] as const).map(([key, label]) => (
            <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}>
              {label}
            </button>
          ))}
        </div>
      </aside>

      <main className="main">
        <div className="top">
          <div>
            <div className="title">{view.charAt(0).toUpperCase() + view.slice(1)}</div>
            <div className="muted">{project ? `${project.root ?? "unknown-root"}` : "No initialized project"}</div>
          </div>
          <button className="ghost" disabled={loading || !!actionBusy} onClick={() => void load()}>
            Refresh
          </button>
        </div>

        {!loading && !error && project && (
          <div className="panel actions-panel">
            <h3>Quick Actions</h3>
            <div className="actions-grid">
              <div className="control">
                <label>Platform</label>
                <select value={runPlatform} onChange={(e) => setRunPlatform(e.target.value as RunPlatform)}>
                  <option value="all">all</option>
                  <option value="ios">ios</option>
                  <option value="android">android</option>
                </select>
              </div>
              <div className="control">
                <label>Profile</label>
                <input value={runProfile} onChange={(e) => setRunProfile(e.target.value)} placeholder="production" />
              </div>
              <label className="toggle">
                <input type="checkbox" checked={runDryRun} onChange={(e) => setRunDryRun(e.target.checked)} />
                Dry run
              </label>
              <label className="toggle">
                <input type="checkbox" checked={skipSubmit} onChange={(e) => setSkipSubmit(e.target.checked)} />
                Skip submit
              </label>
            </div>
            <div className="submit-grid">
              <div className="control">
                <label>Submit platform</label>
                <select value={submitPlatform} onChange={(e) => setSubmitPlatform(e.target.value as SubmitPlatform)}>
                  <option value="ios">ios</option>
                  <option value="android">android</option>
                </select>
              </div>
              <div className="control">
                <label>Submit artifact path</label>
                <input
                  value={submitPath}
                  onChange={(e) => setSubmitPath(e.target.value)}
                  placeholder="dist/app.ipa or dist/app.aab"
                />
              </div>
            </div>
            <div className="button-row">
              <button disabled={!!actionBusy} onClick={() => void handleRunDoctor()}>
                {actionBusy === "Doctor" ? "Running doctor..." : "Run Doctor"}
              </button>
              <button disabled={!!actionBusy} onClick={() => void handleRunBuild()}>
                {actionBusy === "Build" ? "Running build..." : "Run Build"}
              </button>
              <button disabled={!!actionBusy || !submitPath.trim()} onClick={() => void handleRunSubmit()}>
                {actionBusy === "Submit" ? "Running submit..." : "Run Submit"}
              </button>
              <button disabled={!!actionBusy} onClick={() => void handleRunRelease()}>
                {actionBusy === "Release" ? "Running release..." : "Run Release"}
              </button>
            </div>
            {actionMessage && <div className="notice">{actionMessage}</div>}
          </div>
        )}

        {loading && (
          <div className="panel">
            <h3>Loading</h3>
            <div className="empty">Fetching dashboard data...</div>
          </div>
        )}

        {error && (
          <div className="panel">
            <h3>Error</h3>
            <div className="empty">{error}</div>
          </div>
        )}

        {!loading && !error && view === "overview" && (
          <>
            <div className="cards">
              <div className="card">
                <div className="k">Builds</div>
                <div className="v">{builds.length}</div>
              </div>
              <div className="card">
                <div className="k">Build Failures</div>
                <div className="v">{buildFailed}</div>
              </div>
              <div className="card">
                <div className="k">Releases</div>
                <div className="v">{releases.length}</div>
              </div>
              <div className="card">
                <div className="k">Doctor Fails</div>
                <div className="v">{doctorFailed}</div>
              </div>
            </div>

            <div className="panel">
              <h3>Recent Builds</h3>
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Platform</th>
                    <th>Status</th>
                    <th>Profile</th>
                    <th>Started</th>
                  </tr>
                </thead>
                <tbody>
                  {builds.slice(0, 8).map((row) => (
                    <tr key={row.id}>
                      <td>{row.id}</td>
                      <td>{row.platform}</td>
                      <td className={statusClass(row.status)}>{row.status}</td>
                      <td>{row.profile}</td>
                      <td>{row.startedAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!loading && !error && view === "builds" && (
          <div className="panel">
            <h3>Builds</h3>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Platform</th>
                  <th>Status</th>
                  <th>Profile</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {builds.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.platform}</td>
                    <td className={statusClass(row.status)}>{row.status}</td>
                    <td>{row.profile}</td>
                    <td>{row.errorMessage ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && view === "releases" && (
          <div className="panel">
            <h3>Releases</h3>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Platform</th>
                  <th>Status</th>
                  <th>Profile</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {releases.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.platform}</td>
                    <td className={statusClass(row.status)}>{row.status}</td>
                    <td>{row.profile}</td>
                    <td>{row.errorMessage ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && view === "submissions" && (
          <div className="panel">
            <h3>Submissions</h3>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Platform</th>
                  <th>Status</th>
                  <th>Store</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.platform}</td>
                    <td className={statusClass(row.status)}>{row.status}</td>
                    <td>{row.store}</td>
                    <td>{row.errorMessage ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && view === "doctor" && (
          <div className="panel">
            <h3>Doctor Checks</h3>
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {doctor.map((row) => (
                  <tr key={row.id}>
                    <td>{row.category}</td>
                    <td>{row.name}</td>
                    <td className={statusClass(row.status)}>{row.status}</td>
                    <td>{row.message ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && view === "metadata" && (
          <div className="panel metadata-panel">
            <h3>Metadata</h3>
            <div className="button-row">
              <select value={metadataPlatform} onChange={(e) => setMetadataPlatform(e.target.value as MetadataPlatform)}>
                <option value="ios">ios</option>
                <option value="android">android</option>
              </select>
              <button disabled={!!actionBusy} onClick={() => void handleMetadataAction("pull")}>
                {actionBusy === "Metadata pull" ? "Pulling..." : "Pull"}
              </button>
              <button disabled={!!actionBusy} onClick={() => void handleMetadataAction("validate")}>
                {actionBusy === "Metadata validate" ? "Validating..." : "Validate"}
              </button>
              <button disabled={!!actionBusy} onClick={() => void handleMetadataAction("push")}>
                {actionBusy === "Metadata push" ? "Pushing..." : "Push"}
              </button>
              <button disabled={!!actionBusy || !selectedMetadataFile} onClick={() => void handleMetadataSave()}>
                {actionBusy === "Metadata save" ? "Saving..." : "Save File"}
              </button>
            </div>
            <div className="metadata-grid">
              <div className="metadata-list">
                {metadataKeys.length === 0 && <div className="empty">No metadata files found.</div>}
                {metadataKeys.map((key) => (
                  <button
                    key={key}
                    className={selectedMetadataFile === key ? "active" : ""}
                    onClick={() => {
                      setSelectedMetadataFile(key);
                      setMetadataDraft(metadata[key]?.content ?? "");
                    }}
                  >
                    {key}
                  </button>
                ))}
              </div>
              <div className="metadata-editor">
                <div className="muted">{selectedMetadataFile || "Select metadata file"}</div>
                <textarea
                  value={metadataDraft}
                  onChange={(e) => setMetadataDraft(e.target.value)}
                  placeholder="Metadata file content"
                  disabled={!selectedMetadataFile}
                />
              </div>
            </div>
          </div>
        )}

        {!loading && !error && view === "credentials" && (
          <div className="panel">
            <h3>Credentials</h3>
            <div className="credentials-grid">
              <div className="credentials-form">
                <div className="form-title">Configure iOS</div>
                <input value={iosKeyId} onChange={(e) => setIosKeyId(e.target.value)} placeholder="Key ID" />
                <input value={iosIssuerId} onChange={(e) => setIosIssuerId(e.target.value)} placeholder="Issuer ID" />
                <input
                  value={iosPrivateKeyPath}
                  onChange={(e) => setIosPrivateKeyPath(e.target.value)}
                  placeholder="/absolute/path/AuthKey_XXXX.p8"
                />
                <button disabled={!!actionBusy} onClick={() => void handleConfigureIosCredentials()}>
                  {actionBusy === "Configure iOS credentials" ? "Saving..." : "Save iOS Credentials"}
                </button>
              </div>
              <div className="credentials-form">
                <div className="form-title">Configure Android</div>
                <input
                  value={androidServiceAccountPath}
                  onChange={(e) => setAndroidServiceAccountPath(e.target.value)}
                  placeholder="/absolute/path/service-account.json"
                />
                <button disabled={!!actionBusy} onClick={() => void handleConfigureAndroidCredentials()}>
                  {actionBusy === "Configure Android credentials" ? "Saving..." : "Save Android Credentials"}
                </button>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Platform</th>
                  <th>Status</th>
                  <th>Missing</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>iOS</td>
                  <td className={statusClass(credentials?.ios.configured ? "configured" : "missing")}>
                    {credentials?.ios.configured ? "configured" : "missing"}
                  </td>
                  <td>{credentials?.ios.missing.join(", ") ?? ""}</td>
                </tr>
                <tr>
                  <td>Android</td>
                  <td className={statusClass(credentials?.android.configured ? "configured" : "missing")}>
                    {credentials?.android.configured ? "configured" : "missing"}
                  </td>
                  <td>{credentials?.android.missing.join(", ") ?? ""}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && view === "logs" && (
          <div className="panel logs-panel">
            <h3>Logs</h3>
            <div className="logs-grid">
              <div className="logs-list">
                {logs.map((log) => (
                  <button
                    key={log.id}
                    className={selectedLogId === log.id ? "active" : ""}
                    onClick={() => void handleLogSelect(log.id)}
                  >
                    <div>{log.id}</div>
                    <div className="muted">{log.type}</div>
                  </button>
                ))}
              </div>
              <pre>{logs.length === 0 ? "No logs available" : latestLogContent}</pre>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
