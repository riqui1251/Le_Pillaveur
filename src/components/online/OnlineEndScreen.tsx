"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Armchair, Check, Loader2, LogOut, RefreshCw, Share2, X } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { getGameById } from '@/lib/games'
import { useLocalizedGames } from '@/lib/games-i18n'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { shareLink } from '@/lib/native-share'
import { EndConfetti } from './EndConfetti'
import { endShareClipboardText, endShareUrl, mayBringTableBack, rematchCounter } from './end-screen'

/**
 * ÉCRAN DE FIN PARTAGÉ des salles en ligne.
 *
 * Les dix-huit jeux recopiaient chacun le leur (confettis, XP, « Rejouer
 * x/total », « Retour au menu ») : toute amélioration de l'enchaînement
 * était à refaire dix-huit fois, et le compteur y comptait les humains de
 * l'état moteur au lieu du quorum réel de la relance. Ici, le jeu ne fournit
 * plus que ce qui lui est propre — le titre (`header`) et son contenu
 * (`ranking` : rôles du Loup-Garou, podium du Quiz, grille des Mots Codés…) —
 * et l'écran rend, dans l'ordre : ce contenu, l'XP, puis la barre d'actions
 * (Rejouer, Retour à la table, Partager, Quitter la table).
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

const SECONDARY_BUTTON =
  'h-12 min-w-0 whitespace-normal rounded-2xl border-white/[0.15] bg-white/5 px-3 text-sm font-semibold leading-tight text-white/80 hover:bg-white/10 hover:text-white'

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
  /** Barre d'actions fixe en zone pouce (Quiz). */
  fixedActions?: boolean
  /** Couleur du bouton Rejouer (dégradé du jeu). */
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
  fixedActions = false,
  rematchClassName,
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
          onClick={() => void runRematch(onRematch)}
          disabled={counter.waiting || rematchPending || leaving}
          aria-busy={rematchPending || undefined}
          className={cn(
            'h-12 w-full rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 text-base font-bold',
            rematchClassName
          )}
        >
          {rematchPending ? (
            <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw aria-hidden className="mr-2 h-4 w-4" />
          )}
          {counter.waiting
            ? t('end.rematchWaiting', { count: counter.count, total: counter.total })
            : t('end.rematch')}
          {/* D'autres ont déjà voté : le compte se voit AVANT de voter. */}
          {!counter.iVoted && counter.total > 1 && counter.count > 0 && (
            <span className="ml-2 rounded-full bg-black/20 px-2 py-0.5 text-xs font-bold tabular-nums">
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
          variant="outline"
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
          variant="outline"
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
          variant="outline"
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

  if (variant === 'sheet') {
    return (
      <div className={cn('flex flex-col', className)}>
        {header}
        {ranking}
        {xp}
        {actions}
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
        'relative flex flex-1 flex-col items-center justify-center gap-5 p-6 text-white',
        className
      )}
    >
      {confetti && <EndConfetti />}
      {header}
      {ranking}
      {xp}
      {fixedActions ? (
        <>
          {/* Réserve pour la barre fixe (zone sûre comprise) : deux rangées,
              une de plus avec « Retour à la table », et la ligne d'erreur. */}
          <div
            aria-hidden
            className="shrink-0"
            style={{
              height: `calc(${7 + (backToTable ? 4 : 0) + (error ? 3.5 : 0)}rem + env(safe-area-inset-bottom))`,
            }}
          />
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gold/15 bg-felt-deep/90 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
            <div className="mx-auto w-full max-w-sm">{actions}</div>
          </div>
        </>
      ) : (
        <div className="w-full max-w-sm">{actions}</div>
      )}
    </div>
  )
}
