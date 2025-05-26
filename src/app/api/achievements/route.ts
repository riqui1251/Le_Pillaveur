import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // Pour l'instant, nous retournons les succès d'un utilisateur fictif
    // Dans une vraie application, nous utiliserions l'authentification pour identifier l'utilisateur
    const achievements = await prisma.achievement.findMany({
      orderBy: {
        unlockedAt: 'desc'
      }
    })

    return NextResponse.json(achievements)
  } catch (error) {
    console.error('Erreur lors de la récupération des succès:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des succès' },
      { status: 500 }
    )
  }
} 