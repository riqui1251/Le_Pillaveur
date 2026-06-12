#!/bin/bash
# Applique les variables Resend sur le VPS et redémarre le conteneur.
# Usage : RESEND_API_KEY=re_xxx bash scripts/prod-env-resend.sh
set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/le-pillaveur/.env}"
DOMAIN="${RESEND_DOMAIN:-lepillaveur.fr}"
API_KEY="${RESEND_API_KEY:-}"

if [ -z "$API_KEY" ]; then
  echo "ERREUR: RESEND_API_KEY requis"
  exit 1
fi

upsert_env() {
  local key="$1"
  local val="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

upsert_env "RESEND_API_KEY" "\"$API_KEY\""
upsert_env "EMAIL_FROM" "\"Le Pillaveur <noreply@${DOMAIN}>\""
upsert_env "SITE_URL" "\"https://${DOMAIN}\""
upsert_env "NEXT_PUBLIC_APP_URL" "\"https://${DOMAIN}\""
upsert_env "NODE_ENV" "production"
upsert_env "DATABASE_URL" "\"file:/app/prisma/prod.db\""

echo "=== .env mis à jour ==="
grep -E '^(RESEND|EMAIL_FROM|SITE_URL|NEXT_PUBLIC_APP_URL|NODE_ENV|DATABASE_URL)=' "$ENV_FILE" | sed 's/RESEND_API_KEY=.*/RESEND_API_KEY=***/'

echo "=== Redémarrage conteneur ==="
docker rm -f le-pillaveur 2>/dev/null || true
docker run -d \
  --name le-pillaveur \
  --restart always \
  -p 127.0.0.1:3000:3000 \
  -v le-pillaveur-db:/app/prisma \
  --env-file "$ENV_FILE" \
  -e NODE_ENV=production \
  -e DATABASE_URL=file:/app/prisma/prod.db \
  le-pillaveur:latest

sleep 4
curl -s https://lepillaveur.fr/api/health
echo ""
echo "DONE — testez « Mot de passe oublié » sur /compte"
