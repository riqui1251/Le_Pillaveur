import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withApiRoute } from '@/lib/api-route'
import { parseRoomSettings } from '@/lib/online-game-state'
import { getGameAdapter } from '@/lib/online/game-adapters'
import {
  FRIDAY_TABLE,
  fridayTableStatus,
  parseFridayTableLang,
  pickFridayTable,
  type FridayTableCandidate,
  type FridayTableResponse,
} from '@/lib/friday-table'

export const dynamic = 'force-dynamic'

/**
 * Table ouverte du vendredi (src/lib/friday-table.ts) : où en est le
 * rendez-vous, et LA table publique d'Imposteur à rejoindre pendant la
 * soirée — la plus peuplée qui a encore de la place, dans la langue de la
 * page (`?lang=`).
 *
 * PUBLIQUE, sans compte : le bandeau s'adresse justement au nouveau venu,
 * qui n'a souvent pas encore de session. D'où trois règles :
 * - rien de personnel : un code de table PUBLIQUE (déjà au guichet de tout
 *   connecté, et seul moyen de la rejoindre) et deux effectifs — jamais un
 *   pseudo, jamais un identifiant de salle ;
 * - LECTURE SEULE : contrairement au guichet (buildLobbyList purge les tables
 *   abandonnées à chaque chargement), un visiteur anonyme ne déclenche ici
 *   aucune écriture ; les tables abandonnées sont écartées par le filtre de
 *   présence, pas supprimées ;
 * - hors soirée, aucune requête : le statut se calcule, la table n'existe pas.
 *
 * Pourquoi pas buildLobbyList / le cache du guichet : ils chargent les
 * pseudos de tous les membres (le guichet les affiche) et ignorent la langue
 * de la table ; leur cache partagé attend une réponse de guichet complète.
 * Une requête dédiée, bornée et sans jointure sur les comptes, coûte moins.
 */

/**
 * Cache mémoire de la liste des candidates (toutes langues), mono-instance.
 * Court : le bandeau sonde toutes les 30 s pendant la soirée, et deux
 * visiteurs qui ouvrent la table à quelques secondes d'écart doivent voir la
 * première pour s'y asseoir au lieu d'en ouvrir une seconde. Le bandeau
 * revérifie d'ailleurs juste avant d'ouvrir — c'est ce délai qui borne la
 * fenêtre de doublon.
 */
const CACHE_MS = 5_000

/**
 * Une table dont plus aucun membre n'a donné signe de vie depuis 5 min est
 * abandonnée : c'est le seuil de purge des tables en attente
 * (STALE_WAITING_ROOM_MS, src/lib/online-room.ts — non exporté). La même
 * table disparaît donc d'ici au moment où le guichet la purgerait.
 */
const ALIVE_MS = 5 * 60 * 1000

/** Borne de coût : un vendredi n'aligne jamais trente tables publiques d'Imposteur. */
const SCAN_MAX = 30

type CandidatesCache = { rows: FridayTableCandidate[]; freshUntil: number }

let cache: CandidatesCache | null = null
/** Chargement en cours, partagé par les sondages qui arrivent entre-temps. */
let inFlight: Promise<FridayTableCandidate[]> | null = null

async function loadCandidates(nowMs: number): Promise<FridayTableCandidate[]> {
  const rooms = await prisma.onlineRoom.findMany({
    where: {
      status: 'waiting',
      visibility: 'public',
      gameId: FRIDAY_TABLE.gameId,
      members: { some: { lastSeenAt: { gte: new Date(nowMs - ALIVE_MS) } } },
    },
    // Scalaires et effectif seulement : aucune jointure sur les comptes,
    // donc aucun pseudo ne peut sortir d'ici, même par erreur.
    select: {
      code: true,
      settingsJson: true,
      createdAt: true,
      _count: { select: { members: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: SCAN_MAX,
  })
  return rooms.map((room) => ({
    code: room.code,
    players: room._count.members,
    // Une table sans langue enregistrée est française : c'est le repli de
    // POST /api/online/rooms quand le créateur n'a pas de cookie de langue.
    lang: parseFridayTableLang(parseRoomSettings(room.settingsJson).lang),
    createdAtMs: room.createdAt.getTime(),
  }))
}

async function readCandidates(nowMs: number): Promise<FridayTableCandidate[]> {
  if (cache && nowMs < cache.freshUntil) return cache.rows
  if (inFlight) return inFlight
  const pending = loadCandidates(nowMs)
    .then((rows) => {
      cache = { rows, freshUntil: Date.now() + CACHE_MS }
      return rows
    })
    .finally(() => {
      if (inFlight === pending) inFlight = null
    })
  inFlight = pending
  return pending
}

export const GET = withApiRoute('online/friday-table GET', async (request: Request) => {
  const now = new Date()
  const status = fridayTableStatus(now)

  let body: FridayTableResponse = { status, table: null }
  if (status.live) {
    const lang = parseFridayTableLang(new URL(request.url).searchParams.get('lang'))
    // Plafond d'humains de POST /rooms/join (borne de l'adaptateur) : une
    // table annoncée « avec de la place » doit accepter le visiteur.
    const maxPlayers = getGameAdapter(FRIDAY_TABLE.gameId)?.maxPlayers ?? Number.MAX_SAFE_INTEGER
    body = { status, table: pickFridayTable(await readCandidates(now.getTime()), lang, maxPlayers) }
  }

  // Même réponse pour tous (par langue) : un cache navigateur de 5 s, comme
  // le cache serveur, évite qu'un onglet rafraîchi en boucle ne rejoue la
  // lecture. Le bandeau contourne ce cache quand il revérifie avant d'ouvrir.
  return NextResponse.json(body, { headers: { 'Cache-Control': 'public, max-age=5' } })
})
