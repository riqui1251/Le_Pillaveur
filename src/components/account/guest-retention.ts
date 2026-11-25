/**
 * Compte INVITÉ : nombre de jours d'inactivité avant purge automatique.
 * Doit rester aligné avec GUEST_INACTIVITY_DAYS de src/lib/retention-sweep.ts
 * — ce module-là importe Prisma, il ne peut pas être importé côté client
 * (guest-retention.test.ts vérifie l'alignement).
 */
export const GUEST_INACTIVITY_DAYS = 90

/**
 * Compte INVITÉ sans plus aucune session valide en base (déconnexion,
 * connexion à un autre compte dans ce navigateur) : nombre de jours avant sa
 * suppression. Un cookie simplement effacé laisse la session valide en base :
 * ce compte-là, inaccessible lui aussi, ne part qu'à l'échéance de sa session.
 * Même contrainte d'alignement, avec ORPHAN_GUEST_INACTIVITY_DAYS de
 * src/lib/retention-sweep.ts.
 */
export const ORPHAN_GUEST_INACTIVITY_DAYS = 7
