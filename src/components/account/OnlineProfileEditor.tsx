"use client"

import { useEffect, useId, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Cloud, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { OnlineCollection } from '@/components/online/OnlineCollection'
import { OnlinePlayerIcon, OnlinePlayerName, RankCrest } from '@/components/online/OnlinePlayerTag'
import { useAuth } from '@/hooks/useAuth'
import { useOnlineProgression } from '@/hooks/useOnlineProgression'
import { useSaveOnlinePreferences } from '@/hooks/useSaveOnlinePreferences'
import { apiErrorMessage } from '@/lib/api-response'
import { patchOnlineDisplayName } from './online-display-name'

/** Même borne que DISPLAY_NAME_MAX_LENGTH (src/lib/display-name.ts, module serveur). */
const ONLINE_NAME_MAX_LENGTH = 30

/**
 * L'identité EN LIGNE du compte connecté : pseudo affiché aux tables, look
 * (icône, effet, cadre) et progression partagée — ce que lisent la fiche
 * compte, la feuille « Mon compte » et la Collection.
 */
export function useOnlineIdentity() {
  const { user } = useAuth()
  const { progression, loading: progressionLoading } = useOnlineProgression()
  const name = user?.onlineDisplayName ?? user?.displayName ?? 'Joueur'
  const cosmetics = useMemo(
    () => ({
      preferences: { color: 'bg-amber-500' as const, ...user?.onlinePreferences },
      level: progression?.level ?? 1,
      role: user?.role ?? 'user',
    }),
    [user?.onlinePreferences, user?.role, progression?.level]
  )
  return { name, cosmetics, progression, progressionLoading }
}

/**
 * Collection en ligne du compte (icônes, effets, cadres). Enregistre les
 * TROIS champs fusionnés avec le profil, puis rafraîchit session et
 * progression partagées (useSaveOnlinePreferences).
 */
export function AccountOnlineCollection({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { user } = useAuth()
  const { name, cosmetics, progression } = useOnlineIdentity()
  const { save } = useSaveOnlinePreferences()
  return (
    <OnlineCollection
      open={open}
      onOpenChange={onOpenChange}
      displayName={name}
      role={user?.role ?? 'user'}
      preferences={cosmetics.preferences}
      progression={progression}
      onSave={(preferences) => {
        void save(preferences)
      }}
    />
  )
}

/**
 * Pseudo en ligne du compte (chaque réglage s'enregistre seul) et aperçu du
 * look, dont le bouton « Personnaliser » ouvre la Collection — c'est
 * l'appelant qui la monte (AccountOnlineCollection), car d'autres gestes
 * l'ouvrent aussi (carte Premiers pas, lien ?focus=profil).
 *
 * - `page` : la carte de la page /compte ;
 * - `sheet` : les champs de la feuille « Mon compte », sous son titre de section.
 */
export function OnlineProfileEditor({
  onCustomize,
  variant = 'page',
}: {
  onCustomize: () => void
  variant?: 'page' | 'sheet'
}) {
  const t = useTranslations('account')
  const tCommon = useTranslations('common')
  const tApiErrors = useTranslations('onlineLobby.errors')
  const { user, refresh } = useAuth()
  const { name, cosmetics } = useOnlineIdentity()
  const inputId = useId()
  const hintId = useId()

  const [onlineName, setOnlineName] = useState(() => user?.onlineDisplayName ?? user?.displayName ?? '')
  const [onlineNameError, setOnlineNameError] = useState<string | null>(null)
  const [onlineNameSaved, setOnlineNameSaved] = useState(false)

  useEffect(() => {
    setOnlineName(user?.onlineDisplayName ?? user?.displayName ?? '')
  }, [user?.id, user?.onlineDisplayName, user?.displayName])

  const saveOnlineName = async () => {
    const value = onlineName.trim()
    if (!value) return
    setOnlineNameError(null)
    setOnlineNameSaved(false)
    const result = await patchOnlineDisplayName(value)
    if (!result.ok) {
      setOnlineNameError(apiErrorMessage(result.error, tApiErrors, tApiErrors('server_error')))
      return
    }
    setOnlineName(value)
    await refresh()
    setOnlineNameSaved(true)
    window.setTimeout(() => setOnlineNameSaved(false), 1500)
  }

  const onNameChange = (value: string) => {
    setOnlineName(value)
    if (onlineNameError) setOnlineNameError(null)
  }

  /* Aperçu de l'identité en ligne (écusson de rang + icône encadrée + effet) */
  const preview = (
    <div
      className={
        variant === 'page'
          ? 'mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3'
          : 'flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3'
      }
    >
      <RankCrest role={user?.role} />
      <OnlinePlayerIcon cosmetics={cosmetics} className="h-10 w-10 text-xl" />
      <p className="min-w-0 flex-1 truncate text-sm font-semibold">
        <OnlinePlayerName name={name} cosmetics={cosmetics} />
      </p>
      {/* Libellé visible PARTOUT : un crayon seul ne disait pas que
          les niveaux débloquent de quoi s'habiller (23 joueurs de
          niveau 2+ n'y avaient jamais touché). En mobile, le bouton
          passe sur sa propre ligne, pleine largeur : le pseudo garde
          la place (il se tronquait à 3 caractères à 375px). */}
      <button
        type="button"
        onClick={onCustomize}
        className="flex min-h-[44px] w-full shrink-0 items-center justify-center gap-1.5 rounded-lg bg-amber-500/25 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/[0.35] sm:w-auto"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
        {t('playersList.customize')}
      </button>
    </div>
  )

  if (variant === 'sheet') {
    return (
      <div className="space-y-3">
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void saveOnlineName()
          }}
          className="space-y-1.5"
        >
          <div className="flex min-h-[24px] items-center justify-between gap-2">
            <label htmlFor={inputId} className="text-[13px] font-bold text-white/75">
              {t('sheet.onlineNameLabel')}
            </label>
            <span aria-hidden className="text-xs font-semibold tabular-nums text-white/50">
              {onlineName.length}/{ONLINE_NAME_MAX_LENGTH}
            </span>
          </div>
          <div className="flex gap-2">
            <Input
              id={inputId}
              value={onlineName}
              onChange={(e) => onNameChange(e.target.value)}
              maxLength={ONLINE_NAME_MAX_LENGTH}
              autoComplete="nickname"
              aria-describedby={hintId}
              aria-invalid={onlineNameError ? true : undefined}
              placeholder={t('onlineName.placeholder')}
              className="h-12 min-w-0 flex-1 rounded-xl border-white/40 bg-white/5 text-white placeholder:text-white/40 focus-visible:ring-gold focus-visible:ring-offset-0"
            />
            <Button type="submit" variant="quiet" className="h-12 shrink-0 rounded-xl px-4">
              {tCommon('save')}
            </Button>
          </div>
          <p id={hintId} className="text-xs text-white/60">
            {t('onlineName.hint')}
          </p>
          {onlineNameError && (
            <p role="alert" className="text-xs text-orange-300">
              {onlineNameError}
            </p>
          )}
          {onlineNameSaved && (
            <p role="status" className="text-xs text-emerald-300">
              {t('onlineName.saved')}
            </p>
          )}
        </form>
        {preview}
        <p className="text-xs text-white/60">{t('progression.hint')}</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white/70">
        <Cloud className="h-4 w-4 text-cyan-300" />
        {t('onlineName.title')}
      </div>
      <p className="mb-2 text-xs text-cyan-100/80">{t('onlineName.hint')}</p>

      {preview}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={onlineName}
          onChange={(e) => onNameChange(e.target.value)}
          maxLength={ONLINE_NAME_MAX_LENGTH}
          placeholder={t('onlineName.placeholder')}
          className="h-9 border-cyan-300/25 bg-black/20 text-sm text-white placeholder:text-white/35"
        />
        <button
          type="button"
          onClick={() => {
            void saveOnlineName()
          }}
          className="rounded-lg bg-cyan-500/25 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/[0.35]"
        >
          {tCommon('save')}
        </button>
      </div>
      {onlineNameError && <p className="mt-2 text-xs text-orange-300">{onlineNameError}</p>}
      {onlineNameSaved && <p className="mt-2 text-xs text-emerald-300">{t('onlineName.saved')}</p>}
    </div>
  )
}
