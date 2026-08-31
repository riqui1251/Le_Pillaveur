import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'

/** Succès du compte CONNECTÉ uniquement. */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json([], { status: 200 })
  }

  try {
    const achievements = await prisma.achievement.findMany({
      where: { userId: user.id },
      orderBy: { unlockedAt: 'desc' },
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
