const cache = new Map();
const TTL_MS = 5 * 60 * 1000;
export async function discoverAuthServer(instance) {
    const cached = cache.get(instance);
    if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
        return cached.metadata;
    }
    const url = `https://${instance}/.well-known/openid-configuration`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
        throw new Error(`OIDC discovery failed: HTTP ${res.status} from ${url}`);
    }
    const metadata = (await res.json());
    if (!metadata.authorization_endpoint || !metadata.token_endpoint) {
        throw new Error(`OIDC discovery at ${url} missing authorization_endpoint or token_endpoint`);
    }
    cache.set(instance, { metadata, fetchedAt: Date.now() });
    return metadata;
}
