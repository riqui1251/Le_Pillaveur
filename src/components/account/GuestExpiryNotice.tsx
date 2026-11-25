"use client"

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Calendar } from 'lucide-react'
import { GUEST_INACTIVITY_DAYS, ORPHAN_GUEST_INACTIVITY_DAYS } from './guest-retention'

/**
 * Avertissement AVANT la perte : un invité découvrait le vide (pseudo libre,
 * niveau 1, succès effacés) en revenant le samedi suivant. On annonce donc ce
 * qui part, quand, et ce qui le rend inaccessible sur-le-champ (déconnexion,
 * cookies effacés) — sans dramatiser : la carte de pérennisation
 * (GuestUpgradeCard), posée juste après, règle le problème en un clic.
 * L'appelant ne la monte que pour un invité.
 */
export function GuestExpiryNotice() {
  const t = useTranslations('account')
  const locale = useLocale()

  // Échéance d'un compte invité : la purge compte à partir de la DERNIÈRE
  // activité, et le joueur est justement en train d'en avoir une — la date
  // affichée est donc « aujourd'hui + délai », et elle recule à chaque visite
  // depuis ce navigateur (sa session, seule clé du compte, glisse avec elle).
  // C'est la date la plus PROCHE possible : la session d'invité dure un jour
  // de plus que ce délai (GUEST_SESSION_DAYS, auth-server), donc elle
  // n'expire — et le compte ne part — jamais avant.
  // Calculée après montage : Date.now() diffère entre serveur et client.
  const [deadline, setDeadline] = useState<string | null>(null)
  useEffect(() => {
    const at = new Date(Date.now() + GUEST_INACTIVITY_DAYS * 24 * 60 * 60 * 1000)
    setDeadline(new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(at))
  }, [locale])

  return (
    <div className="flex gap-3 rounded-2xl border border-gold/20 bg-felt-deep/50 px-4 py-3 text-sm text-white/70">
      <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
      <div className="min-w-0 flex-1">
        <p>{t('guestExpiry.rule', { days: GUEST_INACTIVITY_DAYS })}</p>
        <p className="mt-1">{t('guestExpiry.loss', { days: ORPHAN_GUEST_INACTIVITY_DAYS })}</p>
        {deadline && <p className="mt-1 text-white/50">{t('guestExpiry.deadline', { date: deadline })}</p>}
      </div>
    </div>
  )
}
