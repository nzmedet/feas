import { Button, Card, CardBody, CardHeader, Input } from "@heroui/react";
import { useDashboard } from "../context/DashboardContext";

export function NoProjectState() {
  const {
    initProfile,
    projectPathInput,
    setInitProfile,
    setProjectPathInput,
    initializeProject,
    actionBusy,
  } = useDashboard();

  return (
    <Card className="border border-white/10 bg-[#0f1722] shadow-sm">
      <CardHeader className="pb-0">
        <div>
          <div className="text-lg font-semibold text-slate-100">Initialize FEAS Project</div>
          <div className="text-xs text-slate-500">Connect a local app path to start using FEAS dashboard features.</div>
        </div>
      </CardHeader>
      <CardBody className="grid gap-3 pt-4">
        <Input label="Profile" value={initProfile} onValueChange={setInitProfile} placeholder="production" />
        <Input
          label="Mobile project path"
          value={projectPathInput}
          onValueChange={setProjectPathInput}
          placeholder="/absolute/path/to/expo-or-react-native-app"
        />
        <Button
          color="primary"
          isDisabled={!!actionBusy || !projectPathInput.trim()}
          onPress={() => void initializeProject()}
        >
          {actionBusy === "Initialize project" ? "Initializing..." : "Initialize"}
        </Button>
      </CardBody>
    </Card>
  );
}
