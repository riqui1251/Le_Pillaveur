"use client"

import { useId } from 'react'
import { useTranslations } from 'next-intl'
import { BellRing } from 'lucide-react'
import { useFridayReminder } from '@/hooks/useFridayReminder'
import { cn } from '@/lib/utils'

/**
 * Page Compte : l'interrupteur du rappel « On remet ça ? » du vendredi
 * (src/lib/reminder-server.ts). Monté par AccountInfo pour un compte qui a
 * une adresse e-mail — un invité n'a nulle part où recevoir le rappel.
 *
 * Le seul autre endroit où l'accord se donne est la carte de fin de partie ;
 * ici, il se donne ET se retire. Le texte dit ce qu'on accepte (un e-mail le
 * vendredi vers 17 h, heure de Paris, au plus un par semaine) et comment
 * l'arrêter : un accord éclairé, pas une case cochée à l'aveugle. Adresse
 * pas encore prouvée : l'accord passe par un e-mail de confirmation (état
 * « en attente », interrupteur éteint — rien ne part avant le clic) ; le
 * retoucher renvoie l'e-mail, au plus une fois par jour (serveur). Envoi
 * d'e-mails non configuré sur le serveur : 'unavailable', rien n'est affiché.
 *
 * Gabarit de l'interrupteur de la fiche compte de la Supervision
 * (AccountFile) : désactivé tant que l'état réel n'est pas connu, zone
 * tactile agrandie à 44 px par un pseudo-élément.
 */
export function FridayReminderSetting() {
  const t = useTranslations('account.reminder')
  const labelId = useId()
  const hintId = useId()
  const { state, pending, failed, setReminder } = useFridayReminder({ enabled: true })

  // Envoi d'e-mails non configuré, ou compte que le serveur juge sans
  // adresse (le parent filtre déjà les invités) : rien à régler, rien à
  // promettre.
  if (state === 'unavailable') return null

  const on = state === 'on'
  const known = state === 'on' || state === 'off' || state === 'pending'

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p id={labelId} className="flex min-w-0 items-center gap-2 text-sm font-semibold text-white/80">
            <BellRing aria-hidden className="h-4 w-4 shrink-0 text-amber-300" />
            <span className="min-w-0 break-words">{t('title')}</span>
          </p>
          <p aria-live="polite" className="mt-0.5 text-xs text-white/50">
            {state === 'loading'
              ? t('loading')
              : state === 'error'
                ? t('loadError')
                : on
                  ? t('on')
                  : state === 'pending'
                    ? t('pending')
                    : t('off')}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={labelId}
          aria-describedby={hintId}
          disabled={!known || pending}
          aria-busy={pending || undefined}
          onClick={() => void setReminder(!on)}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors before:absolute before:-inset-2.5 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none",
            on ? 'border-gold/60 bg-gold/80' : 'border-white/20 bg-white/10'
          )}
        >
          <span
            aria-hidden
            className={cn(
              'inline-block h-4 w-4 rounded-full bg-cream shadow transition-transform motion-reduce:transition-none',
              on ? 'translate-x-6' : 'translate-x-1'
            )}
          />
        </button>
      </div>
      <p id={hintId} className="mt-2 text-[11px] leading-snug text-white/40">
        {t('hint')}
      </p>
      {failed && (
        <p role="alert" className="mt-1.5 text-xs text-rose-200">
          {t('saveError')}
        </p>
      )}
    </div>
  )
}
