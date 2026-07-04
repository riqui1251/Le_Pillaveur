"use client"

import { QRCodeSVG } from 'qrcode.react'

/** QR code (SVG, net sur une TV) pointant vers l'URL de join. Fond blanc obligatoire pour la lisibilité au scan. */
export function JoinQR({ url, size = 140 }: { url: string; size?: number }) {
  return (
    <div className="rounded-2xl bg-white p-2.5 shadow-xl">
      <QRCodeSVG value={url} size={size} level="M" marginSize={0} />
    </div>
  )
}
