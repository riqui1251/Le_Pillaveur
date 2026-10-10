# /db — Agent Base de Données

Tu es un expert Prisma/SQLite pour le projet **Le Pillaveur**.

## Contexte
- **ORM** : Prisma 6, schéma dans `prisma/schema.prisma`
- **Base** : SQLite en WAL (posé au démarrage de l'application par `src/lib/db-setup.ts`). En local : `DATABASE_URL` du `.env` du dépôt principal (`file:./prisma/dev.db`, relatif au dossier du schéma, donc `prisma/prisma/dev.db`). En prod : `prod.db` dans le volume Docker `le-pillaveur-db`, monté sur `/app/prisma`. `prisma/dev.db` (et `dev.db-journal`) est suivi par git par erreur (vestige de la V1) : ne jamais le committer
- **Migrations** : dans `prisma/migrations/`, SQL **écrit à la main**. Jamais `prisma migrate dev`, `migrate reset` ni `db push` : l'historique ne se rejoue pas sur une base vide (`20250612180000_visitor_ip` échoue), et `db push` contourne les migrations
- **Client** : `src/lib/prisma.ts` (singleton sur `globalThis`, `connection_limit=1`)

## Conventions du schéma existant
- IDs : `String @id @default(cuid())` ; clé naturelle quand elle existe (`SiteSetting.key`, `@@id([day, gameId])`)
- Types : ni `enum` ni `Json` ; statuts en `String @default("…")`, JSON sérialisé dans un `String?` suffixé `Json` (`settingsJson`, `contextJson`)
- Dates : `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt` si la ligne est modifiée
- Pas de soft delete : `bannedAt` / `banType` / `bannedUntil` servent au bannissement. Un compte est supprimé physiquement par `deleteUserAccount` (`src/lib/user-activity-server.ts`), les invités par `src/lib/retention-sweep.ts`. Nouvelle donnée personnelle liée à un compte : `onDelete: Cascade`, sinon (SetNull, table sans clé étrangère) la traiter dans `deleteUserAccount`. Toute nouvelle donnée personnelle ou d'usage reçoit aussi une durée de conservation, purgée dans `retention-sweep.ts` et annoncée dans `docs/legal/<fr|en|es|it>/confidentialite.md`
- Relations : `@relation(fields: […], references: [id], onDelete: Cascade | SetNull)`, `onDelete` toujours explicite (seule exception héritée : `Stats`) ; nom de relation obligatoire quand deux relations relient les mêmes modèles (`"BanTarget"` / `"BanActor"`)
- Index : `@@index` sur chaque clé étrangère (SQLite ne les indexe pas), sauf si un `@@unique` / `@@index` commence déjà par elle, et sur les champs filtrés ou triés

## Tâche
$ARGUMENTS

## Process
1. Lire `prisma/schema.prisma` et les dernières migrations pour voir les modèles et le style
2. Proposer les changements de schéma
3. Créer `prisma/migrations/<AAAAMMJJHHMMSS>_<nom>/migration.sql` (horodatage postérieur au dernier dossier) et modifier `prisma/schema.prisma` en cohérence :
   - en-tête `--` qui dit pourquoi et quelles lignes existantes sont touchées
   - `ALTER TABLE … ADD COLUMN` nullable ou avec `DEFAULT` (SQLite refuse un `NOT NULL` sans défaut)
   - `CREATE TABLE` / `CREATE INDEX IF NOT EXISTS`, noms = ceux que Prisma génère (`<Modèle>_<champs>_idx`, `_key` si unique, `_fkey` pour une clé étrangère), sinon écart entre base et schéma
   - changement de contrainte, de clé étrangère ou de type : reconstruction de table à la main (`PRAGMA foreign_keys=OFF`, `new_<Modèle>`, `INSERT … SELECT`, `DROP`, `RENAME`, index recréés), sur le modèle de `20260830140000_achievements_cascade_unique`
   - donnée initiale indispensable : `INSERT` dans la migration (`prisma/seed.ts` est une démo héritée, lancée par aucun script ni par le déploiement)
4. Appliquer en local, sur une base à jour :
   - d'abord `npx prisma migrate status` : seule la nouvelle migration doit être en attente. Sinon la base est en retard (au 10/10/2026, `prisma/prisma/dev.db` s'arrêtait à `20260616113000`) : ne rien appliquer, demander à l'utilisateur (`npm run db:migrate`, soit `migrate deploy`, la rattrape et applique aussi la nouvelle migration : sauter alors `db execute` et `migrate resolve`)
   ```bash
   npx prisma db execute --file prisma/migrations/<dossier>/migration.sql
   npx prisma migrate resolve --applied <dossier>
   npx prisma generate
   ```
   - contrôle : `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code` doit répondre « No difference detected »
   - sans accord pour toucher la base de l'utilisateur : sur une copie de `dev.db` dans le scratchpad, avec `DATABASE_URL="file:<copie>"`, `npx prisma migrate deploy` (rattrape le retard ET applique la nouvelle migration), puis le contrôle `migrate diff` ci-dessus ; pas de `generate`
5. Adapter le code, puis `npm test`, `npx tsc --noEmit -p .`, `npm run lint` (zéro erreur)

## ⚠️ Attention
- Ne jamais modifier, renommer ni supprimer une migration existante : la prod compare les noms de dossiers à `_prisma_migrations` et ne rejoue jamais une migration déjà passée. Corriger = nouvelle migration
- `npm run db:migrate:local` ne vise qu'une vieille migration (`ip_history`) : ne pas s'en servir
- Dans un worktree : ni `node_modules` ni `.env` (les `npx` y trouvent les outils du dépôt principal). Le client Prisma généré est celui du dépôt principal, périmé : `tsc` sort des centaines d'erreurs Prisma préexistantes, comparer à HEAD et filtrer sur les fichiers touchés. `prisma generate` réécrirait ce client partagé, et un `.env` copié tel quel viserait `prisma/prisma/dev.db` du worktree, qui n'existe pas : demander à l'utilisateur avant
- Dans `prisma.$transaction(async (tx) => …)`, n'utiliser QUE `tx`, y compris dans les fonctions appelées (une seule connexion : interblocage sinon) ; préférer la forme tableau `$transaction([...])`
- En prod, pas de migration au démarrage du conteneur : `npm run deploy` (`scripts/deploy-from-local.sh`, puis `scripts/prod-deploy.sh` sur le VPS) prend un instantané de la base puis lance `prisma migrate deploy`, site arrêté le temps de la migration (verrou exclusif en WAL). Toute commande lancée à la main sur la base de prod : conteneur `le-pillaveur` arrêté d'abord, et base ouverte sous l'UID 1001, sinon le `-wal` laissé à root empêche l'application de rouvrir sa base
- Rester additif autant que possible : un échec de migration relance l'ancien conteneur sur la base, et le retour arrière `le-pillaveur:previous` fait tourner l'ancien code sur la base migrée
