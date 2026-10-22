"use client"

import { useTranslations } from 'next-intl'
import type { MenteurBid } from '@/lib/menteur/engine'
import { CssDie } from '@/components/games/CssDie'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { cn } from '@/lib/utils'

export type LadderPlayer = { id: string; name: string; isBot: boolean }

/** Une enchère de l'échelle ; `bluff` n'existe qu'une fois les gobelets levés (MenteurDuel). */
export type LadderBid = MenteurBid & { bluff?: boolean }

/** Enchères gardées à l'écran pendant la manche : le téléphone tient 4 puces à 375 px, la TV 6. */
export const BID_LADDER_PHONE = 4
export const BID_LADDER_TV = 6

export type BidLadderProps = {
  bids: readonly LadderBid[]
  players: readonly LadderPlayer[]
  iconOf: (p: LadderPlayer) => string
  variant: 'phone' | 'tv'
  /** Les N dernières enchères seulement ; absent = toute la chaîne (révélation). */
  limit?: number
  /** Titre visible au-dessus des puces ; sans lui, la liste n'est nommée que pour les lecteurs d'écran. */
  titled?: boolean
  /** Côté des dés en rem (écran TV, cf. CssDie) ; absent = taille nommée de la variante. */
  dieRem?: number
}

/**
 * L'ÉCHELLE DES ENCHÈRES de la manche : qui a monté quelle face, de la
 * première enchère (à gauche) à la dernière (surlignée). Une puce = l'avatar
 * de l'auteur, la quantité et le dé. Une fois les gobelets levés, l'enchère
 * dont l'auteur n'avait aucun dé de la face porte la marque « sans un seul » :
 * c'est le bluff démasqué, tiré des faits publics du duel.
 *
 * Le visuel est masqué aux lecteurs d'écran, qui lisent une phrase par puce
 * (le nom, la quantité, la face, puis la marque) : un « 3 × » lu « 3 fois »
 * à côté d'un dé sans nom ne dirait rien.
 */
export function BidLadder({ bids, players, iconOf, variant, limit, titled = false, dieRem }: BidLadderProps) {
  const t = useTranslations('games.menteur.game')
  if (bids.length === 0) return null
  const tv = variant === 'tv'
  const start = limit === undefined ? 0 : Math.max(0, bids.length - limit)
  const lastIndex = bids.length - 1

  return (
    <div className={tv ? 'space-y-2' : 'space-y-1'}>
      {titled && (
        <p
          className={cn(
            'text-center font-semibold uppercase tracking-wide',
            tv ? 'text-lg text-white/70' : 'text-xs text-cream/80'
          )}
        >
          {t('bidsTitle')}
        </p>
      )}
      <ol
        aria-label={t('bidsAria')}
        className={cn('flex flex-wrap items-center justify-center', tv ? 'gap-3' : 'gap-1')}
      >
        {start > 0 && (
          <li aria-hidden className={cn('font-bold', tv ? 'text-2xl text-white/70' : 'text-xs text-cream/70')}>
            …
          </li>
        )}
        {bids.slice(start).map((bid, offset) => {
          // Clé = position dans la chaîne entière : quand la fenêtre glisse,
          // les puces déjà affichées gardent la leur.
          const index = start + offset
          const author = players.find((p) => p.id === bid.by)
          const name = author?.name ?? '—'
          const bluff = bid.bluff === true
          return (
            <li
              key={index}
              className={cn(
                'flex items-center rounded-full border font-bold',
                // Téléphone serré (puce, écarts, avatar) : mesuré à 375 px avec
                // la police du site, « … » et 4 puces à quantité à deux chiffres
                // et avatar emoji débordaient (348 px pour 317 utiles) et
                // l'enchère en cours passait seule à la ligne dès 5 joueurs.
                tv ? 'px-4 py-1.5 text-2xl' : 'px-1 py-0.5 text-xs',
                // Téléphone aux couleurs du feutre (or pour la dernière) ; la
                // TV garde l'orange de son plateau.
                bluff
                  ? cn('border-red-400/50 bg-red-500/10', tv ? 'text-white' : 'text-cream')
                  : index === lastIndex
                    ? tv
                      ? 'border-orange-400/60 bg-orange-500/20 text-white'
                      : 'border-gold/60 bg-gold/20 text-cream'
                    : tv
                      ? 'border-white/10 bg-white/5 text-white/80'
                      : 'border-gold/20 bg-felt-deep/70 text-cream/80'
              )}
            >
              <span className="sr-only">{t('bidChipAria', { name, qty: bid.qty, face: bid.face })}</span>
              {bluff && <span className="sr-only">{t('bluffMarkAria', { name })}</span>}
              <span aria-hidden className={cn('flex items-center', tv ? 'gap-2' : 'gap-px')}>
                {author && (
                  <span className={tv ? 'text-3xl leading-none' : 'text-xs leading-none'}>
                    <PlayerAvatarGlyph value={iconOf(author)} />
                  </span>
                )}
                <span className="tabular-nums">{bid.qty}</span>
                <span className={tv ? 'text-white/60' : 'text-cream/70'}>×</span>
                <CssDie face={bid.face} size={tv ? 'md' : 'xs'} rem={dieRem} />
                {bluff && (
                  <span className={cn('text-red-300', tv ? 'ml-1 text-xl' : 'ml-0.5 text-xs')}>
                    {t('bluffMark')}
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
