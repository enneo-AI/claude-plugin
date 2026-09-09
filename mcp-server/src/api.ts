import { loadEnv, normalizeInstance } from "./storage.js";

interface ApiOptions {
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

/** Make an authenticated call with the saved profile API key. */
export async function enneoApi<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  // Read the instance and its key together, even if configure runs concurrently.
  const { instance, access_token: token } = await loadEnv();
  if (!instance) {
    throw new Error(
      "Enneo instance not configured. Call the `enneo_configure` tool first with e.g. {\"instance\": \"demo.enneo.ai\"}.",
    );
  }
  const hostname = normalizeInstance(instance);
  if (!token) {
    throw new Error(
      `No API key saved for ${hostname}. In Enneo, open Profile Settings → Login → API keys. Reuse a saved key for this instance, or create one if needed, then enter it locally as ENNEO_TOKEN in ~/.enneo/env alongside ENNEO_INSTANCE="${hostname}" (mode 600). Do not paste the key into chat.`,
    );
  }

  const url = new URL(`https://${hostname}/api/mind${path}`);
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
  if (res.status === 401) {
    throw new Error(
      `Enneo rejected the saved API key for ${hostname} (401). Check Profile Settings → Login → API keys and update ENNEO_TOKEN in ~/.enneo/env locally if the key has expired or been revoked.`,
    );
  }
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
