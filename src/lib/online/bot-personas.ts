/**
 * Personas de bots partagés par tous les jeux en ligne.
 *
 * Chaque bot d'une table est un personnage reconnaissable : un nom, un emoji
 * d'avatar (fini le 🤖 uniforme), un trait de caractère et un tempo de
 * « réflexion ». Le persona est retrouvé PAR LE NOM stocké dans l'état de la
 * partie (`${name} ${emoji}`) — aucun champ sérialisé supplémentaire, donc
 * zéro migration d'état et le client comme le serveur retombent sur le même
 * personnage. Les déserteurs convertis en bot gardent leur pseudo humain :
 * personaForBotName renvoie null pour eux et les appelants utilisent les
 * valeurs par défaut.
 *
 * Les traits servent d'unique paramètre aux heuristiques de chaque jeu :
 * - prudent  : joue sage, lent — audace faible
 * - farceur  : préfère l'absurde, ose — audace forte, tempo vif
 * - suiveur  : colle à la majorité, tempo moyen
 * - agressif : prend l'option frontale, rapide
 * `audace` ∈ [0,1] est stable d'une partie à l'autre : Bernadette reste sage
 * toute sa vie, Dédé assume tout — les habitués les reconnaissent.
 */

export type BotTrait = 'prudent' | 'farceur' | 'suiveur' | 'agressif'

export interface BotPersona {
  name: string
  emoji: string
  trait: BotTrait
  /** Propension à « avoir déjà fait » / oser — cohérente sur toute la partie. */
  audace: number
  /** Fenêtre de « réflexion » avant d'agir, en ms. */
  tempoMinMs: number
  tempoMaxMs: number
}

export const DEFAULT_BOT_EMOJI = '🤖'

export const BOT_PERSONAS: readonly BotPersona[] = [
  { name: 'Barnabé', emoji: '🎩', trait: 'prudent', audace: 0.25, tempoMinMs: 2500, tempoMaxMs: 6000 },
  { name: 'Gépéto', emoji: '🤠', trait: 'farceur', audace: 0.8, tempoMinMs: 1200, tempoMaxMs: 3500 },
  { name: 'Raoul', emoji: '🦊', trait: 'agressif', audace: 0.85, tempoMinMs: 900, tempoMaxMs: 2500 },
  { name: 'Suzette', emoji: '🌸', trait: 'suiveur', audace: 0.45, tempoMinMs: 1800, tempoMaxMs: 4500 },
  { name: 'Marcel', emoji: '🍺', trait: 'farceur', audace: 0.7, tempoMinMs: 1500, tempoMaxMs: 4000 },
  { name: 'Gaston', emoji: '🐢', trait: 'prudent', audace: 0.2, tempoMinMs: 3000, tempoMaxMs: 7000 },
  { name: 'Bernadette', emoji: '🧶', trait: 'prudent', audace: 0.15, tempoMinMs: 2800, tempoMaxMs: 6500 },
  { name: 'Norbert', emoji: '🤓', trait: 'suiveur', audace: 0.35, tempoMinMs: 2000, tempoMaxMs: 5000 },
  { name: 'Ginette', emoji: '💃', trait: 'agressif', audace: 0.75, tempoMinMs: 1000, tempoMaxMs: 3000 },
  { name: 'Roger', emoji: '🎣', trait: 'suiveur', audace: 0.4, tempoMinMs: 2200, tempoMaxMs: 5500 },
  { name: 'Paulette', emoji: '🍷', trait: 'farceur', audace: 0.65, tempoMinMs: 1400, tempoMaxMs: 3800 },
  { name: 'Dédé', emoji: '🎲', trait: 'agressif', audace: 0.9, tempoMinMs: 800, tempoMaxMs: 2200 },
  { name: 'Huguette', emoji: '👵', trait: 'prudent', audace: 0.1, tempoMinMs: 3200, tempoMaxMs: 7500 },
  { name: 'Kéké', emoji: '🛵', trait: 'agressif', audace: 0.8, tempoMinMs: 900, tempoMaxMs: 2600 },
  { name: 'Mauricette', emoji: '🐔', trait: 'suiveur', audace: 0.5, tempoMinMs: 1900, tempoMaxMs: 4800 },
  { name: 'Firmin', emoji: '🕯️', trait: 'prudent', audace: 0.3, tempoMinMs: 2600, tempoMaxMs: 6200 },
  { name: 'Josiane', emoji: '💅', trait: 'farceur', audace: 0.6, tempoMinMs: 1600, tempoMaxMs: 4200 },
  { name: 'Lucien', emoji: '🎷', trait: 'suiveur', audace: 0.55, tempoMinMs: 1700, tempoMaxMs: 4300 },
  { name: 'Germaine', emoji: '⚡', trait: 'agressif', audace: 0.7, tempoMinMs: 1100, tempoMaxMs: 3200 },
  { name: 'Bricole', emoji: '🔧', trait: 'farceur', audace: 0.5, tempoMinMs: 1500, tempoMaxMs: 4000 },
]

/** Nom affiché d'un bot : « Gépéto 🤠 ». */
export function botDisplayName(persona: BotPersona): string {
  return `${persona.name} ${persona.emoji}`
}

/**
 * Tire `count` personas SANS doublon (reboucle au-delà de 20, cas théorique).
 * `rand` : générateur uniforme [0,1) — passer le rng seedé du jeu pour que la
 * table soit reproductible, sinon Math.random.
 */
export function pickBotPersonas(count: number, rand: () => number = Math.random): BotPersona[] {
  const pool = [...BOT_PERSONAS]
  const picked: BotPersona[] = []
  for (let i = 0; i < count; i++) {
    if (pool.length === 0) pool.push(...BOT_PERSONAS)
    const idx = Math.min(pool.length - 1, Math.floor(rand() * pool.length))
    picked.push(pool.splice(idx, 1)[0])
  }
  return picked
}

/**
 * Retrouve le persona depuis le nom stocké dans l'état (« Gépéto 🤠 »).
 * Null pour un déserteur converti (il garde son pseudo humain).
 */
export function personaForBotName(name: string | null | undefined): BotPersona | null {
  if (!name) return null
  return BOT_PERSONAS.find((p) => name === p.name || name.startsWith(`${p.name} `)) ?? null
}

/** Emoji d'avatar d'un bot : celui du persona, sinon le 🤖 générique. */
export function botEmojiFromName(name: string | null | undefined): string {
  return personaForBotName(name)?.emoji ?? DEFAULT_BOT_EMOJI
}

/**
 * Délai de « réflexion » avant l'action d'un bot, tiré dans la fenêtre de son
 * persona (repli 1500-4000 ms pour les convertis). À utiliser par les ticks
 * client à la place des setTimeout métronomiques.
 */
export function botTickDelayMs(
  name: string | null | undefined,
  rand: () => number = Math.random
): number {
  const persona = personaForBotName(name)
  const min = persona?.tempoMinMs ?? 1500
  const max = persona?.tempoMaxMs ?? 4000
  return Math.round(min + rand() * (max - min))
}
