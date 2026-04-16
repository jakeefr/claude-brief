#!/usr/bin/env bash
# claude-brief SessionEnd hook
# Receives JSON on stdin, triggers JSONL parsing

INPUT=$(cat)
TRANSCRIPT_PATH=$(echo "$INPUT" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));process.stdout.write(d.transcript_path||'')")
SESSION_ID=$(echo "$INPUT" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));process.stdout.write(d.session_id||'')")

if [ -n "$TRANSCRIPT_PATH" ] && [ -n "$SESSION_ID" ]; then
  # Write trigger file -- claude-brief watcher picks this up
  TRIGGER_DIR="${HOME}/.claude-brief/triggers"
  mkdir -p "$TRIGGER_DIR"
  echo "{\"transcriptPath\":\"$TRANSCRIPT_PATH\",\"sessionId\":\"$SESSION_ID\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" \
    > "$TRIGGER_DIR/${SESSION_ID}.json"
fi
