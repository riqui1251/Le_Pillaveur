import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getMessages, getTranslations } from 'next-intl/server'
import { isAppLocale } from '@/lib/locale-utils'
import { soireeSlice } from '@/i18n/messages-slices'
import { ClientMessages } from '@/components/i18n/ClientMessages'

/**
 * Le Mode Soirée (jeux locaux) : des écrans d'application qui vivent sur
 * l'appareil — l'accueil en est la porte indexée, pas ces pages.
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isAppLocale(locale)) notFound()
  const t = await getTranslations({ locale, namespace: 'soiree.meta' })
  return { title: t('title'), description: t('description'), robots: { index: false, follow: true } }
}

export default async function SoireeLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params
  return <ClientMessages messages={soireeSlice(await getMessages({ locale }))}>{children}</ClientMessages>
}
