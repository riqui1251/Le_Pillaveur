import { describe, expect, it, vi } from 'vitest'
import {
  CLIENT_ERROR_FIELD_LIMITS,
  MAX_REPORTS_PER_PAGE,
  buildClientErrorReport,
  createClientErrorReporter,
  isIgnorableClientError,
  localeFromPath,
  normalizeClientErrorPath,
  reportFingerprint,
  truncateField,
} from '@/lib/client-error-report'

/**
 * Le module navigateur, SANS navigateur : seules les fonctions pures sont
 * testées (filtrage, troncature, dédoublonnage, chemin, langue). L'envoi réel
 * (sendBeacon / fetch) n'a pas de test — il n'a pas de logique, et un test
 * qui simule `navigator` ne prouverait rien.
 */

/** Une erreur avec la pile qu'on veut, telle qu'un navigateur la fournit. */
function errorWithStack(name: string, message: string, stack: string): Error {
  const error = new Error(message)
  error.name = name
  error.stack = stack
  return error
}

const PAGE = { pathname: '/fr/jeux' }

describe('isIgnorableClientError : ce qui ne remonte pas', () => {
  it('ignore les pannes réseau évidentes des trois moteurs', () => {
    for (const message of [
      'Failed to fetch', // Chrome
      'Load failed', // Safari
      'NetworkError when attempting to fetch resource.', // Firefox
    ]) {
      expect(isIgnorableClientError(new TypeError(message)), message).toBe(true)
    }
  })

  it('ne confond pas un vrai TypeError avec une panne réseau', () => {
    expect(isIgnorableClientError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false)
  })

  it('ne filtre « Failed to fetch » que sur un TypeError, pas sur une Error quelconque', () => {
    expect(isIgnorableClientError(new Error('Failed to fetch'))).toBe(false)
  })

  it('ignore ce qui vient d’une extension de navigateur', () => {
    const chrome = errorWithStack('Error', 'boom', 'Error: boom\n    at inject (chrome-extension://abcdef/content.js:1:2)')
    const firefox = errorWithStack('Error', 'boom', 'inject@moz-extension://1234-5678/content.js:1:2')
    expect(isIgnorableClientError(chrome)).toBe(true)
    expect(isIgnorableClientError(firefox)).toBe(true)
  })

  it('garde une erreur de notre code, même sans pile', () => {
    expect(isIgnorableClientError(errorWithStack('Error', 'boom', ''))).toBe(false)
    expect(isIgnorableClientError('une chaîne levée')).toBe(false)
    expect(isIgnorableClientError(null)).toBe(false)
  })
})

describe('normalizeClientErrorPath : le chemin seul, sans rien qui identifie', () => {
  it('coupe la query — un ?join=CODE ou un ?token= n’entre jamais', () => {
    expect(normalizeClientErrorPath('/fr/jeux?join=ABCD')).toBe('/fr/jeux')
    expect(normalizeClientErrorPath('/fr/compte/reinitialiser?token=secret&x=1')).toBe('/fr/compte/reinitialiser')
  })

  it('coupe le hash', () => {
    expect(normalizeClientErrorPath('/fr/regles/uno#section')).toBe('/fr/regles/uno')
  })

  it('masque les segments qui ressemblent à un identifiant (cuid de 25 caractères)', () => {
    expect(normalizeClientErrorPath('/fr/supervision/comptes/cmfz1q2w3e4r5t6y7u8i9o0p1')).toBe(
      '/fr/supervision/comptes/:id'
    )
  })

  it('masque le code de table qui suit /invite ou /tv — le même secret que ?join=CODE', () => {
    expect(normalizeClientErrorPath('/fr/invite/AB12CD')).toBe('/fr/invite/:code')
    expect(normalizeClientErrorPath('/invite/ab12cd')).toBe('/invite/:code')
    expect(normalizeClientErrorPath('/en/tv/ABCD?x=1')).toBe('/en/tv/:code')
    // Le segment parent seul, ou suivi d'autre chose qu'un code, reste tel quel.
    expect(normalizeClientErrorPath('/fr/tv')).toBe('/fr/tv')
    expect(normalizeClientErrorPath('/fr/invite/un-slug-long')).toBe('/fr/invite/un-slug-long')
  })

  it('laisse lisibles les autres segments courts et les slugs de jeux', () => {
    expect(normalizeClientErrorPath('/fr/online/ABCD')).toBe('/fr/online/ABCD')
    expect(normalizeClientErrorPath('/fr/jeux/petit-buveur')).toBe('/fr/jeux/petit-buveur')
  })

  it('rend toujours un chemin absolu, borné à 200 caractères', () => {
    expect(normalizeClientErrorPath('')).toBe('/')
    expect(normalizeClientErrorPath('?join=ABCD')).toBe('/')
    expect(normalizeClientErrorPath('fr/jeux')).toBe('/fr/jeux')
    const long = '/' + 'a/'.repeat(200)
    expect(normalizeClientErrorPath(long)).toHaveLength(CLIENT_ERROR_FIELD_LIMITS.path)
  })
})

describe('localeFromPath', () => {
  it('lit le segment de langue du chemin (localePrefix « always »)', () => {
    expect(localeFromPath('/es/jeux')).toBe('es')
    expect(localeFromPath('/it')).toBe('it')
  })

  it('se rabat sur la langue du document, puis sur le français', () => {
    expect(localeFromPath('/', 'EN-US')).toBe('en')
    expect(localeFromPath('/api/x', 'fr')).toBe('fr')
    expect(localeFromPath('/xx/jeux', 'zz')).toBe('fr')
    expect(localeFromPath('/')).toBe('fr')
  })
})

describe('truncateField', () => {
  it('aplatit les blancs et coupe au plafond', () => {
    expect(truncateField('  a \n  b\tc  ', 10)).toBe('a b c')
    expect(truncateField('x'.repeat(50), 10)).toBe('x'.repeat(10))
  })
})

describe('buildClientErrorReport : tout est borné avant l’envoi', () => {
  it('reprend nom, message, chemin normalisé et langue', () => {
    const report = buildClientErrorReport(new RangeError('Maximum call stack'), {
      pathname: '/en/online/ABCD?join=ABCD',
      digest: '123456789',
      buildSha: 'abc1234',
    })
    expect(report).toEqual({
      name: 'RangeError',
      message: 'Maximum call stack',
      path: '/en/online/ABCD',
      locale: 'en',
      digest: '123456789',
      buildSha: 'abc1234',
    })
  })

  it('tronque le nom à 80, le message à 300 et le sha à 16', () => {
    const error = new Error('m'.repeat(1000))
    error.name = 'N'.repeat(200)
    const report = buildClientErrorReport(error, { ...PAGE, buildSha: 'f'.repeat(40) })
    expect(report.name).toHaveLength(CLIENT_ERROR_FIELD_LIMITS.name)
    expect(report.message).toHaveLength(CLIENT_ERROR_FIELD_LIMITS.message)
    expect(report.buildSha).toHaveLength(CLIENT_ERROR_FIELD_LIMITS.buildSha)
  })

  it('omet digest et sha quand ils manquent (contrat : le sha peut être undefined)', () => {
    const report = buildClientErrorReport(new Error('boom'), { ...PAGE, digest: undefined, buildSha: undefined })
    expect('digest' in report).toBe(false)
    expect('buildSha' in report).toBe(false)
    expect(JSON.parse(JSON.stringify(report))).toEqual({
      name: 'Error',
      message: 'boom',
      path: '/fr/jeux',
      locale: 'fr',
    })
  })

  it('accepte une valeur levée qui n’est pas une Error', () => {
    expect(buildClientErrorReport('texte brut', PAGE)).toMatchObject({ name: 'NonError', message: 'texte brut' })
    expect(buildClientErrorReport({ message: 'objet' }, PAGE)).toMatchObject({ name: 'NonError', message: 'objet' })
    expect(buildClientErrorReport(undefined, PAGE)).toMatchObject({ name: 'NonError', message: 'undefined' })
  })

  it('ne laisse jamais un nom vide', () => {
    const anonymous = new Error('boom')
    anonymous.name = ''
    expect(buildClientErrorReport(anonymous, PAGE).name).toBe('Error')
  })
})

describe('createClientErrorReporter : l’anti-tempête', () => {
  it('n’envoie jamais deux fois la même erreur (nom + message)', () => {
    const send = vi.fn()
    const report = createClientErrorReporter(send)
    expect(report(new Error('boom'), PAGE)).toBe(true)
    expect(report(new Error('boom'), { pathname: '/fr/autre' })).toBe(false)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('distingue deux erreurs de même message mais de classe différente', () => {
    const send = vi.fn()
    const report = createClientErrorReporter(send)
    report(new Error('boom'), PAGE)
    report(new TypeError('boom'), PAGE)
    expect(send).toHaveBeenCalledTimes(2)
    expect(reportFingerprint({ name: 'Error', message: 'boom' })).not.toBe(
      reportFingerprint({ name: 'TypeError', message: 'boom' })
    )
  })

  it('s’arrête à trois envois par chargement de page', () => {
    const send = vi.fn()
    const report = createClientErrorReporter(send)
    const outcomes = [1, 2, 3, 4, 5].map((n) => report(new Error(`erreur ${n}`), PAGE))
    expect(outcomes).toEqual([true, true, true, false, false])
    expect(send).toHaveBeenCalledTimes(MAX_REPORTS_PER_PAGE)
  })

  it('une erreur ignorée ne consomme pas le budget', () => {
    const send = vi.fn()
    const report = createClientErrorReporter(send, 1)
    expect(report(new TypeError('Failed to fetch'), PAGE)).toBe(false)
    expect(report(new Error('la vraie'), PAGE)).toBe(true)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ message: 'la vraie' }))
  })

  it('un envoyeur qui lève ne remonte pas jusqu’à l’écran d’erreur', () => {
    const report = createClientErrorReporter(() => {
      throw new Error('sendBeacon indisponible')
    })
    expect(() => report(new Error('boom'), PAGE)).not.toThrow()
  })
})
