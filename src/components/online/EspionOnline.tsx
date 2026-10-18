"use client"

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import { Megaphone, Shield, Siren, Trophy } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { OnlineEndScreen } from './OnlineEndScreen'
import { PhaseCountdown } from './PhaseCountdown'
import { PhaseCountdownLaunch } from './PhaseCountdownLaunch'
import { Button } from '@/components/ui/button'
import { PlayingCard } from '@/components/ui/PlayingCard'
import { cn } from '@/lib/utils'
import {
  espionAskBlock,
  espionFreeSpeechLeft,
  espionQuestionAsked,
  espionRoundSpeech,
  pendingEspionQuestion,
  ESPION_ACCUSATION_WINDOW_MS,
  ESPION_ASKS_PER_PLAYER,
  ESPION_QUESTION_TIMEOUT_MS,
  ESPION_SAME_QUESTION_MAX,
  ESPION_SPEECH_CAP,
  type EspionClientView,
  type EspionHumanSpeakKind,
} from '@/lib/espion/engine'
import { espionLocationsFor } from '@/lib/espion/data'
import { ESPION_QUESTION_IDS, type EspionAnswer, type EspionQuestionId } from '@/lib/espion/data/questions'
import { espionBotTickDelayMs, espionHash01 } from '@/lib/espion/bot-tick'
import { botAvatarFromName } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { useAdvanceTick, useBotReferee } from '@/hooks/useBotReferee'
import { useDeadline } from '@/hooks/useDeadline'
import { useGameAction } from '@/hooks/useGameAction'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, useMemberCosmetics } from './OnlinePlayerTag'
import { XpGainBanner } from './XpGainBanner'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { genreOfId } from './bot-speech/bot-speech-feed'
import { TargetGrid } from './TargetGrid'
import { EspionTableTalk, espionAimedBy, espionExchangeKeys } from './espion/EspionTableTalk'
import { QuestionCard } from './espion/QuestionCard'
import { AskSheet } from './espion/AskSheet'
import { EspionNotebook } from './espion/EspionNotebook'
import { LocationGuessGrid } from './espion/LocationGuessGrid'

/**
 * QUI EST L'ESPION ? en ligne (serveur-autoritaire). `location` est null
 * pour l'espion tant que la manche n'est pas révélée ; `activeAccusation`
 * est PUBLIC en temps réel (contrairement au vote secret des autres jeux) —
 * cohérent avec une partie qui se joue à voix haute au vocal.
 *
 * Dès qu'un bot est à table, un fil de questions et réponses par boutons
 * s'ajoute au vocal, avec une seule zone d'action, par priorité : on
 * m'interroge (QuestionCard) ; une accusation est en cours (soutenir ou
 * « Je ne suis pas d'accord ») ; c'est à moi de poser (AskSheet) ; sinon
 * accuser, poser une question et, pour l'espion, deviner — plus deux paroles
 * libres, « Je trouve ça louche » et « Me défendre » (quand on me vise,
 * espionAimedBy), auxquelles les bots réagissent. Une table 100 % humaine
 * garde l'écran d'avant, sans fil, sans refus ni paroles.
 */

function parseView(json: string | null | undefined): EspionClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as EspionClientView
    return Array.isArray(v.players) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

export function EspionOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.espion.game')
  const { busy, actionError, sendAction: postAction } = useGameAction(room?.id)
  const [showAccuseGrid, setShowAccuseGrid] = useState(false)
  const [showGuessGrid, setShowGuessGrid] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  const [askDismissed, setAskDismissed] = useState(false)
  const [speakMode, setSpeakMode] = useState(false)
  // Ratures de la grille de l'espion : propres à la manche, gardées quand le volet se ferme.
  const [struck, setStruck] = useState<{ round: number; ids: string[] }>({ round: 0, ids: [] })
  // Grille dans la langue du compte : la devinette part par id, juste même si la salle parle une autre langue.
  const locations = useMemo(() => espionLocationsFor(user?.locale ?? 'fr'), [user?.locale])

  const inGame = room?.gameId === 'espion' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const tutorial = useGameTutorial('espion', inGame)
  const cosmetics = useMemberCosmetics(room)

  // ÉCHÉANCE DE PHASE : tick « advance » générique (résout aussi une
  // accusation expirée en priorité, cf. moteur). Se recale sur la PLUS
  // PROCHE des deux échéances (accusation en cours ou timer principal).
  // Arbitré par rang (cf. useAdvanceTick) : plus de rafale de 409.
  const nextDeadline =
    view && view.phaseEndsAt !== null
      ? view.activeAccusation
        ? Math.min(view.activeAccusation.endsAt, view.phaseEndsAt)
        : view.phaseEndsAt
      : null
  useAdvanceTick({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    advance: view && nextDeadline !== null ? { phaseKey: view.phaseKey, dueAt: nextDeadline } : null,
  })

  // Ticks « arbitre » (bots + remplacement), avec secours par rang. Le délai
  // vient du calendrier public des bots (bot-tick.ts), le même que celui du
  // filet serveur : la prochaine échéance d'un bot (réponse, question,
  // décision sur une accusation, dernier appel) ou le reveal qu'il mène.
  const botDelayMs = view ? espionBotTickDelayMs(view, Date.now(), Math.random) : null
  useBotReferee({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    botTick: botDelayMs === null ? null : { body: { action: 'bot' }, delayMs: botDelayMs },
    replaceLeft: Boolean(view?.players.some((p) => !p.isBot && p.leftAt)),
  })

  // Une question restée sans réponse n'attend plus au bout de 25 s : un rendu à l'échéance retire la carte.
  const pending = view ? pendingEspionQuestion(view, Date.now()) : null
  useDeadline(pending ? pending.askedAt + ESPION_QUESTION_TIMEOUT_MS : null)

  // Les volets se ferment au changement de phase ou quand MES échanges
  // bougent, pas à chaque version : les bots parlent pendant qu'on choisit.
  const myExchanges = view && user ? espionRoundSpeech(view).filter((sp) => sp.playerId === user.id).length : 0
  const panelKey = view ? `${view.phaseKey}-${myExchanges}` : ''
  useEffect(() => {
    setShowAccuseGrid(false)
    setShowGuessGrid(false)
    setAskOpen(false)
    setAskDismissed(false)
    setSpeakMode(false)
  }, [panelKey])

  if (!inGame) {
    return <GameOnlineLobby gameId="espion" />
  }

  if (!view || !user || !room) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-white/60">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400" />
      </div>
    )
  }

  const me = view.players.find((p) => p.id === user.id)
  const finished = view.phase === 'finished'
  const reveal = view.lastReveal
  const activePlayers = view.players.filter((p) => !p.leftAt)
  const majorityNeeded = Math.floor(activePlayers.length / 2) + 1

  const nameOf = (id: string | null | undefined) =>
    view.players.find((p) => p.id === id)?.name ?? '—'
  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botAvatarFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'

  // Verrou de version conservé ; le hook lit la réponse et annonce les refus.
  const sendAction = (body: Record<string, unknown>) =>
    postAction({ ...body, expectedVersion: room.stateVersion })

  const totalPhaseMs = view.discussionMs
  const iSupported = view.activeAccusation?.supporters.includes(user.id) ?? false
  const iAmAccused = view.activeAccusation?.targetId === user.id

  // ── Écran de fin ─────────────────────────────────────────────────────────
  if (finished) {
    const crewWon = view.winnerTeam === 'crew'
    const won = me?.role === view.winnerTeam
    return (
      <OnlineEndScreen
        confetti
        won={Boolean(won)}
        rematchVotes={view.rematchVotes ?? []}
        onRematch={voteRematch}
        onLeave={leaveRoom}
        header={
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 18 }}
            className="flex flex-col items-center gap-2 text-center"
          >
            <Trophy className="h-14 w-14 text-gold" />
            <h2 className={cn('font-display text-3xl font-bold', crewWon ? 'text-cyan-200' : 'text-slate-200')}>
              {crewWon ? t('victory.crewWin') : t('victory.spyWin')}
            </h2>
            <p className="text-sm text-white/60">
              {t('victory.score', { spy: view.roundWins.spy, crew: view.roundWins.crew })}
            </p>
          </motion.div>
        }
        xp={<XpGainBanner won={Boolean(won)} playerIds={view.players.map((p) => p.id)} className="w-full max-w-sm" />}
      />
    )
  }

  // ── Compte à rebours de lancement ────────────────────────────────────────
  if (view.phase === 'countdown') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-white">
        <p className="font-display text-sm font-bold uppercase tracking-widest text-gold/80">{t('countdown.title')}</p>
        <PhaseCountdownLaunch endsAt={view.phaseEndsAt} className="font-display text-8xl font-bold tabular-nums text-gold" />
        {view.location ? (
          <PlayingCard suit="spade" rank="Q" className="w-full max-w-xs">
            <div className="px-6 py-3 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6B6455]">{t('yourLocation')}</p>
              <p className="truncate font-display text-2xl font-bold tracking-wide text-[#24201A]">{view.location}</p>
            </div>
          </PlayingCard>
        ) : (
          <div className="w-full max-w-xs rounded-2xl border border-slate-400/30 bg-felt-deep/80 px-4 py-3 text-center">
            <p className="font-display text-sm font-bold text-slate-200">{t('youAreSpy')}</p>
          </div>
        )}
        <p className="text-xs font-semibold text-white/50">{t('countdown.hint')}</p>
      </div>
    )
  }

  // ── Révélation de manche ─────────────────────────────────────────────────
  if (view.phase === 'reveal' && reveal) {
    const outcomeText =
      reveal.outcome === 'spy-caught'
        ? t('reveal.outcome.spyCaught', { name: nameOf(reveal.spyId), genre: genreOfId(view.players, reveal.spyId) })
        : reveal.outcome === 'accusation-failed'
          ? t('reveal.outcome.accusationFailed')
          : reveal.outcome === 'spy-guessed-right'
            ? t('reveal.outcome.spyGuessedRight', { name: nameOf(reveal.spyId) })
            : reveal.outcome === 'spy-guessed-wrong'
              ? t('reveal.outcome.spyGuessedWrong')
              : t('reveal.outcome.timeout', { name: nameOf(reveal.spyId) })
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-white">
        <Siren className={cn('h-10 w-10', reveal.winner === 'crew' ? 'text-cyan-300' : 'text-slate-300')} />
        <p className="font-display text-2xl font-bold text-gold">{outcomeText}</p>
        <p className="text-sm text-white/60">{t('reveal.location', { location: reveal.location })}</p>
        <p className="text-sm font-bold text-cyan-200">
          {t('victory.score', { spy: view.roundWins.spy, crew: view.roundWins.crew })}
        </p>
        <Button
          onClick={() => void sendAction({ action: 'continue' })}
          disabled={busy}
          className="w-full max-w-xs rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 py-4 text-sm font-bold hover:from-amber-400 hover:to-amber-500"
        >
          {view.roundWins.spy >= view.roundsToWin || view.roundWins.crew >= view.roundsToWin
            ? t('reveal.seeResult')
            : t('reveal.continue')}
        </Button>
      </div>
    )
  }

  // ── Discussion en cours ───────────────────────────────────────────────────
  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)
  const now = Date.now()
  const hasBot = activePlayers.some((p) => p.isBot)
  const acc = view.activeAccusation
  const iDeclined = acc?.declined?.includes(user.id) ?? false
  const iAmAccuser = acc?.accuserId === user.id
  const othersActive = activePlayers.filter((p) => p.id !== user.id)
  const myQuestion = hasBot && pending?.targetId === user.id ? pending : null
  const roundSpeech = espionRoundSpeech(view)
  const questions = roundSpeech.filter((sp) => sp.kind === 'question')
  const myAsks = questions.filter((sp) => sp.playerId === user.id).length
  // Qui je peux interroger maintenant (règles du moteur) ; celui qui vient de m'interroger est grisé.
  const askExcluded = othersActive.filter((p) => espionAskBlock(view, user.id, p.id, now) !== null).map((p) => p.id)
  const askable = hasBot && askExcluded.length < othersActive.length
  // À la Spyfall, la main revient à qui vient de répondre.
  const lastAnswer = [...roundSpeech].reverse().find((sp) => sp.kind === 'answer')
  const myHand = lastAnswer?.playerId === user.id
  // Trois questions parmi les moins posées, tirées par hachage : stables tant que rien n'est posé.
  const questionsFor = (targetId: string): EspionQuestionId[] => {
    const open = ESPION_QUESTION_IDS.filter((q) => espionQuestionAsked(view, q) < ESPION_SAME_QUESTION_MAX)
    const fewest = Math.min(...open.map((q) => espionQuestionAsked(view, q)))
    const seed = (q: string) => espionHash01(`${user.id}-${targetId}-${view.round}-${questions.length}-${q}`)
    return open
      .filter((q) => espionQuestionAsked(view, q) === fewest)
      .sort((a, b) => seed(a) - seed(b))
      .slice(0, 3)
  }
  // Paroles libres : « Je trouve ça louche » vers qui je choisis, « Me défendre » vers qui me vise.
  const speechLeft = espionFreeSpeechLeft(view, user.id)
  const accuserId = espionAimedBy(roundSpeech, user.id, (id) => activePlayers.some((p) => p.id === id))
  const speak = (kind: EspionHumanSpeakKind, targetId: string) => void sendAction({ action: 'speak', kind, targetId })
  const defendButton = accuserId && speechLeft > 0 && (
    <Button
      onClick={() => speak('defend', accuserId)}
      disabled={busy}
      className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-2 py-2.5 text-xs font-bold"
    >
      <Shield aria-hidden className="mr-1 h-3.5 w-3.5 shrink-0" />
      {t('speakDefend')}
    </Button>
  )
  const struckIds = struck.round === view.round ? struck.ids : []
  const toggleStruck = (id: string) =>
    setStruck((prev) => {
      const ids = prev.round === view.round ? prev.ids : []
      return { round: view.round, ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] }
    })
  return (
    <>
    <div className="flex flex-1 flex-col gap-3 p-3 pb-6 text-white sm:mx-auto sm:w-full sm:max-w-lg">
      <div className="rounded-2xl border border-gold/15 bg-felt-deep/70 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-cream/85">
            {t('score', { spy: view.roundWins.spy, crew: view.roundWins.crew })}
          </span>
          <span className="flex items-center gap-2">
            <span className="font-display text-xs font-semibold uppercase tracking-wide text-gold">
              {t('phaseDiscussion')}
            </span>
            <TutorialReopenButton onClick={tutorial.reopen} className="h-7 w-7" />
          </span>
        </div>
        {view.phaseEndsAt !== null && (
          <PhaseCountdown
            variant="bar"
            endsAt={view.phaseEndsAt}
            total={totalPhaseMs}
            dangerMs={30_000}
            colorClassName="bg-gold"
            dangerClassName="bg-suit-red"
          />
        )}
      </div>

      {/* Coup refusé (mauvaise phase, pas ton tour, expulsion…) — 3 s */}
      {actionError && (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-center text-xs font-semibold text-red-100">
          {actionError}
        </div>
      )}
      {leftPlayer?.leftAt && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-center text-xs font-semibold text-amber-100">
          <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
            {({ seconds }) => t('waitingReturn', { name: leftPlayer.name, seconds })}
          </PhaseCountdown>
        </div>
      )}

      {/* Lieu (carte à jouer crème) ou statut espion (feutre) */}
      {view.location ? (
        <PlayingCard suit="spade" rank="Q">
          <div className="px-6 py-3 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6B6455]">{t('yourLocation')}</p>
            <p className="font-display text-xl font-bold tracking-wide text-[#24201A]">{view.location}</p>
          </div>
        </PlayingCard>
      ) : (
        <div className="rounded-2xl border border-slate-400/30 bg-felt-deep/80 px-4 py-3 text-center">
          <p className="font-display text-sm font-bold text-slate-200">{t('youAreSpy')}</p>
          <p className="mt-0.5 text-xs text-white/40">{t('spyHint')}</p>
        </div>
      )}

      {/* Fil des échanges, dès qu'un bot est à table */}
      {hasBot && (
        <EspionTableTalk speech={view.speech ?? []} round={view.round} players={view.players} iconOf={iconOf} meId={user.id} />
      )}

      {/* Zone d'action, une seule à la fois : on m'interroge > accusation > à moi de poser > le reste */}
      {myQuestion ? (
        <QuestionCard
          askerName={nameOf(myQuestion.askerId)}
          questionId={myQuestion.questionId}
          questionKey={
            espionExchangeKeys(
              { authorId: myQuestion.askerId, round: view.round, questionId: myQuestion.questionId },
              (key) => t.has(key)
            ).question
          }
          askedAt={myQuestion.askedAt}
          disabled={busy}
          onAnswer={(value: EspionAnswer) => void sendAction({ action: 'answer', value })}
        />
      ) : acc ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="space-y-2 rounded-2xl border border-suit-red/40 bg-suit-red/10 p-3 text-center"
        >
          <p className="text-sm font-black">
            {t('accusation.title', { accuser: nameOf(acc.accuserId), target: nameOf(acc.targetId) })}
          </p>
          <p className="text-xs text-white/60">
            {t('accusation.support', { count: acc.supporters.length, needed: majorityNeeded })}
          </p>
          <PhaseCountdown
            variant="bar"
            endsAt={acc.endsAt}
            total={ESPION_ACCUSATION_WINDOW_MS}
            className="mx-auto h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-white/10"
            barClassName="h-full rounded-full bg-red-400"
          />
          {hasBot && (
            <div className="grid grid-cols-2 gap-2 text-left text-[11px]">
              {[
                { key: 'for', label: t('accusation.for'), ids: acc.supporters },
                { key: 'against', label: t('accusation.against'), ids: acc.declined ?? [] },
              ].map(({ key, label, ids }) => (
                <div key={key} className="rounded-xl border border-white/10 bg-white/5 px-2 py-1.5">
                  <p className="font-semibold text-white/50">{label}</p>
                  <p className="mt-0.5 flex min-h-5 flex-wrap gap-1 text-base leading-none">
                    {ids.map((id) => {
                      const p = view.players.find((x) => x.id === id)
                      return p ? (
                        <span key={id} title={p.name}>
                          <PlayerAvatarGlyph value={iconOf(p)} />
                        </span>
                      ) : null
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
          {!iSupported && !iDeclined && !iAmAccused && (
            <div className={cn('grid gap-2', hasBot && !iAmAccuser ? 'grid-cols-2' : 'grid-cols-1')}>
              <Button
                onClick={() => void sendAction({ action: 'support' })}
                disabled={busy}
                className="w-full rounded-xl bg-gradient-to-r from-suit-red to-red-700 px-2 py-3 text-sm font-bold"
              >
                {t('accusation.supportButton')}
              </Button>
              {hasBot && !iAmAccuser && (
                <Button
                  onClick={() => void sendAction({ action: 'decline' })}
                  disabled={busy}
                  variant="outline"
                  className="w-full rounded-xl border-white/20 bg-white/5 px-2 py-3 text-sm font-bold text-white/80 hover:bg-white/10"
                >
                  {t('accusation.declineButton')}
                </Button>
              )}
            </div>
          )}
          {iSupported && <p className="text-xs font-semibold text-emerald-300">{t('accusation.supported')}</p>}
          {iDeclined && <p className="text-xs font-semibold text-white/60">{t('accusation.declined')}</p>}
          {iAmAccused && <p className="text-xs font-semibold text-red-200">{t('accusation.youAreAccused')}</p>}
          {iAmAccused && hasBot && defendButton}
        </motion.div>
      ) : askable && (askOpen || (myHand && !askDismissed)) ? (
        <AskSheet
          title={askOpen ? t('askButton') : t('yourTurnToAsk')}
          targets={othersActive}
          excludeIds={askExcluded}
          iconOf={iconOf}
          selfId={user.id}
          questionsFor={questionsFor}
          asksLeft={{ n: ESPION_ASKS_PER_PLAYER - myAsks, max: ESPION_ASKS_PER_PLAYER }}
          disabled={busy}
          onAsk={(targetId, questionId) => void sendAction({ action: 'ask', targetId, questionId })}
          onCancel={() => {
            setAskOpen(false)
            setAskDismissed(true)
          }}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {!showAccuseGrid ? (
            <Button
              onClick={() => setShowAccuseGrid(true)}
              className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 py-4 text-sm font-bold hover:from-amber-400 hover:to-amber-500"
            >
              {t('accuseButton')}
            </Button>
          ) : (
            <div className="space-y-2 rounded-2xl border border-gold/15 bg-felt-deep/70 p-3">
              <p className="text-center text-xs font-semibold text-white/60">{t('accuseWho')}</p>
              <TargetGrid
                players={othersActive}
                iconOf={iconOf}
                onPick={(targetId) => void sendAction({ action: 'accuse', targetId })}
                disabled={busy}
                youLabel={t('you')}
                selfId={user.id}
              />
              <button
                onClick={() => setShowAccuseGrid(false)}
                className="w-full text-center text-[11px] font-semibold text-white/40"
              >
                {t('cancel')}
              </button>
            </div>
          )}

          {askable && (
            <Button
              onClick={() => setAskOpen(true)}
              variant="outline"
              className="w-full rounded-2xl border-gold/30 bg-felt-deep/60 py-4 text-sm font-bold text-cream hover:bg-felt-deep/80"
            >
              {t('askButton')}
            </Button>
          )}

          {!view.location && !showGuessGrid && (
            <Button
              onClick={() => setShowGuessGrid(true)}
              variant="outline"
              className="w-full rounded-2xl border-slate-400/30 bg-slate-600/10 py-4 text-sm font-bold text-white/80 hover:bg-slate-600/20"
            >
              {t('guessButton')}
            </Button>
          )}
          {!view.location && showGuessGrid && (
            <LocationGuessGrid
              locations={locations}
              struck={struckIds}
              onToggle={toggleStruck}
              onGuess={(locationId) => void sendAction({ action: 'guess-location', locationId })}
              onCancel={() => setShowGuessGrid(false)}
              disabled={busy}
            />
          )}

          {hasBot && !showAccuseGrid && !showGuessGrid && (
            speakMode ? (
              <div className="space-y-2 rounded-2xl border border-gold/15 bg-felt-deep/70 p-3">
                <p className="text-center text-xs font-semibold text-white/60">{t('speakPickSuspect')}</p>
                <TargetGrid
                  players={othersActive}
                  iconOf={iconOf}
                  onPick={(targetId) => speak('suspect', targetId)}
                  disabled={busy || speechLeft <= 0}
                  youLabel={t('you')}
                  selfId={user.id}
                />
                <button
                  onClick={() => setSpeakMode(false)}
                  className="w-full text-center text-[11px] font-semibold text-white/40"
                >
                  {t('cancel')}
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className={cn('grid gap-2', defendButton ? 'grid-cols-2' : 'grid-cols-1')}>
                  <Button
                    onClick={() => setSpeakMode(true)}
                    disabled={busy || speechLeft <= 0}
                    variant="outline"
                    className="w-full rounded-xl border-suit-red/40 bg-suit-red/10 px-2 py-2.5 text-xs font-bold text-cream hover:bg-suit-red/20"
                  >
                    <Megaphone aria-hidden className="mr-1 h-3.5 w-3.5 shrink-0" />
                    {t('speakSuspect')}
                  </Button>
                  {defendButton}
                </div>
                <p className="text-center text-[11px] text-white/40">
                  {t('speechLeft', { n: speechLeft, max: ESPION_SPEECH_CAP })}
                </p>
              </div>
            )
          )}
        </div>
      )}

      {/* Carnet des réponses de la manche */}
      {hasBot && <EspionNotebook speech={view.speech ?? []} round={view.round} nameOf={nameOf} />}

      {/* Joueurs */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {view.players.map((p) => (
          <span
            key={p.id}
            className={cn(
              'flex items-center gap-1.5 rounded-full border border-gold/15 bg-felt-deep/60 px-3 py-1 text-xs font-bold text-cream/80',
              p.leftAt && 'opacity-40'
            )}
          >
            <span aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
            <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
          </span>
        ))}
      </div>
    </div>
    <AnimatePresence>
      {tutorial.open && <GameTutorialModal gameId="espion" onClose={tutorial.close} />}
    </AnimatePresence>
    </>
  )
}
