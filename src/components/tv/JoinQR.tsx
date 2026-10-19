"use client"

import { QRCodeSVG } from 'qrcode.react'
import { cn } from '@/lib/utils'
import { tvRem } from './tv-shared'

/** QR code (SVG, net sur une TV) pointant vers l'URL de join. Fond blanc obligatoire pour la lisibilité au scan. `size` en px de la toile de référence. */
export function JoinQR({ url, size = 140, className }: { url: string; size?: number; className?: string }) {
  return (
    <div className={cn('rounded-2xl bg-white p-2.5 shadow-xl', className)}>
      <QRCodeSVG
        value={url}
        size={size}
        level="M"
        marginSize={0}
        style={{ display: 'block', width: tvRem(size), height: tvRem(size) }}
      />
    </div>
  )
}
