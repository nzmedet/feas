import { Button, Card, CardBody, Select, SelectItem } from "@heroui/react";
import { NoProjectState } from "../components/NoProjectState";
import { StatusPill } from "../components/StatusPill";
import { useDashboard } from "../context/DashboardContext";
import { darkSelectClassNames, darkSelectItemClassName } from "../lib/ui";

const platformOptions = [
  { key: "all", label: "all" },
  { key: "ios", label: "ios" },
  { key: "android", label: "android" },
];

export function DoctorPage() {
  const { project, doctor, runDoctor, actionBusy, runPlatform, setRunPlatform } = useDashboard();

  if (!project) {
    return <NoProjectState />;
  }

  return (
    <div className="grid gap-5">
      <Card className="border border-white/10 bg-[#0f1722] shadow-sm">
        <CardBody className="flex flex-wrap items-end justify-between gap-3 pt-5">
          <div>
            <div className="text-base font-semibold text-slate-100">Doctor checks</div>
            <div className="text-xs text-slate-500">Validate local environment, metadata, and credentials.</div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Select
              className="w-[180px]"
              label="Platform"
              classNames={darkSelectClassNames}
              selectedKeys={[runPlatform]}
              onSelectionChange={(keys) => {
                const value = Array.from(keys)[0] as "all" | "ios" | "android";
                if (value) {
                  setRunPlatform(value);
                }
              }}
            >
              {platformOptions.map((option) => (
                <SelectItem key={option.key} className={darkSelectItemClassName}>{option.label}</SelectItem>
              ))}
            </Select>
            <Button color="primary" onPress={() => void runDoctor()} isDisabled={!!actionBusy}>
              {actionBusy === "Doctor" ? "Running doctor..." : "Run doctor"}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card className="border border-white/10 bg-[#0f1722] shadow-sm">
        <CardBody className="grid gap-3 pt-5">
          <div className="text-base font-semibold text-slate-100">Checks</div>
          {doctor.map((row) => (
            <div key={row.id} className="rounded-xl border border-white/10 bg-[#0f1722] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-semibold ${
                      row.status === "pass" || row.status === "success"
                        ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-300"
                        : row.status === "warn"
                          ? "border-amber-500/60 bg-amber-500/20 text-amber-300"
                          : "border-red-500/60 bg-red-500/20 text-red-300"
                    }`}
                  >
                    {row.status === "pass" || row.status === "success" ? "✓" : row.status === "warn" ? "!" : "×"}
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-slate-100">{row.name}</div>
                    <div className="text-xs uppercase tracking-[0.08em] text-slate-500">{row.category}</div>
                  </div>
                </div>
                <StatusPill status={row.status} />
              </div>
              {row.message && <div className="mt-2 text-sm text-slate-400">{row.message}</div>}
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
