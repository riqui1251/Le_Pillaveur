# Le Pillaveur

Jeux de soirée sur téléphone — [lepillaveur.fr](https://lepillaveur.fr). Un seul téléphone qui passe de main
en main (mode local) ou une table en ligne où chacun joue depuis le sien. Quatre langues : fr, en, es, it.

## Pile

Next.js 15 (App Router), React 18, next-intl, Prisma 6 sur SQLite (journal WAL, une seule connexion),
Tailwind, Vitest. En production : un conteneur Docker (image `standalone`, utilisateur `nextjs`, UID 1001)
sur un VPS Ubuntu, derrière Caddy puis Cloudflare. Les ports 80/443 ne sont ouverts qu'aux plages Cloudflare.

## Commandes

- `npm run dev` — synchronise le schéma Prisma dans le client généré (contournement d'un EPERM Windows,
  `scripts/sync-prisma-client.mjs`) puis lance `next dev` ; dans un worktree, copier `.env` du dépôt principal à
  la main avant de lancer.
- `npm test` — tous les tests Vitest ; `npx vitest run <fichier>` pour un seul.
- `npm run lint` — `next lint` (déprécié par Next 16 : passer à `eslint .` le jour venu, la config
  `eslint.config.mjs` est déjà au format plat). Zéro erreur exigé, les avertissements se résorbent au fil de l'eau.
- `npx tsc --noEmit -p .` — vérification des types, lancée aussi par le build.

## Où vivent les jeux

- `src/lib/<jeu>/engine.ts` — le moteur, pur et testé (`engine.test.ts` à côté), sans React ni base.
- `src/app/[locale]/games/<jeu>/` — les écrans (`components/game.tsx` en local, `*Online.tsx` sous `src/components/online/`).
- `src/lib/games.ts` — le registre : identifiant, catégorie, `onlineReady`, effectif, règles (`src/lib/rules/`).

## Textes et langues

`messages/fr.json` est la référence, `en.json`, `es.json`, `it.json` en sont les traductions clé pour clé.
Toute chaîne visible passe par next-intl (`useTranslations` / `getTranslations`), jamais en dur dans un
composant. `src/i18n/messages-parity.test.ts` échoue à la première clé manquante, en trop, ou dont les
arguments ICU (`{count, plural, …}`) diffèrent d'une langue à l'autre.

## Migrations : écrites à la main

Jamais `prisma migrate dev`. Créer `prisma/migrations/<AAAAMMJJHHMMSS>_<nom>/migration.sql`, modifier
`prisma/schema.prisma` en cohérence, puis en local :

    npx prisma db execute --file prisma/migrations/<dossier>/migration.sql
    npx prisma migrate resolve --applied <dossier>
    npx prisma generate

En production, `scripts/prod-deploy.sh` prend un instantané de la base puis applique les migrations en attente.
**Le site est arrêté le temps de la migration**, et seulement s'il y en a une : la base est en WAL, et le CLI
Prisma exige un verrou exclusif que l'application ouverte rend impossible (« database is locked »). Même règle
pour toute commande Prisma lancée à la main sur la base de prod : conteneur `le-pillaveur` arrêté d'abord.

## Déploiement

`npm run deploy` lance `scripts/deploy-from-local.sh` : tests, archive `git archive` du HEAD courant, `scp`
vers le VPS, puis `ssh … bash /opt/le-pillaveur/scripts/prod-deploy.sh`, qui reconstruit l'image, migre,
relance le conteneur, vérifie `/api/health` et imprime `DONE_DEPLOY`. L'image précédente reste taguée
`le-pillaveur:previous`. **`main` sur GitHub se pousse APRÈS un déploiement réussi** : il reflète ce qui tourne,
le pousser ne déploie rien.

## Sauvegardes et restauration

- Cron VPS posé par `scripts/vps-secure-max.sh` : instantané SQLite chaque nuit à 03:00 dans
  `/opt/le-pillaveur-backups`, et un instantané par heure le soir. Copie hors site sur Cloudflare R2 à 03:15
  (cron posé par `scripts/vps-setup-offsite-r2.sh`, script `scripts/vps-backup-offsite.sh` ; `vps-secure-max.sh`
  ne fait que rafraîchir la copie installée). Rejouer `vps-secure-max.sh` le soir même d'un déploiement.
- `scripts/prod-db-restore.sh` : liste les instantanés, restaure les données et/ou revient à `le-pillaveur:previous`,
  après une confirmation tapée à la main dans un vrai terminal.
- Sondes, seuils et conduite à tenir en cas d'alerte : `docs/ops/ALERTES.md`.
