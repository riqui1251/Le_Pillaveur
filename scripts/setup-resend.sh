#!/bin/bash
# Configure Resend pour le mot de passe oublié (domaine lepillaveur.fr).
# Usage : RESEND_API_KEY=re_xxx bash scripts/setup-resend.sh
set -euo pipefail

DOMAIN="${RESEND_DOMAIN:-lepillaveur.fr}"
API_KEY="${RESEND_API_KEY:-}"

if [ -z "$API_KEY" ]; then
  echo "ERREUR: exportez RESEND_API_KEY (clé depuis https://resend.com/api-keys)"
  exit 1
fi

echo "=== Ajout du domaine $DOMAIN sur Resend ==="
RESP=$(curl -sS -X POST 'https://api.resend.com/domains' \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"$DOMAIN\"}")

echo "$RESP" | python3 -m json.tool 2>/dev/null || echo "$RESP"

echo ""
echo "=== Enregistrements DNS à ajouter chez OVH (Zone DNS de $DOMAIN) ==="
echo "$RESP" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    for r in d.get('records', []):
        print(f\"  {r.get('type','?'):6} {r.get('name','')} -> {r.get('value','')}\")
except Exception:
    pass
" 2>/dev/null || echo "(Consultez le dashboard Resend > Domains pour les enregistrements)"

echo ""
echo "Après ajout DNS, vérifiez le domaine dans Resend (peut prendre jusqu'à 48 h)."
echo ""
echo "Variables à mettre dans /opt/le-pillaveur/.env :"
echo "  RESEND_API_KEY=$API_KEY"
echo "  EMAIL_FROM=Le Pillaveur <noreply@$DOMAIN>"
echo "  SITE_URL=https://$DOMAIN"
echo "  NEXT_PUBLIC_APP_URL=https://$DOMAIN"
