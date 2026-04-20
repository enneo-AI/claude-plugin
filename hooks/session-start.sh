#!/usr/bin/env bash
# Inject Enneo platform context at session start

CLAUDE_MD="${CLAUDE_PLUGIN_ROOT}/CLAUDE.md"

if [ ! -f "$CLAUDE_MD" ]; then
  exit 0
fi

python3 -c "
import json, sys
content = open(sys.argv[1]).read()
print(json.dumps({
    'hookSpecificOutput': {
        'hookEventName': 'SessionStart',
        'additionalContext': content
    }
}))
" "$CLAUDE_MD"
