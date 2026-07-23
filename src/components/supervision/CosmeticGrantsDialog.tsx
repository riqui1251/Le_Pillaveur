'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Gift, Lock, Sparkles, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { COSMETICS, VIP_FRAME_LABELS, cosmeticKey, type CosmeticKind } from '@/lib/online/cosmetics'
import { PLAYER_EFFECTS, PLAYER_FRAMES } from '@/lib/players'
import { cn } from '@/lib/utils'

/**
 * Déblocage manuel de cosmétiques sur un compte joueur — FONDATEUR uniquement
 * (la route API refait la vérification). Chaque ligne du catalogue montre
 * l'état réel (niveau / grant / verrouillé) et permet grant / revoke.
 */

type Progression = {
  level: number
  unlockedKeys: string[]
  grantedKeys: string[]
}

function labelFor(kind: CosmeticKind, id: string): string {
  if (kind === 'frame' && id in VIP_FRAME_LABELS) return VIP_FRAME_LABELS[id]
  const list = kind === 'effect' ? PLAYER_EFFECTS : PLAYER_FRAMES
  return list.find((e) => e.id === id)?.label ?? id
}

export function CosmeticGrantsDialog({
  target,
  onClose,
}: {
  target: { userId: string; displayName: string } | null
  onClose: () => void
}) {
  const t = useTranslations('supervision.cosmetics')
  const [progression, setProgression] = useState<Progression | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  useEffect(() => {
    if (!target) {
      setProgression(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/users/cosmetics?userId=${encodeURIComponent(target.userId)}`,
          { credentials: 'include' }
        )
        if (!res.ok) return
        const json = (await res.json()) as { progression: Progression }
        if (!cancelled) setProgression(json.progression)
      } catch {
        // réseau : le dialog reste en chargement, fermable
      }
    })()
    return () => {
      cancelled = true
    }
  }, [target])

  const toggle = async (kind: CosmeticKind, id: string, granted: boolean) => {
    if (!target) return
    const key = cosmeticKey(kind, id)
    setBusyKey(key)
    try {
      const res = await fetch('/api/admin/users/cosmetics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          userId: target.userId,
          kind,
          id,
          action: granted ? 'revoke' : 'grant',
        }),
      })
      if (res.ok) {
        const json = (await res.json()) as { progression: Progression }
        setProgression(json.progression)
      }
    } finally {
      setBusyKey(null)
    }
  }

  /** Débloque (ou retire) TOUT le catalogue d'un coup — effets, cadres, icônes. */
  const bulk = async (action: 'grant-all' | 'revoke-all') => {
    if (!target) return
    setBusyKey(action)
    try {
      const res = await fetch('/api/admin/users/cosmetics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: target.userId, action }),
      })
      if (res.ok) {
        const json = (await res.json()) as { progression: Progression }
        setProgression(json.progression)
      }
    } finally {
      setBusyKey(null)
    }
  }

  const sections: { kind: CosmeticKind; title: string }[] = [
    { kind: 'effect', title: t('effects') },
    { kind: 'frame', title: t('frames') },
  ]

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-300" />
            {t('title', { name: target?.displayName ?? '' })}
          </DialogTitle>
          <DialogDescription>
            {progression ? t('subtitle', { level: progression.level }) : t('loading')}
          </DialogDescription>
        </DialogHeader>

        {progression && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={busyKey !== null}
                className="flex-1 bg-gradient-to-r from-amber-500 to-amber-600 text-xs font-bold"
                onClick={() => void bulk('grant-all')}
              >
                <Gift className="mr-1 h-3 w-3" />
                {t('grantAll')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busyKey !== null}
                className="flex-1 text-xs"
                onClick={() => void bulk('revoke-all')}
              >
                <Square className="mr-1 h-3 w-3" />
                {t('revokeAll')}
              </Button>
            </div>
            {sections.map(({ kind, title }) => (
              <div key={kind}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-white/40">
                  {title}
                </p>
                <div className="space-y-1">
                  {COSMETICS.filter((c) => c.kind === kind).map((c) => {
                    const key = cosmeticKey(c.kind, c.id)
                    const granted = progression.grantedKeys.includes(key)
                    const unlocked = progression.unlockedKeys.includes(key)
                    const byLevel = unlocked && !granted
                    return (
                      <div
                        key={key}
                        className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-1.5"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {labelFor(c.kind, c.id)}
                          <span className="ml-1.5 text-[10px] text-white/35">
                            {t('levelRequired', { level: c.unlockLevel })}
                          </span>
                        </span>
                        <span
                          className={cn(
                            'flex items-center gap-1 text-[10px]',
                            granted ? 'text-amber-300' : byLevel ? 'text-emerald-300' : 'text-white/30'
                          )}
                        >
                          {granted ? (
                            <>
                              <Gift className="h-3 w-3" />
                              {t('stateGranted')}
                            </>
                          ) : byLevel ? (
                            <>
                              <Check className="h-3 w-3" />
                              {t('stateUnlocked')}
                            </>
                          ) : (
                            <>
                              <Lock className="h-3 w-3" />
                              {t('stateLocked')}
                            </>
                          )}
                        </span>
                        {!byLevel && (
                          <Button
                            size="sm"
                            variant={granted ? 'secondary' : 'outline'}
                            disabled={busyKey === key}
                            className="h-7 px-2 text-xs"
                            onClick={() => void toggle(c.kind, c.id, granted)}
                          >
                            {granted ? (
                              <Square className="mr-1 h-3 w-3" />
                            ) : (
                              <Gift className="mr-1 h-3 w-3" />
                            )}
                            {granted ? t('revoke') : t('grant')}
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
