"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from 'next-intl'
import { Dices, RotateCcw, SlidersHorizontal } from "lucide-react"
import { Player } from "@/lib/players"
import { PlayerName } from "@/components/ui/PlayerName"
import {
  type Choices1220,
  evaluatePlayerRoll1220,
  TOTAL_MAX,
  TOTAL_MIN,
} from "@/lib/game-1220"
import { PlayerIcon } from "@/components/ui/PlayerIcon"
import { isSpecialPlayer, getSpecialEffectClass } from "@/lib/playerUtils"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { GameShell } from "@/components/game/GameShell"
import { gameActionBarPadding } from "@/components/game/GameFixedActionBar"
import { useConfirmAction } from "@/components/game/ConfirmActionDialog"
import { EndActionDock } from "@/components/game/EndActionDock"
import { FirstGameFeedbackCard } from "@/components/feedback/FirstGameFeedbackCard"
import { ResumeGamePrompt } from "@/components/game/ResumeGamePrompt"
import { isSameLocalTable, useResumableLocalGame } from "@/lib/game-session"
import { usePlayers } from "@/hooks/usePlayers"
import { DiceBoard } from "./dice"
import { BetsEditor, TableBets } from "./bets"
import { DRINK_CHIP, GIVE_CHIP, RollHistory, VerdictPanel, VerdictRow, type Verdict1220 } from "./verdict"

// ── Types ─────────────────────────────────────────────────────────────────────

/** `setup` sert aussi à MODIFIER les paris en cours de partie (configs déjà posées). */
type Phase = "setup" | "play" | "ended"
export type Player1220Config = Choices1220 & { playerId: string; name: string }

type RollResult = Verdict1220 & { playerId: string; name: string }
type RollEntry = { d12: number; d20: number; results: RollResult[] }
/** Gorgées cumulées sur TOUTE la partie (l'historique, lui, s'arrête à 15 lancers). */
type Tally = Record<string, { drink: number; give: number }>

interface GameProps {
  players: Player[]
  onGameEnd: () => void
}

// ── Constantes ────────────────────────────────────────────────────────────────

function defaultChoices(): Choices1220 {
  return { parity: "pair", band: "11-20", drinkNumber: 7, giveNumber: 13 }
}

const HISTORY_LIMIT = 15
/** Le verdict reste masqué le temps que les dés roulent. */
const ROLL_MS = 650

// Reprise de partie : paris, dés et historique sont du JSON pur. Le 12-20 se
// joue longtemps sur les mêmes paris — les reperdre à cause d'un onglet rechargé
// obligeait toute la table à refaire sa mise. Version 2 : les résultats sont
// structurés (verdict traduit à l'affichage) au lieu de phrases figées.
const SAVE_ID = "1220"
const SAVE_VERSION = 2

type Save1220 = {
  playerIds: string[]
  phase: Phase
  draft: Record<string, Choices1220>
  configs: Player1220Config[] | null
  history: RollEntry[]
  rollCount: number
  tally: Tally
}

function isValidChoices(c: Choices1220 | undefined): boolean {
  return Boolean(
    c &&
    c.drinkNumber !== c.giveNumber &&
    c.drinkNumber >= TOTAL_MIN && c.drinkNumber <= TOTAL_MAX &&
    c.giveNumber >= TOTAL_MIN && c.giveNumber <= TOTAL_MAX
  )
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function Game1220({ players, onGameEnd }: GameProps) {
  const t = useTranslations('games.1220')
  const tc = useTranslations('common')
  const [confirmDialog, confirm] = useConfirmAction()
  const [phase, setPhase] = useState<Phase>("setup")
  const [draft, setDraft] = useState<Record<string, Choices1220>>(() => {
    const init: Record<string, Choices1220> = {}
    for (const p of players) init[p.id] = defaultChoices()
    return init
  })
  const [configs, setConfigs]     = useState<Player1220Config[] | null>(null)
  const [rolling, setRolling]     = useState(false)
  const [history, setHistory]     = useState<RollEntry[]>([])
  const [rollCount, setRollCount] = useState(0)
  const [tally,   setTally]       = useState<Tally>({})
  // Les paris de la table sont ouverts avant le premier lancer, repliés
  // ensuite : ils repoussaient les résultats sous la barre du bas.
  const [betsOpen, setBetsOpen]   = useState(true)
  const rollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const session = useResumableLocalGame<Save1220>(SAVE_ID, SAVE_VERSION, (s) =>
    isSameLocalTable(s.playerIds, players)
  )
  const { updatePlayerStats } = usePlayers()

  useEffect(() => () => {
    if (rollTimerRef.current) clearTimeout(rollTimerRef.current)
  }, [])

  // Sauvegarde continue : dès que la table a misé, la partie survit à un retour
  // involontaire.
  useEffect(() => {
    // Rien à reprendre tant que la table n'a pas validé ses paris : on ne
    // proposerait qu'un écran de réglages vierge.
    if (!session.ready || session.pending || phase !== "play") return
    session.save({
      playerIds: players.map(p => p.id),
      phase,
      draft,
      configs,
      history,
      rollCount,
      tally,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.ready, session.pending, phase, draft, configs, history, rollCount, tally])

  const resumeSavedGame = () => {
    const saved = session.accept()
    if (!saved) return
    // Table différente : les paris enregistrés ne veulent plus rien dire.
    if (!isSameLocalTable(saved.playerIds, players)) {
      session.discard()
      return
    }
    setDraft(saved.draft)
    setConfigs(saved.configs)
    setHistory(saved.history)
    setRollCount(saved.rollCount ?? saved.history.length)
    setTally(saved.tally ?? {})
    setBetsOpen(saved.history.length === 0)
    setRolling(false)
    setPhase(saved.phase)
  }

  /** Une partie ne doit être créditée qu'une fois, même si l'écran de fin
   *  et le retour s'enchaînent avant le démontage. */
  const gameCountedRef = useRef(false)

  const countGame = () => {
    if (gameCountedRef.current) return
    gameCountedRef.current = true
    players.forEach(p => {
      try {
        updatePlayerStats(p.id, '1220', { gamesPlayed: 1 })
      } catch (error) {
        console.error('Erreur lors du comptage de la partie:', error)
      }
    })
  }

  const leave = () => {
    session.clear()
    onGameEnd()
  }

  /** ← en pleine partie : la partie se termine proprement (comptée, bilan, avis). */
  const askFinish = async () => {
    if (rolling) return
    // Aucun lancer : rien à résumer, on sort comme avant (partie comptée).
    if (rollCount === 0) {
      countGame()
      leave()
      return
    }
    const ok = await confirm({
      title: t('endConfirm.title'),
      description: t('endConfirm.description'),
      confirmLabel: t('endConfirm.confirm'),
      cancelLabel: t('endConfirm.cancel'),
      tone: 'primary',
    })
    if (!ok) return
    countGame()
    session.clear()
    setPhase("ended")
  }

  const updateDraft = useCallback((id: string, patch: Partial<Choices1220>) => {
    setDraft(d => ({ ...d, [id]: { ...(d[id] ?? defaultChoices()), ...patch } }))
  }, [])

  const setupValid = useMemo(
    () => players.every(p => isValidChoices(draft[p.id])),
    [players, draft]
  )

  /** Modifier les paris en cours de partie : l'historique et le bilan restent. */
  const editing = phase === "setup" && configs !== null

  const draftFromConfigs = (list: Player1220Config[]) => {
    setDraft(d => {
      const next = { ...d }
      for (const c of list) {
        next[c.playerId] = { parity: c.parity, band: c.band, drinkNumber: c.drinkNumber, giveNumber: c.giveNumber }
      }
      return next
    })
  }

  const startPlay = () => {
    if (!setupValid) return
    if (!editing) setBetsOpen(true)
    setConfigs(players.map(p => ({ playerId: p.id, name: p.name, ...draft[p.id] })))
    setPhase("play")
  }

  const openBets = () => {
    if (rolling || !configs) return
    draftFromConfigs(configs)
    setPhase("setup")
  }

  const cancelEdit = () => {
    if (configs) draftFromConfigs(configs)
    setPhase("play")
  }

  const roll = () => {
    if (rolling || !configs) return
    setRolling(true)
    rollTimerRef.current = setTimeout(() => {
      rollTimerRef.current = null
      const a = Math.floor(Math.random() * 12) + 1
      const b = Math.floor(Math.random() * 20) + 1

      const results: RollResult[] = configs.map(cfg => {
        const r = evaluatePlayerRoll1220(a, b, cfg)
        return {
          playerId: cfg.playerId,
          name: cfg.name,
          drinkSips: r.drinkSips,
          giveEffective: r.giveEffective,
          giveReasons: r.giveReasons.map(g => g.id),
          partialHit: r.partialHit,
          partialNumbers: r.partialNumbers,
        }
      })

      setHistory(h => [{ d12: a, d20: b, results }, ...h].slice(0, HISTORY_LIMIT))
      setRollCount(n => n + 1)
      setTally(prev => {
        const next = { ...prev }
        for (const r of results) {
          const cur = next[r.playerId] ?? { drink: 0, give: 0 }
          next[r.playerId] = { drink: cur.drink + r.drinkSips, give: cur.give + r.giveEffective }
        }
        return next
      })
      setBetsOpen(false)
      setRolling(false)
    }, ROLL_MS)
  }

  /** « Rejouer » : nouvelle partie, mêmes joueurs, derniers paris proposés. */
  const newGame = () => {
    gameCountedRef.current = false
    setHistory([])
    setRollCount(0)
    setTally({})
    setConfigs(null)
    setBetsOpen(true)
    setPhase("setup")
  }

  const getPlayerObj = (id: string) => players.find(p => p.id === id)

  const playerAvatar = (id: string) => {
    const p = getPlayerObj(id)
    return p ? <PlayerIcon player={p} size="sm" className="h-7 w-7 text-lg" /> : null
  }

  const playerLabel = (id: string, fallback: string) => {
    const p = getPlayerObj(id)
    return p
      ? <PlayerName player={p} className={cn("text-cream", isSpecialPlayer(p) && getSpecialEffectClass(p))} />
      : fallback
  }

  // ── REPRISE PROPOSÉE ───────────────────────────────────────────────────────

  if (session.pending) {
    return <ResumeGamePrompt onResume={resumeSavedGame} onDiscard={session.discard} />
  }

  // ── PARIS (début de partie ou modification en cours de partie) ─────────────

  if (phase === "setup") {
    return (
      <GameShell
        title={t('titleBets')}
        headerSubtitle={editing ? t('editingSubtitle') : undefined}
        onBack={editing ? cancelEdit : leave}
        maxWidth={576}
        contentClassName={cn("gap-4", gameActionBarPadding("tall"))}
        actionBar={
          <div className="w-full">
            <p
              aria-live="polite"
              className={setupValid ? "sr-only" : "mb-2 text-center text-sm font-semibold text-red-300"}
            >
              {setupValid ? "" : t('setupInvalid')}
            </p>
            <Button variant="primary" size="gameLg" className="w-full" onClick={startPlay} disabled={!setupValid}>
              {editing ? t('resumeWithBets') : t('validateBets')}
            </Button>
          </div>
        }
      >
        <p className="rounded-2xl border border-gold/20 bg-felt-deep/70 px-4 py-3 text-sm leading-relaxed text-cream/80">
          {t('setupInfo')}
        </p>

        {players.map(p => (
          <section key={p.id} className="space-y-4 rounded-2xl border border-gold/20 bg-felt-deep/70 p-4">
            <div className="flex items-center gap-3">
              <PlayerIcon player={p} size="md" className="h-10 w-10 text-xl" />
              <PlayerName player={p} className={cn("font-display text-base font-bold text-cream", isSpecialPlayer(p) && getSpecialEffectClass(p))} />
            </div>
            <BetsEditor value={draft[p.id] ?? defaultChoices()} onChange={patch => updateDraft(p.id, patch)} />
          </section>
        ))}
      </GameShell>
    )
  }

  // ── FIN DE PARTIE ──────────────────────────────────────────────────────────

  if (phase === "ended") {
    return (
      <GameShell title={t('title')} onBack={leave} maxWidth={576} contentClassName="gap-4">
        <div className="flex flex-col items-center gap-2 pt-2 text-center">
          <Dices className="h-12 w-12 text-gold" aria-hidden />
          <h2 className="font-display text-3xl font-bold text-gold">{t('online.finishedTitle')}</h2>
          <p className="text-sm text-cream/80">{t('online.totalRolls', { count: rollCount })}</p>
        </div>

        <section className="space-y-2 rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
          <h3 className="px-1 font-display text-xs font-semibold uppercase tracking-[0.2em] text-gold">{t('tally.title')}</h3>
          <ul className="space-y-2">
            {(configs ?? []).map(cfg => {
              const score = tally[cfg.playerId] ?? { drink: 0, give: 0 }
              return (
                <li key={cfg.playerId} className="space-y-1.5 rounded-xl border border-gold/20 bg-black/20 px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center" aria-hidden>{playerAvatar(cfg.playerId)}</span>
                    <span className="min-w-0 flex-1 truncate text-base font-semibold text-cream">{playerLabel(cfg.playerId, cfg.name)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pl-10">
                    <span className={DRINK_CHIP}>{t('tally.drank', { count: score.drink })}</span>
                    <span className={GIVE_CHIP}>{t('tally.gave', { count: score.give })}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        <EndActionDock
          voiceGutter={false}
          feedback={<FirstGameFeedbackCard variant="banner" mode="local" gameId="1220" />}
        >
          <Button variant="primary" size="gameLg" className="w-full" onClick={newGame}>
            <RotateCcw aria-hidden className="mr-2 h-5 w-5" />
            {tc('replay')}
          </Button>
          <Button variant="quiet" size="game" className="w-full" onClick={leave}>
            {tc('backToGames')}
          </Button>
        </EndActionDock>
      </GameShell>
    )
  }

  // ── PARTIE ─────────────────────────────────────────────────────────────────

  const lastRoll = history[0]

  return (
    <>
      {confirmDialog}
      <GameShell
        title={t('title')}
        headerSubtitle={t('rollsCount', { count: rollCount })}
        onBack={() => void askFinish()}
        maxWidth={576}
        contentClassName="gap-4"
        headerRight={
          <Button
            variant="ghost"
            onClick={openBets}
            disabled={rolling}
            aria-label={t('reconfigure')}
            className="h-11 gap-1.5 rounded-xl border border-gold/20 bg-black/20 px-3 text-sm font-semibold text-cream/80 hover:bg-black/30 hover:text-gold"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            {t('betsButton')}
          </Button>
        }
        actionBar={
          <Button variant="primary" size="gameLg" className="w-full" onClick={roll} disabled={rolling}>
            <Dices aria-hidden className="mr-2 h-5 w-5" />
            {rolling ? t('rolling') : t('rollDice')}
          </Button>
        }
      >
        <DiceBoard
          d12={lastRoll?.d12 ?? null}
          d20={lastRoll?.d20 ?? null}
          rolling={rolling}
          announce={lastRoll ? t('rollAnnounce', { d12: lastRoll.d12, d20: lastRoll.d20, total: lastRoll.d12 + lastRoll.d20 }) : undefined}
        />

        {lastRoll && (
          <div className={cn("transition-opacity", rolling && "opacity-50")}>
            <VerdictPanel d12={lastRoll.d12} d20={lastRoll.d20}>
              {lastRoll.results.map(r => (
                <VerdictRow
                  key={`${rollCount}-${r.playerId}`}
                  avatar={playerAvatar(r.playerId)}
                  name={playerLabel(r.playerId, r.name)}
                  verdict={r}
                  total={lastRoll.d12 + lastRoll.d20}
                />
              ))}
            </VerdictPanel>
          </div>
        )}

        <TableBets
          open={betsOpen}
          onOpenChange={setBetsOpen}
          rows={(configs ?? []).map(cfg => ({
            key: cfg.playerId,
            avatar: playerAvatar(cfg.playerId),
            name: playerLabel(cfg.playerId, cfg.name),
            choices: cfg,
          }))}
        />

        <RollHistory rolls={history.slice(1)} newestNumber={rollCount - 1} />
      </GameShell>
    </>
  )
}
