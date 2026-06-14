#!/bin/bash
set -euo pipefail
source /opt/le-pillaveur/.env 2>/dev/null || true
KEY="${RESEND_API_KEY:-}"
if [ -z "$KEY" ]; then echo "no key"; exit 1; fi
curl -sS -X POST 'https://api.resend.com/emails' \
  -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' \
  -d '{"from":"Le Pillaveur <noreply@lepillaveur.fr>","to":["deliverability@resend.dev"],"subject":"Test reset Le Pillaveur","html":"<p>Test envoi OK</p>"}'
