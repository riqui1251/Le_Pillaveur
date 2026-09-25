import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { applyActionToRoom, loadActionRoom } from '@/lib/online/room-actions'
import { PRESENCE_WRITE_INTERVAL_MS, touchMemberPresence } from '@/lib/online-room'
import { onlineErrorBody } from '@/lib/online-errors'
import { readJsonBodyLimited } from '@/lib/rate-limit'

type Params = { params: Promise<{ roomId: string }> }

/**
 * Une intention de jeu ordinaire tient en quelques champs (un identifiant, un
 * index, un mot) : 8 Ko est déjà très large.
 */
const MAX_ACTION_BODY_BYTES = 8 * 1024

/**
 * Sauf pour les jeux de dessin, où l'action PORTE le dessin. Un client honnête
 * envoie chaque trait simplifié et arrondi à 3 décimales (lib/crobard/
 * simplify.ts) : ~6 octets par nombre, séparateur compris, et un trait humain
 * tient en quelques dizaines de points. Au pire, sur le plafond du moteur
 * (CANVAS_MAX_POINTS_PER_STROKE = 300 points = 600 nombres ≈ 3,6 Ko par trait) :
 *  - Crobard : une action = UN trait, donc ~3,6 Ko ;
 *  - Téléphone Dessiné : l'action `submit` porte le dessin ENTIER, accumulé
 *    pendant TELEPHONE_DRAW_MS = 80 s — CANVAS_MAX_STROKES = 400 traits pleins
 *    feraient ~1,4 Mo en théorie, mais 400 hachures de 300 points en 80 s,
 *    ça n'existe pas : un dessin humain simplifié pèse quelques kilo-octets.
 * D'où 512 Ko : de la marge au-dessus d'un dessin humainement possible, et
 * surtout un plafond AVANT le parse — sanitizeStroke ne tronque qu'APRÈS :
 * sans lui, un corps de plusieurs mégaoctets (coordonnées brutes à 17
 * caractères, traits sans fin) était d'abord matérialisé en mémoire.
 */
const MAX_DRAWING_ACTION_BODY_BYTES = 512 * 1024
const DRAWING_GAMES = new Set(['crobard', 'telephone-dessine'])

/**
 * Action de jeu SERVEUR-AUTORITAIRE — GÉNÉRIQUE à tous les jeux du registre
 * (`src/lib/online/game-adapters.ts`).
 *
 * Le client n'envoie qu'une intention : le serveur détient l'état, valide le
 * tour via le moteur du jeu, applique le réducteur, persiste et diffuse en
 * SSE. Le cœur vit dans src/lib/online/room-actions.ts, partagé avec le
 * minuteur de service (room-ticker.ts) ; la route n'y ajoute que ce qui est
 * propre à HTTP — la session, et le plafond du corps de la requête.
 */
export async function POST(request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
  }

  const { roomId } = await params
  const checked = await loadActionRoom(roomId, user.id)
  if (!checked.ok) {
    return NextResponse.json(checked.result.body, { status: checked.result.status })
  }

  // Le coup vaut présence (même règle que le vote « Rejouer ») : en partie,
  // GET /state ne rafraîchit pas `lastSeenAt`, c'est donc lui qui dit qu'un
  // humain est encore à table — au minuteur de service (table abandonnée,
  // room-ticker.ts), à l'écran de fin (`present`) et au quorum de la relance.
  // Décidé sur la trace déjà chargée : une écriture au plus toutes les 30 s,
  // aucune requête sinon (le Crobard envoie un trait par action).
  const self = checked.loaded.room.members.find((m) => m.userId === user.id)
  if (self && self.lastSeenAt.getTime() < Date.now() - PRESENCE_WRITE_INTERVAL_MS) {
    await touchMemberPresence(roomId, user.id)
  }

  // Le plafond dépend du jeu de la salle, connue avant d'avoir lu le corps :
  // seul un jeu de dessin a le droit d'envoyer plus que quelques champs.
  // Refus de corps trop gros : `payload_too_large`, le code générique que
  // withApiRoute/readApiJson posent déjà partout ailleurs (il est traduit dans
  // les 4 langues). Surtout pas `signal_too_large`, réservé au vocal WebRTC :
  // parler de « signal » à qui crée une table n'a aucun sens.
  const parsed = await readJsonBodyLimited<Record<string, unknown> | null>(
    request,
    DRAWING_GAMES.has(checked.loaded.room.gameId ?? '')
      ? MAX_DRAWING_ACTION_BODY_BYTES
      : MAX_ACTION_BODY_BYTES
  )
  if (!parsed.ok && parsed.reason === 'too_large') {
    return NextResponse.json(onlineErrorBody('payload_too_large'), { status: 413 })
  }
  // Corps absent ou illisible : comme avant, on continue avec un objet vide —
  // plusieurs ticks (`advance`, `bot`) n'envoient rien du tout, et le moteur
  // refusera lui-même une intention qui n'a pas de sens.
  const body = (parsed.ok ? parsed.body : null) ?? {}

  const result = await applyActionToRoom(checked.loaded, user.id, body)
  return NextResponse.json(result.body, { status: result.status })
}
