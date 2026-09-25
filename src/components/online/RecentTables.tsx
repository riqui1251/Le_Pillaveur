"use client"

import { useCallback, useEffect, useId, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { History, RotateCcw } from 'lucide-react'
import { useRouter } from '@/i18n/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { useLocalizedGames, type LocalizedGameMeta } from '@/lib/games-i18n'
import { GameIconById } from '@/components/hub/GameIconById'
import { cn } from '@/lib/utils'

/** Partenaire humain d'une partie (voir GET /api/online/matches). */
type TablePartner = { userId: string; name: string; isFriend: boolean }

type RecentTable = {
  gameId: string
  finishedAt: string
  outcome: 'win' | 'loss'
  rank: number | null
  playerCount: number
  humanCount: number
  partners: TablePartner[]
}

/** Au-delà, la ligne déborde à 375 px : le reste passe dans « +n ». */
const SHOWN_PARTNERS = 3

/** Clé stable d'une partie : la réponse ne porte pas l'identifiant de salle. */
const tableKey = (table: RecentTable) => `${table.gameId}|${table.finishedAt}`

/** Initiale d'un pseudo pour la pastille — le premier caractère visible, emoji compris. */
function initialOf(name: string): string {
  const first = Array.from(name.trim())[0]
  return first ? first.toUpperCase() : '?'
}

/**
 * « Mes dernières tables » (fiche compte, section En ligne) : les dix
 * dernières parties en ligne classées, avec qui, et une revanche par ligne.
 *
 * La revanche ouvre une table PRIVÉE du même jeu puis invite les partenaires
 * AMIS — la route d'invitation refuse tout autre compte (not_friends) ; les
 * autres rejoignent avec le code, et la ligne le dit avant le clic. Contrairement
 * à « Rejouer » sur /jeux, pas de proposition à cocher : la ligne montre déjà
 * qui sera invité, le clic vaut accord.
 */
export function RecentTables() {
  const t = useTranslations('account.tables')
  const format = useFormatter()
  const router = useRouter()
  const games = useLocalizedGames()
  const { user, setPlayMode } = useAuth()
  const { room, createRoom, loading: roomLoading, error: roomError } = useOnlineRoom()
  const userId = user?.id

  const [tables, setTables] = useState<RecentTable[] | null>(null)
  const [failed, setFailed] = useState(false)
  // Horloge des dates relatives, prise à la réception : Date.now() au rendu
  // différerait entre serveur et client.
  const [now, setNow] = useState<number | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  // Revanche ratée, sur quelle ligne. `fromRoom` : l'échec vient de la
  // création de table, dont le hook garde le message déjà traduit.
  const [failure, setFailure] = useState<{ key: string; fromRoom: boolean } | null>(null)
  // Explication « déjà à une table », reliée aux boutons qu'elle désactive.
  const inRoomId = useId()

  const load = useCallback(async (signal?: { cancelled: boolean }) => {
    setFailed(false)
    try {
      const res = await fetch('/api/online/matches', { credentials: 'include' })
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as { tables?: unknown }
      if (signal?.cancelled) return
      setTables(Array.isArray(data.tables) ? (data.tables as RecentTable[]) : [])
      setNow(Date.now())
    } catch {
      if (!signal?.cancelled) setFailed(true)
    }
  }, [])

  // Les effets réseau ne dépendent que de l'identité du compte.
  useEffect(() => {
    if (!userId) return
    const signal = { cancelled: false }
    setTables(null)
    void load(signal)
    return () => {
      signal.cancelled = true
    }
  }, [userId, load])

  if (!user) return null

  const soft = user.ambianceMode === 'soft'
  const gameById = new Map(games.map((g) => [g.id, g]))
  /** Revanche possible : jeu encore ouvert en ligne (et proposé en Soft si besoin). */
  const replayable = (game: LocalizedGameMeta | undefined): game is LocalizedGameMeta =>
    Boolean(game && game.onlineReady && !game.hidden && (!soft || game.softModeReady))

  const busy = roomLoading || busyKey !== null
  // Créer une table fait quitter l'actuelle (leaveOtherRooms, côté serveur) —
  // et marque « parti » si une partie y tourne : pas de revanche depuis ici.
  const seated = room !== null

  const startRematch = async (table: RecentTable, game: LocalizedGameMeta) => {
    if (busy || seated) return
    const key = tableKey(table)
    setBusyKey(key)
    setFailure(null)
    try {
      // Les pages de jeu n'ouvrent la salle qu'en mode en ligne : sans cette
      // bascule, le joueur atterrirait sur la vitrine locale, sa table ouverte
      // dans son dos. Bascule AVANT la création : si elle échoue, aucune table
      // n'a été ouverte pour rien.
      if (user.playMode !== 'online') {
        const modeError = await setPlayMode('online')
        if (modeError) {
          setFailure({ key, fromRoom: false })
          return
        }
      }
      const created = await createRoom(table.gameId, { visibility: 'private' })
      if (!created) {
        setFailure({ key, fromRoom: true })
        return
      }
      // Invitations tolérantes, comme « Rejouer » sur /jeux : un ami perdu
      // entre-temps, banni ou déjà assis fait échouer SON invitation, jamais
      // l'ouverture de la table. Au plus une douzaine d'appels : loin du
      // quota de 20 par minute de la route.
      const friendIds = table.partners.filter((p) => p.isFriend).map((p) => p.userId)
      if (friendIds.length > 0) {
        await Promise.allSettled(
          friendIds.map((friendUserId) =>
            fetch(`/api/online/rooms/${created.id}/invite`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ friendUserId }),
            })
          )
        )
      }
      router.push(game.path)
    } catch {
      setFailure({ key, fromRoom: false })
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <section>
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/70">
        <History className="h-4 w-4 text-amber-300" />
        {t('title')}
      </div>

      {failed ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-2">
          <p className="text-xs text-white/50">{t('error')}</p>
          <button
            type="button"
            onClick={() => { void load() }}
            className="min-h-11 shrink-0 rounded-lg px-3 text-xs font-semibold text-amber-300 transition-colors hover:bg-white/[0.06]"
          >
            {t('retry')}
          </button>
        </div>
      ) : tables === null ? (
        <p
          aria-busy="true"
          className="animate-pulse rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-4 text-center text-xs text-white/40"
        >
          {t('loading')}
        </p>
      ) : tables.length === 0 ? (
        <p className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-4 text-center text-xs text-white/40">
          {t('empty')}
        </p>
      ) : (
        <>
          {seated && (
            <p id={inRoomId} className="mb-2 text-[11px] text-white/45">
              {t('inRoom')}
            </p>
          )}
          <ul className="space-y-1.5">
            {tables.map((table) => {
              const key = tableKey(table)
              const game = gameById.get(table.gameId)
              const title = game?.title ?? table.gameId
              const bots = Math.max(0, table.playerCount - table.humanCount)
              const shown = table.partners.slice(0, SHOWN_PARTNERS)
              const extra = table.partners.length - shown.length
              const friends = table.partners.filter((p) => p.isFriend).length
              const others = table.partners.length - friends
              const canReplay = replayable(game)
              const won = table.outcome === 'win'

              return (
                <li
                  key={key}
                  className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-amber-200">
                      <GameIconById id={table.gameId} className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{title}</p>
                      <p className="truncate text-[11px] text-white/45">
                        {now !== null && (
                          <>
                            <time dateTime={table.finishedAt}>
                              {format.relativeTime(new Date(table.finishedAt), now)}
                            </time>
                            {' · '}
                          </>
                        )}
                        {t('players', { count: table.playerCount })}
                        {bots > 0 && ` ${t('bots', { count: bots })}`}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums',
                        won ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/10 text-red-300/90'
                      )}
                    >
                      {table.rank !== null ? t('rank', { rank: table.rank }) : won ? t('win') : t('loss')}
                      {table.rank !== null && (
                        <span className="sr-only"> · {won ? t('win') : t('loss')}</span>
                      )}
                    </span>
                  </div>

                  {(table.partners.length > 0 || canReplay) && (
                    <div className="mt-2 flex items-center gap-2">
                      {table.partners.length > 0 ? (
                        <div
                          className="flex min-w-0 flex-1 items-center gap-2"
                          aria-label={t('partners', {
                            names: table.partners
                              .map((p) => (p.isFriend ? t('friendMark', { name: p.name }) : p.name))
                              .join(', '),
                          })}
                          role="group"
                        >
                          <span className="flex shrink-0 -space-x-1.5" aria-hidden>
                            {shown.map((p) => (
                              <span
                                key={p.userId}
                                className={cn(
                                  'flex h-7 w-7 items-center justify-center rounded-full border-2 border-felt-deep text-[11px] font-bold',
                                  p.isFriend ? 'bg-amber-500/30 text-amber-100' : 'bg-white/15 text-white/75'
                                )}
                              >
                                {initialOf(p.name)}
                              </span>
                            ))}
                          </span>
                          <span className="min-w-0 truncate text-xs text-white/60" aria-hidden>
                            {shown.map((p) => p.name).join(', ')}
                          </span>
                          {extra > 0 && (
                            <span className="shrink-0 text-xs font-semibold text-white/40" aria-hidden>
                              {t('more', { count: extra })}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="flex-1" />
                      )}

                      {canReplay && (
                        <button
                          type="button"
                          disabled={busy || seated}
                          onClick={() => { void startRematch(table, game) }}
                          // Pendant la création, le texte visible (« Création… »)
                          // devient le nom : un libellé fixe l'aurait masqué.
                          aria-label={busyKey === key ? undefined : t('rematchLabel', { game: title })}
                          aria-busy={busyKey === key || undefined}
                          aria-describedby={seated ? inRoomId : undefined}
                          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-amber-500/90 px-3 text-xs font-semibold text-black transition-colors hover:bg-amber-400 disabled:opacity-50"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          {busyKey === key ? t('rematching') : t('rematch')}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Qui sera invité, dit AVANT le clic : l'invitation est
                      réservée aux amis (route /invite, not_friends). */}
                  {canReplay && table.partners.length > 0 && (
                    <p className="mt-1.5 text-[11px] leading-snug text-white/40">
                      {others === 0
                        ? t('inviteAll', { count: friends })
                        : friends === 0
                          ? t('inviteNone')
                          : t('inviteSome', { count: friends })}
                    </p>
                  )}

                  {failure?.key === key && (
                    <p role="alert" className="mt-1.5 text-[11px] text-orange-300">
                      {(failure.fromRoom && roomError) || t('rematchFailed')}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
