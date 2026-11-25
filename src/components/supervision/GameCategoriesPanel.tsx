'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { AlertTriangle, Check, ChevronDown, ChevronUp, Loader2, Pencil, Plus, RefreshCw, Tags, Trash2 } from 'lucide-react'
import { GameIconById } from '@/components/hub/GameIconById'
import { useGameTitle } from '@/components/supervision/GameCatalogPanel'
import { ErrorState, SectionCard, SkeletonRows } from '@/components/supervision/SupervisionLayout'
import {
  EMPTY_NAME_INPUTS,
  canAddCategory,
  filterGameIds,
  nameInputsOf,
  namesFromInputs,
  parseAdminGameCategories,
  type CategoryNameInputs,
} from '@/components/supervision/game-categories-panel'
import type { AdminGameCategoriesResponse } from '@/app/api/admin/game-categories/route'
import { refreshGameCatalog } from '@/hooks/useGameCatalog'
import { GAME_CATEGORY_LIMITS, STAFF_TOGGLEABLE_GAME_IDS, categoryName, type GameCategory } from '@/lib/game-catalog'
import { cn } from '@/lib/utils'

/**
 * « Catégories de jeux » : les rubriques que l'équipe crée pour ranger les
 * jeux, proposées en filtres par la page Jeux (GET/POST/PATCH/DELETE
 * /api/admin/game-categories). Un super admin crée, renomme, déplace et
 * supprime une catégorie, et ajoute ou retire UN jeu à la fois, un geste = un
 * enregistrement.
 *
 * Panneau AUTONOME comme le catalogue : chargé à l'ouverture, rechargé à la
 * main. Après chaque écriture, la réponse du serveur REMPLACE la liste (jamais
 * d'état local deviné) et le catalogue de cet appareil est redemandé pour que
 * le hub suive tout de suite.
 *
 * Les écritures partent EN FILE, une à la fois et dans l'ordre : des clics
 * rapprochés ne se perdent pas, et les réponses arrivent dans l'ordre où elles
 * ont été prises, donc la dernière est la plus fraîche. Chaque geste a une clé ;
 * un second clic sur la même clé pendant son envoi est ignoré (le bouton montre
 * déjà son état occupé), tout le reste du panneau reste utilisable.
 */

type SendBody = Record<string, unknown>
type Send = (
  method: 'POST' | 'PATCH' | 'DELETE',
  body: SendBody,
  key: string,
  announce: (saved: AdminGameCategoriesResponse) => string
) => Promise<boolean>

type FailureKey = 'saveError' | 'forbidden' | 'notFound' | 'limitReached'

type Job = {
  method: 'POST' | 'PATCH' | 'DELETE'
  body: SendBody
  key: string
  announce: (saved: AdminGameCategoriesResponse) => string
  resolve: (ok: boolean) => void
}

const gameKey = (categoryId: string, gameId: string) => `${categoryId}:game:${gameId}`
const moveKey = (categoryId: string, direction: 'up' | 'down') => `${categoryId}:move:${direction}`
const renameKey = (categoryId: string) => `${categoryId}:rename`
const deleteKey = (categoryId: string) => `${categoryId}:delete`
const CREATE_KEY = 'new'

const NAME_LOCALES = ['fr', 'en', 'es', 'it'] as const
const OTHER_NAME_KEYS = { en: 'nameEn', es: 'nameEs', it: 'nameIt' } as const

const BUTTON =
  'inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-3 text-xs font-medium text-cream/80 transition-colors hover:bg-white/10 hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 disabled:cursor-not-allowed disabled:opacity-40 sm:h-8 sm:px-2.5'
const ICON_BUTTON = `${BUTTON} !px-0 w-11 sm:w-8`
const PRIMARY_BUTTON =
  'inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-gold/50 bg-gold/[0.15] px-4 text-xs font-semibold text-cream transition-colors hover:bg-gold/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 sm:h-9'
const INPUT =
  'h-11 w-full rounded-lg border border-white/20 bg-black/30 px-3 text-base text-cream placeholder:text-cream/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 aria-disabled:opacity-60 sm:h-9 sm:text-sm'

/** Nom français obligatoire, autres langues dans un dépliant : mêmes champs pour créer et renommer. */
function NameFields({
  inputs,
  onChange,
  locked,
  autoFocus,
}: {
  inputs: CategoryNameInputs
  onChange: (next: CategoryNameInputs) => void
  locked: boolean
  autoFocus?: boolean
}) {
  const t = useTranslations('supervision.gameCategories')
  const uid = useId()
  const max = GAME_CATEGORY_LIMITS.maxNameLength
  // Ouverture décidée au montage seulement : sinon vider le dernier champ EN/ES/IT refermait le dépliant sous les doigts.
  const [startsOpen] = useState(() => inputs.en !== '' || inputs.es !== '' || inputs.it !== '')
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={`${uid}-fr`} className="text-xs font-medium text-cream">
            {t('nameFr')}
          </label>
          <span className="text-[11px] tabular-nums text-cream/70" aria-hidden>
            {t('nameCounter', { count: inputs.fr.length, max })}
          </span>
        </div>
        <input
          id={`${uid}-fr`}
          type="text"
          value={inputs.fr}
          maxLength={max}
          required
          autoFocus={autoFocus}
          autoComplete="off"
          aria-disabled={locked}
          readOnly={locked}
          aria-describedby={`${uid}-hint`}
          onChange={(e) => onChange({ ...inputs, fr: e.target.value })}
          className={INPUT}
        />
        <p id={`${uid}-hint`} className="text-[11px] leading-snug text-cream/70">
          {t('nameHint', { max })}
        </p>
      </div>
      <details className="group rounded-lg border border-white/10 bg-black/20" open={startsOpen || undefined}>
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 text-xs font-medium text-cream/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 sm:min-h-[36px] [&::-webkit-details-marker]:hidden">
          <span>{t('otherLanguages')}</span>
          <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="space-y-2 border-t border-white/[0.07] p-3">
          <p className="text-[11px] leading-snug text-cream/70">{t('otherLanguagesHint')}</p>
          {(['en', 'es', 'it'] as const).map((locale) => (
            <div key={locale} className="space-y-1">
              <label htmlFor={`${uid}-${locale}`} className="text-xs font-medium text-cream">
                {t(OTHER_NAME_KEYS[locale])}
              </label>
              <input
                id={`${uid}-${locale}`}
                type="text"
                value={inputs[locale]}
                maxLength={max}
                autoComplete="off"
                aria-disabled={locked}
                readOnly={locked}
                onChange={(e) => onChange({ ...inputs, [locale]: e.target.value })}
                className={INPUT}
              />
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}

function CategoryCard({
  category,
  index,
  total,
  canEdit,
  isPending,
  send,
  onMoved,
  onDeleted,
}: {
  category: GameCategory
  index: number
  total: number
  canEdit: boolean
  isPending: (key: string) => boolean
  send: Send
  onMoved: (categoryId: string, direction: 'up' | 'down') => void
  onDeleted: (index: number) => void
}) {
  const t = useTranslations('supervision.gameCategories')
  const locale = useLocale()
  const gameTitle = useGameTitle()
  const uid = useId()
  const [renaming, setRenaming] = useState(false)
  const [inputs, setInputs] = useState<CategoryNameInputs>(() => nameInputsOf(category.names))
  const [invalid, setInvalid] = useState(false)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [confirming, setConfirming] = useState(false)

  const renameBtnRef = useRef<HTMLButtonElement>(null)
  const deleteBtnRef = useRef<HTMLButtonElement>(null)
  const restoreRenameFocus = useRef(false)
  const restoreDeleteFocus = useRef(false)

  // Le bouton visé n'existe qu'une fois le formulaire (ou la confirmation) refermé : le focus lui revient ensuite, sinon il tombe sur <body>.
  useEffect(() => {
    if (!renaming && restoreRenameFocus.current) {
      restoreRenameFocus.current = false
      renameBtnRef.current?.focus()
    }
  }, [renaming])
  useEffect(() => {
    if (!confirming && restoreDeleteFocus.current) {
      restoreDeleteFocus.current = false
      deleteBtnRef.current?.focus()
    }
  }, [confirming])

  const name = categoryName(category, locale)
  const renameSaving = isPending(renameKey(category.id))
  const deleting = isPending(deleteKey(category.id))
  const upBusy = isPending(moveKey(category.id, 'up'))
  const downBusy = isPending(moveKey(category.id, 'down'))
  const selected = useMemo(() => new Set(category.gameIds), [category.gameIds])
  const visibleIds = filterGameIds(STAFF_TOGGLEABLE_GAME_IDS, query, gameTitle)
  const nameLine = NAME_LOCALES.filter((l) => category.names[l]).map((l) => `${l.toUpperCase()} ${category.names[l]}`)

  const closeRename = () => {
    restoreRenameFocus.current = true
    setRenaming(false)
  }

  const submitRename = async (event: FormEvent) => {
    event.preventDefault()
    if (renameSaving) return
    const names = namesFromInputs(inputs)
    if (!names) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    const ok = await send('PATCH', { id: category.id, names }, renameKey(category.id), (saved) =>
      t('announceRenamed', { name: nameOf(saved, category.id, locale) })
    )
    if (ok) closeRename()
  }

  const move = async (direction: 'up' | 'down') => {
    // En butée le bouton reste focusable (aria-disabled) : un `disabled` ferait perdre le focus au clic qui l'amène en butée.
    if (direction === 'up' ? index === 0 : index === total - 1) return
    const ok = await send('PATCH', { id: category.id, move: direction }, moveKey(category.id, direction), (saved) =>
      t('announceMoved', {
        name: nameOf(saved, category.id, locale),
        position: saved.categories.findIndex((c) => c.id === category.id) + 1,
        total: saved.categories.length,
      })
    )
    if (ok) onMoved(category.id, direction)
  }

  // Geste unitaire : « ce jeu, allumé ou éteint », jamais la liste entière, pour ne pas écraser le travail d'un autre équipier.
  const toggleGame = (gameId: string) =>
    send('PATCH', { id: category.id, gameId, on: !selected.has(gameId) }, gameKey(category.id, gameId), (saved) =>
      t('announceGames', {
        name: nameOf(saved, category.id, locale),
        count: saved.categories.find((c) => c.id === category.id)?.gameIds.length ?? 0,
      })
    )

  const remove = async () => {
    if (deleting) return
    const ok = await send('DELETE', { id: category.id }, deleteKey(category.id), () => t('announceDeleted', { name }))
    if (ok) {
      setConfirming(false)
      onDeleted(index)
    }
  }

  const cancelDelete = () => {
    restoreDeleteFocus.current = true
    setConfirming(false)
  }

  return (
    <li
      data-category-card={category.id}
      tabIndex={-1}
      aria-labelledby={`${uid}-name`}
      className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-40">
          <p id={`${uid}-name`} className="break-words text-sm font-semibold text-cream">
            {name}
          </p>
          <p className="text-xs text-cream/70">{t('gamesCount', { count: category.gameIds.length })}</p>
          {nameLine.length > 1 && <p className="break-words text-[11px] leading-snug text-cream/70">{nameLine.join(' · ')}</p>}
        </div>
        {canEdit && !renaming && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              data-move="up"
              aria-disabled={index === 0 || upBusy}
              aria-busy={upBusy}
              aria-label={t('moveUp', { name })}
              onClick={() => void move('up')}
              className={ICON_BUTTON}
            >
              {upBusy ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> : <ChevronUp className="h-4 w-4" aria-hidden />}
            </button>
            <button
              type="button"
              data-move="down"
              aria-disabled={index === total - 1 || downBusy}
              aria-busy={downBusy}
              aria-label={t('moveDown', { name })}
              onClick={() => void move('down')}
              className={ICON_BUTTON}
            >
              {downBusy ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
            </button>
            <button
              ref={renameBtnRef}
              type="button"
              aria-label={t('rename', { name })}
              onClick={() => {
                setInputs(nameInputsOf(category.names))
                setInvalid(false)
                setConfirming(false)
                setRenaming(true)
              }}
              className={ICON_BUTTON}
            >
              <Pencil className="h-4 w-4" aria-hidden />
            </button>
            <button
              ref={deleteBtnRef}
              type="button"
              aria-label={t('delete', { name })}
              onClick={() => setConfirming(true)}
              className={ICON_BUTTON}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}
      </div>

      {renaming && (
        <form
          onSubmit={(e) => void submitRename(e)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') closeRename()
          }}
          className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-3"
        >
          <NameFields inputs={inputs} onChange={setInputs} locked={renameSaving} autoFocus />
          {invalid && (
            <p role="alert" className="text-xs text-rose-100">
              {t('nameInvalid')}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" aria-disabled={renameSaving} aria-busy={renameSaving} className={PRIMARY_BUTTON}>
              {renameSaving ? <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
              {t('save')}
            </button>
            <button type="button" onClick={closeRename} className={BUTTON}>
              {t('cancel')}
            </button>
          </div>
        </form>
      )}

      {confirming && (
        <div role="group" aria-label={t('deleteGroup', { name })} className="space-y-2 rounded-lg border border-rose-500/25 bg-rose-500/[0.06] p-3">
          <p role="alert" className="text-sm text-rose-100">
            {t('deleteConfirm', { name })}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-disabled={deleting}
              aria-busy={deleting}
              onClick={() => void remove()}
              className={cn(BUTTON, 'border-rose-500/40 text-rose-100 hover:text-rose-50')}
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden /> : <Trash2 className="h-3.5 w-3.5" aria-hidden />}
              {t('deleteConfirmButton')}
            </button>
            <button type="button" onClick={cancelDelete} className={BUTTON}>
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {canEdit ? (
        <div className="space-y-2">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`${uid}-games`}
            onClick={() => setOpen((v) => !v)}
            className={cn(BUTTON, 'w-full justify-between sm:w-auto')}
          >
            <span>{t('chooseGames', { count: category.gameIds.length })}</span>
            <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden />
          </button>
          <div id={`${uid}-games`} hidden={!open}>
            {open && (
              <div className="space-y-2">
                <input
                  type="search"
                  value={query}
                  autoComplete="off"
                  aria-label={t('searchLabel')}
                  placeholder={t('searchPlaceholder')}
                  onChange={(e) => setQuery(e.target.value)}
                  className={INPUT}
                />
                {visibleIds.length === 0 ? (
                  <p className="text-xs text-cream/70">{t('noResult')}</p>
                ) : (
                  <ul aria-label={t('gamesGroup', { name })} className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {visibleIds.map((gameId) => {
                      const on = selected.has(gameId)
                      const saving = isPending(gameKey(category.id, gameId))
                      return (
                        <li key={gameId}>
                          <button
                            type="button"
                            aria-pressed={on}
                            aria-busy={saving}
                            onClick={() => {
                              if (!saving) void toggleGame(gameId)
                            }}
                            className={cn(
                              'flex h-11 w-full min-w-0 items-center gap-2 rounded-lg border px-2.5 text-left text-xs font-medium transition-colors',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 aria-busy:cursor-progress sm:h-9',
                              on
                                ? 'border-gold/50 bg-gold/[0.15] text-cream'
                                : 'border-white/10 bg-white/5 text-cream/80 hover:bg-white/10 hover:text-cream'
                            )}
                          >
                            <span aria-hidden>
                              <GameIconById id={gameId} surface="feltGold" className="h-5 w-5 shrink-0" />
                            </span>
                            <span className="min-w-0 flex-1 truncate">{gameTitle(gameId)}</span>
                            {saving ? (
                              <Loader2 className="h-3.5 w-3.5 shrink-0 text-gold motion-safe:animate-spin" aria-hidden />
                            ) : (
                              on && <Check className="h-3.5 w-3.5 shrink-0 text-gold" aria-hidden />
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        category.gameIds.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {category.gameIds.map((gameId) => (
              <li key={gameId} className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-cream/80">
                <span aria-hidden>
                  <GameIconById id={gameId} surface="feltGold" className="h-4 w-4 shrink-0" />
                </span>
                {gameTitle(gameId)}
              </li>
            ))}
          </ul>
        )
      )}
    </li>
  )
}

/** Nom d'une catégorie dans la réponse du serveur : c'est elle qui fait foi pour l'annonce. */
function nameOf(saved: AdminGameCategoriesResponse, id: string, locale: string): string {
  const found = saved.categories.find((c) => c.id === id)
  return found ? categoryName(found, locale) : id
}

export function GameCategoriesPanel() {
  const t = useTranslations('supervision.gameCategories')
  const tStates = useTranslations('supervision.states')
  const locale = useLocale()
  const [data, setData] = useState<AdminGameCategoriesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set())
  const [failure, setFailure] = useState<FailureKey | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [createInputs, setCreateInputs] = useState<CategoryNameInputs>(EMPTY_NAME_INPUTS)
  const [createInvalid, setCreateInvalid] = useState(false)
  const [focusRequest, setFocusRequest] = useState<{ kind: 'move'; id: string; direction: 'up' | 'down' } | { kind: 'deleted'; index: number } | null>(null)

  const tRef = useRef(t)
  tRef.current = t
  const abortRef = useRef<AbortController | null>(null)
  // Clés des gestes en file ou en cours : sert au verrou de doublon et à l'état occupé des boutons.
  const keysRef = useRef(new Set<string>())
  const queueRef = useRef<Job[]>([])
  const runningRef = useRef(false)
  const reloadRef = useRef(false)
  const listRef = useRef<HTMLUListElement>(null)
  const countRef = useRef<HTMLParagraphElement>(null)

  const publishPending = useCallback(() => setPending(new Set(keysRef.current)), [])

  const load = useCallback(async (keepFailure = false) => {
    // Une lecture lancée pendant un envoi pourrait répondre après lui et réafficher l'ancien état.
    if (keysRef.current.size > 0) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    try {
      const res = await fetch('/api/admin/game-categories', {
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      })
      const body = await res.json().catch(() => null)
      // 403 : session expirée ou grade retiré pendant que l'onglet restait ouvert.
      if (!res.ok) throw new Error(res.status === 403 ? tRef.current('forbidden') : tRef.current('loadError'))
      const parsed = parseAdminGameCategories(body)
      if (!parsed) throw new Error(tRef.current('loadError'))
      setData(parsed)
      setError(null)
      // La relecture qui suit un 404 ou un 409 ne doit pas effacer le message qui l'explique.
      if (!keepFailure) setFailure(null)
    } catch (e) {
      if (controller.signal.aborted) return
      // TypeError = échec réseau de fetch (en anglais quelle que soit la langue).
      setError(e instanceof Error && e.name !== 'TypeError' ? e.message : tRef.current('loadError'))
    } finally {
      if (abortRef.current === controller) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    return () => {
      const inflight = abortRef.current
      abortRef.current = null
      inflight?.abort()
    }
  }, [load])

  /** Un envoi ; renvoie null s'il a réussi, sinon la raison de l'échec. */
  const run = useCallback(async (job: Job): Promise<FailureKey | null> => {
    try {
      const res = await fetch('/api/admin/game-categories', {
        method: job.method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(job.body),
      })
      const parsed = res.ok ? parseAdminGameCategories(await res.json().catch(() => null)) : null
      if (!parsed) {
        return res.status === 403 ? 'forbidden' : res.status === 404 ? 'notFound' : res.status === 409 ? 'limitReached' : 'saveError'
      }
      setData(parsed)
      setAnnouncement(job.announce(parsed))
      void refreshGameCatalog()
      return null
    } catch {
      return 'saveError'
    }
  }, [])

  const drain = useCallback(async () => {
    runningRef.current = true
    try {
      while (queueRef.current.length > 0) {
        const job = queueRef.current.shift()!
        const reason = await run(job)
        keysRef.current.delete(job.key)
        if (reason) {
          setFailure(reason)
          // Liste périmée (catégorie supprimée, limite atteinte par un autre) : les gestes suivants reposent sur elle, on les abandonne et on relit.
          if (reason === 'notFound' || reason === 'limitReached' || reason === 'forbidden') {
            if (reason !== 'forbidden') reloadRef.current = true
            for (const rest of queueRef.current.splice(0)) {
              keysRef.current.delete(rest.key)
              rest.resolve(false)
            }
          }
        }
        publishPending()
        job.resolve(reason === null)
      }
    } finally {
      runningRef.current = false
    }
    if (reloadRef.current) {
      reloadRef.current = false
      void load(true)
    }
  }, [load, publishPending, run])

  const send: Send = useCallback(
    (method, body, key, announce) => {
      if (keysRef.current.has(key)) return Promise.resolve(false)
      keysRef.current.add(key)
      publishPending()
      // Le message d'un échec reste affiché jusqu'au prochain geste : c'est ici que ce geste l'efface.
      setFailure(null)
      setAnnouncement('')
      abortRef.current?.abort()
      abortRef.current = null
      setLoading(false)
      return new Promise<boolean>((resolve) => {
        queueRef.current.push({ method, body, key, announce, resolve })
        if (!runningRef.current) void drain()
      })
    },
    [drain, publishPending]
  )

  // Réordonner ou supprimer remonte/retire des nœuds du DOM : le focus est rendu explicitement, jamais laissé tomber sur <body>.
  useEffect(() => {
    if (!focusRequest) return
    if (focusRequest.kind === 'move') {
      const card = listRef.current?.querySelector(`[data-category-card="${focusRequest.id}"]`)
      card?.querySelector<HTMLElement>(`[data-move="${focusRequest.direction}"]`)?.focus()
    } else {
      const cards = listRef.current?.querySelectorAll<HTMLElement>('[data-category-card]')
      const target = cards && cards.length > 0 ? cards[Math.min(focusRequest.index, cards.length - 1)] : countRef.current
      target?.focus()
    }
    setFocusRequest(null)
  }, [focusRequest])

  const isPending = useCallback((key: string) => pending.has(key), [pending])
  const busyAny = pending.size > 0

  const create = async (event: FormEvent) => {
    event.preventDefault()
    if (keysRef.current.has(CREATE_KEY) || !data) return
    const names = namesFromInputs(createInputs)
    if (!names) {
      setCreateInvalid(true)
      return
    }
    setCreateInvalid(false)
    const ok = await send('POST', { names }, CREATE_KEY, (saved) => {
      const created = saved.categories.find((c) => !data.categories.some((old) => old.id === c.id))
      return t('announceCreated', { name: created ? categoryName(created, locale) : names.fr })
    })
    if (ok) setCreateInputs(EMPTY_NAME_INPUTS)
  }

  const refreshButton = (
    <button
      type="button"
      onClick={() => void load()}
      aria-busy={loading}
      aria-disabled={busyAny}
      className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-3 text-xs font-medium text-cream/80 transition-colors hover:bg-white/10 hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 sm:h-8 sm:px-2.5"
    >
      <RefreshCw className={cn('h-3.5 w-3.5', loading && 'motion-safe:animate-spin')} aria-hidden />
      {t('refresh')}
    </button>
  )

  return (
    <SectionCard icon={Tags} title={t('title')} description={t('desc')} actions={refreshButton}>
      {error ? (
        <ErrorState icon={AlertTriangle} message={error} retryLabel={tStates('retry')} onRetry={() => void load()} />
      ) : !data ? (
        <SkeletonRows rows={3} />
      ) : (
        <div className="space-y-3">
          <p role="status" className="sr-only">
            {announcement}
          </p>
          <div className="space-y-1 text-xs text-cream/70">
            <p ref={countRef} tabIndex={-1} className="font-semibold text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50">
              {t('count', { count: data.categories.length })}
            </p>
            {!data.canEdit && <p>{t('readOnly')}</p>}
          </div>

          {failure && (
            <p role="alert" className="rounded-xl border border-rose-500/25 bg-rose-500/[0.06] px-3 py-2 text-sm text-rose-100">
              {t(failure, { max: GAME_CATEGORY_LIMITS.maxCategories })}
            </p>
          )}

          {data.canEdit &&
            (canAddCategory(data.categories.length) ? (
              <form
                onSubmit={(e) => void create(e)}
                aria-label={t('createTitle')}
                className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3"
              >
                <h3 className="text-sm font-semibold text-cream">{t('createTitle')}</h3>
                <NameFields inputs={createInputs} onChange={setCreateInputs} locked={isPending(CREATE_KEY)} />
                {createInvalid && (
                  <p role="alert" className="text-xs text-rose-100">
                    {t('nameInvalid')}
                  </p>
                )}
                <button
                  type="submit"
                  aria-disabled={isPending(CREATE_KEY)}
                  aria-busy={isPending(CREATE_KEY)}
                  className={cn(PRIMARY_BUTTON, 'w-full sm:w-auto')}
                >
                  {isPending(CREATE_KEY) ? (
                    <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden />
                  ) : (
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {t('create')}
                </button>
              </form>
            ) : (
              <p className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-cream/80">
                {t('limitReached', { max: GAME_CATEGORY_LIMITS.maxCategories })}
              </p>
            ))}

          {data.categories.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/15 px-3 py-6 text-center text-sm text-cream/70">
              {data.canEdit ? t('emptyEdit') : t('emptyReadOnly')}
            </p>
          ) : (
            <ul ref={listRef} className="space-y-2">
              {data.categories.map((category, index) => (
                <CategoryCard
                  key={category.id}
                  category={category}
                  index={index}
                  total={data.categories.length}
                  canEdit={data.canEdit}
                  isPending={isPending}
                  send={send}
                  onMoved={(id, direction) => setFocusRequest({ kind: 'move', id, direction })}
                  onDeleted={(deletedIndex) => setFocusRequest({ kind: 'deleted', index: deletedIndex })}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </SectionCard>
  )
}
