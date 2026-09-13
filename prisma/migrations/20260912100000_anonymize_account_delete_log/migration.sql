-- Migration de DONNEES, aucun changement de schema. La suppression d'un compte
-- par le staff journalisait "pseudo (code) -- email" dans
-- AccountBanEvent.comment, via logStaffAction (action 'account-delete'). Cette
-- ligne est ancree sur l'AUTEUR et n'est jamais purgee : elle gardait
-- indefiniment l'identite d'une personne dont le compte venait d'etre efface.
-- Le code n'ecrit plus que le type et le role du compte supprime ; les lignes
-- deja ecrites perdent tout detail. Irreversible, volontairement. Idempotente.
UPDATE "AccountBanEvent" SET "comment" = 'compte supprimé' WHERE "action" = 'account-delete';
