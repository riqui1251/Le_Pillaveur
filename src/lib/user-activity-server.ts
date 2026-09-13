import { prisma } from '@/lib/prisma'
import { subjectKeyFor } from '@/lib/ip-history-server'
import { prepareHostedGameSessionsClose } from '@/lib/online/game-sessions'
import { setUserExcluded } from '@/lib/metrics-exclusions'
import type * as SupervisionServer from '@/lib/supervision-overview-server'

/**
 * Actions de staff SANS compte cible propre, ancrées sur leur auteur (F42).
 * Liste recopiée volontairement : l'import de valeur créerait un cycle
 * (supervision-overview-server → analytics-server → ce fichier). Le type
 * importé, lui, est effacé à la compilation et suffit à garantir qu'aucune
 * des deux listes ne dérive sans casser le build.
 */
const STAFF_SELF_ANCHORED_ACTIONS: typeof SupervisionServer.STAFF_SELF_ANCHORED_ACTIONS = [
  'account-delete',
  'room-close',
  'site-setting',
]

/**
 * Compte sur lequel ré-ancrer les traces de staff qui, sinon, partiraient en
 * cascade avec le compte effacé. `AccountBanEvent.userId` est obligatoire :
 * sans point d'accroche, pas de ligne. On prend le compte de staff le plus
 * élevé et le plus ancien encore en place — en pratique le fondateur, qu'aucun
 * grade ne peut supprimer. Cet ancrage est purement technique : ces actions
 * sont exclues de l'historique de modération d'une fiche de compte (voir
 * /api/admin/users/[userId]) et le journal ne leur affiche aucune cible.
 */
async function findStaffJournalAnchorId(excludedUserId: string): Promise<string | null> {
  for (const role of ['fondateur', 'superadmin', 'admin']) {
    const anchor = await prisma.user.findFirst({
      where: { role, id: { not: excludedUserId } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    if (anchor) return anchor.id
  }
  return null
}

/**
 * Effacement RGPD d'un compte. Les tables sans clé étrangère vers User
 * (IpSeenLog, indexée par `subjectKey`) et les champs conservés par une
 * relation SetNull (UserFeedback.contactEmail, alimenté automatiquement avec
 * l'email du compte) survivraient au `user.delete` : ils sont traités ici,
 * dans la même transaction et AVANT la suppression du compte.
 *
 * Symétriquement, le journal des actions de staff ne doit PAS partir avec le
 * compte : voir le détail des trois cas dans la transaction ci-dessous.
 *
 * Le journal des parties (OnlineGameSessionPlayer) n'a rien à anonymiser ici
 * et c'est voulu : sa référence au compte est en SetNull et il ne recopie
 * aucun pseudo, si bien que le `user.delete` ci-dessous suffit à ce que la
 * ligne cesse de nommer ce joueur (la Supervision affiche « compte supprimé »).
 * Seule sa DATE DE FIN est en jeu : les salles dont ce compte est l'hôte
 * partent en cascade avec lui, leur partie en cours est donc close avant.
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  const [anchorId, closeHostedGames] = await Promise.all([
    findStaffJournalAnchorId(userId),
    prepareHostedGameSessionsClose(userId),
  ])

  await prisma.$transaction([
    prisma.stats.deleteMany({ where: { userId } }),
    prisma.achievement.deleteMany({ where: { userId } }),
    prisma.session.deleteMany({ where: { userId } }),
    // Visites du compte (AccountVisit) : la cascade du `user.delete` les
    // emporterait, on reste explicite — données d'usage fondées sur le
    // consentement, rien n'a à survivre au compte.
    prisma.accountVisit.deleteMany({ where: { userId } }),
    // Journal d'exploitation (F42) : les traces d'ACTIONS DE STAFF doivent
    // survivre au compte de leur auteur — un journal qui s'efface avec lui
    // n'en est pas un. On anonymise donc l'auteur au lieu de jeter la ligne.
    //
    // Compromis RGPD assumé : ce qui reste ne dit plus QUI a agi (`actorId`
    // vidé, aucun nom ni email recopié), seulement qu'une action
    // d'exploitation a eu lieu, laquelle, sur quoi et quand — le minimum pour
    // que le journal reste opposable. À l'inverse, les sanctions SUBIES par ce
    // compte sont bien effacées : ce sont ses données à lui.
    //
    // 1) Actions faites PAR ce compte SUR un autre compte : la ligne
    //    appartient à la cible, elle reste ; seul l'auteur est anonymisé.
    prisma.accountBanEvent.updateMany({
      where: { actorId: userId, userId: { not: userId } },
      data: { actorId: null },
    }),
    // 2) Actions de staff sans cible propre, ancrées sur leur auteur : la
    //    cascade du `user.delete` les emporterait. Ré-ancrées sur un compte
    //    de staff pérenne, puis anonymisées. Sans compte d'ancrage
    //    disponible, elles suivent le sort du compte (rien à faire de plus
    //    sans modèle d'audit dédié).
    ...(anchorId
      ? [
          prisma.accountBanEvent.updateMany({
            where: { userId, action: { in: [...STAFF_SELF_ANCHORED_ACTIONS] } },
            data: { userId: anchorId, actorId: null },
          }),
        ]
      : []),
    // 3) Ce qui reste ancré sur ce compte, ce sont les sanctions qu'il a
    //    subies : données personnelles, donc effacées (la cascade le ferait,
    //    on reste explicite — l'ordre du tableau garantit que le 2) est
    //    déjà passé).
    prisma.accountBanEvent.deleteMany({ where: { userId } }),
    // $executeRaw : IpSeenLog est manipulé en SQL brut partout (ip-history-server).
    // Seules les lignes `user:<id>` sont rattachables au compte ; celles d'un
    // visiteur non connecté (`visitor:<vid>`) partent avec la purge à 6 mois.
    prisma.$executeRaw`DELETE FROM "IpSeenLog" WHERE "subjectKey" = ${subjectKeyFor(userId, '')}`,
    prisma.userFeedback.updateMany({
      where: { userId },
      data: { contactEmail: null },
    }),
    // Lien navigateur → compte ET date du dernier passage connecté : sans
    // compte, cette date n'a plus d'objet et ne doit pas lui survivre.
    prisma.sitePresence.updateMany({
      where: { userId },
      data: { userId: null, userSeenAt: null },
    }),
    // Journal des parties : `user.delete` emporte en cascade les salles dont
    // ce compte est l'hôte (OnlineRoom.host), sans que rien ne ferme leur
    // partie en cours — elle tombait en « fiabilité inconnue ». L'hôte parti,
    // la table s'arrête maintenant ('left').
    ...closeHostedGames,
    prisma.user.delete({ where: { id: userId } }),
  ])

  // Liste des comptes de test (SiteSetting, JSON d'identifiants) : hors de la
  // transaction, faute d'opération atomique sur une valeur JSON. Le compte
  // effacé en sort — la liste ne garde pas la trace d'un compte qui n'existe
  // plus, les invités de test purgés sous 7 jours compris. Un échec ne remet
  // pas en cause l'effacement : le prochain changement de la liste la nettoie.
  try {
    await setUserExcluded(userId, false)
  } catch (error) {
    console.error('deleteUserAccount: retrait de la liste des comptes de test impossible:', error)
  }
}
