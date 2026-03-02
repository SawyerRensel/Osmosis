#!/bin/bash
set -eu -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
E2E_VAULT_DIR="$SCRIPT_DIR/e2e-vault"
OBSIDIAN_DIR="$E2E_VAULT_DIR/.obsidian"
PLUGIN_DIR="$OBSIDIAN_DIR/plugins/Osmosis"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
echo_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
echo_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Step 1: Create vault structure if it doesn't exist
echo_info "Ensuring vault structure exists..."
mkdir -p "$PLUGIN_DIR"

# Step 2: Pre-configure community plugins
echo_info "Configuring community plugins..."
echo '["osmosis"]' > "$OBSIDIAN_DIR/community-plugins.json"

# Step 3: Build the plugin (outputs directly to e2e-vault)
echo_info "Building the plugin..."
cd "$SCRIPT_DIR"
npm run build

# Step 4: Copy test fixtures into vault
echo_info "Copying test fixtures..."
if [[ -d "$SCRIPT_DIR/e2e/fixtures" ]]; then
    cp "$SCRIPT_DIR"/e2e/fixtures/*.md "$E2E_VAULT_DIR/" 2>/dev/null || true
fi

# Step 5: Register e2e-vault with Obsidian so obsidian:// URIs work
echo_info "Registering e2e-vault with Obsidian..."
OBSIDIAN_JSON="$HOME/.var/app/md.obsidian.Obsidian/config/obsidian/obsidian.json"
if [[ -f "$OBSIDIAN_JSON" ]]; then
    VAULT_HASH=$(echo -n "$E2E_VAULT_DIR" | md5sum | cut -c1-16)
    TIMESTAMP=$(date +%s)000

    if grep -q "$E2E_VAULT_DIR" "$OBSIDIAN_JSON" 2>/dev/null; then
        echo_info "E2E vault already registered with Obsidian."
    else
        python3 -c "
import json
with open('$OBSIDIAN_JSON', 'r') as f:
    data = json.load(f)
data['vaults']['$VAULT_HASH'] = {'path': '$E2E_VAULT_DIR', 'ts': $TIMESTAMP}
with open('$OBSIDIAN_JSON', 'w') as f:
    json.dump(data, f)
"
        echo_info "Registered e2e-vault with Obsidian."
    fi
else
    echo_warn "Obsidian config not found at $OBSIDIAN_JSON. You may need to open the vault manually."
fi

echo_info "Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Run: npm run e2e:launch"
echo "     This will open Obsidian with the test vault."
echo "  2. Enable community plugins in Settings > Community plugins (first time only)"
echo "  3. Verify the Osmosis plugin is enabled"
echo "  4. Close Obsidian"
echo "  5. Run: npm run e2e"
echo ""
echo_warn "Note: First-time setup requires manual plugin activation in Obsidian."
