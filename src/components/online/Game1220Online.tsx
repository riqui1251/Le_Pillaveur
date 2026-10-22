"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, useReducedMotion } from 'framer-motion'
import { Check, Dices, Flag, Hourglass } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { PhaseCountdown } from './PhaseCountdown'
import { PhaseHeader } from './PhaseHeader'
import { OnlineActionBar, onlineActionBarPadding } from './OnlineActionBar'
import { Button } from '@/components/ui/button'
import { useConfirmAction } from '@/components/game/ConfirmActionDialog'
import { cn } from '@/lib/utils'
import type { Choices1220 } from '@/lib/game-1220'
import { GAME_1220_SETUP_MS } from '@/lib/1220/engine'
import type { Game1220SyncedState, Serialized1220History } from '@/lib/online-game-state'
import { botAvatarFromName } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { useAdvanceTick, useBotReferee } from '@/hooks/useBotReferee'
import { useGameAction } from '@/hooks/useGameAction'
import { OnlinePlayerName, RankCrest, useMemberCosmetics } from './OnlinePlayerTag'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { XpGainBanner } from './XpGainBanner'
import { OnlineEndScreen } from './OnlineEndScreen'
import { DiceBoard } from '@/app/[locale]/games/1220/components/dice'
import { BetsEditor, TableBets } from '@/app/[locale]/games/1220/components/bets'
import { RollHistory, VerdictPanel, VerdictRow } from '@/app/[locale]/games/1220/components/verdict'

/** 1220 en ligne : jeu simultané (pas de tour). Chaque joueur règle ses
 * paris en phase setup, puis n'importe qui déclenche un lancer partagé
 * évalué contre les paris de tout le monde. Aucune info cachée. Dés, paris
 * et verdict sont ceux du jeu local (src/app/[locale]/games/1220/components). */

/**
 * L'horloge de phase du moteur voyage avec la vue. Champs OPTIONNELS :
 * les états sérialisés avant son ajout ne les portent pas (mise en place sans
 * échéance, comportement d'origine).
 */
type Game1220View = Game1220SyncedState & {
  phaseKey?: string
  phaseEndsAt?: number | null
}

function parseView(json: string | null | undefined): Game1220View | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as Game1220View
    return Array.isArray(v.players) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

/** Durée de roulement des dés à l'arrivée d'un lancer (celle du jeu local). */
const ROLL_MS = 700

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export function Game1220Online() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.1220')
  const { busy, actionError, sendAction: postAction } = useGameAction(room?.id)
  const [confirmDialog, confirm] = useConfirmAction()
  const reduceMotion = useReducedMotion()

  const inGame = room?.gameId === '1220' && room.status === 'playing'
  const tutorial = useGameTutorial('1220', inGame)
  const cosmetics = useMemberCosmetics(room)
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])

  // Paris en vol : le choix s'allume au toucher, sans attendre l'aller-retour
  // serveur (il ne suivait que la vue serveur, et un envoi perdu ne laissait
  // aucune trace). Les touchers rapprochés partent en un seul envoi groupé.
  const [optimistic, setOptimistic] = useState<Partial<Choices1220>>({})
  const queuedRef = useRef<Partial<Choices1220>>({})
  const flushingRef = useRef(false)

  // Lancer reçu : les dés roulent 700 ms avant le verdict, sur tous les
  // téléphones. Le résultat tombait d'un coup, sans signal « ça a été lancé ».
  const inPlay = view?.phase === 'play'
  const rollSig = view ? view.history.map((h) => `${h.d12}-${h.d20}`).join(',') : ''
  const lastRollRef = useRef<Serialized1220History | null>(null)
  lastRollRef.current = view?.lastRoll ?? null
  const seenSigRef = useRef<string | null>(null)
  // `seq` compte les lancers affichés : il sert de clé aux lignes du verdict
  // (dépliants refermés à chaque nouveau lancer, même valeur de dés comprise).
  const [shown, setShown] = useState<{ roll: Serialized1220History | null; seq: number }>({ roll: null, seq: 0 })
  const shownRoll = shown.roll
  const [rolling, setRolling] = useState(false)
  const [betsOpen, setBetsOpen] = useState(true)

  // Avant la peinture : avec un effet ordinaire, l'image où le nouveau lancer
  // est arrivé mais où les dés ne roulent pas encore s'affichait (historique
  // gonflé d'une ligne puis dégonflé, lignes du verdict remontées).
  useIsoLayoutEffect(() => {
    if (!inPlay) {
      seenSigRef.current = null
      setRolling(false)
      return
    }
    const showLatest = () => setShown((s) => ({ roll: lastRollRef.current, seq: s.seq + 1 }))
    // Arrivée ou reconnexion : le dernier lancer tel quel, sans animation.
    const first = seenSigRef.current === null
    if (first || reduceMotion) {
      if (first) setBetsOpen(rollSig === '')
      else if (rollSig !== seenSigRef.current) setBetsOpen(false)
      seenSigRef.current = rollSig
      showLatest()
      setRolling(false)
      return
    }
    if (rollSig === seenSigRef.current) return
    seenSigRef.current = rollSig
    setRolling(true)
    setBetsOpen(false)
    const timer = setTimeout(() => {
      showLatest()
      setRolling(false)
    }, ROLL_MS)
    return () => clearTimeout(timer)
  }, [inPlay, rollSig, reduceMotion])

  // Arbitre (avec secours par rang, cf. useBotReferee) : ticks « joueur parti
  // → bot ». Pas de tick bot : les bots sont prêts d'office et ne jouent pas.
  useBotReferee({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    replaceLeft: Boolean(view?.players.some((p) => !p.isBot && p.leftAt)),
  })

  // ÉCHÉANCE DE MISE EN PLACE : la phase setup est SIMULTANÉE (aucun acteur
  // unique, donc pas d'anti-AFK possible). Le tick « advance », arbitré par
  // rang (cf. useAdvanceTick), fait déclarer prêts les retardataires plutôt
  // que de laisser la table figée. Il se RÉARME après l'échéance (retryMs) :
  // un coup unique perdu (requête en échec, onglet endormi au mauvais moment)
  // figerait la mise en place pour de bon, puisque l'état ne bouge plus.
  const phaseEndsAt = view?.phaseEndsAt ?? null
  useAdvanceTick({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    advance:
      view && phaseEndsAt !== null && view.phaseKey
        ? { phaseKey: view.phaseKey, dueAt: phaseEndsAt, retryMs: 5000 }
        : null,
  })

  if (!inGame) {
    return <GameOnlineLobby gameId="1220" />
  }

  if (!view || !user || !room) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="h-8 w-8 rounded-full border-2 border-gold/30 border-t-gold motion-safe:animate-spin" />
      </div>
    )
  }

  // Verrou de version pour le lancer seulement : deux joueurs qui lancent au
  // même instant ne doivent produire qu'UN lancer. Les intentions de la mise
  // en place (paris, prêt) partent sans verrou : chaque toucher d'un autre
  // joueur fait monter la version, et le 409 (muet) avalait le choix. La fin
  // aussi : elle part APRÈS le dialogue de confirmation, pendant lequel les
  // autres continuent de lancer — la version du rendu d'origine serait
  // périmée et la fin refusée sans un mot. Le moteur valide déjà la phase et
  // l'acteur. Reste le 409 d'une écriture vraiment simultanée côté serveur :
  // un second envoi le rattrape.
  const sendLocked = (body: Record<string, unknown>) =>
    postAction({ ...body, expectedVersion: room.stateVersion })
  const sendUnlocked = async (body: Record<string, unknown>) => {
    const res = await postAction(body)
    return res?.status === 409 ? postAction(body) : res
  }

  const queueDraft = (patch: Partial<Choices1220>) => {
    setOptimistic((o) => ({ ...o, ...patch }))
    queuedRef.current = { ...queuedRef.current, ...patch }
    if (flushingRef.current) return
    flushingRef.current = true
    void (async () => {
      while (Object.keys(queuedRef.current).length > 0) {
        const batch = queuedRef.current
        queuedRef.current = {}
        await sendUnlocked({ action: 'set-draft', choices: batch })
        // Succès : la vue serveur porte déjà le choix. Refus : on revient à
        // la vue serveur (le hook affiche la raison). Un toucher plus récent
        // sur le même pari garde sa valeur.
        setOptimistic((o) => {
          const next = { ...o }
          for (const key of Object.keys(batch) as (keyof Choices1220)[]) {
            if (next[key] === batch[key]) delete next[key]
          }
          return next
        })
      }
      flushingRef.current = false
    })()
  }

  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botAvatarFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'
  const iconById = (id: string) => {
    const p = view.players.find((pl) => pl.id === id)
    return p ? iconOf(p) : '👤'
  }
  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)
  const errorStatus = actionError ? <span className="text-red-300">{actionError}</span> : null

  // ── Écran de fin ──────────────────────────────────────────────────────────
  if (view.phase === 'finished') {
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
            <Dices className="h-14 w-14 text-gold" aria-hidden />
            <h2 className="font-display text-3xl font-bold text-gold">{t('online.finishedTitle')}</h2>
            <p className="text-sm text-cream/80">{t('online.totalRolls', { count: view.history.length })}</p>
          </motion.div>
        }
        // Aucune progression n'existait sur ce jeu : XP de participation.
        xp={<XpGainBanner won={false} playerIds={view.players.map((p) => p.id)} className="w-full max-w-sm" />}
      />
    )
  }

  const tutorialButton = <TutorialReopenButton onClick={tutorial.reopen} className="h-11 w-11" />

  // ── Phase setup : chacun règle ses paris ─────────────────────────────────
  if (view.phase === 'setup') {
    const serverDraft = view.draft[user.id]
    const myDraft = serverDraft ? { ...serverDraft, ...optimistic } : null
    const iAmReady = view.setupReady.includes(user.id)
    const clash = Boolean(myDraft && myDraft.drinkNumber === myDraft.giveNumber)
    const draftPending = Object.keys(optimistic).length > 0
    const active = view.players.filter((p) => !p.leftAt)
    const readyCount = active.filter((p) => view.setupReady.includes(p.id)).length
    // Pas encore prêt : mes paris d'abord. Prêt : l'attente des autres d'abord.
    const readyGrid = (
      <ul className="grid grid-cols-2 gap-2">
        {view.players.map((p) => {
          const ready = view.setupReady.includes(p.id)
          return (
            <li
              key={p.id}
              className={cn(
                'flex min-h-[44px] items-center gap-2 rounded-xl border px-2.5 py-2',
                ready ? 'border-gold/50 bg-gold/10' : 'border-cream/20 bg-black/20'
              )}
            >
              <RankCrest role={cosmetics.get(p.id)?.role} />
              <span className="text-lg leading-none" aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
              <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} className="min-w-0 flex-1 truncate text-sm font-bold text-cream" />
              {ready
                ? <Check className="h-5 w-5 shrink-0 text-gold" aria-hidden />
                : <Hourglass className="h-4 w-4 shrink-0 text-cream/70" aria-hidden />}
              <span className="sr-only">{`, ${ready ? t('online.playerReady') : t('online.playerNotReady')}`}</span>
            </li>
          )
        })}
      </ul>
    )
    const betsPanel =
      myDraft && (
        <section className="space-y-4 rounded-2xl border border-gold/20 bg-felt-deep/70 p-4">
          <h2 className="font-display text-base font-bold text-gold">{t('online.myBets')}</h2>
          <BetsEditor value={myDraft} onChange={queueDraft} disabled={iAmReady} />
        </section>
      )
    return (
      <>
        <div className={cn('flex flex-1 flex-col gap-3 p-3 sm:mx-auto sm:w-full sm:max-w-lg', onlineActionBarPadding('tall'))}>
          <PhaseHeader
            phase={t('online.phaseSetup')}
            endsAt={phaseEndsAt}
            total={GAME_1220_SETUP_MS}
            right={tutorialButton}
            status={t('online.readyCount', { ready: readyCount, total: active.length })}
          />
          {tutorial.open && <GameTutorialModal gameId="1220" onClose={tutorial.close} />}

          <p className="px-1 text-sm text-cream/80">
            {t('online.waitingSetup')}
            {phaseEndsAt !== null && <> {t('online.deadlineHint')}</>}
          </p>

          {iAmReady ? <>{readyGrid}{betsPanel}</> : <>{betsPanel}{readyGrid}</>}
        </div>

        <OnlineActionBar
          status={errorStatus ?? (iAmReady ? t('online.readyDone') : null)}
          maxWidthClass="max-w-lg"
        >
          {myDraft && !iAmReady && (
            <Button
              variant="primary"
              size="gameLg"
              className="w-full"
              disabled={busy || clash || draftPending}
              onClick={() => void sendUnlocked({ action: 'ready' })}
            >
              <Check aria-hidden className="mr-2 h-5 w-5" />
              {t('online.ready')}
            </Button>
          )}
        </OnlineActionBar>
      </>
    )
  }

  // ── Phase play : lancer partagé ──────────────────────────────────────────
  const askEnd = async () => {
    const ok = await confirm({
      title: t('online.endConfirm.title'),
      description: t('online.endConfirm.description'),
      confirmLabel: t('online.endGame'),
      cancelLabel: t('endConfirm.cancel'),
      tone: 'danger',
    })
    if (ok) void sendUnlocked({ action: 'end' })
  }

  const shownTotal = shownRoll ? shownRoll.d12 + shownRoll.d20 : null

  return (
    <>
      {confirmDialog}
      <div className={cn('flex flex-1 flex-col gap-3 p-3 sm:mx-auto sm:w-full sm:max-w-lg', onlineActionBarPadding('tall'))}>
        <PhaseHeader phase={t('online.phasePlay')} right={tutorialButton} status={t('online.anyoneRolls')} />
        {tutorial.open && <GameTutorialModal gameId="1220" onClose={tutorial.close} />}

        {leftPlayer?.leftAt && (
          <div className="rounded-2xl border border-gold/30 bg-gold/10 px-4 py-2 text-center text-sm font-semibold text-cream">
            <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
              {({ seconds }) => t('online.waitingReturn', { name: leftPlayer.name, seconds })}
            </PhaseCountdown>
          </div>
        )}

        <DiceBoard
          d12={shownRoll?.d12 ?? null}
          d20={shownRoll?.d20 ?? null}
          rolling={rolling}
          announce={shownRoll && shownTotal !== null ? t('rollAnnounce', { d12: shownRoll.d12, d20: shownRoll.d20, total: shownTotal }) : undefined}
        />

        {shownRoll && shownTotal !== null && (
          <div className={cn('transition-opacity', rolling && 'opacity-50')}>
            <VerdictPanel d12={shownRoll.d12} d20={shownRoll.d20}>
              {shownRoll.results.map((r) => (
                <VerdictRow
                  key={`${shown.seq}-${r.playerId}`}
                  avatar={<PlayerAvatarGlyph value={iconById(r.playerId)} />}
                  name={<OnlinePlayerName name={r.name} cosmetics={cosmetics.get(r.playerId)} />}
                  verdict={r}
                  total={shownTotal}
                />
              ))}
            </VerdictPanel>
          </div>
        )}

        <TableBets
          open={betsOpen}
          onOpenChange={setBetsOpen}
          rows={(view.configs ?? []).map((cfg) => ({
            key: cfg.playerId,
            avatar: <PlayerAvatarGlyph value={iconById(cfg.playerId)} />,
            name: (
              <>
                <RankCrest role={cosmetics.get(cfg.playerId)?.role} className="mr-1 align-middle" />
                <OnlinePlayerName name={cfg.name} cosmetics={cosmetics.get(cfg.playerId)} />
              </>
            ),
            choices: cfg,
          }))}
        />

        {/* Pendant que les dés roulent, le lancer affiché est encore le précédent. */}
        <RollHistory rolls={view.history.slice(rolling ? 2 : 1)} />

        {/* La seule fin de ce jeu, pour toute la table : hors de la barre du
            pouce (elle était collée à « Lancer les dés ») et confirmée. */}
        <Button variant="quiet" size="game" className="w-full" disabled={busy} onClick={() => void askEnd()}>
          <Flag aria-hidden className="mr-2 h-4 w-4" />
          {t('online.endGame')}
        </Button>
      </div>

      <OnlineActionBar status={errorStatus ?? (rolling ? t('rolling') : null)} maxWidthClass="max-w-lg">
        <Button
          variant="primary"
          size="gameLg"
          className="w-full"
          disabled={busy || rolling}
          onClick={() => void sendLocked({ action: 'roll' })}
        >
          <Dices aria-hidden className="mr-2 h-5 w-5" />
          {t('rollDice')}
        </Button>
      </OnlineActionBar>
    </>
  )
}
