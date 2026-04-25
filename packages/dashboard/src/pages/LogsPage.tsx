import { Card, CardBody, CardHeader } from "@heroui/react";
import { NoProjectState } from "../components/NoProjectState";
import { useDashboard } from "../context/DashboardContext";

export function LogsPage() {
  const { project, logs, selectedLogId, selectLog, latestLogContent } = useDashboard();

  if (!project) {
    return <NoProjectState />;
  }

  return (
    <Card className="border border-white/10 bg-[#0f1722] shadow-sm">
      <CardHeader className="pb-0">
        <div>
          <div className="text-lg font-semibold text-slate-100">Logs</div>
          <div className="text-xs text-slate-500">Select a run log on the left to inspect output.</div>
        </div>
      </CardHeader>
      <CardBody className="grid gap-4 pt-4 lg:grid-cols-[320px_1fr]">
        <div className="max-h-[560px] space-y-2 overflow-auto rounded-xl border border-white/10 bg-[#0f1722] p-2">
          {logs.length === 0 && <div className="px-2 py-1 text-sm text-slate-500">No logs available.</div>}
          {logs.map((log) => (
            <button
              key={log.id}
              className={`w-full rounded-lg px-2 py-2 text-left text-sm transition ${
                selectedLogId === log.id ? "bg-cyan-700 text-white" : "text-slate-300 hover:bg-white/10"
              }`}
              onClick={() => void selectLog(log.id)}
              type="button"
            >
              <div className="truncate font-mono text-xs" title={log.id}>{log.id}</div>
              <div className="text-xs opacity-80">{log.type}</div>
            </button>
          ))}
        </div>
        <pre className="max-h-[560px] overflow-auto rounded-xl border border-white/10 bg-slate-950 p-4 text-xs leading-6 text-slate-100">
          {logs.length === 0 ? "No logs available" : latestLogContent}
        </pre>
      </CardBody>
    </Card>
  );
}
