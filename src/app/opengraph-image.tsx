import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Le Pillaveur — La maison des jeux de soirée'

/**
 * Image de partage « Cartes sur Table » : wordmark encadré d'un double filet
 * or sur le feutre, cartes en éventail — même langage que le favicon.
 * (Police par défaut de next/og : pas de fetch réseau au rendu, robuste en prod.)
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'radial-gradient(120% 120% at 50% 0%, #0E3B2E, #0A2C22)',
        }}
      >
        {/* Double filet or */}
        <div
          style={{
            position: 'absolute',
            top: 28,
            left: 28,
            right: 28,
            bottom: 28,
            border: '3px solid rgba(217, 164, 65, 0.9)',
            borderRadius: 18,
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 42,
            left: 42,
            right: 42,
            bottom: 42,
            border: '1.5px solid rgba(217, 164, 65, 0.45)',
            borderRadius: 12,
            display: 'flex',
          }}
        />

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 26,
          }}
        >
          <svg width="170" height="170" viewBox="0 0 48 48" fill="none">
            <rect
              x="14.5" y="6.5" width="22" height="31" rx="3.5"
              transform="rotate(9 25.5 22)"
              fill="#0A2C22" stroke="#D9A441" strokeWidth="1.8"
            />
            <rect
              x="10" y="9" width="22" height="31" rx="3.5"
              transform="rotate(-6 21 24.5)"
              fill="#F3EAD3" stroke="#D9A441" strokeWidth="1.8"
            />
            <g transform="rotate(-6 21 24.5)">
              <path
                d="M21 15.5 c3.4 4 5.6 6.1 5.6 8.9 a3.4 3.4 0 0 1 -5 3 c.3 1.7 .9 2.9 1.8 3.9 h-4.8 c.9 -1 1.5 -2.2 1.8 -3.9 a3.4 3.4 0 0 1 -5 -3 c0 -2.8 2.2 -4.9 5.6 -8.9 z"
                fill="#B3382E"
              />
            </g>
          </svg>
          <div
            style={{
              display: 'flex',
              fontSize: 96,
              fontWeight: 800,
              letterSpacing: '0.08em',
              color: '#F3EAD3',
            }}
          >
            LE PILLAVEUR
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              fontSize: 30,
              letterSpacing: '0.28em',
              color: '#D9A441',
              textTransform: 'uppercase',
            }}
          >
            <div style={{ display: 'flex', width: 54, height: 2, background: 'rgba(217,164,65,0.6)' }} />
            La maison des jeux de soirée
            <div style={{ display: 'flex', width: 54, height: 2, background: 'rgba(217,164,65,0.6)' }} />
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
