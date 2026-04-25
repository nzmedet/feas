import { Button, Card, CardBody, Select, SelectItem, Textarea } from "@heroui/react";
import { NoProjectState } from "../components/NoProjectState";
import { useDashboard } from "../context/DashboardContext";
import { darkSelectClassNames, darkSelectItemClassName } from "../lib/ui";

const metadataPlatforms = [
  { key: "ios", label: "ios" },
  { key: "android", label: "android" },
];

export function MetadataPage() {
  const {
    project,
    metadataPlatform,
    setMetadataPlatform,
    runMetadataAction,
    saveMetadataFile,
    metadataKeys,
    selectedMetadataFile,
    setSelectedMetadataFile,
    metadataDraft,
    setMetadataDraft,
    actionBusy,
  } = useDashboard();

  if (!project) {
    return <NoProjectState />;
  }

  return (
    <Card className="border border-white/10 bg-[#0f1722] shadow-sm">
      <CardBody className="grid gap-4 pt-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-slate-100">Metadata</div>
            <div className="text-xs text-slate-500">Edit and sync localized store metadata files.</div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Select
              className="w-[180px]"
              label="Platform"
              classNames={darkSelectClassNames}
              selectedKeys={[metadataPlatform]}
              onSelectionChange={(keys) => {
                const value = Array.from(keys)[0] as "ios" | "android";
                if (value) {
                  setMetadataPlatform(value);
                }
              }}
            >
              {metadataPlatforms.map((option) => (
                <SelectItem key={option.key} className={darkSelectItemClassName}>{option.label}</SelectItem>
              ))}
            </Select>
            <Button isDisabled={!!actionBusy} onPress={() => void runMetadataAction("pull")}>Pull</Button>
            <Button isDisabled={!!actionBusy} onPress={() => void runMetadataAction("validate")}>Validate</Button>
            <Button color="primary" isDisabled={!!actionBusy} onPress={() => void runMetadataAction("push")}>Push</Button>
            <Button color="secondary" isDisabled={!!actionBusy || !selectedMetadataFile} onPress={() => void saveMetadataFile()}>
              Save file
            </Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="max-h-[500px] space-y-2 overflow-auto rounded-xl border border-white/10 bg-[#0f1722] p-2">
            {metadataKeys.length === 0 && <div className="px-2 py-1 text-sm text-slate-500">No metadata files found.</div>}
            {metadataKeys.map((key) => (
              <button
                key={key}
                className={`w-full rounded-lg px-2 py-2 text-left text-sm transition ${
                  selectedMetadataFile === key ? "bg-cyan-700 text-white" : "text-slate-300 hover:bg-white/10"
                }`}
                onClick={() => setSelectedMetadataFile(key)}
                type="button"
              >
                {key.replace(/^ios\//, "").replace(/^android\//, "")}
              </button>
            ))}
          </div>
          <div>
            <div className="mb-2 text-sm text-slate-500">{selectedMetadataFile || "Select metadata file"}</div>
            <Textarea
              minRows={20}
              value={metadataDraft}
              onValueChange={setMetadataDraft}
              placeholder="Metadata file content"
              isDisabled={!selectedMetadataFile}
              className="font-mono text-xs"
            />
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
