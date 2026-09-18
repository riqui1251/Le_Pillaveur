"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { Link, useRouter } from "@/i18n/navigation"
import { PlayerManager } from "@/components/PlayerManager"
import { HubShell } from "@/components/hub/HubShell"
import { useSelectedPlayers } from "@/hooks/useSelectedPlayers"
import { useAuth } from "@/hooks/useAuth"
import { useLocalizedGame } from "@/lib/games-i18n"
import { resolveNextGame } from "@/lib/next-game-path"
import { Button } from "@/components/ui/button"

export default function JoueursPage() {
  const t = useTranslations('hub.joueurs')

  return (
    <HubShell
      title={t('title')}
      subtitle={t('subtitle')}
    >
      {/* useSearchParams réclame sa propre frontière Suspense : sans elle, un
          rendu statique de la page échouerait au build. Le titre, lui, ne
          dépend pas de l'URL et reste hors du repli. */}
      <Suspense fallback={null}>
        <JoueursContent />
      </Suspense>
    </HubShell>
  )
}

function JoueursContent() {
  const t = useTranslations('hub.joueurs')
  const router = useRouter()
  const { select } = useSelectedPlayers()
  const { user, loading } = useAuth()
  const searchParams = useSearchParams()
  // Le jeu que le groupe avait choisi avant d'être envoyé ici (?next=, posé
  // par la garde des pages de jeu, l'état vide d'un jeu ou la carte du hub) :
  // on y retourne après « Commencer » au lieu de renvoyer au hub re-toucher
  // la carte. Valeur d'URL, donc filtrée : seul un jeu publié du catalogue
  // passe, tout le reste ramène au hub comme avant.
  const nextGame = resolveNextGame(searchParams.get('next'))
  // Titre localisé (et adouci en ambiance sans alcool) : « Jouer à Purple »
  // dit où l'on va, « Commencer la partie » non.
  const localizedGame = useLocalizedGame(nextGame?.id ?? '')
  const startLabel = localizedGame ? t('playGame', { game: localizedGame.title }) : undefined

  return (
    <>
      {!loading && !user && (
        <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-center">
          <p className="text-sm text-amber-100/90">{t('guestPrompt')}</p>
          <Button asChild className="mt-3 bg-amber-500 text-black hover:bg-amber-400">
            <Link href="/compte">{t('guestCta')}</Link>
          </Button>
        </div>
      )}

      {/* Pas de backdrop-blur ici : il créerait un containing block et
          détacherait la barre d'action fixe du viewport. */}
      <div className="rounded-2xl border border-gold/15 bg-felt-deep/40 p-4 sm:p-6">
        <PlayerManager
          variant="hub"
          startLabel={startLabel}
          onPlayersSelected={(ids) => {
            select(ids)
            router.push(nextGame?.path ?? '/jeux')
          }}
          onStartOnline={() => {
            select([])
            router.push('/jeux')
          }}
          minPlayers={2}
          hideRemoveButtons
        />
      </div>
    </>
  )
}
