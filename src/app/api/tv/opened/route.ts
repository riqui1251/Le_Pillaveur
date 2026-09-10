import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { ANALYTICS_CONSENT_COOKIE } from '@/lib/auth-cookies'
import { todayParis } from '@/lib/analytics-server'
import { checkRateLimit, rateLimitKey } from '@/lib/rate-limit'

/**
 * Compteur d'OUVERTURES d'écran TV — le strict minimum pour savoir si le mode
 * TV, qui est le différenciateur du site, sert vraiment à quelqu'un.
 *
 * Ce qui est enregistré : un entier par journée (heure de Paris), dans la
 * table clé/valeur `SiteSetting`, sous la clé `tv.opens.AAAA-MM-JJ`. Rien
 * d'autre : ni identifiant de visiteur, ni IP, ni code de table, ni
 * horodatage fin — donc aucune donnée personnelle, et rien qui permette de
 * recouper deux ouvertures entre elles.
 *
 * Consentement : un compteur purement agrégé ne relève pas du suivi
 * individuel, mais on respecte quand même un REFUS explicite (cookie
 * d'analytics à '0'). Son absence — le cas normal sur une télé, qui n'a
 * jamais franchi le portail d'entrée — n'empêche pas de compter : il n'y a
 * rien à consentir quand rien n'est déposé ni relié à personne.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Une télé n'ouvre son écran qu'une fois : au-delà, c'est du bruit. */
const RATE_LIMIT = 10
const RATE_WINDOW_MS = 60_000

export async function POST(request: Request) {
  try {
    const limit = checkRateLimit(rateLimitKey(request, 'tv-opened'), RATE_LIMIT, RATE_WINDOW_MS)
    // On ne renvoie pas 429 : un compteur d'ambiance n'a pas à faire
    // apparaître une erreur sur un écran de salon. On ne compte simplement pas.
    if (!limit.ok) return NextResponse.json({ ok: true })

    const consent = (await cookies()).get(ANALYTICS_CONSENT_COOKIE)?.value
    if (consent === '0') return NextResponse.json({ ok: true })

    const key = `tv.opens.${todayParis()}`
    const current = await prisma.siteSetting.findUnique({ where: { key } })
    const next = (Number.parseInt(current?.value ?? '0', 10) || 0) + 1
    // Incrément lu-puis-écrit : deux télés allumées à la même seconde peuvent
    // se marcher dessus et perdre une unité. Assumé — c'est un ordre de
    // grandeur d'usage, pas une facturation, et cela évite d'ajouter une
    // table (donc une migration) pour un simple entier par jour.
    await prisma.siteSetting.upsert({
      where: { key },
      create: { key, value: '1' },
      update: { value: String(next) },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('tv opened counter error:', error)
    // Jamais bloquant : la télé doit s'afficher même si la mesure échoue.
    return NextResponse.json({ ok: true })
  }
}
