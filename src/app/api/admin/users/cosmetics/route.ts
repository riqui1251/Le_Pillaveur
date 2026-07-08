import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { normalizeRole } from '@/lib/roles'
import { cosmeticKey, findCosmetic, type CosmeticKind } from '@/lib/online/cosmetics'
import { buildProgression } from '@/lib/online/progression-server'
import { prisma } from '@/lib/prisma'

/**
 * Déblocage MANUEL de cosmétiques sur un compte joueur — fondateur uniquement.
 *
 * GET  ?userId=…                    → progression du compte cible (grants inclus)
 * POST { userId, kind, id, action } → 'grant' | 'revoke'
 */

async function requireFondateur() {
  const user = await getCurrentUser()
  if (!user || normalizeRole(user.role) !== 'fondateur') return null
  return user
}

export async function GET(request: Request) {
  const actor = await requireFondateur()
  if (!actor) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const userId = new URL(request.url).searchParams.get('userId') ?? ''
  if (!userId) return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 })

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, onlineXp: true },
  })
  if (!target) return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })

  const progression = await buildProgression(target)
  return NextResponse.json({ progression })
}

export async function POST(request: Request) {
  const actor = await requireFondateur()
  if (!actor) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const userId = typeof body.userId === 'string' ? body.userId : ''
  const kind =
    body.kind === 'frame' ? 'frame' : body.kind === 'effect' ? 'effect' : body.kind === 'icon' ? 'icon' : null
  const id = typeof body.id === 'string' ? body.id : ''
  const action = body.action === 'revoke' ? 'revoke' : 'grant'

  if (!userId || !kind || !id || !findCosmetic(kind as CosmeticKind, id)) {
    return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 })
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, onlineXp: true },
  })
  if (!target) return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })

  const key = cosmeticKey(kind as CosmeticKind, id)
  if (action === 'revoke') {
    await prisma.cosmeticGrant.deleteMany({ where: { userId, cosmeticKey: key } })
  } else {
    await prisma.cosmeticGrant.upsert({
      where: { userId_cosmeticKey: { userId, cosmeticKey: key } },
      update: {},
      create: { userId, cosmeticKey: key, grantedById: actor.id },
    })
  }

  const progression = await buildProgression(target)
  return NextResponse.json({ ok: true, progression })
}
