"use client"

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface Achievement {
  id: string
  title: string
  description: string
  unlockedAt: string | null
  icon: string
}

const achievements: Achievement[] = [
  {
    id: 'first_win',
    title: 'Première Victoire',
    description: 'Gagnez votre première partie',
    unlockedAt: null,
    icon: '🏆'
  },
  {
    id: 'perfect_game',
    title: 'Sans Faute',
    description: 'Gagnez une partie sans faire d\'erreur',
    unlockedAt: null,
    icon: '✨'
  },
  {
    id: 'speed_demon',
    title: 'Vif comme l\'éclair',
    description: 'Réagissez en moins de 500ms',
    unlockedAt: null,
    icon: '⚡'
  },
  {
    id: 'social_butterfly',
    title: 'Papillon Social',
    description: 'Jouez avec 8 joueurs différents',
    unlockedAt: null,
    icon: '🦋'
  },
  {
    id: 'night_owl',
    title: 'Oiseau de Nuit',
    description: 'Jouez une partie après minuit',
    unlockedAt: null,
    icon: '🦉'
  }
]

export default function AchievementsPage() {
  const [userAchievements, setUserAchievements] = useState<Achievement[]>(achievements)

  useEffect(() => {
    async function fetchAchievements() {
      try {
        const response = await fetch('/api/achievements')
        const data = await response.json()
        
        setUserAchievements(achievements.map(achievement => ({
          ...achievement,
          unlockedAt: data.find((a: { type: string, unlockedAt: string }) => 
            a.type === achievement.id
          )?.unlockedAt || null
        })))
      } catch (error) {
        console.error('Erreur lors du chargement des succès:', error)
      }
    }

    fetchAchievements()
  }, [])

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-8">Succès</h1>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {userAchievements.map((achievement) => (
          <Card
            key={achievement.id}
            className={`transition-colors ${
              achievement.unlockedAt
                ? 'bg-primary/5'
                : 'opacity-75'
            }`}
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
                  Débloqué le {new Date(achievement.unlockedAt).toLocaleDateString()}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Non débloqué
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
} 