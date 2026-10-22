"use client"

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Ban, Check, Loader2, Send, Trophy } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { OnlineEndScreen } from './OnlineEndScreen'
import { OnlineActionBar, onlineActionBarPadding } from './OnlineActionBar'
import { PhaseCountdown } from './PhaseCountdown'
import { PhaseCountdownLaunch } from './PhaseCountdownLaunch'
import { PhaseHeader } from './PhaseHeader'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  BLUFF_FAKE_MAX_LEN,
  BLUFF_SUBMIT_MS,
  BLUFF_VOTE_MS,
  type BluffClientView,
} from '@/lib/bluff/engine'
import { botAvatarFromName, botTickDelayMs } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { useAdvanceTick, useBotReferee } from '@/hooks/useBotReferee'
import { useGameAction } from '@/hooks/useGameAction'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, useMemberCosmetics } from './OnlinePlayerTag'
import { XpGainBanner } from './XpGainBanner'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'

/**
 * LE GRAND BLUFF en ligne (serveur-autoritaire). Vue déjà filtrée : les
 * bluffs des autres n'arrivent jamais avant le reveal, les candidats de vote
 * sont anonymisés (`voteOptions`, jamais `isReal`/`authorId`). `submit` et
 * `vote` sont des phases SIMULTANÉES — pas de « tour » individuel, juste une
 * échéance commune (tick `advance`), donc pas de TurnBanner.
 */

function parseView(json: string | null | undefined): BluffClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as BluffClientView
    return Array.isArray(v.players) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

/** Pastille d'état d'une réponse (« Ton vote », « Ton bluff ») : signe + texte, jamais la couleur seule. */
function AnswerTag({ icon, children, tone }: { icon: 'check' | 'ban'; children: string; tone: 'gold' | 'plain' }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold',
        tone === 'gold' ? 'bg-gold text-[#24201A]' : 'border border-cream/30 text-cream'
      )}
    >
      {icon === 'check' ? <Check aria-hidden className="h-3.5 w-3.5" /> : <Ban aria-hidden className="h-3.5 w-3.5" />}
      {children}
    </span>
  )
}

export function BluffOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom, fetchRoom } = useOnlineRoom()
  const t = useTranslations('games.bluff.game')
  const tc = useTranslations('common')
  const reduceMotion = useReducedMotion()
  const { busy: posting, actionError, sendAction: postAction } = useGameAction(room?.id)
  // Relecture de la salle entre deux essais d'une intention (cf. sendIntent) :
  // le hook n'est plus « occupé », mais le geste n'est pas fini.
  const [retrying, setRetrying] = useState(false)
  const busy = posting || retrying
  const [fakeInput, setFakeInput] = useState('')
  // Vote en deux temps : le toucher SÉLECTIONNE une réponse, le bouton de la
  // barre l'envoie — le moteur refuse tout second vote (ALREADY_VOTED).
  const [pick, setPick] = useState<string | null>(null)
  const [sending, setSending] = useState<string | null>(null)

  const inGame = room?.gameId === 'bluff' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const tutorial = useGameTutorial('bluff', inGame)
  const cosmetics = useMemberCosmetics(room)

  // ÉCHÉANCE DE PHASE : tick « advance » arbitré par rang (cf. useAdvanceTick)
  // — le rang 0 tire à l'échéance, le suivant prend le relais 4 s plus tard si
  // son téléphone est verrouillé, et la version qui bouge coupe les autres.
  useAdvanceTick({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    advance:
      view && view.phaseEndsAt !== null ? { phaseKey: view.phaseKey, dueAt: view.phaseEndsAt } : null,
  })

  // Ticks « arbitre » (bots en attente + remplacement), avec secours par rang
  // (cf. useBotReferee). submit/vote sont simultanés → pas d'acteur unique.
  const pendingBot =
    view?.phase === 'submit'
      ? view.players.find((p) => p.isBot && !p.hasSubmitted)
      : view?.phase === 'vote'
        ? view.players.find((p) => p.isBot && !p.hasVoted)
        : undefined
  const revealActorIsBot = Boolean(
    view?.phase === 'reveal' && view.players.find((p) => p.id === room?.currentTurnUserId)?.isBot
  )
  useBotReferee({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    botTick:
      pendingBot || revealActorIsBot
        ? {
            body: { action: 'bot' },
            delayMs: view?.phase === 'reveal' ? 2500 : botTickDelayMs(pendingBot?.name),
          }
        : null,
    replaceLeft: Boolean(view?.players.some((p) => !p.isBot && p.leftAt)),
  })

  // Champ et sélection repartent à zéro à chaque nouvelle PHASE, pas à chaque
  // version : chaque bluff ou vote d'un autre joueur fait monter la version,
  // et effaçait la phrase qu'on était en train de taper.
  const phaseKey = view?.phaseKey
  useEffect(() => {
    setFakeInput('')
    setPick(null)
  }, [phaseKey])

  if (!inGame) {
    return <GameOnlineLobby gameId="bluff" />
  }

  if (!view || !user || !room) {
    return (
      <div role="status" className="flex flex-1 items-center justify-center p-6">
        <Loader2 aria-hidden className="h-8 w-8 text-gold motion-safe:animate-spin" />
        <span className="sr-only">{tc('loading')}</span>
      </div>
    )
  }

  const finished = view.phase === 'finished'
  const reveal = view.lastReveal

  const nameOf = (id: string | null | undefined) =>
    view.players.find((p) => p.id === id)?.name ?? '—'
  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botAvatarFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'

  // Verrou de version conservé ; le hook lit la réponse et annonce les refus.
  const sendAction = (body: Record<string, unknown>) =>
    postAction({ ...body, expectedVersion: room.stateVersion })
  // Bluffs et votes sont SIMULTANÉS : celui d'un autre joueur (ou d'un bot)
  // arrivé entre-temps fait sauter le verrou, et le 409 est muet — le vote
  // validé dans la barre ne partait pas, sans un mot. On relit la salle et on
  // retente une fois si la phase n'a pas bougé : le moteur revalide tout, et
  // c'est la retentative qui parle si elle échoue.
  const sendIntent = async (body: Record<string, unknown>) => {
    const res = await sendAction(body)
    if (res?.status !== 409) return res
    setRetrying(true)
    try {
      const fresh = await fetchRoom()
      if (!fresh || parseView(fresh.gameStateJson)?.phaseKey !== view.phaseKey) return res
      return await postAction({ ...body, expectedVersion: fresh.stateVersion })
    } finally {
      setRetrying(false)
    }
  }

  const fakeTrimmed = fakeInput.trim()
  const fakeOk = fakeTrimmed.length > 0 && fakeTrimmed.length <= BLUFF_FAKE_MAX_LEN
  const totalPhaseMs = view.phase === 'submit' ? BLUFF_SUBMIT_MS : BLUFF_VOTE_MS
  const submittedCount = view.players.filter((p) => p.hasSubmitted).length
  const votedCount = view.players.filter((p) => p.hasVoted).length
  const total = view.players.length

  // ── Écran de fin ─────────────────────────────────────────────────────────
  if (finished) {
    const sorted = [...view.players].sort((a, b) => b.score - a.score)
    const won = view.winnerId === user.id
    return (
      <OnlineEndScreen
        confetti
        won={won}
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
            <h2 className="font-display text-3xl font-bold text-gold">
              {view.winnerId ? t('victory.winnerIs', { name: nameOf(view.winnerId) }) : t('victory.tie')}
            </h2>
          </motion.div>
        }
        ranking={
          <div className="w-full max-w-sm space-y-2">
            <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-gold">
              {t('victory.finalScore')}
            </p>
            {sorted.map((p, i) => (
              <div
                key={p.id}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border px-4 py-2.5',
                  p.id === view.winnerId ? 'border-gold/60 bg-gold/10' : 'border-gold/20 bg-felt-deep/70'
                )}
              >
                <span className="w-6 shrink-0 text-center text-sm font-bold tabular-nums text-cream/70">{i + 1}</span>
                <span className="text-xl" aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
                <span className="min-w-0 flex-1 truncate text-base font-bold">
                  <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
                </span>
                <span className="shrink-0 text-base font-black tabular-nums text-gold">{p.score}</span>
              </div>
            ))}
          </div>
        }
        xp={<XpGainBanner won={won} playerIds={view.players.map((p) => p.id)} className="w-full max-w-sm" />}
      />
    )
  }

  // ── Compte à rebours de lancement ────────────────────────────────────────
  if (view.phase === 'countdown') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-cream">
        <p className="font-display text-2xl font-bold text-gold">{t('countdown.title')}</p>
        <PhaseCountdownLaunch endsAt={view.phaseEndsAt} className="font-display text-8xl font-black tabular-nums text-cream" />
        <p className="text-sm text-cream/70">{t('countdown.hint')}</p>
      </div>
    )
  }

  // ── Partie en cours ──────────────────────────────────────────────────────
  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)
  const voting = view.phase === 'vote' && Boolean(view.voteOptions)
  const pickedOption = voting && pick ? view.voteOptions?.find((o) => o.candidateId === pick) : undefined
  const canSubmit = view.phase === 'submit' && !view.myFake
  const canVote = voting && !view.myVote

  const submitFake = () => {
    if (!fakeOk || busy) return
    void sendIntent({ action: 'submit-fake', text: fakeTrimmed })
  }

  const confirmVote = async () => {
    if (!pickedOption || busy) return
    setSending(pickedOption.candidateId)
    const res = await sendIntent({ action: 'vote', candidateId: pickedOption.candidateId })
    setSending(null)
    // Échec : la sélection reste, on peut renvoyer.
    if (res?.ok) setPick(null)
  }

  const phaseLabel =
    view.phase === 'submit' ? t('phaseTitle.submit') : view.phase === 'vote' ? t('phaseTitle.vote') : t('phaseTitle.reveal')

  // L'état sous le pouce : un refus du serveur d'abord (3 s), sinon où en est la table.
  const barStatus = actionError ? (
    <span className="font-semibold text-red-300">{actionError}</span>
  ) : view.phase === 'submit' ? (
    view.myFake ? t('submitted', { count: submittedCount, total }) : t('submitProgress', { count: submittedCount, total })
  ) : view.phase === 'vote' ? (
    view.myVote ? t('voted', { count: votedCount, total }) : t('voteProgress', { count: votedCount, total })
  ) : undefined

  return (
    <>
    <div className={cn('mx-auto flex w-full max-w-lg flex-1 flex-col gap-3 p-3 text-cream', onlineActionBarPadding('tall'))}>
      <PhaseHeader
        round={t('round', { n: view.promptIdx + 1, total: view.totalRounds })}
        phase={phaseLabel}
        endsAt={view.phaseEndsAt}
        total={totalPhaseMs}
        timerColorClassName="bg-rose-400"
        right={<TutorialReopenButton onClick={tutorial.reopen} className="h-11 w-11" />}
      />

      {/* Bannière retour */}
      {leftPlayer?.leftAt && (
        <div className="rounded-2xl border border-gold/30 bg-gold/10 px-4 py-2 text-center text-sm font-semibold text-cream">
          <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
            {({ seconds }) => t('waitingReturn', { name: leftPlayer.name, seconds })}
          </PhaseCountdown>
        </div>
      )}

      {/* Question + consigne de la phase */}
      {view.prompt && (
        <div className="rounded-2xl border border-rose-300/40 bg-felt-deep/70 px-4 py-3 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">{t('promptLabel')}</p>
          <p className="mt-1 break-words text-lg font-bold leading-snug">{view.prompt}</p>
          {canSubmit && <p className="mt-2 text-sm text-cream/80">{t('submitPrompt')}</p>}
          {canVote && <p className="mt-2 text-sm text-cream/80">{t('votePickHint')}</p>}
        </div>
      )}

      {/* Bluff envoyé : on le relit en entier, le champ est parti */}
      {view.phase === 'submit' && view.myFake && (
        <div className="rounded-2xl border border-gold/20 bg-felt-deep/70 px-4 py-3">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-gold">
            <Check aria-hidden className="h-4 w-4" />
            {t('myFakeLabel')}
          </p>
          <p className="mt-1 break-words text-base font-semibold leading-snug">{t('quoted', { text: view.myFake })}</p>
        </div>
      )}

      {/* Vote : choisir une réponse (texte entier), puis valider dans la barre */}
      {voting && (
        <ul className="space-y-2" aria-label={t('votePrompt')}>
          {view.voteOptions!.map((opt) => {
            const isMine = opt.candidateId === view.myCandidateId
            const chosen = view.myVote === opt.candidateId
            const selected = !view.myVote && pick === opt.candidateId
            const pending = sending === opt.candidateId
            const locked = Boolean(view.myVote) || busy
            const disabled = isMine || locked
            return (
              <li key={opt.candidateId}>
                <button
                  type="button"
                  onClick={() => setPick((cur) => (cur === opt.candidateId ? null : opt.candidateId))}
                  disabled={disabled}
                  aria-pressed={chosen || selected}
                  className={cn(
                    'flex min-h-[52px] w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-cream transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-felt-deep',
                    chosen || selected ? 'border-gold bg-gold/[0.15] ring-2 ring-gold' : 'border-cream/30 bg-felt-deep/70',
                    !disabled && !selected && 'hover:border-gold/40 active:bg-gold/10',
                    (isMine || (locked && !chosen && !pending)) && 'opacity-60'
                  )}
                >
                  <span className="min-w-0 flex-1 whitespace-normal break-words text-base font-semibold leading-snug">
                    {t('quoted', { text: opt.text })}
                  </span>
                  {pending ? (
                    <span className="shrink-0">
                      <Loader2 aria-hidden className="h-5 w-5 text-gold motion-safe:animate-spin" />
                      <span className="sr-only">{tc('sending')}</span>
                    </span>
                  ) : chosen ? (
                    <AnswerTag icon="check" tone="gold">{t('yourVote')}</AnswerTag>
                  ) : isMine ? (
                    <AnswerTag icon="ban" tone="plain">{t('yourFake')}</AnswerTag>
                  ) : selected ? (
                    <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold text-[#24201A]">
                      <Check className="h-4 w-4" />
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* Révélation */}
      <AnimatePresence>
        {view.phase === 'reveal' && reveal && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            <p className="text-center font-display text-xl font-bold leading-snug text-gold">
              {t('reveal.realAnswer', { answer: reveal.realAnswer })}
            </p>
            <ul className="space-y-2">
              {reveal.candidates.map((c) => {
                const voters = c.votes.map((id) => nameOf(id))
                return (
                  <li
                    key={c.candidateId}
                    className={cn(
                      'rounded-2xl border px-4 py-3',
                      c.isReal ? 'border-emerald-300/60 bg-emerald-500/10' : 'border-cream/20 bg-felt-deep/70'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <p className="min-w-0 flex-1 break-words text-base font-semibold leading-snug">
                        {t('quoted', { text: c.text })}
                      </p>
                      {c.votes.includes(user.id) && <AnswerTag icon="check" tone="gold">{t('yourVote')}</AnswerTag>}
                    </div>
                    <p className="mt-1.5 text-sm">
                      {c.isReal ? (
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-300">
                          <Check aria-hidden className="h-4 w-4" />
                          {t('reveal.realTag')}
                        </span>
                      ) : (
                        <span className="text-cream/80">{t('reveal.bluffBy', { name: nameOf(c.authorId) })}</span>
                      )}
                    </p>
                    <p className="mt-0.5 break-words text-sm text-cream/70">
                      {voters.length > 0 ? t('reveal.votedBy', { names: voters.join(', ') }) : t('reveal.noVotes')}
                    </p>
                  </li>
                )
              })}
            </ul>
            {Object.keys(reveal.pointsAwarded).length > 0 && (
              <div className="rounded-2xl border border-gold/20 bg-felt-deep/70 px-4 py-3">
                <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-gold">
                  {t('reveal.pointsTitle')}
                </p>
                <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                  {Object.entries(reveal.pointsAwarded)
                    .sort((a, b) => b[1] - a[1])
                    .map(([id, pts]) => (
                      <span
                        key={id}
                        className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-sm font-bold text-cream"
                      >
                        {nameOf(id)} <span className="tabular-nums text-gold">+{pts}</span>
                      </span>
                    ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>

    {/* L'action du moment, sous le pouce. Barre montée toute la partie : sa
        ligne d'état n'est annoncée que si elle change barre déjà montée. */}
    <OnlineActionBar status={barStatus} maxWidthClass="max-w-lg">
      {canSubmit && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            submitFake()
          }}
        >
          <input
            value={fakeInput}
            onChange={(e) => setFakeInput(e.target.value)}
            maxLength={BLUFF_FAKE_MAX_LEN}
            placeholder={t('submitPlaceholder')}
            aria-label={t('submitPlaceholder')}
            enterKeyHint="send"
            autoComplete="off"
            // Tuto ouvert (première partie) : le champ ne lui vole pas le focus.
            autoFocus={!tutorial.open}
            className="h-14 min-w-0 flex-1 rounded-xl border border-cream/50 bg-black/30 px-4 text-base font-semibold text-cream placeholder:text-cream/60 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/40"
          />
          <Button
            type="submit"
            variant="primary"
            size="gameLg"
            disabled={busy || !fakeOk}
            aria-label={t('submitSend')}
            className="shrink-0 gap-2 px-4"
          >
            {busy ? (
              <Loader2 aria-hidden className="h-5 w-5 motion-safe:animate-spin" />
            ) : (
              <Send aria-hidden className="h-5 w-5" />
            )}
            <span>{tc('send')}</span>
          </Button>
        </form>
      )}
      {canVote && (
        <Button
          variant="primary"
          size="gameLg"
          className="w-full"
          disabled={!pickedOption || busy}
          onClick={() => void confirmVote()}
        >
          {sending ? tc('sending') : pickedOption ? t('voteConfirm') : t('votePickFirst')}
        </Button>
      )}
      {view.phase === 'reveal' && reveal && (
        <Button
          variant="primary"
          size="gameLg"
          className="w-full"
          disabled={busy}
          onClick={() => void sendAction({ action: 'continue' })}
        >
          {view.promptIdx + 1 >= view.totalRounds ? t('reveal.seeResult') : t('reveal.continue')}
        </Button>
      )}
    </OnlineActionBar>

    <AnimatePresence>
      {tutorial.open && <GameTutorialModal gameId="bluff" onClose={tutorial.close} />}
    </AnimatePresence>
    </>
  )
}
