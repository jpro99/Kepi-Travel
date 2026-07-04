#!/usr/bin/env bash
set -euo pipefail

echo "Installing Playwright MCP for Claude Code..."
claude mcp add playwright npx @playwright/mcp@latest

echo "Done. Restart Claude Code if needed."
