import { describe, expect, it } from 'vitest'
import {
  canManageUserFeedback,
  canViewSupervisionAnalytics,
  canViewUserFeedback,
  USER_ROLES,
} from '@/lib/roles'

/**
 * Retours joueurs (F44) : la LECTURE descend au grade modérateur — ce sont
 * les modérateurs et les admins qui font tourner le site — mais le
 * TRAITEMENT (clore un signalement) reste au grade admin.
 */
describe('roles — retours joueurs', () => {
  it('ouvre la lecture des retours à partir du grade modérateur', () => {
    expect(canViewUserFeedback('user')).toBe(false)
    expect(canViewUserFeedback('moderator')).toBe(true)
    expect(canViewUserFeedback('admin')).toBe(true)
    expect(canViewUserFeedback('superadmin')).toBe(true)
    expect(canViewUserFeedback('fondateur')).toBe(true)
  })

  it('réserve le traitement des retours au grade admin et au-dessus', () => {
    expect(canManageUserFeedback('user')).toBe(false)
    expect(canManageUserFeedback('moderator')).toBe(false)
    expect(canManageUserFeedback('admin')).toBe(true)
    expect(canManageUserFeedback('superadmin')).toBe(true)
    expect(canManageUserFeedback('fondateur')).toBe(true)
  })

  it('ne laisse jamais traiter un retour sans pouvoir le lire', () => {
    for (const role of USER_ROLES) {
      if (canManageUserFeedback(role)) expect(canViewUserFeedback(role)).toBe(true)
    }
  })

  it('ignore un rôle inconnu comme un simple joueur', () => {
    expect(canViewUserFeedback('vogon')).toBe(false)
    expect(canManageUserFeedback('')).toBe(false)
  })

  it('laisse la vue d\'ensemble au grade admin (inchangé)', () => {
    expect(canViewSupervisionAnalytics('moderator')).toBe(false)
    expect(canViewSupervisionAnalytics('admin')).toBe(true)
  })
})
