---
name: browser-jwt
description: Obtain or refresh a JWT from a logged-in browser session — required before any curl-based Enneo API call; supports multiple instances.
---

# Enneo Browser JWT

## Trigger

Use when:
- The user wants a JWT for an Enneo instance they are signed into in their browser.
- Juggling tokens for **multiple** Enneo instances.
- An Enneo API call returns `401` / `403`, or the cached token is expired / missing.
- User phrases: "unauthorized", "token expired", "refresh jwt", "new token", "how do I auth to `<instance>`".

## Prerequisites

1. **Claude Code** with this plugin loaded.
2. A browser where the user is signed in to the target Enneo instance.

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

- `exp` is the `exp` claim decoded from the JWT payload (base64url middle segment).
- Refresh proactively when `exp - now < 86400` (24 h).
- Atomic write (tmp + rename), mode `600`.
- Never `cat` or print the file / full token. Mask as `eyJ…<last-8>` in responses.

## Flow

1. **Resolve origin** from the user's request (e.g. `demo.enneo.ai` → `https://demo.enneo.ai`).
2. **Cache check.** Read `~/.enneo/browser-tokens.json` (create `{}` if missing). If the origin record has `exp - now > 86400`, skip to step 5.
3. **Ask the user to open two URLs in their already-authenticated browser** and paste the second response back:

   1. `<origin>/api/auth/v1/profile` — shows their user `id` in the JSON.
   2. `<origin>/api/mind/jwt/<id>` — returns `{"token": "eyJ..."}`.

   If either URL returns `401` / `403`, surface it and ask the user to sign in to `<origin>` first. Do not attempt to log them in yourself.
4. **Decode and store.** Take the `token` field from the pasted JSON, decode the JWT payload (base64url middle segment) for `exp` and `userId`, then merge into `~/.enneo/browser-tokens.json`, preserving other origins:

   ```bash
   ORIGIN="https://demo.enneo.ai"
   TOKEN="eyJ..."        # from the user's pasted JSON
   EXP=$(node -p "JSON.parse(Buffer.from(process.argv[1].split('.')[1],'base64url')).exp" "$TOKEN")
   USERID=$(node -p "JSON.parse(Buffer.from(process.argv[1].split('.')[1],'base64url')).userId ?? null" "$TOKEN")
   IAT=$(date -u +%FT%TZ)

   [ -f ~/.enneo/browser-tokens.json ] || { mkdir -p ~/.enneo && echo '{}' > ~/.enneo/browser-tokens.json && chmod 700 ~/.enneo && chmod 600 ~/.enneo/browser-tokens.json; }
   jq --arg o "$ORIGIN" --arg t "$TOKEN" --argjson exp $EXP --argjson uid $USERID --arg iat "$IAT" \
      '.[$o] = {token: $t, exp: $exp, userId: $uid, issuedAt: $iat}' \
      ~/.enneo/browser-tokens.json > ~/.enneo/browser-tokens.json.tmp-$$ \
      && mv ~/.enneo/browser-tokens.json.tmp-$$ ~/.enneo/browser-tokens.json
   chmod 600 ~/.enneo/browser-tokens.json
   ```

5. **Use the token:**

   ```bash
   ORIGIN="https://demo.enneo.ai"
   TOKEN=$(jq -r --arg o "$ORIGIN" '.[$o].token' ~/.enneo/browser-tokens.json)
   curl -s "${ORIGIN}/api/auth/v1/session" -H "Authorization: Bearer ${TOKEN}"
   ```

## Edge cases

- **Multiple accounts per origin.** One token per origin; switching overwrites. Cached `userId` reflects the current account.
- **Not logged in.** The profile URL returns `401` / `403` — surface it and ask the user to sign in. Do not retry automatically.
