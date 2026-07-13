import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal/LegalPage'

export const metadata: Metadata = {
  title: 'Confidentialité',
  description: 'Politique de confidentialité du service Le Pillaveur.',
}

export default function ConfidentialitePage() {
  return <LegalPage docId="confidentialite" />
}
