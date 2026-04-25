import { Button, Card, CardBody, CardHeader, Input } from "@heroui/react";
import { NoProjectState } from "../components/NoProjectState";
import { StatusPill } from "../components/StatusPill";
import { useDashboard } from "../context/DashboardContext";

export function CredentialsPage() {
  const {
    project,
    credentials,
    iosKeyId,
    setIosKeyId,
    iosIssuerId,
    setIosIssuerId,
    iosPrivateKeyPath,
    setIosPrivateKeyPath,
    androidServiceAccountPath,
    setAndroidServiceAccountPath,
    configureIosCredentials,
    configureAndroidCredentials,
    actionBusy,
  } = useDashboard();

  if (!project) {
    return <NoProjectState />;
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border border-white/10 bg-[#0f1722] shadow-sm">
          <CardHeader className="pb-0">
            <div>
              <div className="text-lg font-semibold text-slate-100">Configure iOS</div>
              <div className="text-xs text-slate-500">App Store Connect API key settings.</div>
            </div>
          </CardHeader>
          <CardBody className="grid gap-3 pt-4">
            <Input label="Key ID" value={iosKeyId} onValueChange={setIosKeyId} />
            <Input label="Issuer ID" value={iosIssuerId} onValueChange={setIosIssuerId} />
            <Input label="Private key path" value={iosPrivateKeyPath} onValueChange={setIosPrivateKeyPath} />
            <Button isDisabled={!!actionBusy} onPress={() => void configureIosCredentials()}>
              {actionBusy === "Configure iOS credentials" ? "Saving..." : "Save iOS credentials"}
            </Button>
          </CardBody>
        </Card>

        <Card className="border border-white/10 bg-[#0f1722] shadow-sm">
          <CardHeader className="pb-0">
            <div>
              <div className="text-lg font-semibold text-slate-100">Configure Android</div>
              <div className="text-xs text-slate-500">Google Play service account settings.</div>
            </div>
          </CardHeader>
          <CardBody className="grid gap-3 pt-4">
            <Input
              label="Service account path"
              value={androidServiceAccountPath}
              onValueChange={setAndroidServiceAccountPath}
            />
            <Button isDisabled={!!actionBusy} onPress={() => void configureAndroidCredentials()}>
              {actionBusy === "Configure Android credentials" ? "Saving..." : "Save Android credentials"}
            </Button>
          </CardBody>
        </Card>
      </div>

      <Card className="border border-white/10 bg-[#0f1722] shadow-sm">
        <CardHeader className="pb-0 text-lg font-semibold">Credential Status</CardHeader>
        <CardBody className="pt-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-white/10 p-3">
              <div className="mb-2 text-sm font-semibold">iOS</div>
              <StatusPill status={credentials?.ios.configured ? "configured" : "missing"} />
              {!credentials?.ios.configured && (
                <div className="mt-2 text-sm text-slate-400">Missing: {credentials?.ios.missing.join(", ")}</div>
              )}
            </div>
            <div className="rounded-xl border border-white/10 p-3">
              <div className="mb-2 text-sm font-semibold">Android</div>
              <StatusPill status={credentials?.android.configured ? "configured" : "missing"} />
              {!credentials?.android.configured && (
                <div className="mt-2 text-sm text-slate-400">Missing: {credentials?.android.missing.join(", ")}</div>
              )}
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
