"use client"

import type { ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { BookOpen, Play } from 'lucide-react'
import { GameIconById } from '@/components/hub/GameIconById'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { useLocalizedGame } from '@/lib/games-i18n'
import { isRulesGameId } from '@/lib/rules/rules-ids'

/**
 * Vitrine d'un jeu EN LIGNE — ce que voit le visiteur hors salle, et ce que
 * lit Googlebot.
 *
 * Les pages /games/<id> des jeux en ligne sont les SEULES pages indexables
 * en en/es/it (les règles sont françaises, canonique /fr). Elles rendaient,
 * tant que /api/auth/me n'avait pas répondu, le squelette du lot 1 (h1 +
 * accroche), puis, hors salle, une carte minimale : titre, une phrase,
 * « Essayer avec des bots ». Sous un titre traduit avec soin dans games.meta,
 * Google n'y lisait qu'un h1.
 *
 * Ici, un bloc RÉEL dès le premier rendu — donc dans le HTML rendu au build :
 * icône, <h1> et accroche du catalogue, les faits tirés de src/lib/games.ts
 * (effectif, bots, vocal, gratuit), puis « Comment ça se joue » en trois
 * courts paragraphes (`games.<id>.about` : la tranche de la page, jamais un
 * namespace de premier niveau — voir src/i18n/messages-slices.ts) et, en
 * français seulement, le lien vers les règles complètes quand le document
 * existe (docs/rules/fr/, canonique /fr : un lecteur italien tomberait sur
 * un article en français).
 *
 * Les actions restent celles de la page (`children` : TryBotsGate pour un
 * visiteur, « passer en ligne » pour un compte local…). En `pending`, tant
 * que la session charge, le bouton principal est là mais DÉSACTIVÉ : même
 * contenu côté serveur et côté client, rien ne saute à l'arrivée de la
 * session hormis le bouton. Léger : ni framer-motion ni état.
 *
 * Le layout parent (games/layout.tsx) fournit la coquille feutre + filet
 * or — même colonne centrée `max-w-lg` et même en-tête que
 * OnlineGameSkeleton, qui tient la place des morceaux chargés à la demande.
 */

/** Bouton principal par défaut — celui de TryBotsGate (or remappé sur amber). */
const DEFAULT_ACCENT = 'w-full rounded-2xl bg-amber-500 py-5 text-base font-bold text-black hover:bg-amber-400'

export function GameShowcase({
  gameId,
  accentClassName,
  note,
  pending = false,
  children,
}: {
  gameId: string
  /** Classes du bouton principal en attente (les pages jeux gardent leur dégradé). */
  accentClassName?: string
  /** Phrase sous les faits — pourquoi le jeu se joue en ligne (`games.<id>.page.onlineOnly`). */
  note?: string
  /** Session pas encore connue : le bouton principal, désactivé, à la place des actions. */
  pending?: boolean
  /** Les actions réelles de la page — ignorées tant que `pending`. */
  children?: ReactNode
}) {
  const t = useTranslations('onlineLobby.showcase')
  const tAbout = useTranslations(`games.${gameId}.about`)
  const tCommon = useTranslations('common')
  const locale = useLocale()
  // Titre et accroche du catalogue, adoucis en mode Soft : le visiteur
  // retrouve exactement ce qu'il vient de lire sur la carte du hub.
  const game = useLocalizedGame(gameId)
  if (!game) return null

  // Les faits, dans l'ordre où on les cherche : combien, seul ?, vocal, prix.
  // Rien n'est promis que games.ts ne dise : les bots suivent botsFillable,
  // le vocal vient du dock monté pour toute salle en ligne (games/layout.tsx).
  const facts: string[] = []
  if (game.minPlayers && game.maxPlayers) {
    facts.push(t('players', { min: game.minPlayers, max: game.maxPlayers }))
  }
  if (game.botsFillable) facts.push(t('bots'))
  if (game.onlineReady) facts.push(t('voice'))
  facts.push(t('free'))

  const rulesHref = locale === 'fr' && isRulesGameId(gameId) ? `/regles/${gameId}` : null

  return (
    <div className="flex w-full flex-1 flex-col items-center px-3 py-8 sm:py-12">
      <div className="w-full max-w-lg">
        <header className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-gold/30 bg-gold/10 text-gold">
            <GameIconById id={gameId} className="h-8 w-8" />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-cream">{game.title}</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-snug text-cream/70">{game.description}</p>
          <ul className="mt-4 flex flex-wrap justify-center gap-1.5">
            {facts.map((fact) => (
              <li
                key={fact}
                className="rounded-full border border-gold/25 px-2.5 py-1 text-xs font-semibold text-cream/75"
              >
                {fact}
              </li>
            ))}
          </ul>
          {note && <p className="mx-auto mt-4 max-w-sm text-sm leading-snug text-cream/60">{note}</p>}
        </header>

        <div className="mt-6">
          {pending ? (
            // Le doigt sait déjà où viser : le bouton est à sa place, gris,
            // le temps que la session réponde. `role="status"` pour le lecteur
            // d'écran, comme le squelette.
            <div role="status" aria-busy="true" className="space-y-2.5">
              <Button disabled className={accentClassName ?? DEFAULT_ACCENT}>
                <Play className="mr-2 h-4 w-4" />
                {t('pending')}
              </Button>
              <p className="text-center text-xs font-medium tracking-wide text-cream/60">{tCommon('loading')}</p>
            </div>
          ) : (
            children
          )}
        </div>

        <section aria-labelledby="game-showcase-how" className="mt-8 border-t border-gold/15 pt-6">
          <h2 id="game-showcase-how" className="font-display text-lg font-bold text-gold">
            {t('howTitle')}
          </h2>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-cream/80">
            <p>{tAbout('p1')}</p>
            <p>{tAbout('p2')}</p>
            <p>{tAbout('p3')}</p>
          </div>
          {rulesHref && (
            <Link
              href={rulesHref}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-gold underline-offset-4 hover:underline"
            >
              <BookOpen className="h-4 w-4" />
              {t('rulesLink')}
            </Link>
          )}
        </section>
      </div>
    </div>
  )
}
