import type { Prisma, PrismaClient } from '@prisma/client'
import {
  SOLO_BOTS_LEVEL_CAP,
  XP_LOSS,
  XP_SOLO_BOTS,
  XP_WIN,
  levelForXp,
  streakBonusXp,
} from '@/lib/online/cosmetics'
import { checkMatchAchievements } from '@/lib/online/achievements'
import {
  buildXpGainDetail,
  rememberXpGain,
  takeUnannouncedAchievements,
  type XpGainReason,
} from '@/lib/online/xp'
import type { DilState } from '@/lib/dilemmes/engine'
import type { BluffState } from '@/lib/bluff/engine'
import type { CrobardState } from '@/lib/crobard/engine'
import type { EspionState } from '@/lib/espion/engine'
import type { TabouState } from '@/lib/tabou/engine'
import { lgTeamOf, type LGState } from '@/lib/loup-garou/engine'
import type { EngineState } from '@/lib/petit-buveur/engine'
import type { TCState } from '@/lib/toucher-coule/engine'
import type { MenteurState } from '@/lib/menteur/engine'
import type { ImposteurState } from '@/lib/imposteur/engine'
import type { QuizState } from '@/lib/quiz/engine'
import type { SFState } from '@/lib/sans-filtre/engine'
import type { MCState } from '@/lib/mots-codes/engine'
import type { PbcState } from '@/lib/petit-bac/engine'
import type { PreState } from '@/lib/president/engine'
import type { PurpleState } from '@/lib/purple/engine'
import type { Game1220State } from '@/lib/1220/engine'
import type { TelephoneState } from '@/lib/telephone-dessine/engine'

/**
 * Résultats de partie EN LIGNE pour le classement (victoires/défaites —
 * les gorgées n'entrent pas en compte).
 *
 * Règles de comptage :
 *  - seuls les COMPTES humains sont enregistrés (les bots de complément
 *    `bot-N` n'existent pas en base) ;
 *  - une partie ne compte que si AU MOINS DEUX comptes y participaient —
 *    sinon on farme des victoires contre des bots ;
 *  - un déserteur (humain remplacé par un bot en cours de partie) prend
 *    une DÉFAITE, même si son remplaçant a « gagné » (anti rage-quit).
 */

/** Issue d'un joueur du MOTEUR à la fin d'une partie (avant règles de compte). */
export type MatchOutcome = {
  playerId: string
  /** true = bot de complément OU humain converti en bot (déserteur). */
  isBot: boolean
  won: boolean
  /** Rang final quand le jeu en produit un (Quiz). */
  rank?: number
}

export type MatchResultRow = {
  userId: string
  outcome: 'win' | 'loss'
  rank: number | null
  playerCount: number
  humanCount: number
}

/** Ids moteur des bots de complément — jamais des comptes utilisateur. */
const FILLER_BOT_RE = /^bot-\d+$/

/**
 * Jeux SANS gagnant attribuable : l'XP de participation est créditée mais
 * AUCUNE ligne de classement n'est écrite (un « perdant » systématique
 * fausserait les % de victoires).
 *  - dilemmes : pur social, le moteur n'a aucun score ;
 *  - espion : les rôles TOURNENT à chaque manche, le « camp gagnant » du
 *    décompte final ne correspond à aucun ensemble fixe de joueurs ;
 *  - purple et 1220 : le seul « score » est un compte de gorgées (une
 *    pénalité, pas un classement) ;
 *  - telephone-dessine : coopératif pur, aucun score dans le moteur.
 */
const PARTICIPATION_ONLY_GAMES = new Set([
  'dilemmes',
  'espion',
  'purple',
  '1220',
  'telephone-dessine',
])

/** Applique les règles de comptage. Retourne [] si la partie ne compte pas. */
export function computeMatchResults(outcomes: MatchOutcome[]): MatchResultRow[] {
  const accounts = outcomes.filter((o) => !FILLER_BOT_RE.test(o.playerId))
  if (accounts.length < 2) return []
  const playerCount = outcomes.length
  const humanCount = accounts.length
  return accounts.map((o) => ({
    userId: o.playerId,
    outcome: o.won && !o.isBot ? 'win' : 'loss',
    rank: o.rank ?? null,
    playerCount,
    humanCount,
  }))
}

/**
 * Extrait qui a gagné/perdu de l'état FINAL de chaque moteur.
 * Retourne null pour un jeu inconnu (rien n'est enregistré).
 */
export function matchOutcomesFor(gameId: string, state: unknown): MatchOutcome[] | null {
  switch (gameId) {
    case 'petit-buveur': {
      const s = state as EngineState
      return s.players.map((p) => ({
        playerId: p.id,
        isBot: Boolean(p.isBot),
        won: p.id === s.winner,
      }))
    }
    case 'toucher-coule': {
      const s = state as TCState
      return s.players.map((p) => ({
        playerId: p.id,
        isBot: p.isBot,
        won: s.winner !== null && p.team === s.winner,
      }))
    }
    case 'menteur': {
      const s = state as MenteurState
      return s.players.map((p) => ({
        playerId: p.id,
        isBot: p.isBot,
        won: p.id === s.winnerId,
      }))
    }
    case 'imposteur': {
      const s = state as ImposteurState
      return s.players.map((p) => ({
        playerId: p.id,
        isBot: p.isBot,
        won: s.winnerTeam !== null && p.team === s.winnerTeam,
      }))
    }
    case 'quiz': {
      const s = state as QuizState
      // Rang « compétition » : les ex æquo partagent le rang ; victoire = rang 1.
      const sorted = [...s.players].sort((a, b) => b.score - a.score)
      const rankOf = new Map<string, number>()
      sorted.forEach((p, i) => {
        const prev = sorted[i - 1]
        const rank = prev && prev.score === p.score ? rankOf.get(prev.id)! : i + 1
        rankOf.set(p.id, rank)
      })
      return s.players.map((p) => ({
        playerId: p.id,
        isBot: p.isBot,
        won: rankOf.get(p.id) === 1,
        rank: rankOf.get(p.id),
      }))
    }
    case 'loup-garou': {
      const s = state as LGState
      return s.players.map((p) => ({
        playerId: p.id,
        isBot: p.isBot,
        won: s.winnerTeam !== null && lgTeamOf(p.role) === s.winnerTeam,
      }))
    }
    case 'sans-filtre': {
      const s = state as SFState
      // Rang « compétition » par couronnes (comme le Quiz) ; victoire = rang 1
      // avec au moins une couronne (une partie sans couronnement ne sacre personne).
      const sorted = [...s.players].sort((a, b) => b.crowns - a.crowns)
      const rankOf = new Map<string, number>()
      sorted.forEach((p, i) => {
        const prev = sorted[i - 1]
        const rank = prev && prev.crowns === p.crowns ? rankOf.get(prev.id)! : i + 1
        rankOf.set(p.id, rank)
      })
      return s.players.map((p) => ({
        playerId: p.id,
        isBot: p.isBot,
        won: p.crowns > 0 && rankOf.get(p.id) === 1,
        rank: rankOf.get(p.id),
      }))
    }
    case 'petit-bac': {
      const s = state as PbcState
      // Rang « compétition » par score cumulé (comme le Quiz) ; victoire = rang 1
      // avec au moins un point (une partie à 0 partout ne sacre personne).
      const sorted = [...s.players].sort((a, b) => b.total - a.total)
      const rankOf = new Map<string, number>()
      sorted.forEach((p, i) => {
        const prev = sorted[i - 1]
        const rank = prev && prev.total === p.total ? rankOf.get(prev.id)! : i + 1
        rankOf.set(p.id, rank)
      })
      return s.players.map((p) => ({
        playerId: p.id,
        // Au Petit Bac, un déserteur n'est PAS converti en bot (il reste
        // leftAt) : on le traite comme tel ici — défaite anti rage-quit.
        isBot: p.isBot || Boolean(p.leftAt),
        won: p.total > 0 && rankOf.get(p.id) === 1,
        rank: rankOf.get(p.id),
      }))
    }
    case 'president': {
      const s = state as PreState
      // Classement de la DERNIÈRE manche : Président = rang 1 = victoire.
      const ranking = s.lastRanking ?? []
      return s.players.map((p) => {
        const idx = ranking.indexOf(p.id)
        return {
          playerId: p.id,
          isBot: p.isBot,
          won: idx === 0,
          rank: idx === -1 ? undefined : idx + 1,
        }
      })
    }
    case 'mots-codes': {
      const s = state as MCState
      return s.players.map((p) => ({
        playerId: p.id,
        isBot: p.isBot,
        won: s.winnerTeam !== null && p.team === s.winnerTeam,
      }))
    }
    case 'dilemmes': {
      // Pas de score dans le moteur : personne ne « gagne », tout le monde
      // participe (voir PARTICIPATION_ONLY_GAMES).
      const s = state as DilState
      return s.players.map((p) => ({
        playerId: p.id,
        isBot: p.isBot,
        won: false,
      }))
    }
    case 'espion': {
      // Rôles tournants : victoire inattribuable — participation seulement.
      const s = state as EspionState
      return s.players.map((p) => ({
        playerId: p.id,
        isBot: p.isBot,
        won: false,
      }))
    }
    case 'bluff': {
      const s = state as BluffState
      // Rang « compétition » par score (comme le Quiz) ; victoire = rang 1
      // avec au moins un point.
      const sorted = [...s.players].sort((a, b) => b.score - a.score)
      const rankOf = new Map<string, number>()
      sorted.forEach((p, i) => {
        const prev = sorted[i - 1]
        const rank = prev && prev.score === p.score ? rankOf.get(prev.id)! : i + 1
        rankOf.set(p.id, rank)
      })
      return s.players.map((p) => ({
        playerId: p.id,
        isBot: p.isBot,
        won: p.score > 0 && rankOf.get(p.id) === 1,
        rank: rankOf.get(p.id),
      }))
    }
    case 'crobard': {
      const s = state as CrobardState
      const sorted = [...s.players].sort((a, b) => b.score - a.score)
      const rankOf = new Map<string, number>()
      sorted.forEach((p, i) => {
        const prev = sorted[i - 1]
        const rank = prev && prev.score === p.score ? rankOf.get(prev.id)! : i + 1
        rankOf.set(p.id, rank)
      })
      return s.players.map((p) => ({
        playerId: p.id,
        isBot: p.isBot,
        won: p.score > 0 && rankOf.get(p.id) === 1,
        rank: rankOf.get(p.id),
      }))
    }
    case 'tabou': {
      const s = state as TabouState
      return s.players.map((p) => ({
        playerId: p.id,
        isBot: p.isBot,
        won: s.winnerTeam !== null && p.team === s.winnerTeam,
      }))
    }
    case 'purple': {
      // Le « score » du Purple est un compte de GORGÉES : rien à classer,
      // participation seulement (voir PARTICIPATION_ONLY_GAMES).
      const s = state as PurpleState
      return s.players.map((p) => ({
        playerId: p.id,
        isBot: p.isBot,
        won: false,
      }))
    }
    case '1220': {
      // Idem : des gorgées distribuées, aucun vainqueur.
      const s = state as Game1220State
      return s.players.map((p) => ({
        playerId: p.id,
        isBot: p.isBot,
        won: false,
      }))
    }
    case 'telephone-dessine': {
      // Jeu coopératif (jeu vitrine du funnel) : tout le monde participe,
      // personne ne gagne — mais la progression doit exister.
      const s = state as TelephoneState
      return s.players.map((p) => ({
        playerId: p.id,
        isBot: p.isBot,
        won: false,
      }))
    }
    default:
      return null
  }
}

/** Date du jour à Paris ('YYYY-MM-DD') — même convention que retention-sweep. */
function dayStringParis(offsetDays = 0): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() - offsetDays * 24 * 60 * 60 * 1000))
}

/** Ce que la série a rapporté à un joueur, plus son XP AVANT tout crédit. */
type StreakCredit = {
  /** Série en jours après cette partie. */
  streak: number
  /** Bonus crédité (0 si la série était déjà comptée aujourd'hui). */
  bonus: number
  /** XP du compte AVANT le moindre crédit de cette partie. */
  xpBefore: number
}

/**
 * Série quotidienne des joueurs crédités : première partie comptée du jour →
 * la série avance (ou repart à 1) et un bonus d'XP croissant tombe. Tout au
 * trafic, aucun cron. Une partie de plus le même jour ne change rien.
 *
 * Appelée AVANT les crédits de base : la lecture sert aussi de photo de l'XP
 * d'avant-partie, d'où le détail honnête du gain rendu au joueur (une seule
 * requête au lieu de deux).
 */
async function updateStreaks(
  client: PrismaClient | Prisma.TransactionClient,
  userIds: string[]
): Promise<Map<string, StreakCredit>> {
  const credits = new Map<string, StreakCredit>()
  if (userIds.length === 0) return credits
  const today = dayStringParis()
  const yesterday = dayStringParis(1)
  const users = await client.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, streakCount: true, streakLastDay: true, onlineXp: true },
  })
  for (const u of users) {
    const xpBefore = u.onlineXp ?? 0
    if (u.streakLastDay === today) {
      // Déjà créditée aujourd'hui : la série reste AFFICHABLE, sans bonus.
      credits.set(u.id, { streak: u.streakCount, bonus: 0, xpBefore })
      continue
    }
    const streak = u.streakLastDay === yesterday ? u.streakCount + 1 : 1
    const bonus = streakBonusXp(streak)
    await client.user.update({
      where: { id: u.id },
      data: {
        streakCount: streak,
        streakLastDay: today,
        onlineXp: { increment: bonus },
      },
    })
    credits.set(u.id, { streak, bonus, xpBefore })
  }
  return credits
}

/**
 * Mémorise le détail du gain pour l'écran de fin (F13 : c'est le serveur qui
 * crédite, c'est donc lui qui dit ce qui a été crédité). Les succès annoncés
 * sont dédoublonnés pour ne pas se répéter à chaque partie de la soirée.
 */
function rememberGains(args: {
  userIds: string[]
  reasonOf: (userId: string) => XpGainReason
  baseOf: (userId: string) => number
  credits: Map<string, StreakCredit>
  fallbackXpBefore: Map<string, number>
  unlocked: Map<string, string[]>
}): void {
  for (const userId of args.userIds) {
    const credit = args.credits.get(userId)
    const xpBefore = credit?.xpBefore ?? args.fallbackXpBefore.get(userId) ?? 0
    rememberXpGain(
      userId,
      buildXpGainDetail({
        reason: args.reasonOf(userId),
        xpBefore,
        base: args.baseOf(userId),
        streakBonus: credit?.bonus ?? 0,
        streakCount: credit?.streak ?? 0,
        achievements: takeUnannouncedAchievements(userId, args.unlocked.get(userId) ?? []),
      })
    )
  }
}

/**
 * Enregistre les résultats d'une partie qui VIENT de se terminer.
 * L'appelant garantit l'unicité (transition !finished → finished sous
 * compare-and-swap de stateVersion dans la route action).
 */
export async function recordMatchResults(
  client: PrismaClient | Prisma.TransactionClient,
  args: { roomId: string; gameId: string; state: unknown }
): Promise<number> {
  const outcomes = matchOutcomesFor(args.gameId, args.state)
  if (!outcomes) return 0
  const rows = computeMatchResults(outcomes)

  if (rows.length === 0) {
    // Un seul compte humain (solo contre bots) : XP d'entraînement réduite,
    // plafonnée aux premiers niveaux, sans ligne de classement ni streak au
    // plafond — la première partie du funnel paie, le farm ne rapporte rien.
    const solo = outcomes.filter((o) => !FILLER_BOT_RE.test(o.playerId) && !o.isBot)
    if (solo.length === 1) {
      const userId = solo[0].playerId
      const user = await client.user.findUnique({
        where: { id: userId },
        select: { onlineXp: true },
      })
      if (!user) return 0
      const capped = levelForXp(user.onlineXp) >= SOLO_BOTS_LEVEL_CAP
      let credits = new Map<string, StreakCredit>()
      if (!capped) {
        credits = await updateStreaks(client, [userId])
        await client.user.update({
          where: { id: userId },
          data: { onlineXp: { increment: XP_SOLO_BOTS } },
        })
      }
      // Succès (first_game, night_owl…) : même au plafond d'XP solo.
      let unlocked = new Map<string, string[]>()
      try {
        unlocked = await checkMatchAchievements(client, {
          gameId: args.gameId,
          userIds: [userId],
          winnerIds: [],
        })
      } catch (e) {
        console.error('[achievements] échec du déblocage', e)
      }
      // Au plafond, le gain vaut 0 : la bannière le dit franchement plutôt
      // que d'annoncer une XP qui n'a jamais été créditée.
      rememberGains({
        userIds: [userId],
        reasonOf: () => 'solo',
        baseOf: () => (capped ? 0 : XP_SOLO_BOTS),
        credits,
        fallbackXpBefore: new Map([[userId, user.onlineXp]]),
        unlocked,
      })
    }
    return 0
  }

  // Jeux sans gagnant : XP de participation pour tous, pas de classement.
  const participationOnly = PARTICIPATION_ONLY_GAMES.has(args.gameId)
  if (!participationOnly) {
    await client.onlineMatchResult.createMany({
      data: rows.map((r) => ({
        roomId: args.roomId,
        gameId: args.gameId,
        userId: r.userId,
        outcome: r.outcome,
        rank: r.rank,
        playerCount: r.playerCount,
        humanCount: r.humanCount,
      })),
    })
  }
  // XP de progression : mêmes règles de comptage que le classement.
  const userIds = rows.map((r) => r.userId)
  const winners = participationOnly ? [] : rows.filter((r) => r.outcome === 'win').map((r) => r.userId)
  const losers = participationOnly
    ? userIds
    : rows.filter((r) => r.outcome === 'loss').map((r) => r.userId)
  // La série passe EN PREMIER : sa lecture sert de photo de l'XP d'avant-partie.
  const credits = await updateStreaks(client, userIds)
  if (winners.length > 0) {
    await client.user.updateMany({
      where: { id: { in: winners } },
      data: { onlineXp: { increment: XP_WIN } },
    })
  }
  if (losers.length > 0) {
    await client.user.updateMany({
      where: { id: { in: losers } },
      data: { onlineXp: { increment: XP_LOSS } },
    })
  }
  let unlocked = new Map<string, string[]>()
  try {
    unlocked = await checkMatchAchievements(client, {
      gameId: args.gameId,
      userIds,
      winnerIds: winners,
    })
  } catch (e) {
    console.error('[achievements] échec du déblocage', e)
  }
  const winnerSet = new Set(winners)
  rememberGains({
    userIds,
    reasonOf: (id) => (participationOnly ? 'participation' : winnerSet.has(id) ? 'win' : 'loss'),
    baseOf: (id) => (winnerSet.has(id) ? XP_WIN : XP_LOSS),
    credits,
    fallbackXpBefore: new Map(),
    unlocked,
  })
  return participationOnly ? 0 : rows.length
}
