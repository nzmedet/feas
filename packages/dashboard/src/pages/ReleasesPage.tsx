import { Button, Card, CardBody, Switch } from "@heroui/react";
import { NoProjectState } from "../components/NoProjectState";
import { StatusPill } from "../components/StatusPill";
import { useDashboard } from "../context/DashboardContext";
import { compactId } from "../lib/utils";

export function ReleasesPage() {
  const { project, releases, runRelease, skipSubmit, setSkipSubmit, actionBusy } = useDashboard();

  if (!project) {
    return <NoProjectState />;
  }

  return (
    <div className="grid gap-5">
      <Card className="border border-white/10 bg-[#0f1722] shadow-sm">
        <CardBody className="pt-5">
          <div className="mb-3 text-base font-semibold text-slate-100">Release controls</div>
          <div className="flex flex-wrap items-center gap-4">
            <Switch isSelected={skipSubmit} onValueChange={setSkipSubmit}>
              Skip submit
            </Switch>
            <Button color="primary" isDisabled={!!actionBusy} onPress={() => void runRelease()}>
              {actionBusy === "Release" ? "Running release..." : "Run release"}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card className="border border-white/10 bg-[#0f1722] shadow-sm">
        <CardBody className="pt-5">
          <div className="mb-3 text-base font-semibold text-slate-100">Releases</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] table-fixed text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="pb-2 w-[220px]">ID</th>
                  <th className="pb-2 w-[90px]">Platform</th>
                  <th className="pb-2 w-[110px]">Status</th>
                  <th className="pb-2 w-[130px]">Profile</th>
                  <th className="pb-2 w-[160px]">Version</th>
                  <th className="pb-2 w-[220px]">Error</th>
                </tr>
              </thead>
              <tbody>
                {releases.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-sm text-slate-500">
                      No releases yet.
                    </td>
                  </tr>
                ) : (
                  releases.map((row) => (
                    <tr key={row.id} className="border-b border-white/5 transition hover:bg-white/5">
                      <td className="py-2 font-mono text-xs truncate" title={row.id}>{compactId(row.id)}</td>
                      <td>{row.platform}</td>
                      <td>
                        <StatusPill status={row.status} />
                      </td>
                      <td className="truncate" title={row.profile ?? ""}>{row.profile ?? ""}</td>
                      <td>{row.version ?? row.buildNumber ?? ""}</td>
                      <td className="truncate text-xs text-slate-400" title={row.errorMessage ?? ""}>{row.errorMessage ?? ""}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
