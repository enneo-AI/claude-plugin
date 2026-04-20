import open from "open";
import { discoverAuthServer } from "./discovery.js";
import { generatePkce, generateState } from "./pkce.js";
import { startLoopback } from "./loopback.js";
import { loadEnv, updateEnv, isExpired } from "../storage.js";
// Public client ID baked into the plugin. PKCE provides the security —
// a client secret would be useless in a distributed binary anyway.
const CLIENT_ID = "enneo-claude-plugin";
// Enneo's OAuth server issues refresh tokens on authorization_code unconditionally,
// so offline_access is not required (and is not in the advertised scopes).
const SCOPES = "openid profile email";
/**
 * Get a valid access token for the given instance.
 * - Returns cached token if still valid
 * - Silently refreshes if expired but refresh_token is available
 * - Falls back to full browser flow (PKCE + loopback) otherwise
 */
export async function getAccessToken(instance) {
    const env = await loadEnv();
    // Cached token still valid for this instance?
    if (env.instance === instance && env.access_token && !isExpired(env.expires_at)) {
        return env.access_token;
    }
    // Try refresh if we have a refresh token for this instance.
    if (env.instance === instance && env.refresh_token) {
        try {
            const refreshed = await refresh(instance, env.refresh_token);
            await updateEnv({
                instance,
                access_token: refreshed.access_token,
                refresh_token: refreshed.refresh_token ?? env.refresh_token,
                expires_at: refreshed.expires_at,
            });
            return refreshed.access_token;
        }
        catch (err) {
            console.error(`[enneo-mcp] refresh failed, starting full flow: ${err}`);
        }
    }
    // Full browser OAuth flow.
    const tokens = await authorize(instance);
    await updateEnv({
        instance,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expires_at,
    });
    return tokens.access_token;
}
async function refresh(instance, refreshToken) {
    const metadata = await discoverAuthServer(instance);
    const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
    });
    const res = await fetch(metadata.token_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
    });
    if (!res.ok) {
        throw new Error(`Refresh failed: ${res.status} ${await res.text()}`);
    }
    return normalizeTokens(await res.json(), refreshToken);
}
async function authorize(instance) {
    const metadata = await discoverAuthServer(instance);
    const { verifier, challenge } = generatePkce();
    const state = generateState();
    const { redirectUri, done } = await startLoopback();
    const authUrl = new URL(metadata.authorization_endpoint);
    authUrl.searchParams.set("client_id", CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    console.error(`[enneo-mcp] opening browser: ${authUrl.toString()}`);
    open(authUrl.toString()).catch((err) => {
        console.error(`[enneo-mcp] could not open browser automatically: ${err}`);
        console.error(`[enneo-mcp] open manually: ${authUrl.toString()}`);
    });
    const { code, state: returnedState } = await done;
    if (returnedState !== state) {
        throw new Error("OAuth state mismatch — possible CSRF");
    }
    const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: CLIENT_ID,
        code_verifier: verifier,
    });
    const res = await fetch(metadata.token_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
    });
    if (!res.ok) {
        throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
    }
    return normalizeTokens(await res.json());
}
function normalizeTokens(raw, fallbackRefresh) {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = typeof raw.expires_in === "number" ? raw.expires_in : 3600;
    return {
        access_token: raw.access_token,
        refresh_token: raw.refresh_token ?? fallbackRefresh,
        expires_at: now + expiresIn,
    };
}
