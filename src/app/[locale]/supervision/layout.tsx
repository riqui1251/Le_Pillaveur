import { redirect } from '@/i18n/navigation'
import { getCurrentUser } from '@/lib/auth-server'
import { canAccessSupervision } from '@/lib/roles'

export default async function SupervisionLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const user = await getCurrentUser()
  if (!user || !canAccessSupervision(user.role)) {
    redirect({ href: '/compte', locale })
  }

  return children
}
