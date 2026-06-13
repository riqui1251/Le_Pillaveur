import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth-server'
import { canAccessSupervision } from '@/lib/roles'

export default async function SupervisionLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()
  if (!user || !canAccessSupervision(user.role)) {
    redirect('/compte')
  }

  return children
}
