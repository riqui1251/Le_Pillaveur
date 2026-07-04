"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import type { IceServer } from '@/lib/rtc/ice'

/**
 * Vocal de salle en WebRTC MESH — générique pour tous les jeux en ligne.
 *
 * Chaque membre en vocal ouvre une connexion audio DIRECTE vers chaque autre
 * (pair-à-pair, l'audio ne passe jamais par le serveur). La signalisation
 * transite par l'API + SSE de la salle ; l'initiateur d'une paire est décidé
 * de façon déterministe (plus petit userId) pour éviter les collisions.
 *
 * Trois niveaux de silence :
 *  - `micMuted`   : je coupe MON micro (personne ne m'entend) ;
 *  - `deafened`   : sourdine générale (je n'entends plus personne) ;
 *  - `mutedPeers` : je coupe UN joueur chez moi uniquement (persistant).
 */

export type VoicePeerStatus = 'connecting' | 'connected' | 'failed'
export type VoiceError = 'mic-denied' | 'unsupported' | 'network' | 'disabled' | 'banned' | null

type MemberLite = { userId: string }
type PeerEntry = {
  pc: RTCPeerConnection
  audio: HTMLAudioElement
  pendingIce: RTCIceCandidateInit[]
}
type RtcSignalMessage = { from: string; kind: string; payload: unknown }

const MUTED_PEERS_KEY = 'lp-voice-muted-peers'
const SPEAKING_POLL_MS = 250
const SPEAKING_THRESHOLD = 0.015

function loadMutedPeers(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(MUTED_PEERS_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

export function useVoiceChat(
  roomId: string | null,
  selfId: string | undefined,
  members: MemberLite[]
) {
  const [joined, setJoined] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<VoiceError>(null)
  const [micMuted, setMicMuted] = useState(false)
  const [deafened, setDeafened] = useState(false)
  const [mutedPeers, setMutedPeers] = useState<Set<string>>(loadMutedPeers)
  /** Membres actuellement EN VOCAL (soi exclu). */
  const [roster, setRoster] = useState<Set<string>>(new Set())
  const [speaking, setSpeaking] = useState<Record<string, boolean>>({})
  const [peerStatus, setPeerStatus] = useState<Record<string, VoicePeerStatus>>({})

  const localStreamRef = useRef<MediaStream | null>(null)
  const peersRef = useRef<Map<string, PeerEntry>>(new Map())
  const esRef = useRef<EventSource | null>(null)
  const iceServersRef = useRef<IceServer[]>([])
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analysersRef = useRef<Map<string, AnalyserNode>>(new Map())
  const deafenedRef = useRef(deafened)
  const mutedPeersRef = useRef(mutedPeers)
  const micMutedRef = useRef(micMuted)
  deafenedRef.current = deafened
  mutedPeersRef.current = mutedPeers
  micMutedRef.current = micMuted

  const supported =
    typeof window !== 'undefined' &&
    typeof RTCPeerConnection !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia)

  const isInitiator = useCallback(
    (peerId: string) => Boolean(selfId && selfId < peerId),
    [selfId]
  )

  const sendSignal = useCallback(
    async (to: string, kind: string, payload: unknown = null) => {
      if (!roomId) return
      await fetch(`/api/online/rooms/${roomId}/rtc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ to, kind, payload }),
      }).catch(() => {
        // signalisation perdue → le polling/ICE restart rattrapera
      })
    },
    [roomId]
  )

  const applyOutputMute = useCallback((peerId: string) => {
    const entry = peersRef.current.get(peerId)
    if (entry) entry.audio.muted = deafenedRef.current || mutedPeersRef.current.has(peerId)
  }, [])

  const attachAnalyser = useCallback((id: string, stream: MediaStream) => {
    try {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return
      if (!audioCtxRef.current) audioCtxRef.current = new AC()
      const ctx = audioCtxRef.current
      if (ctx.state === 'suspended') void ctx.resume()
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analysersRef.current.set(id, analyser)
    } catch {
      // pas d'indicateur de parole — non bloquant
    }
  }, [])

  const closePeer = useCallback((peerId: string) => {
    const entry = peersRef.current.get(peerId)
    if (!entry) return
    peersRef.current.delete(peerId)
    try {
      entry.pc.close()
    } catch {
      /* déjà fermé */
    }
    entry.audio.srcObject = null
    analysersRef.current.delete(peerId)
    setPeerStatus((prev) => {
      const next = { ...prev }
      delete next[peerId]
      return next
    })
    setRoster((prev) => {
      const next = new Set(prev)
      next.delete(peerId)
      return next
    })
  }, [])

  const ensurePeer = useCallback(
    (peerId: string): PeerEntry => {
      const existing = peersRef.current.get(peerId)
      if (existing) return existing

      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current as RTCIceServer[] })
      const stream = localStreamRef.current
      if (stream) stream.getTracks().forEach((t) => pc.addTrack(t, stream))

      const audio = new Audio()
      audio.autoplay = true
      ;(audio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true

      pc.ontrack = (ev) => {
        const remote = ev.streams[0] ?? new MediaStream([ev.track])
        audio.srcObject = remote
        applyOutputMute(peerId)
        void audio.play().catch(() => {
          // iOS : sera relancé au prochain geste utilisateur
        })
        attachAnalyser(peerId, remote)
      }
      pc.onicecandidate = (ev) => {
        if (ev.candidate) void sendSignal(peerId, 'ice', ev.candidate.toJSON())
      }
      pc.onconnectionstatechange = () => {
        const st = pc.connectionState
        setPeerStatus((prev) => ({
          ...prev,
          [peerId]: st === 'connected' ? 'connected' : st === 'failed' ? 'failed' : 'connecting',
        }))
        // Relance ICE côté initiateur si la connexion casse (changement de réseau…)
        if (st === 'failed' && isInitiator(peerId)) {
          void (async () => {
            try {
              const offer = await pc.createOffer({ iceRestart: true })
              await pc.setLocalDescription(offer)
              void sendSignal(peerId, 'offer', pc.localDescription)
            } catch {
              closePeer(peerId)
            }
          })()
        }
      }

      const entry: PeerEntry = { pc, audio, pendingIce: [] }
      peersRef.current.set(peerId, entry)
      setPeerStatus((prev) => ({ ...prev, [peerId]: 'connecting' }))
      return entry
    },
    [applyOutputMute, attachAnalyser, closePeer, isInitiator, sendSignal]
  )

  const startOffer = useCallback(
    async (peerId: string) => {
      const entry = ensurePeer(peerId)
      try {
        const offer = await entry.pc.createOffer()
        await entry.pc.setLocalDescription(offer)
        void sendSignal(peerId, 'offer', entry.pc.localDescription)
      } catch {
        closePeer(peerId)
      }
    },
    [closePeer, ensurePeer, sendSignal]
  )

  const drainIce = useCallback(async (entry: PeerEntry) => {
    while (entry.pendingIce.length > 0) {
      const cand = entry.pendingIce.shift()!
      await entry.pc.addIceCandidate(cand).catch(() => {})
    }
  }, [])

  const onSignal = useCallback(
    async (sig: RtcSignalMessage) => {
      const { from, kind, payload } = sig
      if (!from || from === selfId) return

      try {
        if (kind === 'hello') {
          setRoster((prev) => new Set(prev).add(from))
          const p = payload as { reply?: boolean } | null
          if (!p?.reply) void sendSignal(from, 'hello', { reply: true })
          if (isInitiator(from) && !peersRef.current.has(from)) void startOffer(from)
          return
        }
        if (kind === 'bye') {
          closePeer(from)
          return
        }
        if (kind === 'offer') {
          setRoster((prev) => new Set(prev).add(from))
          const entry = ensurePeer(from)
          await entry.pc.setRemoteDescription(payload as RTCSessionDescriptionInit)
          await drainIce(entry)
          const answer = await entry.pc.createAnswer()
          await entry.pc.setLocalDescription(answer)
          void sendSignal(from, 'answer', entry.pc.localDescription)
          return
        }
        if (kind === 'answer') {
          const entry = peersRef.current.get(from)
          if (!entry) return
          await entry.pc.setRemoteDescription(payload as RTCSessionDescriptionInit)
          await drainIce(entry)
          return
        }
        if (kind === 'ice') {
          const entry = ensurePeer(from)
          if (entry.pc.remoteDescription) {
            await entry.pc.addIceCandidate(payload as RTCIceCandidateInit).catch(() => {})
          } else {
            entry.pendingIce.push(payload as RTCIceCandidateInit)
          }
        }
      } catch {
        // un signal corrompu ne doit jamais casser le vocal
      }
    },
    [closePeer, drainIce, ensurePeer, isInitiator, selfId, sendSignal, startOffer]
  )
  const onSignalRef = useRef(onSignal)
  onSignalRef.current = onSignal

  const leave = useCallback(() => {
    for (const peerId of peersRef.current.keys()) {
      void sendSignal(peerId, 'bye')
    }
    for (const peerId of [...peersRef.current.keys()]) closePeer(peerId)
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
    esRef.current?.close()
    esRef.current = null
    analysersRef.current.clear()
    setJoined(false)
    setRoster(new Set())
    setSpeaking({})
    setPeerStatus({})
  }, [closePeer, sendSignal])

  const join = useCallback(async () => {
    if (!roomId || !selfId || joined || joining) return
    if (!supported) {
      setError('unsupported')
      return
    }
    setJoining(true)
    setError(null)
    try {
      // ⚠️ iOS Safari (et d'autres navigateurs mobiles) CONSOMMENT l'activation
      // utilisateur dès le premier `await`. Si on récupérait les identifiants
      // (fetch) AVANT `getUserMedia`, le micro échouerait « alors que la
      // permission est accordée ». On demande donc le micro EN PREMIER, dans le
      // geste, en parallèle des identifiants.
      const [stream, credsRes] = await Promise.all([
        navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        }),
        fetch('/api/rtc/credentials', { credentials: 'include' }),
      ])

      // Droit d'accès : vocal coupé (site) ou joueur banni → on relâche le micro.
      if (credsRes.status === 403) {
        stream.getTracks().forEach((tr) => tr.stop())
        const reason = (await credsRes.json().catch(() => null))?.reason
        setError(reason === 'banned' ? 'banned' : 'disabled')
        setJoining(false)
        return
      }
      const creds = credsRes.ok ? await credsRes.json().catch(() => null) : null
      iceServersRef.current = creds?.iceServers ?? [
        { urls: 'stun:stun.l.google.com:19302' },
      ]

      localStreamRef.current = stream
      stream.getAudioTracks().forEach((t) => {
        t.enabled = !micMutedRef.current
      })
      attachAnalyser(selfId, stream)

      // Flux SSE dédié à la signalisation (ouvert seulement pendant le vocal).
      const es = new EventSource(`/api/online/rooms/${roomId}/stream`)
      es.addEventListener('rtc', (ev) => {
        try {
          void onSignalRef.current(JSON.parse((ev as MessageEvent).data) as RtcSignalMessage)
        } catch {
          /* signal illisible ignoré */
        }
      })
      esRef.current = es

      setJoined(true)
      // S'annoncer à tous les membres : ceux qui sont en vocal répondront.
      members
        .filter((m) => m.userId !== selfId)
        .forEach((m) => void sendSignal(m.userId, 'hello', { reply: false }))
    } catch (e) {
      const name = (e as { name?: string })?.name
      setError(name === 'NotAllowedError' || name === 'NotFoundError' ? 'mic-denied' : 'network')
      localStreamRef.current?.getTracks().forEach((t) => t.stop())
      localStreamRef.current = null
    } finally {
      setJoining(false)
    }
  }, [attachAnalyser, joined, joining, members, roomId, selfId, sendSignal, supported])

  // Micro coupé/rouvert → sur la piste locale (les autres n'entendent plus rien).
  useEffect(() => {
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !micMuted
    })
  }, [micMuted])

  // Sourdine générale / mute ciblé → sur les sorties audio locales.
  useEffect(() => {
    for (const peerId of peersRef.current.keys()) applyOutputMute(peerId)
  }, [deafened, mutedPeers, applyOutputMute])

  // Persistance du mute ciblé.
  useEffect(() => {
    try {
      window.localStorage.setItem(MUTED_PEERS_KEY, JSON.stringify([...mutedPeers]))
    } catch {
      /* stockage indisponible */
    }
  }, [mutedPeers])

  // Un membre quitte la salle (départ, expulsion AFK…) → couper sa connexion.
  useEffect(() => {
    if (!joined) return
    const memberIds = new Set(members.map((m) => m.userId))
    for (const peerId of [...peersRef.current.keys()]) {
      if (!memberIds.has(peerId)) closePeer(peerId)
    }
    setRoster((prev) => {
      const next = new Set([...prev].filter((id) => memberIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [members, joined, closePeer])

  // Indicateur « en train de parler » (RMS par flux, soi inclus).
  useEffect(() => {
    if (!joined) return
    const buf = new Uint8Array(128)
    const timer = setInterval(() => {
      const next: Record<string, boolean> = {}
      for (const [id, analyser] of analysersRef.current) {
        analyser.getByteTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i += 1) {
          const v = (buf[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / buf.length)
        const mutedLocally = id === selfId ? micMutedRef.current : mutedPeersRef.current.has(id)
        next[id] = rms > SPEAKING_THRESHOLD && !mutedLocally
      }
      setSpeaking((prev) => {
        const keys = new Set([...Object.keys(prev), ...Object.keys(next)])
        for (const k of keys) if (Boolean(prev[k]) !== Boolean(next[k])) return next
        return prev
      })
    }, SPEAKING_POLL_MS)
    return () => clearInterval(timer)
  }, [joined, selfId])

  // Quitter proprement au démontage ou au changement de salle.
  const leaveRef = useRef(leave)
  leaveRef.current = leave
  useEffect(() => {
    return () => leaveRef.current()
  }, [roomId])

  const toggleMic = useCallback(() => setMicMuted((v) => !v), [])
  const toggleDeafen = useCallback(() => setDeafened((v) => !v), [])
  const toggleMutePeer = useCallback((peerId: string) => {
    setMutedPeers((prev) => {
      const next = new Set(prev)
      if (next.has(peerId)) next.delete(peerId)
      else next.add(peerId)
      return next
    })
  }, [])

  return {
    supported,
    joined,
    joining,
    error,
    micMuted,
    deafened,
    mutedPeers,
    roster,
    speaking,
    peerStatus,
    join,
    leave,
    toggleMic,
    toggleDeafen,
    toggleMutePeer,
  }
}
