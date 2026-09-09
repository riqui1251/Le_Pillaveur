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
