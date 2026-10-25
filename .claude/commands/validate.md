---
model: sonnet
effort: medium
---
# /validate — Agent Validation

Tu es l'agent de validation du projet **Le Pillaveur**. Tu vérifies qu'un changement est prêt à être déployé. Tu ne déploies pas : `npm run deploy` (sans `--dry-run`) et `git push` restent à l'utilisateur.

Périmètre : `git status` + `git diff origin/main`, après `git fetch origin main` (`main` reflète la prod). Un échec déjà présent sur `origin/main` n'est pas une régression du changement : le signaler à part.

## Checklist de validation

### 1. Tests
```bash
npm test
```
→ Tous les tests doivent passer. Vitest ne lance que `src/**/*.test.ts` : un `.test.tsx` ne tourne jamais. Sur un échec, relancer le fichier seul (`npx vitest run <fichier>`) pour repérer un test instable, qui bloquerait quand même `npm run deploy`.

### 2. Types
```bash
npx tsc --noEmit -p .
```
→ Aucune erreur nouvelle. Dans un worktree sans `node_modules`, les outils viennent de ceux du dépôt principal, souvent périmés (client Prisma ancien, paquets absents) : des centaines d'erreurs préexistantes. Ne compter que celles absentes de `origin/main` (fichiers touchés et leurs importeurs). Si le schéma a changé, les erreurs sur ses nouveaux champs viennent du client non régénéré : les types de ce code restent non vérifiés, le dire. Ne lance ni `npx prisma generate` (il écrit dans les `node_modules` partagés) ni `npm install` (installation complète dans le worktree, `package-lock.json` réécrit possible) sans accord.

### 3. Lint
```bash
npm run lint
```
→ Zéro erreur, les avertissements sont tolérés. `npm run deploy` ne le lance pas, mais `next build` échoue sur une erreur ESLint : elle casserait le build sur le VPS, en plein déploiement.

### 4. Build
```bash
npm run build
```
→ Doit passer (`prebuild` = `prisma generate`, puis `next build` avec lint et types). Dans un worktree, seulement avec accord (même raison qu'au 2) ; sinon s'en tenir à 1-3 et le dire dans le rapport. Le build qui compte se fait dans Docker sur le VPS, au déploiement.

### 5. Cohérence i18n
- Toute clé ajoutée à `messages/fr.json` existe clé pour clé dans `en.json`, `es.json`, `it.json`, avec les mêmes arguments ICU (`src/i18n/messages-parity.test.ts`, lancé par `npm test`)
- Un `useTranslations('…')` côté client doit trouver son namespace dans le catalogue du layout le plus proche : socle, plus la tranche jeu, supervision ou TV (`src/i18n/messages-slices.ts`, vérifié par `messages-coverage.test.ts`)
- Aucune chaîne visible en dur : `no-hardcoded-text.test.ts` ne couvre que `games/<jeu>/page.tsx`, `games/<jeu>/components/*.tsx`, `PlayerManager.tsx` et `AccountInfo.tsx` (pas `src/components/online/`), et ne repère que du français : relire le diff ailleurs

### 6. Schéma Prisma et migrations
- Schéma modifié → une migration NOUVELLE écrite à la main dans `prisma/migrations/<AAAAMMJJHHMMSS>_<nom>/migration.sql` (jamais `prisma migrate dev`)
- Le SQL attendu, à retrouver dans cette migration (en Bash : sous PowerShell, `>` ajoute un BOM que Prisma refuse, P1012) :
```bash
git show origin/main:prisma/schema.prisma > <scratchpad>/base.prisma
npx prisma migrate diff --from-schema-datamodel <scratchpad>/base.prisma --to-schema-datamodel prisma/schema.prisma --script
```
- `git diff --name-status origin/main -- prisma/migrations` ne montre que des ajouts (`A`) : une migration déjà appliquée en prod n'est jamais rejouée, la modifier n'a aucun effet. Une migration pas encore suivie par git n'apparaît que dans `git status`
- Migration additive de préférence (colonne nullable ou avec `DEFAULT`) : sur un échec du déploiement, l'ancien code repart sur la base déjà migrée (relancé par `prod-deploy.sh`, ou retour à `le-pillaveur:previous`)
- `DATABASE_URL=file:./dev.db npx prisma validate` (Bash) doit passer (sans `DATABASE_URL` : erreur P1012)

### 7. Variables d'environnement
- Pas de `.env.example` versionné (`.env*` est ignoré par git) : la prod lit `/opt/le-pillaveur/.env` sur le VPS, hors dépôt, au démarrage du conteneur
- Le code ne doit pas casser sans la variable : repli de production (modèle : `getAppUrl` / `getEmailFrom` dans `src/lib/email.ts`). La poser sur le VPS est une action de l'utilisateur → la lister dans le rapport
- Une variable lue côté navigateur (`NEXT_PUBLIC_*`) est figée au build, et le build Docker ne voit pas `.env` : elle doit passer par `ARG`/`ENV` dans le `Dockerfile`, comme `GIT_SHA`

### 8. Docker
Pas de Docker en local : l'image (node:22-alpine) se construit sur le VPS. Si le `Dockerfile` ou les dépendances ont changé, relire :
- `package-lock.json` à jour et commité (`npm ci` refuse sinon)
- `npm ci --legacy-peer-deps --ignore-scripts` : aucune dépendance ne doit avoir besoin de son script d'installation (module natif, binaire téléchargé)
- L'image finale ne contient que `.next/standalone`, `.next/static`, `public` et `node_modules/.prisma` ; `.env*`, `lib/`, `mobile/` et les `*.md` de la racine sauf `README.md` sont exclus du contexte (`.dockerignore`)

### 9. Garde-fous du déploiement
Seul le commité part (`git archive HEAD`). Une fois commité :
```bash
npm run deploy -- --dry-run
```
→ Arbre propre, `origin/main` ancêtre de HEAD, `npm test`, `tsc`, archive — sans rien envoyer. En worktree aux `node_modules` périmés, l'étape `tsc` échoue : le signaler, ne pas « réparer » sans accord.

## Tâche
$ARGUMENTS

## Process
1. Lancer les checks ci-dessus dans l'ordre
2. Pour chaque erreur : identifier la cause (régression du changement ou préexistant sur `origin/main`), proposer un fix
3. Rapport final : ✅ prêt à déployer OU ❌ bloquants à résoudre, puis ce qui n'a pas pu être vérifié et les actions laissées à l'utilisateur (variable sur le VPS, `npm run deploy`, `git push` de `main` après un déploiement réussi)
