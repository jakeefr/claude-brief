---
name: brief
description: "Generate an activity digest: what Claude did since you last checked"
version: 1.0.0
security:
  allowedTools:
    - Read
    - Glob
    - Bash
  blockedTools:
    - Edit
    - Write
    - Agent
  maxTurns: 10
---

# Brief -- Agent Activity Digest

You are generating an activity digest from Claude Code session data.

## Steps

1. Run: `claude-brief --format json --since last` to get session data as JSON
2. If claude-brief is not installed, read JSONL files directly from ~/.claude/projects/
   - Find files modified in the last 24 hours
   - Extract session duration, project, files changed, model, cost estimate
3. Format the digest using the standard brief format

## Output format

Brief (DATE TIME) -- since TIMEAGO
================================

N sessions . N projects . ~$X.XX . Nk tokens

. project-name   Ndmin . N files . model . $X.XX
  Description of what happened

x project-name   Ndmin . FAILED: reason

Pending:
- Any TODOs or blocked work found

---
If no activity: "No agent activity since [time]. Last session was [timeago]."
Be concise. One line per session. Highlight failures.
