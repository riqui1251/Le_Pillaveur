"use client"

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Mic, MicOff, MicVocal, Headphones, PhoneCall, PhoneOff, Volume2, VolumeX, Speaker, Ear, X, Loader2, RefreshCw, AlertTriangle } from 'lucide-react'
import { usePathname } from '@/i18n/navigation'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { useVoiceChat } from '@/hooks/useVoiceChat'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { Button } from '@/components/ui/button'
import { isRoomGamePath } from '@/components/online/room-page'
import { isCapacitorApp } from '@/lib/native-app'
import { cn } from '@/lib/utils'
import { publishVoiceDockStatus, setVoiceDockOpen, useVoiceDockAnchored, useVoiceDockStatus } from './voice-dock-store'
import { deferVoicePrompt, isVoicePromptDeferred } from './voice-prompt-memory'

/**
 * Vocal de salle — monté par le layout des jeux en mode en ligne. Opt-in : le
 * micro ne s'ouvre qu'au toucher « Rejoindre le vocal ».
 *
 * Il ne se MONTRE que sur la page du jeu de la salle (isRoomGamePath) : la
 * table suivait le joueur jusque dans ses jeux locaux, question du micro et
 * bulle comprises. Exception : en plein vocal, il reste visible partout —
 * un micro ouvert doit toujours pouvoir se couper. Le hook reste monté hors de
 * la page (une bascule de jeu ne coupe pas la conversation).
 *
 * La feuille s'ouvre en BAS, en portail : le panneau poussait vers le haut
 * depuis la bulle et sortait de l'écran dès 7 joueurs, croix et commandes
 * comprises. Son ouverture passe par `voice-dock-store`, que les boutons micro
 * d'en-tête (VoiceDockButton) pilotent aussi ; tant qu'un de ces boutons est
 * monté, la bulle flottante se range.
 */
const DOCK_POS_KEY = 'lp-voice-dock-pos'

function loadDockPos(): { dx: number; dy: number } {
  if (typeof window === 'undefined') return { dx: 0, dy: 0 }
  try {
    const raw = window.localStorage.getItem(DOCK_POS_KEY)
    const p = raw ? (JSON.parse(raw) as { dx: number; dy: number }) : null
    return p && Number.isFinite(p.dx) && Number.isFinite(p.dy) ? p : { dx: 0, dy: 0 }
  } catch {
    return { dx: 0, dy: 0 }
  }
}

export function VoiceDock() {
  const { user } = useAuth()
  const { room } = useOnlineRoom()
  const pathname = usePathname()
  const t = useTranslations('voice')
  const reduceMotion = useReducedMotion()
  const titleId = useId()
  const { open } = useVoiceDockStatus()
  const anchored = useVoiceDockAnchored()

  // Bulle DÉPLAÇABLE (quand aucun bouton d'en-tête ne la remplace) : glisser
  // la repositionne (position mémorisée). Un tap simple ouvre.
  const [dockPos, setDockPos] = useState(loadDockPos)
  const dragRef = useRef<{
    startX: number
    startY: number
    baseDx: number
    baseDy: number
    moved: boolean
    lastDx: number
    lastDy: number
  } | null>(null)

  const clampPos = (dx: number, dy: number) => ({
    dx: Math.min(12, Math.max(-(window.innerWidth - 72), dx)),
    dy: Math.min(12, Math.max(-(window.innerHeight - 170), dy)),
  })

  const onDockPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseDx: dockPos.dx,
      baseDy: dockPos.dy,
      moved: false,
      lastDx: dockPos.dx,
      lastDy: dockPos.dy,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onDockPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current
    if (!d) return
    const mx = e.clientX - d.startX
    const my = e.clientY - d.startY
    if (!d.moved && Math.abs(mx) + Math.abs(my) > 8) d.moved = true
    if (d.moved) {
      const next = clampPos(d.baseDx + mx, d.baseDy + my)
      d.lastDx = next.dx
      d.lastDy = next.dy
      setDockPos(next)
    }
  }
  const onDockPointerUp = () => {
    const d = dragRef.current
    dragRef.current = null
    if (!d) return
    if (d.moved) {
      try {
        window.localStorage.setItem(DOCK_POS_KEY, JSON.stringify({ dx: d.lastDx, dy: d.lastDy }))
      } catch {
        /* stockage indisponible */
      }
    } else {
      setVoiceDockOpen((v) => !v) // tap simple = ouvrir/fermer
    }
  }

  const members = useMemo(() => room?.members ?? [], [room])
  const voice = useVoiceChat(room?.id ?? null, user?.id, members)

  const onRoomPage = isRoomGamePath(pathname, room?.gameId)
  const shown = Boolean(room && user) && (onRoomPage || voice.joined)
  const someoneSpeaking = Object.entries(voice.speaking).some(([id, s]) => s && id !== user?.id)

  // Ce que les boutons d'en-tête lisent. Hors de sa page, la feuille se ferme.
  useEffect(() => {
    publishVoiceDockStatus({
      available: shown,
      joined: voice.joined,
      micMuted: voice.micMuted,
      inVoice: voice.joined ? voice.roster.size + 1 : 0,
      speaking: someoneSpeaking && voice.joined && !voice.deafened,
      ...(shown ? {} : { open: false }),
    })
  }, [shown, voice.joined, voice.micMuted, voice.roster.size, voice.deafened, someoneSpeaking])
  useEffect(
    () => () =>
      publishVoiceDockStatus({ available: false, open: false, joined: false, micMuted: false, inVoice: 0, speaking: false }),
    []
  )

  // « Activer le micro ? » une fois par salle, sur la page de son jeu. « Plus
  // tard » est retenu pour la session de l'onglet (voice-prompt-memory) : la
  // carte ne revient plus à chaque rechargement.
  const [micPromptRoomId, setMicPromptRoomId] = useState<string | null>(null)
  const handledRoomsRef = useRef<Set<string>>(new Set())
  const roomId = room?.id ?? null
  useEffect(() => {
    if (!roomId || voice.joined || !onRoomPage) return
    if (handledRoomsRef.current.has(roomId) || isVoicePromptDeferred(roomId)) return
    setMicPromptRoomId(roomId)
  }, [roomId, voice.joined, onRoomPage])

  // Dans l'app mobile, le micro est une autorisation ANDROID : après deux
  // refus, le système refuse seul, sans plus rien demander, et « les
  // réglages de ton navigateur » n'existent pas. On y donne le vrai chemin.
  // Lu après montage, comme partout ailleurs (Navbar, FullscreenButton).
  const [inApp, setInApp] = useState(false)
  useEffect(() => {
    setInApp(isCapacitorApp())
  }, [])

  // Feuille modale : le focus y entre, Échap la ferme, Tab y tourne, et le
  // focus revient à la fermeture sur ce qui l'avait ouverte.
  const sheetRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    sheetRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setVoiceDockOpen(false)
        return
      }
      if (e.key !== 'Tab') return
      const sheet = sheetRef.current
      if (!sheet) return
      const focusables = Array.from(
        sheet.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')
      )
      const active = document.activeElement
      const inside = active instanceof Node && sheet.contains(active) && active !== sheet
      if (focusables.length === 0) {
        e.preventDefault()
        sheet.focus()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && (!inside || active === first)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (!inside || active === last)) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (opener?.isConnected) opener.focus()
    }
  }, [open])

  if (!room || !user || !shown) return null

  const dismissPrompt = () => {
    handledRoomsRef.current.add(room.id)
    deferVoicePrompt(room.id)
    setMicPromptRoomId(null)
  }
  const acceptPrompt = () => {
    handledRoomsRef.current.add(room.id)
    setMicPromptRoomId(null)
    setVoiceDockOpen(true)
    void voice.join()
  }
  // Jamais en pleine partie ni sur l'écran de fin (statut 'playing') : la
  // carte couvrait buzzers, mains et Rejouer. La scène a son bouton micro
  // (PhaseHeader) ; sans réponse, la question revient au retour à la table.
  const showMicPrompt =
    micPromptRoomId === room.id && onRoomPage && !voice.joined && !open && room.status !== 'playing'

  const iconOf = (userId: string) =>
    members.find((m) => m.userId === userId)?.preferences?.icon ?? '👤'

  const sheet = (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center">
          {/* Le voile ferme au toucher ; au clavier, c'est la croix ou Échap. */}
          <motion.button
            type="button"
            tabIndex={-1}
            aria-label={t('close')}
            onClick={() => setVoiceDockOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={reduceMotion ? { opacity: 0 } : { y: '100%' }}
            animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className="relative flex max-h-[75dvh] w-full max-w-lg flex-col rounded-t-3xl border-x border-t border-gold/25 bg-felt-deep pb-[max(0.75rem,env(safe-area-inset-bottom))] text-cream shadow-[0_-18px_50px_-20px_rgba(0,0,0,0.9)] outline-none"
          >
            <div className="flex shrink-0 items-center gap-3 px-4 pb-2 pt-3">
              <Headphones aria-hidden className="h-5 w-5 shrink-0 text-gold" />
              <h2 id={titleId} className="min-w-0 flex-1 truncate font-display text-lg font-bold text-cream">
                {t('title')}
              </h2>
              <button
                type="button"
                onClick={() => setVoiceDockOpen(false)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-cream/70 transition-colors hover:bg-gold/10 hover:text-cream"
                aria-label={t('close')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tout le corps défile : à 16 joueurs, ou sous deux avertissements,
                rien ne passe plus sous le bord de l'écran. */}
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 pb-2">
              {/* États d'erreur */}
              {voice.error === 'mic-denied' && (
                <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                  {inApp ? t('micDeniedApp') : t('micDenied')}
                </p>
              )}
              {voice.error === 'unsupported' && (
                <p className="rounded-xl border border-gold/30 bg-gold/10 px-3 py-2 text-xs text-amber-100">
                  {t('unsupported')}
                </p>
              )}
              {voice.error === 'network' && (
                <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                  {t('networkError')}
                </p>
              )}
              {voice.error === 'disabled' && (
                <p className="rounded-xl border border-gold/30 bg-gold/10 px-3 py-2 text-xs text-amber-100">
                  {t('disabled')}
                </p>
              )}
              {voice.error === 'banned' && (
                <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                  {t('banned')}
                </p>
              )}

              {/* Pannes en cours de vocal — annoncées, avec de quoi repartir.
                  Sans ça, le vocal mourait sans un mot : le joueur croyait
                  simplement que plus personne ne parlait. */}
              {voice.joined && voice.micLost && (
                <div className="rounded-xl border border-gold/30 bg-gold/10 px-3 py-2">
                  <p className="flex items-start gap-2 text-xs text-amber-100">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {t('micLost')}
                  </p>
                  <Button variant="quiet" size="game" onClick={() => void voice.resumeMic()} className="mt-2 w-full gap-1.5">
                    <MicVocal className="h-4 w-4" />
                    {t('resumeMic')}
                  </Button>
                </div>
              )}
              {voice.joined && voice.signalingLost && (
                <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2">
                  <p className="flex items-start gap-2 text-xs text-red-100">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {t('signalLost')}
                  </p>
                  <Button variant="quiet" size="game" onClick={() => void voice.reconnect()} className="mt-2 w-full gap-1.5">
                    <RefreshCw className="h-4 w-4" />
                    {t('reconnect')}
                  </Button>
                </div>
              )}

              {/* Contrôles */}
              {!voice.joined ? (
                <Button
                  variant="primary"
                  size="game"
                  onClick={() => void voice.join()}
                  disabled={voice.joining || !voice.supported}
                  className="w-full gap-2"
                >
                  {voice.joining ? (
                    <Loader2 className="h-4 w-4 motion-safe:animate-spin" />
                  ) : (
                    <PhoneCall className="h-4 w-4" />
                  )}
                  {voice.joining ? t('connecting') : t('join')}
                </Button>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={voice.toggleMic}
                    aria-pressed={voice.micMuted}
                    className={cn(
                      'flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-center text-xs font-semibold leading-tight transition-colors',
                      voice.micMuted
                        ? 'border-red-400/40 bg-red-500/[0.15] text-red-100'
                        : 'border-gold/25 bg-felt/40 text-cream hover:bg-gold/10'
                    )}
                    aria-label={voice.micMuted ? t('micUnmute') : t('micMute')}
                  >
                    {voice.micMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    {voice.micMuted ? t('micUnmute') : t('micMute')}
                  </button>
                  <button
                    type="button"
                    onClick={voice.toggleDeafen}
                    aria-pressed={voice.deafened}
                    className={cn(
                      'flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-center text-xs font-semibold leading-tight transition-colors',
                      voice.deafened
                        ? 'border-red-400/40 bg-red-500/[0.15] text-red-100'
                        : 'border-gold/25 bg-felt/40 text-cream hover:bg-gold/10'
                    )}
                    aria-label={voice.deafened ? t('undeafen') : t('deafen')}
                  >
                    {voice.deafened ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    {voice.deafened ? t('undeafen') : t('deafen')}
                  </button>
                  <button
                    type="button"
                    onClick={voice.leave}
                    className="flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl border border-red-400/40 bg-red-500/[0.15] px-1 py-2 text-center text-xs font-semibold leading-tight text-red-100 transition-colors hover:bg-red-500/25"
                    aria-label={t('leave')}
                  >
                    <PhoneOff className="h-4 w-4" />
                    {t('leave')}
                  </button>
                </div>
              )}

              {/* Sortie audio : haut-parleur (fort) ou écouteur (discret). */}
              {voice.joined && (
                <button
                  type="button"
                  onClick={voice.toggleSpeaker}
                  className={cn(
                    'flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors',
                    voice.speaker
                      ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                      : 'border-gold/25 bg-felt/40 text-cream/80 hover:bg-gold/10'
                  )}
                  aria-label={t('speaker')}
                  aria-pressed={voice.speaker}
                >
                  <span className="flex items-center gap-2">
                    {voice.speaker ? <Speaker className="h-4 w-4" /> : <Ear className="h-4 w-4" />}
                    {t('speaker')}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide',
                      voice.speaker ? 'bg-emerald-500/30 text-emerald-100' : 'bg-cream/10 text-cream/70'
                    )}
                  >
                    {voice.speaker ? t('on') : t('off')}
                  </span>
                </button>
              )}

              {/* Joueurs de la salle */}
              <ul className="space-y-1.5">
                {members.map((m) => {
                  const self = m.userId === user.id
                  const isSpeaking = Boolean(voice.speaking[m.userId])
                  const isMuted = voice.mutedPeers.has(m.userId)
                  // Ce qu'on affiche à droite d'un joueur, et RIEN d'autre :
                  //  - 'connected' / 'connecting' / 'failed' : état réel de la
                  //    liaison pair-à-pair (un pair annoncé en vocal mais dont
                  //    la connexion a échoué ne doit pas porter la pastille
                  //    verte : c'est ce mensonge qui laissait tout le monde
                  //    chercher pourquoi il n'entendait rien) ;
                  //  - 'absent' : on sait qu'il n'est pas en vocal ;
                  //  - null : ON NE SAIT PAS, donc on ne dit rien.
                  //
                  // Le cas `null` est la contrepartie du précédent : tant qu'on
                  // n'a pas rejoint le vocal soi-même, il n'existe aucune
                  // connexion ni aucune liste de présence — ni « en cours de
                  // connexion », ni « pas en vocal » ne seraient vrais pour les
                  // autres. Seul son propre état reste connaissable.
                  const peerState: 'connected' | 'connecting' | 'failed' | 'absent' | null = self
                    ? voice.joined
                      ? 'connected'
                      : 'absent'
                    : !voice.joined
                      ? null
                      : voice.roster.has(m.userId)
                        ? (voice.peerStatus[m.userId] ?? 'connecting')
                        : 'absent'
                  return (
                    <li
                      key={m.userId}
                      className="flex min-h-[48px] items-center gap-2 rounded-xl border border-gold/20 bg-felt/30 px-2.5 py-1"
                    >
                      <span
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base transition-shadow',
                          isSpeaking && peerState === 'connected' && 'ring-2 ring-emerald-400'
                        )}
                        aria-hidden
                      >
                        <PlayerAvatarGlyph value={iconOf(m.userId)} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-cream">
                        {m.displayName}
                        {self && <span className="font-normal text-cream/60"> {t('you')}</span>}
                      </span>
                      {peerState === 'connecting' && (
                        <span className="flex shrink-0 items-center gap-1 text-xs uppercase tracking-wide text-cream/60">
                          <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
                          {t('connecting')}
                        </span>
                      )}
                      {peerState === 'connected' && (
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400"
                          title={t('inVoice')}
                          aria-label={t('inVoice')}
                        />
                      )}
                      {peerState === 'failed' && (
                        <span className="flex shrink-0 items-center gap-1 text-xs uppercase tracking-wide text-red-300">
                          <span className="h-2 w-2 rounded-full bg-red-400" aria-hidden />
                          {t('peerFailed')}
                        </span>
                      )}
                      {peerState === 'absent' && (
                        <span className="shrink-0 text-xs uppercase tracking-wide text-cream/60">
                          {t('notInVoice')}
                        </span>
                      )}
                      {!self && peerState === 'connected' && (
                        <button
                          type="button"
                          onClick={() => voice.toggleMutePeer(m.userId)}
                          className={cn(
                            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors',
                            isMuted
                              ? 'border-red-400/40 bg-red-500/[0.15] text-red-200'
                              : 'border-gold/20 bg-felt-deep/60 text-cream/80 hover:bg-gold/10'
                          )}
                          aria-label={isMuted ? t('unmutePeer') : t('mutePeer')}
                          aria-pressed={isMuted}
                          title={isMuted ? t('unmutePeer') : t('mutePeer')}
                        >
                          {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
              {!voice.joined && <p className="text-xs text-cream/70">{t('joinHint')}</p>}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )

  return (
    <>
      {/* Question « Activer le micro ? », au lobby seulement : au-dessus de
          sa barre d'action (safe-area comprise), jamais sur elle. */}
      <AnimatePresence>
        {showMicPrompt && (
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 340, damping: 24 }}
            className="fixed inset-x-3 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-[95] rounded-2xl border border-gold/30 bg-felt-deep/95 p-3 text-cream shadow-2xl backdrop-blur-md sm:inset-x-auto sm:right-4 sm:w-72"
            role="dialog"
            aria-label={t('prompt.title')}
          >
            <p className="flex items-center gap-2 text-sm font-bold text-cream">
              <Mic aria-hidden className="h-4 w-4 shrink-0 text-gold" /> {t('prompt.title')}
            </p>
            {/* Consigne lue seulement par les lecteurs d'écran : la carte
                flotte au-dessus du contenu, chaque ligne de moins en découvre
                davantage (au lobby, elle masquait « Compléter avec des bots »). */}
            <p className="sr-only">{t('prompt.micHint')}</p>
            <div className="mt-2 flex gap-2">
              <Button variant="primary" size="game" onClick={acceptPrompt} className="flex-1">
                {t('prompt.enable')}
              </Button>
              <Button variant="quiet" size="game" onClick={dismissPrompt} className="flex-1">
                {t('prompt.later')}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {createPortal(sheet, document.body)}

      {/* Bulle flottante de secours — glisser pour déplacer, tap pour ouvrir.
          Rangée dès qu'un bouton micro d'en-tête est monté. */}
      {!anchored && (
        <button
          type="button"
          onPointerDown={onDockPointerDown}
          onPointerMove={onDockPointerMove}
          onPointerUp={onDockPointerUp}
          onPointerCancel={() => {
            dragRef.current = null
          }}
          style={{ touchAction: 'none', transform: `translate(${dockPos.dx}px, ${dockPos.dy}px)` }}
          className={cn(
            'fixed bottom-[calc(6.5rem+env(safe-area-inset-bottom))] right-3 z-[90] flex h-12 w-12 cursor-grab items-center justify-center rounded-2xl border shadow-lg backdrop-blur-md transition-colors active:cursor-grabbing sm:right-4',
            voice.joined
              ? 'border-emerald-400/60 bg-emerald-700/90 text-cream'
              : 'border-gold/30 bg-felt-deep/90 text-gold hover:bg-felt-deep',
            someoneSpeaking && voice.joined && !voice.deafened && 'ring-2 ring-emerald-300/80'
          )}
          aria-label={voice.joined && voice.roster.size > 0 ? t('titleWithCount', { count: voice.roster.size + 1 }) : t('title')}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          {voice.joined && voice.micMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          {voice.joined && voice.roster.size > 0 && (
            <span
              aria-hidden
              className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full border border-felt-deep bg-emerald-400 px-1 text-[11px] font-bold tabular-nums text-felt-deep"
            >
              {voice.roster.size + 1}
            </span>
          )}
        </button>
      )}
    </>
  )
}
