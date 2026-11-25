"use client"

import { Link, useRouter } from "@/i18n/navigation"
import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { Check, ChevronDown, Plus, Trophy, Users, X } from "lucide-react"
import { usePlayers } from "@/hooks/usePlayers"
import { useSelectedPlayers } from "@/hooks/useSelectedPlayers"
import { useAuth } from "@/hooks/useAuth"
import { useNightSummary } from "@/lib/gameMetrics-i18n"
import { enterLocalPlay } from "@/lib/local-play-client"
import { validateLocalPlayerName } from "@/lib/name-moderation"
import { PLAYER_NAME_MAX_LENGTH } from "@/lib/players"
import { cn } from "@/lib/utils"
import { PlayerIcon } from "@/components/ui/PlayerIcon"
import { PlayerName } from "@/components/ui/PlayerName"
import { Button } from "@/components/ui/button"
import { GameIconById } from "@/components/hub/GameIconById"

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
 * (PartyBar) : on coche ou décoche ceux qui jouent, et on ajoute un prénom sur
 * place. Le menu n'a plus d'entrée « Joueurs » : c'est ici, en touchant le
 * nombre de joueurs de la barre, qu'on change la table. Icônes, couleurs et
 * statistiques restent sur /joueurs, en lien discret.
 */
export function SelectedPlayersPanel() {
  const t = useTranslations("hub.selectedPlayers")
  const tCommon = useTranslations("common")
  const { players, loading, addPlayers } = usePlayers()
  const { selectedIds, add, remove } = useSelectedPlayers()
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [announce, setAnnounce] = useState("")

  // Un visiteur (ni compte ni mode local) qui suivait un lien nu vers
  // /joueurs, route protégée, retombait sur le formulaire de compte : le
  // cookie de mode local se pose d'abord (même porte que PlayModeToggle), la
  // navigation suit, même si la pose échoue. Tant que l'auth n'a pas répondu,
  // le lien nu reste : un compte n'a pas besoin du cookie.
  const isVisitor = !authLoading && !user
  const goToPlayers = () => {
    void enterLocalPlay()
      .catch(() => undefined)
      .then(() => router.push("/joueurs"))
  }

  if (loading) return <div aria-busy="true" className="h-12 rounded-2xl bg-cream/[0.06] motion-safe:animate-pulse" />

  const selected = new Set(selectedIds)
  const count = players.filter((p) => selected.has(p.id)).length

  const toggle = (id: string, name: string) => {
    setError(null)
    if (selected.has(id)) {
      remove(id)
      setAnnounce(t("announceRemoved", { name }))
    } else {
      add(id)
      setAnnounce(t("announceAdded", { name }))
    }
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const name = draft.trim()
    if (!name) return
    // Un prénom déjà connu de l'appareil : on le coche, on n'en crée pas un double.
    const known = players.find((p) => p.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())
    if (known) {
      add(known.id)
      setDraft("")
      setError(null)
      setAnnounce(t("announceAdded", { name: known.name }))
      return
    }
    if (!validateLocalPlayerName(name, PLAYER_NAME_MAX_LENGTH).ok) {
      setError(t("refused", { name }))
      return
    }
    const { created } = addPlayers([name])
    if (!created[0]) {
      setError(t("refused", { name }))
      return
    }
    add(created[0].id)
    setDraft("")
    setError(null)
    setAnnounce(t("announceAdded", { name: created[0].name }))
  }

  const manage = (
    <>
      <Users className="mr-2 h-4 w-4" aria-hidden />
      {t("manage")}
    </>
  )

  return (
    <div className="space-y-3">
      <p className="text-sm text-cream/70">
        <span className="font-semibold text-cream">{tCommon("playerCount", { count })}</span>
        {players.length > 0 && <> · {t("editHint")}</>}
      </p>

      {players.length === 0 ? (
        <p className="text-sm text-cream/70">{t("noneSaved")}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {players.map((player) => {
            const on = selected.has(player.id)
            return (
              <li key={player.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(player.id, player.name)}
                  className={cn(
                    "flex min-h-[44px] items-center gap-2 rounded-full border py-1 pl-1.5 pr-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
                    on
                      ? "border-gold bg-gold/[0.15] text-cream"
                      : "border-gold/20 bg-black/25 text-cream/60 hover:border-gold/50 hover:text-cream"
                  )}
                >
                  <PlayerIcon player={player} size="sm" className={cn("h-8 w-8 text-base", !on && "opacity-50 grayscale")} />
                  <PlayerName player={player} />
                  {on && <Check className="h-4 w-4 text-gold" aria-hidden />}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <form onSubmit={submit} className="flex gap-2">
        <label htmlFor="party-bar-new-player" className="sr-only">
          {t("addLabel")}
        </label>
        <input
          id="party-bar-new-player"
          value={draft}
          onChange={(event) => {
            setError(null)
            setDraft(event.target.value)
          }}
          placeholder={t("addPlaceholder")}
          maxLength={PLAYER_NAME_MAX_LENGTH}
          autoComplete="off"
          enterKeyHint="done"
          className="min-w-0 flex-1 rounded-2xl border border-gold/20 bg-black/25 px-3.5 py-2.5 text-base font-semibold text-cream placeholder:text-cream/40 focus:border-gold focus:outline-none"
        />
        <Button type="submit" variant="quiet" size="game" disabled={!draft.trim()}>
          <Plus className="mr-1 h-4 w-4" aria-hidden />
          {t("add")}
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      {isVisitor ? (
        <Button type="button" onClick={goToPlayers} variant="quiet" size="game" className="w-full">
          {manage}
        </Button>
      ) : (
        <Button asChild variant="quiet" size="game" className="w-full">
          <Link href="/joueurs">{manage}</Link>
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
                <li className="flex items-center gap-1.5 pt-0.5 text-xs text-cream/60">
                  {nightSummary.topGameId && (
                    <span aria-hidden>
                      <GameIconById id={nightSummary.topGameId} surface="felt" className="block h-5 w-5 shrink-0" />
                    </span>
                  )}
                  <span className="min-w-0">{nightSummary.topGame}</span>
                </li>
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
