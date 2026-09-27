import { describe, expect, it } from 'vitest'
import { GET } from '@/app/.well-known/assetlinks.json/route'
import {
  ANDROID_APP_PACKAGE,
  ANDROID_CERT_SHA256_FINGERPRINTS,
  androidAssetLinks,
} from './android-app-links'

/**
 * /.well-known/assetlinks.json : Android rejette en bloc un fichier mal formé
 * (liens ouverts dans le navigateur, sans message). On fige donc la forme
 * exacte attendue par la vérification des App Links et le format de chaque
 * empreinte, puis la réponse HTTP elle-même (200, application/json).
 */

/** 32 octets en hexadécimal majuscule séparés par « : », comme keytool les affiche. */
const SHA256_FINGERPRINT = /^[0-9A-F]{2}(?::[0-9A-F]{2}){31}$/

describe('empreintes des certificats Android', () => {
  it('au moins une, toutes au format SHA-256 attendu, sans doublon', () => {
    expect(ANDROID_CERT_SHA256_FINGERPRINTS.length).toBeGreaterThan(0)
    for (const fingerprint of ANDROID_CERT_SHA256_FINGERPRINTS) {
      expect(fingerprint, fingerprint).toMatch(SHA256_FINGERPRINT)
    }
    expect(new Set(ANDROID_CERT_SHA256_FINGERPRINTS).size).toBe(ANDROID_CERT_SHA256_FINGERPRINTS.length)
  })
})

describe('androidAssetLinks', () => {
  it('délègue toutes les URL du domaine à fr.lepillaveur.app, pour chaque empreinte listée', () => {
    expect(ANDROID_APP_PACKAGE).toBe('fr.lepillaveur.app')
    expect(androidAssetLinks()).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'fr.lepillaveur.app',
          sha256_cert_fingerprints: [...ANDROID_CERT_SHA256_FINGERPRINTS],
        },
      },
    ])
  })
})

describe('GET /.well-known/assetlinks.json', () => {
  // L'absence de redirection (307 de next-intl vers /fr/…) se joue dans le
  // matcher du middleware : voir src/middleware-matcher.test.ts.
  it('répond 200 en application/json avec la déclaration', async () => {
    const res = GET()

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(await res.json()).toEqual(androidAssetLinks())
  })
})
