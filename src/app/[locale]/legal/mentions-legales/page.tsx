import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal/LegalPage'

export const metadata: Metadata = {
  title: 'Mentions légales',
  description: 'Mentions légales du site Le Pillaveur.',
}

export default function MentionsLegalesPage() {
  return <LegalPage docId="mentions-legales" />
}
