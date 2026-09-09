"use client"

import { Link } from "@/i18n/navigation"
import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { ArrowLeft, ChevronDown, Trophy, Users, X } from "lucide-react"
import { usePlayers } from "@/hooks/usePlayers"
import { useSelectedPlayers } from "@/hooks/useSelectedPlayers"
import { useAuth } from "@/hooks/useAuth"
import { useNightSummary } from "@/lib/gameMetrics-i18n"
import { PlayerIcon } from "@/components/ui/PlayerIcon"
import { PlayerName } from "@/components/ui/PlayerName"
import { Button } from "@/components/ui/button"

/**
 * Le pont « soirée locale → compte / table en ligne » se referme pour de bon :
 * une proposition qui revient à chaque passage sur le hub devient un bandeau
 * publicitaire. Une seule clé, côté navigateur.
 */
const BRIDGE_DISMISSED_KEY = "lp-local-bridge-dismissed"

export function SelectedPlayersBar() {
  const t = useTranslations('hub.selectedPlayers')
  const tAwards = useTranslations('hub.nightAwards')
  const { players, loading } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const { user, setPlayMode } = useAuth()

  // Masqué par défaut : le premier rendu (serveur puis hydratation) ne connaît
  // pas encore le localStorage — afficher le pont puis le retirer ferait
  // sauter la barre sous les doigts du groupe.
  const [bridgeHidden, setBridgeHidden] = useState(true)

  useEffect(() => {
    try {
      setBridgeHidden(window.localStorage.getItem(BRIDGE_DISMISSED_KEY) === '1')
    } catch {
      // stockage indisponible : on propose le pont, il ne sera juste pas mémorisé
      setBridgeHidden(false)
    }
  }, [])

  const dismissBridge = () => {
    setBridgeHidden(true)
    try {
      window.localStorage.setItem(BRIDGE_DISMISSED_KEY, '1')
    } catch {
      // rien à mémoriser
    }
  }

  const selectedPlayers = useMemo(
    () => players.filter((p) => selectedIds.includes(p.id)),
    [players, selectedIds]
  )

  // Palmarès de la table : replié par défaut, et surtout jamais poussé entre
  // deux parties — c'est le groupe qui va le chercher quand il veut se
  // chambrer, pas l'application qui s'invite.
  const [awardsOpen, setAwardsOpen] = useState(false)
  const nightSummary = useNightSummary(selectedPlayers)

  if (loading) return null

  // Un compte invité (scan de QR, purgé après 90 jours) ne garde rien : on lui
  // propose le vrai compte, pas la table en ligne.
  const hasAccount = Boolean(user && !user.isGuest)
  // Le pont n'apparaît QUE quand la table est constituée : avant, le groupe
  // est encore en train de s'installer, et rien n'est joué à quoi rattacher
  // une proposition. Le hub est le seul écran qui le porte — jamais un jeu.
  const showBridge = !bridgeHidden && selectedPlayers.length > 0
  // Un bouton qui ouvre un panneau vide ne vaut pas la place qu'il prend :
  // il faut au moins un titre ou un jeu fétiche à montrer.
  const showAwards = Boolean(
    nightSummary && (nightSummary.lines.length > 0 || nightSummary.topGame)
  )

  return (
    <div className="mx-auto mb-6 max-w-3xl rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-md">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-white/70">
          <Users className="h-4 w-4 text-amber-300" />
          <span>
            {selectedPlayers.length > 0
              ? t('ready', { count: selectedPlayers.length })
              : t('none')}
          </span>
        </div>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 border border-white/10 bg-white/[0.03] text-white/80 hover:bg-white/10 hover:text-white"
        >
          <Link href="/joueurs">
            <ArrowLeft className="h-3.5 w-3.5" />
            {selectedPlayers.length === 0 ? t('choose') : t('modify')}
          </Link>
        </Button>
      </div>

      {selectedPlayers.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-2">
          {selectedPlayers.map((player) => (
            <div
              key={player.id}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1.5"
            >
              <PlayerIcon player={player} size="sm" className="h-7 w-7 text-base" />
              <span className="text-sm font-medium">
                <PlayerName player={player} />
              </span>
            </div>
          ))}
        </div>
      ) : (
        <Link
          href="/joueurs"
          className="block rounded-xl border border-dashed border-amber-400/25 bg-amber-500/5 px-4 py-3 text-center text-sm text-amber-200/80 transition-colors hover:border-amber-400/40 hover:bg-amber-500/10 hover:text-amber-100"
        >
          {t('tapToChoose')}
        </Link>
      )}

      {/* Records de la table : les compteurs par joueur existaient depuis
          toujours (parties, victoires, gorgées) sans être montrés nulle part.
          Ils tiennent ici en trois lignes, REPLIÉES : de quoi se chambrer
          entre deux parties quand le groupe le demande, jamais un rapport
          qui s'impose. Rien du tout tant qu'aucune partie n'a été jouée.

          Ces chiffres sont CUMULÉS depuis la création des joueurs, pas ceux de
          la soirée (cf. le périmètre en tête de la section « Records » de
          gameMetrics) : les libellés doivent donc annoncer des records, jamais
          un bilan de soirée — sans quoi le panneau ment sur ce qu'il compte. */}
      {showAwards && nightSummary && (
        <div className="mt-3 border-t border-white/10 pt-2.5">
          {/* `min-h-[40px]` (Tailwind 3.3 n'a pas d'échelle min-h numérique) :
              cible tactile confortable, la barre se manipule au
              doigt et à une main au milieu d'une soirée. */}
          <button
            type="button"
            onClick={() => setAwardsOpen((open) => !open)}
            aria-expanded={awardsOpen}
            className="flex min-h-[40px] w-full items-center gap-2 rounded-lg py-2 text-left text-xs text-white/55 transition-colors hover:text-white/85"
          >
            <Trophy className="h-3.5 w-3.5 shrink-0 text-gold/70" aria-hidden />
            <span className="font-semibold">{tAwards('toggle')}</span>
            <span className="ml-auto truncate text-white/35">{nightSummary.headline}</span>
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 transition-transform ${awardsOpen ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>

          {awardsOpen && (
            <ul className="mt-1 space-y-1.5 pb-1">
              {nightSummary.lines.map((line) => (
                <li key={line.id} className="flex items-baseline gap-2 text-xs">
                  <span aria-hidden>{line.icon}</span>
                  <span className="shrink-0 font-semibold text-gold/90">{line.title}</span>
                  <span className="min-w-0 flex-1 truncate text-white/60">{line.detail}</span>
                </li>
              ))}
              {nightSummary.topGame && (
                <li className="pt-0.5 text-[11px] text-white/40">{nightSummary.topGame}</li>
              )}
            </ul>
          )}
        </div>
      )}

      {/* Pont vers la suite : le mode local était un cul-de-sac (rien n'a
          jamais proposé de garder les joueurs sur un compte, ni d'ouvrir une
          table pour ceux qui ne sont pas là). Une ligne, sous la table déjà
          constituée, refermable une bonne fois. */}
      {showBridge && (
        <div className="mt-3 flex items-center gap-1 border-t border-white/10 pt-2.5">
          <p className="min-w-0 flex-1 text-[11px] leading-snug text-white/45">
            {hasAccount ? t('bridge.memberText') : t('bridge.guestText')}{' '}
            {hasAccount ? (
              <button
                type="button"
                onClick={() => { void setPlayMode('online') }}
                className="font-semibold text-gold underline underline-offset-2 transition-colors hover:text-gold-strong"
              >
                {t('bridge.memberCta')}
              </button>
            ) : (
              <Link
                href="/compte"
                className="font-semibold text-gold underline underline-offset-2 transition-colors hover:text-gold-strong"
              >
                {t('bridge.guestCta')}
              </Link>
            )}
          </p>
          <button
            type="button"
            onClick={dismissBridge}
            aria-label={t('bridge.dismiss')}
            title={t('bridge.dismiss')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/35 transition-colors hover:bg-white/10 hover:text-white/70"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}
    </div>
  )
}
