/**
 * MINI-MOTEUR DE HOOKS pour les tests (environnement node, sans DOM).
 *
 * Remplace `react` dans un fichier de test :
 *
 *   vi.mock('react', async () => (await import('./hook-harness.test-utils')).miniReact)
 *
 * et fait tourner un hook pour de vrai — état, refs, mémos, effets et leurs
 * nettoyages — sans navigateur ni rendu. Les mises à jour d'état sont
 * groupées jusqu'au prochain microtask, comme le regroupement automatique de
 * React 18 : un `setRoom` posé dans une promesse n'est rendu (donc relu par
 * les refs tenues au rendu) qu'une fois le code synchrone fini. Les effets
 * tournent juste après chaque rendu.
 *
 * Volontairement minimal : un seul composant par hôte, pas de contexte réel
 * (useContext rend la valeur par défaut), pas de Suspense.
 */

type Deps = readonly unknown[] | undefined

type Slot =
  | { kind: 'state'; value: unknown; set: (next: unknown) => void }
  | { kind: 'ref'; ref: { current: unknown } }
  | { kind: 'memo'; value: unknown; deps: Deps }
  | { kind: 'effect'; deps: Deps; cleanup?: () => void }

type Host = {
  slots: Slot[]
  cursor: number
  dirty: boolean
  scheduled: boolean
  mounted: boolean
  pending: (() => void)[]
  render: () => void
}

let rendering: Host | null = null

function currentHost(): Host {
  if (!rendering) throw new Error('hook appelé hors rendu (hook-harness)')
  return rendering
}

function depsChanged(prev: Deps, next: Deps): boolean {
  if (!prev || !next || prev.length !== next.length) return true
  return prev.some((value, i) => !Object.is(value, next[i]))
}

function scheduleRender(host: Host): void {
  host.dirty = true
  if (rendering === host || host.scheduled) return
  host.scheduled = true
  queueMicrotask(() => {
    host.scheduled = false
    if (host.mounted && host.dirty) host.render()
  })
}

function useState<T>(initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void] {
  const host = currentHost()
  const i = host.cursor++
  if (!host.slots[i]) {
    const slot: Extract<Slot, { kind: 'state' }> = {
      kind: 'state',
      value: typeof initial === 'function' ? (initial as () => T)() : initial,
      set: (next: unknown) => {
        const value =
          typeof next === 'function' ? (next as (prev: unknown) => unknown)(slot.value) : next
        if (Object.is(value, slot.value)) return
        slot.value = value
        scheduleRender(host)
      },
    }
    host.slots[i] = slot
  }
  const slot = host.slots[i] as Extract<Slot, { kind: 'state' }>
  return [slot.value as T, slot.set as (next: T | ((prev: T) => T)) => void]
}

function useReducer<S, A>(reducer: (state: S, action: A) => S, initial: S): [S, (action: A) => void] {
  const [state, setState] = useState(initial)
  const host = currentHost()
  const i = host.cursor++
  if (!host.slots[i]) {
    host.slots[i] = {
      kind: 'memo',
      value: (action: A) => setState((prev) => reducer(prev, action)),
      deps: [],
    }
  }
  return [state, (host.slots[i] as Extract<Slot, { kind: 'memo' }>).value as (action: A) => void]
}

function useRef<T>(initial: T): { current: T } {
  const host = currentHost()
  const i = host.cursor++
  if (!host.slots[i]) host.slots[i] = { kind: 'ref', ref: { current: initial } }
  return (host.slots[i] as Extract<Slot, { kind: 'ref' }>).ref as { current: T }
}

function memoSlot<T>(factory: () => T, deps: Deps): T {
  const host = currentHost()
  const i = host.cursor++
  const slot = host.slots[i] as Extract<Slot, { kind: 'memo' }> | undefined
  if (!slot || depsChanged(slot.deps, deps)) {
    host.slots[i] = { kind: 'memo', value: factory(), deps }
  }
  return (host.slots[i] as Extract<Slot, { kind: 'memo' }>).value as T
}

function useMemo<T>(factory: () => T, deps: Deps): T {
  return memoSlot(factory, deps)
}

function useCallback<T>(fn: T, deps: Deps): T {
  return memoSlot(() => fn, deps)
}

function useEffect(effect: () => void | (() => void), deps?: Deps): void {
  const host = currentHost()
  const i = host.cursor++
  const slot = host.slots[i] as Extract<Slot, { kind: 'effect' }> | undefined
  if (slot && !depsChanged(slot.deps, deps)) return
  const next: Extract<Slot, { kind: 'effect' }> = { kind: 'effect', deps, cleanup: slot?.cleanup }
  host.slots[i] = next
  host.pending.push(() => {
    next.cleanup?.()
    next.cleanup = undefined
    const cleanup = effect()
    if (typeof cleanup === 'function') next.cleanup = cleanup
  })
}

function createContext<T>(defaultValue: T) {
  return { Provider: () => null, _defaultValue: defaultValue }
}

function useContext<T>(context: { _defaultValue: T }): T {
  return context._defaultValue
}

export const miniReact = {
  useState,
  useReducer,
  useRef,
  useMemo,
  useCallback,
  useEffect,
  useLayoutEffect: useEffect,
  createContext,
  useContext,
}

export type HookHandle<P, R> = {
  /** Valeur rendue par le DERNIER rendu. */
  result: () => R
  rerender: (props: P) => void
  unmount: () => void
}

/** Monte `hook(props)` et rend la main après le premier rendu et ses effets. */
export function renderHook<P, R>(hook: (props: P) => R, initialProps: P): HookHandle<P, R> {
  let props = initialProps
  let result: R
  const host: Host = {
    slots: [],
    cursor: 0,
    dirty: false,
    scheduled: false,
    mounted: true,
    pending: [],
    render: () => {
      let passes = 0
      do {
        if (++passes > 50) throw new Error('rendus en boucle (hook-harness)')
        host.dirty = false
        host.cursor = 0
        rendering = host
        try {
          result = hook(props)
        } finally {
          rendering = null
        }
        for (const run of host.pending.splice(0)) run()
      } while (host.dirty && host.mounted)
    },
  }
  host.render()
  return {
    result: () => result,
    rerender: (next) => {
      props = next
      host.render()
    },
    unmount: () => {
      host.mounted = false
      for (const slot of host.slots) {
        if (slot?.kind === 'effect') slot.cleanup?.()
      }
    },
  }
}

/** Laisse s'écouler les microtasks (promesses en chaîne, rendus groupés). */
export async function flushMicrotasks(rounds = 30): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await Promise.resolve()
}
