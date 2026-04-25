export async function apiGet<T>(path: string, token: string): Promise<T> {
  const url = new URL(path, window.location.origin);
  const headers: Record<string, string> = {};
  if (token) {
    url.searchParams.set("token", token);
    headers["x-feas-token"] = token;
  }
  const res = await fetch(url.toString(), {
    headers,
  });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

async function apiWrite<T>(
  path: string,
  token: string,
  method: "POST" | "PUT" | "DELETE",
  body?: Record<string, unknown>,
): Promise<T> {
  const url = new URL(path, window.location.origin);
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token) {
    url.searchParams.set("token", token);
    headers["x-feas-token"] = token;
  }
  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, token: string, body: Record<string, unknown> = {}): Promise<T> {
  return apiWrite<T>(path, token, "POST", body);
}

export async function apiPut<T>(path: string, token: string, body: Record<string, unknown> = {}): Promise<T> {
  return apiWrite<T>(path, token, "PUT", body);
}

export async function apiDelete<T>(path: string, token: string): Promise<T> {
  return apiWrite<T>(path, token, "DELETE");
}
