import { describe, expect, it } from 'vitest'
import { DEFAULT_ONLINE_ICON } from '@/lib/online/cosmetics'
import { onlinePreferencesPatch } from './useSaveOnlinePreferences'

/**
 * Le PATCH du look en ligne remet à défaut tout champ absent : le corps doit
 * donc TOUJOURS porter l'icône, l'effet et le cadre, fusionnés avec le look
 * courant du joueur.
 */
describe('onlinePreferencesPatch', () => {
  const current = { icon: 'renard', specialEffect: 'fire' as const, iconFrame: 'silver' as const }

  it('changer la seule icône garde l’effet et le cadre', () => {
    expect(onlinePreferencesPatch(current, { icon: 'chouette' })).toEqual({
      icon: 'chouette',
      specialEffect: 'fire',
      iconFrame: 'silver',
    })
  })

  it('changer le seul effet garde l’icône et le cadre', () => {
    expect(onlinePreferencesPatch(current, { specialEffect: 'ice' })).toEqual({
      icon: 'renard',
      specialEffect: 'ice',
      iconFrame: 'silver',
    })
  })

  it('null retire l’effet ou le cadre ; undefined garde le courant', () => {
    expect(onlinePreferencesPatch(current, { specialEffect: null, iconFrame: undefined })).toEqual({
      icon: 'renard',
      specialEffect: null,
      iconFrame: 'silver',
    })
    expect(onlinePreferencesPatch(current, { iconFrame: null })).toEqual({
      icon: 'renard',
      specialEffect: 'fire',
      iconFrame: null,
    })
  })

  it('les trois champs sont toujours présents, même sans look courant', () => {
    const body = onlinePreferencesPatch(undefined, {})
    expect(body).toEqual({ icon: DEFAULT_ONLINE_ICON, specialEffect: null, iconFrame: null })
    expect(Object.keys(body).sort()).toEqual(['icon', 'iconFrame', 'specialEffect'])
    // Et ils survivent à la sérialisation (un `undefined` disparaîtrait du JSON).
    expect(JSON.parse(JSON.stringify(body))).toEqual(body)
  })

  it('icône vide (collection ouverte sans icône) : la chope, comme côté serveur', () => {
    expect(onlinePreferencesPatch(current, { icon: '' }).icon).toBe(DEFAULT_ONLINE_ICON)
  })

  it('la couleur n’est jamais envoyée (le catalogue en ligne n’en a qu’une)', () => {
    expect(onlinePreferencesPatch(current, { color: 'bg-red-500' })).not.toHaveProperty('color')
  })
})
