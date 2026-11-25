import { readFileSync } from 'node:fs'
import { createElement, type ComponentProps, type FunctionComponent, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import { AccountSheetContent } from './AccountSheet'

/**
 * Le contenu de la feuille « Mon compte » rendu côté serveur, session et
 * progression simulées, avec le VRAI catalogue français : ce que voit un
 * membre, un invité et un membre de l'équipe.
 */

const session = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  progression: null as Record<string, unknown> | null,
}))

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({
    user: session.user,
    loading: false,
    unavailable: false,
    refresh: async () => {},
    logout: async () => {},
    setAmbianceMode: async () => null,
    setPlayMode: async () => null,
  }),
}))
vi.mock('@/hooks/useOnlineProgression', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useOnlineProgression')>()),
  useOnlineProgression: () => ({ progression: session.progression, loading: false, fresh: true }),
}))
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, className, children }: { href: string; className?: string; children?: ReactNode }) =>
    createElement('a', { href, className }, children),
  usePathname: () => '/',
  useRouter: () => ({ replace: () => {}, push: () => {} }),
}))

type Catalogue = AbstractIntlMessages & { account: Record<string, unknown> }
const fr: Catalogue = JSON.parse(readFileSync(new URL('../../../messages/fr.json', import.meta.url), 'utf8'))

/** Texte du catalogue au chemin donné ; à défaut (clé pas encore fusionnée), le chemin, comme le repli de next-intl. */
function expected(path: string): string {
  let node: unknown = fr
  for (const part of path.split('.')) node = (node as Record<string, unknown> | undefined)?.[part]
  return typeof node === 'string' ? node : path
}

const IntlProvider = NextIntlClientProvider as FunctionComponent<
  Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>
>

const PROGRESSION = { xp: 640, level: 4, current: 40, required: 300, unlockedKeys: [], grantedKeys: [], streakCount: 0, streakLastDay: null }

const MEMBER = {
  id: 'u1',
  email: 'riton@example.com',
  displayName: 'Riton',
  onlineDisplayName: 'Riton du 13',
  onlinePreferences: { icon: 'chope' },
  accountCode: 'LP-ABC123',
  role: 'user',
  locale: 'fr',
  playMode: 'online',
  ambianceMode: 'alcool',
  isGuest: false,
}

const GUEST = { ...MEMBER, id: 'g1', email: '', displayName: 'Invité 42', onlineDisplayName: null, accountCode: 'LP-GST042', isGuest: true }

function render(user: Record<string, unknown>): string {
  session.user = user
  session.progression = PROGRESSION
  const errors: { code?: string; message?: string }[] = []
  const html = renderToStaticMarkup(
    createElement(
      IntlProvider,
      {
        locale: 'fr',
        messages: fr,
        timeZone: 'Europe/Paris',
        onError: (error: unknown) => {
          errors.push(error as { code?: string; message?: string })
        },
        getMessageFallback: ({ namespace, key }: { namespace?: string; key: string }) =>
          namespace ? `${namespace}.${key}` : key,
      },
      createElement(AccountSheetContent, { onNavigate: () => {} })
    )
  )
  // Tant que les textes de la feuille ne sont pas au catalogue, seuls eux
  // peuvent manquer ; une fois fusionnés, plus aucune erreur n'est admise.
  const tolerated = 'sheet' in fr.account ? [] : errors.filter((e) => e.message?.includes('account.sheet.'))
  expect(errors.filter((e) => !tolerated.includes(e))).toEqual([])
  return html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
}

const guestRule = expected('account.guestExpiry.rule').split('{days}')[0]

describe('feuille « Mon compte »', () => {
  it('un membre voit sa carte (niveau, nom, code, e-mail), ses réglages et ses lignes', () => {
    const html = render(MEMBER)
    expect(html).toContain(expected('account.sheet.cardLevel').replace('{level}', '4'))
    expect(html).toContain('Riton')
    expect(html).toContain('LP-ABC123')
    expect(html).toContain('riton@example.com')
    expect(html).toContain('value="Riton du 13"')
    expect(html).toContain(expected('account.sheet.profileTitle'))
    expect(html).toContain(expected('account.sheet.preferencesTitle'))
    expect(html).toContain(expected('hub.ambianceMode.label'))
    expect(html).toContain(expected('account.reminder.title'))
    expect(html).toContain('href="/achievements"')
    expect(html).toContain('href="/compte"')
    expect(html).toContain(expected('account.logout'))
    expect(html).toContain(expected('account.deleteAccount.title'))
    expect(html).not.toContain('href="/supervision"')
    expect(html).not.toContain(guestRule)
    expect(html).not.toContain(expected('account.guestUpgrade.title'))
  })

  it('un invité voit l’échéance de son compte et la carte pour le sauvegarder, pas le rappel par e-mail', () => {
    const html = render(GUEST)
    expect(html).toContain(expected('account.sheet.cardGuest'))
    expect(html).toContain(expected('account.sheet.noEmail'))
    expect(html).toContain('LP-GST042')
    expect(html).toContain(guestRule)
    expect(html).toContain(expected('account.guestUpgrade.title'))
    expect(html).not.toContain(expected('account.reminder.title'))
    expect(html).not.toContain(expected('account.sheet.cardLevel').replace('{level}', '4'))
  })

  it('un membre de l’équipe a sa ligne vers la Supervision', () => {
    expect(render({ ...MEMBER, role: 'moderator' })).toContain('href="/supervision"')
  })
})
