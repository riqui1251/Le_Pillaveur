"use client"

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { usePlayers } from '@/hooks/usePlayers'
import { cn } from '@/lib/utils'
import { getSelectedPlayerIds } from '@/lib/selectedPlayers'
import { validateLocalPlayerName } from '@/lib/name-moderation'
import { PLAYER_NAME_MAX_LENGTH } from '@/lib/players'
import { readBandes, type SoireeBande } from '@/lib/soiree/storage'
import { SoireeCta, StepHeader } from './soiree-ui'

const MIN_PLAYERS = 2
const MAX_PLAYERS = 12

type Row = { key: string; name: string }

let rowSeq = 0
const newRow = (): Row => ({ key: `r${++rowSeq}`, name: '' })

export type BandeChoice = { players: { id: string; name: string }[]; bande: SoireeBande | null }

/**
 * Qui joue ce soir : on COCHE les joueurs locaux déjà enregistrés sur le
 * téléphone (src/lib/players.ts, ceux de la page Joueurs) — on ne retape
 * pas leurs prénoms. Un nouveau prénom crée le joueur tout de suite, avec le
 * même filtre que la page Joueurs. Sans aucun joueur enregistré, des cases
 * de prénoms (autant que demandé à l'accueil) servent à créer la bande.
 */
export function BandeStep({ initialCount, initialBandeId, onDone }: { initialCount: number; initialBandeId: string | null; onDone: (choice: BandeChoice) => void }) {
  const t = useTranslations('soiree.bande')
  const { players, loading, addPlayers } = usePlayers()
  const [selected, setSelected] = useState<string[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [draft, setDraft] = useState('')
  const [bandes, setBandes] = useState<SoireeBande[]>([])
  const [bandeId, setBandeId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const prefilled = useRef(false)

  // Une fois les joueurs lus : la bande demandée, sinon la dernière sélection de l'appareil.
  useEffect(() => {
    if (loading || prefilled.current) return
    prefilled.current = true
    const known = readBandes()
    setBandes(known)
    const existing = new Set(players.map((p) => p.id))
    const bande = initialBandeId ? known.find((b) => b.id === initialBandeId) : undefined
    const ids = (bande ? bande.playerIds : getSelectedPlayerIds()).filter((id) => existing.has(id)).slice(0, MAX_PLAYERS)
    setSelected(ids)
    if (bande && ids.length > 0) setBandeId(bande.id)
    if (players.length === 0) setRows(Array.from({ length: initialCount }, newRow))
  }, [loading, players, initialBandeId, initialCount])

  const fail = (message: string) => setError(message)
  const nameTaken = (name: string) => players.find((p) => p.name.toLocaleLowerCase() === name.toLocaleLowerCase())

  const toggle = (id: string) => {
    setError(null)
    setBandeId(null)
    setSelected((all) => (all.includes(id) ? all.filter((x) => x !== id) : all.length >= MAX_PLAYERS ? all : [...all, id]))
  }

  const loadBande = (bande: SoireeBande) => {
    const existing = new Set(players.map((p) => p.id))
    const ids = bande.playerIds.filter((id) => existing.has(id))
    if (ids.length === 0) return
    setSelected(ids)
    setBandeId(bande.id)
    setError(null)
  }

  /** Crée le joueur tapé (ou coche celui qui porte déjà ce prénom). */
  const addDraft = () => {
    const name = draft.trim()
    if (!name) return
    setError(null)
    const known = nameTaken(name)
    if (known) {
      if (!selected.includes(known.id)) toggle(known.id)
      setDraft('')
      return
    }
    if (!validateLocalPlayerName(name, PLAYER_NAME_MAX_LENGTH).ok) return fail(t('errors.refused', { name }))
    if (selected.length >= MAX_PLAYERS) return
    const { created } = addPlayers([name])
    if (!created[0]) return fail(t('errors.refused', { name }))
    setSelected((all) => [...all, created[0].id])
    setBandeId(null)
    setDraft('')
  }

  const submit = () => {
    // Cases de prénoms (aucun joueur enregistré) : on crée ceux qui sont remplis.
    const typed = rows.map((r) => r.name.trim()).filter(Boolean)
    const seen = new Set<string>()
    for (const name of typed) {
      const key = name.toLocaleLowerCase()
      if (seen.has(key)) return fail(t('errors.duplicate', { name }))
      seen.add(key)
    }
    const toCreate = typed.filter((name) => !nameTaken(name))
    const refused = toCreate.find((name) => !validateLocalPlayerName(name, PLAYER_NAME_MAX_LENGTH).ok)
    if (refused) return fail(t('errors.refused', { name: refused }))
    const { created } = toCreate.length ? addPlayers(toCreate) : { created: [] }
    const typedIds = typed.map((name) => (nameTaken(name) ?? created.find((p) => p.name.toLocaleLowerCase() === name.toLocaleLowerCase()))?.id)
    if (typedIds.some((id) => !id)) return fail(t('errors.refused', { name: toCreate[0] ?? '' }))
    const ids = Array.from(new Set([...selected, ...(typedIds as string[])])).slice(0, MAX_PLAYERS)
    if (ids.length < MIN_PLAYERS) return fail(t('errors.tooFew', { min: MIN_PLAYERS }))
    const all = [...players, ...created]
    onDone({
      players: ids.map((id) => ({ id, name: all.find((p) => p.id === id)?.name ?? '?' })),
      bande: bandeId ? bandes.find((b) => b.id === bandeId) ?? null : null,
    })
  }

  const count = selected.length + rows.filter((r) => r.name.trim()).length

  return (
    <>
      <StepHeader eyebrow={t('eyebrow')} title={t('title')} lead={players.length > 0 ? t('leadKnown') : t('lead')} />

      {bandes.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-cream/60">{t('bandes')}</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {bandes.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => loadBande(b)}
                aria-pressed={bandeId === b.id}
                className="shrink-0 rounded-full border border-gold/25 bg-felt-deep/50 px-3.5 py-2 text-sm font-bold text-cream transition aria-pressed:border-gold aria-pressed:bg-gold/20 hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {players.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-cream/60">{t('known')}</p>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label={t('listLabel')}>
            {players.map((p) => {
              const on = selected.includes(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(p.id)}
                  className={cn(
                    'flex min-w-0 items-center gap-2 rounded-2xl border px-2.5 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
                    on ? 'border-gold bg-gold/20' : 'border-gold/20 bg-felt-deep/50 hover:bg-gold/10'
                  )}
                >
                  <PlayerIcon player={p} size="sm" />
                  <span className="min-w-0 flex-1 truncate font-semibold text-cream">{p.name}</span>
                  <span aria-hidden className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-full border', on ? 'border-gold bg-amber-500 text-[#24201A]' : 'border-cream/30')}>
                    {on && <Check className="h-3.5 w-3.5" />}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <ol className="space-y-2" aria-label={t('listLabel')}>
          {rows.map((row, i) => (
            <li key={row.key} className="flex items-center gap-2 rounded-2xl border border-gold/20 bg-felt-deep/50 py-1.5 pl-2.5 pr-1.5 focus-within:border-gold">
              <PlayerIcon player={{ name: row.name || String(i + 1) }} size="md" />
              <label className="sr-only" htmlFor={`soiree-player-${row.key}`}>
                {t('nameLabel', { number: i + 1 })}
              </label>
              <input
                id={`soiree-player-${row.key}`}
                value={row.name}
                onChange={(e) => {
                  setError(null)
                  const name = e.target.value
                  setRows((all) => all.map((r) => (r.key === row.key ? { ...r, name } : r)))
                }}
                placeholder={t('placeholder', { number: i + 1 })}
                maxLength={PLAYER_NAME_MAX_LENGTH}
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent py-2 text-base font-semibold text-cream placeholder:text-cream/40 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setRows((all) => (all.length > 1 ? all.filter((r) => r.key !== row.key) : all))}
                aria-label={t('remove', { number: i + 1 })}
                className="grid h-10 w-10 place-items-center rounded-xl text-cream/50 transition hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                <X aria-hidden className="h-5 w-5" />
              </button>
            </li>
          ))}
        </ol>
      )}

      {players.length > 0 && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            addDraft()
          }}
        >
          <label className="sr-only" htmlFor="soiree-new-player">{t('newLabel')}</label>
          <input
            id="soiree-new-player"
            value={draft}
            onChange={(e) => {
              setError(null)
              setDraft(e.target.value)
            }}
            placeholder={t('newPlaceholder')}
            maxLength={PLAYER_NAME_MAX_LENGTH}
            autoComplete="off"
            enterKeyHint="done"
            className="min-w-0 flex-1 rounded-2xl border border-gold/20 bg-felt-deep/50 px-3.5 py-3 text-base font-semibold text-cream placeholder:text-cream/40 focus:border-gold focus:outline-none"
          />
          <Button type="submit" variant="quiet" size="game" disabled={!draft.trim() || selected.length >= MAX_PLAYERS}>
            <Plus aria-hidden className="mr-1 h-4 w-4" />
            {t('add')}
          </Button>
        </form>
      )}

      {rows.length > 0 && rows.length < MAX_PLAYERS && (
        <Button variant="quiet" size="game" className="self-start" onClick={() => setRows((all) => [...all, newRow()])}>
          <Plus aria-hidden className="mr-1.5 h-4 w-4" />
          {t('add')}
        </Button>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-suit-red/50 bg-suit-red/20 px-3 py-2 text-sm font-semibold text-red-200">
          {error}
        </p>
      )}

      <SoireeCta>
        <Button variant="primary" size="gameLg" className="w-full" onClick={submit} disabled={loading || count < MIN_PLAYERS}>
          {count < MIN_PLAYERS ? t('pickMore', { min: MIN_PLAYERS }) : t('continue', { count })}
        </Button>
      </SoireeCta>
    </>
  )
}
