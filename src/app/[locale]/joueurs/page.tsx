"use client"

import { useTranslations } from "next-intl"
import { Link, useRouter } from "@/i18n/navigation"
import { PlayerManager } from "@/components/PlayerManager"
import { HubShell } from "@/components/hub/HubShell"
import { useSelectedPlayers } from "@/hooks/useSelectedPlayers"
import { useAuth } from "@/hooks/useAuth"
import { Button } from "@/components/ui/button"

export default function JoueursPage() {
  const t = useTranslations('hub.joueurs')
  const router = useRouter()
  const { select } = useSelectedPlayers()
  const { user, loading } = useAuth()

  return (
    <HubShell
      step="joueurs"
      title={t('title')}
      subtitle={t('subtitle')}
    >
      {!loading && !user && (
        <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-center">
          <p className="text-sm text-amber-100/90">{t('guestPrompt')}</p>
          <Button asChild className="mt-3 bg-amber-500 text-black hover:bg-amber-400">
            <Link href="/compte">{t('guestCta')}</Link>
          </Button>
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 backdrop-blur-sm sm:p-6">
        <PlayerManager
          variant="hub"
          onPlayersSelected={(ids) => {
            select(ids)
            router.push("/jeux")
          }}
          minPlayers={2}
          hideRemoveButtons
        />
      </div>
    </HubShell>
  )
}
