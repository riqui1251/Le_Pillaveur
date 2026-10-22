"use client"

import { useMemo, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Check, Loader2, Scale, WifiOff } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { PhaseCountdown } from './PhaseCountdown'
import { PhaseCountdownLaunch } from './PhaseCountdownLaunch'
import { PhaseHeader } from './PhaseHeader'
import { OnlineActionBar, onlineActionBarPadding } from './OnlineActionBar'
import { TargetGrid } from './TargetGrid'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DIL_VOTE_MS, type DilClientView } from '@/lib/dilemmes/engine'
import { dilMinorityChoice, dilWhoTally } from '@/lib/dilemmes/reveal'
import { botAvatarFromName, botTickDelayMs } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { useAdvanceTick, useBotReferee } from '@/hooks/useBotReferee'
import { useGameAction } from '@/hooks/useGameAction'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, useMemberCosmetics } from './OnlinePlayerTag'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { XpGainBanner } from './XpGainBanner'
import { OnlineEndScreen } from './OnlineEndScreen'

/**
 * DILEMMES en ligne (serveur-autoritaire). Votes SECRETS pendant la manche
 * (seul `hasVoted` circule), révélés d'un coup — la minorité trinque en mode
 * Apéro. Pas de score ni de vainqueur : c'est le brise-glace de la soirée.
 *
 * Voter se fait en DEUX TEMPS : un toucher choisit, le bouton de la barre du
 * bas envoie. Le vote est définitif côté moteur (ALREADY_VOTED), et la carte
 * se fait défiler au pouce : un toucher accroché en passant votait.
 */

function parseView(json: string | null | undefined): DilClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as DilClientView
    return Array.isArray(v.players) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

/** Index de coin de la carte : ornement calé dans la marge gauche, pas du texte à lire. */
function CardCorner({ choice }: { choice: 'A' | 'B' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'absolute left-2.5 top-2 font-display text-[11px] font-black leading-tight',
        choice === 'A' ? 'text-suit-red' : 'text-[#24201A]'
      )}
    >
      A<br />{choice === 'A' ? '♥' : '♠'}
    </span>
  )
}

/**
 * Réponse d'un « Tu préfères » / « Je n'ai jamais ». Pendant le vote, une
 * carte qu'on SOULÈVE (bouton à bascule) ; à la révélation, une carte posée
 * qui montre son camp. Chaque état a son signe hors couleur : coche quand
 * elle est choisie, roue quand le vote part, pastille « Ton vote ».
 */
function ChoiceCard({
  choice,
  label,
  interactive,
  selected,
  pending,
  mine,
  dimmed,
  minority,
  results,
  labels,
  onToggle,
}: {
  choice: 'A' | 'B'
  label: string
  interactive: boolean
  selected: boolean
  pending: boolean
  mine: boolean
  dimmed: boolean
  minority: boolean
  results: { pct: number; voters: string[] } | null
  labels: { yourVote: string; minority: string; sending: string }
  onToggle: () => void
}) {
  const marked = selected || mine
  const className = cn(
    'relative block w-full rounded-2xl border bg-cream py-4 pl-9 pr-4 text-left text-[#24201A] shadow-[0_8px_18px_-10px_rgba(0,0,0,0.65)] transition-all',
    marked ? 'border-gold ring-[3px] ring-gold' : 'border-[#D8CCAE]',
    selected && '-translate-y-0.5',
    interactive && !selected && 'hover:-translate-y-0.5 active:scale-[0.98]',
    dimmed && 'opacity-60'
  )
  const body = (
    <>
      <CardCorner choice={choice} />
      <span className="flex items-start gap-2">
        <span className="min-w-0 flex-1 break-words text-base font-bold leading-snug">{label}</span>
        {pending ? (
          <Loader2 className="mt-0.5 h-5 w-5 shrink-0 text-[#6B6455] motion-safe:animate-spin" aria-hidden />
        ) : selected ? (
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[#24201A]" aria-hidden>
            <Check className="h-4 w-4" strokeWidth={3} />
          </span>
        ) : null}
      </span>
      {(mine || minority) && (
        <span className="mt-2 flex flex-wrap gap-1.5">
          {mine && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-[#24201A]">
              <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
              {labels.yourVote}
            </span>
          )}
          {minority && (
            <span className="inline-flex items-center rounded-full border border-suit-red px-2 py-0.5 text-xs font-bold text-suit-red">
              {labels.minority}
            </span>
          )}
        </span>
      )}
      {results && (
        <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className={cn('font-display text-xl font-black tabular-nums', choice === 'A' ? 'text-suit-red' : 'text-chip-blue')}>
            {results.pct} %
          </span>
          {/* Les PSEUDOS des votants, directement lisibles (pas d'icônes). */}
          {results.voters.map((name, i) => (
            <span
              key={`${name}-${i}`}
              className="max-w-full truncate rounded-full border border-[#24201A]/20 bg-[#24201A]/5 px-2 py-0.5 text-sm font-semibold text-[#24201A]"
            >
              {name}
            </span>
          ))}
        </span>
      )}
      {pending && <span className="sr-only">{` (${labels.sending})`}</span>}
    </>
  )

  if (!interactive && !pending && results) {
    return <div className={className}>{body}</div>
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!interactive}
      aria-pressed={marked}
      aria-busy={pending || undefined}
      className={cn(
        className,
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-felt-deep'
      )}
    >
      {body}
    </button>
  )
}

export function DilemmesOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.dilemmes.game')
  const tCommon = useTranslations('common')
  const { busy, actionError, sendAction } = useGameAction(room?.id)
  const reduceMotion = useReducedMotion()
  // Choix soulevé, rattaché à la manche où il a été fait : la carte suivante
  // (ou le chrono échu) l'oublie sans effet à part.
  const [pick, setPick] = useState<{ key: string; choice: string } | null>(null)
  const [sending, setSending] = useState<string | null>(null)

  const inGame = room?.gameId === 'dilemmes' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const tutorial = useGameTutorial('dilemmes', inGame)
  const cosmetics = useMemberCosmetics(room)
  const isSoft = user?.ambianceMode === 'soft'

  // Tick « advance » à l'échéance, arbitré par rang (cf. useAdvanceTick).
  useAdvanceTick({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    advance:
      view && view.phaseEndsAt !== null ? { phaseKey: view.phaseKey, dueAt: view.phaseEndsAt } : null,
  })

  // Ticks « arbitre » (bots + remplacement), avec secours par rang.
  const pendingBot =
    view?.phase === 'vote'
      ? view.players.find((p) => p.isBot && !p.hasVoted && !p.leftAt)
      : undefined
  const revealActor =
    view?.phase === 'reveal'
      ? view.players.find((p) => p.id === room?.currentTurnUserId)
      : undefined
  useBotReferee({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    botTick: pendingBot
      ? // Tempo de « réflexion » du persona : les votes bots s'étalent dans la manche.
        { body: { action: 'bot' }, delayMs: botTickDelayMs(pendingBot.name) }
      : revealActor?.isBot
        ? // Le bot meneur enchaîne à son tempo, mais laisse le temps de lire la révélation.
          { body: { action: 'bot' }, delayMs: Math.max(3500, botTickDelayMs(revealActor.name)) }
        : null,
    replaceLeft: Boolean(view?.players.some((p) => !p.isBot && p.leftAt)),
  })

  if (!inGame) {
    return <GameOnlineLobby gameId="dilemmes" />
  }

  if (!view || !user || !room) {
    return (
      <div role="status" className="flex flex-1 items-center justify-center p-6 text-cream/70">
        <div aria-hidden className="h-8 w-8 rounded-full border-2 border-rose-400/30 border-t-rose-400 motion-safe:animate-spin" />
        <span className="sr-only">{tCommon('loading')}</span>
      </div>
    )
  }

  const finished = view.phase === 'finished'
  const card = view.card
  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? '—'
  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot
      ? botAvatarFromName(p.name)
      : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'

  const votedCount = view.players.filter((p) => p.hasVoted && !p.leftAt).length
  const activeCount = view.players.filter((p) => !p.leftAt).length
  const reveal = view.lastReveal

  // ── Fin de partie ────────────────────────────────────────────────────────
  if (finished) {
    return (
      <OnlineEndScreen
        rematchVotes={view.rematchVotes ?? []}
        onRematch={voteRematch}
        onLeave={leaveRoom}
        header={
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={reduceMotion ? { duration: 0.2 } : { type: 'spring', stiffness: 220, damping: 18 }}
            className="flex flex-col items-center gap-2 text-center"
          >
            <Scale className="h-14 w-14 text-rose-300" aria-hidden />
            <h2 className="font-display text-3xl font-bold text-gold">{t('finished.title')}</h2>
            <p className="max-w-xs text-sm text-cream/80">{t('finished.subtitle')}</p>
          </motion.div>
        }
        // XP de participation (jeu sans gagnant) — won:false → +20.
        xp={<XpGainBanner won={false} playerIds={view.players.map((p) => p.id)} className="w-full max-w-sm" />}
      />
    )
  }

  // ── Compte à rebours ─────────────────────────────────────────────────────
  if (view.phase === 'countdown') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-cream">
        <p className="font-display text-xl font-bold text-gold">{t('countdown.title')}</p>
        <PhaseCountdownLaunch endsAt={view.phaseEndsAt} className="text-8xl font-black tabular-nums text-rose-200" />
        <p className="text-sm font-semibold text-cream/70">{t('countdown.hint')}</p>
      </div>
    )
  }

  // ── Manche en cours ──────────────────────────────────────────────────────
  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)
  const isVote = view.phase === 'vote'
  const isReveal = view.phase === 'reveal'
  const isWho = card?.kind === 'who'
  // Un membre hors partie, ou parti en pleine manche, verrait son vote refusé
  // (UNKNOWN_PLAYER) : il regarde sans pouvoir choisir.
  const amSeated = view.players.some((p) => p.id === user.id && !p.leftAt)
  const canVote = isVote && amSeated && !view.myVote && card !== null
  // « Carte suivante » : le moteur l'accepte de tout joueur de la partie, pas
  // d'un membre arrivé après le lancement (UNKNOWN_PLAYER).
  const canContinue = isReveal && view.players.some((p) => p.id === user.id)
  const whoTargets = view.players.filter((p) => !p.leftAt && p.id !== user.id)

  // Choix soulevé encore valable : même manche, vote pas encore parti, cible
  // toujours à la table (une resynchro peut l'avoir fait partir).
  const picked =
    canVote && pick && pick.key === view.phaseKey
      ? isWho
        ? whoTargets.some((p) => p.id === pick.choice)
          ? pick.choice
          : null
        : pick.choice === 'A' || pick.choice === 'B'
          ? pick.choice
          : null
      : null
  const selectChoice = (choice: string | null) => setPick(choice ? { key: view.phaseKey, choice } : null)
  // sendAction ne lève jamais : `ok` faux (refus, réseau) garde le choix pour
  // réessayer, le message d'erreur s'affiche dans la barre.
  const confirmVote = async () => {
    if (!picked) return
    setSending(picked)
    const res = await sendAction({ action: 'vote', choice: picked })
    setSending(null)
    if (res?.ok) setPick(null)
  }

  const revealEntries = isReveal ? reveal ?? [] : []
  const minority = isReveal && !isWho ? dilMinorityChoice(revealEntries) : null
  const choiceLabels = { yourVote: t('yourVote'), minority: t('minority'), sending: tCommon('sending') }

  const choiceCard = (choice: 'A' | 'B', label: string) => {
    const voters = revealEntries.filter((r) => r.choice === choice)
    return (
      <ChoiceCard
        key={choice}
        choice={choice}
        label={label}
        interactive={canVote && !busy}
        selected={picked === choice}
        pending={sending === choice}
        mine={view.myVote === choice}
        // Vote parti : l'autre réponse s'efface, la sienne reste en pleine lumière.
        dimmed={isVote && Boolean(view.myVote) && view.myVote !== choice}
        minority={minority === choice}
        results={
          isReveal
            ? {
                pct: Math.round((voters.length / (revealEntries.length || 1)) * 100),
                voters: voters.map((r) => nameOf(r.voterId)),
              }
            : null
        }
        labels={choiceLabels}
        onToggle={() => selectChoice(picked === choice ? null : choice)}
      />
    )
  }

  const tally = isReveal && isWho ? dilWhoTally(view.players, revealEntries) : null
  const iAmTop = Boolean(tally?.topIds.includes(user.id))

  const voteButtonLabel = picked
    ? isWho
      ? t('designate', { name: nameOf(picked) })
      : t('confirmVote')
    : isWho
      ? t('pickPlayer')
      : t('pickChoice')

  // Un refus du serveur prend la ligne d'état (3 s) : un bloc de plus
  // dépasserait la réserve `tall` et masquerait le bas du flux.
  const barStatus: ReactNode = actionError ? (
    <span className="font-semibold text-red-300">{actionError}</span>
  ) : isVote
    ? view.myVote
      ? t('voted', { count: votedCount, total: activeCount })
      : t('voteProgress', { count: votedCount, total: activeCount })
    : null

  return (
    <>
    <div
      className={cn(
        'flex flex-1 flex-col gap-3 p-3 text-cream sm:mx-auto sm:w-full sm:max-w-lg',
        onlineActionBarPadding('tall')
      )}
    >
      <PhaseHeader
        round={t('round', { n: view.round + 1, total: view.totalRounds })}
        phase={isReveal ? t('phaseReveal') : t('phaseVote')}
        endsAt={isVote ? view.phaseEndsAt : null}
        total={DIL_VOTE_MS}
        dangerMs={8_000}
        right={<TutorialReopenButton onClick={tutorial.reopen} className="h-11 w-11" />}
      />

      {leftPlayer?.leftAt && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-center text-sm font-semibold text-amber-100">
          <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
            {({ seconds }) => t('waitingReturn', { name: leftPlayer.name, seconds })}
          </PhaseCountdown>
        </div>
      )}

      {/* La carte */}
      {card && (card.kind === 'prefer' ? (
        <div className="space-y-2">
          <p className="text-center font-display text-lg font-bold text-cream">{t('preferPrompt')}</p>
          {choiceCard('A', card.a)}
          <p aria-hidden className="text-center font-display text-xs font-bold uppercase tracking-[0.3em] text-gold">— {t('or')} —</p>
          {choiceCard('B', card.b)}
        </div>
      ) : card.kind === 'never' ? (
        <div className="space-y-2">
          <p className="text-center font-display text-lg font-bold leading-snug text-cream">
            {t('neverPrompt')} {card.text}
          </p>
          {choiceCard('A', t('neverDid'))}
          {choiceCard('B', t('neverNever'))}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-center font-display text-lg font-bold leading-snug text-cream">
            {t('whoPrompt')} {card.text}
          </p>
          {/* Au vote, on ne se désigne pas soi-même : la grille sans moi. */}
          {isVote && (
            <TargetGrid
              mode="select"
              players={whoTargets}
              iconOf={iconOf}
              selectedId={picked}
              onSelect={selectChoice}
              chosenId={view.myVote ?? null}
              disabled={!canVote || busy}
              pendingId={sending}
              youLabel={t('you')}
              selfId={user.id}
            />
          )}
        </div>
      ))}

      {/* « Qui de la table » révélé : le verdict nommé, puis TOUTE la table
          (moi compris) classée par voix — on voit aussi celles qu'on a reçues. */}
      {tally && (
        <>
          <motion.section
            aria-labelledby="dil-verdict"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={reduceMotion ? { duration: 0.2 } : { type: 'spring', stiffness: 260, damping: 20 }}
            className="rounded-2xl border border-gold bg-cream px-4 py-4 text-center text-[#24201A] shadow-[0_10px_24px_-12px_rgba(0,0,0,0.8)] ring-2 ring-gold"
          >
            {tally.topIds.length > 0 ? (
              <>
                <h3 id="dil-verdict" className="text-sm font-bold text-[#24201A]">
                  {isSoft
                    ? t('who.topTitle', { count: tally.topIds.length })
                    : t('who.topDrinks', { count: tally.topIds.length })}
                </h3>
                {iAmTop && <p className="mt-1 font-display text-xl font-bold text-suit-red">{t('who.itsYou')}</p>}
                <ul className="mt-2 space-y-1">
                  {tally.topIds.map((id) => {
                    const p = view.players.find((x) => x.id === id)
                    return (
                      <li key={id} className="flex items-center justify-center gap-2">
                        {p && (
                          <span aria-hidden className="shrink-0 text-2xl">
                            <PlayerAvatarGlyph value={iconOf(p)} />
                          </span>
                        )}
                        <span className="min-w-0 break-words font-display text-2xl font-bold leading-tight">
                          {nameOf(id)}
                          {id === user.id && <span className="text-base font-semibold text-[#6B6455]"> {t('you')}</span>}
                        </span>
                      </li>
                    )
                  })}
                </ul>
                <p className="mt-2 text-sm font-semibold">{t('who.votes', { count: tally.top })}</p>
              </>
            ) : (
              <h3 id="dil-verdict" className="font-display text-lg font-bold">{t('who.nobody')}</h3>
            )}
          </motion.section>

          <section aria-labelledby="dil-ranking" className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
            <h3 id="dil-ranking" className="mb-2 text-center text-xs font-semibold uppercase tracking-[0.18em] text-gold">
              {t('who.rankingTitle')}
            </h3>
            <ol className="space-y-1.5">
              {tally.rows.map((row) => {
                const p = view.players.find((x) => x.id === row.id)
                const mine = row.id === user.id
                const top = tally.topIds.includes(row.id)
                return (
                  <li
                    key={row.id}
                    className={cn('rounded-xl px-2.5 py-2', mine && 'bg-gold/10 ring-1 ring-gold/40')}
                  >
                    <div className="flex items-center gap-2">
                      {p && (
                        <span aria-hidden className="shrink-0 text-lg">
                          <PlayerAvatarGlyph value={iconOf(p)} />
                        </span>
                      )}
                      <OnlinePlayerName
                        name={nameOf(row.id)}
                        cosmetics={cosmetics.get(row.id)}
                        className="min-w-0 truncate text-sm font-bold text-cream"
                      />
                      {mine && <span className="shrink-0 text-sm font-semibold text-cream/70">{t('you')}</span>}
                      {/* Parti après avoir reçu des voix : il reste au classement, signalé. */}
                      {Boolean(p?.leftAt) && (
                        <>
                          <WifiOff className="h-4 w-4 shrink-0 text-cream/80" aria-hidden />
                          <span className="sr-only">{` (${t('awayTag')})`}</span>
                        </>
                      )}
                      <span
                        className={cn(
                          'ml-auto shrink-0 text-sm font-black tabular-nums',
                          top ? 'text-gold' : row.votes > 0 ? 'text-cream' : 'text-cream/70'
                        )}
                      >
                        {t('who.votes', { count: row.votes })}
                      </span>
                    </div>
                    <div aria-hidden className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/30">
                      <div
                        className={cn('h-full rounded-full', top ? 'bg-gold' : 'bg-red-400')}
                        style={{ width: `${tally.top > 0 ? (row.votes / tally.top) * 100 : 0}%` }}
                      />
                    </div>
                    {row.voterIds.length > 0 && (
                      <p className="mt-1 break-words text-sm text-cream/70">
                        {t('who.by', { names: row.voterIds.map(nameOf).join(', ') })}
                      </p>
                    )}
                  </li>
                )
              })}
            </ol>
          </section>
        </>
      )}

      {isReveal && !isSoft && !isWho && (
        <p className="text-center font-display text-lg font-bold text-amber-200">{t('minorityDrinks')}</p>
      )}

      {/* Table pendant le vote : qui a voté (jamais QUOI) — chaque état a son signe. */}
      {isVote && (
        <ul aria-label={t('tableLabel')} className="flex flex-wrap justify-center gap-2">
          {view.players.map((p) => {
            const away = Boolean(p.leftAt)
            const voted = p.hasVoted && !away
            return (
              <li
                key={p.id}
                className={cn(
                  'inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold',
                  voted
                    ? 'border-emerald-400/50 bg-emerald-500/10 text-cream'
                    : 'border-gold/20 bg-felt-deep/70 text-cream/90',
                  away && 'opacity-40'
                )}
              >
                <span aria-hidden className="shrink-0">
                  <PlayerAvatarGlyph value={iconOf(p)} />
                </span>
                <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} className="min-w-0 truncate" />
                {voted && (
                  <>
                    <Check className="h-4 w-4 shrink-0 text-emerald-300" strokeWidth={3} aria-hidden />
                    <span className="sr-only">{` (${t('votedTag')})`}</span>
                  </>
                )}
                {away && (
                  <>
                    <WifiOff className="h-4 w-4 shrink-0 text-cream/80" aria-hidden />
                    <span className="sr-only">{` (${t('awayTag')})`}</span>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>

    {/* Montée toute la manche : sa région live annonce le décompte des votes ;
        seuls les boutons du moment vont et viennent. Un simple spectateur n'a
        rien à faire de la révélation : pas de barre vide. */}
    {(isVote || canContinue) && (
      <OnlineActionBar status={barStatus} maxWidthClass="max-w-lg">
        {canVote && (
          <div className="flex gap-2">
            <Button
              variant="quiet"
              size="gameLg"
              className="shrink-0"
              disabled={!picked || busy}
              onClick={() => setPick(null)}
            >
              {tCommon('cancel')}
            </Button>
            <Button
              variant="primary"
              size="gameLg"
              className="min-w-0 flex-1 whitespace-normal leading-tight"
              disabled={!picked || busy}
              onClick={() => void confirmVote()}
            >
              {sending !== null && <Loader2 className="mr-2 h-5 w-5 shrink-0 motion-safe:animate-spin" aria-hidden />}
              <span className="line-clamp-2 break-words">{voteButtonLabel}</span>
            </Button>
          </div>
        )}
        {canContinue && (
          <Button
            variant="primary"
            size="gameLg"
            className="w-full"
            disabled={busy}
            onClick={() => void sendAction({ action: 'continue' })}
          >
            {busy && <Loader2 className="mr-2 h-5 w-5 shrink-0 motion-safe:animate-spin" aria-hidden />}
            {view.round + 1 >= view.totalRounds ? t('seeEnd') : t('nextCard')}
          </Button>
        )}
      </OnlineActionBar>
    )}

    <AnimatePresence>
      {tutorial.open && <GameTutorialModal gameId="dilemmes" onClose={tutorial.close} />}
    </AnimatePresence>
    </>
  )
}
