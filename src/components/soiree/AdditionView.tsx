"use client"

import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { BarChart3, Copy, Image as ImageIcon, Share2 } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { useLocalizedGames } from '@/lib/games-i18n'
import { cn } from '@/lib/utils'
import { soireeSummary, type SoireeAward, type SoireeMoment } from '@/lib/soiree/summary'
import { readHistory } from '@/lib/soiree/storage'
import type { Soiree } from '@/lib/soiree/state'
import { playGameSound } from '@/lib/sound/game-sounds'
import { GameBadge, SoireeCta, StepHeader, gameGradient, useSoireePlayer, useSoireeUnits } from './soiree-ui'
import { ADDITION_FORMATS, drawAdditionImage, type AdditionFormat } from './share-image'
import { celebrate } from './confetti'
import { SoireeVote } from './SoireeVote'

const AWARD_CARD: Record<SoireeAward['kind'], { rank: string; suit: string; red: boolean }> = {
  pilier: { rank: 'K', suit: '♠', red: false },
  survivant: { rank: '2', suit: '♦', red: true },
  roi: { rank: 'Q', suit: '♥', red: true },
  champion: { rank: 'K', suit: '♥', red: true },
  lanterne: { rank: '2', suit: '♣', red: false },
  'gros-coup': { rank: 'J', suit: '♦', red: true },
  arrose: { rank: '10', suit: '♥', red: true },
}

/** La fin de la soirée : le ticket, le palmarès, de quoi le partager et la revanche. */
export function AdditionView({
  soiree,
  onKeepBande,
  onVote,
  onRevanche,
  onNew,
}: {
  soiree: Soiree
  onKeepBande: (name: string) => void
  onVote: (rating: number) => void
  onRevanche: () => void
  onNew: () => void
}) {
  const t = useTranslations('soiree.addition')
  const locale = useLocale()
  const units = useSoireeUnits()
  const playerOf = useSoireePlayer(soiree)
  const games = useLocalizedGames()
  const title = (id: string) => games.find((g) => g.id === id)?.title ?? id
  const name = (id: string | null | undefined) => (id ? soiree.playerNames[id] ?? '?' : '')
  const summary = useMemo(() => soireeSummary(soiree), [soiree])
  const metric = summary.metric
  const date = new Date(soiree.finishedAt ?? soiree.createdAt)
  const nightNumber = soiree.bandeId ? readHistory().filter((e) => e.bandeId === soiree.bandeId).length : 1
  const [bandeName, setBandeName] = useState(soiree.bandeName || t('keep.default', { name: name(soiree.playerIds[0]) }))
  const [image, setImage] = useState<{ url: string; blob: Blob } | null>(null)
  const [format, setFormat] = useState<AdditionFormat>('feed')
  const [status, setStatus] = useState<string | null>(null)

  // L'addition tombe : salve de confettis et fanfare, une fois par soirée affichée.
  useEffect(() => {
    celebrate()
    playGameSound('victory')
  }, [soiree.id])

  const awardText = (a: SoireeAward) => ({
    title: t(`awards.${a.kind}.title`),
    who: a.playerId ? name(a.playerId) : title(a.gameId ?? ''),
    why: t(`awards.${a.kind}.why`, { count: a.value, game: title(a.gameId ?? '') }),
  })
  const momentText = (m: SoireeMoment) => {
    switch (m.kind) {
      case 'round-drinks':
        return m.topValue === m.total && m.total >= 2
          ? t('moments.roundDrinksAll', { game: title(m.gameId), total: m.total, name: name(m.topPlayerId) })
          : t('moments.roundDrinks', { game: title(m.gameId), total: m.total, top: m.topValue, name: name(m.topPlayerId) })
      case 'round-win':
        return t('moments.roundWin', { game: title(m.gameId), name: name(m.playerId) })
      case 'streak':
        return t('moments.streak', { name: name(m.playerId), count: m.count })
      case 'sober':
        return t('moments.sober', { name: name(m.playerId) })
    }
  }
  const payerLine = summary.payerId ? t('receipt.payer', { name: name(summary.payerId).toLocaleUpperCase(locale) }) : t('receipt.tie')

  const recap = () =>
    [
      t('recap.title', { bande: soiree.bandeName || t('receipt.table'), number: nightNumber }),
      '',
      ...summary.standings.map((s) => `${name(s.playerId)} : ${units(metric, s[metric])}`),
      '',
      summary.payerId ? t('recap.payer', { name: name(summary.payerId) }) : t('receipt.tie'),
      ...summary.awards.slice(0, 4).map((a) => {
        const x = awardText(a)
        return `${x.title} : ${x.who}`
      }),
      '',
      t('recap.footer'),
    ].join('\n')

  const copyRecap = async () => {
    try {
      await navigator.clipboard.writeText(recap())
      setStatus(t('share.copied'))
    } catch {
      setStatus(t('share.copyFailed'))
    }
  }

  const pickFormat = (next: AdditionFormat) => {
    if (next === format) return
    setFormat(next)
    if (image) URL.revokeObjectURL(image.url)
    setImage(null)
    setStatus(null)
  }

  const makeImage = async () => {
    setStatus(t('share.making'))
    try {
      const made = await drawAdditionImage({
        brand: t('receipt.brand'),
        title: t('title'),
        subtitle: t('receipt.night', { bande: soiree.bandeName || t('receipt.table'), number: nightNumber }),
        date: date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }),
        rows: summary.standings.slice(0, 8).map((s) => ({ name: name(s.playerId), value: t(`receipt.short.${metric}`, { count: s[metric] }) })),
        payer: payerLine,
        awards: summary.awards.slice(0, 3).map((a) => `${awardText(a).title} : ${awardText(a).who}`),
        moment: summary.moments[0] ? momentText(summary.moments[0]) : null,
        footer: t('recap.footer'),
        soft: soiree.soft,
        format,
      })
      setImage(made)
      setStatus(t('share.ready'))
    } catch {
      setStatus(t('share.failed'))
    }
  }

  const shareImage = async () => {
    if (!image) return
    const fileName = format === 'story' ? 'addition-pillaveur-story.png' : 'addition-pillaveur.png'
    const file = new File([image.blob], fileName, { type: 'image/png' })
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: t('title') })
        return
      }
    } catch {
      // Partage annulé ou refusé : l'enregistrement reste possible.
    }
    const a = document.createElement('a')
    a.href = image.url
    a.download = fileName
    a.click()
  }

  return (
    <>
      <StepHeader eyebrow={t('eyebrow')} title={t('title')} />

      <div className="drop-shadow-[0_14px_26px_rgba(0,0,0,0.5)]">
        <div className="soiree-receipt soiree-print bg-[#F7F0DE] px-5 pb-7 pt-5 font-mono text-[15px] leading-relaxed text-[#2A251C]">
          <p className="text-center text-xl font-bold tracking-[0.08em]">{t('receipt.brand')}</p>
          <p className="text-center text-sm">{t('receipt.counter')}</p>
          <hr className="my-2.5 border-t-2 border-dashed border-[#2A251C]/40" />
          <p className="text-center">{t('receipt.night', { bande: soiree.bandeName || t('receipt.table'), number: nightNumber })}</p>
          <p className="text-center">{date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })} · {date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</p>
          <hr className="my-2.5 border-t-2 border-dashed border-[#2A251C]/40" />
          {summary.standings.map((s) => (
            <p key={s.playerId} className="flex gap-1.5">
              <span className="min-w-0 truncate">{name(s.playerId)}</span>
              <span aria-hidden className="flex-1 -translate-y-1.5 border-b-2 border-dotted border-[#2A251C]/40" />
              <span className="tabular-nums">{t(`receipt.short.${metric}`, { count: s[metric] })}</span>
            </p>
          ))}
          <hr className="my-2.5 border-t-2 border-dashed border-[#2A251C]/40" />
          <p className="flex gap-1.5 font-bold">
            <span>{t('receipt.total')}</span>
            <span aria-hidden className="flex-1 -translate-y-1.5 border-b-2 border-dotted border-[#2A251C]/40" />
            <span className="tabular-nums">{units(metric, metric === 'drinks' ? summary.totalDrinks : summary.totalWins)}</span>
          </p>
          <p className="flex gap-1.5">
            <span>{t('receipt.rounds')}</span>
            <span aria-hidden className="flex-1 -translate-y-1.5 border-b-2 border-dotted border-[#2A251C]/40" />
            <span className="tabular-nums">{summary.roundsPlayed}/{soiree.rounds.length}</span>
          </p>
          <p className="soiree-stamp mt-3 border-[3px] border-suit-red px-2 py-2 text-center font-bold text-suit-red">{payerLine}</p>
          <p className="mt-3 text-center text-sm">{t('receipt.thanks')}</p>
        </div>
      </div>

      <section className="rounded-2xl border border-gold/30 bg-felt-deep/60 p-4">
        <SoireeVote target={{ scope: 'soiree', soireeId: soiree.id }} soft={soiree.soft} value={soiree.vote} onVoted={onVote} />
      </section>

      {summary.games.length > 0 && (
        <section className="space-y-2" aria-label={t('gamesTitle')}>
          <h2 className="font-display text-2xl font-bold">{t('gamesTitle')}</h2>
          <ul className="space-y-1.5">
            {summary.games.map((g, i) => (
              <li key={g.index} className="soiree-deal relative flex items-center gap-3 overflow-hidden rounded-xl border border-gold/20 bg-felt-deep/50 px-3 py-2" style={{ animationDelay: `${i * 70}ms` }}>
                <span aria-hidden className="absolute inset-y-0 left-0 opacity-25" style={{ background: gameGradient(g.gameId, 90), width: `${Math.round((g.drinks / Math.max(1, summary.totalDrinks)) * 100)}%` }} />
                <GameBadge gameId={g.gameId} size="sm" className="relative" />
                <span className="relative min-w-0 flex-1">
                  <span className="block font-semibold">{title(g.gameId)}</span>
                  {metric === 'drinks' && g.topPlayerId && g.topDrinks > 0 && (
                    <span className="block text-xs text-cream/60">
                      {g.topDrinks === g.drinks && g.drinks >= 2
                        ? t('gameTopAll', { name: name(g.topPlayerId) })
                        : t('gameTop', { name: name(g.topPlayerId), count: g.topDrinks })}
                    </span>
                  )}
                </span>
                <span className="relative font-display text-lg font-bold tabular-nums">{units(metric, metric === 'drinks' ? g.drinks : g.wins)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {summary.awards.length > 0 && (
        <section className="space-y-2" aria-label={t('awardsTitle')}>
          <h2 className="font-display text-2xl font-bold">{t('awardsTitle')}</h2>
          <div className="grid grid-cols-2 gap-2.5">
            {summary.awards.map((a, i) => {
              const card = AWARD_CARD[a.kind]
              const x = awardText(a)
              return (
                <div
                  key={a.kind}
                  className="soiree-deal relative flex flex-col items-center gap-1.5 overflow-hidden rounded-xl border border-[#D8CCAE] bg-cream px-2.5 pb-3 pt-5 text-center text-[#24201A] shadow-[0_10px_24px_-12px_rgba(0,0,0,0.6)]"
                  style={{ animationDelay: `${300 + i * 90}ms` }}
                >
                  <span aria-hidden className="absolute inset-x-0 top-0 h-1.5" style={{ background: a.gameId && !a.playerId ? gameGradient(a.gameId, 90) : card.red ? 'linear-gradient(90deg, #B3382E, #E0796C)' : 'linear-gradient(90deg, #B8862F, #E7C97D)' }} />
                  <span aria-hidden className={cn('absolute left-1.5 top-1 font-display text-xs font-bold leading-none', card.red ? 'text-suit-red' : 'text-[#24201A]')}>
                    {card.rank}
                    <br />
                    {card.suit}
                  </span>
                  {a.playerId && <PlayerIcon player={playerOf(a.playerId)} size="md" />}
                  <span className="font-display text-base font-bold leading-tight">{x.title}</span>
                  <span className="font-bold">{x.who}</span>
                  <span className="text-xs leading-snug text-[#5E5444]">{x.why}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {summary.moments.length > 0 && (
        <section className="space-y-2" aria-label={t('momentsTitle')}>
          <h2 className="font-display text-2xl font-bold">{t('momentsTitle')}</h2>
          {summary.moments.map((m, i) => (
            <blockquote key={i} className="rounded-2xl border border-gold/20 bg-black/20 px-4 py-3 font-display text-lg italic leading-snug">
              « {momentText(m)} »
            </blockquote>
          ))}
        </section>
      )}

      <section className="space-y-3 rounded-2xl border border-gold/20 bg-felt-deep/50 p-4" aria-label={t('share.title')}>
        <h2 className="font-display text-2xl font-bold">{t('share.title')}</h2>
        <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-gold/20 bg-felt-deep/50 p-1.5" role="group" aria-label={t('share.format')}>
          {ADDITION_FORMATS.map((option) => {
            const active = format === option
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                onClick={() => pickFormat(option)}
                className={cn(
                  'rounded-xl px-2 py-2.5 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
                  active ? 'bg-cream text-[#24201A]' : 'text-cream hover:bg-gold/10'
                )}
              >
                <span className="block text-sm font-bold">{t(`share.formats.${option}.label`)}</span>
                <span className={cn('block text-xs', active ? 'text-[#5E5444]' : 'text-cream/60')}>{t(`share.formats.${option}.hint`)}</span>
              </button>
            )
          })}
        </div>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- image générée sur l'appareil (data/blob)
          <img
            src={image.url}
            alt={t('share.alt')}
            className={cn('rounded-xl', format === 'story' ? 'mx-auto max-h-[70vh] w-auto' : 'w-full')}
          />
        ) : (
          <Button variant="quiet" size="game" className="w-full" onClick={makeImage}>
            <ImageIcon aria-hidden className="mr-1.5 h-4 w-4" />
            {t('share.make')}
          </Button>
        )}
        {image && (
          <Button variant="primary" size="game" className="w-full" onClick={shareImage}>
            <Share2 aria-hidden className="mr-1.5 h-4 w-4" />
            {t('share.share')}
          </Button>
        )}
        <Button variant="quiet" size="game" className="w-full" onClick={copyRecap}>
          <Copy aria-hidden className="mr-1.5 h-4 w-4" />
          {t('share.copy')}
        </Button>
        {status && <p role="status" className="text-center text-sm text-cream/70">{status}</p>}
      </section>

      <section className="space-y-3 rounded-2xl border border-gold/20 bg-felt-deep/50 p-4" aria-label={t('keep.title')}>
        {soiree.bandeId ? (
          <>
            <h2 className="font-display text-2xl font-bold">{soiree.bandeName}</h2>
            <p className="text-sm text-cream/70">{t('keep.known', { name: soiree.bandeName, count: nightNumber })}</p>
          </>
        ) : (
          <>
            <h2 className="font-display text-2xl font-bold">{t('keep.title')}</h2>
            <p className="text-sm text-cream/70">{t('keep.lead')}</p>
            <label className="block text-sm font-semibold text-cream/70" htmlFor="soiree-bande-name">{t('keep.label')}</label>
            <input
              id="soiree-bande-name"
              value={bandeName}
              onChange={(e) => setBandeName(e.target.value)}
              maxLength={28}
              autoComplete="off"
              className="w-full rounded-xl border border-gold/30 bg-black/20 px-3 py-2.5 font-semibold text-cream focus:border-gold focus:outline-none"
            />
            <Button variant="primary" size="game" className="w-full" onClick={() => onKeepBande(bandeName.trim() || t('keep.default', { name: name(soiree.playerIds[0]) }))}>
              {t('keep.save')}
            </Button>
          </>
        )}
        <Link href="/soiree/stats" className="inline-flex items-center gap-1.5 text-sm font-bold text-amber-200 underline underline-offset-4 hover:text-amber-100">
          <BarChart3 aria-hidden className="h-4 w-4" />
          {t('stats')}
        </Link>
      </section>

      <SoireeCta>
        <Button variant="primary" size="gameLg" className="w-full" onClick={onRevanche}>
          {t('revanche')}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="quiet" size="game" onClick={onNew}>{t('new')}</Button>
          <Button variant="quiet" size="game" asChild>
            <Link href="/">{t('home')}</Link>
          </Button>
        </div>
      </SoireeCta>
    </>
  )
}
