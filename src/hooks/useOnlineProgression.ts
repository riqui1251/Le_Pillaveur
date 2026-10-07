'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useAuth } from '@/hooks/useAuth'
import type { XpGainDetail } from '@/lib/online/xp'

/** Progression du compte (XP/niveau/cosmétiques débloqués) — voir /api/online/progression. */
export type OnlineProgression = {
  xp: number
  level: number
  current: number
  required: number
  unlockedKeys: string[]
  grantedKeys: string[]
  /** Série quotidienne : jours consécutifs et dernier jour crédité (Paris, 'YYYY-MM-DD'). */
  streakCount: number
  streakLastDay: string | null
}

/** Corps utile de GET /api/online/progression. */
export type ProgressionPayload = {
  progression: OnlineProgression
  /** Dernier gain crédité au joueur (à confronter à `progression.xp` : cf. gainForCurrentXp). */
  lastGain: XpGainDetail | null
  /** Le serveur juge le moment venu de demander un avis sur la 1re partie. */
  firstGameFeedback: boolean
}

/**
 * Instantané PARTAGÉ par tous les composants abonnés. `seq` = numéro de la
 * dernière requête ARRIVÉE (succès ou échec) — 0 : aucune. Les numéros sont
 * globaux et croissants : c'est ce qui permet de dire « une réponse postérieure
 * à mon montage est arrivée » sans horloge.
 *
 * `dataSeq` = numéro de la dernière requête RÉUSSIE, celle dont viennent les
 * données. Les deux divergent après un échec : la requête est arrivée (fin du
 * chargement) mais les données restent celles d'avant — sur l'écran de fin,
 * celles d'AVANT la partie. Sans cette distinction, la bannière d'XP prenait
 * la fin du chargement pour une lecture fraîche et réannonçait le gain de la
 * partie précédente (il colle à l'XP d'avant : gainForCurrentXp le validait).
 */
export type ProgressionSnapshot = {
  /** Compte auquel appartient l'instantané (null : aucun). */
  userId: string | null
  progression: OnlineProgression | null
  lastGain: XpGainDetail | null
  firstGameFeedback: boolean
  seq: number
  dataSeq: number
}

const EMPTY_SNAPSHOT: ProgressionSnapshot = Object.freeze({
  userId: null,
  progression: null,
  lastGain: null,
  firstGameFeedback: false,
  seq: 0,
  dataSeq: 0,
})

/**
 * Lecture tolérante de la réponse : un serveur d'une version antérieure (pas
 * de série, pas de `firstGameFeedback`) ne doit rien casser côté client —
 * le déploiement n'est pas atomique entre un onglet ouvert et le serveur.
 */
export function parseProgressionPayload(json: unknown): ProgressionPayload | null {
  const body = json as {
    progression?: Partial<OnlineProgression> | null
    lastGain?: XpGainDetail | null
    firstGameFeedback?: unknown
  } | null
  const p = body?.progression
  if (!p || typeof p.xp !== 'number' || typeof p.level !== 'number') return null
  return {
    progression: {
      xp: p.xp,
      level: p.level,
      current: p.current ?? 0,
      required: p.required ?? 0,
      unlockedKeys: p.unlockedKeys ?? [],
      grantedKeys: p.grantedKeys ?? [],
      streakCount: p.streakCount ?? 0,
      streakLastDay: p.streakLastDay ?? null,
    },
    lastGain: body?.lastGain ?? null,
    firstGameFeedback: body?.firstGameFeedback === true,
  }
}

/**
 * STORE de module de la progression en ligne.
 *
 * Chaque composant gardait sa propre copie et sa propre requête : la fiche
 * compte en lançait deux (fiche + carte invité), l'écran de fin deux aussi
 * dès qu'un second lecteur s'y montait (bannière d'XP + avis de 1re partie),
 * et un `refresh()` après une sauvegarde ne mettait à jour QUE son appelant —
 * la bannière gardait un niveau périmé pendant que la collection voyait le
 * nouveau. Ici, une seule copie, une seule requête en vol, et tout abonné est
 * notifié de chaque réponse.
 *
 * Règle de fraîcheur, la même qu'avant (une requête par montage) moins les
 * doublons : un composant qui monte veut une réponse POSTÉRIEURE à son
 * montage. Si une requête partie depuis est en vol, il s'y joint ; si elle est
 * déjà arrivée, il n'en relance pas ; sinon il en lance une. Les composants
 * montés ensemble partagent donc UNE requête, et un écran ouvert plus tard
 * (l'écran de fin, après la partie) ne lit jamais un instantané d'avant.
 *
 * Usine exportée pour les tests ; l'application n'en utilise qu'une instance.
 */
export function createProgressionStore(fetchPayload: () => Promise<ProgressionPayload | null>) {
  let snapshot: ProgressionSnapshot = EMPTY_SNAPSHOT
  let startedSeq = 0
  let inflight: { userId: string; seq: number; promise: Promise<void> } | null = null
  const listeners = new Set<() => void>()

  const publish = (next: ProgressionSnapshot) => {
    snapshot = next
    for (const listener of listeners) listener()
  }

  /** Lance une requête pour `userId` ; la plus RÉCENTE gagne. */
  const start = (userId: string): Promise<void> => {
    // Autre compte (connexion, bascule) : rien de l'ancien ne doit fuiter.
    if (snapshot.userId !== userId) publish({ ...EMPTY_SNAPSHOT, userId })
    const seq = ++startedSeq
    const run = async () => {
      let payload: ProgressionPayload | null = null
      try {
        payload = await fetchPayload()
      } catch {
        payload = null
      }
      // Compte changé entre-temps (déconnexion, autre compte), ou réponse
      // doublée par une requête partie après elle : on la jette.
      if (snapshot.userId !== userId || seq <= snapshot.seq) return
      // Échec (réseau, 5xx) : on garde l'état précédent — jamais une fausse
      // valeur — mais la requête compte comme arrivée (fin du chargement).
      // `dataSeq` ne bouge pas : ces données ne sont PAS plus fraîches.
      publish(payload ? { userId, ...payload, seq, dataSeq: seq } : { ...snapshot, seq })
    }
    // `finally` s'exécute toujours APRÈS l'affectation ci-dessous (microtâche).
    const promise = run().finally(() => {
      if (inflight?.seq === seq) inflight = null
    })
    inflight = { userId, seq, promise }
    return promise
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => snapshot,
    /** Numéro de la dernière requête LANCÉE — ce qu'un composant note à son montage. */
    startedSeq: () => startedSeq,
    /** Garantit une réponse postérieure à `sinceSeq` : rejoint, réutilise ou lance. */
    ensure(userId: string, sinceSeq: number): Promise<void> {
      if (snapshot.userId === userId && snapshot.seq > sinceSeq) return Promise.resolve()
      if (inflight && inflight.userId === userId && inflight.seq > sinceSeq) return inflight.promise
      return start(userId)
    },
    /** Refait la requête (après un gain, une sauvegarde) et notifie tous les abonnés. */
    refresh: start,
    /** Déconnexion : plus d'instantané, et la réponse en vol éventuelle sera jetée. */
    clear() {
      inflight = null
      if (snapshot !== EMPTY_SNAPSHOT) publish(EMPTY_SNAPSHOT)
    },
  }
}

async function fetchProgressionPayload(): Promise<ProgressionPayload | null> {
  const res = await fetch('/api/online/progression', { credentials: 'include' })
  if (!res.ok) return null
  return parseProgressionPayload(await res.json().catch(() => null))
}

const store = createProgressionStore(fetchProgressionPayload)

/** Rendu serveur : jamais de compte, jamais de requête. */
const getServerSnapshot = () => EMPTY_SNAPSHOT

/**
 * Relance la lecture de la progression de `userId` hors d'un composant
 * abonné (cf. useSaveOnlinePreferences) : tous les abonnés sont notifiés,
 * sans monter un abonné de plus — donc sans requête de montage en prime.
 */
export function refreshOnlineProgression(userId: string): Promise<void> {
  return store.refresh(userId)
}

/**
 * Repère de fraîcheur à noter par un ÉCRAN (l'écran de fin) au premier rendu,
 * pour le passer à un abonné qui montera plus tard que les autres (`since`) :
 * toute requête lancée après ce repère lui suffit.
 */
export function onlineProgressionMark(): number {
  return store.startedSeq()
}

/**
 * Progression du compte connecté, PARTAGÉE (cf. createProgressionStore).
 *
 * `loading` est propre à l'appelant : vrai tant qu'aucune réponse
 * postérieure à SON montage n'est arrivée — un instantané plus ancien peut
 * déjà être là (la fiche compte l'a chargé avant la partie) ; à l'appelant
 * de choisir s'il l'affiche en attendant ou s'il patiente.
 *
 * `fresh` est plus strict : vrai seulement quand les données VIENNENT d'une
 * réponse réussie postérieure au montage. Une lecture échouée termine le
 * chargement (`loading` faux) sans rendre l'instantané frais : qui ne doit
 * jamais montrer un état d'avant la partie (bannière d'XP, avis de 1re
 * partie) attend `fresh`, pas la fin du chargement.
 *
 * Sans compte : aucune requête, tout à null/false.
 *
 * `since` (facultatif) remplace le repère noté au montage par un repère
 * PLUS ANCIEN (onlineProgressionMark) : un abonné monté en différé — l'avis
 * de 1re partie, chargé à part après la bannière d'XP — se contente alors de
 * la requête que la bannière a lancée pour le même écran, au lieu d'en
 * refaire une à chaque fin de partie.
 */
export function useOnlineProgression(options?: { since?: number }) {
  const { user } = useAuth()
  // Seule l'identité du compte compte ici : l'objet `user` change de référence
  // à chaque rafraîchissement de session sans que la progression bouge.
  const userId = user?.id ?? null
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot)
  // Repère de fraîcheur, noté au premier rendu : les requêtes lancées après
  // lui (par ce composant ou un voisin monté dans le même rendu) lui suffisent.
  const since = options?.since
  const [mountSeq] = useState(() => since ?? store.startedSeq())

  useEffect(() => {
    if (!userId) {
      store.clear()
      return
    }
    void store.ensure(userId, mountSeq)
  }, [userId, mountSeq])

  const refresh = useCallback(async () => {
    if (userId) await store.refresh(userId)
  }, [userId])

  const mine = userId !== null && snapshot.userId === userId
  return {
    progression: mine ? snapshot.progression : null,
    lastGain: mine ? snapshot.lastGain : null,
    firstGameFeedback: mine ? snapshot.firstGameFeedback : false,
    loading: userId !== null && !(mine && snapshot.seq > mountSeq),
    fresh: mine && snapshot.dataSeq > mountSeq,
    refresh,
  }
}
