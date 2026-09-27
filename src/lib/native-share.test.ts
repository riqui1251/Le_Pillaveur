import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText, shareLink } from './native-share'

/**
 * Ordre du partage : feuille native de l'app (plugin Capacitor Share), puis
 * feuille du navigateur, puis copie — et la fermeture d'une feuille par le
 * joueur n'enchaîne JAMAIS sur la copie. Environnement node : window,
 * navigator et document sont des doublures minimales, posées test par test.
 */

const OPTIONS = {
  title: 'Le Pillaveur',
  text: 'Rejoins ma table Menteur sur Le Pillaveur ! Code : ABC123',
  url: 'https://lepillaveur.fr/invite/ABC123',
  clipboardText: 'Rejoins ma table Menteur sur Le Pillaveur ! Code : ABC123\nhttps://lepillaveur.fr/invite/ABC123',
}

/** Coquille Capacitor : `share` est absent quand l'APK n'embarque pas le plugin. */
function stubApp(share?: (options: unknown) => Promise<unknown>, native = true) {
  vi.stubGlobal('window', {
    Capacitor: {
      isNativePlatform: () => native,
      Plugins: share ? { Share: { share } } : {},
    },
  })
}

function stubNavigator(nav: { share?: unknown; clipboard?: unknown }) {
  vi.stubGlobal('navigator', nav)
}

/** Document réduit à ce que touche la copie de secours ; `copyResult` = retour d'execCommand. */
function stubDocument(copyResult: boolean | 'throw') {
  const attached: object[] = []
  const button = { focus: vi.fn() }
  const execCommand = vi.fn(() => {
    if (copyResult === 'throw') throw new Error('execCommand indisponible')
    return copyResult
  })
  const doc = {
    activeElement: button,
    body: { appendChild: (el: object) => attached.push(el) },
    createElement: () => {
      const area = {
        value: '',
        style: {} as Record<string, string>,
        setAttribute: vi.fn(),
        select: vi.fn(),
        setSelectionRange: vi.fn(),
        remove: () => attached.splice(attached.indexOf(area), 1),
      }
      return area
    },
    execCommand,
  }
  vi.stubGlobal('document', doc)
  return { attached, execCommand, button }
}

function domError(name: string): Error {
  const err = new Error(name)
  err.name = name
  return err
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('shareLink dans l’application', () => {
  it('ouvre la feuille de partage native AVANT celle du navigateur', async () => {
    const nativeShare = vi.fn().mockResolvedValue({ activityType: 'com.whatsapp' })
    const webShare = vi.fn()
    stubApp(nativeShare)
    stubNavigator({ share: webShare })

    await expect(shareLink(OPTIONS)).resolves.toBe('shared')
    expect(nativeShare).toHaveBeenCalledWith({
      title: OPTIONS.title,
      text: OPTIONS.text,
      url: OPTIONS.url,
      dialogTitle: OPTIONS.title,
    })
    expect(webShare).not.toHaveBeenCalled()
  })

  it('feuille refermée par le joueur : rien, ni navigateur ni copie', async () => {
    const writeText = vi.fn()
    stubApp(vi.fn().mockRejectedValue(new Error('Share canceled')))
    stubNavigator({ share: vi.fn(), clipboard: { writeText } })

    await expect(shareLink(OPTIONS)).resolves.toBe('cancelled')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('l’annulation se lit aussi sur l’objet rejeté par le pont (sans Error)', async () => {
    stubApp(vi.fn().mockRejectedValue({ message: 'Share cancelled', code: undefined }))
    stubNavigator({})

    await expect(shareLink(OPTIONS)).resolves.toBe('cancelled')
  })

  it('autre refus du plugin : on tente la feuille du navigateur', async () => {
    const webShare = vi.fn().mockResolvedValue(undefined)
    stubApp(vi.fn().mockRejectedValue(new Error('Must provide a URL or Message')))
    stubNavigator({ share: webShare })

    await expect(shareLink(OPTIONS)).resolves.toBe('shared')
    expect(webShare).toHaveBeenCalledWith({ title: OPTIONS.title, text: OPTIONS.text, url: OPTIONS.url })
  })

  it('APK sans le plugin (WebView sans navigator.share) : copie du lien', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubApp(undefined)
    stubNavigator({ clipboard: { writeText } })

    await expect(shareLink(OPTIONS)).resolves.toBe('copied')
    expect(writeText).toHaveBeenCalledWith(OPTIONS.clipboardText)
  })

  it('hors de la coquille native, un plugin Share éventuel est ignoré', async () => {
    const nativeShare = vi.fn()
    const webShare = vi.fn().mockResolvedValue(undefined)
    stubApp(nativeShare, false)
    stubNavigator({ share: webShare })

    await expect(shareLink(OPTIONS)).resolves.toBe('shared')
    expect(nativeShare).not.toHaveBeenCalled()
  })

  it('un second toucher pendant que la feuille est ouverte ne relance rien', async () => {
    let close: () => void = () => {}
    const nativeShare = vi.fn(() => new Promise<void>((resolve) => (close = resolve)))
    const writeText = vi.fn()
    stubApp(nativeShare)
    stubNavigator({ clipboard: { writeText } })

    const first = shareLink(OPTIONS)
    const second = shareLink(OPTIONS)
    close()

    await expect(first).resolves.toBe('shared')
    await expect(second).resolves.toBe('shared')
    expect(nativeShare).toHaveBeenCalledTimes(1)
    expect(writeText).not.toHaveBeenCalled()

    // La feuille refermée, un nouveau partage repart normalement.
    nativeShare.mockResolvedValueOnce(undefined)
    await expect(shareLink(OPTIONS)).resolves.toBe('shared')
    expect(nativeShare).toHaveBeenCalledTimes(2)
  })
})

describe('shareLink dans le navigateur', () => {
  it('feuille du navigateur refermée (AbortError) : pas de copie', async () => {
    const writeText = vi.fn()
    stubNavigator({ share: vi.fn().mockRejectedValue(domError('AbortError')), clipboard: { writeText } })

    await expect(shareLink(OPTIONS)).resolves.toBe('cancelled')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('feuille refusée sans que le joueur la ferme : repli sur la copie', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubNavigator({ share: vi.fn().mockRejectedValue(domError('NotAllowedError')), clipboard: { writeText } })

    await expect(shareLink(OPTIONS)).resolves.toBe('copied')
    expect(writeText).toHaveBeenCalledWith(OPTIONS.clipboardText)
  })

  it('ni feuille ni copie possible : échec signalé', async () => {
    stubNavigator({ clipboard: { writeText: vi.fn().mockRejectedValue(domError('NotAllowedError')) } })
    stubDocument(false)

    await expect(shareLink(OPTIONS)).resolves.toBe('failed')
  })
})

describe('copyText', () => {
  it('passe par le presse-papiers asynchrone quand il répond', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubNavigator({ clipboard: { writeText } })
    const { execCommand } = stubDocument(true)

    await expect(copyText('ABC123')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('ABC123')
    expect(execCommand).not.toHaveBeenCalled()
  })

  it('writeText refusé : repli zone de texte + execCommand, zone retirée, focus rendu', async () => {
    stubNavigator({ clipboard: { writeText: vi.fn().mockRejectedValue(domError('NotAllowedError')) } })
    const { attached, execCommand, button } = stubDocument(true)

    await expect(copyText('ABC123')).resolves.toBe(true)
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(attached).toHaveLength(0)
    expect(button.focus).toHaveBeenCalled()
  })

  it('presse-papiers asynchrone absent (page en HTTP) : repli direct', async () => {
    stubNavigator({})
    const { execCommand } = stubDocument(true)

    await expect(copyText('ABC123')).resolves.toBe(true)
    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('tout échoue : false, sans exception et sans zone de texte oubliée', async () => {
    stubNavigator({ clipboard: { writeText: vi.fn().mockRejectedValue(new Error('refus')) } })
    const { attached } = stubDocument('throw')

    await expect(copyText('ABC123')).resolves.toBe(false)
    expect(attached).toHaveLength(0)
  })

  it('sans document (rendu serveur) : false', async () => {
    stubNavigator({})

    await expect(copyText('ABC123')).resolves.toBe(false)
  })
})
