import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { apiError, readApiJson, withApiRoute } from '@/lib/api-route'

export const PUT = withApiRoute('auth/ambiance PUT', async (request: Request) => {
  const user = await getCurrentUser()
  if (!user) return apiError('auth_required', 401)

  const parsed = await readApiJson<{ mode?: unknown }>(request)
  if (!parsed.ok) return parsed.response

  const mode = parsed.body?.mode
  if (mode !== 'alcool' && mode !== 'soft') return apiError('invalid_mode', 400)

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { ambianceMode: mode },
    select: { ambianceMode: true },
  })

  return NextResponse.json({ ambianceMode: updated.ambianceMode })
})
