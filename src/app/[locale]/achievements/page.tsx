"use client"

import { useEffect, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const ACHIEVEMENT_IDS = [
  'first_win',
  'perfect_game',
  'speed_demon',
  'social_butterfly',
  'night_owl',
] as const

const ACHIEVEMENT_ICONS: Record<(typeof ACHIEVEMENT_IDS)[number], string> = {
  first_win: '🏆',
  perfect_game: '✨',
  speed_demon: '⚡',
  social_butterfly: '🦋',
  night_owl: '🦉',
}

type AchievementId = (typeof ACHIEVEMENT_IDS)[number]

interface Achievement {
  id: AchievementId
  title: string
  description: string
  unlockedAt: string | null
  icon: string
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
    icon: ACHIEVEMENT_ICONS[id],
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
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-8">{t('title')}</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {userAchievements.map((achievement) => (
          <Card
            key={achievement.id}
            className={`transition-colors ${achievement.unlockedAt ? 'bg-primary/5' : 'opacity-75'}`}
          >
            <CardHeader>
              <div className="flex items-center space-x-4">
                <span className="text-4xl">{achievement.icon}</span>
                <div>
                  <CardTitle>{achievement.title}</CardTitle>
                  <CardDescription>{achievement.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {achievement.unlockedAt ? (
                <p className="text-sm text-muted-foreground">
                  {t('unlockedOn', {
                    date: format.dateTime(new Date(achievement.unlockedAt), {
                      dateStyle: 'medium',
                    }),
                  })}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">{t('locked')}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
