"use client"

import { Fragment, useRef } from 'react'
import { useTranslations } from 'next-intl'
import type { Player } from '@/lib/players'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { PlayingCard, PlayingCardBack } from '@/components/ui/PlayingCard'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { PlayerName } from '@/components/ui/PlayerName'
import { cn } from '@/lib/utils'
import { CAP_PRICE_MAX, splitPlayerToken, type CapCard, type CapKind } from '@/lib/cap-ou-pas-cap/engine'

/** Prix de la carte en pastilles rouge carreau, sur 5 : le piquant se lit avant le texte. */
function CapPricePips({ price }: { price: number }) {
  return (
    <span aria-hidden className="flex items-center gap-1">
      {Array.from({ length: CAP_PRICE_MAX }, (_, i) => (
        <span
          key={i}
          className={cn('h-2.5 w-2.5 rounded-full', i < price ? 'bg-suit-red' : 'border border-[#24201A]/30')}
        />
      ))}
    </span>
  )
}

/** Le texte de la carte, `{player}` remplacé par le nom (encre pure : pas de cosmétique sur la crème). */
function CapCardText({ text, targetName }: { text: string; targetName: string | null }) {
  return (
    <>
      {splitPlayerToken(text).map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <strong className="font-bold">{targetName ?? ''}</strong>}
          {part}
        </Fragment>
      ))}
    </>
  )
}

/** Face de la carte tirée : type (rouge carreau), thème, texte en Playfair, prix. */
export function CapCardFace({
  card,
  targetName,
  stake,
  doubled,
  soft,
  className,
}: {
  card: CapCard
  targetName: string | null
  /** Ce que coûte la carte en jeu : son prix, doublé après un renvoi. */
  stake: number
  doubled: boolean
  soft: boolean
  className?: string
}) {
  const t = useTranslations('games.cap-ou-pas-cap')
  return (
    <PlayingCard
      suit="heart"
      rank="8"
      className={cn('flex flex-col items-center gap-4 px-6 pb-7 pt-8 text-center', className)}
    >
      <div className="flex flex-col items-center gap-1">
        <p className="font-display text-sm font-bold uppercase tracking-[0.22em] text-suit-red">
          {t(`kinds.${card.kind}`)}
        </p>
        <p className="text-xs font-semibold text-[#24201A]/70">{t(`themes.${card.theme}`)}</p>
      </div>
      <p className="flex flex-1 items-center break-words font-display text-xl font-semibold leading-snug text-[#24201A]">
        <span>
          <CapCardText text={card.text} targetName={targetName} />
        </span>
      </p>
      <div className="flex flex-col items-center gap-1.5">
        <CapPricePips price={card.price} />
        <p className="flex flex-wrap items-center justify-center gap-2 text-sm font-bold text-[#24201A]">
          {t(soft ? 'soft.game.price' : 'game.price', { count: stake })}
          {doubled && (
            <span className="rounded-full bg-suit-red px-2 py-0.5 text-xs font-bold text-cream">
              {t('game.doubled')}
            </span>
          )}
        </p>
      </div>
    </PlayingCard>
  )
}

/** Dos de carte Vérité / Action : un toucher tire la carte et la retourne. */
export function CapChoiceBack({
  kind,
  disabled,
  onPick,
}: {
  kind: CapKind
  disabled: boolean
  onPick: () => void
}) {
  const t = useTranslations('games.cap-ou-pas-cap')
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className="group flex min-w-0 flex-col items-center gap-2 rounded-2xl p-1.5 text-cream transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold active:scale-[0.98] disabled:opacity-40"
    >
      <PlayingCardBack className="aspect-[5/7] w-full max-w-[9.5rem] transition-transform duration-200 motion-safe:group-hover:-translate-y-1" />
      <span className="font-display text-xl font-bold leading-tight">{t(`kinds.${kind}`)}</span>
      <span className="text-xs text-cream/70">{t(`game.hints.${kind}`)}</span>
    </button>
  )
}

/** Joker « Retour à l'envoyeur » : le joueur au tour choisit qui reçoit la carte, au double du prix. */
export function CapJokerDialog({
  open,
  players,
  price,
  soft,
  onPick,
  onClose,
  fallbackFocus,
}: {
  open: boolean
  /** Les destinataires possibles : toute la table sauf le lanceur. */
  players: Player[]
  /** Prix inscrit sur la carte, pas le prix en jeu : celui-ci est déjà doublé pendant l'animation de sortie d'un renvoi. */
  price: number
  soft: boolean
  onPick: (playerId: string) => void
  onClose: () => void
  /** Reçoit le focus à la fermeture quand le bouton qui a ouvert la fenêtre a disparu (carte renvoyée). */
  fallbackFocus: () => HTMLElement | null
}) {
  const t = useTranslations('games.cap-ou-pas-cap')
  // Ouverte sans Trigger, Radix rend le focus au Trigger absent : il tombait sur <body> et le
  // clavier repartait du haut de la page. Le focus n'a pas encore bougé à onOpenAutoFocus.
  const openerRef = useRef<HTMLElement | null>(null)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={undefined}
        onOpenAutoFocus={() => {
          const active = document.activeElement
          openerRef.current = active instanceof HTMLElement && active !== document.body ? active : null
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          const opener = openerRef.current
          openerRef.current = null
          const target = opener?.isConnected ? opener : fallbackFocus()
          target?.focus({ preventScroll: true })
        }}
        className="max-h-[92dvh] max-w-sm gap-0 overflow-y-auto rounded-2xl border-gold/20 bg-felt-deep p-5 text-cream shadow-2xl sm:rounded-2xl"
      >
        <DialogTitle className="font-display text-xl font-bold text-gold">{t('joker.title')}</DialogTitle>
        <DialogDescription className="mt-2 text-sm leading-snug text-cream/80">
          {t(soft ? 'soft.joker.body' : 'joker.body', { count: price * 2 })}
        </DialogDescription>
        <ul className="mt-4 space-y-2">
          {players.map((player) => (
            <li key={player.id}>
              <button
                type="button"
                onClick={() => onPick(player.id)}
                className="flex min-h-[48px] w-full items-center gap-3 rounded-xl border border-gold/20 bg-black/20 px-3 py-2 text-left transition-colors hover:border-gold/60 hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                <PlayerIcon player={player} size="md" />
                <PlayerName player={player} className="min-w-0 truncate text-base font-semibold text-cream" />
              </button>
            </li>
          ))}
        </ul>
        <Button variant="quiet" size="game" className="mt-4 w-full" onClick={onClose}>
          {t('joker.cancel')}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
