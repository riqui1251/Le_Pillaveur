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
# Troisième chemin qui recrée le conteneur de prod, après prod-deploy.sh et
# prod-db-restore.sh : il le faisait avec ses propres options, sans plafond
# mémoire, sans rotation des journaux, et sans le dossier d'état des tâches
# root — l'onglet « Surveillance » devenait aveugle jusqu'au déploiement
# suivant. RUN_ARGS est donc la COPIE CONFORME de celui de prod-deploy.sh (les
# raisons de chaque option y sont commentées) ; src/lib/shell-scripts.test.ts
# vérifie que tout script qui recrée `le-pillaveur` reprend ces options.
DB_VOLUME="${DB_VOLUME:-le-pillaveur-db}"
ENV_ARGS=(--env-file "$ENV_FILE")
# Dossier monté en lecture seule : créé avec des droits connus plutôt
# qu'inventé par docker au montage, et AVANT de couper le site — sous set -e,
# un sudo refusé doit arrêter le script pendant que l'ancien conteneur tourne.
sudo mkdir -p /var/lib/le-pillaveur-status
sudo chmod 755 /var/lib/le-pillaveur-status
RUN_ARGS=(
  --restart always
  --memory=1g --memory-swap=1g
  --pids-limit=512
  --oom-score-adj=-500
  --log-opt max-size=20m --log-opt max-file=5
  -p 127.0.0.1:3000:3000
  -v "$DB_VOLUME:/app/prisma"
  -v /var/lib/le-pillaveur-status:/app/ops-status:ro
  "${ENV_ARGS[@]}"
  -e NODE_ENV=production
  -e DATABASE_URL=file:/app/prisma/prod.db
)
# Même sonde que le déploiement : le démon valide les options (pilote de
# journaux, cgroup mémoire) AVANT `docker rm -f`. Un refus laisse l'ancien
# conteneur en place — il tourne avec l'ancienne clé, mais il tourne.
docker rm -f le-pillaveur-probe >/dev/null 2>&1 || true
if ! docker create --name le-pillaveur-probe "${RUN_ARGS[@]}" le-pillaveur:latest >/dev/null; then
  echo "ECHEC : le démon docker refuse les options du conteneur (message ci-dessus) ; l'ancien conteneur n'a PAS été coupé."
  exit 1
fi
docker rm le-pillaveur-probe >/dev/null
docker rm -f le-pillaveur 2>/dev/null || true
docker run -d \
  --name le-pillaveur \
  "${RUN_ARGS[@]}" \
  le-pillaveur:latest
# Comme après un déploiement ou un retour arrière : le filtre de sortie est
# réappliqué au conteneur recréé.
sudo /usr/local/bin/egress-filter.sh 2>/dev/null || true

sleep 4
curl -s https://lepillaveur.fr/api/health
echo ""
echo "DONE — testez « Mot de passe oublié » sur /compte"
