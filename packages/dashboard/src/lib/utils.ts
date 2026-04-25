export function tokenFromUrl(): string {
  const url = new URL(window.location.href);
  return url.searchParams.get("token") ?? "";
}

export function shortPath(value?: string | null): string {
  if (!value) {
    return "";
  }
  const parts = value.split("/");
  return parts.slice(-4).join("/");
}

export function toErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return "Request failed";
}

export function compactId(value: string, max = 14): string {
  if (!value) {
    return "";
  }
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export function formatDateTime(value?: string | null): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function statusTone(status: string): "success" | "warning" | "danger" | "default" {
  if (status === "success" || status === "pass" || status === "configured") {
    return "success";
  }
  if (status === "warn" || status === "skip") {
    return "warning";
  }
  if (status === "running") {
    return "default";
  }
  return "danger";
}
