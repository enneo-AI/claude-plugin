# Connect to Enneo Instance

## Trigger
Use at session start, when the user wants to connect to a new Enneo instance, switch instances, or verify their connection.

## OAuth 2.0 Flow

Enneo uses OAuth 2.0 with PKCE (RFC 7636) and loopback redirection (RFC 8252). The plugin runs the full flow automatically — the user only needs to log in through their browser.

### 1. Ask for the instance
```
Which Enneo instance do you want to connect to? (e.g. demo.enneo.ai)
```

### 2. Run the OAuth flow

Execute this block as a single bash command. It:
1. Generates a random `state` (CSRF) and PKCE `code_verifier` / `code_challenge`
2. Starts a local HTTP server on `127.0.0.1:9999` to receive the callback
3. Opens the authorize URL in the user's browser
4. Verifies the returned state and exchanges the code for an access token
5. Persists the instance + token to `~/.enneo/env` with mode 600

```bash
ENNEO_INSTANCE="<INSTANCE>"   # e.g. demo.enneo.ai

# CSRF state + PKCE
STATE=$(openssl rand -hex 16)
CODE_VERIFIER=$(openssl rand -base64 64 | tr -d '=+/' | head -c 64)
CODE_CHALLENGE=$(printf '%s' "$CODE_VERIFIER" | openssl dgst -sha256 -binary | base64 | tr '/+' '_-' | tr -d '=')

AUTHORIZE_URL="https://${ENNEO_INSTANCE}/api/auth/v1/oauth2/authorize?client_id=enneo-claude-plugin&redirect_uri=http://127.0.0.1:9999/callback&response_type=code&state=${STATE}&scope=openid+profile+email&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256"

# Start one-shot local callback server (background)
CALLBACK_FILE=$(mktemp)
python3 - <<PY &
import http.server, socketserver, urllib.parse, sys
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        q = urllib.parse.urlparse(self.path).query
        open("${CALLBACK_FILE}", "w").write(q)
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(b"<h1>Authorized. You can close this tab and return to Claude.</h1>")
        sys.exit(0)
    def log_message(self, *a): pass
socketserver.TCPServer(("127.0.0.1", 9999), H).handle_request()
PY
CALLBACK_PID=$!

# Open the browser
echo "Opening browser for authorization..."
echo "If it doesn't open, visit: $AUTHORIZE_URL"
(xdg-open "$AUTHORIZE_URL" 2>/dev/null || open "$AUTHORIZE_URL" 2>/dev/null) &

# Wait for the callback
wait $CALLBACK_PID 2>/dev/null

# Parse returned state + code
CB=$(cat "$CALLBACK_FILE"); rm -f "$CALLBACK_FILE"
RECEIVED_STATE=$(echo "$CB" | tr '&' '\n' | sed -n 's/^state=//p')
CODE=$(echo "$CB" | tr '&' '\n' | sed -n 's/^code=//p')
ERROR=$(echo "$CB" | tr '&' '\n' | sed -n 's/^error=//p')

if [ -n "$ERROR" ]; then echo "Authorization error: $ERROR"; exit 1; fi
if [ "$RECEIVED_STATE" != "$STATE" ]; then echo "State mismatch — possible CSRF. Aborting."; exit 1; fi

# Exchange code for access token
TOKEN_RESPONSE=$(curl -sf -X POST "https://${ENNEO_INSTANCE}/api/auth/v1/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=authorization_code" \
  --data-urlencode "code=${CODE}" \
  --data-urlencode "redirect_uri=http://127.0.0.1:9999/callback" \
  --data-urlencode "client_id=enneo-claude-plugin" \
  --data-urlencode "code_verifier=${CODE_VERIFIER}")
ENNEO_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')
[ -z "$ENNEO_TOKEN" ] || [ "$ENNEO_TOKEN" = "null" ] && { echo "Token exchange failed: $TOKEN_RESPONSE"; exit 1; }

# Persist for subsequent commands in this session
mkdir -p ~/.enneo
umask 077
cat > ~/.enneo/env <<EOF
export ENNEO_INSTANCE="${ENNEO_INSTANCE}"
export ENNEO_TOKEN="${ENNEO_TOKEN}"
EOF
chmod 600 ~/.enneo/env
echo "Credentials saved to ~/.enneo/env"
```

### 3. Verify connection

```bash
. ~/.enneo/env

# Health
curl -sf "https://${ENNEO_INSTANCE}/api/mind/health" -H "Authorization: Bearer ${ENNEO_TOKEN}" > /dev/null && echo "Health OK"

# Identity
curl -s "https://${ENNEO_INSTANCE}/api/mind/profile" -H "Authorization: Bearer ${ENNEO_TOKEN}" | jq '{id, email, firstName, lastName, type}'

# Version
curl -s "https://${ENNEO_INSTANCE}/api/mind/version" -H "Authorization: Bearer ${ENNEO_TOKEN}"
```

### 4. Confirm to user
Report: instance, user identity, and version. Ready to work.

---

## Subsequent Commands

Every subsequent API call must load the env first:

```bash
. ~/.enneo/env && curl -s "https://${ENNEO_INSTANCE}/api/mind/..." -H "Authorization: Bearer ${ENNEO_TOKEN}"
```

Or prefix once per tool call. Never echo or display `ENNEO_TOKEN`.

## Switching Instances

Re-run the OAuth flow with the new instance. It overwrites `~/.enneo/env`.

## Disconnect

```bash
rm -f ~/.enneo/env
```

## OAuth Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/auth/v1/oauth2/authorize` | Authorization endpoint (browser flow) |
| `/api/auth/v1/oauth2/token` | Token exchange endpoint |

| OAuth param | Value |
|-------------|-------|
| `client_id` | `enneo-claude-plugin` |
| `redirect_uri` | `http://127.0.0.1:9999/callback` |
| `response_type` | `code` |
| `scope` | `openid profile email` |
| `code_challenge_method` | `S256` |

## Troubleshooting

- **"Address already in use" on port 9999** — another OAuth flow is in progress. Kill with `fuser -k 9999/tcp` and retry.
- **Browser doesn't open** — the script prints the URL; open it manually.
- **State mismatch** — the returned `state` didn't match; re-run the flow.
- **Token exchange fails** — the authorization code is single-use and expires quickly (~60s). Re-run the flow.
