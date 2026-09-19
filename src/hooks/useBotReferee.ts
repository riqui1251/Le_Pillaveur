"use client"

import { useEffect, useRef } from 'react'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'

/**
 * ARBITRAGE DES TICKS DE SERVICE — avec ARBITRE DE SECOURS PAR RANG.
 *
 * Les jeux en ligne sont serveur-autoritaires, mais c'est un CLIENT qui
 * réveille le serveur : « c'est au tour d'un bot → joue un coup », « ce joueur
 * est parti depuis 3 min → remplace-le ». Historiquement un SEUL humain (le
 * premier de la liste) envoyait ces ticks. En soirée il verrouille son
 * téléphone — iOS suspend les minuteurs — et plus aucun bot ne joue : les
 * autres voient « au tour de Bot X » indéfiniment et quittent la table.
 *
 * Correctif : CHAQUE humain encore présent est arbitre, à son RANG. Le rang se
 * lit dans l'ordre du tableau `players` de l'état moteur — le même JSON chez
 * tous les clients, donc un classement STABLE et identique partout. Le rang 0
 * tick avec le délai d'origine (rythme de jeu inchangé), les suivants avec
 * ~4 s de retard par rang. Si le rang 0 a fait son travail, la version d'état a
 * changé et les ticks tardifs sont refusés sans dommage : la route
 * `/api/online/rooms/[roomId]/action` valide par compare-and-swap sur
 * `stateVersion` et répond 409.
 */

/** Retard ajouté par rang d'arbitre de secours. */
export const BOT_REFEREE_BACKUP_STEP_MS = 4000
/** Cadence de la surveillance « joueur parti depuis trop longtemps ». */
export const REPLACE_LEFT_POLL_MS = 5000
/** Cadence de la surveillance « joueur au tour inactif ». */
export const AFK_POLL_MS = 5000

/** Forme minimale d'un joueur, commune à tous les moteurs (cf. replacement.ts). */
export type RefereePlayer = { id: string; isBot?: boolean; leftAt?: number | null }

/**
 * Rang de l'utilisateur parmi les humains encore présents. L'ordre est celui
 * du tableau `players` de l'état moteur : tous les clients lisent le MÊME JSON,
 * le classement est donc identique partout sans négociation. -1 = l'utilisateur
 * n'est pas un humain présent (bot, parti, non joueur) → il n'arbitre pas.
 */
export function botRefereeRank(
  players: readonly RefereePlayer[] | null | undefined,
  userId: string | null | undefined
): number {
  if (!players || !userId) return -1
  return players.filter((p) => !p.isBot && !p.leftAt).findIndex((p) => p.id === userId)
}

/** Retard du tick pour un rang donné — le rang 0 garde le délai d'origine. */
export function botRefereeBackupDelayMs(
  rank: number,
  stepMs: number = BOT_REFEREE_BACKUP_STEP_MS
): number {
  return rank > 0 ? rank * stepMs : 0
}

export type BotRefereeTick = {
  /** Corps de l'action ; `expectedVersion` est ajouté par le hook. */
  body: Record<string, unknown>
  /** Délai avant envoi pour l'arbitre de rang 0 (les suivants s'y ajoutent). */
  delayMs: number
}

export type UseBotRefereeOptions = {
  roomId: string | null | undefined
  stateVersion: number | null | undefined
  userId: string | null | undefined
  players: readonly RefereePlayer[] | null | undefined
  /** false coupe TOUS les ticks (vue absente, partie finie…). */
  enabled: boolean
  /** Coup de bot à demander, ou null si aucun bot n'a la main. */
  botTick?: BotRefereeTick | null
  /** Surveiller les partis → `replace-left` une fois la grâce écoulée. */
  replaceLeft?: boolean
  /** Délai de grâce avant remplacement (le Toucher-Coulé a le sien). */
  graceMs?: number
}

/**
 * Branche les ticks « de service » du jeu et renvoie le rang d'arbitre de
 * l'utilisateur (-1 s'il n'arbitre pas) — utile pour un affichage de debug.
 */
export function useBotReferee(options: UseBotRefereeOptions): number {
  const {
    roomId,
    stateVersion,
    userId,
    players,
    enabled,
    botTick = null,
    replaceLeft = false,
    graceMs = ONLINE_REPLACE_GRACE_MS,
  } = options

  const rank = botRefereeRank(players, userId)

  /**
   * `botTick` porte un délai ALÉATOIRE (tempo du persona) recalculé à chaque
   * rendu, et plusieurs composants rendent toutes les 500 ms (horloge des
   * comptes à rebours). On le lit via une ref : sinon l'effet se relancerait
   * en boucle et AUCUN minuteur n'irait au bout.
   */
  const latest = useRef({ botTick, players, graceMs })
  latest.current = { botTick, players, graceMs }

  useEffect(() => {
    if (!enabled || !roomId || typeof stateVersion !== 'number' || rank < 0) return
    const expectedVersion = stateVersion
    const send = (body: Record<string, unknown>) => {
      void fetch(`/api/online/rooms/${roomId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...body, expectedVersion }),
      })
    }
    // Rang 0 = comportement historique ; rangs suivants = filet de secours.
    const backup = botRefereeBackupDelayMs(rank)

    let botTimer: ReturnType<typeof setTimeout> | undefined
    const tick = latest.current.botTick
    if (tick) {
      botTimer = setTimeout(() => send(tick.body), tick.delayMs + backup)
    }

    let startTimer: ReturnType<typeof setTimeout> | undefined
    let replaceTimer: ReturnType<typeof setInterval> | undefined
    if (replaceLeft) {
      const check = () => {
        const expired = (latest.current.players ?? []).some(
          (p) => !p.isBot && p.leftAt && Date.now() - p.leftAt >= latest.current.graceMs
        )
        if (expired) send({ action: 'replace-left' })
      }
      const start = () => {
        check()
        // Le sondage est le seul tick qui se répète sans fin : les suppléants
        // l'espacent en plus de démarrer plus tard, sinon une table de 16
        // joueurs enverrait 16 requêtes toutes les 5 s pendant tout le délai
        // de grâce, pour un travail qu'un seul client suffit à faire.
        replaceTimer = setInterval(check, REPLACE_LEFT_POLL_MS + backup)
      }
      if (backup === 0) start()
      else startTimer = setTimeout(start, backup)
    }

    return () => {
      if (botTimer) clearTimeout(botTimer)
      if (startTimer) clearTimeout(startTimer)
      if (replaceTimer) clearInterval(replaceTimer)
    }
  }, [enabled, roomId, stateVersion, rank, replaceLeft])

  return rank
}

/**
 * TICK « ADVANCE » À L'ÉCHÉANCE DE PHASE — même arbitrage par rang.
 *
 * Les phases chronométrées (vote 60 s, question de quiz 15 s…) posent
 * `phaseEndsAt` côté serveur (cf. phase-clock.ts) et attendent qu'un client
 * réveille le moteur à l'échéance. Historiquement TOUS les clients envoyaient
 * ce tick avec un jitter de 300-1 000 ms : à 16 joueurs, 15 requêtes prenaient
 * un 409 à CHAQUE transition — une rafale par phase, pour rien. Même remède
 * que les ticks bot : le rang 0 tire à l'échéance (petite marge, l'horloge
 * serveur fait foi), les suivants avec un pas de retard par rang, et la
 * version d'état qui bouge coupe les minuteurs des suppléants avant qu'ils ne
 * tirent. Un téléphone verrouillé au rang 0 ne bloque donc rien : le rang 1
 * prend le relais 4 s plus tard.
 */

/**
 * Marge après l'échéance : le serveur refuse NOT_EXPIRED si on tire trop tôt,
 * or `dueAt` est une date SERVEUR comparée à l'horloge du téléphone — 300 ms,
 * soit le plancher de l'ancien jitter (300 + 0..700 ms), et non moins : en
 * solo contre des bots il n'y a pas de rang 1 pour rattraper un tick refusé.
 */
export const ADVANCE_TICK_MARGIN_MS = 300
/**
 * Plancher du délai : un état reçu déjà périmé ne tire pas « à froid » — le
 * flux SSE a souvent la version suivante en route.
 */
export const ADVANCE_TICK_MIN_DELAY_MS = 250
/** Écart entre deux reprises d'un tick parti trop tôt (horloge en avance). */
export const ADVANCE_TICK_EARLY_RETRY_MS = 1000
/** Reprises au plus : couvre une horloge en avance de ~3 s, puis on s'arrête. */
export const ADVANCE_TICK_EARLY_RETRIES = 3

/**
 * Un tick « advance » refusé 409 SANS conflit de version est parti trop tôt
 * (NOT_EXPIRED : le téléphone est en avance sur le serveur) ou juste derrière
 * un autre (PHASE_CHANGED) — la route rend le même `action_failed` pour les
 * deux. Dans le premier cas personne d'autre ne le renverra : à une table le
 * rang 1 rattrape 4 s plus tard, mais en solo il n'y a pas de rang 1, et le
 * sondage ne réarme rien tant que la version ne bouge pas — la phase (vote,
 * question de quiz…) restait figée. On reprend donc quelques fois à 1 s
 * d'écart. Un conflit de version dit que l'état a bougé : l'effet se réarme
 * sur la nouvelle version, inutile d'insister. PHASE_CHANGED reprend pour
 * rien (un 409 de plus, puis la nouvelle version coupe tout).
 */
export function shouldRetryAdvanceTick(
  status: number,
  error: string | undefined,
  attempt: number
): boolean {
  if (status !== 409 || error === 'version_conflict') return false
  return attempt < ADVANCE_TICK_EARLY_RETRIES
}

export type AdvanceTickTarget = {
  /** Clé de phase de la vue : le serveur répond PHASE_CHANGED si elle a bougé. */
  phaseKey: string
  /** Échéance serveur (epoch ms) — chaque jeu garde son propre calcul. */
  dueAt: number
  /**
   * Réarmement après l'échéance, pour une phase que SEUL ce tick fait bouger
   * (mise en place du 12/20) : un coup unique perdu la figerait pour de bon.
   */
  retryMs?: number
}

/** Délai avant le tick « advance » pour un rang — le rang 0 vise l'échéance. */
export function advanceTickDelayMs(
  dueAt: number,
  rank: number,
  now: number = Date.now(),
  stepMs: number = BOT_REFEREE_BACKUP_STEP_MS
): number {
  return (
    Math.max(ADVANCE_TICK_MIN_DELAY_MS, dueAt - now + ADVANCE_TICK_MARGIN_MS) +
    botRefereeBackupDelayMs(rank, stepMs)
  )
}

/**
 * Arme le minuteur du tick « advance » et renvoie sa fonction d'annulation.
 * Logique pure (testable) : le hook n'ajoute que l'envoi réseau et le
 * réarmement à chaque changement de version ou de phase.
 */
export function scheduleAdvanceTick(options: {
  dueAt: number
  rank: number
  retryMs?: number
  send: () => void
}): () => void {
  const { dueAt, rank, retryMs = 0, send } = options
  const backup = botRefereeBackupDelayMs(rank)
  let retry: ReturnType<typeof setInterval> | undefined
  const timer = setTimeout(() => {
    send()
    // Les suppléants espacent aussi leurs relances (cf. replace-left).
    if (retryMs > 0) retry = setInterval(send, retryMs + backup)
  }, advanceTickDelayMs(dueAt, rank))
  return () => {
    clearTimeout(timer)
    if (retry) clearInterval(retry)
  }
}

export type UseAdvanceTickOptions = {
  roomId: string | null | undefined
  stateVersion: number | null | undefined
  userId: string | null | undefined
  players: readonly RefereePlayer[] | null | undefined
  /** false coupe le tick (vue absente, partie finie…). */
  enabled: boolean
  /** Échéance à honorer, ou null si la phase courante n'a pas de chrono. */
  advance: AdvanceTickTarget | null
}

/**
 * Tick « advance » à l'échéance de phase, arbitré par rang. Tick de service :
 * envoyé via fetch, 409 muet (pas de useGameAction, rien à annoncer au
 * joueur) — mais lu, pour reprendre un tick parti trop tôt (cf.
 * shouldRetryAdvanceTick). Renvoie le rang d'arbitre (-1 = n'arbitre pas).
 */
export function useAdvanceTick(options: UseAdvanceTickOptions): number {
  const { roomId, stateVersion, userId, players, enabled, advance } = options

  const rank = botRefereeRank(players, userId)
  // Dépendances primitives : `advance` est un objet neuf à chaque rendu, et
  // plusieurs composants rendent toutes les 500 ms (horloge du compte à
  // rebours). Le minuteur ne se réarme qu'à un vrai changement de version,
  // de phase ou d'échéance.
  const phaseKey = advance?.phaseKey ?? null
  const dueAt = advance?.dueAt ?? null
  const retryMs = advance?.retryMs ?? 0

  useEffect(() => {
    if (!enabled || !roomId || typeof stateVersion !== 'number' || rank < 0) return
    if (phaseKey === null || dueAt === null) return
    const expectedVersion = stateVersion
    let cancelled = false
    let earlyRetry: ReturnType<typeof setTimeout> | undefined
    const send = (attempt: number) => {
      void fetch(`/api/online/rooms/${roomId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'advance', phaseKey, expectedVersion }),
      })
        .then(async (res) => {
          // Le corps n'est lu que sur un 409 : ailleurs il ne sert à rien.
          const code =
            res.status === 409
              ? await res
                  .json()
                  .then((data: { error?: unknown }) =>
                    typeof data?.error === 'string' ? data.error : undefined
                  )
                  .catch(() => undefined)
              : undefined
          if (cancelled || !shouldRetryAdvanceTick(res.status, code, attempt)) return
          earlyRetry = setTimeout(() => send(attempt + 1), ADVANCE_TICK_EARLY_RETRY_MS)
        })
        .catch(() => {
          // Raté réseau : rien à reprendre ici, le bandeau de connexion et le
          // sondage s'en chargent.
        })
    }
    const cancel = scheduleAdvanceTick({ dueAt, rank, retryMs, send: () => send(0) })
    return () => {
      cancelled = true
      cancel()
      if (earlyRetry) clearTimeout(earlyRetry)
    }
  }, [enabled, roomId, stateVersion, rank, phaseKey, dueAt, retryMs])

  return rank
}

export type UseAfkTickOptions = {
  roomId: string | null | undefined
  stateVersion: number | null | undefined
  userId: string | null | undefined
  /** Joueur au tour surveillé (null = personne à surveiller). */
  targetId: string | null | undefined
  /** false coupe le tick (phase sans acteur unique, dernier humain…). */
  enabled: boolean
  graceMs?: number
}

/**
 * Tick anti-AFK. Contrairement aux ticks bot, il n'est PAS réservé à un
 * arbitre : TOUS les clients sauf le joueur surveillé l'envoient — le serveur
 * revalide l'inactivité avec SA propre horloge (`OnlineRoom.updatedAt`) avant
 * d'expulser, donc les demandes concurrentes sont inoffensives.
 *
 * Renvoie l'instant LOCAL de début du tour courant : base d'affichage des
 * comptes à rebours (l'autorité reste l'horloge serveur).
 */
export function useAfkTick(options: UseAfkTickOptions): number {
  const {
    roomId,
    stateVersion,
    userId,
    targetId,
    enabled,
    graceMs = ONLINE_REPLACE_GRACE_MS,
  } = options

  // Remis à zéro à chaque écriture d'état serveur (= nouveau tour).
  const turnStartRef = useRef({ version: stateVersion, at: Date.now() })
  if (turnStartRef.current.version !== stateVersion) {
    turnStartRef.current = { version: stateVersion, at: Date.now() }
  }

  useEffect(() => {
    if (!enabled || !roomId || typeof stateVersion !== 'number') return
    if (!userId || !targetId || targetId === userId) return
    const expectedVersion = stateVersion
    const check = () => {
      if (Date.now() - turnStartRef.current.at < graceMs) return
      void fetch(`/api/online/rooms/${roomId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'replace-afk', expectedVersion }),
      })
    }
    const timer = setInterval(check, AFK_POLL_MS)
    return () => clearInterval(timer)
  }, [enabled, roomId, stateVersion, userId, targetId, graceMs])

  return turnStartRef.current.at
}
