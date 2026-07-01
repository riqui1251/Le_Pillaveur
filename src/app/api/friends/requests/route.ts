import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { isUserCurrentlyBanned } from '@/lib/ban-server'
import { formatAccountCode } from '@/lib/account-code'
import { listPendingRequests, sendFriendRequest } from '@/lib/friends'

/** Demandes d'amis reçues et envoyées, en attente. */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  }

  const requests = await listPendingRequests(user.id)
  return NextResponse.json(requests)
}

/**
 * Envoie une demande d'ami — soit à partir d'un code de compte (LP-XXXXXX),
 * soit directement par userId (ex. depuis la liste des joueurs d'un lobby,
 * où l'identité du joueur est déjà connue sans avoir besoin de son code).
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  }

  const body = await request.json()
  const directUserId = typeof body.userId === 'string' ? body.userId.trim() : ''

  let target
  if (directUserId) {
    target = await prisma.user.findUnique({ where: { id: directUserId } })
    if (!target) {
      return NextResponse.json({ error: 'Joueur introuvable' }, { status: 404 })
    }
  } else {
    const raw = typeof body.accountCode === 'string' ? body.accountCode : ''
    const accountCode = formatAccountCode(raw)
    if (!accountCode) {
      return NextResponse.json({ error: 'Code invalide' }, { status: 400 })
    }
    target = await prisma.user.findUnique({ where: { accountCode } })
    if (!target) {
      return NextResponse.json({ error: 'Aucun compte avec ce code' }, { status: 404 })
    }
  }

  if (target.id === user.id) {
    return NextResponse.json({ error: "Impossible de s'ajouter soi-même" }, { status: 400 })
  }
  if (await isUserCurrentlyBanned(target.id)) {
    return NextResponse.json({ error: 'Ce joueur ne peut pas être ajouté' }, { status: 403 })
  }

  const result = await sendFriendRequest(user.id, target.id)
  return NextResponse.json({ status: result.status, friendship: result.friendship })
}
