import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

/** Icône iOS « Cartes sur Table » — même monogramme que le favicon, en grand. */
export default function AppleIcon() {
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
        <svg width="140" height="140" viewBox="0 0 48 48" fill="none">
          <rect
            x="14.5" y="6.5" width="22" height="31" rx="3.5"
            transform="rotate(9 25.5 22)"
            fill="#0A2C22" stroke="#D9A441" strokeWidth="1.6"
          />
          <rect
            x="10" y="9" width="22" height="31" rx="3.5"
            transform="rotate(-6 21 24.5)"
            fill="#F3EAD3" stroke="#D9A441" strokeWidth="1.6"
          />
          <g transform="rotate(-6 21 24.5)">
            <path
              d="M21 15.5 c3.4 4 5.6 6.1 5.6 8.9 a3.4 3.4 0 0 1 -5 3 c.3 1.7 .9 2.9 1.8 3.9 h-4.8 c.9 -1 1.5 -2.2 1.8 -3.9 a3.4 3.4 0 0 1 -5 -3 c0 -2.8 2.2 -4.9 5.6 -8.9 z"
              fill="#B3382E"
            />
          </g>
        </svg>
      </div>
    ),
    { ...size }
  )
}
