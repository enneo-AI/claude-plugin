# Connect to Enneo Instance

## Trigger
Use when the user wants to connect to an Enneo instance, switch instances, or verify their connection.

## Connection Flow

### 1. Ask for instance
```
Which Enneo instance do you want to connect to? (e.g. demo.enneo.ai, customer-name.enneo.ai)
```

### 2. Ask for token
```
Please provide your API token. You can get it by:
1. Log into https://<instance>
2. Navigate to https://<instance>/api/mind/profile/showAccessToken
3. Copy and paste the token here

Alternatively, get a cross-environment token from https://admin.enneo.ai/token
```

### 3. Set environment variables
```bash
export ENNEO_INSTANCE="<instance>"
export ENNEO_TOKEN="<token>"
```

### 4. Verify connection
```bash
# Health check
curl -sf "https://${ENNEO_INSTANCE}/api/mind/health" -H "Authorization: Bearer ${ENNEO_TOKEN}"

# Verify identity
curl -s "https://${ENNEO_INSTANCE}/api/mind/profile" -H "Authorization: Bearer ${ENNEO_TOKEN}" | jq '{id, email, firstName, lastName, type}'

# Check version
curl -s "https://${ENNEO_INSTANCE}/api/mind/version" -H "Authorization: Bearer ${ENNEO_TOKEN}"
```

### 5. Confirm to user
Report: connected instance, user identity, and version. Ready to work.

## Token Notes

- Tokens from `admin.enneo.ai/token` work across **all** client environments
- Tokens from `/api/mind/profile/showAccessToken` work only on that specific instance
- Tokens are user-specific — never reuse across users

## Switching Instances
Re-export the variables with new values and re-verify.

## Quick Connectivity Test
```bash
curl -sf "https://${ENNEO_INSTANCE}/api/mind/health" -H "Authorization: Bearer ${ENNEO_TOKEN}" && echo "Connected" || echo "Failed"
```
