/**
 * Personas de bots partagés par tous les jeux en ligne.
 *
 * Chaque bot d'une table est un personnage reconnaissable : un nom, un
 * portrait (buste SVG unique, catalogue bot-portrait-defs.ts — fini le 🤖
 * uniforme), un trait de caractère et un tempo de « réflexion ». Le persona
 * est retrouvé PAR LE NOM stocké dans l'état de la partie — aucun champ
 * sérialisé supplémentaire, donc zéro migration d'état et le client comme le
 * serveur retombent sur le même personnage. Les tables ouvertes avant les
 * portraits portent encore l'ancien format « Gépéto 🤠 » : le lookup tolère
 * un suffixe après le nom. Les déserteurs convertis en bot gardent leur
 * pseudo humain : personaForBotName renvoie null pour eux et les appelants
 * utilisent les valeurs par défaut (avatar 🤖).
 *
 * Les traits servent d'unique paramètre aux heuristiques de chaque jeu :
 * - prudent  : joue sage, lent — audace faible
 * - farceur  : préfère l'absurde, ose — audace forte, tempo vif
 * - suiveur  : colle à la majorité, tempo moyen
 * - agressif : prend l'option frontale, rapide
 * `audace` ∈ [0,1] est stable d'une partie à l'autre : Bernadette reste sage
 * toute sa vie, Dédé assume tout — les habitués les reconnaissent.
 *
 * Le CARACTÈRE CHIFFRÉ complète le trait pour les jeux à débat (Loup-Garou) :
 * - rancune   ∈ [0,1] : poids de ce qu'on lui a fait (accusations reçues,
 *   aujourd'hui et la veille) dans qui il soupçonne — Germaine n'oublie rien,
 *   Lucien n'en veut à personne ;
 * - loyaute   ∈ [0,1] : part d'alliance à l'ouverture et fidélité à l'allié
 *   de la manche (il ne l'accable ni ne le vote volontiers) — Bernadette
 *   tient parole, Dédé trahit pour un coup d'éclat ;
 * - bavardage ∈ {1,2,3} : paroles max par manche de débat (sous le plafond
 *   moteur ; la réponse à qui l'accuse n'y compte pas) — Germaine « ne dit
 *   que trois mots », Josiane n'arrête pas.
 * Les « caractères » de la fiche (le notaire, le flambeur…) sont le lore qui
 * a fixé ces chiffres ; seuls les chiffres sont lus par le code.
 *
 * Le TIC DE LANGAGE donne une voix à chacun dans le fil du débat : un bout de
 * phrase à lui, collé devant (« Statistiquement, … ») ou derrière
 * (« …véridique ! ») sa parole. Le texte vit dans le catalogue i18n sous
 * `games.loup-garou.game.botTic.<ticKey>` — ici seulement la clé (ASCII, les
 * noms portent des accents) et la position. Un converti n'a pas de tic.
 */

export type BotTrait = 'prudent' | 'farceur' | 'suiveur' | 'agressif'

export type BotTicPosition = 'prefix' | 'suffix'

export interface BotPersona {
  name: string
  /** Id du portrait dans BOT_PORTRAITS (`bot-<ticKey>`), rendu par PlayerAvatarGlyph. */
  portraitId: string
  trait: BotTrait
  /** Propension à « avoir déjà fait » / oser — cohérente sur toute la partie. */
  audace: number
  /** Fenêtre de « réflexion » avant d'agir, en ms. */
  tempoMinMs: number
  tempoMaxMs: number
  /** Poids des offenses reçues dans ses soupçons, ∈ [0,1]. */
  rancune: number
  /** Fidélité à l'allié de la manche et goût des alliances, ∈ [0,1]. */
  loyaute: number
  /** Paroles max par manche de débat. */
  bavardage: 1 | 2 | 3
  /** Clé du tic de langage dans le catalogue (`botTic.<ticKey>`), unique. */
  ticKey: string
  /** Le tic ouvre la phrase ou la ferme. */
  ticPosition: BotTicPosition
}

export const DEFAULT_BOT_EMOJI = '🤖'

export const BOT_PERSONAS: readonly BotPersona[] = [
  // Le notaire du village : chaque mot pesé, chaque vote relu, aucune dette oubliée.
  { name: 'Barnabé', portraitId: 'bot-barnabe', trait: 'prudent', audace: 0.25, tempoMinMs: 2500, tempoMaxMs: 6000, rancune: 0.35, loyaute: 0.75, bavardage: 2, ticKey: 'barnabe', ticPosition: 'prefix' },
  // Le mytho sympathique du comptoir : chaque histoire est vraie, surtout la quatrième version.
  { name: 'Gépéto', portraitId: 'bot-gepeto', trait: 'farceur', audace: 0.8, tempoMinMs: 1200, tempoMaxMs: 3500, rancune: 0.15, loyaute: 0.3, bavardage: 3, ticKey: 'gepeto', ticPosition: 'suffix' },
  // Le maquignon rusé : parle doucement, vise juste, lâche un allié dès que ça l'arrange.
  { name: 'Raoul', portraitId: 'bot-raoul', trait: 'agressif', audace: 0.85, tempoMinMs: 900, tempoMaxMs: 2500, rancune: 0.9, loyaute: 0.2, bavardage: 2, ticKey: 'raoul', ticPosition: 'prefix' },
  // La gentille du village : n'a jamais contredit personne, vote comme sa voisine.
  { name: 'Suzette', portraitId: 'bot-suzette', trait: 'suiveur', audace: 0.45, tempoMinMs: 1800, tempoMaxMs: 4500, rancune: 0.05, loyaute: 0.85, bavardage: 2, ticKey: 'suzette', ticPosition: 'prefix' },
  // Le pilier de comptoir : une blague par situation, ne boude pas plus d'une manche.
  { name: 'Marcel', portraitId: 'bot-marcel', trait: 'farceur', audace: 0.7, tempoMinMs: 1500, tempoMaxMs: 4000, rancune: 0.25, loyaute: 0.6, bavardage: 3, ticKey: 'marcel', ticPosition: 'suffix' },
  // Le retraité du banc : se décide après tout le monde, garde une dent contre qui le bouscule.
  { name: 'Gaston', portraitId: 'bot-gaston', trait: 'prudent', audace: 0.2, tempoMinMs: 3000, tempoMaxMs: 7000, rancune: 0.4, loyaute: 0.6, bavardage: 1, ticKey: 'gaston', ticPosition: 'prefix' },
  // La mamie qui tricote : ne hausse jamais le ton, n'oublie jamais qui a été gentil.
  { name: 'Bernadette', portraitId: 'bot-bernadette', trait: 'prudent', audace: 0.15, tempoMinMs: 2800, tempoMaxMs: 6500, rancune: 0.1, loyaute: 0.95, bavardage: 1, ticKey: 'bernadette', ticPosition: 'suffix' },
  // L'instituteur des chiffres : compte les mains levées, suit la majorité, prétend l'avoir prédit.
  { name: 'Norbert', portraitId: 'bot-norbert', trait: 'suiveur', audace: 0.35, tempoMinMs: 2000, tempoMaxMs: 5000, rancune: 0.45, loyaute: 0.5, bavardage: 3, ticKey: 'norbert', ticPosition: 'prefix' },
  // La reine du bal : la voix qui porte, le doigt qui pointe avant le cerveau.
  { name: 'Ginette', portraitId: 'bot-ginette', trait: 'agressif', audace: 0.75, tempoMinMs: 1000, tempoMaxMs: 3000, rancune: 0.65, loyaute: 0.4, bavardage: 3, ticKey: 'ginette', ticPosition: 'prefix' },
  // Le pêcheur du dimanche : pas d'avis mais un proverbe, attend que ça morde.
  { name: 'Roger', portraitId: 'bot-roger', trait: 'suiveur', audace: 0.4, tempoMinMs: 2200, tempoMaxMs: 5500, rancune: 0.25, loyaute: 0.8, bavardage: 1, ticKey: 'roger', ticPosition: 'suffix' },
  // La veuve joyeuse : une pique en souriant, aux autres de deviner si c'était sérieux.
  { name: 'Paulette', portraitId: 'bot-paulette', trait: 'farceur', audace: 0.65, tempoMinMs: 1400, tempoMaxMs: 3800, rancune: 0.5, loyaute: 0.35, bavardage: 2, ticKey: 'paulette', ticPosition: 'suffix' },
  // Le flambeur du bar-tabac : tout sur la première intuition, trahit pour un coup d'éclat.
  { name: 'Dédé', portraitId: 'bot-dede', trait: 'agressif', audace: 0.9, tempoMinMs: 800, tempoMaxMs: 2200, rancune: 0.7, loyaute: 0.1, bavardage: 2, ticKey: 'dede', ticPosition: 'prefix' },
  // La doyenne : a tout vu, c'était mieux avant, consigne chaque offense.
  { name: 'Huguette', portraitId: 'bot-huguette', trait: 'prudent', audace: 0.1, tempoMinMs: 3200, tempoMaxMs: 7500, rancune: 0.6, loyaute: 0.75, bavardage: 1, ticKey: 'huguette', ticPosition: 'prefix' },
  // Le jeune en scooter : parle fort, accuse vite, défend ses potes jusqu'au bout.
  { name: 'Kéké', portraitId: 'bot-keke', trait: 'agressif', audace: 0.8, tempoMinMs: 900, tempoMaxMs: 2600, rancune: 0.55, loyaute: 0.65, bavardage: 3, ticKey: 'keke', ticPosition: 'suffix' },
  // La fermière : s'affole pour un rien, finit toujours par suivre le troupeau.
  { name: 'Mauricette', portraitId: 'bot-mauricette', trait: 'suiveur', audace: 0.5, tempoMinMs: 1900, tempoMaxMs: 4800, rancune: 0.3, loyaute: 0.9, bavardage: 3, ticKey: 'mauricette', ticPosition: 'prefix' },
  // Le sacristain : un cierge pour tout le monde, note en silence qui a péché.
  { name: 'Firmin', portraitId: 'bot-firmin', trait: 'prudent', audace: 0.3, tempoMinMs: 2600, tempoMaxMs: 6200, rancune: 0.6, loyaute: 0.55, bavardage: 2, ticKey: 'firmin', ticPosition: 'suffix' },
  // La coiffeuse : sait tout avant tout le monde, retourne sa veste sans prévenir.
  { name: 'Josiane', portraitId: 'bot-josiane', trait: 'farceur', audace: 0.6, tempoMinMs: 1600, tempoMaxMs: 4200, rancune: 0.75, loyaute: 0.25, bavardage: 3, ticKey: 'josiane', ticPosition: 'prefix' },
  // Le saxophoniste du bal : tout avec philosophie, n'en veut à personne.
  { name: 'Lucien', portraitId: 'bot-lucien', trait: 'suiveur', audace: 0.55, tempoMinMs: 1700, tempoMaxMs: 4300, rancune: 0, loyaute: 0.45, bavardage: 1, ticKey: 'lucien', ticPosition: 'suffix' },
  // La patronne du bistrot : trois mots, trois ordres, et n'oublie rien.
  { name: 'Germaine', portraitId: 'bot-germaine', trait: 'agressif', audace: 0.7, tempoMinMs: 1100, tempoMaxMs: 3200, rancune: 1, loyaute: 0.7, bavardage: 1, ticKey: 'germaine', ticPosition: 'suffix' },
  // Le bricoleur : répare tout au fil de fer, un vote est un boulon de plus à serrer.
  { name: 'Bricole', portraitId: 'bot-bricole', trait: 'farceur', audace: 0.5, tempoMinMs: 1500, tempoMaxMs: 4000, rancune: 0.15, loyaute: 0.7, bavardage: 2, ticKey: 'bricole', ticPosition: 'suffix' },
]

/**
 * Nom stocké et affiché d'un bot : « Gépéto », nu — le portrait fait
 * l'avatar, un emoji dans le nom ferait doublon dans tout rendu texte.
 */
export function botDisplayName(persona: BotPersona): string {
  return persona.name
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
 * Retrouve le persona depuis le nom stocké dans l'état : « Gépéto », ou
 * « Gépéto 🤠 » dans une table ouverte avant les portraits (le suffixe est
 * ignoré). Null pour un déserteur converti (il garde son pseudo humain).
 */
export function personaForBotName(name: string | null | undefined): BotPersona | null {
  if (!name) return null
  return BOT_PERSONAS.find((p) => name === p.name || name.startsWith(`${p.name} `)) ?? null
}

/**
 * Avatar d'un bot pour PlayerAvatarGlyph : l'id de portrait de son persona
 * (rendu SVG), sinon le 🤖 générique d'un converti (rendu texte).
 */
export function botAvatarFromName(name: string | null | undefined): string {
  return personaForBotName(name)?.portraitId ?? DEFAULT_BOT_EMOJI
}

/** @deprecated Ancien nom de botAvatarFromName (la valeur n'est plus un emoji). */
export const botEmojiFromName = botAvatarFromName

/**
 * Les paramètres de personnalité lus par les heuristiques de jeu : le trait
 * (type de réaction), l'audace (probabilité d'oser : interpeller,
 * contre-accuser), le tempo minimal (ordre de prise de parole) et le
 * caractère chiffré (rancune, loyauté, bavardage). Unique source : aucune
 * table parallèle par jeu.
 */
export type BotTraits = {
  trait: BotTrait
  audace: number
  tempoMinMs: number
  rancune: number
  loyaute: number
  bavardage: 1 | 2 | 3
}

/** Un déserteur converti (sans persona) : suiveur moyen, ni rancunier ni fidèle, deux paroles par manche. */
export const DEFAULT_BOT_TRAITS: BotTraits = {
  trait: 'suiveur',
  audace: 0.5,
  tempoMinMs: 2000,
  rancune: 0.5,
  loyaute: 0.5,
  bavardage: 2,
}

export function botTraitsFor(name: string | null | undefined): BotTraits {
  const persona = personaForBotName(name)
  if (!persona) return DEFAULT_BOT_TRAITS
  return {
    trait: persona.trait,
    audace: persona.audace,
    tempoMinMs: persona.tempoMinMs,
    rancune: persona.rancune,
    loyaute: persona.loyaute,
    bavardage: persona.bavardage,
  }
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
