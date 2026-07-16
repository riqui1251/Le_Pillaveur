import {
  PlinkoIcon,
  RaceFlagIcon,
  WheelIcon,
  BeerIcon,
  HiLoIcon,
  PurpleIcon,
  PyramidIcon,
  BalloonIcon,
  CrosshairIcon,
  DieThreeIcon,
  HangmanIcon,
  TrialMotoIcon,
  Dice1220Icon,
  WolfIcon,
  ShipIcon,
  LiarDiceIcon,
  MaskIcon,
  SpyGlassIcon,
  QuizBoltIcon,
  BluffCardsIcon,
  TabooIcon,
  CrayonIcon,
  PhoneSketchIcon,
  UncensoredIcon,
  CodeKeyIcon,
  DilemmaScaleIcon,
  GenericGameIcon,
} from '@/components/icons/GameIcons'

/**
 * Icône SVG de chaque jeu — un seul langage visuel (stroke 1.75,
 * currentColor). Identité « Cartes sur Table » : plus aucun emoji
 * structurel, la teinte vient du contexte (encre sur crème, crème sur feutre).
 */
export function GameIconById({ id, className }: { id: string; className?: string }) {
  if (id === 'plinko') return <PlinkoIcon className={className} />
  if (id === 'pmu') return <RaceFlagIcon className={className} />
  if (id === 'petit-buveur') return <BeerIcon className={className} />
  if (id === 'hi-lo') return <HiLoIcon className={className} />
  if (id === 'purple') return <PurpleIcon className={className} />
  if (id === 'pyramide') return <PyramidIcon className={className} />
  if (id === 'monsieur-3') return <DieThreeIcon className={className} />
  if (id === 'ballon-surprise') return <BalloonIcon className={className} />
  if (id === 'petits-points') return <CrosshairIcon className={className} />
  if (id === 'roue-des-gorgees') return <WheelIcon className={className} />
  if (id === 'pendu') return <HangmanIcon className={className} />
  if (id === 'trial-poursuite') return <TrialMotoIcon className={className} />
  if (id === '1220') return <Dice1220Icon className={className} />
  if (id === 'toucher-coule') return <ShipIcon className={className} />
  if (id === 'menteur') return <LiarDiceIcon className={className} />
  if (id === 'imposteur') return <MaskIcon className={className} />
  if (id === 'quiz') return <QuizBoltIcon className={className} />
  if (id === 'loup-garou') return <WolfIcon className={className} />
  if (id === 'bluff') return <BluffCardsIcon className={className} />
  if (id === 'espion') return <SpyGlassIcon className={className} />
  if (id === 'tabou') return <TabooIcon className={className} />
  if (id === 'crobard') return <CrayonIcon className={className} />
  if (id === 'telephone-dessine') return <PhoneSketchIcon className={className} />
  if (id === 'sans-filtre') return <UncensoredIcon className={className} />
  if (id === 'mots-codes') return <CodeKeyIcon className={className} />
  if (id === 'dilemmes') return <DilemmaScaleIcon className={className} />
  return <GenericGameIcon className={className} />
}
