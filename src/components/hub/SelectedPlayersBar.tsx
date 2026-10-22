"use client"

import { Link, useRouter } from "@/i18n/navigation"
import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { ChevronDown, Trophy, Users, X } from "lucide-react"
import { usePlayers } from "@/hooks/usePlayers"
import { useSelectedPlayers } from "@/hooks/useSelectedPlayers"
import { useAuth } from "@/hooks/useAuth"
import { useNightSummary } from "@/lib/gameMetrics-i18n"
import { enterLocalPlay } from "@/lib/local-play-client"
import { PlayerIcon } from "@/components/ui/PlayerIcon"
import { PlayerName } from "@/components/ui/PlayerName"
import { Button } from "@/components/ui/button"

/**
 * Le pont « soirée locale → compte / table en ligne » se referme pour de bon :
 * une proposition qui revient à chaque passage sur le hub devient un bandeau
 * publicitaire. Une seule clé, côté navigateur.
 */
const BRIDGE_DISMISSED_KEY = "lp-local-bridge-dismissed"

/** Joueurs connus de l'appareil ET cochés pour la soirée. */
function useSelectedLocalPlayers() {
  const { players, loading } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const selectedPlayers = useMemo(
    () => players.filter((p) => selectedIds.includes(p.id)),
    [players, selectedIds]
  )
  return { selectedPlayers, loading }
}

/**
 * Les joueurs de la soirée, dans la feuille « Réglages de la soirée » du hub
 * (PartyBar) : leurs puces et le geste pour les choisir ou les changer. Le
 * hub n'en montre plus que le NOMBRE, dans la barre : la liste complète, avec
 * Records et pont vers le compte, repoussait la première carte de jeu sous la
 * ligne de flottaison (≈ 280 px à elle seule).
 */
export function SelectedPlayersPanel() {
  const t = useTranslations("hub.selectedPlayers")
  const { selectedPlayers, loading } = useSelectedLocalPlayers()
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  // Un visiteur (ni compte ni mode local) qui touchait « Choisir les joueurs »
  // suivait un lien nu vers /joueurs, route protégée : le middleware le
  // renvoyait sur le formulaire de compte, à rebours du « zéro inscription »
  // promis par la vitrine. Même porte que la bascule PlayModeToggle : le
  // cookie de mode local se pose d'abord (POST /api/auth/local-play), la
  // navigation suit. Si la pose échoue, on navigue quand même — il retombe
  // sur /compte comme avant, jamais sur un bouton qui ne fait rien. Tant que
  // l'auth n'a pas répondu, le lien nu reste : un compte n'a pas besoin du
  // cookie, et le poser pour lui serait sans effet.
  const isVisitor = !authLoading && !user
  const goToPlayers = () => {
    void enterLocalPlay()
      .catch(() => undefined)
      .then(() => router.push("/joueurs"))
  }

  if (loading) return <div aria-busy="true" className="h-12 rounded-2xl bg-cream/[0.06] motion-safe:animate-pulse" />

  const none = selectedPlayers.length === 0
  const label = none ? t("choose") : t("modify")
  const content = (
    <>
      <Users className="mr-2 h-4 w-4" aria-hidden />
      {label}
    </>
  )

  return (
    <div className="space-y-3">
      {none ? (
        <p className="text-sm text-cream/70">{t("none")}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {selectedPlayers.map((player) => (
            <li
              key={player.id}
              className="flex items-center gap-2 rounded-full border border-gold/20 bg-black/25 px-3 py-1.5"
            >
              <PlayerIcon player={player} size="sm" className="h-7 w-7 text-base" />
              <span className="text-sm font-medium text-cream">
                <PlayerName player={player} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {isVisitor ? (
        <Button type="button" onClick={goToPlayers} variant={none ? "primary" : "quiet"} size="game" className="w-full">
          {content}
        </Button>
      ) : (
        <Button asChild variant={none ? "primary" : "quiet"} size="game" className="w-full">
          <Link href="/joueurs">{content}</Link>
        </Button>
      )}
    </div>
  )
}

/**
 * Records de la table et pont vers le compte, SOUS la grille du hub local :
 * ce qu'on va chercher entre deux parties, jamais ce qui doit passer avant le
 * choix du jeu. Ne rend rien tant qu'il n'y a ni record ni pont à montrer.
 */
export function TableRecordsPanel() {
  const t = useTranslations("hub.selectedPlayers")
  const tAwards = useTranslations("hub.nightAwards")
  const { selectedPlayers, loading } = useSelectedLocalPlayers()
  const { user, setPlayMode } = useAuth()

  // Masqué par défaut : le premier rendu (serveur puis hydratation) ne connaît
  // pas encore le localStorage — afficher le pont puis le retirer ferait
  // sauter la page sous les doigts du groupe.
  const [bridgeHidden, setBridgeHidden] = useState(true)

  useEffect(() => {
    try {
      setBridgeHidden(window.localStorage.getItem(BRIDGE_DISMISSED_KEY) === "1")
    } catch {
      // stockage indisponible : on propose le pont, il ne sera juste pas mémorisé
      setBridgeHidden(false)
    }
  }, [])

  const dismissBridge = () => {
    setBridgeHidden(true)
    try {
      window.localStorage.setItem(BRIDGE_DISMISSED_KEY, "1")
    } catch {
      // rien à mémoriser
    }
  }

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

  if (!showAwards && !showBridge) return null

  return (
    <div className="mx-auto mt-6 max-w-3xl divide-y divide-gold/20 rounded-2xl border border-gold/20 bg-felt-deep/70 px-4 py-1">
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
        <div className="py-1.5">
          <button
            type="button"
            onClick={() => setAwardsOpen((open) => !open)}
            aria-expanded={awardsOpen}
            className="flex min-h-[44px] w-full items-center gap-2 rounded-lg py-2 text-left text-xs text-cream/80 transition-colors hover:text-cream"
          >
            <Trophy className="h-4 w-4 shrink-0 text-gold" aria-hidden />
            <span className="font-semibold">{tAwards("toggle")}</span>
            <span className="ml-auto truncate text-cream/60">{nightSummary.headline}</span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 transition-transform ${awardsOpen ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>

          {awardsOpen && (
            <ul className="mt-1 space-y-1.5 pb-1">
              {nightSummary.lines.map((line) => (
                <li key={line.id} className="flex items-baseline gap-2 text-xs">
                  <span aria-hidden>{line.icon}</span>
                  <span className="shrink-0 font-semibold text-gold">{line.title}</span>
                  <span className="min-w-0 flex-1 truncate text-cream/70">{line.detail}</span>
                </li>
              ))}
              {nightSummary.topGame && (
                <li className="pt-0.5 text-xs text-cream/60">{nightSummary.topGame}</li>
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
        <div className="flex items-center gap-1 py-2.5">
          <p className="min-w-0 flex-1 text-xs leading-snug text-cream/70">
            {hasAccount ? t("bridge.memberText") : t("bridge.guestText")}{" "}
            {hasAccount ? (
              <button
                type="button"
                onClick={() => { void setPlayMode("online") }}
                className="font-semibold text-gold underline underline-offset-2 transition-colors hover:text-gold-strong"
              >
                {t("bridge.memberCta")}
              </button>
            ) : (
              <Link
                href="/compte"
                className="font-semibold text-gold underline underline-offset-2 transition-colors hover:text-gold-strong"
              >
                {t("bridge.guestCta")}
              </Link>
            )}
          </p>
          <button
            type="button"
            onClick={dismissBridge}
            aria-label={t("bridge.dismiss")}
            title={t("bridge.dismiss")}
            className="touch-target flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-cream/60 transition-colors hover:bg-white/10 hover:text-cream"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  )
}
