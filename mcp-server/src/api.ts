import { getAccessToken } from "./oauth/client.js";
import { loadEnv } from "./storage.js";

interface ApiOptions {
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

async function getInstanceOrThrow(): Promise<string> {
  const { instance } = await loadEnv();
  if (!instance) {
    throw new Error(
      "Enneo instance not configured. Call the `enneo_configure` tool first with e.g. {\"instance\": \"demo.enneo.ai\"}.",
    );
  }
  return instance;
}

/**
 * Make an authenticated call to the Enneo Mind API.
 * Transparently handles OAuth — the first call per instance may open a browser.
 */
export async function enneoApi<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const instance = await getInstanceOrThrow();
  const token = await getAccessToken(instance);

  const url = new URL(`https://${instance}/api/mind${path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v === undefined) continue;
      url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  const init: RequestInit = { method: opts.method ?? "GET", headers };
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }

  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${init.method} ${path} -> ${res.status}: ${text.slice(0, 500)}`);
  }
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}
