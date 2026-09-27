"use client"

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Bot, LogIn, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Link } from '@/i18n/navigation'
import { useAuth } from '@/hooks/useAuth'
import { requestAgeVerification } from '@/components/legal/AgeGate'
import { GAMES, hasContentIn } from '@/lib/games'
import { resolveOnlineErrorCode } from '@/lib/online-errors'
import { validateAccountDisplayName, nameValidationI18nKey } from '@/lib/name-moderation'
import { reportProfanityIfNeeded } from '@/lib/name-moderation-attempt-client'
import { readLocalAmbianceMode } from '@/lib/ambiance-mode'

/**
 * /api/auth/guest répond 200 avec le compte DÉJÀ connecté quand une session
 * valide existait (la page croyait le visiteur déconnecté, par exemple après
 * une panne passagère de /api/auth/me) : rien n'a été créé.
 */
function isExistingAccountResponse(data: unknown): boolean {
  return Boolean(data && typeof data === 'object' && (data as { alreadySignedIn?: unknown }).alreadySignedIn === true)
}

/**
 * « Essayer avec des bots » — le chemin le plus court entre un visiteur
 * froid (SEO, page règles, vitrine d'un jeu) et une vraie partie :
 * pseudo → compte invité → table privée créée avec les bots qui manquent →
 * lobby, prêt à lancer. Aucune inscription.
 *
 * Réservé aux jeux botsFillable dont les cartes existent dans la langue de
 * la page (la table prend la langue du visiteur : Sans Filtre en anglais
 * serait refusé, content_lang_unavailable, APRÈS la création du compte
 * invité) ; sinon seul le bouton connexion s'affiche.
 * Navigation DOCUMENT en sortie (routeur vierge + session fraîche visible
 * du middleware — même raison que le fix d'onboarding d'AuthForm).
 */
export function TryBotsGate({
  gameId,
  accentClassName,
}: {
  gameId: string
  /** Classes du bouton principal (les pages jeux gardent leur dégradé). */
  accentClassName?: string
}) {
  const t = useTranslations('tryBots')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const { user } = useAuth()

  const game = GAMES.find((g) => g.id === gameId)
  const [open, setOpen] = useState(false)
  const [pseudo, setPseudo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const tErr = useTranslations('onlineLobby.errors')

  /**
   * Les routes online répondent par des CODES stables, pas par des phrases :
   * les afficher bruts montrerait « room_full » au joueur. Les deux codes à
   * trou ({count}) ne peuvent pas sortir d'ici (création de table et compte
   * invité) — on retombe sur le message générique s'ils apparaissaient.
   */
  const showApiError = (raw: unknown) => {
    const code = resolveOnlineErrorCode(typeof raw === 'string' ? raw : undefined)
    setError(code && code !== 'min_players' && code !== 'max_players' ? tErr(code) : t('error'))
  }

  if (!game) return null
  const canBots = Boolean(game.botsFillable && game.onlineReady && !game.hidden && hasContentIn(game, locale))
  const loginHref = `/compte?redirect=${encodeURIComponent(`/games/${gameId}`)}`

  // Déjà une session (compte ou invité) : direction le jeu, tout simplement.
  if (user) {
    return (
      <Button
        asChild
        className={accentClassName ?? 'w-full rounded-2xl bg-amber-500 py-5 text-base font-bold text-black hover:bg-amber-400'}
      >
        <Link href={game.path}>
          <Play className="mr-2 h-4 w-4" />
          {t('play')}
        </Link>
      </Button>
    )
  }

  /** Navigation DOCUMENT vers la page du jeu (routeur vierge, session fraîche). */
  const goToGame = () => {
    window.location.assign(`/${locale}/games/${gameId}`)
  }

  const start = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const trimmed = pseudo.trim()
    const validation = validateAccountDisplayName(trimmed)
    if (!validation.ok) {
      void reportProfanityIfNeeded(trimmed, validation.reason, 'guest')
      setError(tCommon(`nameValidation.${nameValidationI18nKey(validation.reason)}`))
      return
    }
    setLoading(true)
    // Le bouton reste en « chargement » seulement si l'on quitte la page ;
    // sur une erreur, il se réactive pour permettre de réessayer.
    let leaving = false
    try {
      // 1. Compte invité (session posée, playMode online).
      const guestRes = await fetch('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        // Ambiance de l'appareil : dans l'app, un invité sans choix naît
        // « Sans alcool » (politique Google Play) ; le compte prime ensuite.
        body: JSON.stringify({ displayName: trimmed, locale, ambianceMode: readLocalAmbianceMode() }),
      })
      const guestData = await guestRes.json().catch(() => null)
      if (guestRes.status === 403 && guestData?.code === 'age_gate_required') {
        // Rare : cookie d'âge disparu entre l'ouverture du formulaire et
        // l'envoi. La porte 18+ s'ouvre sur place ; une fois franchie, le
        // pseudo est toujours là et un nouveau clic lance la partie (jamais de
        // relance automatique : rien ne doit se créer à l'insu du visiteur).
        void requestAgeVerification()
        return
      }
      if (guestData?.code === 'rate_limited') {
        // Quota du réseau atteint (grosse tablée, CGNAT) : le délai vient de
        // la route et se dit dans la langue du joueur — jamais le texte
        // français brut de `error`, que showApiError ne saurait pas traduire.
        const seconds = typeof guestData.retryAfterSec === 'number' ? guestData.retryAfterSec : 60
        setError(t('rateLimited', { seconds }))
        return
      }
      if (!guestRes.ok) {
        showApiError(guestData?.error)
        return
      }
      if (isExistingAccountResponse(guestData)) {
        // Session déjà valide : pas de table créée d'office — créer une salle
        // retire le compte de sa table en cours. La page du jeu, rechargée,
        // retrouve le compte et propose la suite.
        leaving = true
        goToGame()
        return
      }
      // 2. Table privée sur CE jeu.
      const roomRes = await fetch('/api/online/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ gameId, visibility: 'private' }),
      })
      const roomData = await roomRes.json().catch(() => null)
      if (!roomRes.ok || !roomData?.room?.id) {
        showApiError(roomData?.error)
        return
      }
      // 3. Les bots qui manquent pour pouvoir lancer seul (best-effort :
      //    le callout du lobby permet de compléter en un clic au besoin).
      const missing = Math.max(0, (game.minPlayers ?? 2) - 1)
      if (missing > 0) {
        await fetch(`/api/online/rooms/${roomData.room.id}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ botsCount: missing }),
        }).catch(() => null)
      }
      // 4. Direction le lobby, session fraîche.
      leaving = true
      goToGame()
    } catch {
      setError(t('error'))
    } finally {
      if (!leaving) setLoading(false)
    }
  }

  const openForm = async () => {
    // Âge pas encore certifié (visiteur SEO arrivé sur /regles, où la porte
    // 18+ ne s'affiche pas d'elle-même) : la route refuserait le compte
    // (403 age_gate_required). La porte s'ouvre donc SUR PLACE, puis le
    // formulaire — sans quitter la page, pour tous les jeux (les pages de jeu
    // n'offrent pas toutes « Essayer avec des bots »). Renoncer laisse la page
    // en l'état.
    if (!(await requestAgeVerification())) return
    setOpen(true)
  }

  if (!canBots) {
    return (
      <Button asChild className={accentClassName ?? 'w-full rounded-2xl bg-amber-500 py-5 text-base font-bold text-black hover:bg-amber-400'}>
        <Link href={loginHref}>
          <LogIn className="mr-2 h-4 w-4" />
          {t('loginCta')}
        </Link>
      </Button>
    )
  }

  if (!open) {
    return (
      <div className="space-y-2.5">
        <Button
          onClick={() => { void openForm() }}
          className={accentClassName ?? 'w-full rounded-2xl bg-amber-500 py-5 text-base font-bold text-black hover:bg-amber-400'}
        >
          <Bot className="mr-2 h-4 w-4" />
          {t('cta')}
        </Button>
        <p className="text-center text-[11px] leading-snug text-white/40">{t('hint')}</p>
        <Button
          asChild
          variant="outline"
          className="w-full border-white/[0.15] bg-transparent text-sm text-white/70 hover:bg-white/[0.06] hover:text-white"
        >
          <Link href={loginHref}>
            <LogIn className="mr-2 h-4 w-4" />
            {t('loginCta')}
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={start} className="space-y-3">
      <Input
        value={pseudo}
        onChange={(e) => setPseudo(e.target.value)}
        placeholder={t('pseudoPlaceholder')}
        maxLength={30}
        required
        autoFocus
        className="border-white/10 bg-white/[0.05] text-center text-white"
      />
      {error && <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{error}</p>}
      <Button
        type="submit"
        disabled={loading || pseudo.trim().length === 0}
        className={accentClassName ?? 'w-full rounded-2xl bg-amber-500 py-5 text-base font-bold text-black hover:bg-amber-400'}
      >
        <Bot className="mr-2 h-4 w-4" />
        {loading ? tCommon('loading') : t('go')}
      </Button>
      <p className="text-center text-[11px] leading-snug text-white/40">{t('guestHintDevice')}</p>
    </form>
  )
}
