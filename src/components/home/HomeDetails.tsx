"use client"

import { forwardRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { BarChart3, Check, Globe, Lock, Minus, Plus, Smartphone } from 'lucide-react'
import { useAccountSheets } from '@/components/account/AccountSheets'
// SoireeCta est rendue À CÔTÉ des sections, jamais dedans : `soiree-deal`
// garde son transform en fin d'animation (remplissage « both »), ce qui ferait
// de la section le repère de la barre fixe — elle flotterait au milieu de la page.
import { SoireeCta } from '@/components/soiree/soiree-ui'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { Link, useRouter } from '@/i18n/navigation'
import { enterLocalPlay } from '@/lib/local-play-client'
import { cn } from '@/lib/utils'
import { Chip, CHIP_COLORS } from './Chip'
import { SOIREE_PLAYERS, type LibreWhere } from './home-choice'

const STEPS = ['bande', 'programme', 'addition'] as const

const stepperButton =
  'grid h-14 w-14 place-items-center rounded-full border border-gold/50 bg-felt-deep/50 text-amber-200 transition hover:bg-gold/10 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold'

function DetailHeader({ id, eyebrow, title, lead }: { id: string; eyebrow: string; title: string; lead: string }) {
  return (
    <div className="space-y-1 text-center">
      <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-gold">{eyebrow}</p>
      <h2 id={id} className="text-balance font-display text-[22px] font-bold leading-tight text-cream">
        {title}
      </h2>
      <p className="text-pretty text-[15.5px] text-cream/75">{lead}</p>
    </div>
  )
}

export const SoireeDetail = forwardRef<HTMLElement, { count: number; onCount: (count: number) => void }>(
  function SoireeDetail({ count, onCount }, ref) {
    const t = useTranslations('soiree.home')
    const router = useRouter()

    return (
      <>
        <section ref={ref} aria-labelledby="home-detail-title" className="soiree-deal flex scroll-mt-20 flex-col gap-3.5">
          <DetailHeader id="home-detail-title" eyebrow={t('eyebrow')} title={t('title')} lead={t('lead')} />
          <div className="flex items-center justify-center gap-6" role="group" aria-label={t('countLabel')}>
            <button
              type="button"
              onClick={() => onCount(Math.max(SOIREE_PLAYERS.min, count - 1))}
              disabled={count <= SOIREE_PLAYERS.min}
              aria-label={t('less')}
              className={stepperButton}
            >
              <Minus aria-hidden className="h-6 w-6" />
            </button>
            <output aria-live="polite" className="min-w-[7rem] text-center">
              <span key={count} className="soiree-pop block font-display text-7xl font-bold leading-none tabular-nums text-cream">
                {count}
              </span>
              <span className="text-sm font-semibold text-cream/70">{t('players', { count })}</span>
            </output>
            <button
              type="button"
              onClick={() => onCount(Math.min(SOIREE_PLAYERS.max, count + 1))}
              disabled={count >= SOIREE_PLAYERS.max}
              aria-label={t('more')}
              className={stepperButton}
            >
              <Plus aria-hidden className="h-6 w-6" />
            </button>
          </div>
          <div className="flex min-h-[28px] flex-wrap justify-center gap-1">
            {Array.from({ length: count }, (_, i) => (
              <span key={i} className="soiree-pop">
                <Chip color={CHIP_COLORS[i % CHIP_COLORS.length]} />
              </span>
            ))}
          </div>
          <ol className="grid grid-cols-3 gap-2" aria-label={t('stepsLabel')}>
            {STEPS.map((step, i) => (
              <li key={step} className="rounded-2xl border border-gold/20 bg-black/10 px-[11px] py-2.5">
                <span className="font-display font-extrabold text-gold">{i + 1}</span>
                <span className="block font-display text-[15.5px] font-bold text-cream">{t(`steps.${step}.title`)}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-cream/75">{t(`steps.${step}.text`)}</span>
              </li>
            ))}
          </ol>
        </section>
        <SoireeCta>
          <Button variant="primary" size="gameLg" className="w-full" onClick={() => router.push(`/soiree?joueurs=${count}`)}>
            {t('start')}
          </Button>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm font-bold">
            <Link
              href="/soiree/stats"
              className="inline-flex min-h-[44px] items-center gap-1.5 text-amber-200 underline underline-offset-4 hover:text-amber-100"
            >
              <BarChart3 aria-hidden className="h-4 w-4" />
              {t('stats')}
            </Link>
          </div>
        </SoireeCta>
      </>
    )
  }
)

function WhereButton({
  pressed,
  icon: Icon,
  label,
  detail,
  onPress,
}: {
  pressed: boolean
  icon: typeof Smartphone
  label: string
  detail: string
  onPress: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPress}
      className={cn(
        'flex min-h-[44px] flex-col items-center gap-0.5 rounded-[14px] px-2 py-2.5 text-center transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-felt-deep',
        pressed
          ? 'bg-amber-400 text-[#24201A] shadow-[0_0_18px_rgba(217,164,65,0.35)]'
          : 'text-cream/75 hover:bg-white/[0.06] hover:text-cream'
      )}
    >
      <span className="flex items-center gap-1.5 text-[15px] font-bold">
        <Icon aria-hidden className="h-4 w-4 shrink-0" />
        {label}
      </span>
      <span className="text-[12.5px] opacity-90">{detail}</span>
    </button>
  )
}

function Note({ tone, icon: Icon, children }: { tone: 'plain' | 'ok' | 'gold'; icon: typeof Smartphone; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        'flex items-start gap-2.5 rounded-[14px] border px-[13px] py-[11px] text-sm leading-snug',
        tone === 'plain' && 'border-white/10 bg-black/[0.16] text-cream/75',
        tone === 'ok' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
        tone === 'gold' && 'border-gold/[0.35] bg-gold/10 text-amber-200'
      )}
    >
      <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

/**
 * « Sur ce téléphone » / « En ligne » : le choix ne part qu'au bouton, comme la
 * bascule du hub (PlayModeToggle) — compte : mode enregistré ; visiteur : cookie
 * « jouer sans compte », ou la feuille de connexion pour jouer en ligne.
 */
export const LibreDetail = forwardRef<
  HTMLElement,
  { where: LibreWhere; onWhere: (where: LibreWhere) => void; localCount: number; onlineCount: number }
>(function LibreDetail({ where, onWhere, localCount, onlineCount }, ref) {
  const t = useTranslations('soiree.home')
  const tPlay = useTranslations('hub.playMode')
  const router = useRouter()
  const { user, setPlayMode } = useAuth()
  const { openAuth } = useAccountSheets()
  const [busy, setBusy] = useState(false)
  const online = where === 'online'

  const go = async () => {
    if (online && !user) {
      openAuth({ reason: 'online', redirectTo: '/jeux' })
      return
    }
    setBusy(true)
    try {
      if (user) {
        if (user.playMode !== where) await setPlayMode(where)
      } else {
        await enterLocalPlay()
      }
    } catch {
      // Le hub se charge quand même : le mode se reprend depuis sa bascule.
    }
    router.push('/jeux')
  }

  const label = !online
    ? t('libre.cta.local', { count: localCount })
    : user
      ? t('libre.cta.online', { count: onlineCount })
      : t('libre.cta.visitor')

  return (
    <>
      <section ref={ref} aria-labelledby="home-detail-title" className="soiree-deal flex scroll-mt-20 flex-col gap-3.5">
        <DetailHeader id="home-detail-title" eyebrow={t('modes.libre.title')} title={t('libre.title')} lead={t('libre.lead')} />
        <div role="group" aria-label={t('libre.whereLabel')} className="grid grid-cols-2 gap-1.5 rounded-[18px] border border-white/10 bg-black/[0.28] p-1.5">
          <WhereButton
            pressed={!online}
            icon={Smartphone}
            label={t('libre.local')}
            detail={t('libre.localCount', { count: localCount })}
            onPress={() => onWhere('local')}
          />
          <WhereButton
            pressed={online}
            icon={Globe}
            label={tPlay('online')}
            detail={t('libre.onlineCount', { count: onlineCount })}
            onPress={() => onWhere('online')}
          />
        </div>
        {!online ? (
          <Note tone="plain" icon={Smartphone}>
            {t('libre.note.local')}
          </Note>
        ) : user ? (
          <Note tone="ok" icon={Check}>
            {t.rich('libre.note.online', {
              name: user.onlineDisplayName ?? user.displayName,
              b: (chunks) => <b className="font-bold">{chunks}</b>,
            })}
          </Note>
        ) : (
          <Note tone="gold" icon={Lock}>
            {t('libre.note.visitor')}
          </Note>
        )}
      </section>
      <SoireeCta>
        <Button variant="primary" size="gameLg" className="w-full gap-2" disabled={busy} onClick={() => void go()}>
          {online ? <Globe aria-hidden className="h-5 w-5" /> : <Smartphone aria-hidden className="h-5 w-5" />}
          {label}
        </Button>
      </SoireeCta>
    </>
  )
})
