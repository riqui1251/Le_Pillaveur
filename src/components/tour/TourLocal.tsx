"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/navigation'
import {
  LOCAL_STEPS,
  chapterProgress,
  hasLaterScreen,
  resolveBackward,
  resolveForward,
  screenOfPath,
  type TourEnv,
} from '@/lib/tour/steps'
import { TourBubble, TourSpot, findAnchor, useAnchorBox, useViewport, type Dock } from './TourUi'

/**
 * Premier temps du tuto : le jeu « sur un téléphone », guidé sur les VRAIS
 * écrans. Le joueur ajoute ses vrais prénoms, choisit son vrai jeu et lance
 * sa vraie partie ; le tuto entoure d'or l'élément du moment et suit ce que
 * le joueur fait (une carte ajoutée, une page ouverte, une partie lancée).
 *
 * Rien n'est simulé ici : « Suivant » sur un bouton (`nextClicks`) touche le
 * vrai bouton à la place du joueur.
 */

const TICK_MS = 200
/** Délai laissé à une page pour monter ses éléments avant de déclarer une étape facultative absente. */
const MOUNT_GRACE_MS = 400
const MOUNT_TIMEOUT_MS = 6000
/** Au-delà, une étape dont l'élément manque s'affiche bulle seule plutôt que de laisser l'écran muet. */
const STUCK_MS = 2500
const OFF_PATH_MS = 2000
const NAV_GUARD_MS = 3000

const stepIndex = (id: string) => LOCAL_STEPS.findIndex((step) => step.id === id)

function countCards(): number {
  return document.querySelectorAll('[data-tour="player-card"]').length
}

function drawerOpen(): boolean {
  return findAnchor('nav-burger')?.getAttribute('aria-expanded') === 'true'
}

function closeDrawer(): void {
  if (drawerOpen()) document.querySelector<HTMLElement>('[data-tour="nav-close"]')?.click()
}

/** L'écran de jeu a monté son pré-lobby ou sa table : ses éléments facultatifs sont là, ou ne viendront pas. */
function gameScreenReady(): boolean {
  return (
    findAnchor('prelobby-start') !== null || findAnchor('prelobby-rules') !== null || findAnchor('game-action') !== null
  )
}

function isPinned(el: HTMLElement): boolean {
  for (let node: HTMLElement | null = el; node && node !== document.body; node = node.parentElement) {
    const position = getComputedStyle(node).position
    if (position === 'fixed' || position === 'sticky') return true
  }
  return false
}

/**
 * Ce qui défile sous l'élément. `<body>` compris : sur téléphone, les règles
 * `.is-mobile-device` de globals.css en font le conteneur de défilement (la
 * fenêtre, elle, ne bouge plus).
 */
function scrollParent(el: HTMLElement): HTMLElement | Window {
  for (let node = el.parentElement; node && node !== document.documentElement; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight + 1) return node
  }
  return window
}

/** De combien ce conteneur peut encore défiler, vers le haut (négatif) et vers le bas. */
function scrollRange(scroller: HTMLElement | Window): { min: number; max: number } {
  if (scroller instanceof Window) {
    const root = document.documentElement
    return { min: -window.scrollY, max: Math.max(0, root.scrollHeight - window.innerHeight - window.scrollY) }
  }
  return { min: -scroller.scrollTop, max: Math.max(0, scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop) }
}

export function TourLocal({
  onFinished,
  onSkip,
  onLeft,
  hidden,
}: {
  /** Dernière étape passée : place à la pause « et en ligne ? ». */
  onFinished: () => void
  onSkip: () => void
  /** Le joueur a quitté le parcours (autre page du site). */
  onLeft: () => void
  /** Une carte centrée (confirmation) recouvre le tuto : la bulle se tait, le moteur continue. */
  hidden: boolean
}) {
  const t = useTranslations('tour')
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const viewport = useViewport()

  const [index, setIndex] = useState<number | null>(null)
  const [nudge, setNudge] = useState<string | null>(null)
  const [stuck, setStuck] = useState(false)
  const [dock, setDock] = useState<Dock>('bottom')
  const [bubbleHeight, setBubbleHeight] = useState(230)

  const indexRef = useRef<number | null>(null)
  const memo = useRef({ missingSince: 0, seen: false, baseCards: 0, navUntil: 0, navFrom: '', offSince: 0, placedFor: -1 })
  const callbacks = useRef({ onFinished, onLeft })
  callbacks.current = { onFinished, onLeft }

  const env = useCallback(
    (): TourEnv => ({ screen: screenOfPath(pathname), locale, has: (anchor) => findAnchor(anchor) !== null }),
    [pathname, locale]
  )

  const enter = useCallback((next: number) => {
    indexRef.current = next
    memo.current.missingSince = 0
    memo.current.seen = false
    memo.current.baseCards = countCards()
    memo.current.placedFor = -1
    setIndex(next)
    setNudge(null)
    setStuck(false)
    if (LOCAL_STEPS[next].id === 'menuRules' && !drawerOpen()) findAnchor('nav-burger')?.click()
  }, [])

  const finish = useCallback(() => {
    closeDrawer()
    callbacks.current.onFinished()
  }, [])

  // Le moteur : il regarde la page à intervalle court et à chaque changement
  // de route, plutôt que de s'abonner à chaque écran — aucun composant du
  // site n'a besoin de savoir qu'un tuto existe.
  useEffect(() => {
    const run = () => {
      const now = Date.now()
      const state = memo.current
      const here = env()

      if (here.screen === null) {
        if (!state.offSince) state.offSince = now
        else if (now - state.offSince > OFF_PATH_MS) callbacks.current.onLeft()
        return
      }
      state.offSince = 0
      // Retour demandé vers l'écran précédent : on attend que la route ait changé.
      if (now < state.navUntil && pathname === state.navFrom) return
      state.navUntil = 0

      let from = indexRef.current ?? 0
      // Le joueur vient de faire ce que l'étape attendait : on avance d'un cran.
      let advanced = false
      const current = indexRef.current === null ? null : LOCAL_STEPS[indexRef.current]
      if (current && current.screen === here.screen) {
        const present = here.has(current.anchor)
        if (present) {
          // Les cartes déjà enregistrées se montent avec la page : on ne les
          // compte qu'une fois l'écran là, sinon elles passeraient pour des
          // prénoms que le joueur vient d'ajouter.
          if (!state.seen) state.baseCards = countCards()
          state.seen = true
          state.missingSince = 0
        } else if (!state.missingSince) {
          state.missingSince = now
        }
        advanced =
          (current.id === 'addRow' && state.seen && countCards() > state.baseCards) ||
          (current.id === 'launch' && state.seen && !present) ||
          (current.id === 'menu' && drawerOpen())
        if (advanced) from += 1
      }

      const missingFor = state.missingSince ? now - state.missingSince : 0
      const pageReady = here.screen !== 'game' || gameScreenReady()
      const skipOptional = advanced || (pageReady && missingFor > MOUNT_GRACE_MS) || missingFor > MOUNT_TIMEOUT_MS

      let resolved = resolveForward(from, here, skipOptional)
      if (resolved === null) {
        if (!hasLaterScreen(from, here)) {
          finish()
          return
        }
        // Écran antérieur à l'étape en cours (retour arrière du navigateur) :
        // on reprend au début de cet écran.
        resolved = resolveForward(0, here, true)
        if (resolved === null) return
      }
      if (resolved !== indexRef.current) enter(resolved)
      else if (missingFor > STUCK_MS) setStuck(true)
    }

    run()
    const timer = window.setInterval(run, TICK_MS)
    return () => window.clearInterval(timer)
  }, [env, enter, finish, pathname])

  const step = index === null ? null : LOCAL_STEPS[index]
  const box = useAnchorBox(step ? step.anchor : null)
  const present = box !== null

  // À l'arrivée sur une étape : amener l'élément dans la place libre et
  // choisir le bord où la bulle s'amarre. Un élément fixe (barre du bas, barre
  // du site) ne défile pas : la bulle prend simplement le bord opposé.
  useEffect(() => {
    if (index === null || !step || !present || memo.current.placedFor === index) return
    const el = findAnchor(step.anchor)
    if (!el) return
    memo.current.placedFor = index
    const r = el.getBoundingClientRect()
    if (isPinned(el)) {
      setDock(r.top + r.height / 2 > viewport.height / 2 ? 'top' : 'bottom')
      return
    }
    // Bulle en bas de préférence ; en haut si la page ne défile pas assez pour
    // dégager l'élément (bas d'une page courte, comme un pré-lobby).
    const scroller = scrollParent(el)
    const range = scrollRange(scroller)
    const clear = bubbleHeight + 12 + 22
    const zones: { dock: Dock; top: number; bottom: number }[] = [
      { dock: 'bottom', top: 72, bottom: viewport.height - clear },
      { dock: 'top', top: clear, bottom: viewport.height - 12 },
    ]
    let choice = { dock: 'bottom' as Dock, delta: Math.min(Math.max(r.top - 72, range.min), range.max) }
    for (const zone of zones) {
      const room = zone.bottom - zone.top - r.height
      const wanted = [r.top - (zone.top + Math.max(0, room) / 2), r.top - zone.top, r.bottom - zone.bottom]
      const delta = wanted
        .map((d) => Math.min(Math.max(d, range.min), range.max))
        .find((d) => r.top - d >= zone.top - 2 && r.bottom - d <= zone.bottom + 2)
      if (delta !== undefined) {
        choice = { dock: zone.dock, delta }
        break
      }
    }
    setDock(choice.dock)
    if (Math.abs(choice.delta) < 1) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    scroller.scrollBy({ top: choice.delta, behavior: reduce ? 'auto' : 'smooth' })
  }, [index, step, present, viewport.height, bubbleHeight])

  const steps = useMemo(() => LOCAL_STEPS.filter((s) => !s.frOnly || locale === 'fr'), [locale])

  const goNext = useCallback(() => {
    const current = indexRef.current
    if (current === null) return
    const next = resolveForward(current + 1, env(), true)
    if (next === null) finish()
    else enter(next)
  }, [env, enter, finish])

  const handleNext = useCallback(() => {
    const current = indexRef.current
    if (current === null) return
    const s = LOCAL_STEPS[current]
    const blocked = () => setNudge(s.nudge ? t(`nudge.${s.nudge}`) : null)
    if (s.id === 'addRow') return countCards() === 0 ? blocked() : goNext()
    if (s.id === 'pickGame') return blocked()
    if (!s.nextClicks) return goNext()
    const el = findAnchor(s.anchor)
    const target = el?.matches('button, a') ? el : el?.querySelector<HTMLElement>('button, a')
    if (!target) return goNext()
    if (target.matches(':disabled, [aria-disabled="true"]')) return blocked()
    target.click()
  }, [goNext, t])

  const here = env()
  const previous = index === null ? null : resolveBackward(index, here)
  const canLeaveGame = here.screen === 'game' && findAnchor('prelobby-start') !== null
  const canBack = previous !== null || here.screen === 'hub' || canLeaveGame

  const handleBack = useCallback(() => {
    const current = indexRef.current
    if (current === null) return
    const now = env()
    const back = resolveBackward(current, now)
    if (back !== null) {
      if (LOCAL_STEPS[current].id === 'menuRules') closeDrawer()
      enter(back)
      return
    }
    const target = now.screen === 'hub' ? { path: '/joueurs', step: 'cards' } : { path: '/jeux', step: 'pickGame' }
    memo.current.navUntil = Date.now() + NAV_GUARD_MS
    memo.current.navFrom = pathname
    enter(stepIndex(target.step))
    router.push(target.path)
  }, [env, enter, pathname, router])

  if (hidden || index === null || !step) return null
  const floating = step.floating === true || stuck
  if (!present && !floating) return null

  const progress = chapterProgress(steps, Math.max(0, steps.indexOf(step)))
  const hint = !step.interactive ? null : step.nextClicks ? t('tapHint') : t('doHint')

  return (
    <>
      <TourSpot box={box} interactive={step.interactive} dock={dock} bubbleHeight={bubbleHeight} viewport={viewport} />
      <TourBubble
        progress={progress}
        title={t(`local.${step.id}.title`)}
        body={t(`local.${step.id}.body`)}
        nudge={nudge}
        hint={hint}
        onNext={handleNext}
        onBack={handleBack}
        backDisabled={!canBack}
        onSkip={onSkip}
        box={box}
        dock={dock}
        viewport={viewport}
        onHeight={setBubbleHeight}
      />
    </>
  )
}
