"use client"

import { useEffect, useState, type ComponentType } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { Moon, Sparkles, Trophy, Users, Zap } from 'lucide-react'
import { HubShell } from '@/components/hub/HubShell'
import { PlayingCardBack } from '@/components/ui/PlayingCard'
import { cn } from '@/lib/utils'

const ACHIEVEMENT_IDS = [
  'first_win',
  'perfect_game',
  'speed_demon',
  'social_butterfly',
  'night_owl',
] as const

type AchievementId = (typeof ACHIEVEMENT_IDS)[number]

const ACHIEVEMENT_ICONS: Record<AchievementId, ComponentType<{ className?: string }>> = {
  first_win: Trophy,
  perfect_game: Sparkles,
  speed_demon: Zap,
  social_butterfly: Users,
  night_owl: Moon,
}

interface Achievement {
  id: AchievementId
  title: string
  description: string
  unlockedAt: string | null
}

export default function AchievementsPage() {
  const t = useTranslations('achievements')
  const tErrors = useTranslations('errors')
  const format = useFormatter()

  const baseAchievements: Achievement[] = ACHIEVEMENT_IDS.map((id) => ({
    id,
    title: t(`items.${id}.title`),
    description: t(`items.${id}.description`),
    unlockedAt: null,
  }))

  const [userAchievements, setUserAchievements] = useState<Achievement[]>(baseAchievements)

  useEffect(() => {
    async function fetchAchievements() {
      try {
        const response = await fetch('/api/achievements')
        const data = await response.json()

        setUserAchievements(
          baseAchievements.map((achievement) => ({
            ...achievement,
            unlockedAt:
              data.find((a: { type: string; unlockedAt: string }) => a.type === achievement.id)?.unlockedAt ||
              null,
          }))
        )
      } catch (error) {
        console.error(tErrors('loadAchievements'), error)
      }
    }

    fetchAchievements()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t])

  return (
    <HubShell title={t('title')} subtitle={t('subtitle')}>
      {/* Un succès débloqué est une carte crème retournée face visible ;
          verrouillé, il reste dos de carte — on sait qu'il existe, pas plus. */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {userAchievements.map((achievement) => {
          const Icon = ACHIEVEMENT_ICONS[achievement.id]
          const unlocked = Boolean(achievement.unlockedAt)
          return (
            <div
              key={achievement.id}
              className={cn(
                'flex items-center gap-3 rounded-xl border p-3',
                unlocked
                  ? 'border-[#D8CCAE] bg-cream text-[#24201A] shadow-[0_10px_24px_-12px_rgba(0,0,0,0.6)]'
                  : 'border-gold/15 bg-felt-deep/60 text-cream/80'
              )}
            >
              {unlocked ? (
                <span className="flex h-14 w-11 shrink-0 items-center justify-center rounded-lg border border-[#24201A]/15 bg-[#24201A]/5">
                  <Icon className="h-6 w-6 text-amber-700" />
                </span>
              ) : (
                <PlayingCardBack className="h-14 w-11 shrink-0" />
              )}
              <div className="min-w-0">
                <h2 className={cn('font-display text-base font-bold', unlocked ? 'text-[#24201A]' : 'text-cream')}>
                  {achievement.title}
                </h2>
                <p className={cn('text-xs leading-snug', unlocked ? 'text-[#6B6455]' : 'text-cream/50')}>
                  {achievement.description}
                </p>
                <p className={cn('mt-1 text-[11px] font-semibold', unlocked ? 'text-amber-700' : 'text-cream/35')}>
                  {unlocked
                    ? t('unlockedOn', {
                        date: format.dateTime(new Date(achievement.unlockedAt as string), {
                          dateStyle: 'medium',
                        }),
                      })
                    : t('locked')}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </HubShell>
  )
}
