import { Avatar, Card, CardBody, Chip, Select, SelectItem, Spinner } from "@heroui/react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useDashboard } from "../context/DashboardContext";
import { darkSelectClassNames, darkSelectItemClassName } from "../lib/ui";

type NavItem = { to: string; label: string; section: string };

const navItems: NavItem[] = [
  { to: "/", label: "Overview", section: "Project" },
  { to: "/builds", label: "Builds", section: "Deploy" },
  { to: "/releases", label: "Releases", section: "Deploy" },
  { to: "/submissions", label: "Submissions", section: "Deploy" },
  { to: "/doctor", label: "Doctor", section: "Develop" },
  { to: "/metadata", label: "Metadata", section: "Develop" },
  { to: "/credentials", label: "Credentials", section: "Develop" },
  { to: "/logs", label: "Logs", section: "Develop" },
];

const navSections = ["Project", "Develop", "Deploy"];

function SidebarNavIcon({ label }: { label: string }) {
  if (label === "Overview") {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
        <rect x="2" y="2" width="4.5" height="4.5" stroke="currentColor" strokeWidth="1.2" />
        <rect x="9.5" y="2" width="4.5" height="4.5" stroke="currentColor" strokeWidth="1.2" />
        <rect x="2" y="9.5" width="4.5" height="4.5" stroke="currentColor" strokeWidth="1.2" />
        <rect x="9.5" y="9.5" width="4.5" height="4.5" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  }
  if (label === "Builds") {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
        <path d="M2.5 5.5L8 2.5l5.5 3v5L8 13.5l-5.5-3v-5Z" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  }
  if (label === "Submissions") {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
        <path d="M3 4h10v8H3z" stroke="currentColor" strokeWidth="1.2" />
        <path d="M8 10V6m0 0-2 2m2-2 2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (label === "Releases") {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
        <path d="M8 2.5 13 12H3L8 2.5Z" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  }
  if (label === "Doctor") {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
        <path d="m3.2 8.2 3.1 3.1 6.5-6.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (label === "Metadata") {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
        <path d="M3 4h10M3 8h10M3 12h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (label === "Credentials") {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
        <circle cx="8" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M4 13c.7-1.7 1.9-2.5 4-2.5S11.3 11.3 12 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
      <path d="M3 4h10M3 8h10M3 12h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function pageTitle(pathname: string): string {
  if (pathname === "/") {
    return "Overview";
  }
  return pathname.replace("/", "").replace(/(^\w)/, (m) => m.toUpperCase());
}

export function AppShell() {
  const location = useLocation();
  const { projects, selectedProjectId, setSelectedProjectId, project, loading, error, actionMessage, actionMessageKind } =
    useDashboard();
  const title = pageTitle(location.pathname);

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100">
      <div className="mx-auto grid min-h-screen w-full max-w-[1920px] grid-cols-1 lg:grid-cols-[340px_1fr]">
        <aside className="flex h-full flex-col border-b border-white/10 bg-[#0c1118] px-5 py-6 lg:border-b-0 lg:border-r lg:border-white/10">
          <div className="mb-5 flex items-center">
            <div className="flex items-center gap-2 text-[40px] font-semibold tracking-tight text-slate-50">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-slate-200">
                <path d="M3.2 16.4L10.6 4.6a1.6 1.6 0 0 1 2.8 0L20.8 16.4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                <path d="M7.6 16.4L12 9.3l4.4 7.1" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
              <span className="text-[44px] leading-none">Feas</span>
            </div>
          </div>

          <div className="mb-6 rounded-2xl border border-white/10 bg-white/10 p-3.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Avatar size="sm" className="h-7 w-7 bg-orange-500/90 text-white" name={(project?.name?.[0] ?? "P").toUpperCase()} />
                <div className="truncate text-sm font-medium text-slate-200">{project?.name ?? "Select project"}</div>
              </div>
              <span className="text-slate-500">⌄</span>
            </div>
            {projects.length > 1 && (
              <Select
                aria-label="Select project"
                size="sm"
                variant="flat"
                classNames={darkSelectClassNames}
                selectedKeys={selectedProjectId ? [selectedProjectId] : []}
                onSelectionChange={(keys) => {
                  const value = Array.from(keys)[0] as string | undefined;
                  if (value) {
                    setSelectedProjectId(value);
                  }
                }}
              >
                {projects.map((item) => (
                  <SelectItem key={item.id} className={darkSelectItemClassName}>{item.name}</SelectItem>
                ))}
              </Select>
            )}
          </div>

          {navSections.map((section) => (
            <div key={section} className="mb-5">
              <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{section}</div>
              <nav className="grid gap-0.5">
                {navItems
                  .filter((item) => item.section === section)
                  .map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `flex items-center gap-2 rounded-xl px-3 py-2.5 text-[17px] leading-none font-medium transition ${
                          isActive ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/10 hover:text-slate-100"
                        }`
                      }
                      end={item.to === "/"}
                    >
                      <span className="w-4 text-slate-500">
                        <SidebarNavIcon label={item.label} />
                      </span>
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
              </nav>
            </div>
          ))}

          <div className="mt-auto border-t border-white/10 pt-4 text-xs text-slate-500">Local FEAS dashboard</div>
        </aside>

        <main className="p-4 lg:p-5">
          <div className="min-h-[calc(100vh-2.5rem)] rounded-2xl border border-white/10 bg-[#080d14] px-4 py-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)_inset] sm:px-6 lg:px-7">
            <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" className="text-slate-300">
                  <path d="M5 8.5L12 4l7 4.5v7L12 20l-7-4.5v-7Z" stroke="currentColor" strokeWidth="1.7" />
                  <path d="M12 4v16M5 8.5l7 4.5 7-4.5" stroke="currentColor" strokeWidth="1.5" />
                </svg>
                <div>
                  <h1 className="text-[40px] font-semibold leading-none tracking-tight text-slate-100">{title}</h1>
                </div>
              </div>
              <div />
            </header>

            {actionMessage && (
              <div className="mb-5">
                <Chip
                  color={actionMessageKind === "success" ? "success" : actionMessageKind === "error" ? "danger" : "primary"}
                  variant="flat"
                  className="rounded-lg px-1 py-4 text-sm"
                >
                  {actionMessage}
                </Chip>
              </div>
            )}

            {loading && (
              <Card className="border border-white/10 bg-[#0f1722] shadow-sm">
                <CardBody className="flex flex-row items-center gap-3 py-6">
                  <Spinner size="sm" />
                  <span className="text-sm text-slate-400">Fetching dashboard data...</span>
                </CardBody>
              </Card>
            )}

            {!loading && error && (
              <Card className="border border-danger-600/50 bg-danger-900/20 shadow-sm">
                <CardBody className="py-6 text-sm text-danger-200">{error}</CardBody>
              </Card>
            )}

            {!loading && !error && <Outlet />}
          </div>
        </main>
      </div>
    </div>
  );
}
