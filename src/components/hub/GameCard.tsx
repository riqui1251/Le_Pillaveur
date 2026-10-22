"use client"

import { Link, useRouter } from "@/i18n/navigation"
import { useLinkStatus } from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { Bot, Loader2, Users, WifiOff } from "lucide-react"
import { LocalizedGameMeta } from "@/lib/games-i18n"
import { hasContentIn } from "@/lib/games"
import { PlayingCard } from "@/components/ui/PlayingCard"
import { cn } from "@/lib/utils"
import { ReactNode, useEffect, useState, useTransition } from "react"
import { useSelectedPlayers } from "@/hooks/useSelectedPlayers"
import { useAuth } from "@/hooks/useAuth"

interface GameCardProps {
  game: LocalizedGameMeta
  icon: ReactNode
  /**
   * Badge « Mieux à plusieurs » (hub en mode solo, jeu soloFit 'group') :
   * le jeu reste proposé, mais le visiteur seul sait AVANT le clic qu'il se
   * joue surtout entre potes (voir GameMeta.soloFit).
   */
  groupHint?: boolean
  /**
   * Carte éteinte : le jeu ne peut pas s'ouvrir maintenant (jeu en ligne
   * alors que le navigateur est hors ligne). Elle reste visible et nommée —
   * le catalogue ne change pas de forme — mais ne mène nulle part.
   */
  disabled?: boolean
  /** Pastille courte posée sur la carte éteinte, avec l'icône WifiOff (« Hors ligne »). */
  disabledLabel?: string
  /** Pourquoi elle est éteinte, en une phrase : lecteur d'écran, et bulle au toucher. */
  disabledHint?: string
}

/** Durée de la bulle d'explication d'une carte éteinte touchée. */
const EXPLAIN_MS = 3500

/** Badge « nombre de joueurs » : 3-12, ou 2+ quand il n'y a pas de vrai plafond. */
function playersLabel(min?: number, max?: number): string | null {
  if (!min) return null
  if (!max || max >= 20) return `${min}+`
  if (max === min) return `${min}`
  return `${min}-${max}`
}

/**
 * Voile « ça s'ouvre » posé sur la carte le temps de la navigation. Sur un
 * réseau de soirée, toucher une tuile laissait 1 à 3 s sans AUCUN retour :
 * les joueurs tapaient une deuxième fois ou décrétaient que « ça marche
 * pas ». `useLinkStatus` lit le statut du <Link> parent par contexte — il
 * doit donc vivre dans un composant ENFANT du lien, pas dans GameCard.
 * `forced` couvre le détour par /joueurs (router.push après preventDefault),
 * que le lien ne voit jamais passer et dont il ne saurait rien.
 */
function OpeningVeil({ forced, label }: { forced: boolean; label: string }) {
  const { pending } = useLinkStatus()
  if (!pending && !forced) return null
  return (
    <div
      role="status"
      aria-label={label}
      // Le voile couvre toute la carte : un second tap l'atteint lui, et on
      // l'avale ici — sinon il relancerait la navigation (ou la redirection)
      // déjà en cours.
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      className="absolute inset-0 z-10 grid place-items-center rounded-xl bg-[#24201A]/25"
    >
      <Loader2 className="h-5 w-5 animate-spin text-[#24201A]" aria-hidden />
    </div>
  )
}

/**
 * Tuile de jeu « Vitrine » : mini-carte à jouer verticale — coin rang+enseigne,
 * icône en vedette à l'encre (accent rouge carreau pour ♥♦, voir
 * GameIconById `surface="card"` : un corps entier en rouge s'effaçait), titre
 * Playfair centré et accroche sur deux lignes — 22 noms de code sans un mot
 * d'explication ne se choisissent pas au doigt.
 */
export function GameCard({ game, icon, groupHint = false, disabled = false, disabledLabel, disabledHint }: GameCardProps) {
  const t = useTranslations("hub.jeux")
  const locale = useLocale()
  const router = useRouter()
  const { user } = useAuth()
  const { selectedIds } = useSelectedPlayers()
  // Détour par /joueurs : le lien est court-circuité (preventDefault), son
  // statut reste donc « idle » — c'est cette transition qui porte le retour
  // visuel à sa place, jusqu'à ce que la page des joueurs soit montée.
  const [redirecting, startRedirect] = useTransition()
  const isOnline = user?.playMode === "online"
  // Le nombre de joueurs concerne les salles EN LIGNE (en local, c'est libre).
  const players = isOnline ? playersLabel(game.minPlayers, game.maxPlayers) : null
  // Cartes du jeu absentes de la langue du site (Sans Filtre, Dilemmes hors
  // fr) : dit AVANT le clic — la création de table serait refusée.
  const frOnly = !hasContentIn(game, locale)
  // Carte éteinte touchée : sans retour, le joueur retapait en croyant à un
  // bug (le `title` ne s'affiche pas au doigt). Une bulle dit pourquoi.
  const [explaining, setExplaining] = useState(false)
  useEffect(() => {
    if (!explaining) return
    const id = window.setTimeout(() => setExplaining(false), EXPLAIN_MS)
    return () => window.clearTimeout(id)
  }, [explaining])

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (isOnline) return
    // Visiteur sans session : laisser passer vers la page du jeu, qui propose
    // « Essayer avec des bots » (online) ou la vitrine locale — surtout pas
    // le détour par la gestion de joueurs locaux.
    if (!user) return
    if (selectedIds.length === 0) {
      e.preventDefault()
      // `?next=` : une fois les joueurs cochés, /joueurs renvoie directement
      // vers le jeu choisi au lieu de laisser retrouver la tuile dans le hub.
      // Encodé comme les autres émetteurs (useRequireSelectedPlayers,
      // SelectedPlayersDisplay) : searchParams.get le rend tel quel à la
      // garde, qui le compare à l'exact au catalogue.
      startRedirect(() => {
        router.push(`/joueurs?next=${encodeURIComponent(game.path)}`)
      })
    }
  }

  // `touch-manipulation` : ni délai de 300 ms ni zoom sur un double tap — le
  // doigt impatient ne doit rien déclencher d'autre que la navigation.
  //
  // `prefetch={false}` : les pages de jeu sont rendues au build, et pour une
  // route statique Next précharge le .rsc ENTIER de chaque carte qui entre
  // dans l'écran (sans PPR, pas de version « jusqu'au loading.tsx ») — les
  // 22 cartes ≈ 555 Ko gz, aux deux tiers des messages que le navigateur a
  // déjà, à retélécharger toutes les 5 min (cache de préchargement) sur la
  // page ouverte entre chaque partie. Le tap paie donc son seul .rsc (~25 Ko
  // gz) derrière le voile ci-dessous puis games/loading.tsx — le coût des
  // pages dynamiques d'avant, sans la rafale. En Next 15 ce réglage coupe
  // aussi le préchargement au survol/toucher : assumé, un doigt ne survole pas.
  //
  // Carte ÉTEINTE (`disabled`) : plus de <Link> du tout — un lien qui garde son
  // href s'ouvre quand même au clic molette, en « nouvel onglet » ou à Entrée
  // depuis le mode navigation du lecteur d'écran, et `tabIndex=-1` le
  // rendrait invisible au clavier. Une boîte `role="link"` `aria-disabled`,
  // focalisable, porte la raison (infobulle + texte sr-only) et ne va nulle part.
  // `opacity-40 grayscale` : `opacity-45` ne génère rien en Tailwind 3.3, et
  // une demi-saturation seule ne change presque rien sur crème et encre.
  const card = (
    <PlayingCard
      suit={game.suit}
      rank={game.rank}
      className={cn(
        "h-full transition-all duration-200",
        disabled
          ? "opacity-40 grayscale"
          : "group-hover:-translate-y-0.5 group-hover:shadow-[0_16px_30px_-12px_rgba(0,0,0,0.7)] group-active:scale-[0.98]"
      )}
    >
        {disabled && disabledHint && <span className="sr-only">{disabledHint}</span>}
        {/* Badges du coin haut-droit, libre sur la mini-carte (le rang+enseigne
            occupe haut-gauche et bas-droite) : « Bêta », « FR » (cartes en
            français seulement, hors fr) et le robot « jouable avec des bots ».
            Encre sur crème, comme les coins : ils informent, ils ne crient pas. */}
        {(game.beta || frOnly || game.botsFillable) && (
          <span className="absolute right-1 top-0.5 flex items-center gap-0.5">
            {game.beta && (
              <span
                title={t("betaHint")}
                className="select-none rounded-sm border border-[#24201A]/25 px-[3px] font-display text-[11px] font-bold leading-[13px] text-[#24201A]/75"
              >
                {t("betaBadge")}
              </span>
            )}
            {frOnly && (
              <span
                title={t("frOnlyHint")}
                className="select-none rounded-sm border border-[#24201A]/25 px-[3px] font-display text-[11px] font-bold leading-[13px] text-[#24201A]/75"
              >
                <span aria-hidden>{t("frOnlyBadge")}</span>
                <span className="sr-only">{t("frOnlyHint")}</span>
              </span>
            )}
            {game.botsFillable && (
              <span title={t("botsBadge")} className="flex h-[13px] items-center text-[#4A443A]">
                <Bot className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">{t("botsBadge")}</span>
              </span>
            )}
          </span>
        )}
        {/* pt-4 : l'icône de 36 px passe sous la rangée de badges du coin.
            pb-6 : la 2e ligne d'accroche butait sur l'index retourné du coin
            bas-droit (rang + enseigne, ~22 px de haut). */}
        <article className="flex h-full min-h-[7.5rem] flex-col items-center px-1.5 pb-6 pt-4 text-center">
          <div className="shrink-0">{icon}</div>
          <h3 className="mt-1 line-clamp-2 font-display text-[13px] font-bold leading-tight text-[#24201A] sm:text-sm">
            {game.title}
          </h3>
          {/* L'accroche ne vivait que dans le `title=` du lien : invisible au
              doigt, le hub n'était qu'une liste de noms de code. Deux lignes
              maximum — au-delà, la colonne de 375/3 px déborde de la carte
              (le `title=` du lien garde le texte entier au survol). 11 px,
              le plancher du dépôt, en encre adoucie #4A443A (8:1) : le gris
              #6B6455 passait sur le papier, pas à bout de bras. */}
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-[1.3] text-[#4A443A]">
            {game.description}
          </p>
          {(groupHint || players) && (
            // Pied de carte commun : un seul `mt-auto`, sinon deux marges
            // automatiques se partageraient l'espace libre et décolleraient
            // le badge du nombre de joueurs.
            <span className="mt-auto flex flex-col items-center gap-0.5 pt-0.5">
              {groupHint && (
                // Largeur bornée à la colonne MOINS l'index du coin bas-droit
                // (rang + enseigne retournés de PlayingCard, ~7 px à 6 px du
                // bord) : centré, le badge garde 10 px libres de chaque côté.
                // À 375 px (~97 px utiles), le libellé passe sur deux lignes
                // au lieu de recouvrir l'index. Fond crème : rien ne se mêle
                // à sa bordure. 11 px comme les badges « Bêta »/« FR » : le
                // plancher lisible au téléphone (règle ESLint du dépôt).
                <span className="inline-flex max-w-[calc(100%-1.25rem)] items-center gap-0.5 rounded-sm border border-[#24201A]/20 bg-cream px-1 py-px text-[11px] font-semibold leading-[13px] text-[#6B6455]">
                  <Users className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="min-w-0 text-center">{t("soloFit.groupBadge")}</span>
                </span>
              )}
              {players && (
                <span className="inline-flex items-center gap-0.5 text-[11px] font-bold leading-[14px] text-[#4A443A]">
                  <Users className="h-3 w-3 shrink-0" aria-hidden />
                  <span aria-hidden>{players}</span>
                  <span className="sr-only">{t("playersBadge", { range: players })}</span>
                </span>
              )}
            </span>
          )}
        </article>
        {/* Le voile lit le statut du <Link> parent : sans lien, pas de voile. */}
        {!disabled && <OpeningVeil forced={redirecting} label={t("opening")} />}
      </PlayingCard>
  )

  if (disabled) {
    return (
      <div
        role="link"
        aria-disabled="true"
        tabIndex={0}
        title={disabledHint ?? game.description}
        onClick={() => setExplaining(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            setExplaining(true)
          }
        }}
        className="group relative block h-full cursor-not-allowed touch-manipulation"
      >
        {card}
        {/* Hors de la carte voilée : à 40 % d'opacité, la pastille ne se
            lirait plus. */}
        {disabledLabel && (
          <span aria-hidden className="pointer-events-none absolute inset-x-1 bottom-2 flex justify-center">
            <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-gold/40 bg-felt-deep px-2 py-0.5 text-[11px] font-semibold leading-[14px] text-cream">
              <WifiOff className="h-3 w-3 shrink-0" />
              <span className="truncate">{disabledLabel}</span>
            </span>
          </span>
        )}
        <span
          role="status"
          className={
            explaining && disabledHint
              ? "absolute inset-0 z-10 grid place-items-center rounded-xl border border-gold/40 bg-felt-deep/95 p-2 text-center text-[11px] font-semibold leading-snug text-cream"
              : "sr-only"
          }
        >
          {explaining ? disabledHint : null}
        </span>
      </div>
    )
  }

  return (
    <Link href={game.path} prefetch={false} onClick={handleClick} className="group block h-full touch-manipulation" title={game.description}>
      {card}
    </Link>
  )
}
