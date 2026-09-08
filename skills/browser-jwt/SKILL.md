---
name: browser-jwt
description: Obtain, store or revoke an Enneo API key (JWT) for a signed-in instance — required before any curl-based Enneo API call; supports multiple instances.
---

# Enneo API Key (Browser JWT)

## Trigger

Use when:
- The user needs a token for an Enneo instance they are signed into in their browser.
- Juggling tokens for **multiple** Enneo instances.
- An Enneo API call returns `401` / `403`, or the cached token is expired, revoked or missing.
- The user wants to list or withdraw the keys on their account.
- User phrases: "unauthorized", "token expired", "refresh jwt", "new api key", "how do I auth to `<instance>`".

## Prerequisites

1. **Claude Code** with this plugin loaded.
2. A browser where the user is signed in to the target Enneo instance.

## What an Enneo API key is

A signed JWT whose payload carries `userId` and a per-token `jti`. Enneo keeps only a **hash** of it plus the last 6 characters, so:

- The full key is shown **exactly once**, at creation. It cannot be read back — a lost key is replaced, not recovered.
- Keys minted from the profile page expire after **1 year**. Some machine-issued keys carry no `exp` claim at all, so **never assume the payload has one**.
- Withdrawing a key takes effect immediately; every call with it fails from that moment.
- Keys are named, so a name that says where the key lives ("laptop — Claude Code") is worth asking for.

## Storage

`~/.enneo/browser-tokens.json`, mode `600`, keyed by origin:

```json
{
  "https://demo.enneo.ai": {
    "token": "eyJ...",
    "exp": 1793923200,
    "userId": 1,
    "issuedAt": "2026-04-23T10:00:00Z"
  },
  "https://another-instance.enneo.ai": { "...": "..." }
}
```

- `exp` is the `exp` claim decoded from the JWT payload (base64url middle segment), or `null` when the key does not expire.
- Refresh proactively when `exp` is set and `exp - now < 86400` (24 h). A `null` `exp` never triggers a refresh.
- Atomic write (tmp + rename), mode `600`.
- Never `cat` or print the file / full token. Mask as `eyJ…<last-6>` in responses — the last 6 characters are what Enneo itself shows, so they identify a key without exposing one.

## Flow

1. **Resolve origin** from the user's request (e.g. `demo.enneo.ai` → `https://demo.enneo.ai`).
2. **Cache check.** Read `~/.enneo/browser-tokens.json` (create `{}` if missing). If the origin record has `exp == null`, or `exp - now > 86400`, skip to step 4.
3. **Ask the user to mint a key in the Enneo UI** and paste it here:

   > Open `<origin>/settings/profile` in your already-authenticated browser. In the **Login** section, open **API keys** — it slides out on the right. Create a key, give it a name you will recognise later, and paste the value here. Enneo shows it only once.

   If they are not signed in, ask them to sign in to `<origin>` first; do not attempt to log them in yourself. Creating a key on one's own profile needs the `createApiToken` permission — if the panel offers no create button, that permission is missing and an administrator has to issue the key instead.
4. **Decode and store.** Decode the pasted JWT's payload for `exp` and `userId`, then merge into `~/.enneo/browser-tokens.json`, preserving other origins:

   ```bash
   ORIGIN="https://demo.enneo.ai"
   TOKEN="eyJ..."        # the key the user pasted
   EXP=$(node -p "JSON.parse(Buffer.from(process.argv[1].split('.')[1],'base64url')).exp ?? null" "$TOKEN")
   USERID=$(node -p "JSON.parse(Buffer.from(process.argv[1].split('.')[1],'base64url')).userId ?? null" "$TOKEN")
   IAT=$(date -u +%FT%TZ)

   [ -f ~/.enneo/browser-tokens.json ] || { mkdir -p ~/.enneo && echo '{}' > ~/.enneo/browser-tokens.json && chmod 700 ~/.enneo && chmod 600 ~/.enneo/browser-tokens.json; }
   jq --arg o "$ORIGIN" --arg t "$TOKEN" --argjson exp "$EXP" --argjson uid "$USERID" --arg iat "$IAT" \
      '.[$o] = {token: $t, exp: $exp, userId: $uid, issuedAt: $iat}' \
      ~/.enneo/browser-tokens.json > ~/.enneo/browser-tokens.json.tmp-$$ \
      && mv ~/.enneo/browser-tokens.json.tmp-$$ ~/.enneo/browser-tokens.json
   chmod 600 ~/.enneo/browser-tokens.json
   ```

5. **Use the token:**

   ```bash
   ORIGIN="https://demo.enneo.ai"
   TOKEN=$(jq -r --arg o "$ORIGIN" '.[$o].token' ~/.enneo/browser-tokens.json)
   curl -s "${ORIGIN}/api/mind/profile" -H "Authorization: Bearer ${TOKEN}"
   ```

   `enneo_profile_me` does the same check through the MCP server and is the preferred way to confirm a token works.

## Managing keys over the API

Once a working token exists, the whole key lifecycle is reachable without the UI. `{profileId}` is the numeric profile id — your own, or someone else's with `updateSpecificProfile` (plus `manageServiceWorkers` when the target is a service-worker profile).

```bash
# List the keys on a profile — the key itself is never returned, only its last characters
curl -s "${ORIGIN}/api/mind/jwt/{profileId}/keys" -H "Authorization: Bearer ${TOKEN}" \
  | jq '.keys[] | {id, name, tokenSuffix, createdAt, expiresAt, lastUsedAt, revokedAt, revokedBy, issuedBy}'

# Mint a named key (REQUIRES CONFIRMATION) — the response is the only time the value is shown
curl -s -X POST "${ORIGIN}/api/mind/jwt/{profileId}" \
  -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
  -d '{"name": "laptop — Claude Code"}' | jq -r '.token'

# Withdraw a key (REQUIRES CONFIRMATION) — effective immediately
curl -s -X DELETE "${ORIGIN}/api/mind/jwt/{profileId}/keys/{keyId}" -H "Authorization: Bearer ${TOKEN}"
```

`lastUsedAt` and `revokedAt` are the two fields worth reading when debugging a `401`: a key that was never used points at a copy/paste error, one with `revokedAt` set was withdrawn.

## Acting on someone's behalf

Enneo honours `X-Enneo-On-Behalf-Of: {profileId}` on its API. Mind evaluates the request's permissions as that person; auth records them against the key. It grants nothing on its own — a caller naming a profile gains no access it did not already have — but it keeps a machine account's calls attributable instead of anonymous. Set it whenever a key issued for automation acts for a specific human.

## Edge cases

- **Multiple accounts per origin.** One token per origin; switching overwrites. Cached `userId` reflects the current account.
- **Not signed in.** The user cannot reach Profile Settings without signing in — ask them to sign in first. Do not retry automatically.
- **`401` on a token that used to work.** The key was withdrawn, or it expired. Check the key list for `revokedAt` / `expiresAt`; both mean minting a new one, not retrying.
- **`403` where `401` was expected.** The token is valid but the profile lacks the permission for that endpoint — a different failure, and re-minting will not fix it.
