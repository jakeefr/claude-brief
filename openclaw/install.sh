#!/usr/bin/env bash
set -euo pipefail
REPO="jakeefr/claude-brief"
INSTALL_DIR="${HOME}/.openclaw/plugins/claude-brief"
echo "Installing claude-brief OpenClaw gateway..."
command -v git >/dev/null 2>&1 || { echo "Error: git required"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Error: node 18+ required"; exit 1; }
if [ -d "$INSTALL_DIR" ]; then
  cd "$INSTALL_DIR" && git pull origin main
else
  git clone --depth 1 "https://github.com/${REPO}.git" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR/openclaw"
npm install && npm run build
echo ""
echo "claude-brief installed. Add to ~/.openclaw/config.yaml:"
echo "  plugins:"
echo "    claude-brief:"
echo "      deliveryChannel: telegram"
echo "      deliveryTo: \"YOUR_CHAT_ID\""
echo "Then: openclaw restart"
echo "Test: send /brief to your bot"
