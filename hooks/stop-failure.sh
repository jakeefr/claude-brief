#!/usr/bin/env bash
# claude-brief StopFailure hook
# Records error_type for failed sessions

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));process.stdout.write(d.session_id||'')")
ERROR_TYPE=$(echo "$INPUT" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));process.stdout.write(d.error_type||'unknown')")

if [ -n "$SESSION_ID" ]; then
  TRIGGER_DIR="${HOME}/.claude-brief/triggers"
  mkdir -p "$TRIGGER_DIR"
  echo "{\"sessionId\":\"$SESSION_ID\",\"errorType\":\"$ERROR_TYPE\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"isFailure\":true}" \
    > "$TRIGGER_DIR/fail-${SESSION_ID}.json"
fi
