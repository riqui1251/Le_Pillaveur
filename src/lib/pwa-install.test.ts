import { describe, expect, it } from 'vitest'
import {
  INSTALL_PROMPT_CAPTURE,
  heldInstallPrompt,
  holdInstallPrompt,
  installSurface,
  isIosDevice,
  isIosSafari,
  type BeforeInstallPromptEvent,
} from './pwa-install'

/**
 * Détection de la surface d'installation, sur des user-agents réels : Safari
 * iOS est le seul cas où l'on explique Partager → « Sur l'écran d'accueil » ;
 * un site déjà en plein écran ne propose rien ; le reste attend
 * `beforeinstallprompt`.
 */

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1',
  iphoneFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/126.0 Mobile/15E148 Safari/605.1.15',
  iphoneFacebook:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/460.0.0.36.107;FBBV/583628937;FBDV/iPhone15,2]',
  iphoneInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 334.0.4.32.98',
  ipadOs:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.113 Mobile Safari/537.36',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.2535.67',
}

describe('isIosDevice', () => {
  it('reconnaît iPhone et iPod par leur nom', () => {
    expect(isIosDevice(UA.iphoneSafari)).toBe(true)
    expect(isIosDevice(UA.iphoneChrome)).toBe(true)
  })

  it("reconnaît l'iPad déguisé en Mac par ses points de contact", () => {
    expect(isIosDevice(UA.ipadOs, 5)).toBe(true)
    expect(isIosDevice(UA.macSafari, 0)).toBe(false)
  })

  it('ignore Android et Windows', () => {
    expect(isIosDevice(UA.androidChrome, 5)).toBe(false)
    expect(isIosDevice(UA.windowsEdge, 10)).toBe(false)
  })
})

describe('isIosSafari', () => {
  it('Safari sur iPhone et sur iPad', () => {
    expect(isIosSafari(UA.iphoneSafari)).toBe(true)
    expect(isIosSafari(UA.ipadOs, 5)).toBe(true)
  })

  it('ni Chrome, ni Firefox sur iOS (pas de Partager Safari)', () => {
    expect(isIosSafari(UA.iphoneChrome)).toBe(false)
    expect(isIosSafari(UA.iphoneFirefox)).toBe(false)
  })

  it("ni les vues web d'applications (Facebook, Instagram)", () => {
    expect(isIosSafari(UA.iphoneFacebook)).toBe(false)
    expect(isIosSafari(UA.iphoneInstagram)).toBe(false)
  })

  it('ni Safari sur Mac (bureau, sans écran tactile)', () => {
    expect(isIosSafari(UA.macSafari, 0)).toBe(false)
  })
})

describe('installSurface', () => {
  it('déjà en plein écran → installed, quel que soit le navigateur', () => {
    expect(installSurface({ userAgent: UA.iphoneSafari, standalone: true })).toBe('installed')
    expect(installSurface({ userAgent: UA.androidChrome, standalone: true })).toBe('installed')
  })

  it('Safari iOS → guide Partager', () => {
    expect(installSurface({ userAgent: UA.iphoneSafari, standalone: false })).toBe('ios-safari')
    expect(installSurface({ userAgent: UA.ipadOs, standalone: false, maxTouchPoints: 5 })).toBe('ios-safari')
  })

  it("tout le reste attend l'événement beforeinstallprompt", () => {
    expect(installSurface({ userAgent: UA.androidChrome, standalone: false })).toBe('other')
    expect(installSurface({ userAgent: UA.windowsEdge, standalone: false })).toBe('other')
    expect(installSurface({ userAgent: UA.iphoneChrome, standalone: false })).toBe('other')
    expect(installSurface({ userAgent: UA.macSafari, standalone: false, maxTouchPoints: 0 })).toBe('other')
  })
})

/**
 * Le script inline du layout, exécuté contre une fausse fenêtre : l'événement
 * levé AVANT le montage de la carte doit l'attendre sur `window`.
 */
describe('INSTALL_PROMPT_CAPTURE', () => {
  function fakeWindow() {
    const listeners = new Map<string, (event: unknown) => void>()
    const win = {
      addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
    }
    new Function('window', INSTALL_PROMPT_CAPTURE)(win)
    return { win, fire: (type: string, event?: unknown) => listeners.get(type)?.(event) }
  }

  it("garde l'événement levé avant le montage, sans empêcher le bandeau du navigateur", () => {
    const { win, fire } = fakeWindow()
    let prevented = false
    const event = { preventDefault: () => (prevented = true) } as unknown as BeforeInstallPromptEvent
    expect(heldInstallPrompt(win)).toBeNull()
    fire('beforeinstallprompt', event)
    expect(heldInstallPrompt(win)).toBe(event)
    expect(prevented).toBe(false)
  })

  it("l'oublie une fois le site installé", () => {
    const { win, fire } = fakeWindow()
    fire('beforeinstallprompt', {})
    fire('appinstalled')
    expect(heldInstallPrompt(win)).toBeNull()
  })

  it('se lit et se vide comme la carte le fait', () => {
    const win = {}
    const event = {} as BeforeInstallPromptEvent
    holdInstallPrompt(win, event)
    expect(heldInstallPrompt(win)).toBe(event)
    holdInstallPrompt(win, null)
    expect(heldInstallPrompt(win)).toBeNull()
  })
})
