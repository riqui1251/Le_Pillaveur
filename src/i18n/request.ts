import { getRequestConfig } from 'next-intl/server'
import { routing } from './routing'
import fr from '../../messages/fr.json'
import en from '../../messages/en.json'
import es from '../../messages/es.json'
import it from '../../messages/it.json'

const messagesByLocale = {
  fr,
  en,
  es,
  it,
} as const

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale

  if (!locale || !routing.locales.includes(locale as (typeof routing.locales)[number])) {
    locale = routing.defaultLocale
  }

  return {
    locale,
    messages: messagesByLocale[locale as keyof typeof messagesByLocale],
  }
})
