"use client"

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import type { TelephoneClientView } from '@/lib/telephone-dessine/engine'
import { PartyCanvas } from '@/components/online/PartyCanvas'
import { TvBigCountdown } from './tv-shared'

/**
 * TÉLÉPHONE DESSINÉ sur grand écran : pendant le jeu, juste « X/Y ont
 * soumis » (rien de révélateur) ; au reveal, LA vitrine du lot — chaque
 * chaîne défile en grand pendant que tout le monde regarde et rigole.
 */
export function TvTelephoneDessine({ room, state }: { room: TvRoomDto; state: TelephoneClientView }) {
  const t = useTranslations('games.telephone-dessine.game')
  const [clock, setClock] = useState(() => Date.now())

  useEffect(() => {
    if (state.phase === 'finished') return
    const timer = setInterval(() => setClock(Date.now()), 400)
    return () => clearInterval(timer)
  }, [state.phase])

  const finished = state.phase === 'finished'
  const timeLeftMs = state.phaseEndsAt === null ? null : Math.max(0, state.phaseEndsAt - clock)
  const iconOf = (p: { id: string; isBot: boolean }) =>
    p.isBot ? '🤖' : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'

  if (finished) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
        <p className="text-5xl font-black text-white">🎉 {t('victory.title')}</p>
        <p className="text-2xl text-white/60">{t('victory.subtitle')}</p>
      </div>
    )
  }

  if (state.phase === 'countdown') {
    const secondsLeft = Math.max(1, Math.ceil((timeLeftMs ?? 0) / 1000))
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
        <p className="text-3xl font-black uppercase tracking-widest text-teal-300/80">{t('countdown.title')}</p>
        <TvBigCountdown seconds={secondsLeft} colorClass="text-teal-200" />
      </div>
    )
  }

  if (state.phase === 'reveal' && state.revealChain) {
    return (
      <div className="flex h-full w-full flex-col gap-4 overflow-y-auto p-6">
        <p className="text-center text-2xl font-black uppercase tracking-widest text-teal-300/80">
          {t('reveal.title', { current: state.revealIdx + 1, total: state.revealOrder.length })}
        </p>
        <p className="text-center text-3xl font-black text-white">
          {t('reveal.chainOf', { name: state.revealChain.ownerName })}
        </p>
        <div className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-3 gap-4 overflow-y-auto">
          {state.revealChain.links.map((link, i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/40">
                {t('reveal.step', { n: i + 1 })}
              </p>
              {link.type === 'text' ? (
                <p className="text-xl font-bold text-white">
                  {link.text.trim() ? link.text : <span className="italic text-white/30">{t('reveal.blank')}</span>}
                </p>
              ) : link.strokes.length > 0 ? (
                <PartyCanvas strokes={link.strokes} readOnly />
              ) : (
                <p className="italic text-white/30">{t('reveal.blank')}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
      <p className="text-3xl font-black text-white">
        {t('submittedCount', { count: state.submittedCount, total: state.totalToSubmit })}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {state.players.map((p) => (
          <span
            key={p.id}
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-lg font-bold text-white/70"
          >
            <span aria-hidden>{iconOf(p)}</span>
            {p.name}
          </span>
        ))}
      </div>
    </div>
  )
}
