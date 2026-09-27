import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Connexion Google native (coquille Capacitor) : une fois l'ID token obtenu,
 * les jetons que le plugin garde en clair dans l'app sont effacés (logout),
 * sans jamais retarder ni faire échouer la connexion du joueur.
 *
 * Le module garde l'initialisation du plugin en mémoire : il est rechargé à
 * chaque test pour repartir d'un état neuf.
 */

type Plugin = {
  initialize: ReturnType<typeof vi.fn>
  login: ReturnType<typeof vi.fn>
  logout?: ReturnType<typeof vi.fn>
}

function stubApp(plugin: Plugin) {
  vi.stubGlobal('window', {
    Capacitor: { isNativePlatform: () => true, Plugins: { SocialLogin: plugin } },
  })
}

function plugin(overrides: Partial<Plugin> = {}): Plugin {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    login: vi.fn().mockResolvedValue({ result: { idToken: 'jeton-google' } }),
    logout: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

async function signIn() {
  const { nativeGoogleSignIn } = await import('./native-google-login')
  return nativeGoogleSignIn()
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('nativeGoogleSignIn', () => {
  it('renvoie le jeton puis efface ceux que le plugin a gardés', async () => {
    const p = plugin()
    stubApp(p)

    await expect(signIn()).resolves.toBe('jeton-google')
    expect(p.logout).toHaveBeenCalledWith({ provider: 'google' })
  })

  it('ne dépend pas du ménage : logout qui échoue ou qui ne répond pas', async () => {
    const failing = plugin({ logout: vi.fn().mockRejectedValue(new Error('Failed to clear credential state')) })
    stubApp(failing)
    await expect(signIn()).resolves.toBe('jeton-google')

    vi.resetModules()
    const hanging = plugin({ logout: vi.fn(() => new Promise<void>(() => {})) })
    stubApp(hanging)
    await expect(signIn()).resolves.toBe('jeton-google')
  })

  it('plugin ancien sans logout : la connexion aboutit quand même', async () => {
    const p = plugin()
    delete p.logout
    stubApp(p)

    await expect(signIn()).resolves.toBe('jeton-google')
  })

  it('fenêtre refermée par le joueur : null, et rien à effacer', async () => {
    const p = plugin({ login: vi.fn().mockRejectedValue(new Error('User cancelled')) })
    stubApp(p)

    await expect(signIn()).resolves.toBeNull()
    expect(p.logout).not.toHaveBeenCalled()
  })
})
