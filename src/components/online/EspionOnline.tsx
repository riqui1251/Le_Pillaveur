"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Loader2, LogOut, MapPin, Megaphone, Shield, Siren, Trophy } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { OnlineEndScreen } from './OnlineEndScreen'
import { OnlineActionBar, onlineActionBarPadding } from './OnlineActionBar'
import { PhaseCountdown } from './PhaseCountdown'
import { PhaseCountdownLaunch } from './PhaseCountdownLaunch'
import { PhaseHeader } from './PhaseHeader'
import { TurnBanner } from '@/components/game/TurnBanner'
import { ConfirmActionDialog } from '@/components/game/ConfirmActionDialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  espionAskBlock,
  espionFreeSpeechLeft,
  espionQuestionAsked,
  espionRoundSpeech,
  pendingEspionQuestion,
  ESPION_ACCUSATION_WINDOW_MS,
  ESPION_ASKS_PER_PLAYER,
  ESPION_LAST_CHANCE_MS,
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
import { EspionRoleCard } from './espion/EspionRoleCard'
import { espionTurn } from './espion/espion-turn'
import { serverNow } from '@/hooks/server-clock'

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
 * accuser, poser une question et, pour l'espion, deviner (accusé aussi, puis
 * pendant sa dernière chance une fois démasqué) — plus deux paroles
 * libres, « Je trouve ça louche » et « Me défendre » (quand on me vise,
 * espionAimedBy), auxquelles les bots réagissent. Une table 100 % humaine
 * garde l'écran d'avant, sans fil, sans refus ni paroles.
 *
 * Les commandes du volet ouvert (valider, annuler, retour) et l'action du
 * moment vivent dans la barre fixe du bas ; les gestes définitifs se font en
 * deux temps — choisir puis valider (accusation, lieu deviné) ou confirmer
 * (soutien).
 */

type PanelMode = 'question' | 'accusation' | 'ask' | 'accuse' | 'guess' | 'speak' | 'idle'

function parseView(json: string | null | undefined): EspionClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as EspionClientView
    return Array.isArray(v.players) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

/**
 * Volet d'action du moment : quand il change (question qui m'arrive,
 * accusation, grille ouverte), il est ramené dans l'écran — au-dessus de la
 * barre du bas, que la marge de défilement de la scène réserve.
 */
function ActionPanel({ mode, children }: { mode: PanelMode; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  useEffect(() => {
    if (mode === 'idle') return
    ref.current?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' })
  }, [mode, reduced])
  return (
    <div ref={ref} className="scroll-mt-3">
      {children}
    </div>
  )
}

export function EspionOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.espion.game')
  const tc = useTranslations('common')
  const { busy, actionError, sendAction: postAction } = useGameAction(room?.id)
  const reducedMotion = useReducedMotion()
  const [showAccuseGrid, setShowAccuseGrid] = useState(false)
  const [accusePick, setAccusePick] = useState<string | null>(null)
  const [accuseSending, setAccuseSending] = useState<string | null>(null)
  const [showGuessGrid, setShowGuessGrid] = useState(false)
  const [guessing, setGuessing] = useState(false)
  const [guessPick, setGuessPick] = useState<string | null>(null)
  const [askOpen, setAskOpen] = useState(false)
  const [askDismissed, setAskDismissed] = useState(false)
  const [askTarget, setAskTarget] = useState<string | null>(null)
  const [speakMode, setSpeakMode] = useState(false)
  const [supportAsked, setSupportAsked] = useState(false)
  // Carte de rôle retournée : un choix du joueur, le temps d'une manche.
  const [roleHidden, setRoleHidden] = useState(false)
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
  const botDelayMs = view ? espionBotTickDelayMs(view, serverNow(), Math.random) : null
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
  const pending = view ? pendingEspionQuestion(view, serverNow()) : null
  useDeadline(pending ? pending.askedAt + ESPION_QUESTION_TIMEOUT_MS : null)
  // Le moteur refuse « Manche suivante » avant le temps de lecture
  // (READING_TIME) : le bouton reste grisé, décompte affiché, jusque-là.
  const continueUnlocked = useDeadline(view?.continueAt ?? null)

  // Les volets se ferment au changement de phase ou quand MES échanges
  // bougent, pas à chaque version : les bots parlent pendant qu'on choisit.
  const myExchanges = view && user ? espionRoundSpeech(view).filter((sp) => sp.playerId === user.id).length : 0
  const panelKey = view ? `${view.phaseKey}-${myExchanges}` : ''
  useEffect(() => {
    setShowAccuseGrid(false)
    setAccusePick(null)
    setShowGuessGrid(false)
    setGuessing(false)
    setGuessPick(null)
    setAskOpen(false)
    setAskDismissed(false)
    setAskTarget(null)
    setSpeakMode(false)
  }, [panelKey])
  // La confirmation d'un soutien ne survit pas à son accusation : elle ne doit
  // pas se rouvrir d'elle-même à la suivante.
  const accusationKey = view?.activeAccusation
    ? `${view.activeAccusation.targetId}-${view.activeAccusation.endsAt}`
    : ''
  useEffect(() => {
    setSupportAsked(false)
  }, [accusationKey])
  // Nouvelle manche = nouveau lieu, nouvel espion, sans compte à rebours : la
  // carte se redonne face visible, sinon on jouerait la manche sur l'ancien rôle.
  const round = view?.round
  useEffect(() => {
    setRoleHidden(false)
  }, [round])

  if (!inGame) {
    return <GameOnlineLobby gameId="espion" />
  }

  if (!view || !user || !room) {
    return (
      <div role="status" className="flex flex-1 items-center justify-center p-6">
        <Loader2 className="h-8 w-8 text-gold motion-safe:animate-spin" aria-hidden />
        <span className="sr-only">{tc('loading')}</span>
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
  const scoreLine = t('victory.score', { spy: view.roundWins.spy, crew: view.roundWins.crew })

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
            initial={reducedMotion ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 18 }}
            className="flex flex-col items-center gap-2 text-center"
          >
            <Trophy className="h-14 w-14 text-gold" aria-hidden />
            <h2 className="font-display text-3xl font-bold text-gold">
              {crewWon ? t('victory.crewWin') : t('victory.spyWin')}
            </h2>
            <p className="text-base text-cream/80">{scoreLine}</p>
          </motion.div>
        }
        xp={<XpGainBanner won={Boolean(won)} playerIds={view.players.map((p) => p.id)} className="w-full max-w-sm" />}
      />
    )
  }

  // ── Compte à rebours de lancement ────────────────────────────────────────
  if (view.phase === 'countdown') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-cream">
        <p className="font-display text-base font-bold uppercase tracking-widest text-gold">{t('countdown.title')}</p>
        <PhaseCountdownLaunch endsAt={view.phaseEndsAt} className="font-display text-8xl font-bold tabular-nums text-gold" />
        <EspionRoleCard
          location={view.isSpy ? null : view.location}
          hidden={roleHidden}
          onHiddenChange={setRoleHidden}
          withHint
          className="w-full max-w-xs"
        />
        <p className="text-sm text-cream/70">{t('countdown.hint')}</p>
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
    const matchOver = view.roundWins.spy >= view.roundsToWin || view.roundWins.crew >= view.roundsToWin
    const continueLocked = view.continueAt != null && !continueUnlocked
    return (
      <>
        <div
          className={cn(
            'flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-cream',
            onlineActionBarPadding()
          )}
        >
          <Siren className="h-10 w-10 text-gold" aria-hidden />
          <p className="font-display text-2xl font-bold text-gold">{outcomeText}</p>
          <p className="text-base text-cream/80">{t('reveal.location', { location: reveal.location })}</p>
          <p className="text-base font-bold text-cream">{scoreLine}</p>
        </div>
        <OnlineActionBar maxWidthClass="max-w-lg">
          <Button
            variant="primary"
            size="gameLg"
            className="w-full"
            onClick={() => void sendAction({ action: 'continue' })}
            disabled={busy || continueLocked}
          >
            {busy && <Loader2 className="mr-2 h-5 w-5 motion-safe:animate-spin" aria-hidden />}
            {continueLocked ? (
              <PhaseCountdown endsAt={view.continueAt}>
                {({ seconds }) =>
                  matchOver ? t('reveal.seeResultIn', { seconds }) : t('reveal.continueIn', { seconds })
                }
              </PhaseCountdown>
            ) : matchOver ? (
              t('reveal.seeResult')
            ) : (
              t('reveal.continue')
            )}
          </Button>
        </OnlineActionBar>
      </>
    )
  }

  // ── Discussion en cours ───────────────────────────────────────────────────
  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)
  const now = serverNow()
  const hasBot = activePlayers.some((p) => p.isBot)
  const acc = view.activeAccusation
  const iSupported = acc?.supporters.includes(user.id) ?? false
  const iAmAccused = acc?.targetId === user.id
  const iDeclined = acc?.declined?.includes(user.id) ?? false
  const iAmAccuser = acc?.accuserId === user.id
  const canVote = Boolean(acc) && !iSupported && !iDeclined && !iAmAccused
  const othersActive = activePlayers.filter((p) => p.id !== user.id)
  const myQuestion = hasBot && pending?.targetId === user.id ? pending : null
  const roundSpeech = espionRoundSpeech(view)
  const questions = roundSpeech.filter((sp) => sp.kind === 'question')
  const myAsks = questions.filter((sp) => sp.playerId === user.id).length
  // Qui je peux interroger maintenant (règles du moteur) ; celui qui vient de m'interroger est grisé.
  const askExcluded = othersActive.filter((p) => espionAskBlock(view, user.id, p.id, now) !== null).map((p) => p.id)
  const askable = hasBot && askExcluded.length < othersActive.length
  // Qui la table attend dans le fil : l'interrogé, sinon qui vient de répondre (la main lui revient).
  const turn = hasBot ? espionTurn(view, now) : null
  const turnMine = turn?.playerId === user.id
  const turnPlayer = turn && !turnMine ? view.players.find((p) => p.id === turn.playerId) : undefined
  const myHand = turn?.kind === 'ask' && turnMine
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
  const defendButton =
    accuserId && speechLeft > 0 ? (
      <Button
        variant="quiet"
        size="game"
        onClick={() => speak('defend', accuserId)}
        disabled={busy}
        className="w-full whitespace-normal leading-tight"
      >
        <Shield aria-hidden className="mr-1.5 h-4 w-4 shrink-0" />
        {t('speakDefend')}
      </Button>
    ) : null
  const struckIds = struck.round === view.round ? struck.ids : []
  const toggleStruck = (id: string) =>
    setStruck((prev) => {
      const ids = prev.round === view.round ? prev.ids : []
      return { round: view.round, ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] }
    })

  // L'espion accusé peut ouvrir sa grille : l'accusation s'efface alors de son volet, pas de la barre.
  const mode: PanelMode = myQuestion
    ? 'question'
    : acc && !(iAmAccused && view.isSpy && showGuessGrid)
      ? 'accusation'
      : askable && (askOpen || (myHand && !askDismissed))
        ? 'ask'
        : showAccuseGrid
          ? 'accuse'
          : showGuessGrid && view.isSpy
            ? 'guess'
            : speakMode && hasBot
              ? 'speak'
              : 'idle'

  // Un seul volet ouvert à la fois : ouvrir l'un referme les autres.
  const openPanel = (next: 'ask' | 'accuse' | 'guess' | 'speak') => {
    setAskOpen(next === 'ask')
    setAskTarget(null)
    setShowAccuseGrid(next === 'accuse')
    setAccusePick(null)
    setShowGuessGrid(next === 'guess')
    setGuessing(false)
    setGuessPick(null)
    setSpeakMode(next === 'speak')
  }
  const closePanels = () => {
    setAskOpen(false)
    setAskTarget(null)
    setShowAccuseGrid(false)
    setAccusePick(null)
    setShowGuessGrid(false)
    setGuessing(false)
    setGuessPick(null)
    setSpeakMode(false)
  }

  const confirmAccuse = async () => {
    if (!accusePick) return
    setAccuseSending(accusePick)
    const res = await sendAction({ action: 'accuse', targetId: accusePick })
    setAccuseSending(null)
    // Échec : la sélection reste, on peut réessayer.
    if (res?.ok) closePanels()
  }
  const confirmGuess = async () => {
    if (!guessPick) return
    const res = await sendAction({ action: 'guess-location', locationId: guessPick })
    if (res?.ok) setGuessPick(null)
  }
  const sendingIcon = busy ? <Loader2 className="mr-2 h-5 w-5 shrink-0 motion-safe:animate-spin" aria-hidden /> : null
  const guessConfirm = (pickedName: string | undefined) => (
    <Button
      variant="danger"
      size="gameLg"
      className="min-w-0 flex-[2] whitespace-normal leading-tight"
      disabled={!pickedName || busy}
      onClick={() => void confirmGuess()}
    >
      {pickedName && sendingIcon}
      {pickedName ? t('guess.confirm', { location: pickedName }) : t('guess.pickFirst')}
    </Button>
  )

  // ── Dernière chance de l'espion démasqué ─────────────────────────────────
  // La table attend : seul l'espion (sur son téléphone) devine, avant l'échéance.
  if (view.phase === 'lastChance' && acc) {
    const caughtId = acc.targetId
    return (
      <>
        <div
          className={cn(
            'flex flex-1 flex-col gap-3 p-3 text-cream sm:mx-auto sm:w-full sm:max-w-lg',
            onlineActionBarPadding('tall')
          )}
        >
          <div className="space-y-3 rounded-2xl border border-suit-red/40 bg-suit-red/10 p-3 text-center">
            <Siren className="mx-auto h-8 w-8 text-gold" aria-hidden />
            <p className="font-display text-xl font-bold text-gold">
              {t('lastChance.title', { name: nameOf(caughtId) })}
            </p>
            <p className="text-sm text-cream/80">
              {view.isSpy ? t('lastChance.spyHint') : t('lastChance.othersHint', { name: nameOf(caughtId) })}
            </p>
            <PhaseCountdown
              variant="bar"
              showDigits
              endsAt={acc.endsAt}
              total={ESPION_LAST_CHANCE_MS}
              dangerMs={5_000}
              colorClassName="bg-gold"
              className="mx-auto flex w-full max-w-xs items-center gap-3"
            />
          </div>
          {actionError && (
            <div
              role="alert"
              className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-2 text-center text-sm font-semibold text-red-300"
            >
              {actionError}
            </div>
          )}
          {view.isSpy && (
            <LocationGuessGrid
              locations={locations}
              struck={struckIds}
              onToggle={toggleStruck}
              guessing
              selectedId={guessPick}
              onSelect={setGuessPick}
              disabled={busy}
            />
          )}
        </div>
        {view.isSpy && (
          <OnlineActionBar maxWidthClass="max-w-lg">
            {guessConfirm(locations.find((l) => l.id === guessPick)?.name)}
          </OnlineActionBar>
        )}
      </>
    )
  }

  // ── Volet d'action, dans le flux ─────────────────────────────────────────
  let panel: ReactNode = null
  if (mode === 'question' && myQuestion) {
    panel = (
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
    )
  } else if (mode === 'accusation' && acc) {
    panel = (
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="space-y-3 rounded-2xl border border-suit-red/40 bg-suit-red/10 p-3 text-center"
      >
        <p className="text-base font-bold text-cream">
          {t('accusation.title', { accuser: nameOf(acc.accuserId), target: nameOf(acc.targetId) })}
        </p>
        <p className="text-sm text-cream/80">
          {t('accusation.support', { count: acc.supporters.length, needed: majorityNeeded })}
        </p>
        <PhaseCountdown
          variant="bar"
          showDigits
          endsAt={acc.endsAt}
          total={ESPION_ACCUSATION_WINDOW_MS}
          dangerMs={5_000}
          colorClassName="bg-gold"
          className="mx-auto flex w-full max-w-xs items-center gap-3"
        />
        {hasBot && (
          <div className="grid grid-cols-2 gap-2 text-left">
            {[
              { key: 'for', label: t('accusation.for'), ids: acc.supporters },
              { key: 'against', label: t('accusation.against'), ids: acc.declined ?? [] },
            ].map(({ key, label, ids }) => (
              <div key={key} className="rounded-xl border border-cream/20 bg-black/20 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-cream/80">
                  {label} · {ids.length}
                </p>
                <p className="mt-1 flex min-h-[1.75rem] flex-wrap gap-1 text-xl leading-none">
                  {ids.map((id) => {
                    const p = view.players.find((x) => x.id === id)
                    return p ? (
                      <span key={id} title={p.name}>
                        <span aria-hidden>
                          <PlayerAvatarGlyph value={iconOf(p)} />
                        </span>
                        <span className="sr-only">{p.name}</span>
                      </span>
                    ) : null
                  })}
                </p>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    )
  } else if (mode === 'ask') {
    panel = (
      <AskSheet
        title={t('askButton')}
        targets={othersActive}
        excludeIds={askExcluded}
        excludedMeta={t('askNoBack')}
        iconOf={iconOf}
        selfId={user.id}
        questionsFor={questionsFor}
        targetId={askTarget}
        onTargetChange={setAskTarget}
        disabled={busy}
        onAsk={(targetId, questionId) => void sendAction({ action: 'ask', targetId, questionId })}
      />
    )
  } else if (mode === 'accuse') {
    panel = (
      <div className="space-y-3 rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
        <p className="text-center font-display text-base font-bold text-gold">{t('accuseWho')}</p>
        {/* Un parti reste accusable : l'espion ne gagne pas en quittant la table. */}
        <TargetGrid
          mode="select"
          tone="danger"
          players={view.players.filter((p) => p.id !== user.id)}
          iconOf={iconOf}
          selectedId={accusePick}
          onSelect={setAccusePick}
          disabled={busy}
          pendingId={accuseSending}
          youLabel={t('you')}
          selfId={user.id}
        />
      </div>
    )
  } else if (mode === 'guess') {
    panel = (
      <LocationGuessGrid
        locations={locations}
        struck={struckIds}
        onToggle={toggleStruck}
        guessing={guessing}
        selectedId={guessPick}
        onSelect={setGuessPick}
        disabled={busy}
      />
    )
  } else if (mode === 'speak') {
    panel = (
      <div className="space-y-3 rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
        <p className="text-center font-display text-base font-bold text-gold">{t('speakPickSuspect')}</p>
        <TargetGrid
          players={othersActive}
          iconOf={iconOf}
          onPick={(targetId) => speak('suspect', targetId)}
          disabled={busy || speechLeft <= 0}
          youLabel={t('you')}
          selfId={user.id}
        />
      </div>
    )
  } else if (hasBot || view.isSpy) {
    // Au repos : les gestes secondaires, à la même silhouette (contour or,
    // texte crème) — la devinette de l'espion ne se distingue pas de loin.
    panel = (
      <div className="space-y-2">
        {hasBot && (
          <>
            <div className={cn('grid gap-2', defendButton ? 'grid-cols-2' : 'grid-cols-1')}>
              <Button
                variant="quiet"
                size="game"
                onClick={() => openPanel('speak')}
                disabled={busy || speechLeft <= 0}
                className="w-full whitespace-normal leading-tight"
              >
                <Megaphone aria-hidden className="mr-1.5 h-4 w-4 shrink-0" />
                {t('speakSuspect')}
              </Button>
              {defendButton}
            </div>
            <p className="text-center text-sm text-cream/70">
              {t('speechLeft', { n: speechLeft, max: ESPION_SPEECH_CAP })}
            </p>
          </>
        )}
        {view.isSpy && (
          <Button variant="quiet" size="game" onClick={() => openPanel('guess')} className="w-full">
            <MapPin aria-hidden className="mr-1.5 h-4 w-4 shrink-0" />
            {t('guessButton')}
          </Button>
        )}
      </div>
    )
  }

  // ── Barre du bas : l'action du moment, ou les commandes du volet ouvert ──
  let barStatus: ReactNode = null
  let barActions: ReactNode = null
  if (mode === 'accusation') {
    barStatus = iSupported
      ? t('accusation.supported')
      : iDeclined
        ? t('accusation.declined')
        : iAmAccused
          ? t('accusation.youAreAccused')
          : null
    if (canVote) {
      barActions = (
        <div className="flex gap-2">
          {hasBot && !iAmAccuser && (
            <Button
              variant="quiet"
              size="gameLg"
              className="min-w-0 flex-1 whitespace-normal leading-tight"
              onClick={() => void sendAction({ action: 'decline' })}
              disabled={busy}
            >
              {t('accusation.declineButton')}
            </Button>
          )}
          <Button
            variant="danger"
            size="gameLg"
            className="min-w-0 flex-1 whitespace-normal leading-tight"
            onClick={() => setSupportAsked(true)}
            disabled={busy}
          >
            {t('accusation.supportButton')}
          </Button>
        </div>
      )
    } else if (iAmAccused && (view.isSpy || (hasBot && defendButton))) {
      barActions = (
        <div className="flex gap-2">
          {hasBot && defendButton && <div className="min-w-0 flex-1">{defendButton}</div>}
          {view.isSpy && (
            <Button
              variant="quiet"
              size="game"
              onClick={() => openPanel('guess')}
              className="min-w-0 flex-1 whitespace-normal leading-tight"
            >
              <MapPin aria-hidden className="mr-1.5 h-4 w-4 shrink-0" />
              {t('guessButton')}
            </Button>
          )}
        </div>
      )
    }
  } else if (mode === 'ask') {
    barStatus = t('asksLeft', { n: ESPION_ASKS_PER_PLAYER - myAsks, max: ESPION_ASKS_PER_PLAYER })
    barActions = (
      <Button
        variant="quiet"
        size="gameLg"
        className="w-full"
        onClick={() => {
          if (askTarget) {
            setAskTarget(null)
            return
          }
          setAskOpen(false)
          setAskDismissed(true)
        }}
      >
        {askTarget ? tc('back') : t('cancel')}
      </Button>
    )
  } else if (mode === 'accuse') {
    barActions = (
      <div className="flex gap-2">
        <Button variant="quiet" size="gameLg" className="min-w-0 flex-1" onClick={closePanels}>
          {t('cancel')}
        </Button>
        <Button
          variant="danger"
          size="gameLg"
          className="min-w-0 flex-[2]"
          disabled={!accusePick || busy}
          onClick={() => void confirmAccuse()}
        >
          {accusePick && sendingIcon}
          <span className="min-w-0 truncate">
            {accusePick ? t('accuseConfirm', { name: nameOf(accusePick) }) : t('accusePick')}
          </span>
        </Button>
      </div>
    )
  } else if (mode === 'guess') {
    const pickedName = locations.find((l) => l.id === guessPick)?.name
    barActions = guessing ? (
      <div className="flex gap-2">
        <Button
          variant="quiet"
          size="gameLg"
          className="min-w-0 flex-1 whitespace-normal leading-tight"
          onClick={() => {
            setGuessing(false)
            setGuessPick(null)
          }}
        >
          {t('guess.toStrike')}
        </Button>
        {guessConfirm(pickedName)}
      </div>
    ) : (
      <div className="flex gap-2">
        <Button variant="quiet" size="gameLg" className="min-w-0 flex-1" onClick={closePanels}>
          {tc('close')}
        </Button>
        <Button
          variant="primary"
          size="gameLg"
          className="min-w-0 flex-[2] whitespace-normal leading-tight"
          onClick={() => setGuessing(true)}
        >
          {t('guess.toGuess')}
        </Button>
      </div>
    )
  } else if (mode === 'speak') {
    barStatus = t('speechLeft', { n: speechLeft, max: ESPION_SPEECH_CAP })
    barActions = (
      <Button variant="quiet" size="gameLg" className="w-full" onClick={closePanels}>
        {t('cancel')}
      </Button>
    )
  } else if (mode === 'idle') {
    // « Poser une question » reste en place, grisé pendant qu'une question
    // attend sa réponse : sinon « J'accuse » s'élargirait sous le pouce à
    // chaque question des bots. Le compte restant dit pourquoi, une fois épuisé.
    if (hasBot) barStatus = t('asksLeft', { n: ESPION_ASKS_PER_PLAYER - myAsks, max: ESPION_ASKS_PER_PLAYER })
    barActions = (
      <div className="flex gap-2">
        {hasBot && (
          <Button
            variant="quiet"
            size="gameLg"
            className="min-w-0 flex-1 whitespace-normal leading-tight"
            disabled={!askable}
            onClick={() => openPanel('ask')}
          >
            {t('askButton')}
          </Button>
        )}
        <Button
          variant="primary"
          size="gameLg"
          className="min-w-0 flex-1 whitespace-normal leading-tight"
          onClick={() => openPanel('accuse')}
        >
          {t('accuseButton')}
        </Button>
      </div>
    )
  }

  const turnHint = !turn
    ? askable
      ? t('turn.open')
      : undefined
    : turn.kind === 'answer'
      ? t(turnMine ? 'turn.answerMine' : 'turn.answerOther', { name: nameOf(turn.askerId) })
      : t(turnMine ? 'turn.askMine' : 'turn.askOther')

  return (
    <>
      {/* Le soutien peut faire basculer la manche : il se confirme. La barre
          change sous le pouce quand une accusation s'ouvre, un toucher parti
          trop vite ne doit pas compter pour un soutien. */}
      <ConfirmActionDialog
        open={supportAsked && canVote}
        onOpenChange={setSupportAsked}
        onConfirm={() => void sendAction({ action: 'support' })}
        title={acc ? t('accusation.confirmTitle', { target: nameOf(acc.targetId) }) : ''}
        description={t('accusation.confirmBody')}
        confirmLabel={t('accusation.confirm')}
        tone="danger"
      />
      <div
        className={cn(
          'flex flex-1 flex-col gap-3 p-3 text-cream sm:mx-auto sm:w-full sm:max-w-lg',
          onlineActionBarPadding('tall')
        )}
      >
        <PhaseHeader
          round={t('roundScore', { n: view.round, spy: view.roundWins.spy, crew: view.roundWins.crew })}
          phase={acc ? t('phaseAccusation') : t('phaseDiscussion')}
          endsAt={view.phaseEndsAt}
          total={totalPhaseMs}
          dangerMs={30_000}
          right={<TutorialReopenButton onClick={tutorial.reopen} className="h-11 w-11" />}
        />

        {/* À qui le tour dans le fil des questions (tables avec bots) */}
        {hasBot && !acc && (
          <TurnBanner
            mine={turnMine}
            name={turnPlayer?.name}
            avatar={turnPlayer ? <PlayerAvatarGlyph value={iconOf(turnPlayer)} /> : undefined}
            hint={turnHint}
            alertOnMine
          />
        )}

        {/* Coup refusé (mauvaise phase, pas ton tour, expulsion…) — 3 s */}
        {actionError && (
          <div
            role="alert"
            className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-2 text-center text-sm font-semibold text-red-300"
          >
            {actionError}
          </div>
        )}
        {leftPlayer?.leftAt && (
          <div className="rounded-2xl border border-gold/30 bg-gold/10 px-4 py-2 text-center text-sm font-semibold text-cream">
            <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
              {({ seconds }) => t('waitingReturn', { name: leftPlayer.name, seconds })}
            </PhaseCountdown>
          </div>
        )}

        {/* Même carte crème pour toute la table : l'espion ne se repère pas de loin */}
        <EspionRoleCard
          location={view.isSpy ? null : view.location}
          hidden={roleHidden}
          onHiddenChange={setRoleHidden}
        />

        {/* Fil des échanges, dès qu'un bot est à table */}
        {hasBot && (
          <EspionTableTalk speech={view.speech ?? []} round={view.round} players={view.players} iconOf={iconOf} meId={user.id} />
        )}

        {/* Volet d'action, un seul à la fois : on m'interroge > accusation > poser > accuser > deviner > parler */}
        {panel && <ActionPanel mode={mode}>{panel}</ActionPanel>}

        {/* Carnet des réponses de la manche */}
        {hasBot && <EspionNotebook speech={view.speech ?? []} round={view.round} nameOf={nameOf} />}

        {/* Joueurs */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {view.players.map((p) => (
            <span
              key={p.id}
              className={cn(
                'flex items-center gap-1.5 rounded-full border border-gold/20 bg-felt-deep/60 px-3 py-1.5 text-sm font-bold text-cream',
                p.leftAt && 'opacity-40'
              )}
            >
              <span aria-hidden>
                <PlayerAvatarGlyph value={iconOf(p)} />
              </span>
              <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
              {p.leftAt && (
                <>
                  <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="sr-only">{t('playerLeft')}</span>
                </>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* La réponse à une question se donne sur la carte crème : pas de barre pendant ce temps. */}
      {mode !== 'question' && (
        <OnlineActionBar status={barStatus} maxWidthClass="max-w-lg">
          {barActions}
        </OnlineActionBar>
      )}

      <AnimatePresence>
        {tutorial.open && <GameTutorialModal gameId="espion" onClose={tutorial.close} />}
      </AnimatePresence>
    </>
  )
}
