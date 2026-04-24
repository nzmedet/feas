import { useEffect, useMemo, useState } from "react";

type View = "overview" | "builds" | "releases" | "submissions" | "doctor" | "metadata" | "credentials" | "logs";

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
  return status === "success" || status === "pass" ? "status-ok" : "status-bad";
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
  const [latestLogContent, setLatestLogContent] = useState<string>("No log selected.");

  const token = useMemo(() => tokenFromUrl(), []);

  useEffect(() => {
    let canceled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const projectsPayload = await apiGet<{ projects: Project[] }>("/api/projects", token);
        const current = projectsPayload.projects[0] ?? null;
        if (!current) {
          if (!canceled) {
            setProject(null);
            setBuilds([]);
            setReleases([]);
            setSubmissions([]);
            setDoctor([]);
            setLogs([]);
            setMetadata({});
            setCredentials(null);
            setLatestLogContent("No initialized FEAS projects found.");
          }
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

        let logContent = "No logs found.";
        if (logsPayload.logs[0]) {
          const latestLog = await apiGet<{ content: string }>(`/api/projects/${current.id}/logs/${encodeURIComponent(logsPayload.logs[0].id)}`, token);
          logContent = latestLog.content || "No content";
        }

        if (!canceled) {
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
          setLatestLogContent(logContent);
        }
      } catch (err) {
        if (!canceled) {
          setError(err instanceof Error ? err.message : "Failed to load dashboard data");
        }
      } finally {
        if (!canceled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      canceled = true;
    };
  }, [token]);

  const buildFailed = builds.filter((b) => b.status !== "success").length;
  const doctorFailed = doctor.filter((d) => d.status === "fail").length;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">FEAS Dashboard</div>
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
            <div className="muted">Local FEAS runtime</div>
          </div>
          <div className="muted">{project ? `${project.name} · ${project.root ?? "unknown-root"}` : "No project"}</div>
        </div>

        {loading && <div className="panel"><h3>Loading</h3><div className="empty">Fetching dashboard data...</div></div>}
        {error && <div className="panel"><h3>Error</h3><div className="empty">{error}</div></div>}

        {!loading && !error && view === "overview" && (
          <>
            <div className="cards">
              <div className="card"><div className="k">Builds</div><div className="v">{builds.length}</div></div>
              <div className="card"><div className="k">Build Failures</div><div className="v">{buildFailed}</div></div>
              <div className="card"><div className="k">Releases</div><div className="v">{releases.length}</div></div>
              <div className="card"><div className="k">Doctor Fails</div><div className="v">{doctorFailed}</div></div>
            </div>
            <div className="panel">
              <h3>Recent Builds</h3>
              <table>
                <thead><tr><th>ID</th><th>Platform</th><th>Status</th><th>Profile</th><th>Started</th></tr></thead>
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
              <thead><tr><th>ID</th><th>Platform</th><th>Status</th><th>Profile</th><th>Error</th></tr></thead>
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
              <thead><tr><th>ID</th><th>Platform</th><th>Status</th><th>Profile</th><th>Error</th></tr></thead>
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
              <thead><tr><th>ID</th><th>Platform</th><th>Status</th><th>Store</th><th>Error</th></tr></thead>
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
              <thead><tr><th>Category</th><th>Name</th><th>Status</th><th>Message</th></tr></thead>
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
          <div className="panel">
            <h3>Metadata</h3>
            <table>
              <thead><tr><th>File</th><th>Preview</th></tr></thead>
              <tbody>
                {Object.entries(metadata).map(([key, value]) => (
                  <tr key={key}>
                    <td>{key}</td>
                    <td>{value.content.slice(0, 120)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && view === "credentials" && (
          <div className="panel">
            <h3>Credentials</h3>
            <table>
              <thead><tr><th>Platform</th><th>Status</th><th>Missing</th></tr></thead>
              <tbody>
                <tr>
                  <td>iOS</td>
                  <td className={credentials?.ios.configured ? "status-ok" : "status-bad"}>
                    {credentials?.ios.configured ? "configured" : "missing"}
                  </td>
                  <td>{credentials?.ios.missing.join(", ") ?? ""}</td>
                </tr>
                <tr>
                  <td>Android</td>
                  <td className={credentials?.android.configured ? "status-ok" : "status-bad"}>
                    {credentials?.android.configured ? "configured" : "missing"}
                  </td>
                  <td>{credentials?.android.missing.join(", ") ?? ""}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && view === "logs" && (
          <div className="panel">
            <h3>Latest Log</h3>
            {logs.length === 0 ? <div className="empty">No logs available</div> : <pre>{latestLogContent}</pre>}
          </div>
        )}
      </main>
    </div>
  );
}
