import { describe, expect, it } from 'vitest'
import {
  classifyReferrerHost,
  parseAcquisition,
  readAcquisition,
  sanitizeHost,
  sanitizeLandingPath,
  sanitizeUtm,
} from '@/lib/acquisition'

const SITE = 'lepillaveur.fr'

describe('readAcquisition — ce que le client envoie', () => {
  const read = (referrer: string, pathname = '/fr', search = '') =>
    readAcquisition({ referrer, siteHost: SITE, pathname, search })

  it('référent extérieur : son nom d’hôte seul, sans www, chemin ni query', () => {
    expect(read('https://www.google.fr/search?q=jeux+a+boire', '/fr/regles/loup-garou')).toEqual({
      ref: 'google.fr',
      path: '/fr/regles/loup-garou',
      utmSource: '',
      utmMedium: '',
      utmCampaign: '',
    })
  })

  it('référent du site lui-même, avec ou sans www : arrivée directe', () => {
    expect(read('https://lepillaveur.fr/fr/jeux').ref).toBe('')
    expect(read('https://www.lepillaveur.fr/fr').ref).toBe('')
  })

  it('aucun référent, ou un référent illisible : vide', () => {
    expect(read('').ref).toBe('')
    expect(read('pas une url').ref).toBe('')
    expect(read('file:///C:/page.html').ref).toBe('')
  })

  it('application Android : android-app://<paquet>', () => {
    expect(read('android-app://com.google.android.gm/').ref).toBe('android-app://com.google.android.gm')
  })

  it('utm lus dans l’URL, les autres paramètres ignorés', () => {
    const acq = read('', '/fr', '?utm_source=TikTok&utm_medium=bio&utm_campaign=noel&token=secret')
    expect(acq).toEqual({ ref: '', path: '/fr', utmSource: 'TikTok', utmMedium: 'bio', utmCampaign: 'noel' })
    expect(JSON.stringify(acq)).not.toContain('secret')
  })
})

describe('classifyReferrerHost — canaux', () => {
  it.each([
    ['google.com', 'google'],
    ['google.fr', 'google'],
    ['google.co.uk', 'google'],
    ['news.google.com', 'google'],
    ['bing.com', 'bing'],
    ['cn.bing.com', 'bing'],
    ['duckduckgo.com', 'duckduckgo'],
    ['qwant.com', 'qwant'],
    ['lite.qwant.com', 'qwant'],
    ['ecosia.org', 'ecosia'],
    ['fr.search.yahoo.com', 'yahoo'],
    ['search.yahoo.co.jp', 'yahoo'],
    ['chatgpt.com', 'chatgpt'],
    ['chat.openai.com', 'chatgpt'],
    ['perplexity.ai', 'perplexity'],
    ['t.co', 'x'],
    ['x.com', 'x'],
    ['twitter.com', 'x'],
    ['mobile.twitter.com', 'x'],
    ['facebook.com', 'facebook'],
    ['l.facebook.com', 'facebook'],
    ['m.facebook.com', 'facebook'],
    ['instagram.com', 'instagram'],
    ['l.instagram.com', 'instagram'],
    ['tiktok.com', 'tiktok'],
    ['snapchat.com', 'snapchat'],
    ['reddit.com', 'reddit'],
    ['out.reddit.com', 'reddit'],
    ['discord.com', 'discord'],
    ['discord.gg', 'discord'],
    ['youtube.com', 'youtube'],
    ['m.youtube.com', 'youtube'],
    ['youtu.be', 'youtube'],
  ])('%s → %s, sans garder l’hôte', (host, channel) => {
    expect(classifyReferrerHost(host)).toEqual({ channel, host: '' })
  })

  it('vide : direct', () => {
    expect(classifyReferrerHost('')).toEqual({ channel: 'direct', host: '' })
  })

  it('inconnu : autre, hôte gardé pour découvrir la source', () => {
    expect(classifyReferrerHost('jeuxdesoiree.blog')).toEqual({ channel: 'autre', host: 'jeuxdesoiree.blog' })
  })

  it('un nom qui ressemble sans être le domaine reste « autre »', () => {
    expect(classifyReferrerHost('notgoogle.com').channel).toBe('autre')
    expect(classifyReferrerHost('google.com.evil.net').channel).toBe('autre')
    expect(classifyReferrerHost('fakefacebook.com').channel).toBe('autre')
    expect(classifyReferrerHost('x.company.fr').channel).toBe('autre')
  })
})

describe('assainissement', () => {
  it('hôte : minuscules, sans www, DNS strict', () => {
    expect(sanitizeHost(' WWW.Example.COM ')).toBe('example.com')
    expect(sanitizeHost('localhost')).toBeNull()
    expect(sanitizeHost('exa mple.com')).toBeNull()
    expect(sanitizeHost('example.com/chemin')).toBeNull()
    expect(sanitizeHost('-example.com')).toBeNull()
    expect(sanitizeHost(`${'a'.repeat(98)}.fr`)).toBeNull()
  })

  it('utm : minuscules, accents retirés, espaces en _, le reste vidé', () => {
    expect(sanitizeUtm('TikTok')).toBe('tiktok')
    expect(sanitizeUtm('Soirée Noël')).toBe('soiree_noel')
    expect(sanitizeUtm('promo+hiver')).toBe('promo_hiver')
    expect(sanitizeUtm('a@b.fr')).toBe('')
    expect(sanitizeUtm('<script>')).toBe('')
    expect(sanitizeUtm('x'.repeat(61))).toBe('')
    expect(sanitizeUtm(42)).toBe('')
  })

  it('chemin : commence par /, slugs seulement, borné, sans / final', () => {
    expect(sanitizeLandingPath('/fr/regles/loup-garou/')).toBe('/fr/regles/loup-garou')
    expect(sanitizeLandingPath('/')).toBe('/')
    expect(sanitizeLandingPath('/FR/Jeux')).toBe('/fr/jeux')
    expect(sanitizeLandingPath('fr/jeux')).toBe('')
    expect(sanitizeLandingPath('/fr/jeux?utm_source=x')).toBe('')
    expect(sanitizeLandingPath('/fr/r%C3%A8gles')).toBe('')
    expect(sanitizeLandingPath('/fr/../admin')).toBe('')
    expect(sanitizeLandingPath('//evil.com')).toBe('')
    expect(sanitizeLandingPath(`/fr/${'a'.repeat(100)}`)).toBe('')
    expect(sanitizeLandingPath(null)).toBe('')
  })

  it('chemin : segments dynamiques masqués (invitation, salle TV, fiche compte)', () => {
    expect(sanitizeLandingPath('/fr/invite/ab12cd')).toBe('/fr/invite/:code')
    expect(sanitizeLandingPath('/en/tv/qwerty/')).toBe('/en/tv/:code')
    expect(sanitizeLandingPath('/fr/tv/apercu-dev')).toBe('/fr/tv/apercu-dev')
    expect(sanitizeLandingPath('/fr/supervision/comptes/clx123abc')).toBe('/fr/supervision/comptes/:id')
  })
})

describe('parseAcquisition — lecture stricte du champ acq', () => {
  const base = { ref: '', path: '/fr', utmSource: '', utmMedium: '', utmCampaign: '' }

  it('arrivée directe avec campagne', () => {
    expect(parseAcquisition({ ...base, utmSource: 'Instagram', utmMedium: 'story', utmCampaign: 'Lancement 2026' })).toEqual({
      channel: 'direct',
      host: '',
      utmSource: 'instagram',
      utmMedium: 'story',
      utmCampaign: 'lancement_2026',
      landingPath: '/fr',
    })
  })

  it('site inconnu : hôte gardé', () => {
    expect(parseAcquisition({ ...base, ref: 'www.Blog-Soiree.fr' })).toMatchObject({ channel: 'autre', host: 'blog-soiree.fr' })
  })

  it('application Android : canal app, paquet gardé', () => {
    expect(parseAcquisition({ ...base, ref: 'android-app://com.google.android.gm' })).toMatchObject({
      channel: 'app',
      host: 'com.google.android.gm',
    })
    expect(parseAcquisition({ ...base, ref: 'android-app://pas un paquet' })).toBeNull()
  })

  it('référent hors gabarit (URL complète, adresse IP brute de texte, type) : rien à compter', () => {
    expect(parseAcquisition({ ...base, ref: 'https://google.fr/search?q=x' })).toBeNull()
    expect(parseAcquisition({ ...base, ref: 'jean.dupont@mail.fr' })).toBeNull()
    expect(parseAcquisition({ ...base, ref: 42 })).toBeNull()
    expect(parseAcquisition({ ...base, ref: 'a'.repeat(300) })).toBeNull()
    expect(parseAcquisition(null)).toBeNull()
    expect(parseAcquisition([])).toBeNull()
    expect(parseAcquisition('google.fr')).toBeNull()
  })

  it('utm ou chemin hors gabarit : seulement vidés, le canal reste', () => {
    expect(parseAcquisition({ ...base, ref: 'bing.com', path: '/fr?x=1', utmSource: { a: 1 } })).toEqual({
      channel: 'bing',
      host: '',
      utmSource: '',
      utmMedium: '',
      utmCampaign: '',
      landingPath: '',
    })
  })

  it('aucun autre champ ne passe', () => {
    const parsed = parseAcquisition({ ...base, ref: 'google.fr', ip: '1.2.3.4', visitorId: 'v1', url: 'https://x' })
    expect(Object.keys(parsed ?? {}).sort()).toEqual(
      ['channel', 'host', 'landingPath', 'utmCampaign', 'utmMedium', 'utmSource'].sort()
    )
  })
})
