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

const cache = new Map<string, { metadata: AuthServerMetadata; fetchedAt: number }>();
const TTL_MS = 5 * 60 * 1000;

export async function discoverAuthServer(instance: string): Promise<AuthServerMetadata> {
  const cached = cache.get(instance);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached.metadata;
  }

  const url = `https://${instance}/.well-known/openid-configuration`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`OIDC discovery failed: HTTP ${res.status} from ${url}`);
  }
  const metadata = (await res.json()) as AuthServerMetadata;
  if (!metadata.authorization_endpoint || !metadata.token_endpoint) {
    throw new Error(`OIDC discovery at ${url} missing authorization_endpoint or token_endpoint`);
  }
  cache.set(instance, { metadata, fetchedAt: Date.now() });
  return metadata;
}
