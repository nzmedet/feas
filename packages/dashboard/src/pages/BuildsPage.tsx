import {
  Button,
  Card,
  CardBody,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Input,
  Select,
  SelectItem,
} from "@heroui/react";
import { useNavigate } from "react-router-dom";
import { NoProjectState } from "../components/NoProjectState";
import { StatusPill } from "../components/StatusPill";
import { useDashboard } from "../context/DashboardContext";
import { darkSelectClassNames, darkSelectItemClassName } from "../lib/ui";
import { compactId, formatDateTime } from "../lib/utils";

const platformOptions = [
  { key: "all", label: "all" },
  { key: "ios", label: "ios" },
  { key: "android", label: "android" },
];

export function BuildsPage() {
  const navigate = useNavigate();
  const {
    project,
    builds,
    runPlatform,
    setRunPlatform,
    runProfile,
    setRunProfile,
    runDryRun,
    setRunDryRun,
    allowPrebuild,
    setAllowPrebuild,
    runBuild,
    actionBusy,
    submitBuild,
    rebuildBuild,
    deleteBuild,
  } = useDashboard();

  if (!project) {
    return <NoProjectState />;
  }

  return (
    <div className="grid gap-5">
      <Card className="border border-white/10 bg-[#0f1722] shadow-sm">
        <CardBody className="space-y-4 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Select
                label="Platform"
                labelPlacement="outside"
                size="sm"
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
                  <SelectItem key={option.key} className={darkSelectItemClassName}>
                    {option.label}
                  </SelectItem>
                ))}
              </Select>
              <Input
                size="sm"
                label="Profile"
                labelPlacement="outside"
                value={runProfile}
                onValueChange={setRunProfile}
                placeholder="production"
              />
              <Select
                label="Mode"
                labelPlacement="outside"
                size="sm"
                classNames={darkSelectClassNames}
                selectedKeys={[runDryRun ? "dry" : "real"]}
                onSelectionChange={(keys) => {
                  const value = Array.from(keys)[0] as "dry" | "real";
                  setRunDryRun(value === "dry");
                }}
              >
                <SelectItem key="dry" className={darkSelectItemClassName}>Dry run</SelectItem>
                <SelectItem key="real" className={darkSelectItemClassName}>Real</SelectItem>
              </Select>
              <Select
                label="Prebuild"
                labelPlacement="outside"
                size="sm"
                classNames={darkSelectClassNames}
                selectedKeys={[allowPrebuild ? "yes" : "no"]}
                onSelectionChange={(keys) => {
                  const value = Array.from(keys)[0] as "yes" | "no";
                  setAllowPrebuild(value === "yes");
                }}
              >
                <SelectItem key="no" className={darkSelectItemClassName}>Disabled</SelectItem>
                <SelectItem key="yes" className={darkSelectItemClassName}>Enabled</SelectItem>
              </Select>
            </div>
            <Button size="sm" color="primary" onPress={() => void runBuild()} isDisabled={!!actionBusy} className="self-end">
              {actionBusy === "Build" ? "Running build..." : "Run build"}
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] table-fixed text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="pb-2 w-[240px]">Build</th>
                  <th className="pb-2 w-[120px]">Git ref</th>
                  <th className="pb-2 w-[130px]">Profile</th>
                  <th className="pb-2 w-[110px]">Platform</th>
                  <th className="pb-2 w-[110px]">Status</th>
                  <th className="pb-2 w-[120px]">Build #</th>
                  <th className="pb-2 w-[150px]">Created</th>
                  <th className="pb-2 w-[90px] text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {builds.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-sm text-slate-500">
                      No builds yet. Run your first build above.
                    </td>
                  </tr>
                ) : (
                  builds.map((row) => (
                    <tr key={row.id} className="border-b border-white/5 align-top transition hover:bg-white/5">
                      <td className="py-2">
                        <div className="truncate text-[15px] font-medium text-slate-100" title={row.id}>
                          {row.platform.toUpperCase()} build {row.buildNumber ? `#${row.buildNumber}` : ""}
                        </div>
                        <div className="truncate font-mono text-xs text-slate-400" title={row.id}>
                          {compactId(row.id)}
                        </div>
                      </td>
                      <td className="font-mono text-xs text-slate-300">{compactId(row.id, 8)}</td>
                      <td className="truncate" title={row.profile ?? ""}>{row.profile ?? ""}</td>
                      <td>{row.platform}</td>
                      <td>
                        <StatusPill status={row.status} />
                      </td>
                      <td>{row.buildNumber ?? ""}</td>
                      <td>{formatDateTime(row.startedAt)}</td>
                      <td className="text-right">
                        <Dropdown
                          placement="bottom-end"
                          classNames={{
                            content: "border border-white/15 bg-[#0f1722] text-slate-100 shadow-2xl",
                          }}
                        >
                          <DropdownTrigger>
                            <Button isIconOnly size="sm" variant="light" aria-label="Open build actions" className="text-slate-300">
                              ⋮
                            </Button>
                          </DropdownTrigger>
                          <DropdownMenu
                            aria-label="Build actions"
                            itemClasses={{
                              base: "text-slate-200 data-[hover=true]:bg-white/10 data-[selectable=true]:focus:bg-white/10",
                            }}
                            onAction={(key) => {
                              if (key === "submit") {
                                void submitBuild(row.id);
                              }
                              if (key === "rebuild") {
                                void rebuildBuild(row.id);
                              }
                              if (key === "delete") {
                                void deleteBuild(row.id);
                              }
                              if (key === "logs") {
                                navigate("/logs");
                              }
                            }}
                          >
                            <DropdownItem key="submit">Submit build</DropdownItem>
                            <DropdownItem key="rebuild">Rebuild</DropdownItem>
                            <DropdownItem key="logs">Open logs page</DropdownItem>
                            <DropdownItem key="delete" color="danger" className="text-danger">
                              Delete build
                            </DropdownItem>
                          </DropdownMenu>
                        </Dropdown>
                      </td>
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
