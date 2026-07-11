"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, Headphones, PhoneCall, PhoneOff, Volume2, VolumeX, Speaker, Ear, X, Loader2 } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { useVoiceChat } from '@/hooks/useVoiceChat'
import { cn } from '@/lib/utils'

/**
 * Vocal de salle — dock flottant GÉNÉRIQUE : monté dans le layout des jeux,
 * il apparaît dès que le joueur est dans une salle en ligne (lobby inclus),
 * quel que soit le jeu, actuel ou futur. Opt-in : le micro ne s'ouvre qu'au
 * clic « Rejoindre le vocal ».
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
  const [open, setOpen] = useState(false)
  const t = useTranslations('voice')

  // Dock DÉPLAÇABLE : glisser le bouton le repositionne (position mémorisée) —
  // il pouvait masquer des commandes de certains jeux. Un tap simple ouvre.
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
    dy: Math.min(12, Math.max(-(window.innerHeight - 140), dy)),
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
      setOpen((v) => !v) // tap simple = ouvrir/fermer
    }
  }

  const members = useMemo(() => room?.members ?? [], [room])
  const voice = useVoiceChat(room?.id ?? null, user?.id, members)

  // Prompt « Activer le micro ? » à CHAQUE partie : proposé une fois par salle,
  // dès l'entrée. Un tap est de toute façon requis pour ouvrir le micro (geste).
  const [micPromptRoomId, setMicPromptRoomId] = useState<string | null>(null)
  const handledRoomsRef = useRef<Set<string>>(new Set())
  const roomId = room?.id ?? null
  useEffect(() => {
    if (!roomId || voice.joined) return
    if (handledRoomsRef.current.has(roomId)) return
    setMicPromptRoomId(roomId)
  }, [roomId, voice.joined])

  if (!room || !user) return null

  const dismissPrompt = () => {
    handledRoomsRef.current.add(room.id)
    setMicPromptRoomId(null)
  }
  const acceptPrompt = () => {
    dismissPrompt()
    setOpen(true)
    void voice.join()
  }
  const showMicPrompt = micPromptRoomId === room.id && !voice.joined && !open

  const someoneSpeaking = Object.entries(voice.speaking).some(([id, s]) => s && id !== user.id)
  const iconOf = (userId: string) =>
    members.find((m) => m.userId === userId)?.preferences?.icon ?? '👤'

  return (
    <>
      {/* Prompt « Activer le micro ? » à l'entrée d'une partie — rendu HORS
          du conteneur transformé du dock : une transform CSS sur un ancêtre
          fait de lui le containing block des descendants position:fixed, ce
          qui rétrécissait ce panneau à la largeur (étroite) du dock au lieu
          du viewport entier. */}
      <AnimatePresence>
        {showMicPrompt && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 340, damping: 24 }}
            className="fixed inset-x-3 bottom-24 z-[95] rounded-2xl border border-emerald-400/30 bg-felt-deep/95 p-3 shadow-2xl backdrop-blur-md sm:inset-x-auto sm:bottom-28 sm:right-4 sm:w-64"
            role="dialog"
            aria-label={t('prompt.title')}
          >
            <p className="flex items-center gap-2 text-sm font-bold text-white">
              <Mic className="h-4 w-4 text-emerald-300" /> {t('prompt.title')}
            </p>
            <p className="mt-1 text-xs text-white/50">{t('prompt.hint')}</p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={acceptPrompt}
                className="flex-1 rounded-xl bg-emerald-600 py-2 text-sm font-bold text-white transition-colors hover:bg-emerald-500"
              >
                {t('prompt.enable')}
              </button>
              <button
                onClick={dismissPrompt}
                className="flex-1 rounded-xl border border-white/15 bg-white/5 py-2 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10"
              >
                {t('prompt.later')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className="fixed bottom-24 right-3 z-[90] flex flex-col items-end gap-2 sm:bottom-28 sm:right-4"
        style={{ transform: `translate(${dockPos.dx}px, ${dockPos.dy}px)` }}
      >
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 340, damping: 24 }}
            className="w-72 overflow-hidden rounded-2xl border border-white/12 bg-gray-900/95 shadow-2xl backdrop-blur-md"
            role="dialog"
            aria-label={t('title')}
          >
            <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-gradient-to-br from-emerald-600/15 to-transparent px-4 py-3">
              <div className="flex items-center gap-2">
                <Headphones className="h-4 w-4 text-emerald-300" />
                <h3 className="text-sm font-bold text-white">{t('title')}</h3>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                aria-label={t('close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-3">
              {/* États d'erreur */}
              {voice.error === 'mic-denied' && (
                <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                  {t('micDenied')}
                </p>
              )}
              {voice.error === 'unsupported' && (
                <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  {t('unsupported')}
                </p>
              )}
              {voice.error === 'network' && (
                <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                  {t('networkError')}
                </p>
              )}
              {voice.error === 'disabled' && (
                <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  {t('disabled')}
                </p>
              )}
              {voice.error === 'banned' && (
                <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                  {t('banned')}
                </p>
              )}

              {/* Contrôles */}
              {!voice.joined ? (
                <button
                  onClick={() => void voice.join()}
                  disabled={voice.joining || !voice.supported}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white transition-all hover:bg-emerald-500 disabled:opacity-50"
                >
                  {voice.joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
                  {voice.joining ? t('connecting') : t('join')}
                </button>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={voice.toggleMic}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-xl border py-2 text-[10px] font-semibold transition-all',
                      voice.micMuted
                        ? 'border-red-400/40 bg-red-500/15 text-red-100'
                        : 'border-white/15 bg-white/5 text-white/80 hover:bg-white/10'
                    )}
                    aria-label={voice.micMuted ? t('micUnmute') : t('micMute')}
                  >
                    {voice.micMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    {voice.micMuted ? t('micUnmute') : t('micMute')}
                  </button>
                  <button
                    onClick={voice.toggleDeafen}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-xl border py-2 text-[10px] font-semibold transition-all',
                      voice.deafened
                        ? 'border-red-400/40 bg-red-500/15 text-red-100'
                        : 'border-white/15 bg-white/5 text-white/80 hover:bg-white/10'
                    )}
                    aria-label={voice.deafened ? t('undeafen') : t('deafen')}
                  >
                    {voice.deafened ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    {voice.deafened ? t('undeafen') : t('deafen')}
                  </button>
                  <button
                    onClick={voice.leave}
                    className="flex flex-col items-center gap-1 rounded-xl border border-red-400/40 bg-red-500/15 py-2 text-[10px] font-semibold text-red-100 transition-all hover:bg-red-500/25"
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
                  onClick={voice.toggleSpeaker}
                  className={cn(
                    'flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs font-semibold transition-all',
                    voice.speaker
                      ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                      : 'border-white/15 bg-white/5 text-white/70 hover:bg-white/10'
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
                      'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                      voice.speaker ? 'bg-emerald-500/30 text-emerald-100' : 'bg-white/10 text-white/50'
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
                  const inVoice = self ? voice.joined : voice.roster.has(m.userId)
                  const isSpeaking = Boolean(voice.speaking[m.userId])
                  const isMuted = voice.mutedPeers.has(m.userId)
                  const status = voice.peerStatus[m.userId]
                  return (
                    <li
                      key={m.userId}
                      className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/4 px-2.5 py-1.5"
                    >
                      <span
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-base transition-shadow',
                          isSpeaking && inVoice && 'ring-2 ring-emerald-400'
                        )}
                        aria-hidden
                      >
                        {iconOf(m.userId)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white/90">
                        {m.displayName}
                        {self && <span className="text-white/40"> {t('you')}</span>}
                      </span>
                      {inVoice ? (
                        status === 'connecting' && !self ? (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-white/40" />
                        ) : (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full bg-emerald-400"
                            title={t('inVoice')}
                            aria-label={t('inVoice')}
                          />
                        )
                      ) : (
                        <span className="shrink-0 text-[9px] uppercase tracking-wide text-white/30">
                          {t('notInVoice')}
                        </span>
                      )}
                      {!self && inVoice && voice.joined && (
                        <button
                          onClick={() => voice.toggleMutePeer(m.userId)}
                          className={cn(
                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-all',
                            isMuted
                              ? 'border-red-400/40 bg-red-500/15 text-red-200'
                              : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                          )}
                          aria-label={isMuted ? t('unmutePeer') : t('mutePeer')}
                          title={isMuted ? t('unmutePeer') : t('mutePeer')}
                        >
                          {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
              {!voice.joined && <p className="text-[11px] text-white/40">{t('joinHint')}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bouton flottant — glisser pour déplacer, tap pour ouvrir */}
      <button
        onPointerDown={onDockPointerDown}
        onPointerMove={onDockPointerMove}
        onPointerUp={onDockPointerUp}
        onPointerCancel={() => {
          dragRef.current = null
        }}
        style={{ touchAction: 'none' }}
        className={cn(
          'relative flex h-12 w-12 cursor-grab items-center justify-center rounded-2xl border shadow-lg backdrop-blur-md transition-all active:scale-95 active:cursor-grabbing',
          voice.joined
            ? 'border-emerald-400/50 bg-emerald-600/90 text-white'
            : 'border-white/15 bg-gray-900/90 text-white/80 hover:bg-gray-800',
          someoneSpeaking && voice.joined && !voice.deafened && 'ring-2 ring-emerald-300/80'
        )}
        aria-label={t('title')}
      >
        {voice.joined && voice.micMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        {voice.joined && voice.roster.size > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-gray-950 bg-emerald-500 px-1 text-[10px] font-bold text-white">
            {voice.roster.size + 1}
          </span>
        )}
      </button>
      </div>
    </>
  )
}
