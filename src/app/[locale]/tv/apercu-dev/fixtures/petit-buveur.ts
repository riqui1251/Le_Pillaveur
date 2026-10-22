import { getGameAdapter } from '@/lib/online/game-adapters'
import { buildPetitBuveurEngineState, markPlayerLeft, withPetitBuveurSay } from '@/lib/petit-buveur/server-adapter'
import { autoAction, currentDeciderId, type EngineState } from '@/lib/petit-buveur/engine'
import { onlineRoom, previewMembers, type PreviewMember, type TvPreviewFixture, type TvPreviewStep } from '../fixture-kit'

/**
 * Petit Buveur EN LIGNE : de vraies parties du moteur (graines fixes), jouées
 * coup par coup par les décisions automatiques du moteur via l'adaptateur de
 * salle, jusqu'à la situation voulue. Les séquences rejouent la chronologie
 * (dé → pion qui marche → carte, choix en attente, spectacle, fin).
 */

const GAME = 'petit-buveur'
const LONG_DEADLINE_MS = 10 * 60_000
/** Dé de parole toujours favorable : le premier bot que le coup touche parle. */
const ALWAYS_TALK = () => 0

function adapter() {
  const a = getGameAdapter(GAME)
  if (!a) throw new Error('adaptateur petit-buveur introuvable')
  return a
}

function start(members: PreviewMember[], seed: string, botsCount = 0): EngineState {
  return buildPetitBuveurEngineState(
    members.map((m) => ({ userId: m.userId, displayName: m.displayName })),
    'normal',
    seed,
    botsCount
  )
}

/** Le pile ou face de la cible garde son compte à rebours à l'écran. */
function longDeadline(s: EngineState): EngineState {
  if (s.pending?.stage !== 'side') return s
  return { ...s, pending: { ...s.pending, deadlineAt: Date.now() + LONG_DEADLINE_MS } }
}

/**
 * Un coup : la décision automatique du moteur pour le joueur qui doit agir,
 * appliquée par l'adaptateur. `reroll` : la case Chance relance toujours le dé.
 */
function next(s: EngineState, reroll = false): EngineState {
  const { state, action } = autoAction(s)
  const choice =
    action.type === 'RESOLVE_INTERACTION'
      ? reroll && s.pending?.caseType === 'chance' && !s.pending.stage
        ? { ...action.choice, chanceChoice: 'reroll' }
        : action.choice
      : null
  const body = action.type === 'ROLL' ? { action: 'roll' } : { action: 'resolve', choice: choice as Record<string, unknown> }
  const res = adapter().applyAction(state, action.playerId, body)
  if (!res.ok) throw new Error(`coup refusé : ${res.error}`)
  return longDeadline(withoutSpeech(res.state as EngineState))
}

/**
 * Les paroles de bots que l'adaptateur tire au hasard (Math.random) sont
 * retirées : une fixture se rejoue à l'identique. La fixture « paroles » les
 * écrit avec un dé fixe (withPetitBuveurSay).
 */
function withoutSpeech(s: EngineState): EngineState {
  if (!s.speech) return s
  const { speech: _speech, ...rest } = s
  void _speech
  return rest
}

/** Joue jusqu'à la première situation qui vérifie `pred` ; rend l'historique (dernier = trouvé). */
function playUntil(
  members: PreviewMember[],
  pred: (s: EngineState, history: EngineState[]) => boolean,
  opts: { seeds?: string[]; maxSteps?: number; botsCount?: number; reroll?: boolean } = {}
): EngineState[] {
  const seeds = opts.seeds ?? Array.from({ length: 30 }, (_, i) => `apercu-tv-${i + 1}`)
  for (const seed of seeds) {
    let s = start(members, seed, opts.botsCount)
    const history = [s]
    for (let i = 0; i < (opts.maxSteps ?? 400) && s.phase !== 'finished'; i += 1) {
      s = next(s, opts.reroll)
      history.push(s)
      if (pred(s, history)) return history
    }
  }
  throw new Error('aucune partie ne passe par la situation demandée')
}

function effectCount(s: EngineState): number {
  return s.players.reduce(
    (n, p) =>
      n +
      (p.protected && (p.protectionTurnsLeft ?? 0) > 0 ? 1 : 0) +
      (p.cursed > 0 ? 1 : 0) +
      (p.linkedTo && (p.linkedTurns ?? 0) > 0 ? 1 : 0) +
      (p.skipNextTurn ? 1 : 0) +
      (p.anchored ? 1 : 0) +
      (p.mirrorDrinkTargetId && (p.mirrorDrinkTurns ?? 0) > 0 ? 1 : 0),
    0
  )
}

/** Carte posée, rien en attente : ce que montre la table entre deux lancers. */
function showsCard(s: EngineState): boolean {
  return s.phase === 'playing' && !s.pending && Boolean(s.lastCase) && Boolean(s.lastOutcome)
}

function step(label: string, members: PreviewMember[], s: EngineState): TvPreviewStep {
  return {
    label,
    room: onlineRoom(GAME, s, { members, currentTurnUserId: currentDeciderId(s), stateVersion: s.version + 1 }),
  }
}

export function build(): TvPreviewFixture[] {
  const twelve = previewMembers(12)
  const three = previewMembers(3)
  const fixtures: TvPreviewFixture[] = []

  fixtures.push({ id: 'debut-12', label: 'Début, 12 joueurs sur la case 1', steps: [step('début', twelve, start(twelve, 'apercu-tv-1'))] })

  // L'hôte peut compléter la table de bots jusqu'à 99 : la case 1 dessine 12 pions et « +N », le classement résume.
  const crowd = previewMembers(8)
  fixtures.push({
    id: 'debut-20',
    label: 'Début, 20 joueurs sur la case 1 (8 joueurs + 12 bots)',
    steps: [step('début', crowd, start(crowd, 'apercu-tv-foule', 12))],
  })

  const mid = playUntil(twelve, (s) => showsCard(s) && s.turnCount >= 3 && effectCount(s) >= 2 && effectCount(s) <= 3 && (s.lastOutcome?.changes.length ?? 0) > 0)
  fixtures.push({ id: 'plateau-12', label: 'Milieu de partie, carte + effets (12 joueurs)', steps: [step('carte posée', twelve, mid[mid.length - 1])] })

  const manyFx = playUntil(twelve, (s) => showsCard(s) && effectCount(s) >= 5)
  fixtures.push({ id: 'effets-12', label: 'Beaucoup d’effets en cours (12 joueurs)', steps: [step('effets', twelve, manyFx[manyFx.length - 1])] })

  const bomb = playUntil(twelve, (s) => showsCard(s) && (s.lastOutcome?.changes.length ?? 0) >= 9)
  fixtures.push({ id: 'tout-le-monde-boit-12', label: 'Case qui touche toute la table (12 joueurs)', steps: [step('carte', twelve, bomb[bomb.length - 1])] })

  const target = playUntil(twelve, (s) => s.phase === 'awaiting-interaction' && Boolean(s.pending?.needsTarget) && !s.pending?.stage && s.turnCount >= 2)
  fixtures.push({ id: 'choix-cible-12', label: 'Choix de cible en attente (12 joueurs)', steps: [step('cible', twelve, target[target.length - 1])] })

  const verdict = playUntil(twelve, (s) => s.pending?.stage === 'verdict' && s.pending.case?.type === 'defi')
  fixtures.push({ id: 'verdict-defi-12', label: 'Défi : le joueur au tour arbitre (12 joueurs)', steps: [step('verdict', twelve, verdict[verdict.length - 1])] })

  const side = playUntil(twelve, (s) => s.pending?.stage === 'side')
  fixtures.push({ id: 'pile-face-12', label: 'Pile ou face : la cible choisit (12 joueurs)', steps: [step('côté', twelve, side[side.length - 1])] })

  const meta = playUntil(twelve, (s) => showsCard(s) && (s.lastOutcome?.caseType === 'repetition' || s.lastOutcome?.caseType === 'double-case'))
  fixtures.push({ id: 'meta-case-12', label: 'Répétition / Double case (titre composé)', steps: [step('méta-case', twelve, meta[meta.length - 1])] })

  // Lancer qui joue sa case d'office : dé → pion qui marche jusqu'à la case → pause → effet.
  const auto = playUntil(
    twelve,
    (s, h) => showsCard(s) && typeof s.lastOutcome?.diceLanding === 'number' && (s.lastOutcome?.changes.length ?? 0) >= 2 && showsCard(h[h.length - 2])
  )
  fixtures.push({
    id: 'sequence-lancer-12',
    label: 'Séquence : lancer à case d’office (dé, marche, carte)',
    steps: [step('avant le lancer', twelve, auto[auto.length - 2]), step('après le lancer', twelve, auto[auto.length - 1])],
  })

  // Lancer → case à cible : dé, marche, encadré « en attente », puis la carte de l'effet.
  const targeted = playUntil(
    twelve,
    (s, h) =>
      showsCard(s) &&
      h.length >= 3 &&
      h[h.length - 2].pending?.needsTarget === true &&
      !h[h.length - 2].pending?.stage &&
      showsCard(h[h.length - 3]) &&
      (s.lastOutcome?.changes.length ?? 0) > 0
  )
  fixtures.push({
    id: 'sequence-cible-12',
    label: 'Séquence : lancer, choix de cible, effet',
    steps: [
      step('avant le lancer', twelve, targeted[targeted.length - 3]),
      step('case en attente', twelve, targeted[targeted.length - 2]),
      step('effet appliqué', twelve, targeted[targeted.length - 1]),
    ],
  })

  // Roue : l'effet reste caché sous le spectacle (4,6 s + 2,2 s), comme sur les téléphones.
  const wheel = playUntil(twelve, (s) => s.lastInteraction?.kind === 'roue' && s.lastInteraction.drinks > 0)
  fixtures.push({
    id: 'sequence-roue-12',
    label: 'Séquence : roue des gorgées (spectacle)',
    steps: [step('roue en attente', twelve, wheel[wheel.length - 2]), step('roue tirée', twelve, wheel[wheel.length - 1])],
  })

  const coin = playUntil(twelve, (s) => s.lastInteraction?.kind === 'pile-face')
  fixtures.push({
    id: 'sequence-pile-face-12',
    label: 'Séquence : pile ou face (spectacle)',
    steps: [step('côté en attente', twelve, coin[coin.length - 2]), step('pièce lancée', twelve, coin[coin.length - 1])],
  })

  const shame = playUntil(twelve, (s) => s.lastInteraction?.kind === 'de-honte')
  fixtures.push({
    id: 'sequence-de-honte-12',
    label: 'Séquence : dé de la honte (spectacle)',
    steps: [step('dé en attente', twelve, shame[shame.length - 2]), step('dé lancé', twelve, shame[shame.length - 1])],
  })

  // Pas de roue des défis : le générateur ne la tire jamais en ligne (ONLINE_EXCLUDED).

  const chanceWait = playUntil(twelve, (s) => s.pending?.caseType === 'chance' && !s.pending.stage)
  fixtures.push({
    id: 'attente-chance-12',
    label: 'Chance : le joueur au tour choisit (12 joueurs)',
    steps: [step('chance', twelve, chanceWait[chanceWait.length - 1])],
  })

  const teleportWait = playUntil(twelve, (s) => s.pending?.caseType === 'teleport' && !s.pending.stage)
  fixtures.push({
    id: 'attente-teleport-12',
    label: 'Téléport : le joueur au tour choisit (12 joueurs)',
    steps: [step('téléport', twelve, teleportWait[teleportWait.length - 1])],
  })

  // Relance Chance tombée sur une case à cible : le choix de cible qui suit n'est pas un lancer (pas de dé rejoué).
  const relaunch = playUntil(
    twelve,
    (s, h) =>
      h.length >= 3 &&
      Boolean(s.pending?.stage) &&
      h[h.length - 2].lastOutcome?.chanceChoice === 'reroll' &&
      Boolean(h[h.length - 2].pending) &&
      !h[h.length - 2].pending?.stage &&
      h[h.length - 3].pending?.caseType === 'chance',
    { reroll: true, seeds: Array.from({ length: 80 }, (_, i) => `apercu-tv-relance-${i + 1}`) }
  )
  fixtures.push({
    id: 'sequence-relance-chance-12',
    label: 'Séquence : Chance → relance sur un défi / pile ou face → choix de cible',
    steps: [
      step('chance en attente', twelve, relaunch[relaunch.length - 3]),
      step('relance : dé, pion, case en attente', twelve, relaunch[relaunch.length - 2]),
      step('cible choisie (aucun dé)', twelve, relaunch[relaunch.length - 1]),
    ],
  })

  // Fin : le moteur déclare la victoire avec le lancer ; la TV attend que le pion soit arrivé.
  const end = playUntil(twelve, (s) => s.phase === 'finished')
  fixtures.push({
    id: 'sequence-fin-12',
    label: 'Séquence : lancer gagnant puis victoire',
    steps: [step('avant le dernier coup', twelve, end[end.length - 2]), step('victoire', twelve, end[end.length - 1])],
  })
  fixtures.push({ id: 'fin-12', label: 'Victoire (12 joueurs)', steps: [step('victoire', twelve, end[end.length - 1])] })

  const few = playUntil(three, (s) => showsCard(s) && s.turnCount >= 4 && effectCount(s) >= 1)
  fixtures.push({ id: 'plateau-3', label: 'Milieu de partie, 3 joueurs', steps: [step('carte posée', three, few[few.length - 1])] })

  const fewEnd = playUntil(three, (s) => s.phase === 'finished')
  fixtures.push({ id: 'fin-3', label: 'Victoire (3 joueurs)', steps: [step('victoire', three, fewEnd[fewEnd.length - 1])] })

  // Joueur parti : la table attend son retour avant de le remplacer par un bot.
  const left = markPlayerLeft(mid[mid.length - 1], 'u5', Date.now())
  if (left) {
    fixtures.push({ id: 'absent-12', label: 'Joueur parti (retour attendu)', steps: [step('absent', twelve, longDeadline(left))] })
    // Trois absents aux noms longs : deux nommés en tête du classement, « +1 », lignes du classement résumées.
    const two = markPlayerLeft(left, 'u9', Date.now())
    const many = two ? markPlayerLeft(two, 'u2', Date.now()) : null
    if (many) {
      fixtures.push({ id: 'absents-12', label: 'Trois joueurs partis (12 joueurs)', steps: [step('absents', twelve, longDeadline(many))] })
    }
  }

  // Bots : leur lancer n'a pas de dé à l'écran sur les téléphones (le pion part tout de suite).
  const withBots = previewMembers(4)
  const botRoll = playUntil(
    withBots,
    (s, h) => showsCard(s) && Boolean(s.players[h[h.length - 2].currentPlayer]?.isBot) && showsCard(h[h.length - 2]) && typeof s.lastOutcome?.diceLanding === 'number',
    { botsCount: 3 }
  )
  fixtures.push({
    id: 'sequence-bot-7',
    label: 'Séquence : lancer d’un bot (4 joueurs + 3 bots)',
    steps: [step('avant', withBots, botRoll[botRoll.length - 2]), step('lancer du bot', withBots, botRoll[botRoll.length - 1])],
  })

  // Un bot commente le coup qui vient de se jouer : la dernière bulle au pied du classement, qui lui cède sa hauteur.
  const talks = (s: EngineState, h: EngineState[]) => withPetitBuveurSay(h[h.length - 2], s, ALWAYS_TALK) !== s
  const talk = playUntil(withBots, (s, h) => showsCard(s) && talks(s, h), { botsCount: 3 })
  fixtures.push({
    id: 'paroles-bot-7',
    label: 'Un bot commente le coup (4 joueurs + 3 bots)',
    steps: [step('bulle', withBots, withPetitBuveurSay(talk[talk.length - 2], talk[talk.length - 1], ALWAYS_TALK))],
  })

  return fixtures
}
