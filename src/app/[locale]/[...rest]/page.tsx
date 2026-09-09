import { notFound } from 'next/navigation'

/**
 * Attrape-tout des URL inconnues SOUS une langue valide (/fr/nimportequoi).
 * Sans lui, Next sert le `not-found` RACINE — sans langue, sans navigation et
 * hors identité visuelle : la 404 localisée de `[locale]/not-found.tsx` ne
 * serait jamais rendue. Cette page ne fait donc que lever notFound().
 */
export default function CatchAllNotFound() {
  notFound()
}
