"use client"

import { useEffect, useMemo, useState } from 'react'
import { useSteppedPositions } from '@/components/petit-buveur/useSteppedPositions'
import { diceStageTargets, isNewGame, outcomeSignature, type EngineView } from './view-helpers'

/** Arrêt du pion sur la case du dé, le temps de lire la case, avant l'effet (≈ hopMs du local). */
const LANDING_PAUSE_MS = 900

type Stage = 'dice' | 'final'

/**
 * Pions du plateau en ligne : dé → le pion marche jusqu'à la case du dé →
 * pause → l'effet de la case déplace les pions. Le serveur envoie dé et
 * effet dans un seul état ; `lastOutcome.diceLanding` permet de rejouer
 * l'étape intermédiaire. « Rejouer » (nouvelle partie dans la salle) pose
 * les pions sur la case 1 sans les faire reculer.
 */
export function useBoardSequence(
  view: EngineView | null,
  frozen: boolean,
  opts?: { silent?: boolean; keepPace?: boolean }
) {
  const sig = outcomeSignature(view)
  const staged = useMemo(() => (view ? diceStageTargets(view.players, view.lastOutcome) : null), [view])
  const outcomeActor = view?.lastOutcome?.actorId ?? null

  // Ajusté pendant le rendu : les cibles intermédiaires arrivent dans le même
  // rendu que le nouvel état, sinon le pion partirait vers la case finale.
  // `seen` : un premier état reçu après un rechargement ou une arrivée en
  // cours de partie se pose tel quel, sans rejouer le dernier coup.
  const [seq, setSeq] = useState<{ sig: string; stage: Stage; actorId: string | null; seen: boolean }>({
    sig,
    stage: 'final',
    actorId: outcomeActor,
    seen: Boolean(view),
  })
  let current = seq
  if (seq.sig !== sig || (!seq.seen && view)) {
    current = {
      sig,
      stage: staged && seq.seen ? 'dice' : 'final',
      actorId: outcomeActor,
      seen: seq.seen || Boolean(view),
    }
    setSeq(current)
  }

  const marker = view ? { version: view.version, finished: view.phase === 'finished' } : null
  const [game, setGame] = useState({
    epoch: 0,
    version: marker?.version ?? 0,
    finished: marker?.finished ?? false,
  })
  let epoch = game.epoch
  if (marker && (marker.version !== game.version || marker.finished !== game.finished)) {
    epoch = isNewGame(game, marker) ? game.epoch + 1 : game.epoch
    setGame({ epoch, ...marker })
  }

  const finalTargets = useMemo(() => {
    const rec: Record<string, number> = {}
    for (const p of view?.players ?? []) rec[p.id] = p.position
    return rec
  }, [view])

  const targets = current.stage === 'dice' && staged ? staged : finalTargets
  const { positions, isStepping } = useSteppedPositions(targets, {
    frozen,
    snapKey: epoch,
    silent: opts?.silent,
    keepPace: opts?.keepPace,
  })

  const landedOnDice = current.stage === 'dice' && !frozen && !isStepping
  useEffect(() => {
    if (!landedOnDice) return
    const doneSig = current.sig
    const timer = setTimeout(() => {
      setSeq((s) => (s.sig === doneSig ? { ...s, stage: 'final' } : s))
    }, LANDING_PAUSE_MS)
    return () => clearTimeout(timer)
  }, [landedOnDice, current.sig])

  const animating = current.stage === 'dice' || isStepping
  return {
    positions,
    /** Un pion marche encore, ou l'effet de la case n'est pas encore joué. */
    animating,
    /** La carte de la case peut se retourner : le pion est sur la case du dé (ou l'effet est joué). */
    caseRevealed: current.stage !== 'dice' || landedOnDice,
    /** L'effet de la dernière case n'est pas encore montré (gorgées comprises). */
    effectPending: current.stage === 'dice',
    /** Acteur de l'effet animé : le HUD le suit tant que son pion marche. */
    animatedActorId: animating ? current.actorId : null,
  }
}
