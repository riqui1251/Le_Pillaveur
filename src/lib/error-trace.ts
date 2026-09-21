/**
 * Ce qu'on a le droit de journaliser d'une erreur : son NOM de classe, et le
 * code Prisma s'il y en a un. Jamais le message, jamais la pile.
 *
 * POURQUOI : un message Prisma recopie la ligne fautive. « UNIQUE constraint
 * failed » arrive avec la valeur en cause, une contrainte sur User avec un
 * e-mail ou un pseudo, une trace d'IpSeenLog avec une adresse. Ces journaux
 * partent dans `docker logs`, où le RGPD ne veut ni pseudo, ni e-mail, ni IP —
 * et ce sont justement les chemins qui SUPPRIMENT des comptes (balayage de
 * conservation, planificateur) qui lèvent le plus volontiers.
 *
 * L'exploitant, lui, a besoin de savoir QUEL bloc a lâché : c'est le libellé
 * fixe passé à côté. `Error P2002` lui dit le reste sans rien recopier.
 *
 * Extrait ici plutôt que recopié : le même besoin existe dans l'enveloppe des
 * routes (src/lib/api-route.ts, qui garde sa propre copie pour ne pas faire
 * dépendre chaque route d'un module de plus), dans le planificateur et dans le
 * balayage — et le planificateur importe le balayage, donc l'un ne peut pas
 * fournir l'autre sans cycle.
 */
export function errorTrace(error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error
  const code =
    error && typeof error === 'object' && 'code' in error ? (error as { code: unknown }).code : null
  return typeof code === 'string' && /^P\d{4}$/.test(code) ? `${name} ${code}` : name
}
