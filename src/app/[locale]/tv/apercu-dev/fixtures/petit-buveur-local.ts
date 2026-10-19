import { createTranslator } from 'next-intl'
import type { PetitBuveurCastEffect, PetitBuveurCastReveal, PetitBuveurCastStage, PetitBuveurCastState } from '@/lib/cast-types'
import { PLAYER_ICONS } from '@/lib/players'
import { formatPlayerNameHtml } from '@/lib/playerUtils'
import { withAmbiance, type AmbianceMode } from '@/app/[locale]/games/petit-buveur/ambiance'
import type { Case, PetitBuveurT } from '@/app/[locale]/games/petit-buveur/case-config'
import type { GamePlayer } from '@/app/[locale]/games/petit-buveur/case-types'
import { buildNotificationHtml, formatCaseDescription, type EffectOutcome } from '@/app/[locale]/games/petit-buveur/case-notification'
import {
  buildLocalCastState,
  castEffectOf,
  LOCAL_DICE_RESULT_MS,
  LOCAL_DICE_ROLL_MS,
  localRevealContent,
  nextCastCue,
} from '@/app/[locale]/games/petit-buveur/board-display'
import { applyDiceRoll, clonePlayers, hopDurationMs } from '@/app/[locale]/games/petit-buveur/turn-state'
import { applyTargetedCase, type ApplyResult } from '@/app/[locale]/games/petit-buveur/apply-case'
import { resolveNoTargetCase } from '@/app/[locale]/games/petit-buveur/resolve-case'
import { addDrinks, applyDuelResult, isProtected, tickTurnEnd } from '@/app/[locale]/games/petit-buveur/local-rules'
import {
  outcomeCaseBase,
  outcomeChallengeResult,
  outcomeCompose,
  outcomeI18n,
  outcomeSkipTurnSelf,
} from '@/app/[locale]/games/petit-buveur/outcome-helpers'
import fr from '../../../../../../messages/fr.json'
import { castRoom, PREVIEW_NAMES, type TvPreviewFixture, type TvPreviewStep } from '../fixture-kit'

/**
 * Petit Buveur LOCAL diffusé : ce qu'un téléphone pousserait, tour par tour.
 * Les coups passent par les vraies règles du jeu local (dé, cases, duel, fin
 * de tour) et les textes par les vraies notifications du téléphone ; chaque
 * étape est un état poussé au moment où le téléphone l'affiche (dé qui roule,
 * valeur lue, pion arrivé, fenêtre ouverte, effet affiché, tour suivant).
 */

const BOARD = 30
/** Le jeu local accepte 15 joueurs ; les noms longs éprouvent les débordements. */
const NAMES_15 = [...PREVIEW_NAMES, 'Anne-Sophie', 'Pierre-Louis', 'Marie-Antoinette']

const baseT = createTranslator({ locale: 'fr', messages: fr, namespace: 'games.petit-buveur' }) as unknown as PetitBuveurT

type Tracked = { id: string; position: number; drinks: number }

type Table = {
  players: GamePlayer[]
  currentPlayer: number
  turnCount: number
  ambiance: AmbianceMode
  dice: PetitBuveurCastState['dice']
  reveal: PetitBuveurCastReveal | null
  stage: PetitBuveurCastStage | null
  winnerId: string | null
  /** Horloge du téléphone : les seq des signaux en dérivent, comme Date.now(). */
  clock: number
  roll: number | null
  landing: { players: Tracked[]; caseNumber: number | null; dice: number | null } | null
  snapKey: number
}

function gamePlayer(i: number, name: string, position: number, drinks: number): GamePlayer {
  return {
    id: `local-${i + 1}`,
    name,
    position,
    drinks,
    protected: false,
    protectionTurnsLeft: undefined,
    cursed: 0,
    linkedTo: undefined,
    linkedTurns: 0,
    skipNextTurn: false,
    anchored: false,
    mirrorDrinkTargetId: undefined,
    mirrorDrinkTurns: 0,
    // Les 16 premières icônes du jeu sont des animaux : une par joueur, rien qui ressemble à un effet.
    preferences: { color: 'bg-primary', icon: PLAYER_ICONS[i % 16] },
  }
}

function table(
  count: number,
  positions: number[],
  drinks: number[],
  opts: Partial<Pick<Table, 'currentPlayer' | 'turnCount' | 'ambiance'>> = {}
): Table {
  return {
    players: Array.from({ length: count }, (_, i) => gamePlayer(i, NAMES_15[i % NAMES_15.length], positions[i] ?? 0, drinks[i] ?? 0)),
    currentPlayer: opts.currentPlayer ?? 0,
    turnCount: opts.turnCount ?? 1,
    ambiance: opts.ambiance ?? 'alcool',
    dice: null,
    reveal: null,
    stage: null,
    winnerId: null,
    clock: 1_760_000_000_000,
    roll: null,
    landing: null,
    snapKey: 1,
  }
}

function tOf(tb: Table): PetitBuveurT {
  return withAmbiance(baseT, tb.ambiance)
}

const idOf = (tb: Table, i: number) => tb.players[i].id

/** Même liste que collectActiveEffects du téléphone, au format diffusé. */
function phoneEffects(players: GamePlayer[]): PetitBuveurCastEffect[] {
  const items: { id: string; player: GamePlayer; linkedPlayer?: GamePlayer; remainingTurns: number }[] = []
  for (const p of players) {
    if (isProtected(p)) {
      items.push({
        id: `prot-${p.id}`,
        player: p,
        remainingTurns: Math.max(1, Math.ceil((p.protectionTurnsLeft ?? 1) / Math.max(players.length, 1))),
      })
    }
    if (p.cursed > 0) items.push({ id: `curse-${p.id}`, player: p, remainingTurns: p.cursed })
    if (p.linkedTo && p.linkedTurns > 0) {
      items.push({ id: `link-${p.id}`, player: p, linkedPlayer: players.find((x) => x.id === p.linkedTo), remainingTurns: p.linkedTurns })
    }
    if (p.skipNextTurn) items.push({ id: `skip-${p.id}`, player: p, remainingTurns: 1 })
    if (p.anchored) items.push({ id: `anchor-${p.id}`, player: p, remainingTurns: 1 })
    if (p.mirrorDrinkTargetId && (p.mirrorDrinkTurns ?? 0) > 0) {
      items.push({
        id: `mirror-${p.id}`,
        player: p,
        linkedPlayer: players.find((x) => x.id === p.mirrorDrinkTargetId),
        remainingTurns: p.mirrorDrinkTurns ?? 1,
      })
    }
  }
  return items.map(castEffectOf).filter((e): e is PetitBuveurCastEffect => e !== null)
}

function payload(tb: Table): PetitBuveurCastState {
  return buildLocalCastState({
    players: tb.players.map((p) => ({ id: p.id, name: p.name, position: p.position, drinks: p.drinks, icon: p.preferences.icon })),
    currentPlayer: tb.currentPlayer,
    winnerId: tb.winnerId,
    dice: tb.dice,
    reveal: tb.reveal,
    ambiance: tb.ambiance,
    turnCount: tb.turnCount,
    difficulty: 'normal',
    effects: phoneEffects(tb.players),
    stage: tb.stage,
    snapKey: tb.snapKey,
  })
}

function step(label: string, tb: Table): TvPreviewStep {
  return { label, room: castRoom(payload(tb)) }
}

/** Le joueur au tour appuie sur « Lancer le dé » : l'overlay roule, sans valeur. */
function rollStart(tb: Table): Table {
  return {
    ...tb,
    stage: null,
    roll: null,
    dice: nextCastCue(tb.dice, { value: 0, phase: 'rolling' as const }, tb.clock),
    clock: tb.clock + LOCAL_DICE_ROLL_MS,
  }
}

/** L'overlay montre la valeur. */
function rollShow(tb: Table, value: number): Table {
  if (!tb.dice) throw new Error('pas de lancer en cours')
  return { ...tb, roll: value, dice: { ...tb.dice, value, phase: 'result' }, clock: tb.clock + LOCAL_DICE_RESULT_MS }
}

/** L'overlay se ferme, le pion part ; il arrive sur sa case (cliché des pastilles). */
function move(tb: Table, value: number): Table {
  const moved = applyDiceRoll(tb.players, tb.currentPlayer, value, BOARD)
  return land({ ...tb, players: moved.players, clock: tb.clock + hopDurationMs(tb.players, moved.players) }, moved.to)
}

function land(tb: Table, position: number | null): Table {
  return {
    ...tb,
    landing: {
      players: tb.players.map((p) => ({ id: p.id, position: p.position, drinks: p.drinks })),
      caseNumber: position === null ? null : position + 1,
      dice: position === null ? null : tb.roll,
    },
  }
}

function withStage(tb: Table, stage: PetitBuveurCastStage | null): Table {
  return { ...tb, stage, clock: tb.clock + 1_500 }
}

function hasCaseBase(outcome: EffectOutcome): boolean {
  return outcome.type === 'caseBase' || (outcome.type === 'compose' && outcome.items.some((i) => i.type === 'caseBase'))
}

/** La fenêtre « Effet de la case » s'ouvre (ou se complète, `sameCard`) : son texte devient la carte TV. */
function notify(
  tb: Table,
  caseData: Case,
  outcome: EffectOutcome,
  opts: { targetId?: string | null; duelNote?: string; verdictPending?: boolean; sameCard?: boolean } = {}
): Table {
  const t = tOf(tb)
  const mainHtml = buildNotificationHtml(
    { case: caseData, outcome, duelPrefix: Boolean(opts.duelNote), targetPlayerId: opts.targetId ?? null, includeEffectsSummary: false },
    {
      t,
      players: tb.players,
      formatPlayerNameHtml: (player, o) => formatPlayerNameHtml(player as GamePlayer, o),
      effectsSummaryHtml: '',
      duelNoteHtml: opts.duelNote,
    }
  )
  const content = localRevealContent({
    caseType: caseData.type,
    mainHtml,
    caseText: hasCaseBase(outcome) ? formatCaseDescription(caseData, t) : null,
    landing: tb.landing,
    players: tb.players,
    targetId: opts.targetId ?? null,
    verdictPending: Boolean(opts.verdictPending),
  })
  const reveal =
    opts.sameCard && tb.reveal
      ? { ...content, seq: tb.reveal.seq }
      : nextCastCue(tb.reveal, content, tb.clock, tb.dice?.seq ?? 0)
  return { ...tb, stage: null, reveal, clock: tb.clock + 2_000 }
}

/** Case à cible appliquée par les vraies règles (graine fixe). */
function applyCase(tb: Table, caseData: Case, targetIndex: number): { tb: Table; result: ApplyResult } {
  const result = applyTargetedCase(caseData, clonePlayers(tb.players), idOf(tb, targetIndex), {
    actorIndex: tb.currentPlayer,
    boardSize: BOARD,
    turnDiceTotal: tb.roll ?? 0,
    t: tOf(tb),
    rng: () => 0.42,
  })
  return { tb: { ...tb, players: result.players }, result }
}

function drink(tb: Table, index: number, count: number, sourceIndex = tb.currentPlayer): Table {
  const players = clonePlayers(tb.players)
  addDrinks(players, idOf(tb, index), count, { sourceId: idOf(tb, sourceIndex) })
  return { ...tb, players }
}

/** « Suivant » : fin du tour (effets décomptés), joueur suivant. */
function endTurn(tb: Table): Table {
  const players = clonePlayers(tb.players)
  tickTurnEnd(players, tb.currentPlayer, { fresh: { mirror: false, chain: false } })
  const next = (tb.currentPlayer + 1) % players.length
  return {
    ...tb,
    players,
    currentPlayer: next,
    turnCount: next === 0 ? tb.turnCount + 1 : tb.turnCount,
    stage: null,
    landing: null,
    clock: tb.clock + 3_000,
  }
}

function setEffects(tb: Table, patch: (p: GamePlayer, i: number) => Partial<GamePlayer>): Table {
  return { ...tb, players: tb.players.map((p, i) => ({ ...p, ...patch(p, i) })) }
}

const MID_POSITIONS = [7, 4, 9, 2, 12, 5, 0, 3, 11, 6, 1, 8, 14, 10, 13]
const MID_DRINKS = [3, 1, 5, 0, 6, 2, 0, 1, 4, 2, 0, 3, 7, 2, 1]

/** Milieu de partie, 15 joueurs, quelques effets déjà en cours ; au tour de Jean-Baptiste (index 4). */
function midGame(): Table {
  let tb = table(15, MID_POSITIONS, MID_DRINKS, { currentPlayer: 3, turnCount: 4 })
  tb = setEffects(tb, (_, i) =>
    i === 1 ? { protected: true, protectionTurnsLeft: 12 } : i === 10 ? { linkedTo: 'local-12', linkedTurns: 3 } : {}
  )
  // Tour de Camille (index 3) : Solo, sans cible.
  tb = move(rollShow(rollStart(tb), 3), 3)
  const solo: Case = { type: 'solo', effect: 1 }
  const resolved = resolveNoTargetCase(
    solo,
    clonePlayers(tb.players),
    { boardSize: BOARD, actorIndex: tb.currentPlayer, lastMoveDelta: 3, lastCase: null },
    tOf(tb)
  )
  tb = notify({ ...tb, players: resolved.players }, solo, resolved.outcome)
  return endTurn(tb)
}

function sequenceCible(): TvPreviewFixture {
  const steps: TvPreviewStep[] = []
  let tb = midGame()
  steps.push(step('au tour de Jean-Baptiste (carte du tour d’avant)', tb))
  tb = rollStart(tb)
  steps.push(step('le dé roule sur le téléphone', tb))
  tb = rollShow(tb, 5)
  steps.push(step('le téléphone montre 5', tb))
  tb = move(tb, 5)
  steps.push(step('le pion avance de 5', tb))
  tb = withStage(tb, { kind: 'target' })
  steps.push(step('« Qui cibler ? » (Malédiction encore cachée)', tb))
  const curse: Case = { type: 'malediction', effect: 3 }
  const applied = applyCase(tb, curse, 8)
  tb = notify(applied.tb, curse, applied.result.outcome, { targetId: idOf(tb, 8) })
  steps.push(step('effet affiché : Marie-Charlotte maudite', tb))
  tb = endTurn(tb)
  steps.push(step('tour suivant (la carte reste)', tb))
  return { id: 'sequence-cible-15', label: 'Local diffusé : dé, pion, « Qui cibler ? », effet, tour suivant (15 joueurs)', steps }
}

function sequenceDuel(): TvPreviewFixture {
  const steps: TvPreviewStep[] = []
  // Thomas (index 6) part de 3 et fait 6 : il rejoint Hugo (index 9, case 10).
  let tb = table(15, [7, 4, 9, 2, 12, 5, 3, 3, 11, 9, 1, 8, 14, 10, 13], MID_DRINKS, { currentPlayer: 6, turnCount: 5 })
  tb = move(rollShow(rollStart(tb), 6), 6)
  tb = withStage(tb, { kind: 'duel', caseNumber: 10 })
  steps.push(step('duel proposé (case encore cachée)', tb))
  tb = withStage(tb, { kind: 'duel', caseNumber: 10, opponentId: idOf(tb, 9), rolling: true })
  steps.push(step('la roue du duel tourne', tb))
  const resultLine = tOf(tb)('game.duel.opponentWins', { winner: tb.players[9].name, loser: tb.players[6].name })
  tb = withStage(tb, { kind: 'duel', caseNumber: 10, opponentId: idOf(tb, 9), result: resultLine })
  steps.push(step('issue du duel', tb))
  const duel = applyDuelResult(tb.players, idOf(tb, 6), idOf(tb, 9), false)
  tb = withStage({ ...tb, players: duel.players }, { kind: 'target' })
  steps.push(step('le perdant recule, puis « Qui cibler ? »', tb))
  const duelNote = tOf(tb)('game.outcomes.duelOpponentWins', { challenger: tb.players[6].name, opponent: tb.players[9].name })
  const gorgee: Case = { type: 'gorgée', effect: 3 }
  const applied = applyCase(tb, gorgee, 2)
  tb = notify(applied.tb, gorgee, applied.result.outcome, { targetId: idOf(tb, 2), duelNote })
  steps.push(step('effet affiché, avec la note du duel', tb))
  return { id: 'sequence-duel-15', label: 'Local diffusé : duel sur la case, puis la case (15 joueurs)', steps }
}

function sequenceRoue(): TvPreviewFixture {
  const steps: TvPreviewStep[] = []
  let tb = midGame()
  tb = move(rollShow(rollStart(tb), 2), 2)
  tb = withStage(tb, { kind: 'case', caseType: 'roue' })
  steps.push(step('roue des gorgées ouverte', tb))
  tb = withStage(tb, { kind: 'case', caseType: 'roue', rolling: true })
  steps.push(step('la roue tourne', tb))
  const label = tOf(tb)('wheel.sips', { count: 5 })
  tb = withStage(tb, { kind: 'case', caseType: 'roue', result: tOf(tb)('game.resultLabel', { outcome: label }) })
  steps.push(step('résultat de la roue', tb))
  const actor = tb.currentPlayer
  tb = drink(tb, actor, 5, actor)
  tb = notify(
    tb,
    { type: 'gorgée', effect: 5 },
    outcomeCompose(
      outcomeI18n('game.outcomes.wheelResult', { params: { label } }),
      outcomeI18n('game.outcomes.wheelDrink', { playerRefs: { player: idOf(tb, actor) } })
    ),
    { targetId: idOf(tb, actor) }
  )
  steps.push(step('effet affiché', tb))
  return { id: 'sequence-roue-15', label: 'Local diffusé : roue des gorgées (15 joueurs)', steps }
}

function sequenceDefi(): TvPreviewFixture {
  const steps: TvPreviewStep[] = []
  let tb = midGame()
  tb = move(rollShow(rollStart(tb), 4), 4)
  tb = withStage(tb, { kind: 'target' })
  steps.push(step('« Qui cibler ? » (défi encore caché)', tb))
  const challenges = tOf(tb).raw('defis') as { text: string }[]
  const defi: Case = { type: 'defi', effect: 2, defiChallenge: challenges[3]?.text ?? '' }
  const target = 12
  tb = notify(
    tb,
    defi,
    outcomeCompose(outcomeCaseBase(), outcomeI18n('game.targetLabel', { playerRefs: { player: idOf(tb, target) } })),
    { targetId: idOf(tb, target), verdictPending: true }
  )
  steps.push(step('défi affiché : le lanceur juge', tb))
  tb = drink(tb, target, 2)
  tb = notify(
    tb,
    defi,
    outcomeCompose(
      outcomeCaseBase(),
      outcomeI18n('game.targetLabel', { playerRefs: { player: idOf(tb, target) } }),
      outcomeChallengeResult(idOf(tb, target), false, 2)
    ),
    { targetId: idOf(tb, target), sameCard: true }
  )
  steps.push(step('verdict : la cible boit', tb))
  return { id: 'sequence-defi-15', label: 'Local diffusé : défi, verdict du lanceur (15 joueurs)', steps }
}

function sequencePileFace(): TvPreviewFixture {
  const steps: TvPreviewStep[] = []
  let tb = midGame()
  tb = move(rollShow(rollStart(tb), 1), 1)
  tb = withStage(tb, { kind: 'target' })
  steps.push(step('« Qui cibler ? » (pile ou face encore caché)', tb))
  const target = 8
  tb = withStage(tb, { kind: 'case', caseType: 'pile-face', targetId: idOf(tb, target) })
  steps.push(step('pile ou face : la cible choisit', tb))
  tb = withStage(tb, { kind: 'case', caseType: 'pile-face', targetId: idOf(tb, target), rolling: true })
  steps.push(step('la pièce tourne', tb))
  const t = tOf(tb)
  tb = withStage(tb, {
    kind: 'case',
    caseType: 'pile-face',
    targetId: idOf(tb, target),
    result: t('coinFlip.lost', { result: t('coinFlip.face') }),
  })
  steps.push(step('résultat de la pièce', tb))
  tb = drink(tb, target, 2)
  tb = notify(
    tb,
    { type: 'pile-face', effect: 2 },
    outcomeI18n('game.outcomes.pileFaceLose', {
      playerRefs: { player: idOf(tb, target) },
      params: { result: t('coinFlip.face'), count: 2 },
    }),
    { targetId: idOf(tb, target) }
  )
  steps.push(step('effet affiché', tb))
  return { id: 'sequence-pile-face-15', label: 'Local diffusé : pile ou face (15 joueurs)', steps }
}

function sequenceDeHonte(): TvPreviewFixture {
  const steps: TvPreviewStep[] = []
  let tb = midGame()
  tb = move(rollShow(rollStart(tb), 3), 3)
  tb = withStage(tb, { kind: 'case', caseType: 'de-honte' })
  steps.push(step('dé de la honte ouvert', tb))
  tb = withStage(tb, { kind: 'case', caseType: 'de-honte', rolling: true })
  steps.push(step('le dé de la honte roule', tb))
  const t = tOf(tb)
  tb = withStage(tb, {
    kind: 'case',
    caseType: 'de-honte',
    die: 4,
    result: t('game.resultLabel', { outcome: t('shameDice.twoSips') }),
  })
  steps.push(step('le dé de la honte montre 4', tb))
  const actor = tb.currentPlayer
  tb = drink(tb, actor, 2, actor)
  tb = notify(
    tb,
    { type: 'de-honte', effect: 0 },
    outcomeI18n('shameDice.outcomeDrink', { params: { roll: 4 }, playerRefs: { player: idOf(tb, actor) } })
  )
  steps.push(step('effet affiché', tb))
  return { id: 'sequence-de-honte-15', label: 'Local diffusé : dé de la honte (15 joueurs)', steps }
}

function fenetres(): TvPreviewFixture {
  let tb = midGame()
  tb = move(rollShow(rollStart(tb), 2), 2)
  const stages: [string, PetitBuveurCastStage][] = [
    ['chance', { kind: 'case', caseType: 'chance' }],
    ['vote', { kind: 'case', caseType: 'vote', effect: 3 }],
    ['défi en chaîne', { kind: 'case', caseType: 'defi-chaine', effect: 5 }],
    ['échange', { kind: 'case', caseType: 'echange' }],
    ['téléport', { kind: 'case', caseType: 'teleport' }],
    ['roue des défis', { kind: 'case', caseType: 'roue-defis' }],
  ]
  return {
    id: 'fenetres-15',
    label: 'Local diffusé : fenêtres de case qui attendent le joueur (15 joueurs)',
    steps: stages.map(([label, stage]) => step(label, withStage(tb, stage))),
  }
}

function effets(): TvPreviewFixture {
  let tb = midGame()
  tb = setEffects(tb, (_, i) =>
    i === 0
      ? { cursed: 2 }
      : i === 2
        ? { skipNextTurn: true }
        : i === 5
          ? { anchored: true }
          : i === 7
            ? { mirrorDrinkTargetId: 'local-9', mirrorDrinkTurns: 1 }
            : i === 12
              ? { protected: true, protectionTurnsLeft: 15, cursed: 1 }
              : {}
  )
  tb = move(rollShow(rollStart(tb), 6), 6)
  tb = withStage(tb, { kind: 'target' })
  const tous: Case = { type: 'tous', effect: 2 }
  const applied = applyCase(tb, tous, 14)
  tb = notify(applied.tb, tous, applied.result.outcome, { targetId: idOf(tb, 14) })
  return {
    id: 'effets-15',
    label: 'Local diffusé : toute la table boit, beaucoup d’effets en cours (15 joueurs)',
    steps: [step('effet affiché', tb)],
  }
}

function passeTour(): TvPreviewFixture {
  let tb = midGame()
  tb = setEffects(tb, (_, i) => (i === 4 ? { skipNextTurn: true } : {}))
  const before = step('Jean-Baptiste doit passer son tour', tb)
  tb = setEffects(tb, (_, i) => (i === 4 ? { skipNextTurn: false } : {}))
  tb = land(tb, null)
  tb = notify(tb, { type: 'passe-tour', effect: 0 }, outcomeSkipTurnSelf(idOf(tb, 4)))
  return {
    id: 'passe-tour-15',
    label: 'Local diffusé : tour passé, sans dé (15 joueurs)',
    steps: [before, step('tour passé', tb)],
  }
}

function chanceAvance(): TvPreviewFixture {
  let tb = midGame()
  tb = move(rollShow(rollStart(tb), 3), 3)
  tb = withStage(tb, { kind: 'case', caseType: 'chance' })
  const open = step('Chance : relancer ou avancer de 2', tb)
  const actor = tb.currentPlayer
  const to = Math.min(BOARD - 1, tb.players[actor].position + 2)
  tb = { ...tb, players: tb.players.map((p, i) => (i === actor ? { ...p, position: to } : p)) }
  // Pas de fenêtre d'effet : la TV reprend l'« Action précédente » du téléphone.
  tb = notify(
    tb,
    { type: 'chance', effect: 0 },
    outcomeI18n('game.outcomes.chanceAdvance', { playerRefs: { player: idOf(tb, actor) }, params: { case: to + 1 } })
  )
  tb = endTurn(tb)
  return {
    id: 'chance-avance-15',
    label: 'Local diffusé : Chance, avancer de 2 (15 joueurs)',
    steps: [open, step('avance de 2, tour suivant', tb)],
  }
}

function casePosee3Soft(): TvPreviewFixture {
  let tb = table(3, [5, 9, 2], [2, 4, 1], { currentPlayer: 1, turnCount: 3, ambiance: 'soft' })
  tb = setEffects(tb, (_, i) => (i === 2 ? { cursed: 2 } : {}))
  tb = move(rollShow(rollStart(tb), 3), 3)
  tb = withStage(tb, { kind: 'target' })
  const gorgee: Case = { type: 'gorgée', effect: 2 }
  const applied = applyCase(tb, gorgee, 0)
  tb = notify(applied.tb, gorgee, applied.result.outcome, { targetId: idOf(tb, 0) })
  return { id: 'case-posee-3', label: 'Local diffusé : case posée, 3 joueurs (Soft)', steps: [step('effet affiché', tb)] }
}

function debut(): TvPreviewFixture {
  return { id: 'debut-15', label: 'Local diffusé : début, 15 joueurs sur la case 1', steps: [step('début', table(15, [], []))] }
}

function sequenceFin(): TvPreviewFixture {
  // Marie-Charlotte (index 8) part de 25 et fait 6 : arrivée.
  let tb = table(15, [7, 4, 9, 2, 12, 5, 0, 3, 25, 6, 1, 8, 14, 10, 13], MID_DRINKS, { currentPlayer: 8, turnCount: 9 })
  tb = rollShow(rollStart(tb), 6)
  const shown = step('le téléphone montre 6', tb)
  tb = move(tb, 6)
  const walking = step('le pion file vers l’arrivée', tb)
  tb = { ...tb, winnerId: idOf(tb, 8) }
  return {
    id: 'sequence-fin-15',
    label: 'Local diffusé : lancer gagnant puis victoire (15 joueurs)',
    steps: [shown, walking, step('victoire (après l’arrivée du pion)', tb)],
  }
}

function rejouer(): TvPreviewFixture {
  // Léa (index 0) gagne d'un 6, puis « Rejouer » : elle ouvre la nouvelle partie, et son dernier dé ne doit pas revenir.
  let tb = table(15, [25, 4, 9, 2, 12, 5, 0, 3, 20, 6, 1, 8, 14, 10, 13], MID_DRINKS, { currentPlayer: 0, turnCount: 11 })
  tb = move(rollShow(rollStart(tb), 6), 6)
  tb = { ...tb, winnerId: idOf(tb, 0) }
  const won = step('victoire de Léa (dé : 6)', tb)
  const fresh = table(15, [], [], { currentPlayer: 0, turnCount: 1 })
  tb = { ...fresh, clock: tb.clock + 5_000, snapKey: tb.snapKey + 1 }
  return {
    id: 'rejouer-15',
    label: 'Local diffusé : victoire puis « Rejouer » (dé et carte effacés)',
    steps: [won, step('nouvelle partie : aucun « Léa fait 6 »', tb)],
  }
}

function ancienTelephone(): TvPreviewFixture {
  const players = table(12, MID_POSITIONS, MID_DRINKS).players.map((p) => ({ id: p.id, name: p.name, position: p.position, drinks: p.drinks }))
  const legacy = (extra: Partial<PetitBuveurCastState>): PetitBuveurCastState => ({
    castKind: 'petit-buveur',
    players,
    currentPlayer: 3,
    phase: 'playing',
    winner: null,
    ambiance: 'alcool',
    ...extra,
  })
  const t0 = 1_760_000_000_000
  return {
    id: 'ancien-telephone-12',
    label: 'Local diffusé par un téléphone d’avant (dé au début, case sans texte)',
    steps: [
      { label: 'dé poussé au début', room: castRoom(legacy({ dice: { value: 4, seq: t0 } })) },
      {
        label: 'case sans texte',
        room: castRoom(legacy({ dice: { value: 4, seq: t0 }, reveal: { caseType: 'protection', seq: t0 + 2_000 } })),
      },
    ],
  }
}

export function build(): TvPreviewFixture[] {
  return [
    debut(),
    sequenceCible(),
    sequenceDuel(),
    sequenceRoue(),
    sequenceDefi(),
    sequencePileFace(),
    sequenceDeHonte(),
    fenetres(),
    effets(),
    passeTour(),
    chanceAvance(),
    sequenceFin(),
    rejouer(),
    casePosee3Soft(),
    ancienTelephone(),
  ]
}
