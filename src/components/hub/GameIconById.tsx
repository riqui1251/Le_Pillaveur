import {
  PlinkoIcon,
  RaceFlagIcon,
  WheelIcon,
  BeerIcon,
  HiLoIcon,
  PurpleIcon,
  PyramidIcon,
  PistolIcon,
  BalloonIcon,
  CrosshairIcon,
  DieThreeIcon,
  HangmanIcon,
  TrialMotoIcon,
  Dice1220Icon,
} from '@/components/icons/GameIcons'

export function GameIconById({ id, className }: { id: string; className?: string }) {
  if (id === 'plinko') return <PlinkoIcon className={className} />
  if (id === 'pmu') return <RaceFlagIcon className={className} />
  if (id === 'petit-buveur') return <BeerIcon className={className} />
  if (id === 'hi-lo') return <HiLoIcon className={className} />
  if (id === 'purple') return <PurpleIcon className={className} />
  if (id === 'pyramide') return <PyramidIcon className={className} />
  if (id === 'roulette-russe') return <PistolIcon className={className} />
  if (id === 'monsieur-3') return <DieThreeIcon className={className} />
  if (id === 'ballon-surprise') return <BalloonIcon className={className} />
  if (id === 'petits-points') return <CrosshairIcon className={className} />
  if (id === 'roue-des-gorgees') return <WheelIcon className={className} />
  if (id === 'pendu') return <HangmanIcon className={className} />
  if (id === 'trial-poursuite') return <TrialMotoIcon className={className} />
  if (id === '1220') return <Dice1220Icon className={className} />
  return <span className={className} aria-hidden>🎮</span>
}
