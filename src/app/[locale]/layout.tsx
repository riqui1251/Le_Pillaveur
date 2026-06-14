import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { notFound } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server'
import '../globals.css'
import '../fullscreen.css'
import '../../styles/player-effects.css'
import { Providers } from '../providers'
import Navbar from '@/components/layout/Navbar'
import { LocaleSync } from '@/components/layout/LocaleSync'
import { FullscreenLayoutProvider } from '@/components/providers/FullscreenLayoutProvider'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { routing } from '@/i18n/routing'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f5f4' },
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'metadata' })

  return {
    title: t('title'),
    description: t('description'),
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: t('title'),
    },
    manifest: '/manifest.json',
    applicationName: t('title'),
    formatDetection: {
      telephone: false,
    },
  }
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound()
  }

  setRequestLocale(locale)
  const messages = await getMessages()

  return (
    <html lang={locale} suppressHydrationWarning>
      <head />
      <body className={`${inter.className} antialiased`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ErrorBoundary>
            <Providers>
              <FullscreenLayoutProvider>
                <div className="relative flex min-h-screen flex-col bg-[#07060b] fullscreen-container">
                  <Navbar />
                  <LocaleSync />
                  <div className="content-container flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
                    {children}
                  </div>
                </div>
              </FullscreenLayoutProvider>
            </Providers>
          </ErrorBoundary>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
