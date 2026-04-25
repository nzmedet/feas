import { Card, CardBody, CardHeader } from "@heroui/react";
import { NoProjectState } from "../components/NoProjectState";
import { StatusPill } from "../components/StatusPill";
import { useDashboard } from "../context/DashboardContext";
import { compactId, formatDateTime } from "../lib/utils";

export function OverviewPage() {
  const { project, builds, releases, doctor } = useDashboard();

  if (!project) {
    return <NoProjectState />;
  }

  const buildFailed = builds.filter((b) => b.status !== "success").length;
  const doctorFailed = doctor.filter((d) => d.status === "fail").length;

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { k: "Builds", v: builds.length },
          { k: "Build Failures", v: buildFailed },
          { k: "Releases", v: releases.length },
          { k: "Doctor Fails", v: doctorFailed },
        ].map((item) => (
          <Card key={item.k} className="border border-white/10 bg-[#0f1722] shadow-sm">
            <CardBody className="py-3">
              <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{item.k}</div>
              <div className="mt-1 text-[36px] font-semibold tracking-tight leading-none text-slate-100">{item.v}</div>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card className="border border-white/10 bg-[#0f1722] shadow-sm">
        <CardHeader className="pb-0 text-lg font-semibold">Recent Builds</CardHeader>
        <CardBody className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] table-fixed text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="pb-2 w-[220px]">ID</th>
                  <th className="pb-2 w-[90px]">Platform</th>
                  <th className="pb-2 w-[110px]">Status</th>
                  <th className="pb-2 w-[120px]">Build #</th>
                  <th className="pb-2 w-[130px]">Profile</th>
                  <th className="pb-2 w-[170px]">Started</th>
                </tr>
              </thead>
              <tbody>
                {builds.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-sm text-slate-500">
                      No builds yet.
                    </td>
                  </tr>
                ) : (
                  builds.slice(0, 8).map((row) => (
                    <tr key={row.id} className="border-b border-white/5 transition hover:bg-white/5">
                      <td className="py-2 font-mono text-xs truncate" title={row.id}>{compactId(row.id)}</td>
                      <td>{row.platform}</td>
                      <td>
                        <StatusPill status={row.status} />
                      </td>
                      <td>{row.buildNumber ?? ""}</td>
                      <td className="truncate" title={row.profile ?? ""}>{row.profile ?? ""}</td>
                      <td>{formatDateTime(row.startedAt)}</td>
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
