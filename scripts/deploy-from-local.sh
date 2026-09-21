#!/bin/bash
# Deploiement de Le Pillaveur depuis le poste de travail (Git Bash sous
# Windows, ou tout shell POSIX avec git, tar, ssh et scp).
#
#   npm run deploy               # verifie, teste, archive, envoie, deploie
#   npm run deploy -- --dry-run  # tout sauf l'envoi : s'arrete l'archive faite
#
# La procedure n'existait que dans une memoire hors depot (git archive a la
# main, scp, ssh) et rien ne testait le code avant qu'il ne tourne : le seul
# garde-fou etait `next build` SUR le VPS, pendant qu'il sert. Ce script EST
# la procedure, versionnee avec le code, et il refuse de partir tant que :
#   - l'arbre de travail n'est pas propre (ce qui part = ce que git connait) ;
#   - origin/main n'est pas dans l'historique de HEAD (on ne remet pas en
#     ligne un site qui aurait perdu des correctifs deja deployes) ;
#   - la suite vitest et `tsc --noEmit` ne passent pas.
# Il glisse ensuite un fichier BUILD_INFO (sha, date, branche) dans l'archive :
# prod-deploy.sh le lit pour tagger l'image et l'afficher en Supervision.
#
# Il ne pousse RIEN sur GitHub : c'est l'operateur qui decide, et le script le
# rappelle a la fin. Surcharges possibles par l'environnement :
#   VPS_HOST (146.59.199.22), REMOTE_USER (ubuntu),
#   REMOTE_TAR (/tmp/le-pillaveur-deploy.tar),
#   REMOTE_APP_DIR (/opt/le-pillaveur),
#   REMOTE_SCRIPT (/opt/le-pillaveur/scripts/prod-deploy.sh).
set -euo pipefail

VPS_HOST="${VPS_HOST:-146.59.199.22}"
REMOTE_USER="${REMOTE_USER:-ubuntu}"
REMOTE_TAR="${REMOTE_TAR:-/tmp/le-pillaveur-deploy.tar}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/opt/le-pillaveur}"
REMOTE_SCRIPT="${REMOTE_SCRIPT:-$REMOTE_APP_DIR/scripts/prod-deploy.sh}"

# L'aide est l'en-tete du fichier : une seule source a maintenir.
usage() {
  sed -n '2,24p' "$0"
}

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Option inconnue : $arg"; usage; exit 1 ;;
  esac
done

# Toujours depuis la racine du depot (ou du worktree) : git archive et les
# chemins relatifs en dependent, et `npm run deploy` peut etre lance de
# n'importe quel sous-dossier.
cd "$(git rev-parse --show-toplevel)"

echo "=== 1/6 Arbre de travail ==="
# Fichiers modifies ET non suivis : git archive n'exporte que ce qui est
# commite, donc tout ce qui n'y est pas partirait... sans partir. Refuser ici
# est le seul moyen que « ce qui tourne » soit un commit que l'on peut relire.
if [ -n "$(git status --porcelain)" ]; then
  echo "ECHEC : l'arbre de travail n'est pas propre. Ce qui part en prod doit etre exactement ce que git connait :"
  git status --short | head -20
  echo "Commiter (ou ranger) ces fichiers, puis relancer."
  exit 1
fi
echo "propre"

echo "=== 2/6 origin/main dans l'historique ==="
# fetch d'abord : la comparaison se fait avec le main de GitHub, pas avec une
# copie locale qui peut dater. Le deploiement s'est deja fait depuis des
# branches de travail, et main a pris du retard sur la prod : l'inverse (une
# branche en retard sur main mise en ligne) effacerait des correctifs.
git fetch --quiet origin main
if ! git merge-base --is-ancestor origin/main HEAD; then
  echo "ECHEC : origin/main n'est pas un ancetre de HEAD."
  echo "Ces commits, deja sur GitHub, manqueraient a ce deploiement :"
  git log --oneline HEAD..origin/main | head -20
  echo "Integrer main d'abord (git merge origin/main), puis relancer."
  exit 1
fi
echo "ok ($(git rev-list --count origin/main..HEAD) commit(s) en avance sur origin/main)"

# set -e arrete au premier echec : pas de tar, pas d'envoi.
echo "=== 3/6 Tests (vitest) ==="
npm test

echo "=== 4/6 Types (tsc --noEmit) ==="
npx tsc --noEmit -p .

echo "=== 5/6 Archive ==="
GIT_SHA=$(git rev-parse --short HEAD)
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
# TMPDIR force a /tmp : mktemp l'honore, et un profil Windows qui l'exporte en
# forme `C:\...` ferait produire un chemin que GNU tar prend pour un HOTE
# distant (« Cannot connect to C: resolve failed ») — le script s'arretait
# proprement, mais sans explication. Sous Git Bash, /tmp est %TEMP%.
WORK=$(TMPDIR=/tmp mktemp -d)
# Le dossier de travail contient l'archive complete du code : on le detruit
# quoi qu'il arrive (succes, echec, interruption).
trap 'rm -rf "$WORK"' EXIT
TAR="$WORK/le-pillaveur-deploy.tar"
# Une ligne cle=valeur par information : prod-deploy.sh lit GIT_SHA par grep,
# sans jamais sourcer le fichier.
{
  echo "GIT_SHA=$GIT_SHA"
  echo "GIT_SHA_FULL=$(git rev-parse HEAD)"
  echo "GIT_BRANCH=$GIT_BRANCH"
  echo "BUILD_DATE=$BUILD_DATE"
} > "$WORK/BUILD_INFO"
# BUILD_INFO n'est pas dans le depot : on l'ajoute a l'archive apres coup
# (-r = append, POSIX, marche avec GNU tar comme avec bsdtar ; l'archive de
# git n'est pas compressee, condition pour pouvoir y ajouter).
git archive HEAD -o "$TAR"
tar -rf "$TAR" -C "$WORK" BUILD_INFO
echo "sha $GIT_SHA, branche $GIT_BRANCH, $(du -h "$TAR" | cut -f1)"

if [ "$DRY_RUN" = "1" ]; then
  echo "--dry-run : archive prete ($(tar -tf "$TAR" | wc -l | tr -d ' ') entrees, BUILD_INFO compris), rien n'a ete envoye."
  cat "$WORK/BUILD_INFO"
  exit 0
fi

echo "=== 6/6 Envoi et deploiement sur $REMOTE_USER@$VPS_HOST ==="
scp -q "$TAR" "$REMOTE_USER@$VPS_HOST:$REMOTE_TAR"
# ServerAliveInterval : le build Next dure plusieurs minutes sans rien
# afficher ; sans ces battements, une box ou un NAT peut couper la session et
# le deploiement continuerait a l'aveugle cote VPS.
# Le journal complet reste hors du depot (un fichier dans l'arbre rendrait le
# prochain lancement « pas propre »), et hors de WORK, detruit a la sortie.
# Meme /tmp force que pour WORK ; affiche en chemin Windows (%TEMP%\...) quand
# cygpath existe, c'est-a-dire sous Git Bash, ou l'operateur ouvre le fichier
# depuis l'Explorateur, pas depuis MSYS.
DEPLOY_LOG="/tmp/le-pillaveur-deploy-$GIT_SHA.log"
display_path() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else echo "$1"; fi
}
# INVARIANT : le script qui tourne sur le VPS est CELUI DE L'ARCHIVE. Sans
# l'extraction prealable de scripts/, bash ouvrait /opt/.../prod-deploy.sh
# AVANT que `tar xf` (dans le script lui-meme) ne le remplace : GNU tar
# supprime puis recree le fichier, et bash lisait l'ANCIEN inode jusqu'au bout.
# Un correctif de prod-deploy.sh ne s'appliquait donc qu'au deploiement
# SUIVANT — et le premier passage concluait « DONE_DEPLOY » avec l'ancienne
# procedure. Ici, scripts/ est en place avant que bash n'ouvre quoi que ce
# soit ; la re-extraction faite ensuite par prod-deploy.sh recree un fichier au
# meme contenu, bash garde son descripteur, sans effet. Les *.sh sortent de
# `git archive` en LF (.gitattributes : `*.sh text eol=lf`), le script est
# donc executable tel quel.
set +e
ssh -o ServerAliveInterval=30 -o ServerAliveCountMax=10 "$REMOTE_USER@$VPS_HOST" \
  "tar xf $REMOTE_TAR -C $REMOTE_APP_DIR scripts && bash $REMOTE_SCRIPT $REMOTE_TAR" 2>&1 | tee "$DEPLOY_LOG"
SSH_STATUS=${PIPESTATUS[0]}
set -e
# DONE_DEPLOY est le marqueur que prod-deploy.sh n'imprime QUE sur succes :
# on exige les deux, code de sortie nul ET marqueur present.
if [ "$SSH_STATUS" -ne 0 ] || ! grep -q '^DONE_DEPLOY' "$DEPLOY_LOG"; then
  echo
  echo "ECHEC DEPLOY (ssh a rendu $SSH_STATUS, DONE_DEPLOY absent). Journal : $(display_path "$DEPLOY_LOG")"
  echo "prod-deploy.sh indique ci-dessus le retour arriere possible (image precedente + instantane)."
  exit 1
fi

echo
echo "Deploye : $GIT_SHA ($GIT_BRANCH). Verifier le sha en pied de /supervision. Journal : $(display_path "$DEPLOY_LOG")"
echo "RAPPEL : rien n'a ete pousse sur GitHub. Pour que main reflete la prod :"
if [ "$GIT_BRANCH" = "main" ]; then
  echo "  git push origin main"
else
  echo "  git push origin $GIT_BRANCH:main"
  echo "  (avance rapide garantie : origin/main est un ancetre de ce commit, verifie a l'etape 2)"
fi
