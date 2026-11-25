"use client"

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Copy, Hash } from 'lucide-react'
import { copyText } from '@/lib/native-share'
import { cn } from '@/lib/utils'

/** Code compte (LP-XXXXXX) à donner à un ami, copié d'un toucher : encre sur crème, pour la carte du compte. */
export function AccountCodeButton({ code, className }: { code: string; className?: string }) {
  const t = useTranslations('account')
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    // copyText tente aussi l'ancienne copie quand le presse-papiers asynchrone
    // est refusé (WebView de l'app). En cas d'échec, le code reste lisible
    // sur le bouton même : pas de coche, rien de plus à dire.
    if (!(await copyText(code))) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border border-[#24201A]/[0.15] bg-[#24201A]/5 px-2.5 py-1 font-mono text-xs text-[#4A443A] transition-colors hover:bg-[#24201A]/10',
        className
      )}
      title={t('copyAccountCode')}
    >
      <Hash className="h-3 w-3" />
      {code}
      {copied ? <Check className="h-3 w-3 text-emerald-700" /> : <Copy className="h-3 w-3 opacity-60" />}
    </button>
  )
}
