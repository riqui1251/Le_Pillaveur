import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Créer quelques utilisateurs
  const users = await Promise.all([
    prisma.user.create({
      data: {
        name: 'Alice',
        email: 'alice@example.com',
      },
    }),
    prisma.user.create({
      data: {
        name: 'Bob',
        email: 'bob@example.com',
      },
    }),
    prisma.user.create({
      data: {
        name: 'Charlie',
        email: 'charlie@example.com',
      },
    }),
  ])

  // Ajouter des statistiques de jeu
  const gameTypes = ['cool-heurs', 'gorgee-frenzy']
  const now = new Date()

  for (const user of users) {
    for (const gameType of gameTypes) {
      await prisma.stats.create({
        data: {
          userId: user.id,
          gameType,
          score: Math.floor(Math.random() * 100),
          playedAt: new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000),
          metadata: JSON.stringify({
            duration: Math.floor(Math.random() * 300),
            rounds: Math.floor(Math.random() * 10) + 5,
          }),
        },
      })
    }
  }

  // Ajouter des succès
  const achievementTypes = ['first_win', 'perfect_game', 'speed_demon', 'social_butterfly', 'night_owl']
  
  for (const user of users) {
    const randomAchievements = achievementTypes
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.floor(Math.random() * achievementTypes.length))

    for (const type of randomAchievements) {
      await prisma.achievement.create({
        data: {
          userId: user.id,
          type,
          unlockedAt: new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        },
      })
    }
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  }) 