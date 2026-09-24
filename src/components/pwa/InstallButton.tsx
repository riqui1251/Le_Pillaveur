"use client"

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Download, Share, Sparkles, SquarePlus } from 'lucide-react'
import { isCapacitorApp } from '@/lib/native-app'
import {
  heldInstallPrompt,
  holdInstallPrompt,
  installSurface,
  type BeforeInstallPromptEvent,
} from '@/lib/pwa-install'

/**
 * Carte « Ajouter à l'écran d'accueil » de la page /application.
 *
 * Elle ne s'affiche que quand elle a quelque chose de VRAI à proposer :
 * - Chrome, Edge, Samsung Internet… ont levé `beforeinstallprompt` → le
 *   bouton, qui rejoue l'invite native du navigateur ;
 * - Safari sur iOS → le court guide Partager → « Sur l'écran d'accueil »
 *   (Safari ne lève jamais l'événement) ;
 * - la coquille Capacitor → le mot qui dit qu'il n'y a rien à installer ;
 * - déjà en plein écran (installé) ou navigateur sans rien de tout ça →
 *   RIEN, plutôt qu'un bouton qui ne ferait rien.
 *
 * Rendu vide côté serveur et au premier rendu client : tout dépend du
 * navigateur, connu seulement après montage.
 */

type InstallState =
  /** Avant montage, ou navigateur sans proposition : rien à afficher. */
  | 'silent'
  | 'in-app'
  | 'prompt'
  | 'ios-safari'
  | 'accepted'

/*
 * L'événement part en général AVANT que la carte soit montée — sur la page
 * d'entrée, une fois par document, bien avant qu'on navigue ici. Le script
 * inline du layout de langue le retient sur `window` (INSTALL_PROMPT_CAPTURE,
 * src/lib/pwa-install.ts) ; la carte le retrouve là au montage, et écoute
 * elle-même les levées suivantes.
 */

export function InstallButton() {
  const t = useTranslations('mobileApp')
  const [state, setState] = useState<InstallState>('silent')
  const [prompting, setPrompting] = useState(false)

  useEffect(() => {
    if (isCapacitorApp()) {
      setState('in-app')
      return
    }
    const nav = window.navigator as Navigator & { standalone?: boolean }
    const surface = installSurface({
      userAgent: nav.userAgent,
      standalone: window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true,
      maxTouchPoints: nav.maxTouchPoints,
    })
    if (surface === 'installed') return
    if (surface === 'ios-safari') {
      setState('ios-safari')
      return
    }
    if (heldInstallPrompt(window)) setState('prompt')

    // Levé pendant que la carte est affichée : c'est son bouton qui propose,
    // pas le bandeau du navigateur.
    const onPrompt = (event: Event) => {
      event.preventDefault()
      holdInstallPrompt(window, event as BeforeInstallPromptEvent)
      setState('prompt')
    }
    // Installé depuis l'invite (la nôtre ou celle du navigateur) : l'icône est
    // sur l'écran d'accueil, on le dit — et l'événement retenu ne vaut plus.
    const onInstalled = () => {
      holdInstallPrompt(window, null)
      setState('accepted')
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = async () => {
    const event = heldInstallPrompt(window)
    if (!event || prompting) return
    setPrompting(true)
    try {
      await event.prompt()
      const { outcome } = await event.userChoice
      // Un événement ne se rejoue pas : refusé, le bouton s'efface jusqu'à ce
      // que le navigateur en lève un autre (il attend en général quelques jours).
      holdInstallPrompt(window, null)
      setState(outcome === 'accepted' ? 'accepted' : 'silent')
    } catch {
      holdInstallPrompt(window, null)
      setState('silent')
    } finally {
      setPrompting(false)
    }
  }

  if (state === 'silent') return null

  if (state === 'in-app') {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-100">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" aria-hidden />
        <p>{t('alreadyInApp')}</p>
      </div>
    )
  }

  if (state === 'accepted') {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-100">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" aria-hidden />
        <p>{t('install.done')}</p>
      </div>
    )
  }

  return (
    <section className="rounded-3xl border border-gold/30 bg-gold/[0.06] p-5 sm:p-6">
      <h2 className="font-display text-lg font-bold text-cream">{t('install.title')}</h2>
      <p className="mt-1 text-sm leading-relaxed text-white/65">{t('install.hint')}</p>

      {state === 'prompt' ? (
        <button
          type="button"
          onClick={() => void install()}
          disabled={prompting}
          className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 px-6 text-base font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:from-amber-400 hover:to-orange-500 disabled:opacity-60"
        >
          <Download className="h-5 w-5" aria-hidden />
          {t('install.button')}
        </button>
      ) : (
        // Safari iOS : pas d'invite, deux gestes à faire soi-même.
        <ol className="mt-4 space-y-2 text-sm text-white/80">
          <li className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-cream">
              <Share className="h-4 w-4" aria-hidden />
            </span>
            <span>
              <span className="mr-2 font-display font-bold text-gold">1.</span>
              {t('install.iosStep1')}
            </span>
          </li>
          <li className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-cream">
              <SquarePlus className="h-4 w-4" aria-hidden />
            </span>
            <span>
              <span className="mr-2 font-display font-bold text-gold">2.</span>
              {t('install.iosStep2')}
            </span>
          </li>
        </ol>
      )}
    </section>
  )
}
