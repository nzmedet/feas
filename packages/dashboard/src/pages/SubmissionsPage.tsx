import { Button, Card, CardBody, CardHeader, Input, Select, SelectItem } from "@heroui/react";
import { NoProjectState } from "../components/NoProjectState";
import { StatusPill } from "../components/StatusPill";
import { useDashboard } from "../context/DashboardContext";
import { darkSelectClassNames, darkSelectItemClassName } from "../lib/ui";
import { compactId, formatDateTime, shortPath } from "../lib/utils";

const submitPlatforms = [
  { key: "ios", label: "ios" },
  { key: "android", label: "android" },
];

export function SubmissionsPage() {
  const { project, submissions, submitPlatform, setSubmitPlatform, submitPath, setSubmitPath, runSubmit, actionBusy } = useDashboard();

  if (!project) {
    return <NoProjectState />;
  }

  return (
    <div className="grid gap-5">
      <Card className="border border-white/10 bg-[#0f1722] shadow-sm">
        <CardHeader className="pb-0 text-lg font-semibold">Submit Existing Build</CardHeader>
        <CardBody className="grid gap-3 pt-4 lg:grid-cols-[180px_1fr_auto] lg:items-end">
          <Select
            label="Platform"
            classNames={darkSelectClassNames}
            selectedKeys={[submitPlatform]}
            onSelectionChange={(keys) => {
              const value = Array.from(keys)[0] as "ios" | "android";
              if (value) {
                setSubmitPlatform(value);
              }
            }}
          >
            {submitPlatforms.map((option) => (
              <SelectItem key={option.key} className={darkSelectItemClassName}>{option.label}</SelectItem>
            ))}
          </Select>
          <Input
            label="Artifact path"
            value={submitPath}
            onValueChange={setSubmitPath}
            placeholder="dist/app.ipa or dist/app.aab"
          />
          <Button color="primary" isDisabled={!!actionBusy || !submitPath.trim()} onPress={() => void runSubmit()}>
            {actionBusy === "Submit" ? "Running submit..." : "Run submit"}
          </Button>
        </CardBody>
      </Card>

      <Card className="border border-white/10 bg-[#0f1722] shadow-sm">
        <CardHeader className="pb-0 text-lg font-semibold">Submissions</CardHeader>
        <CardBody className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] table-fixed text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="pb-2 w-[140px]">ID</th>
                  <th className="pb-2 w-[90px]">Platform</th>
                  <th className="pb-2 w-[110px]">Status</th>
                  <th className="pb-2 w-[140px]">Store</th>
                  <th className="pb-2 w-[130px]">Started</th>
                  <th className="pb-2 w-[220px]">Log</th>
                  <th className="pb-2 w-[220px]">Error</th>
                </tr>
              </thead>
              <tbody>
                {submissions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-sm text-slate-500">
                      No submissions yet.
                    </td>
                  </tr>
                ) : (
                  submissions.map((row) => (
                    <tr key={row.id} className="border-b border-white/5 transition hover:bg-white/5">
                      <td className="py-2 font-mono text-xs truncate" title={row.id}>{compactId(row.id)}</td>
                      <td>{row.platform}</td>
                      <td>
                        <StatusPill status={row.status} />
                      </td>
                      <td>{row.store}</td>
                      <td>{formatDateTime(row.startedAt)}</td>
                      <td className="truncate" title={row.logPath ?? ""}>{shortPath(row.logPath)}</td>
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
