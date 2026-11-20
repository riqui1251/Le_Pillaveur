"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import { useLocale, useTranslations, type AbstractIntlMessages } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/navigation'
import { useAuth } from '@/hooks/useAuth'
import { ClientMessages } from '@/components/i18n/ClientMessages'
import { enterLocalPlay } from '@/lib/local-play-client'
import { screenOfPath } from '@/lib/tour/steps'
import { markTourSeen, setTourRunning, type TourOutcome } from '@/lib/tour/storage'
import { TourLocal } from './TourLocal'
import { TourBubble, TourModal, TourSpot, TourStage, useAnchorBox, useViewport } from './TourUi'

/**
 * Le calque du tuto des nouveaux joueurs : téléchargé à la demande, il charge
 * d'abord ses textes (/api/tour/messages — le socle ne les porte pas), puis
 * enchaîne l'accueil, le jeu « sur un téléphone » guidé sur les vrais écrans,
 * la pause, la démonstration du jeu en ligne et la fin.
 */

// La démonstration (une dizaine d'écrans d'exemple) ne part qu'avec le joueur
// qui choisit de la voir.
const TourDemo = dynamic(() => import('./TourDemo').then((m) => m.TourDemo), { ssr: false })

type Phase = 'welcome' | 'local' | 'bridge' | 'demo' | 'end' | 'again'

export function TourLayer({ resume, onClose }: { resume: boolean; onClose: () => void }) {
  const locale = useLocale()
  const [messages, setMessages] = useState<AbstractIntlMessages | null>(null)
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    let cancelled = false
    fetch(`/api/tour/messages?locale=${encodeURIComponent(locale)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('tour_messages'))))
      .then((slice: AbstractIntlMessages) => {
        if (!cancelled) setMessages(slice)
      })
      // Pas de textes (hors ligne, panne) : pas de tuto, et rien n'est retenu —
      // il se reproposera.
      .catch(() => {
        if (!cancelled) close.current()
      })
    return () => {
      cancelled = true
    }
  }, [locale])

  if (!messages) return null
  return createPortal(
    <ClientMessages messages={messages}>
      <TourFlow resume={resume} onClose={onClose} />
    </ClientMessages>,
    document.body
  )
}

function TourFlow({ resume, onClose }: { resume: boolean; onClose: () => void }) {
  const t = useTranslations('tour')
  const pathname = usePathname()
  const router = useRouter()
  const { user, setPlayMode } = useAuth()

  const [phase, setPhase] = useState<Phase>(resume ? 'local' : 'welcome')
  const [confirmSkip, setConfirmSkip] = useState(false)
  const [demoSeen, setDemoSeen] = useState(false)

  const userId = user?.id
  const accountKnowsIt = user?.tourSeen === true
  const remember = useCallback(
    (outcome: TourOutcome) => {
      markTourSeen(outcome)
      setTourRunning(false)
      if (userId && !accountKnowsIt) {
        void fetch('/api/auth/tour-seen', { method: 'POST', credentials: 'include' }).catch(() => undefined)
      }
    },
    [userId, accountKnowsIt]
  )

  const startLocal = useCallback(async () => {
    // Le premier temps se joue sur un téléphone : un compte resté en mode
    // « en ligne » verrait un hub sans les jeux locaux que le tuto montre.
    if (user?.playMode === 'online') await setPlayMode('local')
    setTourRunning(true)
    if (screenOfPath(pathname) !== 'players') {
      // /joueurs est fermée au visiteur sans marque de jeu local : on la pose d'abord.
      if (!user) await enterLocalPlay().catch(() => undefined)
      router.push('/joueurs')
    }
    setPhase('local')
  }, [user, setPlayMode, pathname, router])

  const skipNow = useCallback(() => {
    setConfirmSkip(false)
    remember('skipped')
    setPhase('again')
  }, [remember])

  // Échap : passer le tuto (avec confirmation), sauf pendant une saisie.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const active = document.activeElement
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return
      if (phase === 'local' || phase === 'demo' || phase === 'bridge') setConfirmSkip((open) => !open)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase])

  return (
    <TourStage>
      {phase === 'welcome' && (
        <TourModal
          mark
          kicker={t('welcome.kicker')}
          title={t('welcome.title')}
          body={t('welcome.body')}
          note={t('welcome.foot')}
          actions={[
            { label: t('welcome.start'), onClick: () => void startLocal(), primary: true, withArrow: true },
            { label: t('skip'), onClick: skipNow },
          ]}
        />
      )}

      {phase === 'local' && (
        <TourLocal
          hidden={confirmSkip}
          onSkip={() => setConfirmSkip(true)}
          onFinished={() => {
            setTourRunning(false)
            setPhase('bridge')
          }}
          onLeft={() => {
            remember('skipped')
            onClose()
          }}
        />
      )}

      {phase === 'bridge' && !confirmSkip && (
        <TourModal
          kicker={t('bridge.kicker')}
          title={t('bridge.title')}
          body={t('bridge.body')}
          onSkip={() => setConfirmSkip(true)}
          actions={[
            { label: t('bridge.continue'), onClick: () => setPhase('demo'), primary: true, withArrow: true },
            {
              label: t('bridge.stop'),
              onClick: () => {
                remember('done')
                setPhase('end')
              },
            },
          ]}
        />
      )}

      {phase === 'demo' && (
        <TourDemo
          hidden={confirmSkip}
          onSkip={() => setConfirmSkip(true)}
          onBack={() => setPhase('bridge')}
          onDone={() => {
            setDemoSeen(true)
            remember('done')
            setPhase('end')
          }}
        />
      )}

      {phase === 'end' && (
        <TourModal
          kicker={t('end.kicker')}
          title={t('end.title')}
          items={[
            t('end.itemPlayers'),
            t('end.itemGame'),
            t('end.itemRules'),
            ...(demoSeen ? [t('end.itemOnline')] : []),
          ]}
          note={demoSeen ? undefined : t('end.onlineLater')}
          actions={[
            { label: t('end.play'), onClick: () => setPhase('again'), primary: true },
            { label: t('end.again'), onClick: () => setPhase('welcome') },
          ]}
        />
      )}

      {phase === 'again' && <TourReminder onDone={onClose} />}

      {confirmSkip && (
        <TourModal
          kicker={t('confirmSkip.kicker')}
          title={t('confirmSkip.title')}
          body={t('confirmSkip.body')}
          actions={[
            { label: t('confirmSkip.yes'), onClick: skipNow, primary: true },
            { label: t('confirmSkip.no'), onClick: () => setConfirmSkip(false) },
          ]}
        />
      )}
    </TourStage>
  )
}

/** Dernier geste du tuto, vu ou passé : montrer où il se range, sur le vrai bouton du menu. */
function TourReminder({ onDone }: { onDone: () => void }) {
  const t = useTranslations('tour')
  const viewport = useViewport()
  const box = useAnchorBox('nav-burger')
  const [bubbleHeight, setBubbleHeight] = useState(180)

  // Pas de menu sur cette page (écran TV) : rien à montrer.
  const absentSince = useRef(Date.now())
  useEffect(() => {
    if (box) return
    const timer = window.setTimeout(() => {
      if (Date.now() - absentSince.current >= 1500) onDone()
    }, 1500)
    return () => window.clearTimeout(timer)
  }, [box, onDone])

  if (!box) return null
  return (
    <>
      <TourSpot box={box} interactive={false} dock="bottom" bubbleHeight={bubbleHeight} viewport={viewport} />
      <TourBubble
        title={t('local.again.title')}
        body={t('local.again.body')}
        nextLabel={t('gotIt')}
        onNext={onDone}
        box={box}
        dock="bottom"
        viewport={viewport}
        onHeight={setBubbleHeight}
      />
    </>
  )
}
