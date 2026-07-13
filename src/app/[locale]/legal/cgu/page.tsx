import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal/LegalPage'

export const metadata: Metadata = {
  title: 'CGU',
  description: 'Conditions Générales d\'Utilisation du service Le Pillaveur.',
}

export default function CguPage() {
  return <LegalPage docId="cgu" />
}
