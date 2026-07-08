"use client"

import { useState, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Lock } from 'lucide-react'
import { Player, PLAYER_ICONS, PlayerSpecialEffect, PlayerIconFrame, PlayerPreferences } from '@/lib/players'
import { usePlayerEffectLabels, usePlayerFrameLabels } from '@/lib/players-i18n'
import { useAuth } from '@/hooks/useAuth'
import { canCustomizePlayerFrame } from '@/lib/roles'
import { cosmeticKey, findCosmetic, type CosmeticKind } from '@/lib/online/cosmetics'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { PlayerName } from '@/components/ui/PlayerName'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface PlayerCustomizerProps {
  player: Player | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (playerId: string, preferences: Partial<PlayerPreferences>) => void
  /**
   * Mode ONLINE : progression du compte. Quand fourni, les cosmétiques suivent
   * les déblocages par niveau (cadenas + « Nv. X ») et les cadres deviennent
   * accessibles à tous les comptes (plus seulement au staff). Absent = mode
   * LOCAL historique : effets libres, cadres réservés au staff.
   */
  progression?: { level: number; unlockedKeys: string[] } | null
}

export function PlayerCustomizer({ player, open, onOpenChange, onSave, progression }: PlayerCustomizerProps) {
  const t = useTranslations('players.customizer')
  const tCommon = useTranslations('common')
  const effectLabels = usePlayerEffectLabels()
  const frameLabels = usePlayerFrameLabels()
  const { user } = useAuth()
  const canSetFrame = progression ? true : canCustomizePlayerFrame(user?.role)
  const [selectedIcon, setSelectedIcon] = useState<string>('')
  const [selectedEffect, setSelectedEffect] = useState<PlayerSpecialEffect>(null)
  const [selectedFrame, setSelectedFrame] = useState<PlayerIconFrame>(null)

  useEffect(() => {
    if (player) {
      setSelectedIcon(player.preferences.icon || PLAYER_ICONS[0])
      setSelectedEffect(player.preferences.specialEffect ?? null)
      setSelectedFrame(player.preferences.iconFrame ?? null)
    }
  }, [player])

  /** En mode online : null = déverrouillé, sinon niveau requis (cadenas). */
  const lockedLevel = (kind: CosmeticKind, id: string | null): number | null => {
    if (!progression || id === null) return null
    if (progression.unlockedKeys.includes(cosmeticKey(kind, id))) return null
    return findCosmetic(kind, id)?.unlockLevel ?? null
  }

  /** Le cadre staff n'apparaît en ligne que s'il est débloqué (rôle staff). */
  const frameVisible = (id: PlayerIconFrame): boolean => {
    if (!progression || id !== 'staff') return true
    return progression.unlockedKeys.includes(cosmeticKey('frame', 'staff'))
  }

  const previewPlayer = useMemo<Player | null>(() => {
    if (!player) return null
    return {
      ...player,
      preferences: {
        ...player.preferences,
        icon: selectedIcon,
        specialEffect: selectedEffect,
        iconFrame: canSetFrame ? selectedFrame : player.preferences.iconFrame,
      },
    }
  }, [player, selectedIcon, selectedEffect, selectedFrame, canSetFrame])

  const handleSave = () => {
    if (!player) return
    const preferences: Partial<PlayerPreferences> = {
      icon: selectedIcon,
      specialEffect: selectedEffect,
    }
    if (canSetFrame) {
      preferences.iconFrame = selectedFrame
    }
    onSave(player.id, preferences)
    onOpenChange(false)
  }

  return (
    <Dialog open={open && player !== null} onOpenChange={onOpenChange}>
      {player && previewPlayer && (
        <DialogContent className="max-h-[90vh] overflow-y-auto border-white/10 bg-[#0f0e14] text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">{t('title', { name: player.name })}</DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <PlayerIcon player={previewPlayer} size="lg" />
            <div>
              <p className="text-xs text-white/50">{t('preview')}</p>
              <p className="text-lg">
                <PlayerName player={previewPlayer} />
              </p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-white/70">{t('icon')}</p>
            <div className="grid max-h-40 grid-cols-8 gap-1 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.02] p-2 sm:grid-cols-10">
              {PLAYER_ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setSelectedIcon(icon)}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-lg text-lg transition-colors hover:bg-white/10',
                    selectedIcon === icon && 'bg-amber-500/25 ring-2 ring-amber-400/70'
                  )}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-white/70">{t('effect')}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {effectLabels.map((effect) => {
                const effectPreview: Player = {
                  ...player,
                  name: effect.label,
                  preferences: {
                    ...player.preferences,
                    specialEffect: effect.id,
                  },
                }
                const locked = lockedLevel('effect', effect.id)
                return (
                  <button
                    key={effect.id ?? 'classic'}
                    type="button"
                    disabled={locked !== null}
                    onClick={() => setSelectedEffect(effect.id)}
                    className={cn(
                      'rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.06]',
                      selectedEffect === effect.id && 'border-amber-400/50 bg-amber-500/10 ring-1 ring-amber-400/50',
                      locked !== null && 'opacity-45 hover:bg-white/[0.03]'
                    )}
                  >
                    <span className="flex items-center justify-between gap-1 text-sm">
                      <PlayerName player={effectPreview} />
                      {locked !== null && (
                        <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-white/40">
                          <Lock className="h-3 w-3" />
                          {t('lockedLevel', { level: locked })}
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {canSetFrame && (
            <div>
              <p className="mb-1 text-sm font-medium text-white/70">{t('frame')}</p>
              {!progression && (
                <p className="mb-2 text-xs text-emerald-300/70">{t('frameStaffOnly')}</p>
              )}
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {frameLabels.filter((f) => frameVisible(f.id)).map((frame) => {
                  const framePreview: Player = {
                    ...player,
                    preferences: {
                      ...player.preferences,
                      icon: selectedIcon,
                      iconFrame: frame.id,
                    },
                  }
                  const locked = lockedLevel('frame', frame.id)
                  return (
                    <button
                      key={frame.id ?? 'none'}
                      type="button"
                      disabled={locked !== null}
                      onClick={() => setSelectedFrame(frame.id)}
                      className={cn(
                        'flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2.5 transition-colors hover:bg-white/[0.06]',
                        selectedFrame === frame.id && 'border-amber-400/50 bg-amber-500/10 ring-1 ring-amber-400/50',
                        locked !== null && 'opacity-45 hover:bg-white/[0.03]'
                      )}
                    >
                      <PlayerIcon player={framePreview} size="md" />
                      <span className="flex items-center gap-0.5 text-[10px] text-white/60">
                        {locked !== null && <Lock className="h-3 w-3 text-white/40" />}
                        {locked !== null ? t('lockedLevel', { level: locked }) : frame.label}
                      </span>
                    </button>
                  )
                })}
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
            <Button
              onClick={handleSave}
              className="bg-amber-500 text-black hover:bg-amber-400"
            >
              {tCommon('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}
