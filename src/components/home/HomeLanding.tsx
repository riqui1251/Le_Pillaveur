"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Info } from 'lucide-react'
import { AmbianceModeToggle } from '@/components/auth/AmbianceModeToggle'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import { useHiddenGamesPurge } from '@/components/soiree/useHiddenGamesPurge'
import { useSoiree } from '@/components/soiree/useSoiree'
import { useGameCatalog } from '@/hooks/useGameCatalog'
import { useAuth } from '@/hooks/useAuth'
import { Link } from '@/i18n/navigation'
import { GAMES } from '@/lib/games'
import { readBandes, readHistory, type SoireeBande } from '@/lib/soiree/storage'
import type { SoireeHistoryEntry } from '@/lib/soiree/summary'
import { getSafeStorage } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { Chip, CHIP_COLORS } from './Chip'
import { LibreDetail, SoireeDetail } from './HomeDetails'
import {
  HOME_PICK_KEY,
  SOIREE_PLAYERS,
  homeGameCounts,
  initialHomeChoice,
  parseHomePick,
  type HomePick,
  type LibreWhere,
} from './home-choice'
import { ModeCards } from './ModeCards'

const FLOATING_SUITS = [
  { glyph: '♠', left: '4%', top: '6%', size: '2.6rem', delay: '0s', red: false },
  { glyph: '♥', left: '86%', top: '2%', size: '2.2rem', delay: '-2s', red: true },
  { glyph: '♦', left: '90%', top: '52%', size: '1.8rem', delay: '-4s', red: true },
  { glyph: '♣', left: '2%', top: '58%', size: '2rem', delay: '-5.5s', red: false },
] as const

type LastBande = { bande: SoireeBande; night: number; last: SoireeHistoryEntry | null }

function readStoredPick(): HomePick | null {
  try {
    return parseHomePick(getSafeStorage()?.getItem(HOME_PICK_KEY) ?? null)
  } catch {
    return null
  }
}

function storePick(pick: HomePick | null) {
  try {
    const storage = getSafeStorage()
    if (pick) storage?.setItem(HOME_PICK_KEY, pick)
    else storage?.removeItem(HOME_PICK_KEY)
  } catch {
    // Stockage refusé (navigation privée) : le choix vaut pour cette visite.
  }
}

/** La reprise d'une soirée en cours, sinon la revanche de la dernière bande. */
function SoireeBanners() {
  const t = useTranslations('soiree.home')
  const { soiree, ready, save } = useSoiree()
  useHiddenGamesPurge(soiree, save)
  const [lastBande, setLastBande] = useState<LastBande | null>(null)

  useEffect(() => {
    const bande = readBandes()[0]
    if (!bande) return
    const history = readHistory().filter((entry) => entry.bandeId === bande.id)
    setLastBande({ bande, night: history.length + 1, last: history[0] ?? null })
  }, [])

  const inProgress = ready && soiree !== null && soiree.phase !== 'finished'
  const lastPayer = lastBande?.last?.payerId
    ? lastBande.last.players.find((p) => p.id === lastBande.last?.payerId)?.name ?? null
    : null

  if (inProgress && soiree) {
    return (
      <Link href="/soiree" className="flex items-center gap-3 rounded-2xl border border-gold/40 bg-gold/10 p-4 transition hover:bg-gold/20">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-gold">{t('resume.eyebrow')}</p>
          <p className="mt-1 font-display text-lg font-bold text-cream">
            {t('resume.title', { round: Math.min(soiree.current + 1, soiree.rounds.length), total: soiree.rounds.length })}
          </p>
          <p className="truncate text-sm text-cream/70">{soiree.playerIds.map((id) => soiree.playerNames[id]).join(', ')}</p>
        </div>
        <span className="shrink-0 font-bold text-amber-200">{t('resume.cta')}</span>
      </Link>
    )
  }

  if (!lastBande) return null
  return (
    <Link
      href={{ pathname: '/soiree', query: { bande: lastBande.bande.id } }}
      className="flex items-center gap-3 rounded-2xl border border-gold/25 bg-felt-deep/50 p-4 transition hover:bg-gold/10"
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-gold">{t('revenge.eyebrow')}</p>
        <p className="mt-1 font-display text-lg font-bold text-cream">
          {t('revenge.title', { name: lastBande.bande.name, number: lastBande.night })}
        </p>
        <p className="text-sm text-cream/70">
          {lastBande.last ? (lastPayer ? t('revenge.lastPayer', { name: lastPayer }) : t('revenge.lastTie')) : t('revenge.ready')}
        </p>
      </div>
      <div className="flex shrink-0 -space-x-2">
        {lastBande.bande.playerIds.slice(0, 4).map((id, i) => (
          <Chip key={id} color={CHIP_COLORS[i % CHIP_COLORS.length]} />
        ))}
      </div>
    </Link>
  )
}

/** L'accueil : deux cartes, Mode Soirée ou Jeu libre, et le détail de celle qu'on a choisie. */
export function HomeLanding() {
  const t = useTranslations('soiree.home')
  const { user, loading } = useAuth()
  const { hiddenIds } = useGameCatalog()
  const { mode: ambiance } = useAmbianceMode()
  const counts = useMemo(() => homeGameCounts(GAMES, hiddenIds, ambiance === 'soft'), [hiddenIds, ambiance])

  const [pick, setPick] = useState<HomePick | null>(null)
  const [where, setWhere] = useState<LibreWhere>('local')
  const [count, setCount] = useState<number>(SOIREE_PLAYERS.initial)
  const [choiceReady, setChoiceReady] = useState(false)
  const [announce, setAnnounce] = useState('')
  const [revealOnPick, setRevealOnPick] = useState(false)
  const detailRef = useRef<HTMLElement>(null)
  const playMode = user?.playMode ?? null

  // Le stockage et la session ne se lisent qu'après montage : le premier rendu
  // reste celui du serveur, sans écart d'hydratation.
  useEffect(() => {
    if (loading || choiceReady) return
    const choice = initialHomeChoice({ playMode, stored: readStoredPick() })
    setPick(choice.pick)
    setWhere(choice.where)
    setChoiceReady(true)
  }, [loading, choiceReady, playMode])

  useEffect(() => {
    if (playMode) setWhere(playMode)
  }, [playMode])

  useEffect(() => {
    if (!revealOnPick || !pick) return
    setRevealOnPick(false)
    const detail = detailRef.current
    if (!detail || detail.getBoundingClientRect().top <= window.innerHeight - 260) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    detail.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  }, [revealOnPick, pick])

  const choose = (id: HomePick) => {
    const next = pick === id ? null : id
    setPick(next)
    storePick(next)
    setAnnounce(t(next === 'soiree' ? 'modes.picked.soiree' : next === 'libre' ? 'modes.picked.libre' : 'modes.picked.none'))
    setRevealOnPick(next !== null)
  }

  return (
    <>
      <section className="relative flex flex-col items-center gap-1.5 pt-1 text-center">
        {/* Enseignes qui flottent sur le feutre : décor seulement, figé si l'appareil réduit les animations. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 select-none overflow-visible">
          {FLOATING_SUITS.map((s) => (
            <span
              key={s.left}
              className={cn('soiree-float absolute font-display', s.red ? 'text-suit-red/40' : 'text-amber-300/20')}
              style={{ left: s.left, top: s.top, fontSize: s.size, animationDelay: s.delay }}
            >
              {s.glyph}
            </span>
          ))}
        </div>
        <h1 className="relative w-full max-w-[360px]">
          <BrandLogo />
        </h1>
        <p className="relative font-display text-[clamp(21px,5.6vw,26px)] font-bold italic text-cream">{t('ask')}</p>
      </section>

      <SoireeBanners />

      <ModeCards pick={pick} onPick={choose} gameCount={counts.all} />
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <AmbianceModeToggle />

      {pick === 'soiree' ? (
        <SoireeDetail key="soiree" ref={detailRef} count={count} onCount={setCount} />
      ) : pick === 'libre' ? (
        <LibreDetail key="libre" ref={detailRef} where={where} onWhere={setWhere} localCount={counts.local} onlineCount={counts.online} />
      ) : choiceReady ? (
        <p className="flex items-center justify-center gap-2 text-center text-sm text-cream/75">
          <Info aria-hidden className="h-[18px] w-[18px] shrink-0" />
          <span>{t.rich('modes.hint', { b: (chunks) => <b className="font-bold text-amber-300">{chunks}</b> })}</span>
        </p>
      ) : null}

      <footer className="flex flex-col gap-1.5 text-center text-[12.5px] text-cream/70">
        <p>{t('footer', { count: counts.all })}</p>
        <p>{t('health')}</p>
      </footer>
    </>
  )
}
