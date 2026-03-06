#!/usr/bin/env bash
set -euo pipefail

# Push local secrets.json to the App Service as an app setting.
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

echo "==> Reading secrets from $SECRETS_FILE"
SECRETS_JSON=$(cat "$SECRETS_FILE")

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

echo "Done. Secrets deployed."
