"use client"

import { Hourglass, Siren, Trophy } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import { botAvatarFromName } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import {
  espionMajority,
  espionRoundSpeech,
  pendingEspionQuestion,
  ESPION_ACCUSATION_WINDOW_MS,
  ESPION_LAST_CHANCE_MS,
  ESPION_QUESTION_TIMEOUT_MS,
  type EspionClientView,
  type EspionPlayerView,
  type EspionSpeech,
} from '@/lib/espion/engine'
import { ESPION_ANY, type EspionQuestionId } from '@/lib/espion/data/questions'
import { cn } from '@/lib/utils'
import { useDeadline } from '@/hooks/useDeadline'
import { PhaseCountdown } from '@/components/online/PhaseCountdown'
import { rematchCounter } from '@/components/online/end-screen'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { genreOfId } from '@/components/online/bot-speech/bot-speech-feed'
import { EspionTableTalk, espionExchangeKeys } from '@/components/online/espion/EspionTableTalk'
import { TvBigCountdown, TvTimeBar } from './tv-shared'

type IconOf = (p: { id: string; name: string; isBot: boolean }) => string

/**
 * Lignes du carnet que la colonne tient sans couper (1,75 rem chacune, sur
 * ≈ 18 rem utiles avec 16 joueurs et le bandeau de retour) : une par
 * question, une par réponse.
 */
const NOTEBOOK_LINE_BUDGET = 8

/** Masque du haut du fil : la bulle la plus ancienne s'efface au lieu d'être coupée net. */
const FEED_FADE = 'linear-gradient(to bottom, transparent, black 3rem)'

function clock(seconds: number): string {
  const s = Math.max(0, seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Bandeau des joueurs : une rangée jusqu'à 8, deux au-delà (16 au plus).
 * `marks` souligne l'accusé (rouge) ou l'interrogé (cyan).
 */
function TvEspionPlayers({
  players,
  iconOf,
  marks = {},
}: {
  players: EspionPlayerView[]
  iconOf: IconOf
  marks?: Record<string, 'accused' | 'asked'>
}) {
  const cols = players.length <= 8 ? players.length : Math.ceil(players.length / 2)
  return (
    <ul
      className="mx-auto grid w-full gap-2"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, maxWidth: `${cols * 15}rem` }}
    >
      {players.map((p) => {
        const mark = marks[p.id]
        return (
          <li
            key={p.id}
            className={cn(
              'flex min-w-0 items-center gap-2 rounded-full border-2 px-3 py-1 text-xl font-bold',
              mark === 'accused'
                ? 'border-red-300 bg-red-500/20 text-white'
                : mark === 'asked'
                  ? 'border-cyan-300 bg-cyan-400/10 text-white'
                  : 'border-white/10 bg-white/5 text-white/90',
              p.leftAt && 'opacity-60'
            )}
          >
            <span aria-hidden className="shrink-0 text-3xl leading-none">
              <PlayerAvatarGlyph value={iconOf(p)} />
            </span>
            <span className="min-w-0 truncate">{p.name}</span>
            {p.leftAt && <Hourglass aria-hidden className="h-6 w-6 shrink-0 text-amber-300" />}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Carnet des réponses de la manche, comme le volet des téléphones, réduit aux
 * questions les plus récentes que la colonne peut tenir sans couper.
 */
function TvEspionNotebook({ state, nameOf }: { state: EspionClientView; nameOf: (id: string) => string }) {
  const t = useTranslations('games.espion.game')
  const answers = espionRoundSpeech(state).filter((sp) => sp.kind === 'answer' && sp.questionId && sp.value)
  const byQuestion = new Map<EspionQuestionId, EspionSpeech[]>()
  for (const sp of answers) byQuestion.set(sp.questionId!, [...(byQuestion.get(sp.questionId!) ?? []), sp])
  const groups = [...byQuestion].reverse()
  const shown: typeof groups = []
  let lines = 0
  for (const group of groups) {
    lines += 1 + group[1].length
    if (lines > NOTEBOOK_LINE_BUDGET) break
    shown.push(group)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-3xl border border-white/10 bg-black/20 p-5">
      <p className="font-display text-base font-bold uppercase tracking-[0.25em] text-gold/90">{t('notebook.title')}</p>
      {shown.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-center text-3xl font-bold text-white/80">
          {t('notebook.empty')}
        </p>
      ) : (
        <dl className="flex flex-col gap-3">
          {shown.map(([questionId, list]) => (
            <div key={questionId}>
              <dt className="truncate text-lg font-semibold text-cyan-200 first-letter:uppercase">{t(`qa.${questionId}.q`)}</dt>
              {list.map((sp) => (
                <dd key={`${sp.playerId}-${sp.at}`} className="flex min-w-0 items-baseline gap-2 text-xl">
                  <span className="min-w-0 truncate font-bold text-white">{nameOf(sp.playerId)}</span>
                  <span className="shrink-0 text-white/80 first-letter:uppercase">
                    {t(sp.value === ESPION_ANY ? 'qa.any' : `qa.${questionId}.${sp.value}`)}
                  </span>
                </dd>
              ))}
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

/**
 * QUI EST L'ESPION ? sur grand écran : ce que les téléphones montrent à toute
 * la table (score, minuteur, accusation et ses soutiens, fil des échanges,
 * carnet des réponses, joueurs), JAMAIS le lieu ni les rôles avant la
 * révélation — la vue spectateur ne les porte pas. Dès qu'un bot est à table,
 * comme sur les téléphones : la question en cours en grand, le fil des quatre
 * dernières bulles et le carnet. Une table 100 % humaine garde le grand
 * minuteur au centre.
 */
export function TvEspion({ room, state }: { room: TvRoomDto; state: EspionClientView }) {
  const t = useTranslations('games.espion.game')
  const activePlayers = state.players.filter((p) => !p.leftAt)
  const hasBot = activePlayers.some((p) => p.isBot)
  const pending = hasBot ? pendingEspionQuestion(state, Date.now()) : null
  // La question sans réponse quitte l'écran à son échéance de 25 s, sans attendre une nouvelle version.
  useDeadline(pending ? pending.askedAt + ESPION_QUESTION_TIMEOUT_MS : null)
  const reveal = state.lastReveal
  const nameOf = (id: string | null | undefined) => state.players.find((p) => p.id === id)?.name ?? '—'
  const iconOf: IconOf = (p) =>
    p.isBot ? botAvatarFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'
  const score = t('victory.score', { spy: state.roundWins.spy, crew: state.roundWins.crew })

  // ── Fin de partie ─────────────────────────────────────────────────────────
  if (state.phase === 'finished') {
    const crewWon = state.winnerTeam === 'crew'
    const rematch = rematchCounter(room.members, state.rematchVotes ?? [], null)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-8 p-8 text-center">
        <Trophy aria-hidden className="h-28 w-28 text-gold" />
        <p className={cn('font-display text-7xl font-black leading-tight', crewWon ? 'text-cyan-200' : 'text-slate-200')}>
          {crewWon ? t('victory.crewWin') : t('victory.spyWin')}
        </p>
        <p className="text-4xl font-bold text-white/90">{score}</p>
        {rematch.total > 1 && rematch.count > 0 && (
          <p className="text-2xl font-semibold text-white/80">
            {t('victory.rematchWaiting', { count: rematch.count, total: rematch.total })}
          </p>
        )}
      </div>
    )
  }

  // ── Compte à rebours de lancement ────────────────────────────────────────
  if (state.phase === 'countdown') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
        <p className="font-display text-5xl font-black uppercase tracking-widest text-cyan-300">{t('countdown.title')}</p>
        <PhaseCountdown endsAt={state.phaseEndsAt}>
          {({ seconds }) => <TvBigCountdown seconds={Math.max(1, seconds)} colorClass="text-cyan-200" />}
        </PhaseCountdown>
        <p className="text-3xl font-semibold text-white/80">{t('countdown.hint')}</p>
        <div className="mt-2 w-full">
          <TvEspionPlayers players={state.players} iconOf={iconOf} />
        </div>
      </div>
    )
  }

  // ── Révélation de manche ─────────────────────────────────────────────────
  if (state.phase === 'reveal' && reveal) {
    const spy = state.players.find((p) => p.id === reveal.spyId)
    const outcomeText =
      reveal.outcome === 'spy-caught'
        ? t('reveal.outcome.spyCaught', { name: nameOf(reveal.spyId), genre: genreOfId(state.players, reveal.spyId) })
        : reveal.outcome === 'accusation-failed'
          ? t('reveal.outcome.accusationFailed')
          : reveal.outcome === 'spy-guessed-right'
            ? t('reveal.outcome.spyGuessedRight', { name: nameOf(reveal.spyId) })
            : reveal.outcome === 'spy-guessed-wrong'
              ? t('reveal.outcome.spyGuessedWrong')
              : t('reveal.outcome.timeout', { name: nameOf(reveal.spyId) })
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-7 p-8 text-center">
        <Siren aria-hidden className={cn('h-24 w-24', reveal.winner === 'crew' ? 'text-cyan-300' : 'text-slate-300')} />
        <p className="max-w-full font-display text-6xl font-black leading-tight text-gold">{outcomeText}</p>
        {spy && (
          <p className="flex max-w-full items-center gap-4 rounded-full border-2 border-gold/50 bg-black/25 px-8 py-3 text-5xl font-black text-white">
            <span aria-hidden className="shrink-0 leading-none">🕵️</span>
            <span aria-hidden className="shrink-0 leading-none">
              <PlayerAvatarGlyph value={iconOf(spy)} />
            </span>
            <span className="min-w-0 truncate">{spy.name}</span>
          </p>
        )}
        <p className="text-4xl font-bold text-white/90">{t('reveal.location', { location: reveal.location })}</p>
        <p className="text-3xl font-black text-cyan-200">{score}</p>
      </div>
    )
  }

  // ── Dernière chance de l'espion démasqué ─────────────────────────────────
  // Le lieu reste caché : la vue spectateur ne le porte pas avant la révélation.
  if (state.phase === 'lastChance' && state.activeAccusation) {
    const caughtId = state.activeAccusation.targetId
    const caught = state.players.find((p) => p.id === caughtId)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-7 p-8 text-center">
        <Siren aria-hidden className="h-24 w-24 text-red-300" />
        <p className="max-w-full font-display text-6xl font-black leading-tight text-gold">
          {t('lastChance.title', { name: nameOf(caughtId) })}
        </p>
        {caught && (
          <p className="flex max-w-full items-center gap-4 rounded-full border-2 border-gold/50 bg-black/25 px-8 py-3 text-5xl font-black text-white">
            <span aria-hidden className="shrink-0 leading-none">
              <PlayerAvatarGlyph value={iconOf(caught)} />
            </span>
            <span className="min-w-0 truncate">{caught.name}</span>
          </p>
        )}
        <p className="text-4xl font-bold text-white/90">{t('lastChance.othersHint', { name: nameOf(caughtId) })}</p>
        <div className="flex w-full max-w-3xl items-center">
          <PhaseCountdown endsAt={state.activeAccusation.endsAt} tickMs={400}>
            {({ leftMs }) => (
              <TvTimeBar timeLeftMs={leftMs} totalMs={ESPION_LAST_CHANCE_MS} dangerMs={5_000} colorClass="bg-gold" dangerClass="bg-red-400" />
            )}
          </PhaseCountdown>
        </div>
        <p className="text-3xl font-black text-cyan-200">{score}</p>
      </div>
    )
  }

  // ── Discussion ────────────────────────────────────────────────────────────
  const acc = state.activeAccusation
  const leftPlayer = state.players.find((p) => !p.isBot && p.leftAt)
  const bigClock = !hasBot && !acc
  const marks: Record<string, 'accused' | 'asked'> = {}
  if (acc) marks[acc.targetId] = 'accused'
  else if (pending) marks[pending.targetId] = 'asked'

  // Avec bots, la carte partage la largeur avec le fil : titre plus serré, soutiens sur deux lignes pleine largeur.
  const accusation = acc && (
    <div
      className={cn(
        'flex w-full flex-col items-center justify-center rounded-3xl border-2 border-red-300/50 bg-red-500/10 text-center',
        hasBot ? 'gap-3 p-5' : 'gap-5 p-8'
      )}
    >
      <p className={cn('flex items-center justify-center gap-3 font-black leading-tight text-white', hasBot ? 'text-4xl' : 'text-6xl')}>
        <Siren aria-hidden className={cn('shrink-0 text-red-300', hasBot ? 'h-9 w-9' : 'h-14 w-14')} />
        <span className="min-w-0">{t('accusation.title', { accuser: nameOf(acc.accuserId), target: nameOf(acc.targetId) })}</span>
      </p>
      <p className={cn('font-bold text-white/90', hasBot ? 'text-2xl' : 'text-4xl')}>
        {t('accusation.support', { count: acc.supporters.length, needed: espionMajority(activePlayers.length) })}
      </p>
      <div className="flex w-full items-center">
        <PhaseCountdown endsAt={acc.endsAt} tickMs={400}>
          {({ leftMs }) => (
            <TvTimeBar timeLeftMs={leftMs} totalMs={ESPION_ACCUSATION_WINDOW_MS} dangerMs={5_000} colorClass="bg-red-300" dangerClass="bg-red-500" />
          )}
        </PhaseCountdown>
      </div>
      {hasBot && (
        <div className="flex w-full flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-left">
          {[
            { key: 'for', label: t('accusation.for'), ids: acc.supporters },
            { key: 'against', label: t('accusation.against'), ids: acc.declined ?? [] },
          ].map(({ key, label, ids }) => (
            <div key={key} className="flex min-w-0 items-center gap-3">
              <p className="shrink-0 text-lg font-bold text-white/80">
                {label} · {ids.length}
              </p>
              <p className="flex min-h-[1.875rem] min-w-0 flex-1 flex-wrap gap-2 text-3xl leading-none">
                {ids.map((id) => {
                  const p = state.players.find((x) => x.id === id)
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
    </div>
  )

  const question = pending && (
    <div className="flex w-full flex-col items-center justify-center gap-4 rounded-3xl border-2 border-cyan-300/40 bg-cyan-400/10 p-5 text-center">
      <p className="max-w-full text-3xl font-bold text-cyan-200">
        {t('tvAsking', { asker: nameOf(pending.askerId), target: nameOf(pending.targetId) })}
      </p>
      <p className="text-5xl font-black leading-tight text-white first-letter:uppercase">
        {t(espionExchangeKeys({ authorId: pending.askerId, round: state.round, questionId: pending.questionId }, (key) => t.has(key)).question)}
      </p>
      <div className="flex w-full items-center">
        <PhaseCountdown endsAt={pending.askedAt + ESPION_QUESTION_TIMEOUT_MS} tickMs={400}>
          {({ leftMs }) => (
            <TvTimeBar timeLeftMs={leftMs} totalMs={ESPION_QUESTION_TIMEOUT_MS} dangerMs={5_000} colorClass="bg-cyan-300" dangerClass="bg-red-300" />
          )}
        </PhaseCountdown>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 py-5">
      <div className="flex shrink-0 items-center gap-6">
        <span className="shrink-0 text-2xl font-black text-white">{score}</span>
        <span className="shrink-0 font-display text-lg font-bold uppercase tracking-widest text-cyan-300">
          {t('phaseDiscussion')}
        </span>
        {state.phaseEndsAt !== null && (
          <>
            <PhaseCountdown endsAt={state.phaseEndsAt} tickMs={400}>
              {({ leftMs }) => (
                <TvTimeBar timeLeftMs={leftMs} totalMs={state.discussionMs} dangerMs={30_000} colorClass="bg-cyan-400" dangerClass="bg-red-400" />
              )}
            </PhaseCountdown>
            {!bigClock && (
              <PhaseCountdown endsAt={state.phaseEndsAt}>
                {({ seconds }) => (
                  <span className={cn('shrink-0 text-4xl font-black tabular-nums', seconds <= 30 ? 'text-red-300' : 'text-white')}>
                    {clock(seconds)}
                  </span>
                )}
              </PhaseCountdown>
            )}
          </>
        )}
      </div>

      {leftPlayer?.leftAt && (
        <div className="flex shrink-0 items-center justify-center gap-3 rounded-2xl border border-amber-300/40 bg-amber-500/10 px-5 py-1.5 text-xl font-bold text-amber-100">
          <Hourglass aria-hidden className="h-6 w-6 shrink-0 text-amber-300" />
          <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
            {({ seconds }) => <span className="min-w-0 truncate">{t('waitingReturn', { name: leftPlayer.name, seconds })}</span>}
          </PhaseCountdown>
        </div>
      )}

      {hasBot ? (
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-6">
          <div className="flex min-h-0 flex-col justify-center">
            {accusation || question || <TvEspionNotebook state={state} nameOf={(id) => nameOf(id)} />}
          </div>
          {/* Fil collé en bas : si une rafale de longues bulles dépassait, c'est la plus ancienne qui s'efface. */}
          <div
            className="flex min-h-0 flex-col justify-end overflow-hidden"
            style={{ WebkitMaskImage: FEED_FADE, maskImage: FEED_FADE }}
          >
            <EspionTableTalk speech={state.speech ?? []} round={state.round} players={state.players} iconOf={iconOf} variant="tv" />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-8">
          {accusation || (
            <>
              {state.phaseEndsAt !== null && (
                <PhaseCountdown endsAt={state.phaseEndsAt}>
                  {({ seconds }) => (
                    <span
                      className={cn(
                        'font-display text-[10rem] font-black leading-none tabular-nums',
                        seconds <= 30 ? 'text-red-300' : 'text-white'
                      )}
                    >
                      {clock(seconds)}
                    </span>
                  )}
                </PhaseCountdown>
              )}
              <p className="text-4xl font-bold text-white/80">{t('tvDiscussionHint')}</p>
            </>
          )}
        </div>
      )}

      <div className="shrink-0">
        <TvEspionPlayers players={state.players} iconOf={iconOf} marks={marks} />
      </div>
    </div>
  )
}
