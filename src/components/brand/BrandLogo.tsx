import { cn } from '@/lib/utils'

/**
 * Identité « Cartes sur Table » — logo de marque.
 *
 * - <BrandMark/>  : monogramme (carte à jouer inclinée + pique-cœur stylisé),
 *   pour les petits emplacements : header, favicon, avatar par défaut.
 * - <BrandLogo/>  : wordmark complet (cadre double filet + LE PILLAVEUR),
 *   pour les écrans d'accueil, la TV et le marketing.
 *
 * Une seule couleur par défaut (currentColor) pour rester déclinable ;
 * les accents or/rouge sont des props optionnelles.
 */

export function BrandMark({
  className,
  gold = 'var(--gold)',
  red = 'var(--suit-red)',
}: {
  className?: string
  gold?: string
  red?: string
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={cn('h-full w-full', className)}
      role="img"
      aria-label="Le Pillaveur"
      fill="none"
    >
      {/* carte arrière, inclinée */}
      <rect
        x="14.5" y="6.5" width="22" height="31" rx="3.5"
        transform="rotate(9 25.5 22)"
        fill="var(--felt-deep)" stroke={gold} strokeWidth="1.6"
      />
      {/* carte avant */}
      <rect
        x="10" y="9" width="22" height="31" rx="3.5"
        transform="rotate(-6 21 24.5)"
        fill="var(--cream)" stroke={gold} strokeWidth="1.6"
      />
      {/* pique central sur la carte avant */}
      <g transform="rotate(-6 21 24.5)">
        <path
          d="M21 15.5 c3.4 4 5.6 6.1 5.6 8.9 a3.4 3.4 0 0 1 -5 3 c.3 1.7 .9 2.9 1.8 3.9 h-4.8 c.9 -1 1.5 -2.2 1.8 -3.9 a3.4 3.4 0 0 1 -5 -3 c0 -2.8 2.2 -4.9 5.6 -8.9 z"
          fill={red}
        />
      </g>
    </svg>
  )
}

export function BrandLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 120"
      className={cn('h-auto w-full', className)}
      role="img"
      aria-label="Le Pillaveur — la maison des jeux de soirée"
      fill="none"
    >
      {/* cadre double filet */}
      <rect x="24" y="16" width="352" height="88" rx="10" stroke="var(--gold)" strokeWidth="1.6" />
      <rect x="30" y="22" width="340" height="76" rx="7" stroke="var(--gold)" strokeWidth="0.8" opacity="0.6" />
      <text
        x="200" y="60" textAnchor="middle"
        fontFamily="var(--font-display), Georgia, serif"
        fontSize="34" fontWeight="700" letterSpacing="3"
        fill="var(--cream)"
      >
        LE PILLAVEUR
      </text>
      <text
        x="200" y="84" textAnchor="middle"
        fontFamily="var(--font-display), Georgia, serif"
        fontSize="11" letterSpacing="5"
        fill="var(--gold)"
      >
        ✦ LA MAISON DES JEUX DE SOIRÉE ✦
      </text>
      {/* cœur et pique d'angle */}
      <path
        d="M60 34 c0-5 8-5 8 0 c0 4-8 9-8 9 s-8-5-8-9 c0-5 8-5 8 0z"
        fill="var(--suit-red)"
      />
      <path
        d="M340 32 c2.4 2.9 4 4.4 4 6.4 a2.4 2.4 0 0 1 -3.6 2.1 c.2 1.2 .7 2.1 1.3 2.8 h-3.4 c.6 -.7 1.1 -1.6 1.3 -2.8 a2.4 2.4 0 0 1 -3.6 -2.1 c0 -2 1.6 -3.5 4 -6.4 z"
        fill="var(--cream)"
      />
    </svg>
  )
}
