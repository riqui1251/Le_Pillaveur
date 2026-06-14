import type { EffectOutcome } from './case-notification'
import type { Case, PetitBuveurT } from './case-config'
import { protectedBadgeHtml } from './case-notification'

export function outcomeCaseBase(): EffectOutcome {
  return { type: 'caseBase' }
}

export function outcomeI18n(
  key: string,
  opts?: {
    params?: Record<string, string | number>
    htmlParams?: Record<string, string>
    playerRefs?: Record<string, string>
  }
): EffectOutcome {
  return { type: 'i18n', key, ...opts }
}

export function outcomeCompose(...items: EffectOutcome[]): EffectOutcome {
  return { type: 'compose', items }
}

export function outcomeWithCaseBase(...rest: EffectOutcome[]): EffectOutcome {
  return outcomeCompose(outcomeCaseBase(), ...rest)
}

export function outcomeProtectedTarget(
  t: PetitBuveurT,
  targetPlayerId: string
): EffectOutcome {
  return outcomeCompose(
    outcomeCaseBase(),
    outcomeI18n('game.outcomes.targetProtected', {
      htmlParams: { protected: protectedBadgeHtml(t) },
      playerRefs: { player: targetPlayerId },
    })
  )
}

export function outcomeDrinks(targetPlayerId: string, count: number): EffectOutcome {
  return outcomeI18n('game.outcomes.drinks', {
    params: { count },
    playerRefs: { player: targetPlayerId },
  })
}

export function outcomeSafeCase(targetPlayerId: string): EffectOutcome {
  return outcomeI18n('game.outcomes.safeCaseBoard', {
    playerRefs: { player: targetPlayerId },
  })
}

export function outcomeSpared(targetPlayerId: string): EffectOutcome {
  return outcomeCompose(
    outcomeCaseBase(),
    outcomeI18n('game.sparedLabel', { playerRefs: { player: targetPlayerId } })
  )
}

export function outcomeMove(
  targetPlayerId: string,
  arrow: string,
  from: number,
  to: number
): EffectOutcome {
  return outcomeI18n('game.outcomes.move', {
    params: { arrow, from, to },
    playerRefs: { player: targetPlayerId },
  })
}

export function outcomeCannotRecul(targetPlayerId: string): EffectOutcome {
  return outcomeI18n('game.outcomes.cannotRecul', {
    playerRefs: { player: targetPlayerId },
  })
}

export function outcomeBombe(targetPlayerId: string, count: number, name: string): EffectOutcome {
  return outcomeI18n('game.outcomes.bombe', {
    params: { count, name },
    playerRefs: { player: targetPlayerId },
  })
}

export function outcomeProtectionApplied(targetPlayerId: string): EffectOutcome {
  return outcomeI18n('game.outcomes.protectionApplied', {
    playerRefs: { player: targetPlayerId },
  })
}

export function outcomeCurseApplied(targetPlayerId: string, count: number): EffectOutcome {
  return outcomeI18n('game.outcomes.curseApplied', {
    params: { count },
    playerRefs: { player: targetPlayerId },
  })
}

export function outcomeMiroirSwap(targetPlayerId: string): EffectOutcome {
  return outcomeI18n('game.outcomes.miroirSwap', {
    playerRefs: { player: targetPlayerId },
  })
}

export function outcomeTrap(
  targetPlayerId: string,
  count: number,
  position: number
): EffectOutcome {
  return outcomeI18n('game.outcomes.trap', {
    params: { count, position },
    playerRefs: { player: targetPlayerId },
  })
}

export function outcomeTrapProtected(
  t: PetitBuveurT,
  targetPlayerId: string,
  count: number,
  position: number
): EffectOutcome {
  return outcomeI18n('game.outcomes.trapProtected', {
    params: { count, position },
    htmlParams: { protected: protectedBadgeHtml(t) },
    playerRefs: { player: targetPlayerId },
  })
}

export function outcomeDoublePeine(targetPlayerId: string, count: number): EffectOutcome {
  return outcomeI18n('game.outcomes.doublePeine', {
    params: { count },
    playerRefs: { player: targetPlayerId },
  })
}

export function outcomeCopie(
  targetPlayerId: string,
  delta: number,
  from: number,
  to: number
): EffectOutcome {
  return outcomeI18n('game.outcomes.copie', {
    params: { delta: `${delta >= 0 ? '+' : ''}${delta}`, from, to },
    playerRefs: { player: targetPlayerId },
  })
}

export function outcomeRouletteProtected(t: PetitBuveurT, targetPlayerId: string): EffectOutcome {
  return outcomeI18n('game.outcomes.rouletteProtected', {
    htmlParams: { protected: protectedBadgeHtml(t) },
    playerRefs: { player: targetPlayerId },
  })
}

export function outcomeRouletteMiss(targetPlayerId: string, count: number): EffectOutcome {
  return outcomeI18n('game.outcomes.rouletteMiss', {
    params: { count },
    playerRefs: { player: targetPlayerId },
  })
}

export function outcomeRouletteSafe(targetPlayerId: string): EffectOutcome {
  return outcomeI18n('game.outcomes.rouletteSafe', {
    playerRefs: { player: targetPlayerId },
  })
}

export function outcomeSkipTurnNext(targetPlayerId: string): EffectOutcome {
  return outcomeI18n('game.outcomes.skipTurnNext', {
    playerRefs: { player: targetPlayerId },
  })
}

export function outcomeAnchorApplied(targetPlayerId: string): EffectOutcome {
  return outcomeI18n('game.outcomes.anchorApplied', {
    playerRefs: { player: targetPlayerId },
  })
}

export function outcomeInversion(
  lastPlayerId: string,
  targetPlayerId: string,
  count: number
): EffectOutcome {
  return outcomeI18n('game.outcomes.inversion', {
    params: { count },
    playerRefs: { last: lastPlayerId, player: targetPlayerId },
  })
}

export function outcomeMirrorLink(
  actorId: string,
  targetPlayerId: string,
  turns: number
): EffectOutcome {
  return outcomeI18n('game.outcomes.mirrorLink', {
    params: { count: turns },
    playerRefs: { actor: actorId, target: targetPlayerId },
  })
}

export function outcomeRewindSafe(targetPlayerId: string): EffectOutcome {
  return outcomeI18n('game.outcomes.rewindSafe', {
    playerRefs: { player: targetPlayerId },
  })
}

export function outcomeMelange(targetPlayerId: string): EffectOutcome {
  return outcomeI18n('game.outcomes.melange', {
    playerRefs: { player: targetPlayerId },
  })
}

export function outcomeGenericApplied(targetPlayerId: string, caseType: Case['type']): EffectOutcome {
  return outcomeI18n('game.outcomes.genericApplied', {
    params: { type: caseType },
    playerRefs: { player: targetPlayerId },
  })
}

export function outcomeNoPreviousCase(): EffectOutcome {
  return outcomeI18n('game.outcomes.noPreviousCase')
}

export function outcomeChainLinked(
  actorId: string,
  targetId: string,
  turns: number
): EffectOutcome {
  return outcomeI18n('game.outcomes.chainLinked', {
    params: { count: turns },
    playerRefs: { actor: actorId, target: targetId },
  })
}

export function outcomeChallengeResult(
  targetId: string,
  completed: boolean,
  drinks: number
): EffectOutcome {
  return completed
    ? outcomeI18n('game.outcomes.challengeSuccess', { playerRefs: { player: targetId } })
    : outcomeI18n('game.outcomes.challengeDrink', {
        params: { count: drinks },
        playerRefs: { player: targetId },
      })
}

export function outcomeSkipTurnSelf(targetId: string): EffectOutcome {
  return outcomeI18n('game.outcomes.skipTurn', { playerRefs: { player: targetId } })
}
