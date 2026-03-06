#!/usr/bin/env bash
set -euo pipefail

# Build a minimal secrets.json from local config and push it to the App Service.
# Only includes: azure provider, teams config, and oauth connection names.
# The startup.sh script writes this to disk before the bot starts.
#
# Usage: bash scripts/set-app-secrets.sh

SUB="4c2988ee-571a-4995-9ab0-cc68f38aaf2b"
RG="rg-arimendelow-fhl26"
APP_NAME="ouroboros-bot"
SECRETS_FILE="$HOME/.agentsecrets/ouroboros/secrets.json"

if [ ! -f "$SECRETS_FILE" ]; then
  echo "Error: $SECRETS_FILE not found"
  exit 1
fi

echo "==> Building minimal secrets from $SECRETS_FILE"

# Extract only the fields needed for deployed bot
SECRETS_JSON=$(python3 -c "
import json, sys
with open('$SECRETS_FILE') as f:
    full = json.load(f)
minimal = {
    'providers': {
        'azure': full.get('providers', {}).get('azure', {})
    },
    'teams': {
        'clientId': '93b3681b-1565-4ff7-bf1f-1d370e247604',
        'clientSecret': '',
        'tenantId': '72f988bf-86f1-41af-91ab-2d7cd011db47',
        'managedIdentityClientId': 'c404d5a9-10ae-4b06-afd5-18964f3d857e'
    },
    'oauth': {
        'graphConnectionName': full.get('oauth', {}).get('graphConnectionName', 'graph'),
        'adoConnectionName': full.get('oauth', {}).get('adoConnectionName', 'ado'),
        'githubConnectionName': full.get('oauth', {}).get('githubConnectionName', '')
    },
    'teamsChannel': {
        'skipConfirmation': True,
        'port': 3978
    }
}
print(json.dumps(minimal))
")

echo "==> Setting OUROBOROS_SECRETS app setting"
az webapp config appsettings set \
  --name "$APP_NAME" \
  --resource-group "$RG" \
  --subscription "$SUB" \
  --settings "OUROBOROS_SECRETS=$SECRETS_JSON" \
  --output none

echo "==> Restarting app to pick up new secrets"
az webapp restart \
  --name "$APP_NAME" \
  --resource-group "$RG" \
  --subscription "$SUB"

echo "Done. Deployed secrets (azure provider + teams + oauth connections only)."
