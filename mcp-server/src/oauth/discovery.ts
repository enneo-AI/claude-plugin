export interface AuthServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  code_challenge_methods_supported?: string[];
  grant_types_supported?: string[];
  response_types_supported?: string[];
  scopes_supported?: string[];
}

let cache: Map<string, { metadata: AuthServerMetadata; fetchedAt: number }> = new Map();
const TTL_MS = 5 * 60 * 1000;

export async function discoverAuthServer(instance: string): Promise<AuthServerMetadata> {
  const cached = cache.get(instance);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached.metadata;
  }

  // Try the standard well-known path first. If Enneo namespaces auth under /api/auth,
  // fall back to that path.
  const candidates = [
    `https://${instance}/.well-known/oauth-authorization-server`,
    `https://${instance}/api/auth/.well-known/oauth-authorization-server`,
  ];

  let lastErr: unknown = null;
  for (const url of candidates) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status} from ${url}`);
        continue;
      }
      const metadata = (await res.json()) as AuthServerMetadata;
      if (!metadata.authorization_endpoint || !metadata.token_endpoint) {
        lastErr = new Error(`Metadata at ${url} missing authorization_endpoint or token_endpoint`);
        continue;
      }
      cache.set(instance, { metadata, fetchedAt: Date.now() });
      return metadata;
    } catch (err) {
      lastErr = err;
    }
  }

  throw new Error(
    `Could not discover OAuth metadata for ${instance}. Tried ${candidates.join(", ")}. Last error: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}
