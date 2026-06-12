#!/bin/bash
set -euo pipefail
ENV=/opt/le-pillaveur/.env

upsert() {
  local k="$1" v="$2"
  if grep -q "^${k}=" "$ENV" 2>/dev/null; then
    sed -i "s|^${k}=.*|${k}=${v}|" "$ENV"
  else
    echo "${k}=${v}" >> "$ENV"
  fi
}

upsert SITE_URL '"https://lepillaveur.fr"'
upsert NEXT_PUBLIC_APP_URL '"https://lepillaveur.fr"'
upsert EMAIL_FROM '"Le Pillaveur <noreply@lepillaveur.fr>"'
upsert NODE_ENV production
upsert DATABASE_URL '"file:/app/prisma/prod.db"'

grep -E '^(SITE_URL|NEXT_PUBLIC_APP_URL|EMAIL_FROM|RESEND|NODE_ENV|DATABASE_URL)=' "$ENV" | sed 's/RESEND_API_KEY=.*/RESEND_API_KEY=(absent)/'
