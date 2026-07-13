import { redirect } from '@/i18n/navigation'

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  // Atterrissage sur le hub public des jeux : la racine du domaine doit mener
  // à une page indexable par les moteurs (le compte est noindex), et c'est la
  // meilleure vitrine pour un nouveau visiteur.
  redirect({ href: '/jeux', locale })
}
