import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Unified credential store at ~/.enneo/env — a shell-sourceable file shared
 * by the MCP server and ad-hoc bash/curl usage. One source of truth.
 *
 * Format:
 *   export ENNEO_INSTANCE="demo.enneo.ai"
 *   export ENNEO_TOKEN="..."
 *
 * Users can `. ~/.enneo/env` in any shell; skills' curl examples use this.
 */

export const ENNEO_DIR = join(homedir(), ".enneo");
export const ENV_FILE = join(ENNEO_DIR, "env");

export interface EnneoEnv {
  instance?: string;
  access_token?: string;
}

const KEY_MAP = {
  instance: "ENNEO_INSTANCE",
  access_token: "ENNEO_TOKEN",
} as const;

export function normalizeInstance(value: string): string {
  const instance = value.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "").toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(instance)) {
    throw new Error("Invalid instance hostname. Use a hostname such as demo.enneo.ai, without a path or credentials.");
  }
  return instance;
}

export async function loadEnv(): Promise<EnneoEnv> {
  let raw: string;
  try {
    raw = await fs.readFile(ENV_FILE, "utf8");
  } catch (err: any) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
  const values: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    // Match:  export KEY="value"   or   KEY="value"   or   KEY=value
    const m = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(.*))\s*$/);
    if (!m) continue;
    const key = m[1];
    const value = m[2] ?? m[3] ?? m[4] ?? "";
    values[key] = value;
  }
  return {
    instance: values[KEY_MAP.instance] || undefined,
    access_token: values[KEY_MAP.access_token] || undefined,
  };
}

export async function saveEnv(env: EnneoEnv): Promise<void> {
  await fs.mkdir(ENNEO_DIR, { recursive: true, mode: 0o700 });
  const lines: string[] = [];
  if (env.instance) lines.push(`export ${KEY_MAP.instance}="${shellEscape(env.instance)}"`);
  if (env.access_token) lines.push(`export ${KEY_MAP.access_token}="${shellEscape(env.access_token)}"`);
  const content = lines.join("\n") + "\n";

  // Atomic write: tmp + rename, mode 600.
  const tmp = `${ENV_FILE}.tmp-${randomUUID()}`;
  try {
    await fs.writeFile(tmp, content, { mode: 0o600 });
    await fs.rename(tmp, ENV_FILE);
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

function shellEscape(value: string): string {
  // We wrap in double quotes — escape the chars that are special inside "..."
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$").replace(/`/g, "\\`");
}
