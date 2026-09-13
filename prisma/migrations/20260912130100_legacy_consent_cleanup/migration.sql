-- Migration de DONNEES, aucun changement de schema. Irreversible, volontairement.
-- Idempotente.
--
-- L'ancien bandeau (valeur '1' du cookie lp_analytics_consent) annoncait des
-- "statistiques de visite anonymes" qui "servent uniquement a compter les
-- visites". Le suivi reel etait identifiant : identifiant de navigateur d'un
-- an, IP historisees, pseudos locaux, rattachement au compte, consultables
-- nominativement en Supervision. Un accord donne sous ce libelle n'est ni
-- eclaire ni specifique. La valeur '1' ne vaut plus accord (le bandeau se
-- repose) ; ce qui a ete ecrit sous elle est traite ici, sans attendre la
-- purge a 6 mois, dans le perimetre arbitre du lot 6.
--
-- 1) Historique IP des navigateurs sans session (sujets `visitor:<vid>`).
--    Les sujets `user:<id>` (historique IP des comptes, interet legitime :
--    securite et moderation) sont conserves.
DELETE FROM "IpSeenLog" WHERE "subjectKey" LIKE 'visitor:%';

-- 2) Presences de navigateurs jamais rattaches a un compte : supprimees.
DELETE FROM "SitePresence" WHERE "userId" IS NULL;

-- 3) Presences rattachees a un compte : conservees (bloc "navigateurs vus
--    avec ce compte" de la fiche, couverture des visites), mais sans les
--    pseudos locaux, noms de tiers. consentVersion reste NULL : la ligne est
--    effacee au premier signal de ce navigateur encore a '1' (route du ping),
--    a son refus, ou par la purge a 6 mois.
UPDATE "SitePresence" SET "localPlayerNames" = NULL, "localPlayerCount" = 0
WHERE "localPlayerNames" IS NOT NULL OR "localPlayerCount" <> 0;

-- 4) Ancien cumul de presence : 60 s par requete, onglets caches compris
--    (surestime), et collecte en partie sans consentement. Plus alimente
--    depuis le lot 5 ; le temps d'un compte se lit desormais dans AccountVisit.
--    Colonne gardee : la supprimer en SQLite oblige a reconstruire la table.
UPDATE "User" SET "totalPresenceSeconds" = 0 WHERE "totalPresenceSeconds" <> 0;

-- DailyVisitor est CONSERVE : un couple (identifiant de navigateur, jour),
-- sans IP ni nom ni compte, deja purge a 13 mois ; il garde la continuite des
-- courbes de frequentation.
--
-- Pendant le deploiement, l'ancien conteneur tourne encore apres cette
-- migration et peut reecrire des lignes sous '1' : filet idempotent dans
-- retention-sweep.ts (lignes a consentVersion NULL, IpSeenLog visitor sans
-- presence consentie, totalPresenceSeconds).
