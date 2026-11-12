#!/bin/sh
# Installs this repo's Pi customizations (theme, extensions, keybindings, AGENTS.md)
# into a Pi agent directory. Safe to re-run; existing files are backed up first.
set -eu

AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
REPO_DIR=$(cd "$(dirname "$0")" && pwd)
TUI_MODE="${PI_TUI_MODE:-regular}"
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP="$AGENT_DIR/backups/pi-tweaks-$STAMP"

echo "agent dir: $AGENT_DIR"

mkdir -p "$AGENT_DIR/extensions" "$AGENT_DIR/themes"

# 1. Back up whatever this repo overwrites.
for item in settings.json keybindings.json AGENTS.md themes extensions/omp-appearance extensions/omp-editor extensions/pi-statusline; do
  if [ -e "$AGENT_DIR/$item" ]; then
    mkdir -p "$BACKUP/$(dirname "$item")"
    cp -a "$AGENT_DIR/$item" "$BACKUP/$item"
  fi
done
echo "backup:    $BACKUP"

# 2. Copy files. extensions/omp-appearance/node_modules is installed, not copied.
mkdir -p "$AGENT_DIR/extensions/omp-appearance"
cp "$REPO_DIR/extensions/omp-appearance/index.ts" "$AGENT_DIR/extensions/omp-appearance/"
cp "$REPO_DIR/extensions/omp-appearance/package.json" "$AGENT_DIR/extensions/omp-appearance/"
cp "$REPO_DIR/extensions/omp-appearance/package-lock.json" "$AGENT_DIR/extensions/omp-appearance/"
cp "$REPO_DIR/extensions/omp-appearance/README.md" "$AGENT_DIR/extensions/omp-appearance/"
cp "$REPO_DIR/extensions/omp-appearance/verify.mjs" "$AGENT_DIR/extensions/omp-appearance/"
cp "$REPO_DIR/extensions/omp-appearance/OMP-LICENSE" "$AGENT_DIR/extensions/omp-appearance/"

for ext in pi-statusline omp-editor; do
  mkdir -p "$AGENT_DIR/extensions/$ext"
  cp "$REPO_DIR/extensions/$ext/index.ts" "$AGENT_DIR/extensions/$ext/"
done

cp "$REPO_DIR/themes/omp-dark.json" "$AGENT_DIR/themes/"
cp "$REPO_DIR/keybindings.json" "$AGENT_DIR/keybindings.json"
[ -f "$AGENT_DIR/AGENTS.md" ] || cp "$REPO_DIR/AGENTS.md" "$AGENT_DIR/AGENTS.md"

# 3. Mermaid renderer dependency (network required once).
if [ ! -d "$AGENT_DIR/extensions/omp-appearance/node_modules/@vercel/beautiful-mermaid" ]; then
  echo "installing extension dependency..."
  npm install --prefix "$AGENT_DIR/extensions/omp-appearance" --omit=dev --no-audit --no-fund --ignore-scripts
fi

# 4. Merge the settings keys this repo owns.
if ! command -v node >/dev/null 2>&1; then
  echo "node not found: edit $AGENT_DIR/settings.json manually (see README)" >&2
else
  node "$REPO_DIR/settings.merge.mjs" "$AGENT_DIR/settings.json" "$TUI_MODE"
fi

# 5. MCP servers are device-specific; only seed an example when none exists.
if [ ! -f "$AGENT_DIR/mcp.json" ] && [ -f "$REPO_DIR/examples/mcp.json" ]; then
  cp "$REPO_DIR/examples/mcp.json" "$AGENT_DIR/mcp.json"
  echo "mcp:       seeded from examples/mcp.json (edit paths and keys)"
fi

cat <<EOF

done. next steps:
  1. restart pi (or run /reload) so extensions and the theme load
  2. verify:  node "$AGENT_DIR/extensions/omp-appearance/verify.mjs"
  3. undo:    copy files back from $BACKUP
EOF
