import { Chip } from "@heroui/react";
import { statusTone } from "../lib/utils";

export function StatusPill({ status }: { status: string }) {
  return (
    <Chip size="sm" color={statusTone(status)} variant="flat" className="capitalize">
      {status}
    </Chip>
  );
}
