import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { loadLegalDoc, type LegalDocId } from '@/lib/legal/load-legal-doc'
import { renderMarkdown } from '@/lib/legal/render-markdown'

const TITLES: Record<LegalDocId, string> = {
  cgu: 'Conditions Générales d\'Utilisation',
  confidentialite: 'Politique de confidentialité',
  'mentions-legales': 'Mentions légales',
}

interface LegalPageProps {
  docId: LegalDocId
}

export function LegalPage({ docId }: LegalPageProps) {
  const content = loadLegalDoc(docId)

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-8 pb-24 sm:px-6">
      <Link
        href="/compte"
        className="mb-6 inline-flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-white/80"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour
      </Link>

      <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-10">
        {renderMarkdown(content)}
      </article>

      <nav className="mt-6 flex flex-wrap gap-4 text-sm text-white/40">
        {docId !== 'cgu' && (
          <Link href="/legal/cgu" className="hover:text-amber-400">CGU</Link>
        )}
        {docId !== 'confidentialite' && (
          <Link href="/legal/confidentialite" className="hover:text-amber-400">Confidentialité</Link>
        )}
        {docId !== 'mentions-legales' && (
          <Link href="/legal/mentions-legales" className="hover:text-amber-400">Mentions légales</Link>
        )}
      </nav>

      <p className="sr-only">{TITLES[docId]}</p>
    </div>
  )
}
