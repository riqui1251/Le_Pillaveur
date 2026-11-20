"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/hooks/useAuth'
import { DEMO_STEPS, chapterProgress, type DemoStepId } from '@/lib/tour/steps'
import { DemoBar, DemoNavbar, DemoOverlay, DemoView, type DemoState } from './TourDemoScreens'
import { TourBubble, TourSpot, findAnchor, useAnchorBox, useViewport, type Box, type Dock } from './TourUi'

/**
 * Second temps du tuto : la DÉMONSTRATION du jeu en ligne — ouvrir une table,
 * les amis, le vocal, les règles en ligne et le chat — sur des écrans
 * d'exemple (TourDemoScreens). Rien de réel : ni table, ni invitation, ni
 * micro. Elle se pose par-dessus la page du joueur, qui la retrouve intacte
 * en sortant (sa partie locale, lancée au premier temps, l'attend derrière).
 *
 * Chaque étape dit l'élément qu'elle entoure et ce qu'elle change à l'écran ;
 * l'état d'une étape est le cumul de toutes celles qui la précèdent, si bien
 * que « Retour » revient exactement à l'écran d'avant.
 */

type DemoStep = { target: string; dock?: Dock; enter: (state: DemoState) => void }

const INITIAL: DemoState = {
  route: 'hub',
  online: false,
  drawer: false,
  sheet: null,
  panel: null,
  choosing: false,
  inviteOpen: false,
  invited: false,
  friendIn: false,
  bots: 0,
  friendCode: false,
  friendSent: false,
  friendOk: false,
  voice: false,
  howTo: false,
  draft: false,
  sent: false,
}

const SCRIPT: Record<DemoStepId, DemoStep> = {
  mode: { target: 'd-seg-mode', enter: () => {} },
  goOnline: { target: 'd-mode-online', dock: 'top', enter: (s) => { s.sheet = 'party' } },
  pickOnline: { target: 'd-game', enter: (s) => { s.sheet = null; s.online = true } },
  openTable: { target: 'd-open-table', dock: 'top', enter: (s) => { s.route = 'page' } },
  privacy: { target: 'd-private', dock: 'top', enter: (s) => { s.choosing = true } },
  code: { target: 'd-code', enter: (s) => { s.route = 'lobby'; s.choosing = false } },
  friendsMenu: { target: 'd-burger', enter: () => {} },
  menuFriends: { target: 'd-menu-friends', dock: 'top', enter: (s) => { s.drawer = true } },
  addFriend: { target: 'd-friend-add', enter: (s) => { s.drawer = false; s.panel = 'friends'; s.friendCode = true } },
  accept: { target: 'd-friend-accept', enter: (s) => { s.friendCode = false; s.friendSent = true } },
  inviteOpen: { target: 'd-invite-btn', enter: (s) => { s.panel = null; s.friendOk = true } },
  invite: { target: 'd-invite-row', enter: (s) => { s.inviteOpen = true } },
  mic: { target: 'd-voice-btn', enter: (s) => { s.inviteOpen = false; s.invited = true; s.friendIn = true } },
  join: { target: 'd-voice-join', dock: 'top', enter: (s) => { s.sheet = 'voice' } },
  controls: { target: 'd-voice-controls', dock: 'top', enter: (s) => { s.voice = true } },
  bots: { target: 'd-bots', enter: (s) => { s.sheet = null } },
  launch: { target: 'd-launch', dock: 'top', enter: (s) => { s.bots = 1 } },
  briefing: { target: 'd-briefing', enter: (s) => { s.route = 'briefing' } },
  bulb: { target: 'd-bulb', enter: (s) => { s.route = 'game' } },
  howTo: { target: 'd-howto', enter: (s) => { s.howTo = true } },
  chatMenu: { target: 'd-burger', enter: (s) => { s.howTo = false } },
  menuChat: { target: 'd-menu-chat', dock: 'top', enter: (s) => { s.drawer = true } },
  write: { target: 'd-compose', enter: (s) => { s.drawer = false; s.panel = 'chat'; s.draft = true } },
  private: { target: 'd-tab-friends', enter: (s) => { s.draft = false; s.sent = true } },
}

/** L'écran d'exemple à l'étape `index` : toutes les étapes rejouées depuis le début. */
export function demoStateAt(index: number): DemoState {
  const state = { ...INITIAL }
  for (let k = 0; k <= index && k < DEMO_STEPS.length; k++) SCRIPT[DEMO_STEPS[k].id].enter(state)
  return state
}

const EDGE = 12
const GAP = 22

export function TourDemo({
  hidden,
  onSkip,
  onBack,
  onDone,
}: {
  /** Une carte centrée (confirmation) recouvre la démonstration : la bulle se tait. */
  hidden: boolean
  onSkip: () => void
  /** « Retour » à la première étape : revenir à la pause. */
  onBack: () => void
  onDone: () => void
}) {
  const t = useTranslations('tour')
  const { user } = useAuth()
  const viewport = useViewport()
  const [index, setIndex] = useState(0)
  const [root, setRoot] = useState<HTMLDivElement | null>(null)
  const [frame, setFrame] = useState<Box | null>(null)
  const [bubbleHeight, setBubbleHeight] = useState(230)
  const viewRef = useRef<HTMLDivElement>(null)

  const step = DEMO_STEPS[index]
  const script = SCRIPT[step.id]
  const dock = script.dock ?? 'bottom'
  const state = useMemo(() => demoStateAt(index), [index])
  const me = user?.onlineDisplayName || user?.displayName || t('sample.me')
  const box = useAnchorBox(script.target, root)

  // Le cadre : tout l'écran sur téléphone, une colonne centrée au-delà.
  useLayoutEffect(() => {
    if (!root) return
    const read = () => {
      const r = root.getBoundingClientRect()
      setFrame({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    read()
    window.addEventListener('resize', read)
    return () => window.removeEventListener('resize', read)
  }, [root, viewport.width, viewport.height])

  // Nouvel écran d'exemple : il repart du haut.
  useLayoutEffect(() => {
    if (viewRef.current) viewRef.current.scrollTop = 0
  }, [state.route])

  // Amener l'élément visé dans la place que la bulle laisse libre, du strict
  // nécessaire : le reste de l'écran d'exemple reste sous les yeux.
  useLayoutEffect(() => {
    const view = viewRef.current
    if (!view || !root || !frame) return
    const el = findAnchor(script.target, root)
    if (!el || !view.contains(el)) return
    const area = view.getBoundingClientRect()
    const zoneTop = dock === 'bottom' ? area.top + 10 : frame.top + EDGE + bubbleHeight + GAP
    const zoneBottom = dock === 'bottom' ? frame.top + frame.height - EDGE - bubbleHeight - GAP : area.bottom - 10
    const r = el.getBoundingClientRect()
    if (r.bottom > zoneBottom) view.scrollTop += Math.max(0, Math.min(r.bottom - zoneBottom, r.top - zoneTop))
    else if (r.top < zoneTop) view.scrollTop -= zoneTop - r.top
  }, [index, script.target, dock, root, frame, bubbleHeight])

  const next = useCallback(() => {
    if (index >= DEMO_STEPS.length - 1) onDone()
    else setIndex(index + 1)
  }, [index, onDone])

  const back = useCallback(() => {
    if (index === 0) onBack()
    else setIndex(index - 1)
  }, [index, onBack])

  useEffect(() => {
    if (hidden) return
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (event.key === 'ArrowRight') next()
      else if (event.key === 'ArrowLeft') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hidden, next, back])

  return (
    <>
      <div className="pointer-events-auto fixed inset-0 flex items-stretch justify-center bg-[#061D16] sm:items-center sm:bg-[rgba(3,14,10,0.86)]">
        <div
          ref={setRoot}
          className="app-felt relative flex w-full select-none flex-col overflow-hidden text-cream sm:h-[min(820px,calc(100dvh-48px))] sm:w-[400px] sm:rounded-[28px] sm:border sm:border-gold/40 sm:shadow-2xl"
        >
          <DemoNavbar state={state} />
          <div ref={viewRef} className="relative min-h-0 flex-1 overflow-hidden">
            <div className="pb-[320px]">
              <DemoView state={state} me={me} />
            </div>
          </div>
          <DemoBar state={state} />
          <DemoOverlay state={state} me={me} />
        </div>
      </div>

      {!hidden && frame && (
        <>
          <TourSpot
            box={box}
            interactive={false}
            dock={dock}
            bubbleHeight={bubbleHeight}
            viewport={viewport}
            frame={frame}
            onHit={next}
            hitLabel={t('next')}
          />
          <TourBubble
            progress={chapterProgress(DEMO_STEPS, index)}
            title={t(`demo.${step.id}.title`)}
            body={t(`demo.${step.id}.body`)}
            hint={t('tapHint')}
            onNext={next}
            onBack={back}
            onSkip={onSkip}
            box={box}
            dock={dock}
            viewport={viewport}
            frame={frame}
            onHeight={setBubbleHeight}
          />
        </>
      )}
    </>
  )
}
