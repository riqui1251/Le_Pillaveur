// Pas de `export const dynamic` ici : posé sur le layout RACINE, il s'applique
// à tout le site et plus aucune page n'est rendue au build — règles SEO,
// mentions légales et vitrine étaient recalculées à chaque visite, Googlebot
// compris. Une page qui lit cookies() ou headers() devient dynamique toute
// seule ; une page qui doit l'être sans raison visible le déclare ELLE-MÊME.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
