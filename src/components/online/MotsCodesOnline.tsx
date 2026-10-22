"use client"

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Bot, Eye, KeyRound, Loader2, Send, Skull, SkipForward, Trophy, WifiOff } from 'lucide-react'
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
  MC_CLUE_MAX_LEN,
  MC_CLUE_MS,
  MC_GUESS_MS,
  mcClueOnGrid,
  type MCClientView,
  type MCTeam,
  type MCTileView,
} from '@/lib/mots-codes/engine'
import { mcTileTextClass } from '@/lib/mots-codes/tile-text'
import { botTickDelayMs } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { useAdvanceTick, useBotReferee } from '@/hooks/useBotReferee'
import { useGameAction } from '@/hooks/useGameAction'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, useMemberCosmetics } from './OnlinePlayerTag'
import { XpGainBanner } from './XpGainBanner'
import { PlayingCardBack } from '@/components/ui/PlayingCard'
import { playerIcon, speechFeedItems } from './bot-speech/bot-speech-feed'
import { MotsCodesSpeechFeed } from './mots-codes/MotsCodesSpeechFeed'

/**
 * MOTS CODÉS en ligne (serveur-autoritaire). Vue déjà filtrée : seuls les
 * maîtres-mots reçoivent la solution ; les autres ne voient que les tuiles
 * révélées. L'indice se donne À VOIX HAUTE au vocal, le champ le fige pour
 * l'arbitrage (mot + nombre affichés à tous).
 */

function parseView(json: string | null | undefined): MCClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as MCClientView
    return Array.isArray(v.players) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

/**
 * Chaque équipe a une FORME en plus de sa couleur : l'or et le rouge se
 * confondent pour un daltonien, et le même ◆ servait aux deux équipes.
 * U+FE0E : le cœur reste un glyphe de texte (à la couleur de l'équipe) au
 * lieu de virer à l'emoji rouge sur certains téléphones.
 */
const TEAM_GLYPH: Record<MCTeam, string> = { gold: '◆', red: '♥︎' }
const TEAM_TEXT: Record<MCTeam, string> = { gold: 'text-gold', red: 'text-red-300' }
const TEAM_BADGE: Record<MCTeam, string> = {
  gold: 'bg-amber-500 text-[#24201A]',
  red: 'bg-suit-red text-cream',
}
const TEAM_PILL: Record<MCTeam, string> = {
  gold: 'border-gold/40 bg-gold/10 text-amber-100',
  red: 'border-red-400/40 bg-red-500/10 text-red-100',
}

const otherTeamOf = (team: MCTeam): MCTeam => (team === 'gold' ? 'red' : 'gold')

/** Padding du flux sous la barre de l'indice : ligne d'état, champ h-12, bouton h-14. */
const CLUE_BAR_PADDING = 'pb-[calc(12rem+env(safe-area-inset-bottom,0px))]'

type TileLike = Pick<MCTileView, 'kind' | 'revealed'>

/**
 * Habillage d'une tuile.
 * - CLÉ du maître-mot (couleur connue, pas encore révélée) : aplat plein,
 *   comme la carte-clé du vrai jeu. Un liseré de 1 px sur du crème ne se
 *   distinguait pas à bout de bras (1,3:1 pour l'or).
 * - RÉVÉLÉE (pour tous) : teinte atténuée et mot barré, pour ne jamais la
 *   confondre avec la clé.
 * - Inconnue : carte crème.
 */
function tileFace(tile: TileLike): string {
  switch (tile.kind) {
    case 'gold':
      return tile.revealed ? 'border-gold/40 bg-gold/40 text-cream' : 'border-gold-strong bg-amber-500 text-[#24201A]'
    case 'red':
      return tile.revealed ? 'border-red-400/40 bg-suit-red/40 text-cream' : 'border-[#7E241D] bg-suit-red text-cream'
    case 'neutral':
      return tile.revealed ? 'border-cream/20 bg-black/20 text-cream/70' : 'border-[#D8CCAE] bg-cream text-[#24201A]'
    case 'assassin':
      return 'border-black bg-[#141210] text-cream'
    default:
      return 'border-[#D8CCAE] bg-cream text-[#24201A]'
  }
}

/**
 * Marque de coin (◆ Or, ♥ Rouge, crâne de l'assassin) : la forme double la
 * couleur. Elle prend l'encre de la tuile : sur une tuile révélée (aplat
 * atténué), l'or du ◆ ne se détachait qu'à 2,8:1, alors que c'est justement
 * la forme qui distingue l'or du rouge pour un daltonien.
 */
function TileMark({ tile }: { tile: TileLike }) {
  if (tile.kind === 'assassin') {
    return <Skull aria-hidden className="pointer-events-none absolute left-1 top-1 h-3.5 w-3.5" />
  }
  if (tile.kind !== 'gold' && tile.kind !== 'red') return null
  return (
    <span aria-hidden className="pointer-events-none absolute left-1 top-0.5 text-xs leading-none">
      {TEAM_GLYPH[tile.kind]}
    </span>
  )
}

/** Pastille « Ton équipe : Or », clé en plus pour le maître-mot. */
function TeamBadge({ team, label, masterLabel }: { team: MCTeam; label: string; masterLabel?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold leading-tight',
        TEAM_BADGE[team]
      )}
    >
      <span aria-hidden>{TEAM_GLYPH[team]}</span>
      {label}
      {masterLabel && (
        <>
          <KeyRound aria-hidden className="h-4 w-4" />
          <span className="sr-only">{masterLabel}</span>
        </>
      )}
    </span>
  )
}

export function MotsCodesOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.mots-codes.game')
  const tc = useTranslations('common')
  const tl = useTranslations('onlineLobby.seat')
  const locale = useLocale()
  const format = useFormatter()
  const { busy, actionError, sendAction } = useGameAction(room?.id)
  const reduceMotion = useReducedMotion()
  const [clueWord, setClueWord] = useState('')
  const [clueCount, setClueCount] = useState(2)
  // Tuile désignée, attachée à SA phase : une sélection ne ressurgit pas au
  // tour suivant de l'équipe, même si la tuile n'a pas été jouée.
  const [pick, setPick] = useState<{ phaseKey: string; tile: number } | null>(null)
  const [sendingTile, setSendingTile] = useState<number | null>(null)
  // « Passer la main ? » demandé pendant CETTE phase : le dialogue se referme
  // seul si la main passe entre-temps (erreur d'un coéquipier, temps écoulé),
  // au lieu de rester ouvert sur une question périmée.
  const [passAskKey, setPassAskKey] = useState<string | null>(null)

  const inGame = room?.gameId === 'mots-codes' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const tutorial = useGameTutorial('mots-codes', inGame)
  const cosmetics = useMemberCosmetics(room)
  const currentPhaseKey = view?.phaseKey

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

  // Ticks bots (maître-mot devenu bot, équipe muette) + remplacement, avec
  // secours par rang (cf. useBotReferee).
  const clueMaster =
    view?.phase === 'clue'
      ? view.players.find((p) => p.team === view.activeTeam && p.isSpymaster)
      : undefined
  const activeGuessers =
    view?.phase === 'guess'
      ? view.players.filter((p) => p.team === view.activeTeam && !p.isSpymaster && !p.leftAt)
      : null
  const masterIsBot = Boolean(clueMaster?.isBot)
  const guessersAllBots = activeGuessers !== null && activeGuessers.every((p) => p.isBot)
  useBotReferee({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    botTick:
      masterIsBot || guessersAllBots
        ? {
            body: { action: 'bot' },
            delayMs: botTickDelayMs(masterIsBot ? clueMaster?.name : activeGuessers?.[0]?.name),
          }
        : null,
    replaceLeft: Boolean(view?.players.some((p) => !p.isBot && p.leftAt)),
  })

  // Champ vidé à chaque nouvelle phase seulement : un départ ou un retour de
  // joueur (nouvelle version d'état) n'efface plus l'indice en cours de frappe.
  useEffect(() => {
    setClueWord('')
  }, [currentPhaseKey])

  if (!inGame) {
    return <GameOnlineLobby gameId="mots-codes" />
  }

  if (!view || !user || !room) {
    return (
      <div role="status" className="flex flex-1 items-center justify-center p-6 text-cream/70">
        <Loader2 aria-hidden className="h-8 w-8 animate-spin text-gold" />
        <span className="sr-only">{tc('loading')}</span>
      </div>
    )
  }

  const me = view.players.find((p) => p.id === user.id)
  const finished = view.phase === 'finished'
  const activeMaster = view.players.find((p) => p.team === view.activeTeam && p.isSpymaster)
  const myMaster = me ? view.players.find((p) => p.team === me.team && p.isSpymaster) : undefined
  const iAmActiveMaster = view.phase === 'clue' && activeMaster?.id === user.id
  const iCanGuess = Boolean(
    view.phase === 'guess' && me && me.team === view.activeTeam && !me.isSpymaster && !me.leftAt
  )

  const totalPhaseMs = view.phase === 'clue' ? MC_CLUE_MS : MC_GUESS_MS
  const teamName = (team: MCTeam) => (team === 'gold' ? t('teamGold') : t('teamRed'))
  const iconOf = (p: { id: string; name: string; isBot: boolean }) => playerIcon(p, room.members)
  const hasBots = view.players.some((p) => p.isBot)
  const tileSrLabel = (tile: TileLike) => {
    if (!tile.kind) return null
    const kind =
      tile.kind === 'neutral' ? t('tileNeutral') : tile.kind === 'assassin' ? t('tileAssassin') : teamName(tile.kind)
    return tile.revealed ? `${kind}, ${t('tileRevealed')}` : kind
  }

  // ── Écran de fin ─────────────────────────────────────────────────────────
  if (finished) {
    const won = me && view.winnerTeam === me.team
    return (
      <OnlineEndScreen
        confetti={Boolean(won)}
        won={Boolean(won)}
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
              {view.winnerTeam ? t('victory.teamWins', { team: teamName(view.winnerTeam) }) : t('victory.tie')}
            </h2>
            {me && <TeamBadge team={me.team} label={t('yourTeam', { team: teamName(me.team) })} />}
            {view.loseReason === 'assassin' && (
              <p className="flex items-center gap-1.5 text-sm font-semibold text-red-300">
                <Skull aria-hidden className="h-4 w-4 shrink-0" />
                {t('victory.assassin')}
              </p>
            )}
          </motion.div>
        }
        ranking={
          <div className="flex w-full max-w-sm flex-col gap-3">
            {/* La réaction au coup final (l'assassin, le dernier mot), au-dessus de la grille. */}
            {speechFeedItems(view.speech ?? [], view.turn ?? 0, user.id).length > 0 && (
              <MotsCodesSpeechFeed view={view} iconOf={iconOf} meId={user.id} variant="phone" />
            )}
            {/* Grille résolue : la clé en aplat, les tuiles jouées atténuées et barrées. */}
            <div className="grid w-full grid-cols-5 gap-1">
              {view.tiles.map((tile, i) =>
                tile.kind === 'assassin' ? (
                  <div key={i} className="relative aspect-[5/4]">
                    <PlayingCardBack className="h-full w-full rounded-md" />
                    <span className="sr-only">{`${tile.word}, ${t('tileAssassin')}`}</span>
                  </div>
                ) : (
                  <div
                    key={i}
                    className={cn(
                      'relative flex aspect-[5/4] items-center justify-center rounded-md border px-1 text-center font-bold uppercase hyphens-auto [overflow-wrap:anywhere]',
                      // leading APRÈS la taille : tailwind-merge retire un leading posé avant un text-<taille>.
                      mcTileTextClass(tile.word),
                      'leading-tight',
                      tileFace(tile)
                    )}
                  >
                    <TileMark tile={tile} />
                    <span className={cn(tile.revealed && 'line-through decoration-2')}>{tile.word}</span>
                    <span className="sr-only">{`, ${tileSrLabel(tile) ?? ''}`}</span>
                  </div>
                )
              )}
            </div>
          </div>
        }
        xp={<XpGainBanner won={Boolean(won)} playerIds={view.players.map((p) => p.id)} className="w-full max-w-sm" />}
      />
    )
  }

  // ── Compte à rebours ─────────────────────────────────────────────────────
  if (view.phase === 'countdown') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-cream">
        <p className="font-display text-xl font-bold text-gold">{t('countdown.title')}</p>
        <PhaseCountdownLaunch
          endsAt={view.phaseEndsAt}
          className="font-display text-8xl font-black tabular-nums text-gold"
        />
        {me && (
          <TeamBadge
            team={me.team}
            label={t('yourTeam', { team: teamName(me.team) })}
            masterLabel={me.isSpymaster ? t('roleMaster') : undefined}
          />
        )}
        <p className="max-w-xs text-center text-sm font-semibold text-cream/80">
          {me?.isSpymaster ? t('countdown.hintMaster') : t('countdown.hintGuesser')}
        </p>
      </div>
    )
  }

  // ── Partie en cours ──────────────────────────────────────────────────────
  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)
  const myTurn = view.phase === 'clue' ? iAmActiveMaster : iCanGuess

  // Tuile désignée (désigner puis valider) : valable pour cette phase, et
  // tant que personne ne l'a révélée entre-temps.
  const pickTile =
    iCanGuess && pick && pick.phaseKey === view.phaseKey && !view.tiles[pick.tile]?.revealed ? pick.tile : null
  // En capitales, comme sur la tuile (CSS `uppercase`) : le joueur relit dans
  // le bouton exactement le mot qu'il a désigné.
  const pickWord = pickTile !== null ? view.tiles[pickTile].word.toLocaleUpperCase(locale) : null

  const clueTrimmed = clueWord.trim()
  const clueHasSpace = /\s/.test(clueTrimmed)
  const clueIsOnGrid = clueTrimmed.length > 0 && !clueHasSpace && mcClueOnGrid(view.tiles, clueTrimmed)
  const clueOk = clueTrimmed.length > 0 && clueTrimmed.length <= MC_CLUE_MAX_LEN && !clueHasSpace && !clueIsOnGrid

  // Qui a la main, nommément : le Maître-mot à l'indice, ses devineurs ensuite
  // (« Au tour de Chloé et Damien ») plutôt qu'un « En attente des autres
  // joueurs » qui ne dit pas quelle équipe joue.
  const turnName =
    view.phase === 'clue'
      ? activeMaster?.name
      : activeGuessers && activeGuessers.length > 0
        ? format.list(activeGuessers.map((p) => p.name), { type: 'conjunction' })
        : undefined
  let turnHint: ReactNode
  if (view.phase === 'clue') {
    turnHint = iAmActiveMaster
      ? t('cluePrompt')
      : !me
        ? undefined
        : me.team === view.activeTeam
          ? t('turn.clueTeam')
          : t('turn.clueOther', { team: teamName(view.activeTeam) })
  } else {
    turnHint = iCanGuess
      ? t('turn.guessMine')
      : me?.isSpymaster && me.team === view.activeTeam
        ? t('turn.guessMaster')
        : t('waitingGuess', { team: teamName(view.activeTeam) })
  }

  const errorLine = actionError ? <span className="font-semibold text-red-300">{actionError}</span> : null
  const showClueBar = iAmActiveMaster
  const showGuessBar = iCanGuess

  const submitClue = async () => {
    if (!clueOk || busy) return
    await sendAction({ action: 'clue', word: clueTrimmed, count: clueCount })
  }

  const confirmGuess = async () => {
    if (pickTile === null || busy) return
    setSendingTile(pickTile)
    const res = await sendAction({ action: 'guess', tile: pickTile })
    setSendingTile(null)
    if (res?.ok) setPick(null)
  }

  // Passer la main clôt le tour de l'équipe : un toucher égaré à côté de
  // « Révéler » ne doit pas le décider seul.
  const passOpen = iCanGuess && passAskKey === view.phaseKey

  return (
    <>
    <div
      className={cn(
        'flex flex-1 flex-col gap-3 p-3 sm:mx-auto sm:w-full sm:max-w-lg',
        showClueBar ? CLUE_BAR_PADDING : showGuessBar ? onlineActionBarPadding('tall') : 'pb-6'
      )}
    >
      <PhaseHeader
        phase={
          <>
            <span aria-hidden className={cn('mr-1.5', TEAM_TEXT[view.activeTeam])}>{TEAM_GLYPH[view.activeTeam]}</span>
            {view.phase === 'clue'
              ? t('phaseClue', { team: teamName(view.activeTeam) })
              : t('phaseGuess', { team: teamName(view.activeTeam) })}
          </>
        }
        endsAt={view.phaseEndsAt}
        total={totalPhaseMs}
        dangerMs={15_000}
        right={<TutorialReopenButton onClick={tutorial.reopen} className="h-11 w-11" />}
        status={
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            {me ? (
              <TeamBadge
                team={me.team}
                label={t('yourTeam', { team: teamName(me.team) })}
                masterLabel={me.isSpymaster ? t('roleMaster') : undefined}
              />
            ) : (
              <span />
            )}
            <div className="flex items-center gap-3">
              {(['gold', 'red'] as const).map((team) => (
                <span key={team} className={cn('inline-flex items-baseline gap-1 text-sm font-bold', TEAM_TEXT[team])}>
                  <span aria-hidden>{TEAM_GLYPH[team]}</span>
                  {teamName(team)}
                  <span className="font-display text-lg font-black tabular-nums text-cream">{view.remaining[team]}</span>
                  <span className="sr-only">{t('tvRemaining')}</span>
                </span>
              ))}
            </div>
          </div>
        }
      />

      <TurnBanner
        mine={myTurn}
        name={turnName}
        avatar={
          <span className={myTurn ? undefined : TEAM_TEXT[view.activeTeam]}>{TEAM_GLYPH[view.activeTeam]}</span>
        }
        hint={turnHint}
        alertOnMine
      />

      {/* Coup refusé hors barre d'action (la barre l'affiche elle-même) — 3 s */}
      {actionError && !showClueBar && !showGuessBar && (
        <div
          role="alert"
          className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-2 text-center text-sm font-semibold text-red-300"
        >
          {actionError}
        </div>
      )}
      {leftPlayer?.leftAt && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-gold/30 bg-gold/10 px-4 py-2 text-center text-sm font-semibold text-cream">
          <WifiOff aria-hidden className="h-4 w-4 shrink-0 text-gold" />
          <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
            {({ seconds }) => t('waitingReturn', { name: leftPlayer.name, seconds })}
          </PhaseCountdown>
        </div>
      )}

      {/* Indice courant */}
      {view.phase === 'guess' && view.clue && (
        <div className="flex flex-col items-center gap-0.5 rounded-2xl border border-gold/40 bg-felt-deep/70 px-4 py-2.5">
          <p className="flex max-w-full flex-wrap items-baseline justify-center gap-x-3">
            <KeyRound aria-hidden className="h-5 w-5 self-center text-gold" />
            <span className="sr-only">{t('clueLabel')}</span>
            <span className="min-w-0 break-all font-display text-2xl font-bold uppercase tracking-[0.08em] text-cream">
              {view.clue.word}
            </span>
            <span className="font-display text-2xl font-black text-gold">· {view.clue.count}</span>
          </p>
          <p className="text-sm font-semibold text-cream/80">{t('guessesLeft', { count: view.guessesLeft })}</p>
        </div>
      )}

      {/* Grille 5×5. Taille du mot selon sa longueur (16 px pour « CHAT »,
          jamais sous 12 px) ; au-delà de 7 lettres, la césure coupe le mot
          proprement au lieu de le faire déborder. */}
      <div className="grid grid-cols-5 gap-1">
        {view.tiles.map((tile, i) => {
          if (tile.kind === 'assassin' && tile.revealed) {
            return (
              <div key={i} className="relative aspect-[5/4]">
                <PlayingCardBack className="h-full w-full rounded-lg" />
                <span className="sr-only">{`${tile.word}, ${t('tileAssassin')}`}</span>
              </div>
            )
          }
          // `playable` porte l'aspect (relief), `clickable` le geste : pendant
          // un envoi, la grille reste en relief au lieu de clignoter.
          const playable = iCanGuess && !tile.revealed
          const clickable = playable && !busy
          const selected = pickTile === i
          const pending = sendingTile === i
          // Devineur qui attend son tour : la grille s'efface, et s'allume
          // quand c'est à lui. La clé du maître-mot, elle, reste vive.
          const dimmed = !view.iSeeSolution && !iCanGuess && !tile.revealed
          const sr = tileSrLabel(tile)
          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                if (!clickable) return
                setPick(selected ? null : { phaseKey: view.phaseKey, tile: i })
              }}
              disabled={!clickable}
              aria-pressed={playable ? selected : undefined}
              className={cn(
                'relative flex aspect-[5/4] items-center justify-center rounded-lg border px-1 text-center font-bold uppercase transition-transform hyphens-auto [overflow-wrap:anywhere] motion-reduce:transition-none',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-felt-deep',
                mcTileTextClass(tile.word, true),
                'leading-tight',
                tileFace(tile),
                playable && 'shadow-[0_4px_10px_-6px_rgba(0,0,0,0.6)]',
                clickable && 'hover:-translate-y-0.5 active:scale-95',
                dimmed && 'opacity-70',
                (selected || pending) &&
                  'z-10 -translate-y-1 ring-[3px] ring-gold shadow-[0_10px_18px_-8px_rgba(217,164,65,0.8)]'
              )}
            >
              <TileMark tile={tile} />
              <span className={cn(tile.revealed && 'line-through decoration-2')}>{tile.word}</span>
              {sr && <span className="sr-only">{`, ${sr}`}</span>}
              {pending && (
                <Loader2 aria-hidden className="absolute right-0.5 top-0.5 h-3.5 w-3.5 animate-spin text-[#24201A]" />
              )}
            </button>
          )
        })}
      </div>

      {/* Clé du maître-mot : rôle sur sa propre ligne, légende juste pour SON équipe. */}
      {view.iSeeSolution && me && (
        <section className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
          <p className="flex items-start gap-2 text-sm font-semibold text-cream">
            <KeyRound aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            {t('youAreMaster')}
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm text-cream/80">
            {(
              [
                { tile: { kind: me.team, revealed: false }, label: t('legend.mine', { team: teamName(me.team) }) },
                {
                  tile: { kind: otherTeamOf(me.team), revealed: false },
                  label: t('legend.theirs', { team: teamName(otherTeamOf(me.team)) }),
                },
                { tile: { kind: 'neutral', revealed: false }, label: t('legend.neutral') },
                { tile: { kind: 'assassin', revealed: false }, label: t('legend.assassin') },
              ] satisfies { tile: TileLike; label: string }[]
            ).map(({ tile, label }) => (
              <li key={tile.kind} className="flex min-w-0 items-center gap-2">
                <span aria-hidden className={cn('relative h-5 w-7 shrink-0 rounded border', tileFace(tile))}>
                  <TileMark tile={tile} />
                </span>
                <span className="min-w-0">{label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Réactions des bots aux tuiles retournées, sous la grille (et la clé du
          maître-mot) : dans le flux, jamais par-dessus une tuile ni sous la
          barre. Monté dès qu'un bot est assis, même vide, pour que la région
          aria-live existe avant la première bulle. */}
      {hasBots && <MotsCodesSpeechFeed view={view} iconOf={iconOf} meId={user.id} variant="phone" />}

      {/* Joueurs, rangés par équipe */}
      <section className="space-y-2 rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
        {me && !me.isSpymaster && myMaster && (
          <p className="flex items-center gap-2 text-sm font-semibold text-cream/80">
            <KeyRound aria-hidden className="h-4 w-4 shrink-0 text-gold" />
            {t('masterIs', { name: myMaster.name })}
          </p>
        )}
        {(['gold', 'red'] as const).map((team) => (
          <div key={team} className="flex flex-wrap items-center gap-1.5">
            <span className={cn('mr-1 text-sm font-bold', TEAM_TEXT[team])}>
              <span aria-hidden>{TEAM_GLYPH[team]} </span>
              {teamName(team)}
            </span>
            {view.players
              .filter((p) => p.team === team)
              .map((p) => {
                const isMe = p.id === user.id
                return (
                  <span
                    key={p.id}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm font-semibold',
                      TEAM_PILL[team],
                      isMe && 'ring-2 ring-cream',
                      p.leftAt && 'opacity-60'
                    )}
                  >
                    {p.isSpymaster && (
                      <>
                        <KeyRound aria-hidden className="h-3.5 w-3.5 shrink-0" />
                        <span className="sr-only">{t('roleMaster')}</span>
                      </>
                    )}
                    {p.isBot && (
                      <>
                        <Bot aria-hidden className="h-3.5 w-3.5 shrink-0" />
                        <span className="sr-only">{tl('bot')}</span>
                      </>
                    )}
                    {p.leftAt && <WifiOff aria-hidden className="h-3.5 w-3.5 shrink-0" />}
                    <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
                    {isMe && <span className="font-normal">{t('you')}</span>}
                  </span>
                )
              })}
          </div>
        ))}
      </section>
    </div>

    {/* L'indice : champ et nombre au-dessus du bouton d'envoi, sous le pouce
        (et au-dessus du clavier quand il s'ouvre). */}
    {showClueBar && (
      <OnlineActionBar
        maxWidthClass="max-w-lg"
        status={
          errorLine ??
          (clueHasSpace ? (
            <span className="font-semibold text-red-300">{t('clueOneWord')}</span>
          ) : clueIsOnGrid ? (
            <span className="font-semibold text-red-300">{t('clueOnGrid')}</span>
          ) : (
            t('clueHint')
          ))
        }
      >
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void submitClue()
          }}
        >
          <div className="flex gap-2">
            <input
              value={clueWord}
              onChange={(e) => setClueWord(e.target.value)}
              maxLength={MC_CLUE_MAX_LEN}
              placeholder={t('cluePlaceholder')}
              aria-label={t('cluePlaceholder')}
              aria-invalid={clueHasSpace || clueIsOnGrid}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="send"
              className="h-12 min-w-0 flex-1 rounded-xl border border-gold/40 bg-black/30 px-4 text-base font-semibold text-cream placeholder:text-cream/60 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/40"
            />
            <select
              value={clueCount}
              onChange={(e) => setClueCount(Number(e.target.value))}
              aria-label={t('clueCountAria')}
              className="h-12 w-[4.5rem] shrink-0 rounded-xl border border-gold/40 bg-black/30 px-3 text-lg font-bold text-cream focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/40"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <option key={n} value={n} className="bg-felt-deep text-cream">{n}</option>
              ))}
            </select>
          </div>
          <Button
            type="submit"
            variant="primary"
            size="gameLg"
            className="w-full min-w-0"
            disabled={busy || !clueOk}
          >
            {busy ? (
              <Loader2 aria-hidden className="mr-2 h-5 w-5 shrink-0 animate-spin" />
            ) : (
              <Send aria-hidden className="mr-2 h-5 w-5 shrink-0" />
            )}
            <span className="truncate">
              {clueOk
                ? t('clueSendWith', { word: clueTrimmed.toLocaleUpperCase(locale), count: clueCount })
                : t('clueSend')}
            </span>
          </Button>
        </form>
      </OnlineActionBar>
    )}

    {/* Deviner : désigner une tuile, PUIS la révéler — un toucher égaré
        pendant le débat ne retourne plus l'assassin. */}
    {showGuessBar && (
      <OnlineActionBar maxWidthClass="max-w-lg" status={errorLine ?? (pickTile !== null ? t('pickConfirm') : null)}>
        <div className="flex gap-2">
          {pickTile !== null ? (
            <Button
              variant="quiet"
              size="gameLg"
              className="w-2/5 shrink-0 whitespace-normal px-3 leading-tight"
              disabled={busy}
              onClick={() => setPick(null)}
            >
              {tc('cancel')}
            </Button>
          ) : (
            <Button
              variant="quiet"
              size="gameLg"
              className="w-2/5 shrink-0 whitespace-normal px-3 leading-tight"
              disabled={busy}
              onClick={() => setPassAskKey(view.phaseKey)}
            >
              <SkipForward aria-hidden className="mr-1.5 h-4 w-4 shrink-0" />
              {t('pass')}
            </Button>
          )}
          <Button
            variant="primary"
            size="gameLg"
            className="min-w-0 flex-1 whitespace-normal px-3 leading-tight"
            disabled={pickTile === null || busy}
            onClick={() => void confirmGuess()}
          >
            {sendingTile !== null ? (
              <Loader2 aria-hidden className="mr-2 h-5 w-5 shrink-0 animate-spin" />
            ) : (
              <Eye aria-hidden className="mr-2 h-5 w-5 shrink-0" />
            )}
            <span className="min-w-0 break-words">
              {pickWord !== null ? t('reveal', { word: pickWord }) : t('pickTile')}
            </span>
          </Button>
        </div>
      </OnlineActionBar>
    )}

    <ConfirmActionDialog
      open={passOpen}
      onOpenChange={(open) => {
        if (!open) setPassAskKey(null)
      }}
      onConfirm={() => void sendAction({ action: 'pass' })}
      title={t('passConfirm.title')}
      description={t('passConfirm.description', { team: teamName(otherTeamOf(view.activeTeam)) })}
      confirmLabel={t('pass')}
      tone="primary"
    />
    <AnimatePresence>
      {tutorial.open && <GameTutorialModal gameId="mots-codes" onClose={tutorial.close} />}
    </AnimatePresence>
    </>
  )
}
