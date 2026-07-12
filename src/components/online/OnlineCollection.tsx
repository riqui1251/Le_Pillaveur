"use client"

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Lock } from 'lucide-react'
import {
  COSMETICS,
  GRANT_ONLY_FRAME_LEVEL,
  ICON_SERIES,
  ROLE_FRAME_MIN_RANK,
  VIP_FRAME_IDS,
  cosmeticKey,
  effectRarity,
  type CosmeticRarity,
} from '@/lib/online/cosmetics'
import type { OnlinePreferences } from '@/lib/online-preferences'
import type { PlayerIconFrame, PlayerSpecialEffect } from '@/lib/players'
import { OnlinePlayerIcon, OnlinePlayerName, RankCrest, type MemberCosmetics } from './OnlinePlayerTag'
import { PlayerIconById, playerIconLabel } from '@/components/icons/PlayerIcons'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Personnalisation EN LIGNE — remplace le PlayerCustomizer (local) pour
 * l'identité online : icônes en séries, effets par rareté, cadres (niveau +
 * rôle si débloqués). Tout est régi par la progression (voir cosmetics.ts) ;
 * un item verrouillé reste visible (cadenas + niveau requis) sauf les cadres
 * de rôle, masqués tant qu'ils ne sont pas débloqués par le grade.
 */

const RARITIES: CosmeticRarity[] = ['commun', 'rare', 'epique', 'legendaire']
const ROLE_FRAME_IDS = Object.keys(ROLE_FRAME_MIN_RANK)
const LEVEL_FRAMES = COSMETICS.filter((c) => c.kind === 'frame' && c.unlockLevel < GRANT_ONLY_FRAME_LEVEL)

export function OnlineCollection({
  open,
  onOpenChange,
  displayName,
  role,
  preferences,
  progression,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  displayName: string
  role: string
  preferences: OnlinePreferences
  progression: { level: number; unlockedKeys: string[] } | null
  onSave: (preferences: Partial<OnlinePreferences>) => void
}) {
  const t = useTranslations('onlineCollection')
  const tCommon = useTranslations('common')
  const tEffects = useTranslations('players.effects')
  const tFrames = useTranslations('players.frames')

  const [icon, setIcon] = useState(preferences.icon ?? '')
  const [effect, setEffect] = useState<PlayerSpecialEffect>(preferences.specialEffect ?? null)
  const [frame, setFrame] = useState<PlayerIconFrame>(preferences.iconFrame ?? null)

  useEffect(() => {
    if (!open) return
    setIcon(preferences.icon ?? '')
    setEffect(preferences.specialEffect ?? null)
    setFrame(preferences.iconFrame ?? null)
  }, [open, preferences.icon, preferences.specialEffect, preferences.iconFrame])

  const unlocked = useMemo(() => new Set(progression?.unlockedKeys ?? []), [progression])
  const isUnlocked = (kind: 'icon' | 'effect' | 'frame', id: string) => unlocked.has(cosmeticKey(kind, id))

  const previewCosmetics: MemberCosmetics = {
    preferences: { ...preferences, icon, specialEffect: effect, iconFrame: frame },
    level: progression?.level ?? 1,
    role,
  }

  const effectsByRarity = useMemo(() => {
    const groups = new Map<CosmeticRarity, typeof COSMETICS>()
    for (const r of RARITIES) groups.set(r, [])
    for (const c of COSMETICS.filter((c) => c.kind === 'effect')) {
      groups.get(effectRarity(c.unlockLevel))!.push(c)
    }
    return groups
  }, [])

  const visibleRoleFrames = ROLE_FRAME_IDS.filter((id) => isUnlocked('frame', id))
  const visibleVipFrames = VIP_FRAME_IDS.filter((id) => isUnlocked('frame', id))

  const handleSave = () => {
    onSave({ icon, specialEffect: effect, iconFrame: frame })
    onOpenChange(false)
  }

  const frameSwatch = (id: PlayerIconFrame) => (
    <OnlinePlayerIcon
      icon={icon}
      cosmetics={{ preferences: { ...preferences, icon, iconFrame: id }, level: progression?.level ?? 1, role }}
      className="h-9 w-9 text-lg"
    />
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-white/10 bg-[#0f0e14] text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white">{t('title', { name: displayName })}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <RankCrest role={role} size="lg" />
          <OnlinePlayerIcon icon={icon} cosmetics={previewCosmetics} className="h-12 w-12 text-2xl" />
          <div className="min-w-0">
            <p className="text-xs text-white/50">{t('preview')}</p>
            <p className="text-lg">
              <OnlinePlayerName name={displayName} cosmetics={previewCosmetics} />
            </p>
          </div>
        </div>

        {/* Icônes par séries */}
        <div>
          <p className="mb-2 text-sm font-medium text-white/70">{t('icons')}</p>
          <div className="space-y-3">
            {ICON_SERIES.map((series) => {
              const seriesUnlocked = series.icons.some((i) => isUnlocked('icon', i))
              return (
                <div key={series.id}>
                  <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/40">
                    {t(`seriesNames.${series.id}`)}
                    {!seriesUnlocked && (
                      <span className="flex items-center gap-0.5 normal-case text-white/30">
                        <Lock className="h-2.5 w-2.5" />
                        {series.unlockLevel >= 900 ? t('grantOnly') : t('unlockAt', { level: series.unlockLevel })}
                      </span>
                    )}
                  </p>
                  <div className="grid grid-cols-8 gap-1 sm:grid-cols-10">
                    {series.icons.map((i) => {
                      const locked = !isUnlocked('icon', i)
                      return (
                        <button
                          key={i}
                          type="button"
                          disabled={locked}
                          onClick={() => setIcon(i)}
                          title={playerIconLabel(i)}
                          aria-label={playerIconLabel(i)}
                          className={cn(
                            'flex h-9 w-9 items-center justify-center rounded-lg p-1.5 transition-colors hover:bg-white/10',
                            icon === i && 'bg-amber-500/25 ring-2 ring-amber-400/70',
                            locked && 'opacity-30 grayscale hover:bg-transparent'
                          )}
                        >
                          <PlayerIconById id={i} className="h-full w-full" />
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Effets par rareté */}
        <div>
          <p className="mb-2 text-sm font-medium text-white/70">{t('effects')}</p>
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setEffect(null)}
              className={cn(
                'w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-white/70 transition-colors hover:bg-white/[0.06]',
                effect === null && 'border-amber-400/50 bg-amber-500/10 ring-1 ring-amber-400/50'
              )}
            >
              {tEffects('classic')}
            </button>
            {RARITIES.map((rarity) => {
              const items = effectsByRarity.get(rarity) ?? []
              if (items.length === 0) return null
              return (
                <div key={rarity}>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/40">
                    {t(`rarity.${rarity}`)}
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {items.map((c) => {
                      const locked = !isUnlocked('effect', c.id)
                      return (
                        <button
                          key={c.id}
                          type="button"
                          disabled={locked}
                          onClick={() => setEffect(c.id as PlayerSpecialEffect)}
                          className={cn(
                            'rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.06]',
                            effect === c.id && 'border-amber-400/50 bg-amber-500/10 ring-1 ring-amber-400/50',
                            locked && 'opacity-45 hover:bg-white/[0.03]'
                          )}
                        >
                          <span className="flex items-center justify-between gap-1 text-sm">
                            <span className={cn('on-fx', `on-fx-${c.id}`)}>{tEffects(c.id)}</span>
                            {locked && (
                              <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-white/40">
                                <Lock className="h-3 w-3" />
                                {t('unlockAt', { level: c.unlockLevel })}
                              </span>
                            )}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Cadres (niveau) */}
        <div>
          <p className="mb-2 text-sm font-medium text-white/70">{t('frames')}</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            <button
              type="button"
              onClick={() => setFrame(null)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2.5 transition-colors hover:bg-white/[0.06]',
                frame === null && 'border-amber-400/50 bg-amber-500/10 ring-1 ring-amber-400/50'
              )}
            >
              {frameSwatch(null)}
              <span className="text-[10px] text-white/60">{tFrames('none')}</span>
            </button>
            {LEVEL_FRAMES.map((c) => {
              const locked = !isUnlocked('frame', c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={locked}
                  onClick={() => setFrame(c.id as PlayerIconFrame)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2.5 transition-colors hover:bg-white/[0.06]',
                    frame === c.id && 'border-amber-400/50 bg-amber-500/10 ring-1 ring-amber-400/50',
                    locked && 'opacity-45 hover:bg-white/[0.03]'
                  )}
                >
                  {frameSwatch(c.id as PlayerIconFrame)}
                  <span className="flex items-center gap-0.5 text-[10px] text-white/60">
                    {locked && <Lock className="h-3 w-3 text-white/40" />}
                    {locked ? t('unlockAt', { level: c.unlockLevel }) : tFrames(c.id)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Cadres de rôle — visibles seulement si débloqués par le grade */}
        {visibleRoleFrames.length > 0 && (
          <div>
            <p className="mb-1 text-sm font-medium text-white/70">{t('roleFrames')}</p>
            <p className="mb-2 text-xs text-emerald-300/70">{t('roleFramesHint')}</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {visibleRoleFrames.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFrame(id as PlayerIconFrame)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2.5 transition-colors hover:bg-white/[0.06]',
                    frame === id && 'border-amber-400/50 bg-amber-500/10 ring-1 ring-amber-400/50'
                  )}
                >
                  {frameSwatch(id as PlayerIconFrame)}
                  <span className="text-[10px] text-white/60">{tFrames(id)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Cadres VIP — grant-only (Fondateur), visibles seulement une fois accordés */}
        {visibleVipFrames.length > 0 && (
          <div>
            <p className="mb-1 text-sm font-medium text-white/70">{t('vipFrames')}</p>
            <p className="mb-2 text-xs text-amber-300/70">{t('vipFramesHint')}</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {visibleVipFrames.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFrame(id as PlayerIconFrame)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2.5 transition-colors hover:bg-white/[0.06]',
                    frame === id && 'border-amber-400/50 bg-amber-500/10 ring-1 ring-amber-400/50'
                  )}
                >
                  {frameSwatch(id as PlayerIconFrame)}
                  <span className="text-[10px] text-white/60">{tFrames(id)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-white/70 hover:bg-white/10 hover:text-white"
          >
            {tCommon('cancel')}
          </Button>
          <Button onClick={handleSave} className="bg-amber-500 text-black hover:bg-amber-400">
            {tCommon('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
