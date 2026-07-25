#!/bin/bash
set -eu -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
E2E_VAULT_DIR="$SCRIPT_DIR/vault"
OBSIDIAN_JSON="$HOME/.var/app/md.obsidian.Obsidian/config/obsidian/obsidian.json"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [[ ! -d "$E2E_VAULT_DIR" ]]; then
    echo -e "${RED}Error:${NC} E2E vault not found. Run 'npm run e2e:setup' first."
    exit 1
fi

# Make sure Obsidian is fully closed before modifying config
if pgrep -f "obsidian" > /dev/null 2>&1; then
    echo -e "${YELLOW}Obsidian is currently running.${NC}"
    echo "Please close all Obsidian windows first, then re-run this command."
    echo "(Obsidian overwrites its config on exit, so we need it closed.)"
    exit 1
fi

# Register the vault in Obsidian's vault registry
if [[ -f "$OBSIDIAN_JSON" ]]; then
    if ! grep -q "$E2E_VAULT_DIR" "$OBSIDIAN_JSON" 2>/dev/null; then
        echo -e "${GREEN}[INFO]${NC} Registering vault with Obsidian..."
        VAULT_HASH=$(echo -n "$E2E_VAULT_DIR" | md5sum | cut -c1-16)
        TIMESTAMP=$(date +%s)000
        python3 -c "
import json
with open('$OBSIDIAN_JSON', 'r') as f:
    data = json.load(f)
data['vaults']['$VAULT_HASH'] = {'path': '$E2E_VAULT_DIR', 'ts': $TIMESTAMP}
with open('$OBSIDIAN_JSON', 'w') as f:
    json.dump(data, f)
"
    else
        echo -e "${GREEN}[INFO]${NC} E2E vault already registered."
    fi
fi

echo "Launching Obsidian with E2E vault..."
echo "Vault: $E2E_VAULT_DIR"
echo ""
echo "After Obsidian opens:"
echo "  1. Click 'Trust author and enable plugins' if prompted"
echo "  2. Verify Osmosis is listed and enabled in Settings > Community Plugins"
echo "  3. Close Obsidian when done"

flatpak run md.obsidian.Obsidian "obsidian://open?path=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$E2E_VAULT_DIR'))")"
