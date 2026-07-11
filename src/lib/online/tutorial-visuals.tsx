import type { ReactNode } from 'react'
import { Pencil, Crown } from 'lucide-react'
import { PlayingCard } from '@/components/ui/PlayingCard'
import { CssDie } from '@/components/games/CssDie'
import { MedalDot } from '@/components/online/MedalDot'
import { cn } from '@/lib/utils'

/**
 * Facsimilés du tutoriel (Direction B « La Vitrine ») : chaque étape montre
 * une MINIATURE FIDÈLE de l'écran réel (grille de vote, carte, canvas, dé…)
 * plutôt qu'un texte seul ou un diagramme abstrait — on apprend en
 * reconnaissant l'interface, pas en la lisant. Construits sur les mêmes
 * composants que le vrai jeu (PlayingCard, CssDie, MedalDot) pour ne jamais
 * dériver du rendu réel.
 *
 * Chaque famille est volontairement réutilisée entre plusieurs jeux qui
 * partagent le même geste (voter, dessiner, lancer un dé…) — voir
 * TUTORIAL_VISUALS en bas de fichier pour le mapping jeu → étapes.
 */

const BOX = 'flex h-24 items-center justify-center'

/** Carte à jouer miniature : rôle, mot secret ou lieu — le contenu qu'on va cacher aux autres. */
export function WordCardPreview({ label, sub, dim }: { label: string; sub?: string; dim?: string[] }) {
  return (
    <div className={BOX}>
      <PlayingCard suit="spade" rank="A" className="flex h-24 w-[4.6rem] flex-col items-center justify-center gap-1 px-1.5 text-center">
        <span className="font-display text-[13px] font-bold leading-tight text-[#24201A]">{label}</span>
        {sub && <span className="text-[8px] leading-tight text-[#6B6455]">{sub}</span>}
        {dim && (
          <span className="mt-0.5 line-clamp-2 text-[7px] leading-tight text-[#B3382E] opacity-70">
            {dim.join(' · ')}
          </span>
        )}
      </PlayingCard>
    </div>
  )
}

/** Carte-champ « à remplir » : pour les étapes où on écrit (bluff, phrase de départ). */
export function InputCardPreview({ hint }: { hint: string }) {
  return (
    <div className={BOX}>
      <div className="flex h-24 w-[4.6rem] flex-col items-center justify-center gap-2 rounded-xl border border-[#D8CCAE] bg-cream px-2 text-center shadow-[0_10px_24px_-12px_rgba(0,0,0,0.6)]">
        <Pencil className="h-4 w-4 text-[#B8862F]" aria-hidden />
        <span className="h-px w-8 bg-[#24201A]/25" />
        <span className="h-px w-6 bg-[#24201A]/15" />
        <span className="text-[7.5px] leading-tight text-[#6B6455]">{hint}</span>
      </div>
    </div>
  )
}

/** Grille de sélection (2 ou 4 cases) : vote, accusation, choix de réponse — le geste commun à la moitié des jeux. */
export function ChipGridPreview({
  items,
  highlight,
}: {
  items: { icon?: string; label: string }[]
  highlight: number
}) {
  return (
    <div className={cn(BOX, 'w-full')}>
      <div className="grid w-full max-w-[11rem] grid-cols-2 gap-1.5">
        {items.map((item, i) => (
          <div
            key={i}
            className={cn(
              'flex items-center gap-1 rounded-lg border bg-cream px-1.5 py-1.5 text-[#24201A]',
              i === highlight ? 'border-2 border-suit-red shadow-[0_0_0_1px_rgba(179,56,46,0.5)]' : 'border-[#D8CCAE]'
            )}
          >
            {item.icon && <span className="text-[11px]">{item.icon}</span>}
            <b className="truncate text-[8px] leading-tight">{item.label}</b>
          </div>
        ))}
      </div>
    </div>
  )
}

const BUZZER_SHAPES = [
  { shape: '▲', bg: 'from-red-600 to-rose-500' },
  { shape: '■', bg: 'from-blue-600 to-sky-500' },
  { shape: '●', bg: 'from-amber-500 to-yellow-400' },
  { shape: '◆', bg: 'from-emerald-600 to-green-500' },
] as const

/** Les 4 boutons buzzer du Grand Pillaveur — mêmes formes/couleurs que TvQuiz. */
export function BuzzerGridPreview({ highlight }: { highlight?: number }) {
  return (
    <div className={cn(BOX, 'w-full')}>
      <div className="grid w-full max-w-[9.5rem] grid-cols-2 gap-1.5">
        {BUZZER_SHAPES.map((s, i) => (
          <div
            key={i}
            className={cn(
              'flex h-8 items-center justify-center rounded-md bg-gradient-to-br text-sm font-bold text-white',
              s.bg,
              highlight === i && 'ring-2 ring-white/80'
            )}
          >
            {s.shape}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Canvas de dessin — trait à main levée, pour Crobard et Téléphone Dessiné (composant PartyCanvas partagé). */
export function CanvasPreview({ badge, dim }: { badge?: string; dim?: boolean }) {
  return (
    <div className={BOX}>
      <div
        className={cn(
          'relative h-20 w-28 overflow-hidden rounded-lg border border-[#D8CCAE] bg-white',
          dim && 'opacity-60'
        )}
      >
        <svg viewBox="0 0 100 60" className="h-full w-full">
          <path
            d="M18 45q6-30 26-32t26 17"
            fill="none"
            stroke="#24201A"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="66" cy="19" r="5.5" fill="none" stroke="#24201A" strokeWidth="2.5" />
        </svg>
        {badge && (
          <span className="absolute bottom-1 right-1.5 text-[7px] font-bold text-[#6B6455]">{badge}</span>
        )}
      </div>
    </div>
  )
}

/** Dés réels (composant CssDie du jeu) — sous gobelet ou posés, pour Menteur/Petit Buveur/1220. */
export function DicePreview({ faces, cup }: { faces: number[]; cup?: boolean }) {
  return (
    <div className={BOX}>
      <div className="flex items-center gap-2">
        {cup && <span className="text-xl" aria-hidden>🥤</span>}
        <div className="flex gap-1.5">
          {faces.map((f, i) => (
            <CssDie key={i} face={f} size="lg" />
          ))}
        </div>
      </div>
    </div>
  )
}

/** Deux camps : sky vs rose, avec un badge d'action — Tabou et Toucher-Coulé. */
export function TeamSplitPreview({ badge, badgeColor }: { badge: string; badgeColor: 'emerald' | 'suit-red' }) {
  return (
    <div className={BOX}>
      <div className="relative flex h-16 w-28 overflow-hidden rounded-lg border border-white/10">
        <div className="flex-1 bg-sky-500/25" />
        <div className="flex-1 bg-rose-500/25" />
        <span
          className={cn(
            'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-2 py-1 text-[9px] font-black text-white shadow-lg',
            badgeColor === 'emerald' ? 'bg-emerald-500' : 'bg-suit-red'
          )}
        >
          {badge}
        </span>
      </div>
    </div>
  )
}

/** Deux cartes qui se révèlent, colorées — l'identité visuelle de Purple. */
export function CardBetPreview({ colors }: { colors: [string, string] }) {
  return (
    <div className={BOX}>
      <div className="flex gap-2">
        {colors.map((c, i) => (
          <div
            key={i}
            className="flex h-16 w-11 items-center justify-center rounded-lg border-2 border-white/20 shadow-lg"
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  )
}

/** Classement final — réutilise les mêmes plaques or/argent/bronze que le classement en ligne. */
export function PodiumPreview() {
  return (
    <div className={BOX}>
      <div className="flex items-end gap-3">
        <div className="flex flex-col items-center gap-1"><MedalDot position={2} className="h-6 w-6 text-xs" /><span className="h-6 w-6 rounded-full bg-white/10" /></div>
        <div className="flex flex-col items-center gap-1"><MedalDot position={1} className="h-7 w-7 text-sm" /><Crown className="h-4 w-4 text-amber-300" aria-hidden /></div>
        <div className="flex flex-col items-center gap-1"><MedalDot position={3} className="h-6 w-6 text-xs" /><span className="h-6 w-6 rounded-full bg-white/10" /></div>
      </div>
    </div>
  )
}

/** Cycle nuit/jour — spécifique au Loup-Garou. */
export function NightDayPreview() {
  return (
    <div className={BOX}>
      <div className="flex h-16 w-28 overflow-hidden rounded-lg border border-white/10">
        <div className="flex flex-1 items-center justify-center bg-[#0A2C22]">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-gold" fill="currentColor"><path d="M12 3a9 9 0 1 0 8.94 10.06A7 7 0 0 1 12 3Z"/></svg>
        </div>
        <div className="flex flex-1 items-center justify-center bg-[#F3EAD3]">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#B8862F]" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="12" cy="12" r="4.5"/><path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" strokeLinecap="round"/></svg>
        </div>
      </div>
    </div>
  )
}

/** Piste du Petit Buveur — 30 cases, un pion posé. */
export function BoardPreview() {
  return (
    <div className={cn(BOX, 'w-full')}>
      <div className="flex w-full max-w-[11.5rem] gap-[3px] overflow-hidden">
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            className={cn(
              'relative h-7 flex-1 rounded-[3px]',
              i === 3 ? 'bg-gold/70' : 'bg-white/10'
            )}
          >
            {i === 3 && (
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[11px]">🎯</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Grille de tir Toucher-Coulé — cases touché/raté. */
export function BattleshipGridPreview() {
  const cells = ['hit', 'miss', '', '', 'hit', '', 'ship', '', '', '', 'miss', '', 'hit', '', '', '']
  return (
    <div className={BOX}>
      <div className="grid grid-cols-4 gap-[3px]">
        {cells.map((c, i) => (
          <span
            key={i}
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded-[3px] text-[9px]',
              c === 'hit' && 'bg-suit-red/70 text-white',
              c === 'miss' && 'bg-white/15 text-white/50',
              c === 'ship' && 'bg-sky-500/40',
              !c && 'bg-white/5'
            )}
          >
            {c === 'hit' ? '✕' : c === 'miss' ? '·' : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * Mapping jeu → visuel par étape (même ordre/longueur que
 * `games.<id>.tutorial.steps` dans les messages i18n). Un jeu absent de
 * cette table affiche le tutoriel texte seul (dégradation propre).
 */
export const TUTORIAL_VISUALS: Record<string, ReactNode[]> = {
  'loup-garou': [
    <WordCardPreview key={0} label="Voyante" sub="rôle spécial" />,
    <NightDayPreview key={1} />,
    <ChipGridPreview key={2} highlight={1} items={[{ icon: '🎸', label: 'Léa' }, { icon: '🍇', label: 'Marco' }, { icon: '🦊', label: 'Sophie' }, { icon: '🤖', label: 'Hugo' }]} />,
  ],
  imposteur: [
    <WordCardPreview key={0} label="POMME" sub="ton mot secret" />,
    <InputCardPreview key={1} hint="donne un indice" />,
    <ChipGridPreview key={2} highlight={2} items={[{ icon: '🎸', label: 'Léa' }, { icon: '🍇', label: 'Marco' }, { icon: '🦊', label: 'Sophie' }, { icon: '🤖', label: 'Hugo' }]} />,
  ],
  espion: [
    <WordCardPreview key={0} label="Plage" sub="lieu secret (ou pas)" />,
    <ChipGridPreview key={1} highlight={0} items={[{ icon: '🎸', label: 'Léa' }, { icon: '🍇', label: 'Marco' }, { icon: '🦊', label: 'Sophie' }, { icon: '🤖', label: 'Hugo' }]} />,
    <ChipGridPreview key={2} highlight={-1} items={[{ label: 'Plage' }, { label: 'Hôpital' }, { label: 'École' }, { label: 'Casino' }]} />,
  ],
  quiz: [
    <BuzzerGridPreview key={0} />,
    <BuzzerGridPreview key={1} highlight={2} />,
    <PodiumPreview key={2} />,
  ],
  bluff: [
    <InputCardPreview key={0} hint="invente une fausse réponse" />,
    <ChipGridPreview key={1} highlight={1} items={[{ label: 'Réponse A' }, { label: 'Réponse B' }, { label: 'Réponse C' }, { label: 'Réponse D' }]} />,
    <PodiumPreview key={2} />,
  ],
  tabou: [
    <WordCardPreview key={0} label="GUITARE" dim={['corde', 'musique', 'jouer', 'concert']} />,
    <TeamSplitPreview key={1} badge="TROUVÉ ✓" badgeColor="emerald" />,
    <TeamSplitPreview key={2} badge="TABOU !" badgeColor="suit-red" />,
  ],
  crobard: [
    <ChipGridPreview key={0} highlight={1} items={[{ label: 'Chat' }, { label: 'Guitare' }, { label: 'Fusée' }]} />,
    <CanvasPreview key={1} />,
    <CanvasPreview key={2} dim badge="3/4 ont trouvé" />,
  ],
  'telephone-dessine': [
    <InputCardPreview key={0} hint="écris une phrase" />,
    <CanvasPreview key={1} />,
    <CanvasPreview key={2} badge="chaîne révélée" />,
  ],
  menteur: [
    <DicePreview key={0} faces={[3, 5, 1]} cup />,
    <InputCardPreview key={1} hint='« quatre 5 » ou MENTEUR !' />,
    <DicePreview key={2} faces={[1, 1, 4]} />,
    <DicePreview key={3} faces={[2, 6]} />,
  ],
  'petit-buveur': [
    <BoardPreview key={0} />,
    <DicePreview key={1} faces={[4]} />,
    <BoardPreview key={2} />,
  ],
  'toucher-coule': [
    <TeamSplitPreview key={0} badge="flottes placées" badgeColor="emerald" />,
    <BattleshipGridPreview key={1} />,
    <TeamSplitPreview key={2} badge="qui perd boit" badgeColor="suit-red" />,
  ],
  purple: [
    <CardBetPreview key={0} colors={['#c23b34', '#24201A']} />,
    <CardBetPreview key={1} colors={['#9b3fd9', '#9b3fd9']} />,
    <CardBetPreview key={2} colors={['#24201A', '#24201A']} />,
  ],
  '1220': [
    <DicePreview key={0} faces={[5, 6]} />,
    <DicePreview key={1} faces={[6, 6]} />,
    <DicePreview key={2} faces={[4, 6]} />,
  ],
}
