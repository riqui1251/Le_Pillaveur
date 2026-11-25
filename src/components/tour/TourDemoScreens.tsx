"use client"

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import {
  ArrowLeft,
  Beer,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Crown,
  Flag,
  Gamepad2,
  Globe,
  GraduationCap,
  Headphones,
  Home,
  Hourglass,
  Leaf,
  Lightbulb,
  Lock,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  Mic,
  Pencil,
  PhoneCall,
  PhoneOff,
  Play,
  Plus,
  Search,
  Send,
  Share2,
  Smartphone,
  Speaker,
  Trophy,
  Tv,
  User,
  UserPlus,
  UserRound,
  Users,
  Volume2,
  X,
} from 'lucide-react'
import { BrandMark } from '@/components/brand/BrandLogo'
import { GameIconById } from '@/components/hub/GameIconById'
import { DifficultyBadge } from '@/components/game/DifficultyBadge'
import { DrinkLevelBadge } from '@/components/game/DrinkLevelBadge'
import { isGameListed } from '@/lib/game-catalog'
import { useGameCatalog, useGameDifficulty, useGameDrinkLevel } from '@/hooks/useGameCatalog'
import { PlayingCard } from '@/components/ui/PlayingCard'
import { useLocalizedGames, type LocalizedGameMeta } from '@/lib/games-i18n'
import { cn } from '@/lib/utils'

/**
 * Écrans d'EXEMPLE de la démonstration du jeu en ligne (second temps du tuto).
 *
 * Ce ne sont pas les vrais écrans : aucune table n'est ouverte, aucune
 * invitation ne part, aucun micro ne s'allume. Ils en reprennent l'allure
 * (mêmes classes, mêmes icônes) et surtout les LIBELLÉS, lus dans les mêmes
 * clés de traduction que le lobby, le chat, les amis et le vocal : un bouton
 * renommé là-bas l'est aussi ici. Ce qui change de forme dans un vrai écran
 * se reporte ici à la main.
 */

export type DemoState = {
  route: 'hub' | 'page' | 'lobby' | 'briefing' | 'game'
  online: boolean
  drawer: boolean
  sheet: 'party' | 'voice' | null
  panel: 'friends' | 'chat' | null
  choosing: boolean
  inviteOpen: boolean
  invited: boolean
  friendIn: boolean
  bots: number
  friendCode: boolean
  friendSent: boolean
  friendOk: boolean
  voice: boolean
  howTo: boolean
  draft: boolean
  sent: boolean
}

export const DEMO_GAME = 'espion'
const TABLE_CODE = 'K7PQ'
const FRIEND_CODE = 'LP-7K2M9Q'
const AVATAR = { me: '👑', friend: '🦄', bot: '🎩' }
const FEATURED = ['quiz', 'loup-garou', 'crobard', 'sans-filtre']
const HIDDEN_ROLES = ['menteur', 'imposteur', 'loup-garou', 'espion', 'president', 'chiffre-piege']

function playersRange(game: LocalizedGameMeta): string | null {
  const { minPlayers: min, maxPlayers: max } = game
  if (!min) return null
  if (!max || max >= 20) return `${min}+`
  return max === min ? `${min}` : `${min}-${max}`
}

function Avatar({ glyph, className }: { glyph: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#D8CCAE] bg-cream text-sm',
        className
      )}
    >
      {glyph}
    </span>
  )
}

function Dot({ on = true }: { on?: boolean }) {
  return <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', on ? 'bg-emerald-400' : 'bg-cream/30')} />
}

function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('block font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold', className)}>
      {children}
    </span>
  )
}

function DemoCard({ game, online, anchor }: { game: LocalizedGameMeta; online: boolean; anchor?: string }) {
  const players = online ? playersRange(game) : null
  const difficultyOf = useGameDifficulty()
  const drinkLevelOf = useGameDrinkLevel()
  return (
    <div data-tour={anchor} className="h-full">
      <PlayingCard suit={game.suit} rank={game.rank} className="h-full">
        {game.botsFillable && (
          <span className="absolute right-1 top-0.5 flex h-[13px] items-center text-[#4A443A]">
            <Bot className="h-3.5 w-3.5" aria-hidden />
          </span>
        )}
        <div className="flex h-full min-h-[7.5rem] flex-col items-center px-1.5 pb-6 pt-4 text-center">
          <GameIconById id={game.id} surface="card" className="h-9 w-9" />
          <p className="mt-1 line-clamp-2 font-display text-[13px] font-bold leading-tight text-[#24201A]">{game.title}</p>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-[1.3] text-[#4A443A]">{game.description}</p>
          <span className="mt-auto flex items-center justify-center gap-1.5 pt-0.5">
            {players && (
              <span className="inline-flex items-center gap-0.5 text-[11px] font-bold leading-[14px] text-[#4A443A]">
                <Users className="h-3 w-3 shrink-0" aria-hidden />
                {players}
              </span>
            )}
            <DifficultyBadge level={difficultyOf(game.id)} tone="card" variant={players ? 'bars' : 'label'} />
          </span>
          <DrinkLevelBadge level={drinkLevelOf(game.id)} tone="card" variant="icons" className="mt-0.5" />
        </div>
      </PlayingCard>
    </div>
  )
}

/** Barre du site, avec la pastille « Démonstration » : le joueur sait qu'il ne touche à rien de vrai. */
export function DemoNavbar({ state }: { state: DemoState }) {
  const t = useTranslations('tour')
  const tNav = useTranslations('nav')
  const tCatalog = useTranslations('games.catalog')
  const hub = state.route === 'hub'
  return (
    <header className="relative z-[2] flex h-14 shrink-0 items-center gap-2.5 border-b border-gold/[0.15] bg-felt-deep px-3">
      <span
        data-tour="d-burger"
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
          state.drawer ? 'border-amber-400/40 bg-amber-500/20 text-amber-200' : 'border-white/10 bg-white/[0.04] text-amber-300'
        )}
      >
        {state.drawer ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gold/40 bg-felt-deep p-1">
          <BrandMark />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight text-white">
            {hub ? tNav('pages.jeux.title') : tCatalog(`${DEMO_GAME}.title`)}
          </p>
          <p className="truncate text-[10px] text-white/45">
            {hub ? tNav('pages.jeux.subtitle') : tNav('pages.game.online')}
          </p>
        </div>
      </div>
      <span className="shrink-0 rounded-full border border-gold/50 bg-gold/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-gold">
        {t('demoBadge')}
      </span>
    </header>
  )
}

function HubView({ state, me }: { state: DemoState; me: string }) {
  const t = useTranslations('hub')
  const tCommon = useTranslations('common')
  const games = useLocalizedGames()
  const { hiddenIds } = useGameCatalog()
  // Même visibilité que le vrai hub : un jeu caché par l'équipe n'apparaît pas non plus dans la démonstration.
  const byId = (ids: string[]) =>
    ids
      .map((id) => games.find((g) => g.id === id))
      .filter((g): g is LocalizedGameMeta => Boolean(g) && isGameListed(g as LocalizedGameMeta, hiddenIds))
  const visible = games.filter((g) => isGameListed(g, hiddenIds))
  const local = visible.filter((g) => !g.onlineOnly)
  const roles = byId(HIDDEN_ROLES)
  // Si l'équipe cache le jeu de démonstration, l'étape « choisir un jeu » garde
  // une cible : la première carte listée de la section (les écrans suivants
  // montrent toujours `DEMO_GAME`, dont les textes du tuto parlent).
  const anchorId = roles.some((g) => g.id === DEMO_GAME) ? DEMO_GAME : roles[0]?.id
  const segments = state.online
    ? [
        { Icon: Globe, label: t('partyBar.mode.online') },
        { Icon: Beer, label: t('ambianceMode.alcool') },
        { Icon: UserRound, label: me },
      ]
    : [
        { Icon: Smartphone, label: t('partyBar.mode.local') },
        { Icon: Beer, label: t('ambianceMode.alcool') },
        { Icon: Users, label: t('partyBar.players', { count: 3 }) },
      ]
  const family = (title: ReactNode) => (
    <p className="mb-1.5 flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">
      <span className="shrink-0">{title}</span>
      <span aria-hidden className="h-px flex-1 bg-gold/20" />
    </p>
  )

  return (
    <div className="px-4 pt-3">
      <div className="flex h-14 items-stretch divide-x divide-gold/20 overflow-hidden rounded-2xl border border-gold/30 bg-felt-deep/90">
        {segments.map(({ Icon, label }, k) => (
          <span
            key={label}
            data-tour={k === 0 ? 'd-seg-mode' : undefined}
            className="flex min-w-0 flex-1 items-center justify-center gap-1.5 px-2 text-[13px] font-semibold text-cream"
          >
            <Icon className="h-4 w-4 shrink-0 text-gold" aria-hidden />
            <span className="truncate">{label}</span>
          </span>
        ))}
      </div>
      <div className="-mx-4 my-3 flex items-center gap-3 border-b border-gold/20 bg-felt-deep px-4 pb-2 pt-1.5">
        <div className="flex h-11 flex-1 items-center gap-2.5 rounded-md border border-gold/20 bg-white/[0.05] px-3 text-base text-cream/60">
          <Search className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">{t('jeux.searchPlaceholder')}</span>
        </div>
        <span className="shrink-0 text-xs text-cream/70">
          {tCommon('gameCount', { count: state.online ? visible.filter((g) => g.onlineReady).length : visible.length })}
        </span>
      </div>

      {state.online ? (
        <div className="space-y-5">
          <section>
            {family(<>★ {t('jeux.featured')}</>)}
            <div className="grid grid-cols-3 gap-2">
              {byId(FEATURED).map((g) => (
                <DemoCard key={g.id} game={g} online />
              ))}
            </div>
          </section>
          <section>
            {family(<>♠ {t('jeux.families.spade')}</>)}
            <div className="grid grid-cols-3 gap-2">
              {roles.map((g) => (
                <DemoCard key={g.id} game={g} online anchor={g.id === anchorId ? 'd-game' : undefined} />
              ))}
            </div>
          </section>
        </div>
      ) : (
        <section>
          <p className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-cream">
            <Smartphone className="h-4 w-4 shrink-0 text-gold" aria-hidden />
            <span className="shrink-0">{t('jeux.localSection.title', { count: local.length })}</span>
            <span aria-hidden className="h-px flex-1 bg-gold/20" />
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {local.slice(0, 6).map((g) => (
              <DemoCard key={g.id} game={g} online={false} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function PageView() {
  const t = useTranslations('onlineLobby')
  const tCatalog = useTranslations('games.catalog')
  return (
    <div className="px-4 pt-6">
      <div className="mb-5 flex items-center justify-between">
        <span className="flex min-h-[44px] items-center gap-2 rounded-xl border border-gold/20 bg-felt-deep/70 px-3 py-2 text-sm font-medium text-cream/80">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t('back')}
        </span>
        <span className="flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-xs font-semibold text-amber-200">
          <Globe className="h-3 w-3" aria-hidden /> {t('onlineBadge')}
        </span>
      </div>
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[#D8CCAE] bg-cream px-3 py-2.5 text-[#24201A] shadow-[0_10px_24px_-12px_rgba(0,0,0,0.6)]">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#24201A]/[0.15] bg-[#24201A]/5">
          <GameIconById id={DEMO_GAME} surface="card" className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-bold leading-tight">{tCatalog(`${DEMO_GAME}.title`)}</p>
          <p className="text-xs text-[#6B6455]">{t('playersRange.bounded', { min: 3, max: 16 })}</p>
        </div>
      </div>
      <Label>{t('joinByCode.label')}</Label>
      <div className="mt-2 flex gap-2">
        <span className="flex h-11 min-w-0 flex-1 items-center rounded-md border border-gold/20 bg-black/20 px-3 font-bold tracking-[0.2em] text-cream/50">
          {t('joinByCode.placeholder')}
        </span>
        <span className="flex h-11 shrink-0 items-center rounded-2xl border border-gold/[0.35] bg-felt-deep/60 px-4 text-sm font-semibold text-cream">
          {t('joinByCode.submit')}
        </span>
      </div>
    </div>
  )
}

function seatPosition(index: number, count: number) {
  const angle = ((-90 + (360 / count) * index) * Math.PI) / 180
  return { left: `${50 + 41 * Math.cos(angle)}%`, top: `${50 + 39 * Math.sin(angle)}%` }
}

/** Faux QR : un motif fixe, purement décoratif — il ne mène nulle part. */
function FakeQr() {
  const cells: ReactNode[] = []
  let seed = 7
  const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let y = 0; y < 21; y++) {
    for (let x = 0; x < 21; x++) {
      const corner = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13)
      if (!corner && next() > 0.52) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />)
    }
  }
  const eye = (x: number, y: number) => (
    <g key={`eye-${x}-${y}`}>
      <rect x={x} y={y} width="7" height="7" />
      <rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" />
      <rect x={x + 2} y={y + 2} width="3" height="3" />
    </g>
  )
  return (
    <span aria-hidden className="block h-[108px] w-[108px] rounded-lg bg-white p-[7px]">
      <svg viewBox="0 0 21 21" fill="#24201A" shapeRendering="crispEdges" className="h-full w-full">
        {cells}
        {eye(0, 0)}
        {eye(14, 0)}
        {eye(0, 14)}
      </svg>
    </span>
  )
}

function VoiceButton({ state, anchor }: { state: DemoState; anchor?: string }) {
  return (
    <span
      data-tour={anchor}
      className={cn(
        'relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border',
        state.voice ? 'border-emerald-400/60 bg-emerald-700/90 text-cream' : 'border-gold/30 bg-felt-deep/70 text-gold'
      )}
    >
      <Mic className="h-5 w-5" aria-hidden />
      {state.voice && (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full border border-felt-deep bg-emerald-400 px-1 text-[11px] font-bold tabular-nums text-felt-deep">
          2
        </span>
      )}
    </span>
  )
}

function LobbyView({ state }: { state: DemoState }) {
  const t = useTranslations('onlineLobby')
  const tTv = useTranslations('tv')
  const tTour = useTranslations('tour')
  const tCatalog = useTranslations('games.catalog')
  const friend = tTour('sample.friend')
  const members = [
    { name: t('seat.you'), glyph: AVATAR.me, self: true },
    ...(state.friendIn ? [{ name: friend, glyph: AVATAR.friend, self: false }] : []),
  ]
  const total = members.length + state.bots
  const missing = Math.max(0, 3 - total)

  return (
    <div className="px-4 pt-6">
      <div className="mb-5 flex items-center justify-between gap-2">
        <span className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl border border-gold/20 bg-felt-deep/70 px-3 py-2 text-sm font-medium text-cream/80">
          <LogOut className="h-4 w-4" aria-hidden />
          {t('quit')}
        </span>
        <span className="flex min-h-[44px] min-w-0 max-w-[13rem] flex-1 items-center gap-2 rounded-xl border border-gold/25 bg-felt-deep/70 px-2.5">
          <GameIconById id={DEMO_GAME} surface="feltGold" className="h-5 w-5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-bold text-cream">{tCatalog(`${DEMO_GAME}.title`)}</span>
            <span className="block truncate text-xs leading-tight text-gold/80">{t('gameSwitch.cta')}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-cream/60" aria-hidden />
        </span>
        <VoiceButton state={state} anchor="d-voice-btn" />
      </div>

      <div className="relative mx-auto mb-3 h-64 w-full max-w-sm">
        <div
          className="absolute inset-x-3 inset-y-5 rounded-[50%] border-[3px] border-gold/40 shadow-[inset_0_10px_30px_rgba(0,0,0,0.45),0_10px_24px_-10px_rgba(0,0,0,0.6)]"
          style={{
            background:
              'radial-gradient(ellipse at 50% 38%, rgb(255 255 255 / 0.08) 0%, transparent 62%), radial-gradient(ellipse at 50% 38%, rgb(var(--felt-rgb)) 0%, rgb(var(--felt-deep-rgb)) 100%)',
          }}
        >
          <div aria-hidden className="absolute inset-2 rounded-[50%] border border-gold/20" />
        </div>
        {members.map((m, k) => (
          <div
            key={m.name}
            className="absolute flex w-[4.5rem] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
            style={seatPosition(k, total)}
          >
            <span className="relative flex shrink-0 items-center justify-center rounded-full border-[3px] border-emerald-400">
              <Avatar glyph={m.glyph} className="h-9 w-9 text-base" />
              <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-felt-deep bg-emerald-400 text-felt-deep">
                <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
              </span>
              {m.self && (
                <>
                  <span className="absolute -bottom-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-felt-deep bg-gold text-felt-deep">
                    <Pencil className="h-2.5 w-2.5" aria-hidden />
                  </span>
                  <Crown className="absolute -left-2 -top-2 h-4 w-4 text-amber-300" aria-hidden />
                </>
              )}
            </span>
            <span className="max-w-full truncate text-sm font-semibold leading-tight text-cream">{m.name}</span>
          </div>
        ))}
        {Array.from({ length: state.bots }, (_, b) => (
          <span
            key={`bot-${b}`}
            className="absolute flex w-[4.5rem] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
            style={seatPosition(members.length + b, total)}
          >
            <span className="flex h-[42px] w-[42px] items-center justify-center rounded-full border-2 border-dashed border-cream/30 bg-felt-deep/70 text-cream/70">
              <Bot className="h-5 w-5" aria-hidden />
            </span>
            <span className="max-w-full truncate text-xs leading-tight text-cream/60">{t('seat.bot')}</span>
          </span>
        ))}
        <span
          data-tour="d-code"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#D8CCAE] bg-cream px-4 py-1.5 text-center text-[#24201A] shadow-[0_8px_18px_-8px_rgba(0,0,0,0.6)]"
        >
          <span className="block text-xs font-bold uppercase tracking-[0.2em] text-[#6B6455]">{t('table.label')}</span>
          <span className="block font-display text-xl font-black tracking-[0.16em]">{TABLE_CODE}</span>
          <span className="flex items-center justify-center gap-1 text-xs font-semibold text-[#6B6455]">
            <Copy className="h-3 w-3" aria-hidden />
            {t('table.tapToCopy')}
          </span>
        </span>
      </div>

      {members.length > 1 ? (
        <p className="mb-2 flex items-center justify-center gap-1.5 text-center text-sm font-semibold text-emerald-300">
          <Check className="h-4 w-4 shrink-0" aria-hidden />
          {t('launch.status.allReady', { ready: 2, total: 2 })}
        </p>
      ) : (
        <p className="mb-2 flex items-center justify-center gap-1.5 text-center text-xs text-cream/70">
          <Pencil className="h-3 w-3 shrink-0 text-gold/80" aria-hidden />
          {t('seat.customizeHint')}
        </p>
      )}

      {missing > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-2xl border border-gold/25 bg-felt-deep/70 px-3.5 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-gold/10 text-gold">
            <Bot className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-cream">{t('botsCallout.title', { count: missing })}</p>
            <p className="text-xs leading-snug text-cream/70">{t('botsCallout.hint')}</p>
          </div>
          <span
            data-tour="d-bots"
            className="flex h-11 w-[5.75rem] shrink-0 items-center justify-center rounded-xl border border-gold/[0.35] bg-felt-deep/60 px-2 text-center text-xs font-semibold leading-tight text-cream"
          >
            {t('botsCallout.fill')}
          </span>
        </div>
      )}

      <div className="mb-3 flex gap-2">
        {[
          { Icon: Share2, label: t('share.cta') },
          { Icon: Tv, label: tTv('modeTv') },
          { Icon: Mail, label: t('invites.inviteFriend'), anchor: 'd-invite-btn' },
        ].map(({ Icon, label, anchor }) => (
          <span
            key={label}
            data-tour={anchor}
            className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-gold/30 bg-felt-deep/60 px-2 py-2.5 text-center text-xs font-bold leading-tight text-cream"
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-gold" aria-hidden />
            {label}
          </span>
        ))}
      </div>

      {state.inviteOpen && (
        <div className="mb-4 rounded-2xl border border-gold/20 bg-felt-deep/70 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gold/80">{t('invites.inviteFriend')}</p>
          <div className="mb-3 flex flex-col items-center gap-2 rounded-xl border border-gold/10 bg-felt-deep/60 px-3 py-4 text-center">
            <FakeQr />
            <p className="font-mono text-lg font-black tracking-[0.25em] text-cream">{TABLE_CODE}</p>
            <p className="max-w-[16rem] text-xs leading-relaxed text-cream/70">{t('invites.qrHint')}</p>
          </div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gold/80">{t('invites.friendsTitle')}</p>
          <div
            data-tour="d-invite-row"
            className="flex items-center justify-between gap-3 rounded-xl border border-gold/10 bg-felt-deep/60 px-3 py-2"
          >
            <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-cream">
              <Dot />
              <span className="truncate">{friend}</span>
            </span>
            <span
              className={cn(
                'flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold',
                state.invited ? 'border border-gold/20 text-cream/70' : 'bg-amber-500 text-[#24201A]'
              )}
            >
              <Mail className="h-3.5 w-3.5" aria-hidden />
              {state.invited ? t('invites.pending') : t('invites.inviteFriend')}
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between rounded-2xl border border-gold/20 bg-felt-deep/70 px-4 py-3.5 text-sm font-semibold text-cream">
        <span>{t('settings.title')}</span>
        <span className="flex items-center gap-1.5 font-normal text-cream/70">
          {state.bots > 0 && t('settings.botsSummary', { count: state.bots })}
          <ChevronDown className="h-4 w-4" aria-hidden />
        </span>
      </div>
    </div>
  )
}

function BriefingView({ me }: { me: string }) {
  const t = useTranslations('briefing')
  const tTour = useTranslations('tour')
  return (
    <div className="space-y-4 px-4 pt-6">
      <div
        data-tour="d-briefing"
        className="overflow-hidden rounded-3xl border border-[#D8CCAE] bg-cream text-[#24201A] shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-[#24201A]/10 bg-[#24201A]/[0.03] px-5 py-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#24201A]/20 bg-[#24201A]/5">
            <GameIconById id={DEMO_GAME} surface="card" className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-sm font-bold">{t('title')}</p>
            <p className="text-xs text-[#6B6455]">{t('subtitle')}</p>
          </div>
        </div>
        <div className="px-5 pb-3 pt-3.5">
          <div className="h-1.5 overflow-hidden rounded-full bg-[#24201A]/10">
            <span className="block h-full w-[72%] bg-gold-strong" />
          </div>
          <p className="mt-1 text-right text-xs text-[#6B6455]">{tTour('sample.autoStart')}</p>
          <div className="mt-2 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6B6455]">{t('stepCounter', { n: 1, total: 3 })}</p>
            <p className="mt-1 font-display text-lg font-bold">{tTour('sample.rulesTitle')}</p>
            <p className="mt-1.5 text-sm leading-snug text-[#4A443A]">{tTour('sample.rulesBody')}</p>
          </div>
          <div className="mt-3 flex items-center justify-center gap-1.5">
            {[0, 1, 2].map((k) => (
              <span key={k} className={cn('h-1.5 w-1.5 rounded-full', k === 0 ? 'bg-gold' : 'bg-[#24201A]/20')} />
            ))}
          </div>
          <span className="mt-4 flex h-12 items-center justify-center gap-2 rounded-2xl bg-amber-500 text-sm font-bold text-[#24201A]">
            {t('next')} <ChevronRight className="h-5 w-5" aria-hidden />
          </span>
          <p className="mt-2 py-2 text-center text-xs font-semibold text-[#6B6455]">{t('skip')}</p>
        </div>
      </div>
      <div className="rounded-3xl border border-gold/20 bg-felt-deep/70 p-4">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-cream/70">
          <Users className="h-4 w-4" aria-hidden />
          {t('waitingCount', { n: 1, total: 2 })}
        </p>
        <ul className="space-y-1.5">
          <li className="flex items-center gap-2">
            <Avatar glyph={AVATAR.me} className="h-6 w-6 text-xs" />
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-cream">
              {me} <span className="font-normal text-cream/60">{t('you')}</span>
            </span>
            <span className="shrink-0 text-xs text-cream/60">{t('reading')}</span>
          </li>
          <li className="flex items-center gap-2">
            <Avatar glyph={AVATAR.friend} className="h-6 w-6 text-xs" />
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-cream">{tTour('sample.friend')}</span>
            <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-emerald-300">
              <Check className="h-3.5 w-3.5" aria-hidden />
              {t('done')}
            </span>
          </li>
        </ul>
      </div>
    </div>
  )
}

function GameView({ state, me }: { state: DemoState; me: string }) {
  const t = useTranslations('tour')
  const friend = t('sample.friend')
  return (
    <div className="px-4 pt-3">
      <div className="rounded-2xl border border-gold/20 bg-felt-deep/80 p-3 text-cream">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-cream/80">{t('sample.round', { n: 1, spy: 0, crew: 0 })}</div>
            <div className="font-display text-base font-bold leading-snug text-gold">{t('sample.phase')}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <VoiceButton state={state} />
            <span
              data-tour="d-bulb"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gold/20 bg-felt-deep/60 text-gold"
            >
              <Lightbulb className="h-4 w-4" aria-hidden />
            </span>
          </div>
        </div>
        <div className="mt-2.5 flex items-center gap-2.5">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-cream/10">
            <span className="block h-full w-[78%] bg-gold" />
          </span>
          <span className="text-sm font-bold tabular-nums">6:14</span>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2.5 rounded-2xl border border-gold/30 bg-gold/10 px-3.5 py-2.5 text-sm font-semibold text-cream">
        <Avatar glyph={AVATAR.friend} />
        {t('sample.askTurn', { name: friend })}
      </div>
      <div className="mt-3.5 rounded-2xl border border-[#D8CCAE] bg-cream px-4 py-[18px] text-center text-[#24201A] shadow-[0_10px_24px_-12px_rgba(0,0,0,0.6)]">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6B6455]">{t('sample.locationLabel')}</p>
        <p className="mb-2 mt-1 font-display text-[28px] font-black leading-tight">{t('sample.place')}</p>
        <p className="text-sm font-bold">{t('sample.crewRole')}</p>
        <p className="mt-0.5 text-[13px] text-[#4A443A]">{t('sample.crewHint')}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {[
          { glyph: AVATAR.me, name: me },
          { glyph: AVATAR.friend, name: friend },
          { glyph: AVATAR.bot, name: `${t('sample.bot')} · ${t('sample.botTag')}` },
        ].map((p) => (
          <span
            key={p.name}
            className="flex items-center gap-1.5 rounded-full border border-gold/[0.15] bg-black/25 py-1 pl-1.5 pr-3 text-[13px] font-semibold text-cream"
          >
            <Avatar glyph={p.glyph} className="h-6 w-6 text-xs" />
            {p.name}
          </span>
        ))}
      </div>
    </div>
  )
}

export function DemoView({ state, me }: { state: DemoState; me: string }) {
  if (state.route === 'hub') return <HubView state={state} me={me} />
  if (state.route === 'page') return <PageView />
  if (state.route === 'lobby') return <LobbyView state={state} />
  if (state.route === 'briefing') return <BriefingView me={me} />
  return <GameView state={state} me={me} />
}

const BAR = 'relative z-[2] shrink-0 border-t border-gold/20 bg-felt-deep px-4 py-3'
const PRIMARY = 'flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 px-5 text-base font-bold text-[#24201A] shadow-[0_10px_22px_-12px_rgba(217,164,65,0.7)]'

/** Barre d'action du bas, propre à chaque écran d'exemple. */
export function DemoBar({ state }: { state: DemoState }) {
  const t = useTranslations('onlineLobby')
  const tTour = useTranslations('tour')

  if (state.route === 'page') {
    if (!state.choosing) {
      return (
        <div className={BAR}>
          <span data-tour="d-open-table" className={PRIMARY}>
            <Plus className="h-4 w-4" aria-hidden />
            {t('create.cta')}
          </span>
        </div>
      )
    }
    return (
      <div className={BAR}>
        <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-cream/70">{t('create.whoCanJoin')}</p>
        <div className="grid grid-cols-2 gap-2">
          <span className="flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2.5 text-center">
            <span className="flex items-center gap-1.5 text-sm font-bold text-emerald-200">
              <Globe className="h-4 w-4" aria-hidden /> {t('create.openLabel')}
            </span>
            <span className="text-xs leading-tight text-cream/70">{t('create.openDesc')}</span>
          </span>
          <span
            data-tour="d-private"
            className="flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-3 py-2.5 text-center"
          >
            <span className="flex items-center gap-1.5 text-sm font-bold text-amber-200">
              <Lock className="h-4 w-4" aria-hidden /> {t('create.privateLabel')}
            </span>
            <span className="text-xs leading-tight text-cream/70">{t('create.privateDesc')}</span>
          </span>
        </div>
        <p className="pt-2.5 text-center text-xs font-semibold text-cream/70">{t('create.cancel')}</p>
      </div>
    )
  }

  if (state.route === 'lobby') {
    const missing = Math.max(0, 3 - (1 + (state.friendIn ? 1 : 0) + state.bots))
    return (
      <div className={BAR}>
        {missing > 0 ? (
          <p className="flex min-h-[56px] items-center justify-center gap-2 rounded-2xl border border-gold/40 bg-felt-deep px-4 py-2 text-center text-sm font-semibold leading-snug text-cream">
            <Hourglass className="h-4 w-4 shrink-0 text-gold" aria-hidden />
            {t('launch.needPlayers', { count: missing })}
          </p>
        ) : (
          <span data-tour="d-launch" className={PRIMARY}>
            <Play className="h-4 w-4" aria-hidden />
            {t('launch.cta')}
          </span>
        )}
      </div>
    )
  }

  if (state.route === 'game') {
    return (
      <div className={BAR}>
        <span className="flex h-14 w-full items-center justify-center rounded-2xl bg-suit-red text-base font-bold text-cream">
          {tTour('sample.accuse')}
        </span>
      </div>
    )
  }

  return null
}

function Veil() {
  return <div aria-hidden className="absolute inset-0 z-10 bg-black/60" />
}

function Drawer({ state }: { state: DemoState }) {
  const t = useTranslations('nav')
  const links = [
    { key: 'joueurs', Icon: User },
    { key: 'jeux', Icon: Gamepad2 },
    { key: 'regles', Icon: BookOpen },
    { key: 'tuto', Icon: GraduationCap },
    { key: 'classement', Icon: Trophy },
    { key: 'compte', Icon: Home },
  ] as const
  return (
    <>
      <Veil />
      <aside className="absolute bottom-0 left-0 top-0 z-[11] flex w-72 max-w-[85%] flex-col border-r border-gold/[0.15] bg-felt-deep shadow-[4px_0_40px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-gold/40 bg-felt-deep p-1">
              <BrandMark />
            </div>
            <div>
              <p className="text-sm font-bold leading-none text-white">{t('brand')}</p>
              <p className="mt-0.5 text-[10px] text-white/40">{t('menuLabel')}</p>
            </div>
          </div>
          <X className="h-4 w-4 text-white/50" aria-hidden />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden p-3">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-white/30">{t('navigation')}</p>
          <ul className="space-y-1">
            {links.map(({ key, Icon }) => (
              <li key={key} className="flex items-center gap-3 rounded-xl px-3 py-2 text-white/70">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/50">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-none">{t(`links.${key}.label`)}</span>
                  <span className="mt-0.5 block truncate text-[11px] opacity-50">{t(`links.${key}.description`)}</span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/20" aria-hidden />
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-1 border-t border-white/[0.07] pt-3">
            <div data-tour="d-menu-friends" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-white/70">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-amber-300">
                <Users className="h-4 w-4" aria-hidden />
              </span>
              <span className="flex-1 text-sm font-medium">{t('manageFriends')}</span>
              {state.friendOk && (
                <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-black">
                  1
                </span>
              )}
            </div>
            <div data-tour="d-menu-chat" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-white/70">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-sky-300">
                <MessageCircle className="h-4 w-4" aria-hidden />
              </span>
              <span className="flex-1 text-sm font-medium">{t('chat')}</span>
              {state.route === 'game' && !state.sent && (
                <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                  2
                </span>
              )}
            </div>
            <p className="flex items-center gap-2 px-3 pt-1 text-[11px] font-semibold text-emerald-200/80">
              <Dot />
              {t('activePlayers', { count: 14 })}
            </p>
          </div>
        </div>
      </aside>
    </>
  )
}

function PartySheet() {
  const t = useTranslations('hub')
  const tCommon = useTranslations('common')
  const toggle = (items: { Icon: typeof Globe; label: string; on?: boolean; anchor?: string }[]) => (
    <div className="flex rounded-full border border-white/10 bg-black/30 p-1">
      {items.map(({ Icon, label, on, anchor }) => (
        <span
          key={label}
          data-tour={anchor}
          className={cn(
            'flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full px-2 text-sm font-semibold',
            on ? 'bg-amber-400 text-[#24201A] shadow-[0_0_18px_rgba(217,164,65,0.35)]' : 'text-white/[0.65]'
          )}
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
        </span>
      ))}
    </div>
  )
  return (
    <>
      <Veil />
      <div className="absolute inset-x-0 bottom-0 z-[11] rounded-t-3xl border-x border-t border-gold/30 bg-felt-deep px-4 pb-4 pt-2 text-cream shadow-[0_-18px_40px_-20px_rgba(0,0,0,0.9)]">
        <div aria-hidden className="mx-auto mb-1 h-1 w-10 rounded-full bg-cream/30" />
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-lg font-bold text-gold">{t('partyBar.title')}</p>
          <X className="m-3 h-5 w-5 text-cream/70" aria-hidden />
        </div>
        <section className="space-y-2 py-3.5">
          <Label>{t('playMode.label')}</Label>
          {toggle([
            { Icon: Smartphone, label: t('playMode.local'), on: true },
            { Icon: Globe, label: t('playMode.online'), anchor: 'd-mode-online' },
          ])}
          <p className="px-2 text-xs leading-snug text-cream/70">{t('partyBar.modeHint.local')}</p>
        </section>
        <section className="space-y-2 border-t border-gold/20 py-3.5">
          <Label>{t('ambianceMode.label')}</Label>
          {toggle([
            { Icon: Beer, label: t('ambianceMode.alcool'), on: true },
            { Icon: Leaf, label: t('ambianceMode.soft') },
          ])}
        </section>
        <span className="mt-1 flex h-12 w-full items-center justify-center rounded-2xl border border-gold/[0.35] bg-felt-deep/60 text-sm font-semibold text-cream">
          {tCommon('close')}
        </span>
      </div>
    </>
  )
}

function VoiceSheet({ state, me }: { state: DemoState; me: string }) {
  const t = useTranslations('voice')
  const tTour = useTranslations('tour')
  return (
    <>
      <Veil />
      <div className="absolute inset-x-0 bottom-0 z-[11] rounded-t-3xl border-x border-t border-gold/25 bg-felt-deep px-4 pb-4 text-cream shadow-[0_-18px_50px_-20px_rgba(0,0,0,0.9)]">
        <div className="flex items-center gap-3 pb-2 pt-3">
          <Headphones className="h-5 w-5 shrink-0 text-gold" aria-hidden />
          <p className="min-w-0 flex-1 truncate font-display text-lg font-bold text-cream">{t('title')}</p>
          <X className="m-3 h-5 w-5 text-cream/70" aria-hidden />
        </div>
        <div className="space-y-3">
          {state.voice ? (
            <>
              <div data-tour="d-voice-controls" className="grid grid-cols-3 gap-2">
                {[
                  { Icon: Mic, label: t('micMute') },
                  { Icon: Volume2, label: t('deafen') },
                  { Icon: PhoneOff, label: t('leave'), danger: true },
                ].map(({ Icon, label, danger }) => (
                  <span
                    key={label}
                    className={cn(
                      'flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-center text-xs font-semibold leading-tight',
                      danger ? 'border-red-400/40 bg-red-500/[0.15] text-red-100' : 'border-gold/25 bg-felt/40 text-cream'
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    {label}
                  </span>
                ))}
              </div>
              <div className="flex min-h-[44px] items-center justify-between gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100">
                <span className="flex items-center gap-2">
                  <Speaker className="h-4 w-4" aria-hidden />
                  {t('speaker')}
                </span>
                <span className="shrink-0 rounded-full bg-emerald-500/30 px-2 py-0.5 text-xs font-bold uppercase tracking-wide">
                  {t('on')}
                </span>
              </div>
            </>
          ) : (
            <span
              data-tour="d-voice-join"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 text-sm font-bold text-[#24201A]"
            >
              <PhoneCall className="h-4 w-4" aria-hidden />
              {t('join')}
            </span>
          )}
          <ul className="space-y-1.5">
            <li className="flex min-h-[48px] items-center gap-2 rounded-xl border border-gold/20 bg-felt/30 px-2.5 py-1">
              <Avatar glyph={AVATAR.me} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-cream">
                {me} <span className="font-normal text-cream/60">{t('you')}</span>
              </span>
              {state.voice ? <Dot /> : <span className="shrink-0 text-xs uppercase tracking-wide text-cream/60">{t('notInVoice')}</span>}
            </li>
            <li className="flex min-h-[48px] items-center gap-2 rounded-xl border border-gold/20 bg-felt/30 px-2.5 py-1">
              <Avatar glyph={AVATAR.friend} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-cream">{tTour('sample.friend')}</span>
              <Dot />
            </li>
          </ul>
          {!state.voice && <p className="text-xs text-cream/70">{t('joinHint')}</p>}
        </div>
      </div>
    </>
  )
}

function FriendsPanel({ state }: { state: DemoState }) {
  const t = useTranslations('account.friends')
  const tTour = useTranslations('tour')
  const friend = tTour('sample.friend')
  return (
    <>
      <Veil />
      <div className="absolute left-3 right-3 top-16 z-[11] overflow-hidden rounded-2xl border border-white/10 bg-[#0c0b12] text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-bold">
            <Users className="h-4 w-4 text-amber-300" aria-hidden />
            {t('title')}
          </p>
          <X className="h-4 w-4 text-white/50" aria-hidden />
        </div>
        <div className="space-y-3 p-3">
          <div data-tour="d-friend-add" className="flex flex-col gap-2">
            <span
              className={cn(
                'flex h-9 items-center rounded-md border border-amber-300/25 bg-black/20 px-3 font-mono text-base',
                state.friendCode ? 'text-white' : 'text-white/[0.35]'
              )}
            >
              {state.friendCode ? FRIEND_CODE : t('addPlaceholder')}
            </span>
            <span className="flex items-center justify-center gap-1.5 rounded-lg bg-amber-500/25 px-3 py-2 text-xs font-semibold text-amber-100">
              <UserPlus className="h-3.5 w-3.5" aria-hidden />
              {t('add')}
            </span>
          </div>
          {state.friendSent && !state.friendOk && <p className="text-xs text-emerald-300">{t('addSuccessSent')}</p>}
          {!state.friendOk && (
            <div className="border-t border-white/10 pt-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-amber-300/70">{t('incomingRequests')}</p>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <span className="truncate text-sm font-medium">{friend}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span data-tour="d-friend-accept" className="rounded-lg bg-emerald-500/20 px-2.5 py-1.5 text-xs font-medium text-emerald-300">
                    {t('accept')}
                  </span>
                  <span className="rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-xs font-medium text-white/60">{t('decline')}</span>
                </span>
              </div>
            </div>
          )}
          {state.friendSent && (
            <div className="border-t border-white/10 pt-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/40">{t('outgoingRequests')}</p>
              <p className="flex items-center justify-between px-1 text-sm text-white/50">
                {tTour('sample.friend2')}
                <X className="h-3.5 w-3.5" aria-hidden />
              </p>
            </div>
          )}
          <div className="border-t border-white/10 pt-3">
            {state.friendOk ? (
              <p className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-medium">
                <Dot />
                {friend}
                <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400/80">{t('online')}</span>
              </p>
            ) : (
              <p className="py-2 text-center text-sm text-white/40">{t('empty')}</p>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function ChatPanel({ state, me }: { state: DemoState; me: string }) {
  const t = useTranslations('chat')
  const tTour = useTranslations('tour')
  const friend = tTour('sample.friend')
  const message = (text: string, time: string) => (
    <div className="max-w-[80%] self-start rounded-2xl rounded-bl-sm bg-white/[0.07] px-3 py-2 text-cream">
      <p className="mb-0.5 flex items-center gap-1 text-xs font-semibold text-gold">
        <span aria-hidden>{AVATAR.friend}</span>
        {friend}
        <Flag className="ml-auto h-3.5 w-3.5 text-cream/60" aria-hidden />
      </p>
      <p className="break-words text-sm">{text}</p>
      <p className="mt-0.5 text-right text-[11px] tabular-nums text-cream/60">{time}</p>
    </div>
  )
  return (
    <>
      <Veil />
      <div className="absolute left-3 right-3 top-16 z-[11] overflow-hidden rounded-2xl border border-gold/20 bg-felt-deep text-cream shadow-2xl">
        <div className="flex items-center justify-between border-b border-gold/20 px-4 py-3">
          <p className="flex items-center gap-2 font-display text-base font-bold">
            <MessageCircle className="h-4 w-4 shrink-0 text-gold" aria-hidden />
            {t('title')}
          </p>
          <X className="h-4 w-4 text-cream/70" aria-hidden />
        </div>
        <div className="grid grid-cols-2 border-b border-gold/20">
          <span className="flex min-h-[44px] items-center justify-center gap-1.5 border-b-2 border-gold py-2.5 text-xs font-semibold text-gold">
            <Gamepad2 className="h-3.5 w-3.5" aria-hidden />
            {t('tabGame')}
          </span>
          <span
            data-tour="d-tab-friends"
            className="flex min-h-[44px] items-center justify-center gap-1.5 border-b-2 border-transparent py-2.5 text-xs font-semibold text-cream/70"
          >
            <Users className="h-3.5 w-3.5" aria-hidden />
            {t('tabFriends')}
          </span>
        </div>
        <div className="flex h-[172px] flex-col justify-end gap-2 overflow-hidden p-3">
          {message(tTour('sample.chat1', { bot: tTour('sample.bot') }), '21:42')}
          {message(tTour('sample.chat2', { name: me }), '21:43')}
          {state.sent && (
            <div className="max-w-[80%] self-end rounded-2xl rounded-br-sm bg-gold/[0.18] px-3 py-2 text-cream">
              <p className="break-words text-sm">{tTour('sample.chatMine')}</p>
              <p className="mt-0.5 text-right text-[11px] tabular-nums text-amber-100/70">21:43</p>
            </div>
          )}
        </div>
        <div data-tour="d-compose" className="flex items-center gap-2 border-t border-gold/20 p-2.5">
          <span
            className={cn(
              'flex min-h-[44px] min-w-0 flex-1 items-center rounded-xl border border-gold/20 bg-black/20 px-3 text-sm',
              state.draft ? 'text-cream' : 'text-cream/60'
            )}
          >
            <span className="truncate">{state.draft ? tTour('sample.chatMine') : t('placeholder')}</span>
          </span>
          <span
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-[#24201A]',
              !state.draft && 'opacity-40'
            )}
          >
            <Send className="h-4 w-4" aria-hidden />
          </span>
        </div>
      </div>
    </>
  )
}

function HowToModal() {
  const t = useTranslations('gameTutorial')
  const tTour = useTranslations('tour')
  return (
    <div className="absolute inset-0 z-10 flex items-start justify-center bg-black/70 px-4 pb-4 pt-[72px]">
      <div
        data-tour="d-howto"
        className="w-full max-w-sm rounded-2xl border border-[#D8CCAE] bg-cream p-5 text-[#24201A] shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <span className="rounded-full border border-[#24201A]/[0.12] bg-[#24201A]/5 px-2 py-0.5 font-display text-xs font-bold text-[#4A443A]">
            {t('stepCounter', { n: 1, total: 3 })}
          </span>
          <X className="h-4 w-4 text-[#6B6455]" aria-hidden />
        </div>
        <div className="mt-3 text-center">
          <p className="font-display text-lg font-bold">{tTour('sample.rulesTitle')}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-[#4A443A]">{tTour('sample.rulesBody')}</p>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="flex gap-1">
            {[0, 1, 2].map((k) => (
              <span key={k} className={cn('h-1.5 w-1.5 rounded-full', k === 0 ? 'bg-gold' : 'bg-[#24201A]/20')} />
            ))}
          </span>
          <span className="flex h-12 items-center gap-1 rounded-2xl bg-amber-500 px-4 text-sm font-bold text-[#24201A]">
            {t('next')}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </span>
        </div>
      </div>
    </div>
  )
}

/** Ce qui recouvre l'écran d'exemple : menu, feuilles du bas, panneaux, modale des règles. */
export function DemoOverlay({ state, me }: { state: DemoState; me: string }) {
  if (state.drawer) return <Drawer state={state} />
  if (state.sheet === 'party') return <PartySheet />
  if (state.sheet === 'voice') return <VoiceSheet state={state} me={me} />
  if (state.panel === 'friends') return <FriendsPanel state={state} />
  if (state.panel === 'chat') return <ChatPanel state={state} me={me} />
  if (state.howTo) return <HowToModal />
  return null
}
