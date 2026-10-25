import { createHmac, generateKeyPairSync, verify } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acceptsUnverifiedEmailForNewAccount,
  decodeOAuthState,
  enabledOAuthProviders,
  encodeOAuthState,
  fetchOAuthProfile,
  oauthAuthorizeUrl,
  oauthCredentials,
  type OAuthState,
} from './oauth-server'

/**
 * Plomberie Discord / Facebook / Apple : fournisseurs activés par l'environnement,
 * adresse de l'aller, état de l'aller-retour (cookie) et lecture du profil.
 * Le réseau est simulé : aucun appel réel aux fournisseurs.
 */

const creds = { clientId: 'id-app', clientSecret: 'secret-app' }

const state: OAuthState = {
  state: 'x'.repeat(43),
  provider: 'discord',
  intent: 'login',
  redirect: '/jeux?join=ABC123',
  locale: 'fr',
  ambianceMode: 'soft',
  userId: null,
}

beforeEach(() => {
  vi.stubEnv('SITE_URL', 'https://lepillaveur.fr')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('enabledOAuthProviders', () => {
  it('ne garde que les fournisseurs dont les DEUX variables sont posées', () => {
    vi.stubEnv('DISCORD_CLIENT_ID', 'd')
    vi.stubEnv('DISCORD_CLIENT_SECRET', 's')
    vi.stubEnv('FACEBOOK_APP_ID', 'f')
    vi.stubEnv('FACEBOOK_APP_SECRET', '  ')
    vi.stubEnv('APPLE_CLIENT_ID', '')
    expect(enabledOAuthProviders()).toEqual(['discord'])
  })
})

describe('oauthAuthorizeUrl', () => {
  it('Discord : identité + e-mail, retour déclaré, accord déjà donné non redemandé', () => {
    const url = new URL(oauthAuthorizeUrl('discord', 'id-app', 'etat', 'login'))
    expect(url.origin + url.pathname).toBe('https://discord.com/oauth2/authorize')
    expect(url.searchParams.get('scope')).toBe('identify email')
    expect(url.searchParams.get('redirect_uri')).toBe('https://lepillaveur.fr/api/auth/oauth/discord/callback')
    expect(url.searchParams.get('state')).toBe('etat')
    expect(url.searchParams.get('prompt')).toBe('none')
  })

  it('une suppression redemande l’accord (Discord) ou le mot de passe (Facebook)', () => {
    expect(new URL(oauthAuthorizeUrl('discord', 'id', 'e', 'delete')).searchParams.get('prompt')).toBe('consent')
    const facebook = new URL(oauthAuthorizeUrl('facebook', 'id', 'e', 'delete'))
    expect(facebook.hostname).toBe('www.facebook.com')
    expect(facebook.searchParams.get('scope')).toBe('public_profile,email')
    expect(facebook.searchParams.get('auth_type')).toBe('reauthenticate')
    expect(new URL(oauthAuthorizeUrl('facebook', 'id', 'e', 'login')).searchParams.has('auth_type')).toBe(false)
  })
})

describe('état de l’aller-retour', () => {
  it('se relit à l’identique', () => {
    expect(decodeOAuthState(encodeOAuthState(state))).toEqual(state)
  })

  it('refuse un cookie absent, illisible ou incomplet', () => {
    expect(decodeOAuthState(undefined)).toBeNull()
    expect(decodeOAuthState('pas-du-json')).toBeNull()
    expect(decodeOAuthState(encodeOAuthState({ ...state, state: 'court' }))).toBeNull()
    expect(decodeOAuthState(encodeOAuthState({ ...state, provider: 'twitter' as never }))).toBeNull()
    expect(decodeOAuthState(encodeOAuthState({ ...state, locale: 'de' as never }))).toBeNull()
  })

  it('ne rend jamais une destination hors du site', () => {
    expect(decodeOAuthState(encodeOAuthState({ ...state, redirect: '//evil.example' }))?.redirect).toBe('/joueurs')
    expect(decodeOAuthState(encodeOAuthState({ ...state, redirect: 'https://evil.example' }))?.redirect).toBe(
      '/joueurs'
    )
  })
})

/** Réseau simulé : une réponse JSON par adresse (préfixe), dans l'ordre des appels. */
function network(routes: Array<[string, unknown, number?]>) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      const route = routes.find(([prefix]) => url.startsWith(prefix))
      if (!route) return new Response('{}', { status: 404 })
      return new Response(JSON.stringify(route[1]), { status: route[2] ?? 200 })
    })
  )
  return calls
}

describe('fetchOAuthProfile — Discord', () => {
  it('échange le code puis lit le profil (adresse vérifiée)', async () => {
    const calls = network([
      ['https://discord.com/api/v10/oauth2/token', { access_token: 'jeton' }],
      [
        'https://discord.com/api/v10/users/@me',
        { id: '42', username: 'kev', global_name: 'Kevin', email: 'Kevin@Exemple.fr', verified: true },
      ],
    ])

    const profile = await fetchOAuthProfile('discord', 'code-1', creds)

    expect(profile).toEqual({ id: '42', email: 'kevin@exemple.fr', emailVerified: true, name: 'Kevin' })
    const body = new URLSearchParams(String(calls[0].init?.body))
    expect(body.get('code')).toBe('code-1')
    expect(body.get('client_secret')).toBe('secret-app')
    expect(body.get('redirect_uri')).toBe('https://lepillaveur.fr/api/auth/oauth/discord/callback')
    expect(new Headers(calls[1].init?.headers).get('authorization')).toBe('Bearer jeton')
  })

  it('signale une adresse non confirmée chez Discord', async () => {
    network([
      ['https://discord.com/api/v10/oauth2/token', { access_token: 'jeton' }],
      ['https://discord.com/api/v10/users/@me', { id: '42', username: 'kev', email: 'k@e.fr', verified: false }],
    ])
    const profile = await fetchOAuthProfile('discord', 'code', creds)
    expect(profile?.emailVerified).toBe(false)
    expect(profile?.name).toBe('kev')
  })

  it('null si le code est refusé', async () => {
    network([['https://discord.com/api/v10/oauth2/token', { error: 'invalid_grant' }, 400]])
    expect(await fetchOAuthProfile('discord', 'code', creds)).toBeNull()
  })
})

describe('Apple — secret client signé', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()

  function stubApple(key: string) {
    vi.stubEnv('APPLE_CLIENT_ID', 'fr.lepillaveur.web')
    vi.stubEnv('APPLE_TEAM_ID', 'TEAM123456')
    vi.stubEnv('APPLE_KEY_ID', 'KEY1234567')
    vi.stubEnv('APPLE_PRIVATE_KEY', key)
  }

  it('jeton ES256 vérifiable par la clé publique, à l’en-tête et aux champs attendus par Apple', () => {
    // Forme d'un .env : une seule ligne, \n littéraux, guillemets compris.
    stubApple(`"${pem.trim().replace(/\n/g, '\\n')}"`)

    const creds = oauthCredentials('apple')

    expect(creds?.clientId).toBe('fr.lepillaveur.web')
    const [header, payload, signature] = (creds?.clientSecret ?? '').split('.')
    const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
    expect(decode(header)).toEqual({ alg: 'ES256', kid: 'KEY1234567' })
    expect(decode(payload)).toMatchObject({
      iss: 'TEAM123456',
      sub: 'fr.lepillaveur.web',
      aud: 'https://appleid.apple.com',
    })
    const valid = verify(
      'sha256',
      Buffer.from(`${header}.${payload}`),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signature, 'base64url')
    )
    expect(valid).toBe(true)
  })

  it('accepte aussi le seul corps base64 de la clé', () => {
    stubApple(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''))
    expect(oauthCredentials('apple')).not.toBeNull()
  })

  it('clé illisible ou variable manquante : Apple désactivé, sans planter', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stubApple('pas-une-cle')
    expect(oauthCredentials('apple')).toBeNull()
    stubApple(pem)
    vi.stubEnv('APPLE_TEAM_ID', '')
    expect(enabledOAuthProviders()).not.toContain('apple')
  })

  it('aller : retour en form_post, nom + e-mail demandés', () => {
    const url = oauthAuthorizeUrl('apple', 'fr.lepillaveur.web', 'etat', 'login')
    expect(url).toContain('scope=name%20email')
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe('https://appleid.apple.com/auth/authorize')
    expect(parsed.searchParams.get('response_mode')).toBe('form_post')
    expect(parsed.searchParams.get('redirect_uri')).toBe('https://lepillaveur.fr/api/auth/oauth/apple/callback')
  })
})

describe('fetchOAuthProfile — Apple', () => {
  const appleCreds = { clientId: 'fr.lepillaveur.web', clientSecret: 'jwt' }
  const idToken = (claims: Record<string, unknown>) =>
    ['e30', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'signature'].join('.')
  const claims = {
    iss: 'https://appleid.apple.com',
    aud: 'fr.lepillaveur.web',
    sub: '001234.abcd',
    email: 'Abc123@privaterelay.appleid.com',
    email_verified: 'true',
    exp: Math.floor(Date.now() / 1000) + 600,
  }

  it('lit le jeton d’identité : identifiant stable, adresse (relais compris) vérifiée', async () => {
    const calls = network([['https://appleid.apple.com/auth/token', { id_token: idToken(claims) }]])
    const profile = await fetchOAuthProfile('apple', 'code-apple', appleCreds)
    expect(profile).toEqual({
      id: '001234.abcd',
      email: 'abc123@privaterelay.appleid.com',
      emailVerified: true,
      name: '',
    })
    expect(new URLSearchParams(String(calls[0].init?.body)).get('client_secret')).toBe('jwt')
  })

  it('refuse un jeton d’une autre application, d’un autre émetteur ou expiré', async () => {
    for (const bad of [
      { ...claims, aud: 'autre.app' },
      { ...claims, iss: 'https://evil.example' },
      { ...claims, exp: Math.floor(Date.now() / 1000) - 10 },
    ]) {
      network([['https://appleid.apple.com/auth/token', { id_token: idToken(bad) }]])
      expect(await fetchOAuthProfile('apple', 'code', appleCreds)).toBeNull()
    }
  })
})

describe('fetchOAuthProfile — Facebook', () => {
  it('signe la lecture du profil (appsecret_proof) ; une adresse transmise n’est jamais tenue pour prouvée', async () => {
    const calls = network([
      ['https://graph.facebook.com/v25.0/oauth/access_token', { access_token: 'jeton-fb' }],
      ['https://graph.facebook.com/v25.0/me', { id: '99', first_name: 'Léa', name: 'Léa M.', email: 'lea@exemple.fr' }],
    ])

    const profile = await fetchOAuthProfile('facebook', 'code-fb', creds)

    // Facebook ne dit pas si l'adresse est confirmée : elle ne doit jamais
    // ouvrir un compte existant qui la porte.
    expect(profile).toEqual({ id: '99', email: 'lea@exemple.fr', emailVerified: false, name: 'Léa' })
    const me = new URL(calls[1].url)
    expect(me.searchParams.get('appsecret_proof')).toBe(
      createHmac('sha256', 'secret-app').update('jeton-fb').digest('hex')
    )
    expect(me.searchParams.get('fields')).toBe('id,first_name,name,email')
  })

  it('sans adresse (compte ouvert par téléphone) : profil sans e-mail', async () => {
    network([
      ['https://graph.facebook.com/v25.0/oauth/access_token', { access_token: 'jeton-fb' }],
      ['https://graph.facebook.com/v25.0/me', { id: '99', name: 'Léa M.' }],
    ])
    const profile = await fetchOAuthProfile('facebook', 'code', creds)
    expect(profile).toMatchObject({ email: null, emailVerified: false, name: 'Léa M.' })
  })

  it('seul Facebook peut ouvrir un compte neuf avec une adresse non prouvée', () => {
    expect(acceptsUnverifiedEmailForNewAccount('facebook')).toBe(true)
    expect(acceptsUnverifiedEmailForNewAccount('discord')).toBe(false)
    expect(acceptsUnverifiedEmailForNewAccount('apple')).toBe(false)
  })
})
