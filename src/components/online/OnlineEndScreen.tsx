"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { Armchair, Check, Loader2, LogOut, RefreshCw, Share2, X } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { onlineProgressionMark } from '@/hooks/useOnlineProgression'
import { getGameById } from '@/lib/games'
import { useLocalizedGames } from '@/lib/games-i18n'
import { Button } from '@/components/ui/button'
import { EndActionDock } from '@/components/game/EndActionDock'
import { cn } from '@/lib/utils'
import { shareLink } from '@/lib/native-share'
import { isMultiHumanTable } from '@/lib/rematch-night'
import { EndConfetti } from './EndConfetti'
import { endShareClipboardText, endShareUrl, mayBringTableBack, rematchCounter } from './end-screen'

// Avis de première partie : chargé à part et sans rendu serveur — il ne
// s'affiche qu'une fois dans la vie d'un compte, inutile d'alourdir les
// dix-huit écrans de fin, et sa décision lit le stockage de l'appareil.
// Rendu en bandeau dans le dock d'actions, juste au-dessus de « Rejouer ».
const FirstGameFeedbackCard = dynamic(
  () => import('@/components/feedback/FirstGameFeedbackCard').then((m) => m.FirstGameFeedbackCard),
  { ssr: false }
)

// « On remet ça ? » : même raison — montée seulement aux tables de plusieurs
// humains, et sa décision attend trois lectures faites côté client.
const RematchNightCard = dynamic(
  () => import('./RematchNightCard').then((m) => m.RematchNightCard),
  { ssr: false }
)

/**
 * ÉCRAN DE FIN PARTAGÉ des salles en ligne.
 *
 * Les dix-huit jeux recopiaient chacun le leur (confettis, XP, « Rejouer
 * x/total », « Retour au menu ») : toute amélioration de l'enchaînement
 * était à refaire dix-huit fois, et le compteur y comptait les humains de
 * l'état moteur au lieu du quorum réel de la relance. Ici, le jeu ne fournit
 * plus que ce qui lui est propre — le titre (`header`) et son contenu
 * (`ranking` : rôles du Loup-Garou, podium du Quiz, grille des Mots Codés…) —
 * et l'écran rend, dans l'ordre : ce contenu, l'XP, la carte « On remet
 * ça ? » (tables de plusieurs humains : amis + rappel du vendredi — elle
 * s'efface quand l'avis est dû), puis le DOCK d'actions (EndActionDock) :
 * le bandeau d'avis de première partie (une seule fois dans la vie d'un
 * compte), puis Rejouer, Retour à la table, Partager, Quitter la table.
 *
 * Le dock est fixe en zone pouce (variante page) ou collé au bas de la carte
 * (variante sheet) : à 8 joueurs, « Rejouer » tombait à un écran et demi de
 * défilement, et glissait encore sous le pli quand l'XP et les succès
 * arrivaient. Ancré par le bas, le dock grandit vers le haut : un avis
 * décidé tard s'ouvre au-dessus de « Rejouer » sans le déplacer.
 *
 * Rejouer est l'action principale de tous les jeux : encre sur or, la même
 * partout. Les jeux ne passent plus de couleur (`rematchClassName` est
 * ignoré) : leur couleur reste dans leur en-tête — un dégradé par jeu sous
 * l'encre tombait à 2,2-4:1.
 *
 * Logique pure (compteur des présents, lien partagé) : ./end-screen.ts.
 */

/**
 * Anti double-tap d'un bouton : la seconde pression, tant que la première
 * n'a pas répondu, ne part pas. Verrou en ref (synchrone : deux touchers
 * dans la même image passent tous deux avant le rendu suivant), état pour
 * l'affichage « occupé ». Les erreurs, elles, sont annoncées par le hook.
 */
function useGuardedAction(): [boolean, (fn: () => Promise<unknown>) => Promise<void>] {
  const lockRef = useRef(false)
  const [pending, setPending] = useState(false)
  const run = useCallback(async (fn: () => Promise<unknown>) => {
    if (lockRef.current) return
    lockRef.current = true
    setPending(true)
    try {
      await fn()
    } catch {
      // le hook a déjà affiché l'erreur (réseau, refus du serveur)
    } finally {
      lockRef.current = false
      setPending(false)
    }
  }, [])
  return [pending, run]
}

/** Durée de la confirmation « Lien copié » (même délai que le lobby). */
const COPIED_FEEDBACK_MS = 2000
/** Un échec de copie reste plus longtemps : il faut le temps de le lire. */
const COPY_FAILED_FEEDBACK_MS = 4000

/** Actions secondaires : libellé sur deux lignes plutôt que tronqué à 375 px. */
const SECONDARY_BUTTON = 'min-w-0 whitespace-normal px-3 leading-tight'

/**
 * Rejouer déjà voté : un ÉTAT, pas un bouton grisé (l'opacité du bouton
 * désactivé faisait tomber « En attente des autres » à 2,4:1).
 */
const REMATCH_VOTED =
  'border border-emerald-400/40 bg-emerald-500/[0.15] text-emerald-100 shadow-none hover:bg-emerald-500/[0.15] active:scale-100'

export type OnlineEndScreenProps = {
  /** Titre propre au jeu (trophée, vainqueur, sous-titre…), rendu en tête. */
  header: ReactNode
  /** Contenu propre au jeu : classement, rôles révélés, grille résolue… */
  ranking?: ReactNode
  /** Bannière d'XP (XpGainBanner), rendue après le contenu du jeu. */
  xp?: ReactNode
  /** Votes « Rejouer » de l'état moteur. */
  rematchVotes?: readonly string[]
  /** Vote « Rejouer ». Absent : pas de bouton (jeu sans relance). */
  onRematch?: () => Promise<unknown>
  /** « Quitter la table » (leaveRoom). */
  onLeave: () => Promise<unknown>
  /** Retour de la table au lobby ; par défaut, celui du hook quand il l'expose. */
  onBackToTable?: () => Promise<boolean>
  /** false : pas de « Retour à la table » même si le hook le propose. */
  canBackToTable?: boolean
  /** Texte partagé ; par défaut « victoire » ou « quelle partie » selon `won`. */
  shareText?: string
  /** Le joueur local a-t-il gagné ? Ne sert qu'au texte partagé par défaut. */
  won?: boolean
  /** Salve de confettis sur l'écran (variante page seulement). */
  confetti?: boolean
  /**
   * 'page' : l'écran entier ; 'sheet' : le contenu d'une carte de modale
   * (Petit Buveur, Toucher-Coulé) — le jeu garde son voile et ses confettis.
   */
  variant?: 'page' | 'sheet'
  /**
   * Variante page : dock d'actions fixe en zone pouce (défaut). Gardé pour
   * compatibilité ; false le colle au bas du conteneur qui défile au lieu
   * de l'écran. Les jeux n'ont pas à le passer.
   */
  fixedActions?: boolean
  /**
   * @deprecated Ignoré : Rejouer prend toujours la variante `primary` (encre
   * sur or). Un dégradé de jeu sous l'encre, ou du blanc sur or, tombait
   * sous 4,5:1. À retirer des appels.
   */
  rematchClassName?: string
  className?: string
}

export function OnlineEndScreen({
  header,
  ranking,
  xp,
  rematchVotes = [],
  onRematch,
  onLeave,
  onBackToTable,
  canBackToTable = true,
  shareText,
  won = false,
  confetti = false,
  variant = 'page',
  fixedActions = true,
  className,
}: OnlineEndScreenProps) {
  const t = useTranslations('onlineLobby')
  // Titres du catalogue AVEC l'ambiance : en Soft, le Quiz se partage sous
  // « Quiz Party », comme partout ailleurs dans l'app.
  const localizedGames = useLocalizedGames()
  const { user } = useAuth()
  const { room, error, backToTable: hookBackToTable } = useOnlineRoom()
  // « Retour à la table » : `backToTable()` du hook (true = table revenue en
  // attente ; sinon l'erreur traduite est posée dans `error`). Offert à
  // l'hôte, ou à tous quand l'hôte n'est plus là (cf. mayBringTableBack).
  const backToTable =
    canBackToTable && mayBringTableBack(room?.members ?? [], room?.hostUserId, user?.id)
      ? (onBackToTable ?? hookBackToTable)
      : undefined

  const [rematchPending, runRematch] = useGuardedAction()
  const [backPending, runBack] = useGuardedAction()
  const [leavePending, runLeave] = useGuardedAction()
  const [sharePending, runShare] = useGuardedAction()
  // Retour du partage quand aucune feuille ne s'est ouverte : lien copié, ou
  // copie impossible (sans quoi le bouton revenait sans rien dire).
  const [shareFeedback, setShareFeedback] = useState<'copied' | 'failed' | null>(null)
  useEffect(() => {
    if (!shareFeedback) return
    const timer = setTimeout(
      () => setShareFeedback(null),
      shareFeedback === 'failed' ? COPY_FAILED_FEEDBACK_MS : COPIED_FEEDBACK_MS
    )
    return () => clearTimeout(timer)
  }, [shareFeedback])
  const copied = shareFeedback === 'copied'
  const shareFailed = shareFeedback === 'failed'

  // Quorum de la relance : les membres de la TABLE, pas les humains de l'état
  // moteur (cf. rematchCounter).
  const counter = rematchCounter(room?.members ?? [], rematchVotes, user?.id)
  // Partir rend les autres actions sans objet : on ne relance ni ne revient
  // à la table pendant qu'on s'en va.
  const leaving = leavePending

  // Repère de fraîcheur de la progression, noté AVANT le montage de la
  // bannière d'XP (`xp`, rendue plus bas) : la lecture qu'elle lance pour cet
  // écran sert aussi à l'avis de 1re partie, monté en différé — sans ce
  // repère, il refaisait la même requête à chaque fin de partie.
  const [progressionSince] = useState(onlineProgressionMark)

  // « On remet ça ? » : au moins deux comptes humains à la table (membres
  // réels de la salle, bots exclus). Verrouillé dès que c'est vrai : un
  // joueur qui quitte la table pendant l'écran de fin ne doit pas faire
  // disparaître la carte sous le doigt de ceux qui restent (le serveur, lui,
  // relit les membres au moment du geste).
  const multiHuman = isMultiHumanTable(
    (room?.members ?? []).map((m) => m.userId),
    user?.id
  )
  const [rematchRoomId, setRematchRoomId] = useState<string | null>(null)
  useEffect(() => {
    if (multiHuman && room?.id) setRematchRoomId((current) => current ?? room.id)
  }, [multiHuman, room?.id])

  const gameId = room?.gameId ?? null
  const gameTitle =
    (gameId ? localizedGames.find((g) => g.id === gameId)?.title : undefined) ?? 'Le Pillaveur'

  const share = () =>
    runShare(async () => {
      const url = endShareUrl(window.location.origin, room, gameId ? getGameById(gameId)?.path : null)
      const text = shareText ?? (won ? t('end.shareWon', { game: gameTitle }) : t('end.sharePlayed', { game: gameTitle }))
      // Feuille de l'app, puis du navigateur, puis copie (cf. shareLink) ;
      // une feuille refermée par le joueur ne se rabat pas sur la copie.
      const outcome = await shareLink({
        title: 'Le Pillaveur',
        text,
        url,
        clipboardText: endShareClipboardText(text, url),
      })
      if (outcome === 'copied' || outcome === 'failed') setShareFeedback(outcome)
    })

  const actions = (
    <div className="flex w-full flex-col gap-2">
      {/* Refus du serveur ou réseau (vote, retour à la table, départ) : le
          hook pose l'erreur traduite, mais aucun écran de fin ne la montrait
          — le bouton revenait sans rien dire. */}
      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-suit-red/40 bg-suit-red/10 px-3 py-2 text-center text-sm text-red-100"
        >
          {error}
        </p>
      )}
      {onRematch && (
        <Button
          variant="primary"
          size="gameLg"
          // Voté ou vote en route : le bouton reste focalisable (un bouton
          // désactivé perdait le focus) et le toucher ne repart pas — le
          // verrou de useGuardedAction couvre le vote en route.
          onClick={() => {
            if (!counter.waiting) void runRematch(onRematch)
          }}
          disabled={leaving}
          aria-disabled={counter.waiting || rematchPending || undefined}
          aria-busy={rematchPending || undefined}
          className={cn('w-full whitespace-normal leading-tight', counter.waiting && REMATCH_VOTED)}
        >
          {rematchPending ? (
            <Loader2 aria-hidden className="mr-2 h-5 w-5 shrink-0 animate-spin" />
          ) : counter.waiting ? (
            <Check aria-hidden className="mr-2 h-5 w-5 shrink-0 text-emerald-300" />
          ) : (
            <RefreshCw aria-hidden className="mr-2 h-5 w-5 shrink-0" />
          )}
          {counter.waiting
            ? t('end.rematchWaiting', { count: counter.count, total: counter.total })
            : t('end.rematch')}
          {/* D'autres ont déjà voté : le compte se voit AVANT de voter. */}
          {!counter.iVoted && counter.total > 1 && counter.count > 0 && (
            <span className="ml-2 rounded-full bg-[#24201A]/10 px-2 py-0.5 text-xs font-bold tabular-nums">
              {counter.count}/{counter.total}
            </span>
          )}
        </Button>
      )}
      {backToTable && (
        <Button
          onClick={() => void runBack(backToTable)}
          disabled={backPending || leaving}
          aria-busy={backPending || undefined}
          variant="quiet"
          size="game"
          className={cn(SECONDARY_BUTTON, 'w-full text-base')}
        >
          {backPending ? (
            <Loader2 aria-hidden className="mr-2 h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <Armchair aria-hidden className="mr-2 h-4 w-4 shrink-0" />
          )}
          {t('end.backToTable')}
        </Button>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button
          onClick={() => void share()}
          disabled={sharePending}
          variant="quiet"
          size="game"
          className={SECONDARY_BUTTON}
        >
          {copied ? (
            <Check aria-hidden className="mr-1.5 h-4 w-4 shrink-0 text-emerald-300" />
          ) : shareFailed ? (
            <X aria-hidden className="mr-1.5 h-4 w-4 shrink-0 text-red-300" />
          ) : (
            <Share2 aria-hidden className="mr-1.5 h-4 w-4 shrink-0" />
          )}
          {copied ? t('share.linkCopied') : shareFailed ? t('share.copyFailed') : t('share.cta')}
        </Button>
        <Button
          onClick={() => void runLeave(onLeave)}
          disabled={leavePending}
          aria-busy={leavePending || undefined}
          variant="quiet"
          size="game"
          className={SECONDARY_BUTTON}
        >
          {leavePending ? (
            <Loader2 aria-hidden className="mr-1.5 h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <LogOut aria-hidden className="mr-1.5 h-4 w-4 shrink-0" />
          )}
          {t('end.leave')}
        </Button>
      </div>
      {/* Compteur et copie annoncés aux lecteurs d'écran : le libellé d'un
          bouton qui change n'est pas relu de lui-même. */}
      <p role="status" aria-live="polite" className="sr-only">
        {counter.total > 1 && counter.count > 0
          ? t('end.rematchStatus', { count: counter.count, total: counter.total })
          : ''}
        {copied ? ` ${t('share.linkCopied')}` : ''}
        {shareFailed ? ` ${t('share.copyFailed')}` : ''}
      </p>
    </div>
  )

  const feedback = gameId ? (
    <FirstGameFeedbackCard
      variant="banner"
      mode="online"
      gameId={gameId}
      progressionSince={progressionSince}
    />
  ) : null

  // La carte « On remet ça ? » reste dans le flux, SOUS le contenu : le dock
  // étant fixe (ou collé au bas de la carte), elle ne repousse plus rien. Elle
  // revient à chaque fin de partie à plusieurs : dans le dock, elle volerait
  // la zone du pouce à « Rejouer » — la revanche du soir même est LA boucle
  // qui marche à plusieurs.
  const rematchNight = rematchRoomId ? (
    <RematchNightCard
      roomId={rematchRoomId}
      progressionSince={progressionSince}
      className={variant === 'sheet' ? 'mb-4' : 'max-w-sm'}
    />
  ) : null

  if (variant === 'sheet') {
    return (
      <div className={cn('flex flex-col', className)}>
        {header}
        {ranking}
        {xp}
        {rematchNight}
        {/* Collé au bas de la carte qui défile : dans une modale, rien ne
            doit repousser « Rejouer » hors de vue. */}
        <EndActionDock mode="sticky" feedback={feedback}>
          {actions}
        </EndActionDock>
      </div>
    )
  }

  // Pas d'overflow ICI : la page enveloppe déjà l'écran dans un conteneur
  // fixe qui défile (games/*/page.tsx). Un overflow sur cet élément flex lui
  // retirait sa hauteur de contenu : un long classement se centrait en
  // débordant PAR LE HAUT, trophée et titre hors d'atteinte du défilement.
  return (
    <div
      className={cn(
        'relative flex flex-1 flex-col items-center justify-center gap-5 p-6 text-cream',
        className
      )}
    >
      {confetti && <EndConfetti />}
      {header}
      {ranking}
      {xp}
      {rematchNight}
      {/* Le dock réserve lui-même sa hauteur (espaceur mesuré) : rien ne
          passe dessous, zone sûre et bandeau d'avis compris. */}
      <EndActionDock mode={fixedActions ? 'fixed' : 'sticky'} feedback={feedback}>
        {actions}
      </EndActionDock>
    </div>
  )
}
