import { notFound } from 'next/navigation'
import { PREVIEW_GAMES } from './fixtures'
import type { TvPreviewFixture } from './fixture-kit'
import { TvPreviewClient } from './TvPreviewClient'
import { TvPreviewSuite } from './TvPreviewSuite'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function buildSafely(build: () => TvPreviewFixture[]): { fixtures: TvPreviewFixture[]; error: string | null } {
  try {
    return { fixtures: build(), error: null }
  } catch (e) {
    return { fixtures: [], error: e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e) }
  }
}

/**
 * Aperçu des écrans TV sur des états figés (développement seulement) :
 * `?f=<jeu>:<fixture>&s=<étape>&clean=1`. Sans `f`, la liste des fixtures.
 */
export default async function TvPreviewPage({ searchParams }: { searchParams: SearchParams }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const sp = await searchParams
  const f = typeof sp.f === 'string' ? sp.f : null
  const step = Number(typeof sp.s === 'string' ? sp.s : 0) || 0
  const chrome = sp.clean !== '1'
  const suite = typeof sp.suite === 'string' ? sp.suite : null

  if (suite) {
    const entry = PREVIEW_GAMES.find((g) => g.game === suite)
    if (!entry) notFound()
    const { fixtures, error } = buildSafely(entry.build)
    if (error) return <pre className="fixed inset-0 overflow-auto bg-black p-6 text-sm text-red-300">{error}</pre>
    return <TvPreviewSuite fixtures={fixtures} />
  }

  if (f) {
    const sep = f.indexOf(':')
    const game = sep === -1 ? f : f.slice(0, sep)
    const id = sep === -1 ? null : f.slice(sep + 1)
    const entry = PREVIEW_GAMES.find((g) => g.game === game)
    if (!entry) notFound()
    const { fixtures, error } = buildSafely(entry.build)
    const fixture = fixtures.find((x) => x.id === id) ?? (id ? null : fixtures[0])
    if (error || !fixture) {
      return (
        <pre className="fixed inset-0 overflow-auto bg-black p-6 text-sm text-red-300">
          {error ?? `Fixture introuvable : ${f}\nDisponibles : ${fixtures.map((x) => x.id).join(', ')}`}
        </pre>
      )
    }
    return <TvPreviewClient key={`${game}:${fixture.id}`} fixture={fixture} initialStep={step} chrome={chrome} />
  }

  return (
    <div className="fixed inset-0 overflow-auto bg-[#0a0812] p-6 text-white">
      <h1 className="mb-4 text-2xl font-black">Aperçu TV</h1>
      <div className="grid grid-cols-3 gap-4">
        {PREVIEW_GAMES.map(({ game, build }) => {
          const { fixtures, error } = buildSafely(build)
          return (
            <div key={game} className="rounded-lg border border-white/15 p-3">
              <p className="font-bold">{game}</p>
              {error && <p className="text-sm text-red-300">{error.split('\n')[0]}</p>}
              <ul className="mt-1 text-sm">
                {fixtures.map((x) => (
                  <li key={x.id}>
                    <a className="text-sky-300 underline" href={`?f=${encodeURIComponent(`${game}:${x.id}`)}`}>
                      {x.id}
                    </a>{' '}
                    <span className="text-white/60">
                      {x.label} ({x.steps.length})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}
