import type { ComponentType, CSSProperties } from 'react'
import {
  AbcSheetIcon,
  BalloonIcon,
  BeerIcon,
  BluffCardsIcon,
  CodeKeyIcon,
  CrayonIcon,
  CrosshairIcon,
  CrownCardIcon,
  Dice1220Icon,
  DieThreeIcon,
  DilemmaScaleIcon,
  GenericGameIcon,
  HangmanIcon,
  HiLoIcon,
  HorseIcon,
  LiarDiceIcon,
  MaskIcon,
  PhoneSketchIcon,
  PlinkoIcon,
  PurpleIcon,
  PyramidIcon,
  QuizBoltIcon,
  ShipIcon,
  SpyGlassIcon,
  TabooIcon,
  TrialMotoIcon,
  UncensoredIcon,
  WheelIcon,
  WolfIcon,
  type IconProps,
} from '@/components/icons/GameIcons'
import { getGameById } from '@/lib/games'
import { suitIsRed } from '@/components/ui/PlayingCard'
import { cn } from '@/lib/utils'

/** Icône de chaque jeu du catalogue ; un id inconnu retombe sur le jeton générique. */
export const GAME_ICONS: Record<string, ComponentType<IconProps>> = {
  'monsieur-3': DieThreeIcon,
  pmu: HorseIcon,
  'petit-buveur': BeerIcon,
  'hi-lo': HiLoIcon,
  purple: PurpleIcon,
  pyramide: PyramidIcon,
  plinko: PlinkoIcon,
  '1220': Dice1220Icon,
  'toucher-coule': ShipIcon,
  menteur: LiarDiceIcon,
  imposteur: MaskIcon,
  quiz: QuizBoltIcon,
  'loup-garou': WolfIcon,
  bluff: BluffCardsIcon,
  espion: SpyGlassIcon,
  tabou: TabooIcon,
  crobard: CrayonIcon,
  'sans-filtre': UncensoredIcon,
  'mots-codes': CodeKeyIcon,
  dilemmes: DilemmaScaleIcon,
  'petit-bac': AbcSheetIcon,
  president: CrownCardIcon,
  'telephone-dessine': PhoneSketchIcon,
  'roue-des-gorgees': WheelIcon,
  'ballon-surprise': BalloonIcon,
  'petits-points': CrosshairIcon,
  pendu: HangmanIcon,
  'trial-poursuite': TrialMotoIcon,
}

/**
 * Surface sur laquelle l'icône est posée — décide la couleur du corps ET de
 * l'accent, pour ne jamais retomber sur un accord illisible :
 * - `card` : carte crème. Corps encre #24201A (13,5:1), accent rouge carreau
 *   pour ♥♦ (5,0:1), monochrome pour ♠♣.
 * - `felt` : feutre (vert ou bleu nuit en Soft). Corps crème, accent or.
 * - `feltGold` : feutre, corps or (puces, listes discrètes). Accent crème :
 *   jamais d'or sur or.
 * - `gold` : pastille ou bouton or. Corps encre, accent monochrome (le rouge
 *   y tombe à 2,65:1, la crème à 1,9:1).
 */
export type GameIconSurface = 'card' | 'felt' | 'feltGold' | 'gold'

/** Teinte de l'accent quand on la force (`none` = monochrome). */
export type GameIconAccent = 'red' | 'gold' | 'cream' | 'none'

const ACCENT_VALUE: Record<GameIconAccent, string> = {
  red: 'rgb(var(--suit-red-rgb))',
  gold: 'rgb(var(--gold-rgb))',
  cream: 'rgb(var(--cream-rgb))',
  none: 'currentColor',
}

const SURFACE_BODY: Record<GameIconSurface, string> = {
  card: 'text-[#24201A]',
  felt: 'text-cream',
  feltGold: 'text-gold',
  gold: 'text-[#24201A]',
}

function surfaceAccent(surface: GameIconSurface, id: string): GameIconAccent {
  if (surface === 'card') {
    const suit = getGameById(id)?.suit
    return suit && suitIsRed(suit) ? 'red' : 'none'
  }
  if (surface === 'felt') return 'gold'
  if (surface === 'feltGold') return 'cream'
  return 'none'
}

/**
 * Icône SVG d'un jeu. Sans `surface` ni `accent`, la couleur du corps vient du
 * `className` (ou du parent) et l'accent hérite de `--icon-accent`, sinon il
 * suit le corps : monochrome, lisible partout. Taille minimale : h-5 w-5.
 */
export function GameIconById({
  id,
  className,
  surface,
  accent,
}: {
  id: string
  className?: string
  surface?: GameIconSurface
  accent?: GameIconAccent
}) {
  const Icon = GAME_ICONS[id] ?? GenericGameIcon
  const tone = accent ?? (surface ? surfaceAccent(surface, id) : undefined)
  const style = tone ? ({ '--icon-accent': ACCENT_VALUE[tone] } as CSSProperties) : undefined
  return <Icon className={cn('h-6 w-6', surface && SURFACE_BODY[surface], className)} style={style} />
}
