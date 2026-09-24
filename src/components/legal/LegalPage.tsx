import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { ArrowLeft } from 'lucide-react'
import { loadLegalDoc, type LegalDocId } from '@/lib/legal/load-legal-doc'
import { renderMarkdown } from '@/lib/legal/render-markdown'

const DOC_TITLE_KEYS: Record<LegalDocId, 'cgu' | 'confidentialite' | 'mentionsLegales'> = {
  cgu: 'cgu',
  confidentialite: 'confidentialite',
  'mentions-legales': 'mentionsLegales',
}

interface LegalPageProps {
  docId: LegalDocId
  /**
   * Langue du segment, reçue de la page (ses `params`). Elle était devinée
   * avec getLocale(), qui lit les en-têtes de la requête quand aucune page
   * n'a posé setRequestLocale : ça suffisait à rendre les trois pages légales
   * dynamiques — markdown relu à chaque visite. Explicite, elle permet le
   * rendu au build.
   */
  locale: string
}

export async function LegalPage({ docId, locale }: LegalPageProps) {
  const t = await getTranslations({ locale, namespace: 'legal.pages' })
  const tNav = await getTranslations({ locale, namespace: 'nav.legal' })
  const content = loadLegalDoc(docId, locale)
  const titleKey = DOC_TITLE_KEYS[docId]

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-8 pb-24 sm:px-6">
      {/* Retour vers la vitrine, pas vers /compte : un visiteur arrivé d'un
          moteur n'a pas de compte, et la page est noindex — lien mort pour
          lui, et un maillage interne qui pointait sur une page interdite. */}
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-white/80"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('back')}
      </Link>

      <article className="rounded-2xl border border-gold/10 bg-felt-deep/60 p-6 sm:p-10">
        {renderMarkdown(content)}
      </article>

      <nav className="mt-6 flex flex-wrap gap-4 text-sm text-white/40">
        {docId !== 'cgu' && (
          <Link href="/legal/cgu" className="hover:text-amber-400">
            {tNav('cgu')}
          </Link>
        )}
        {docId !== 'confidentialite' && (
          <Link href="/legal/confidentialite" className="hover:text-amber-400">
            {tNav('confidentialite')}
          </Link>
        )}
        {docId !== 'mentions-legales' && (
          <Link href="/legal/mentions-legales" className="hover:text-amber-400">
            {tNav('mentionsLegales')}
          </Link>
        )}
      </nav>

      <p className="sr-only">{t(titleKey)}</p>
    </div>
  )
}
