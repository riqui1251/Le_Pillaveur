"use client"

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { motion, useReducedMotion } from 'framer-motion'
import { Bomb, Flag, Gavel, Hand, Loader2, Moon, Send, Trophy, Volume2, VolumeX, WifiOff } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { useAdvanceTick } from '@/hooks/useBotReferee'
import { useGameAction } from '@/hooks/useGameAction'
import { useGameSounds } from '@/hooks/useGameSounds'
import { useConfirmAction } from '@/components/game/ConfirmActionDialog'
import { TurnBanner } from '@/components/game/TurnBanner'
import { Button } from '@/components/ui/button'
import { PlayingCard } from '@/components/ui/PlayingCard'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { botAvatarFromName } from '@/lib/online/bot-personas'
import { isSoundMuted, playGameSound } from '@/lib/sound/game-sounds'
import { cn } from '@/lib/utils'
import {
  PC_EXPLOSION_POINTS,
  PC_EXPLOSION_SIPS,
  PC_FUSE_RANGES_S,
  PC_PENALTY_POINTS,
  PC_PENALTY_SIPS,
  PC_UNLIMITED_ROUNDS,
  PC_WORD_MAX_LENGTH,
  isLastRound,
  pcTally,
  ranking,
  type PcChallenge,
  type PcRankingEntry,
} from '@/lib/patate-chaude/engine'
import {
  isPcSetAside,
  isPcTableTooSmall,
  pcEndStandings,
  type PcClientView,
  type PcEndRow,
  type PcOnlinePlayer,
} from '@/lib/patate-chaude/online-shared'
import { BombArt, BoomBurst } from '@/app/[locale]/games/patate-chaude/components/bomb'
import { useFuseTicker } from '@/app/[locale]/games/patate-chaude/components/fuse-ticker'
import { GameOnlineLobby } from './GameOnlineLobby'
import { OnlineActionBar, onlineActionBarPadding } from './OnlineActionBar'
import { OnlineEndScreen } from './OnlineEndScreen'
import { PhaseCountdown } from './PhaseCountdown'
import { PhaseCountdownLaunch } from './PhaseCountdownLaunch'
import { PhaseHeader } from './PhaseHeader'
import { XpGainBanner } from './XpGainBanner'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, useMemberCosmetics, type MemberCosmetics } from './OnlinePlayerTag'

/**
 * PATATE CHAUDE en ligne (serveur-autoritaire). Chacun joue sur son téléphone : le porteur tape
 * un mot et l'envoie, la bombe file chez le suivant. La mèche est secrète, même pour ce
 * composant : le BOUM arrive par le serveur (tick de service), jamais d'un minuteur local. Le
 * tic-tac accélère sur l'allumage public et la borne haute de la plage ; il ne sonne que chez le
 * porteur (des téléphones voisins désaccordés feraient un vacarme), la bombe bat chez tous.
 *
 * Gorgées ou points de pénalité : chaque téléphone affiche selon SA propre ambiance, à partir
 * des compteurs neutres de l'état (explosions, pénalités).
 *
 * Contester : tout joueur actif sauf l'auteur du mot et le porteur (qui gagnerait à le rayer),
 * dès que la table compte assez de votants (`contestThreshold` non nul). Terminer : tout joueur
 * actif, après confirmation. Mis de côté pour inactivité : « Je suis là » le remet en jeu.
 */

function parseView(json: string | null | undefined): PcClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as PcClientView
    return Array.isArray(v.players) && typeof v.phase === 'string' && v.game && Array.isArray(v.game.words)
      ? v
      : null
  } catch {
    return null
  }
}

const HEADER_BUTTON = 'border border-gold/20 bg-felt-deep/60 text-cream/80 hover:bg-gold/10 hover:text-gold'
const BOOM_VIBRATION_MS = [220, 90, 420]

// leading-* APRÈS la taille : dans cn(), tailwind-merge efface un interlignage posé avant un text-<taille>.
const CHALLENGE_VALUE_CLASS: Record<PcChallenge['kind'], string> = {
  theme: 'text-2xl leading-tight sm:text-3xl',
  letter: 'text-7xl leading-none',
  syllable: 'text-6xl leading-none tracking-wide',
}

type Ambiance = { soft: boolean }

export function PatateChaudeOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.patate-chaude')
  const tc = useTranslations('common')
  const format = useFormatter()
  const reduceMotion = useReducedMotion()
  const { mode: ambianceMode } = useAmbianceMode()
  const soft = ambianceMode === 'soft'
  const { busy, actionError, sendAction: postAction } = useGameAction(room?.id)
  const [confirmDialog, confirm] = useConfirmAction()
  const { muted, toggleMuted } = useGameSounds()
  const [word, setWord] = useState('')
  const [liveText, setLiveText] = useState('')
  const bombRef = useRef<HTMLDivElement>(null)
  const previousRef = useRef<PcClientView | null>(null)
  /** Mèche (phaseKey) pour laquelle le serveur sait déjà que ce porteur joue malgré un mot refusé. */
  const attemptKeyRef = useRef<string | null>(null)

  const inGame = room?.gameId === 'patate-chaude' && room.status === 'playing'
  const tutorial = useGameTutorial('patate-chaude', inGame)
  const cosmetics = useMemberCosmetics(room)
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const live = Boolean(view && user && room && view.phase !== 'finished')
  const burning = view?.phase === 'burning'
  const isHolder = Boolean(burning && user && view?.game.holder === user.id)

  // Échéances PUBLIQUES (compte à rebours, écran du BOUM) : arbitrées par rang. La mèche, elle,
  // n'a pas d'échéance visible : seul le serveur la fait exploser.
  useAdvanceTick({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: live,
    advance:
      view && !burning && view.phaseEndsAt !== null ? { phaseKey: view.phaseKey, dueAt: view.phaseEndsAt } : null,
  })

  const holderRef = useRef(false)
  holderRef.current = isHolder
  useFuseTicker({
    active: Boolean(burning),
    roundStartedAt: burning ? (view?.game.roundStartedAt ?? null) : null,
    maxFuseMs: view?.maxFuseMs ?? 0,
    onTick: () => {
      if (holderRef.current) playGameSound('tick')
      const el = bombRef.current
      if (reduceMotion || !el || typeof el.animate !== 'function') return
      el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], {
        duration: 160,
        easing: 'ease-out',
      })
    },
  })

  // Nouvelle manche : on repart d'un champ vide (un mot du défi précédent n'a plus de sens).
  const phaseKey = view?.phaseKey
  useEffect(() => {
    setWord('')
  }, [phaseKey])

  // Ce qui vient d'arriver, dit une fois : son, vibration, annonce au lecteur d'écran. Jamais au
  // premier affichage (arrivée, reconnexion) : seulement d'une vue à la suivante.
  useEffect(() => {
    const previous = previousRef.current
    previousRef.current = view
    if (!view || !previous || previous === view || !user) return
    const nameOf = (id: string | null | undefined) => view.players.find((p) => p.id === id)?.name ?? ''
    const game = view.game
    if (previous.phase === 'burning' && view.phase === 'boom' && game.lastBoom) {
      const loser = game.lastBoom.playerId
      playGameSound('boom')
      if (loser === user.id && !isSoundMuted()) {
        try {
          navigator.vibrate?.(BOOM_VIBRATION_MS)
        } catch {
          // vibration refusée ou absente (iPhone) : l'écran rouge suffit
        }
      }
      const verdict = soft
        ? t('soft.verdict', { name: nameOf(loser), count: PC_EXPLOSION_POINTS })
        : t('boom.verdict', { name: nameOf(loser), count: PC_EXPLOSION_SIPS })
      setLiveText(t('boom.live', { name: nameOf(loser), verdict }))
      return
    }
    if (previous.phase !== 'burning' && view.phase === 'burning' && game.challenge) {
      const challenge = t(`game.announce.${game.challenge.kind}`, { value: game.challenge.value })
      setLiveText(t('game.liveLit', { challenge, name: nameOf(game.holder) }))
      return
    }
    if (!isPcSetAside(previous, user.id) && isPcSetAside(view, user.id)) {
      setLiveText(t('online.asideMine'))
      return
    }
    if (previous.phase === 'boom' && view.phase === 'ready') {
      setLiveText(t('game.liveReady', { name: nameOf(game.holder) }))
      return
    }
    if (previous.phase !== 'burning' || view.phase !== 'burning') return
    const struckBefore = previous.game.words.filter((w) => w.struck).length
    const struck = game.words.filter((w) => w.struck)
    if (struck.length > struckBefore) {
      playGameSound('skip')
      const last = struck[struck.length - 1]
      setLiveText(
        t(soft ? 'soft.struck' : 'online.struck', {
          word: last.word,
          name: nameOf(last.player),
          count: soft ? PC_PENALTY_POINTS : PC_PENALTY_SIPS,
        })
      )
      return
    }
    if (previous.game.holder !== game.holder) setLiveText(t('game.liveHolder', { name: nameOf(game.holder) }))
  }, [view, user, soft, t])

  if (!inGame) {
    return <GameOnlineLobby gameId="patate-chaude" />
  }

  if (!view || !user || !room) {
    return (
      <div role="status" className="flex flex-1 items-center justify-center p-6">
        <Loader2 aria-hidden className="h-8 w-8 text-gold motion-safe:animate-spin" />
        <span className="sr-only">{tc('loading')}</span>
      </div>
    )
  }

  const game = view.game
  const ambiance: Ambiance = { soft }
  const playerOf = (id: string | null | undefined) => view.players.find((p) => p.id === id)
  const nameOf = (id: string | null | undefined) => playerOf(id)?.name ?? ''
  const iconOf = (p: PcOnlinePlayer) =>
    p.isBot ? botAvatarFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'
  const unlimited = game.settings.rounds === PC_UNLIMITED_ROUNDS
  const amActive = game.playerIds.includes(user.id) && !game.absent.includes(user.id)
  const amAside = isPcSetAside(view, user.id)
  const asideOf = (p: PcOnlinePlayer) => isPcSetAside(view, p.id)
  // Un départ a laissé moins de deux joueurs : la partie s'arrête à l'échéance (immédiate).
  const closing = view.phase === 'ready' && isPcTableTooSmall(view)

  // Saisies partagées avec les autres (contestation, fin) : sans verrou de version, un seul
  // renvoi si une écriture concurrente l'a fait échouer (le 409 est muet).
  const sendUnlocked = async (body: Record<string, unknown>) => {
    const res = await postAction(body)
    return res?.status === 409 ? postAction(body) : res
  }

  // ── Écran de fin ──────────────────────────────────────────────────────────
  if (view.phase === 'finished') {
    // Rangs et victoire entre les joueurs encore à la table : un parti ne gagne jamais.
    const rows = pcEndStandings(view)
    // Simple virgule plutôt qu'Intl.ListFormat, absent des vieux navigateurs (TV, Safari < 14.1).
    const winners = rows.filter((row) => row.won).map((row) => nameOf(row.playerId))
    return (
      <OnlineEndScreen
        rematchVotes={view.rematchVotes ?? []}
        onRematch={voteRematch}
        onLeave={leaveRoom}
        header={
          <motion.div
            initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 18 }}
            className="flex flex-col items-center gap-2 text-center"
          >
            <Trophy aria-hidden className="h-14 w-14 text-gold" />
            <h2 className="font-display text-3xl font-bold text-gold">{t('end.title')}</h2>
            {winners.length > 0 && (
              <p className="text-base text-cream/80">{t('end.winners', { count: winners.length, names: winners.join(', ') })}</p>
            )}
          </motion.div>
        }
        ranking={
          <div className="w-full max-w-sm">
            <Standings
              title={t('end.ranking')}
              rows={rows}
              players={view.players}
              userId={user.id}
              iconOf={iconOf}
              asideOf={asideOf}
              cosmetics={cosmetics}
              ambiance={ambiance}
              showRank
            />
          </div>
        }
        // Participation seule : « le moins d'explosions » désigne souvent la moitié de la table.
        xp={<XpGainBanner won={false} playerIds={view.players.map((p) => p.id)} className="w-full max-w-sm" />}
      />
    )
  }

  // ── Partie en cours ───────────────────────────────────────────────────────
  const holder = playerOf(game.holder)
  const nextName = nameOf(view.nextHolderId)
  const challenge = burning ? game.challenge : null
  const boom = view.phase === 'boom' ? game.lastBoom : null
  const loser = boom ? playerOf(boom.playerId) : undefined
  const openIndex = burning ? game.openWord : null
  const openWord = openIndex !== null ? game.words[openIndex] : undefined
  const contestable = Boolean(openWord && !openWord.struck && view.contestThreshold !== null)
  const iContested = game.contests.includes(user.id)
  // Ni l'auteur du mot, ni le porteur : celui à qui on vient de le passer gagnerait à le rayer.
  const canContest = contestable && amActive && !isHolder && openWord?.player !== user.id && !iContested
  const lastWord = game.words.length > 0 ? game.words[game.words.length - 1] : undefined
  const struckNotice = burning && lastWord?.struck ? lastWord : undefined
  const fuseRange = PC_FUSE_RANGES_S[game.settings.fuse]
  const fuseInfo = t('online.fuseInfo', { min: fuseRange.min, max: fuseRange.max })
  const lastRound = isLastRound(game)

  const roundLabel = unlimited
    ? t('game.round', { current: game.roundIndex + 1 })
    : t('game.roundOf', { current: game.roundIndex + 1, total: game.settings.rounds })
  const phaseTitle = closing
    ? t('end.title')
    : view.phase === 'ready'
      ? t('online.phase.ready')
      : burning
        ? t('online.phase.burning')
        : t('boom.title')

  const sendWord = async (event: FormEvent) => {
    event.preventDefault()
    const value = word.trim()
    if (!value || busy) return
    // Dans le geste : iOS n'ouvre l'audio qu'au toucher, le tic-tac en profitera ensuite.
    playGameSound('step')
    const key = view.phaseKey
    const res = await postAction({ action: 'pass', word: value })
    if (res?.ok) {
      setWord('')
      return
    }
    // Mot refusé : le serveur n'écrit rien d'un refus. Sans ce signe (une fois par mèche), un
    // BOUM juste après compterait comme une absence, et deux le mettraient de côté.
    if (res?.status === 403 && attemptKeyRef.current !== key) {
      attemptKeyRef.current = key
      void postAction({ action: 'attempt' })
    }
  }

  const contestOpenWord = () => {
    if (openIndex === null) return
    void sendUnlocked({ action: 'contest', index: openIndex })
  }

  const resume = () => {
    void sendUnlocked({ action: 'resume' })
  }

  const askEnd = async () => {
    const ok = await confirm({
      title: t('online.endConfirm.title'),
      description: t('online.endConfirm.description'),
      confirmLabel: t('online.endConfirm.confirm'),
      cancelLabel: t('online.endConfirm.cancel'),
      tone: 'danger',
    })
    if (ok) void sendUnlocked({ action: 'end' })
  }

  const contestLabel = openWord ? t('online.contest', { word: openWord.word }) : t('online.contestShort')
  const hasBar = Boolean(burning && (isHolder || canContest))
  const errorLine = actionError ? <span className="font-semibold text-red-300">{actionError}</span> : null

  const headerRight = (
    <>
      <Button
        variant="ghost"
        size="gameIcon"
        onClick={toggleMuted}
        aria-label={muted ? t('game.soundOn') : t('game.soundOff')}
        className={HEADER_BUTTON}
      >
        {muted ? <VolumeX aria-hidden className="h-5 w-5" /> : <Volume2 aria-hidden className="h-5 w-5" />}
      </Button>
      <TutorialReopenButton onClick={tutorial.reopen} className="h-11 w-11" />
    </>
  )

  return (
    <>
      {confirmDialog}
      <div
        className={cn(
          'flex flex-1 flex-col gap-3 p-3 sm:mx-auto sm:w-full sm:max-w-lg',
          burning ? onlineActionBarPadding('tall') : 'pb-6'
        )}
      >
        {/* Une seule voix pour le lecteur d'écran, montée en permanence. */}
        <p role="status" aria-live="polite" className="sr-only">
          {liveText}
        </p>

        {/* Pas de chrono d'en-tête : le compte à rebours et l'écran du BOUM ont le leur, et la
            mèche n'en a pas (elle est secrète). */}
        <PhaseHeader
          round={roundLabel}
          phase={phaseTitle}
          right={headerRight}
          status={burning ? `${t('game.passes', { count: game.passes })} · ${fuseInfo}` : fuseInfo}
        />
        {tutorial.open && <GameTutorialModal gameId="patate-chaude" onClose={tutorial.close} />}

        {amAside && (
          <section className="flex flex-col items-center gap-3 rounded-2xl border border-gold/40 bg-gold/10 p-4 text-center">
            <p className="flex items-center gap-2 text-base font-semibold text-cream">
              <Moon aria-hidden className="h-5 w-5 shrink-0 text-gold" />
              {t('online.asideMine')}
            </p>
            <Button variant="primary" size="game" disabled={busy} onClick={resume} className="w-full sm:w-auto">
              <Hand aria-hidden className="mr-2 h-5 w-5" />
              {t('online.resume')}
            </Button>
          </section>
        )}

        {view.phase === 'ready' &&
          (closing ? (
            <section className="flex flex-col items-center gap-3 py-6 text-center">
              <BombArt lit={false} className="h-24 w-24" />
              <p className="max-w-sm font-display text-2xl font-bold text-cream">{t('online.notEnough')}</p>
            </section>
          ) : (
            <section className="flex flex-col items-center gap-3 py-2 text-center">
              <PhaseCountdownLaunch
                endsAt={view.phaseEndsAt}
                className="font-display text-8xl font-bold tabular-nums text-cream"
              />
              <BombArt lit={false} className="h-24 w-24" />
              {holder && (
                <div className="flex min-w-0 max-w-full items-center gap-3">
                  <span aria-hidden className="shrink-0 text-3xl leading-none">
                    <PlayerAvatarGlyph value={iconOf(holder)} />
                  </span>
                  <p className="min-w-0 break-words font-display text-2xl font-bold text-cream">
                    {holder.id === user.id
                      ? t('online.startsMine')
                      : game.roundIndex === 0
                        ? t('online.startsWith', { name: holder.name })
                        : t('online.startsAgain', { name: holder.name })}
                  </p>
                </div>
              )}
              <p className="max-w-sm text-sm text-cream/80">{t('online.readyHint')}</p>
            </section>
          ))}

        {burning && (
          <>
            {challenge && (
              <PlayingCard corners={false} className="w-full px-5 py-4 text-center">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#24201A]/70">
                  {t(`game.kinds.${challenge.kind}`)}
                </p>
                <p className={cn('mt-1 break-words font-display font-extrabold', CHALLENGE_VALUE_CLASS[challenge.kind])}>
                  {challenge.value}
                </p>
              </PlayingCard>
            )}

            <div className="flex items-center justify-center gap-4">
              <BombArt ref={bombRef} lit className="h-24 w-24 shrink-0" />
              <p aria-hidden className="font-display text-sm italic tracking-[0.06em] text-cream/70">
                {t('game.tickTock')}
              </p>
            </div>

            {holder && (
              <TurnBanner
                mine={isHolder}
                name={holder.name}
                avatar={<PlayerAvatarGlyph value={iconOf(holder)} />}
                hint={isHolder ? t('online.mineHint', { name: nextName }) : t('online.theirHint')}
                alertOnMine
              />
            )}

            {struckNotice && (
              <p className="rounded-xl bg-suit-red px-3 py-2 text-center text-sm font-semibold text-cream">
                {t(soft ? 'soft.struck' : 'online.struck', {
                  word: struckNotice.word,
                  name: nameOf(struckNotice.player),
                  count: soft ? PC_PENALTY_POINTS : PC_PENALTY_SIPS,
                })}
              </p>
            )}

            <section aria-labelledby="pc-said" className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
              <h3 id="pc-said" className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">
                {t('online.said')}
              </h3>
              {game.words.length === 0 ? (
                <p className="text-sm text-cream/70">{t('online.saidEmpty', { name: holder?.name ?? '' })}</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {game.words.map((said, index) => {
                    const author = playerOf(said.player)
                    const open = index === openIndex && !said.struck
                    return (
                      <li
                        key={`${index}-${said.word}`}
                        className={cn(
                          'inline-flex min-h-[2rem] max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-semibold',
                          said.struck
                            ? 'border-red-300/40 text-red-300'
                            : open
                              ? 'border-gold bg-gold/10 text-cream'
                              : 'border-cream/20 bg-black/20 text-cream/90'
                        )}
                      >
                        <span className={cn('min-w-0 break-words', said.struck && 'line-through')}>{said.word}</span>
                        {/* Le nom en clair : tous les comptes démarrent avec la même icône. */}
                        {author && (
                          <span aria-hidden className="flex min-w-0 items-center gap-1 text-xs font-normal opacity-80">
                            <span className="shrink-0 leading-none">
                              <PlayerAvatarGlyph value={iconOf(author)} />
                            </span>
                            <span className="max-w-[5.5rem] truncate">{author.name}</span>
                          </span>
                        )}
                        <span className="sr-only">
                          {`, ${t('online.saidBy', { name: author?.name ?? '' })}`}
                          {said.struck ? `, ${t('online.struckTag')}` : ''}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
              {contestable && openWord && view.contestThreshold !== null && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gold/10 pt-3">
                  <p className="min-w-0 flex-1 text-sm text-cream/80">
                    {game.contests.length > 0
                      ? t('online.contestCount', { count: game.contests.length, total: view.contestThreshold })
                      : // L'appel à contester, seulement à qui a le bouton : ni l'auteur, ni le porteur, ni un absent.
                        t(canContest ? 'online.contestHint' : 'online.contestHintOthers', {
                          total: view.contestThreshold,
                        })}
                  </p>
                  {iContested && (
                    <span className="shrink-0 rounded-full border border-gold/40 px-3 py-1 text-xs font-bold text-gold">
                      {t('online.contested')}
                    </span>
                  )}
                </div>
              )}
            </section>
          </>
        )}

        {boom && (
          <motion.section
            initial={reduceMotion ? false : { scale: 0.9, opacity: 0 }}
            animate={reduceMotion ? undefined : { scale: 1, opacity: 1, x: [0, -10, 9, -6, 4, 0] }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="relative flex min-h-[min(40vh,20rem)] flex-col items-center justify-center gap-3 overflow-hidden rounded-3xl bg-suit-red px-4 py-8 text-center text-cream shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)]"
          >
            <BoomBurst />
            <p className="relative font-display text-6xl font-extrabold leading-none tracking-tight [text-shadow:0_4px_0_rgb(0_0_0/0.25)]">
              {t('boom.title')}
            </p>
            {loser && (
              <div className="relative flex max-w-full items-center gap-2 text-base font-semibold">
                <span aria-hidden className="shrink-0 text-2xl leading-none">
                  <PlayerAvatarGlyph value={iconOf(loser)} />
                </span>
                <span className="min-w-0 truncate">{t('boom.holder', { name: loser.name })}</span>
              </div>
            )}
            <p className="relative rounded-2xl bg-black/25 px-4 py-2 font-display text-xl font-bold leading-tight lining-nums">
              {soft
                ? t('soft.verdict', { name: nameOf(boom.playerId), count: PC_EXPLOSION_POINTS })
                : t('boom.verdict', { name: nameOf(boom.playerId), count: PC_EXPLOSION_SIPS })}
            </p>
            <div className="relative flex flex-wrap justify-center gap-2 text-xs">
              <span className="rounded-full bg-black/20 px-3 py-1">
                {t('boom.fuse')}{' '}
                <b className="tabular-nums">{t('boom.fuseValue', { seconds: Math.round(boom.fuseMs / 1000) })}</b>
              </span>
              <span className="rounded-full bg-black/20 px-3 py-1">
                {t('boom.passes')} <b className="tabular-nums">{format.number(boom.passes)}</b>
              </span>
            </div>
            <p className="relative text-sm font-semibold text-cream/90">
              <PhaseCountdown endsAt={view.phaseEndsAt}>
                {({ seconds }) =>
                  lastRound
                    ? t('online.rankingIn', { seconds: Math.max(1, seconds) })
                    : t('online.nextRoundIn', { seconds: Math.max(1, seconds) })
                }
              </PhaseCountdown>
            </p>
          </motion.section>
        )}

        {(view.phase === 'boom' || (view.phase === 'ready' && game.roundIndex > 0) || burning) && (
          <Standings
            title={t('game.standings')}
            rows={ranking(game)}
            players={view.players}
            userId={user.id}
            iconOf={iconOf}
            asideOf={asideOf}
            cosmetics={cosmetics}
            ambiance={ambiance}
            compact={burning}
          />
        )}

        {!hasBar && errorLine && (
          <p role="alert" className="text-center text-sm">
            {errorLine}
          </p>
        )}

        {/* Tout joueur actif peut arrêter la partie (le serveur l'accepte de chacun) : un hôte au
            téléphone verrouillé ne retient plus une partie illimitée. Confirmation d'abord. */}
        {amActive && !closing && (
          <Button variant="quiet" size="game" className="w-full" disabled={busy} onClick={() => void askEnd()}>
            <Flag aria-hidden className="mr-2 h-4 w-4" />
            {t('online.endGame')}
          </Button>
        )}
      </div>

      {hasBar && (
        <OnlineActionBar status={errorLine} maxWidthClass="max-w-lg">
          {isHolder ? (
            <form className="flex gap-2" onSubmit={(event) => void sendWord(event)}>
              {/* Jamais désactivé pendant l'envoi : un champ désactivé perd le focus et le
                  clavier du téléphone se refermerait à chaque mot. */}
              <input
                value={word}
                onChange={(event) => setWord(event.target.value)}
                maxLength={PC_WORD_MAX_LENGTH}
                placeholder={t('online.wordPlaceholder')}
                aria-label={t('online.wordLabel')}
                aria-invalid={actionError ? true : undefined}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="send"
                autoFocus
                // text-base : sous 16 px, iOS zoome sur le champ au toucher.
                className="h-12 min-w-0 flex-1 rounded-xl border border-cream/[0.25] bg-black/30 px-4 text-base font-semibold text-cream placeholder:text-cream/60 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
              {/* mousedown sans effet : toucher « Envoyer » garde le focus, le clavier reste ouvert. */}
              <Button
                type="submit"
                variant="primary"
                size="game"
                disabled={busy || !word.trim()}
                onMouseDown={(event) => event.preventDefault()}
                className="shrink-0 gap-1.5"
              >
                {busy ? (
                  <Loader2 aria-hidden className="h-5 w-5 motion-safe:animate-spin" />
                ) : (
                  <Send aria-hidden className="h-5 w-5" />
                )}
                {tc('send')}
              </Button>
            </form>
          ) : (
            <Button variant="danger" size="gameLg" className="w-full" disabled={busy} onClick={contestOpenWord}>
              <Gavel aria-hidden className="mr-2 h-5 w-5 shrink-0" />
              <span className="min-w-0 truncate">{contestLabel}</span>
            </Button>
          )}
        </OnlineActionBar>
      )}
    </>
  )
}

/** Explosions de la table, du moins exposé au plus exposé ; gorgées ou points selon l'ambiance du téléphone. */
function Standings({
  title,
  rows,
  players,
  userId,
  iconOf,
  asideOf,
  cosmetics,
  ambiance,
  showRank = false,
  compact = false,
}: {
  title: string
  /** En fin de partie, les lignes de pcEndStandings : un parti (`left`) n'a ni rang ni or. */
  rows: readonly (PcRankingEntry | PcEndRow)[]
  players: PcOnlinePlayer[]
  userId: string
  iconOf: (p: PcOnlinePlayer) => string
  /** Mis de côté pour inactivité (sauté par la bombe, toujours à la table). */
  asideOf: (p: PcOnlinePlayer) => boolean
  cosmetics: Map<string, MemberCosmetics>
  ambiance: Ambiance
  showRank?: boolean
  compact?: boolean
}) {
  const t = useTranslations('games.patate-chaude')
  const tc = useTranslations('common')
  const format = useFormatter()
  return (
    <section className="w-full rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
      <h3 className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">{title}</h3>
      <ol className={compact ? 'space-y-1' : 'space-y-1.5'}>
        {rows.map((row) => {
          const player = players.find((p) => p.id === row.playerId)
          if (!player) return null
          const aside = asideOf(player)
          const left = Boolean(player.leftAt)
          const mine = player.id === userId
          const penalties = !compact && row.penalties > 0
          return (
            <li
              key={row.playerId}
              className={cn(
                'flex items-center gap-2 rounded-xl px-3',
                compact ? 'py-1.5' : 'py-2',
                showRank && row.won ? 'border border-gold/60 bg-gold/[0.15]' : 'bg-black/20',
                (left || aside) && 'opacity-60'
              )}
            >
              {showRank && (
                <span className="w-6 shrink-0 text-center font-display text-lg font-bold tabular-nums lining-nums text-gold">
                  {'left' in row && row.left ? '' : format.number(row.rank)}
                </span>
              )}
              <span aria-hidden className="shrink-0 text-xl leading-none">
                <PlayerAvatarGlyph value={iconOf(player)} />
              </span>
              {/* Le nom a sa ligne, deux au besoin ; « toi », l'état et les pénalités passent dessous.
                  Sur la même ligne qu'eux, à 375 px, il tombait à deux lettres. */}
              <span className="flex min-w-0 flex-1 flex-col">
                <OnlinePlayerName
                  name={player.name}
                  cosmetics={cosmetics.get(player.id)}
                  className="line-clamp-2 break-words text-sm font-semibold leading-tight text-cream"
                />
                {(mine || left || aside || penalties) && (
                  <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-cream/70">
                    {mine && <span>{t('online.you')}</span>}
                    {left && (
                      <>
                        <WifiOff aria-hidden className="h-3.5 w-3.5 shrink-0" />
                        <span className="sr-only">{t('online.leftTag')}</span>
                      </>
                    )}
                    {aside && (
                      <>
                        <Moon aria-hidden className="h-3.5 w-3.5 shrink-0" />
                        <span className="sr-only">{t('online.asideTag')}</span>
                      </>
                    )}
                    {penalties && <span>{t('end.penalties', { count: row.penalties })}</span>}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums text-cream/80">
                <Bomb aria-hidden className="h-4 w-4 text-gold" />
                <span aria-hidden>{format.number(row.explosions)}</span>
                <span className="sr-only">{t('game.explosions', { count: row.explosions })}</span>
              </span>
              <span className="w-[5.5rem] shrink-0 text-right font-display text-sm font-bold tabular-nums lining-nums text-gold">
                {ambiance.soft
                  ? t('soft.points', { count: pcTally(row, 'soft') })
                  : tc('sipsCount', { count: pcTally(row, 'alcool') })}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
