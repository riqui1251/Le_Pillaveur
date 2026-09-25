import { prisma } from '@/lib/prisma'
import { getGameAdapter, type GameAdapter, type ServiceTick } from '@/lib/online/game-adapters'
import { applyRoomAction } from '@/lib/online/room-actions'

/**
 * LE SERVEUR SE RÉVEILLE SEUL — un minuteur de service par salle en partie.
 *
 * Les bots et les fins de phase dépendent de ticks ENVOYÉS PAR LES CLIENTS
 * (useBotReferee / useAdvanceTick, arbitrage par rang). Tous les téléphones
 * verrouillés — la nuit du Loup-Garou où seuls des bots agissent, un débat de
 * 3 min, une table solo contre des bots — et plus rien n'avançait ; l'écran
 * TV, en lecture seule, n'envoie aucun tick et restait sur un chrono figé à
 * 0:00. Le serveur s'applique donc lui-même le tick que le client aurait
 * envoyé (GameAdapter.serviceTick), s'il ne l'a pas été à temps.
 *
 * UN FILET, PAS UN CONCURRENT : le serveur tire à l'échéance + 1,5 s
 * (SERVICE_TICK_MARGIN_MS), le client de rang 0 à l'échéance + 300 ms
 * (ADVANCE_TICK_MARGIN_MS, useBotReferee.ts) — et, pour un coup de bot, à la
 * borne haute du tempo du persona que le client tire au hasard (cf.
 * SERVICE_TEMPO, game-adapters.ts). Quand le client fait son travail, son
 * écriture réarme le minuteur avant qu'il ne sonne : le serveur n'agit
 * jamais. Quand les deux se croisent, le compare-and-swap sur `stateVersion`
 * ne laisse passer qu'un tick : le 409 de l'autre est la règle, pas un
 * incident.
 *
 * Cycle de vie :
 *  - armé après CHAQUE écriture d'état de la route action (applyActionToRoom),
 *    après chaque lancement ou relance (launchOnlineRoom), et après un départ
 *    ou un retour en pleine partie (DELETE /rooms/[roomId], /rooms/join,
 *    changement de table — leaveOtherRooms) ;
 *  - au déclenchement : relit la salle ; version changée depuis l'armement
 *    (vote « Rejouer »… : écritures qui ne réarment pas elles-mêmes) →
 *    réarmé sur l'état frais, sans agir ; sinon le tick part avec
 *    `expectedVersion` — sauf table ABANDONNÉE (personne vu depuis
 *    SERVICE_ABANDONED_MS) : coupé sans agir ;
 *  - un tick `bot` refusé (aucun bot concerné) retombe sur l'échéance de la
 *    même version ; un `advance` refusé n'est pas retenté — la prochaine
 *    écriture réarmera ;
 *  - coupé dès que la salle n'est plus « playing », n'existe plus, ou que la
 *    partie est finie ;
 *  - JAMAIS plus d'un minuteur par salle, et aucun au-delà de 10 min
 *    (SERVICE_TICK_MAX_WAIT_MS) : une échéance plus lointaine est visée par
 *    étapes, en relisant la salle à chacune.
 *
 * MONO-INSTANCE, comme le bus temps réel (room-bus.ts) : un seul conteneur en
 * production. Le registre vit sur globalThis — le même pour les routes et
 * pour instrumentation.ts, qui réarme les parties en cours au démarrage
 * (rearmPlayingRooms) : un redéploiement ne fige plus les tables.
 *
 * RGPD : les journaux de ce module ne portent qu'un identifiant de jeu, un
 * code d'erreur ou le nom d'une classe d'erreur — ni pseudo, ni e-mail, ni IP.
 */

/**
 * Retard du serveur sur l'échéance. Plus long que la marge du client de rang
 * 0 (300 ms) : un téléphone éveillé passe toujours avant. Assez court pour
 * qu'une table devant la seule TV ne voie pas le chrono s'attarder à 0:00.
 */
export const SERVICE_TICK_MARGIN_MS = 1_500

/** Plus longue attente d'un seul minuteur : au-delà, on vise l'échéance par étapes. */
export const SERVICE_TICK_MAX_WAIT_MS = 10 * 60 * 1000

/**
 * Au-delà de ce délai sans AUCUN membre vu (`lastSeenAt` : un coup joué, un
 * tick d'arbitre, un sondage de la salle complète), la table est tenue pour
 * abandonnée et le serveur cesse de la servir. Sans ce seuil, une table
 * désertée onglets fermés — sans « Quitter », donc sans `leftAt` — était
 * jouée jusqu'au bout par le serveur : résultats, XP et séries enregistrés
 * pour des absents, et chaque écriture de service rajeunissait `updatedAt`,
 * ce qui tenait la purge des parties (60 min) à l'écart. Dix minutes couvrent
 * les téléphones verrouillés d'une vraie tablée (nuit du Loup-Garou, débat
 * de 3 min) : un humain y joue au moins un coup dans l'intervalle. Le premier
 * coup d'un revenant réarme le minuteur (route action).
 */
export const SERVICE_ABANDONED_MS = 10 * 60 * 1000

type PlannedTick = {
  /** Version d'état sur laquelle le tick a été calculé. */
  stateVersion: number
  tick: ServiceTick
  /** Le tick bot de cette version a déjà été refusé : seule l'échéance reste. */
  skipBot: boolean
}

type TickerEntry = PlannedTick & { timer: ReturnType<typeof setTimeout> }

type TickerRegistry = {
  entries: Map<string, TickerEntry>
  /**
   * Dernier armement demandé, par salle. Un armement qui relit la base peut
   * être doublé par un plus récent pendant sa lecture : il s'efface alors
   * devant lui plutôt que de reposer un minuteur sur un état périmé.
   */
  tickets: Map<string, number>
  seq: number
}

/** Clé globale du registre — même principe que SCHEDULER_GUARD (scheduler.ts). */
const REGISTRY_KEY: unique symbol = Symbol.for('lepillaveur.roomTicker')

type TickerGlobal = typeof globalThis & { [REGISTRY_KEY]?: TickerRegistry }

function registry(): TickerRegistry {
  const holder = globalThis as TickerGlobal
  let reg = holder[REGISTRY_KEY]
  if (!reg) {
    reg = { entries: new Map(), tickets: new Map(), seq: 0 }
    holder[REGISTRY_KEY] = reg
  }
  return reg
}

function takeTicket(roomId: string): number {
  const reg = registry()
  reg.seq += 1
  reg.tickets.set(roomId, reg.seq)
  return reg.seq
}

/** Ligne de salle lue par le minuteur : rien de plus que ce qu'il lui faut. */
type TickerRoomRow = {
  status: string
  gameId: string | null
  gameStateJson: string | null
  stateVersion: number
}

const TICKER_ROOM_SELECT = {
  status: true,
  gameId: true,
  gameStateJson: true,
  stateVersion: true,
} as const

/** Nom de classe d'erreur seulement (RGPD) : un message Prisma recopie la ligne. */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error
}

/**
 * Au moins un membre vu depuis SERVICE_ABANDONED_MS ? Une ligne au plus, par
 * l'index [roomId, userId] ; lue seulement quand un tick est sur le point de
 * partir, jamais à l'armement.
 */
async function someoneStillAtTable(roomId: string, now: number = Date.now()): Promise<boolean> {
  const seen = await prisma.onlineRoomMember.findFirst({
    where: { roomId, lastSeenAt: { gte: new Date(now - SERVICE_ABANDONED_MS) } },
    select: { userId: true },
  })
  return seen !== null
}

/** Plus rien à attendre : minuteur coupé, armements encore en vol périmés. */
export function cancelRoomTicker(roomId: string): void {
  const reg = registry()
  const entry = reg.entries.get(roomId)
  if (entry) clearTimeout(entry.timer)
  reg.entries.delete(roomId)
  reg.tickets.delete(roomId)
}

function schedule(roomId: string, planned: PlannedTick): void {
  const reg = registry()
  const previous = reg.entries.get(roomId)
  if (previous) clearTimeout(previous.timer)
  const wait = Math.min(
    SERVICE_TICK_MAX_WAIT_MS,
    Math.max(0, planned.tick.dueAt + SERVICE_TICK_MARGIN_MS - Date.now())
  )
  const entry: TickerEntry = {
    ...planned,
    timer: setTimeout(() => {
      void fire(roomId, entry)
    }, wait),
  }
  // Un minuteur de service ne retient jamais le processus à l'arrêt.
  ;(entry.timer as unknown as { unref?: () => void }).unref?.()
  reg.entries.set(roomId, entry)
}

/** Planifie le tick de service d'un état connu — ou coupe s'il n'y a rien à attendre. */
function plan(
  roomId: string,
  adapter: GameAdapter | null,
  state: unknown,
  stateVersion: number,
  skipBot: boolean
): void {
  if (!adapter?.serviceTick || !state || adapter.isFinished(state)) {
    cancelRoomTicker(roomId)
    return
  }
  const tick = adapter.serviceTick(state, Date.now(), { skipBot })
  if (!tick) {
    cancelRoomTicker(roomId)
    return
  }
  schedule(roomId, { stateVersion, tick, skipBot })
}

function planFromRow(roomId: string, row: TickerRoomRow | null, skipBot = false): void {
  if (!row || row.status !== 'playing') {
    cancelRoomTicker(roomId)
    return
  }
  const adapter = getGameAdapter(row.gameId)
  plan(roomId, adapter, adapter ? adapter.parse(row.gameStateJson) : null, row.stateVersion, skipBot)
}

/**
 * Arme (ou réarme) le minuteur d'une salle d'après son état EN BASE. Pour les
 * écritures qui ne passent pas par la route action : lancement, relance,
 * départ ou retour en pleine partie, redémarrage. Ne lève jamais — le minuteur est un filet, son échec ne doit
 * rien casser chez l'appelant.
 */
export async function armRoomTicker(roomId: string): Promise<void> {
  const ticket = takeTicket(roomId)
  try {
    const row = await prisma.onlineRoom.findUnique({
      where: { id: roomId },
      select: TICKER_ROOM_SELECT,
    })
    // Un armement plus récent a pris la main pendant la lecture.
    if (registry().tickets.get(roomId) !== ticket) return
    planFromRow(roomId, row)
  } catch (error) {
    console.error('[room-ticker] armement en échec :', errorName(error))
  }
}

/**
 * Arme le minuteur d'après l'état que l'appelant VIENT d'écrire, sans relire
 * la base — la route action, juste après son compare-and-swap. Synchrone et
 * ne lève jamais : l'écriture est faite, la réponse au joueur ne doit pas
 * dépendre du filet.
 */
export function armRoomTickerForState(
  roomId: string,
  written: { gameId: string | null; state: unknown; stateVersion: number }
): void {
  takeTicket(roomId)
  try {
    plan(roomId, getGameAdapter(written.gameId), written.state, written.stateVersion, false)
  } catch (error) {
    cancelRoomTicker(roomId)
    console.error('[room-ticker] armement en échec :', errorName(error))
  }
}

async function fire(roomId: string, entry: TickerEntry): Promise<void> {
  const reg = registry()
  // Remplacé ou coupé entre-temps : ce minuteur n'a plus d'objet.
  if (reg.entries.get(roomId) !== entry) return
  reg.entries.delete(roomId)
  const ticket = reg.tickets.get(roomId)
  const stillLatest = () => reg.tickets.get(roomId) === ticket
  try {
    const row = await prisma.onlineRoom.findUnique({
      where: { id: roomId },
      select: TICKER_ROOM_SELECT,
    })
    if (!stillLatest()) return
    if (!row || row.status !== 'playing') {
      cancelRoomTicker(roomId)
      return
    }
    if (row.stateVersion !== entry.stateVersion) {
      // L'état a bougé par une écriture qui ne réarme pas (changement de
      // table, vote « Rejouer »…) : on recalcule sur l'état frais, sans agir.
      planFromRow(roomId, row)
      return
    }
    if (Date.now() < entry.tick.dueAt + SERVICE_TICK_MARGIN_MS) {
      // Étape d'une attente de plus de 10 min : l'échéance n'y est pas encore.
      schedule(roomId, entry)
      return
    }
    // Personne à table depuis SERVICE_ABANDONED_MS : on ne joue pas la
    // partie de fantômes. Coupé sans agir — la salle se fige et la purge des
    // parties abandonnées la ramasse ; un revenant qui joue réarme.
    const attended = await someoneStillAtTable(roomId)
    if (!stillLatest()) return
    if (!attended) {
      cancelRoomTicker(roomId)
      return
    }

    const result = await applyRoomAction(roomId, null, {
      ...entry.tick.body,
      expectedVersion: entry.stateVersion,
    })
    // Réussi : l'écriture a déjà réarmé le minuteur sur la version suivante.
    if (result.status === 200 && result.body.ok === true) return
    // Un armement plus récent (écriture d'un client, relance) a pris la main.
    if (!stillLatest()) return
    if (result.body.error === 'version_conflict') {
      // Un client est passé avant : c'est la règle. Réarmé sur l'état frais,
      // au cas où son écriture ne l'aurait pas fait elle-même.
      await armRoomTicker(roomId)
      return
    }
    if (entry.tick.body.action === 'bot' && !entry.skipBot) {
      // Tick bot refusé (NOT_BOT_TURN du tick « au cas où », soutien au
      // hasard de l'Espion…) : une fois par version, comme le client — reste
      // l'échéance de phase de cette même version.
      planFromRow(roomId, row, true)
      return
    }
    // Échéance refusée : rien à retenter sur cette version, la prochaine
    // écriture réarmera. Anormal (l'horloge serveur fait foi) : journalisé.
    cancelRoomTicker(roomId)
    console.warn(
      '[room-ticker] tick de service refusé :',
      row.gameId ?? 'jeu inconnu',
      typeof result.body.error === 'string' ? result.body.error : result.status
    )
  } catch (error) {
    console.error('[room-ticker] tick de service en échec :', errorName(error))
  }
}

/**
 * Réarme, au démarrage du serveur, les salles restées « playing » : leurs
 * minuteurs vivaient dans le processus précédent. Une échéance déjà passée
 * part aussitôt — la partie reprend là où le redéploiement l'avait laissée —,
 * sauf sur une table que personne n'a vue depuis SERVICE_ABANDONED_MS : elle
 * reste figée pour la purge.
 * Une lecture par salle plutôt qu'un seul gros `findMany` : les états de
 * dessin pèsent lourd, inutile de tous les tenir en mémoire à la fois.
 * Rend le nombre de salles effectivement armées.
 */
export async function rearmPlayingRooms(): Promise<number> {
  const rooms = await prisma.onlineRoom.findMany({
    where: { status: 'playing' },
    select: { id: true },
  })
  let armed = 0
  for (const { id } of rooms) {
    await armRoomTicker(id)
    if (registry().entries.has(id)) armed += 1
  }
  return armed
}

/** Nombre de minuteurs posés — pour une sonde ou un test : aucun identifiant. */
export function roomTickerCount(): number {
  return registry().entries.size
}

/** Coupe tout — réservé aux tests. */
export function clearRoomTickers(): void {
  const reg = registry()
  for (const entry of reg.entries.values()) clearTimeout(entry.timer)
  reg.entries.clear()
  reg.tickets.clear()
}
