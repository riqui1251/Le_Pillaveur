import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { onlineErrorBody } from '@/lib/online-errors'

type Params = { params: Promise<{ inviteId: string }> }

/** L'ami invité ignore l'invitation sans rejoindre la salle. */
export async function POST(_request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
  }

  const { inviteId } = await params
  const invite = await prisma.onlineRoomInvite.findUnique({ where: { id: inviteId } })
  if (!invite) {
    return NextResponse.json(onlineErrorBody('invite_not_found'), { status: 404 })
  }
  if (invite.invitedUserId !== user.id) {
    return NextResponse.json(onlineErrorBody('forbidden'), { status: 403 })
  }

  await prisma.onlineRoomInvite.update({
    where: { id: inviteId },
    data: { status: 'declined', respondedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}
