"use client"

import { useMemo } from 'react'
import type { TvRoomDto } from '@/lib/online-room'
import type { PetitBuveurCastState } from '@/lib/cast-types'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import { resolveAmbianceMode } from '@/app/[locale]/games/petit-buveur/ambiance'
import { useBoardSequence } from '@/components/online/petit-buveur/useBoardSequence'
import { PetitBuveurSpeechFeed, useSettledSpeech } from '@/components/online/petit-buveur/PetitBuveurSpeechFeed'
import type { EngineView } from '@/components/online/petit-buveur/view-helpers'
import { useSteppedPositions } from '@/components/petit-buveur/useSteppedPositions'
import { LOCAL_DICE_RESULT_MS } from '@/app/[locale]/games/petit-buveur/board-display'
import { castCues, onlineInteractionKey, onlineRollCue } from './petit-buveur-cues'
import { castHeld, castScreenModel } from './petit-buveur/cast-view'
import { onlineIconOf, onlineScreenModel } from './petit-buveur/online-view'
import {
  useCastDiceShow,
  useDiceShow,
  useEndReveal,
  useHeldWhile,
  useSpectacleShow,
} from './petit-buveur/use-tv-sequence'
import { usePbTexts } from './petit-buveur/use-pb-texts'
import { TvPbScreen } from './petit-buveur/TvPbScreen'
import { TvPbDiceOverlay, TvPbSpectacle } from './petit-buveur/TvPbOverlays'
import { TvPbVictory } from './petit-buveur/TvPbVictory'

/**
 * Petit Buveur EN LIGNE à la TV : la vue plateau du téléphone en grand, sur
 * sa chronologie. Le moteur applique dé et case d'un coup ; comme le
 * téléphone qui lance, la TV montre le dé, fait marcher le pion case par case
 * (useBoardSequence), retourne la carte une fois le pion posé, et garde
 * l'effet d'un tirage caché sous son spectacle. L'écran de fin attend que le
 * pion gagnant soit arrivé. La parole d'un bot, écrite avec le coup qu'elle
 * commente, attend de même que le plateau soit posé.
 */
export function TvPetitBuveur({ room, state }: { room: TvRoomDto; state: EngineView }) {
  const view = state
  const { mode } = useAmbianceMode()
  const soft = resolveAmbianceMode(mode) === 'soft'
  const texts = usePbTexts(soft)

  const roll = onlineRollCue(view)
  const roller = roll ? view.players.find((p) => p.id === roll.actorId) : undefined
  // Un bot (ou un joueur parti) lance sans dé à l'écran sur les téléphones : la TV non plus, elle prendrait du retard.
  // Clé retenue même sans mise en scène : un joueur parti qui revient ne fait pas rejouer son ancien lancer.
  const dice = useDiceShow(roll, Boolean(roller && !roller.isBot && !roller.leftAt))

  const interaction = view.lastInteraction ?? null
  const interactionFrom = interaction
    ? (view.lastOutcome?.changes.find((c) => c.playerId === interaction.actorId)?.from ??
      view.players.find((p) => p.id === interaction.actorId)?.position)
    : undefined
  const spectacle = useSpectacleShow(onlineInteractionKey(view), interaction, interactionFrom)

  const frozen = dice.active || spectacle.active
  // keepPace : sous prefers-reduced-motion, la TV ne pose pas le pion sur sa case avant que les téléphones l'y amènent.
  const board = useBoardSequence(view, frozen, { silent: true, keepPace: true })
  const finished = view.phase === 'finished' || Boolean(view.winner)
  const endRevealed = useEndReveal(finished, !frozen && !board.animating)
  const feed = useSettledSpeech(view.speech, view.turnCount, !frozen && !board.animating)
  // La dernière bulle seulement : la colonne du classement lui cède sa hauteur (SPEECH_BLOCK_REM).
  const speech = feed.speech.some((sp) => sp.round === feed.round) ? (
    <PetitBuveurSpeechFeed
      speech={feed.speech}
      round={feed.round}
      players={view.players}
      iconOf={(p) => onlineIconOf(view, room.members, p.id)}
      variant="tv"
      soft={soft}
      tvSize={1}
    />
  ) : null

  const model = onlineScreenModel(
    view,
    room.members,
    texts,
    { diceActive: dice.active, diceRolling: dice.phase === 'rolling', spectacleActive: spectacle.active, board },
    roll
  )
  const players = model.players

  const finalPlayers = view.players.map((p, index) => ({ ...players[index], position: p.position, drinks: p.drinks }))

  return (
    <>
      {endRevealed ? (
        <TvPbVictory
          players={finalPlayers}
          winnerId={view.winner}
          turnCount={view.turnCount ?? null}
          difficulty={view.settings?.difficulty ?? null}
          texts={texts}
        />
      ) : (
        <TvPbScreen model={model} texts={texts} speech={speech} />
      )}
      <TvPbDiceOverlay
        phase={dice.phase}
        value={dice.value}
        player={players.find((p) => p.id === dice.actorId) ?? null}
        texts={texts}
      />
      <TvPbSpectacle
        interaction={spectacle.interaction}
        showOutcome={spectacle.showOutcome}
        actorFrom={spectacle.actorFrom}
        players={players}
        texts={texts}
      />
    </>
  )
}

/**
 * Petit Buveur LOCAL diffusé : même écran, alimenté par ce que pousse le
 * téléphone au moment où il l'affiche. Le dé roule tant que le téléphone le
 * fait rouler puis tient sa valeur autant que lui, les pions marchent case
 * par case, puis vient la fenêtre du téléphone (choix de cible ou duel sans
 * la case, roue, vote…) ou la carte de l'effet, posée jusqu'au lancer
 * suivant. Gorgées, effets en cours et tour attendent que le pion soit arrivé.
 */
export function TvPetitBuveurCast({ state }: { room: TvRoomDto; state: PetitBuveurCastState }) {
  const { mode } = useAmbianceMode()
  // La partie locale transmet SON ambiance ; à défaut, celle de l'écran.
  const soft = (state.ambiance ?? resolveAmbianceMode(mode)) === 'soft'
  const texts = usePbTexts(soft)

  const cues = castCues(state)
  const actor = state.players[state.currentPlayer] ?? null
  const dice = useCastDiceShow(
    { key: cues.diceKey, value: cues.dice, phase: cues.dicePhase },
    actor?.id ?? null,
    LOCAL_DICE_RESULT_MS
  )

  const targets = useMemo(() => {
    const rec: Record<string, number> = {}
    for (const p of state.players) rec[p.id] = p.position
    return rec
  }, [state.players])
  const { positions, isStepping } = useSteppedPositions(targets, {
    frozen: dice.active,
    silent: true,
    snapKey: state.snapKey,
    keepPace: true,
  })
  const settled = !dice.active && !isStepping
  const live = castHeld(state)
  const held = useHeldWhile(live, JSON.stringify(live), !settled)
  const finished = Boolean(state.winner) || state.phase === 'finished'
  const endRevealed = useEndReveal(finished, settled)

  const roll =
    cues.dice !== null && dice.phase !== 'rolling' && dice.actorId ? { actorId: dice.actorId, value: cues.dice } : null
  const model = castScreenModel(state, cues, texts, { positions, settled, roll, held })
  const players = model.players
  const finalPlayers = state.players.map((p, index) => ({ ...players[index], position: p.position, drinks: p.drinks }))

  return (
    <>
      {endRevealed ? (
        <TvPbVictory
          players={finalPlayers}
          winnerId={state.winner}
          turnCount={live.turnCount}
          difficulty={typeof state.difficulty === 'string' ? state.difficulty : null}
          texts={texts}
        />
      ) : (
        <TvPbScreen model={model} texts={texts} />
      )}
      <TvPbDiceOverlay
        phase={dice.phase}
        value={dice.value}
        player={players.find((p) => p.id === dice.actorId) ?? null}
        texts={texts}
      />
    </>
  )
}
