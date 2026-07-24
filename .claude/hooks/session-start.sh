#!/bin/bash
set -euo pipefail

# Nur in Claude Code on the web ausführen (lokal macht Rob das selbst)
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Abhängigkeiten für alle drei Pakete (idempotent)
npm install
(cd web && npm install)
(cd designbridge-plugin && npm install)
