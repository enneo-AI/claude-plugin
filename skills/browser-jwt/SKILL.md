---
name: browser-jwt
description: Set up or reuse a saved Enneo profile API key locally, switch the active instance, or troubleshoot authentication for native tools and curl.
---

# Enneo Profile API Key

## Trigger

Use when an Enneo instance/key is not configured, the user wants to switch instances or manage their keys, or an API call reports an authentication error.

## Reuse first

Native tools and curl use **one active instance/key pair** in `~/.enneo/env` (mode 600):

```bash
export ENNEO_INSTANCE="demo.enneo.ai"
export ENNEO_TOKEN="<profile API key>"
```

Reuse the saved key for the requested instance. Confirm the connection with `enneo_profile_me`; do not read the credential file into the conversation. Missing or unknown JWT `exp` does not imply an invalid key, and no local expiry metadata is required. Enneo validates the key when it is used.

Do not open a browser, perform OAuth discovery/exchange, renew keys automatically, or ask the user to paste a secret into chat. A `401` requires checking the configured instance and key; a `403` requires checking permissions rather than automatically issuing another key.

## Local setup

1. Resolve the instance hostname from the user's request and call `enneo_configure`. Configuring the same instance retains its key. Switching instances clears it. A `reset: true` request clears the local key without revoking it in Enneo.
2. If no key is saved, ask the user to reuse a key they already hold for that instance. If it is in the legacy browser cache, use the migration below. A new key is needed only if no usable saved key is available.
3. To create a key, direct the user to **Profile Settings → Login → API keys** on their instance. They sign in themselves if needed and create a named key. Enneo displays the full key only once. Creating a key requires `createApiToken`; an administrator can issue one if that permission is missing.
4. The user enters the key **locally in a text editor**, alongside the matching hostname in `~/.enneo/env`, using the format above. They can prepare the file without displaying a key:

   ```bash
   mkdir -p ~/.enneo
   chmod 700 ~/.enneo
   touch ~/.enneo/env
   chmod 600 ~/.enneo/env
   ```

5. Call `enneo_profile_me` to confirm the connection. Report the instance and returned profile ID, not the token. Native tools reread the file on every call, so editing it requires no restart.

Do not change only `ENNEO_INSTANCE` while leaving the old instance's key in place. Use `enneo_configure` to switch safely, then enter the matching key locally.

## Reuse a legacy browser cache

Older versions saved keys by origin in `~/.enneo/browser-tokens.json`. The plugin now reads `~/.enneo/env`; it does not automatically import the old file. The user can run this **once in their own terminal**, after setting `ORIGIN` to the exact saved HTTPS origin. It copies only that origin's key, replaces the active env pair, and prints no credentials. It leaves the legacy cache unchanged and does not issue a new key.

```bash
umask 077
ORIGIN="https://demo.enneo.ai"
mkdir -p ~/.enneo
chmod 700 ~/.enneo
enneo_tmp=$(mktemp ~/.enneo/env.XXXXXX)
if jq -er --arg origin "$ORIGIN" '
  .[$origin].token as $token
  | if ($token | type) != "string" or ($token | length) == 0 then
      error("No saved key for that origin")
    else
      "export ENNEO_INSTANCE=\($origin | ltrimstr("https://") | @sh)\nexport ENNEO_TOKEN=\($token | @sh)"
    end
' ~/.enneo/browser-tokens.json > "$enneo_tmp"; then
  mv "$enneo_tmp" ~/.enneo/env
else
  rm "$enneo_tmp"
fi
```

Native tools ignore old refresh/expiry entries in an existing env file. Only `ENNEO_INSTANCE` and `ENNEO_TOKEN` are needed.

## curl usage

After confirming the active instance matches the request, source the file without displaying it:

```bash
. ~/.enneo/env
BASE="https://${ENNEO_INSTANCE}/api/mind"
AUTH="Authorization: Bearer ${ENNEO_TOKEN}"
curl -s "${BASE}/profile" -H "${AUTH}"
```

## Managing keys

Profile Settings → Login → API keys lists named keys and allows creating or withdrawing them. Enneo stores a hash and suffix rather than the full value; a lost key cannot be read back. Some machine-issued keys have no expiry. A withdrawn key stops working immediately.

For explicit API key-management requests, the existing endpoints remain available. `{profileId}` is your profile, or another profile with the required `updateSpecificProfile` permission (plus `manageServiceWorkers` for a service-worker profile):

```bash
# List key metadata without retrieving the key itself
curl -s "${BASE}/jwt/{profileId}/keys" -H "${AUTH}" \
  | jq '.keys[] | {id, name, tokenSuffix, createdAt, expiresAt, lastUsedAt, revokedAt, revokedBy, issuedBy}'

# Withdraw a key only when the user has authorized that action
curl -s -X DELETE "${BASE}/jwt/{profileId}/keys/{keyId}" -H "${AUTH}"
```

`POST /api/mind/jwt/{profileId}` with `{"name":"..."}` creates a key and returns its full value once. Do not call it to repair authentication automatically or print its response into chat; use the local UI setup above for this plugin's key.

## Acting on someone's behalf

Enneo honours `X-Enneo-On-Behalf-Of: {profileId}` on its API. Mind evaluates the request's permissions as that person; auth records them against the key. It grants nothing on its own, but keeps a machine account's calls attributable. Set it when an automation key acts for a specific human.
