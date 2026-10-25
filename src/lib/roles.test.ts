import { describe, expect, it } from 'vitest'
import {
  canAccessSupervision,
  canManageUserFeedback,
  canOverrideSanction,
  canViewOpsStatus,
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

/**
 * Onglet « Surveillance » : l'exploitation du serveur (sauvegardes, sonde,
 * conteneur) ne regarde que le fondateur — pas même le super admin.
 */
describe('roles — surveillance du serveur', () => {
  it('ne s’ouvre qu’au fondateur', () => {
    expect(canViewOpsStatus('fondateur')).toBe(true)
    for (const role of ['user', 'moderator', 'admin', 'superadmin']) {
      expect(canViewOpsStatus(role), role).toBe(false)
    }
  })

  it('ne se laisse pas tromper par un rôle inconnu ou mal écrit', () => {
    for (const role of ['', 'Fondateur', 'FONDATEUR', ' fondateur', 'founder', 'root']) {
      expect(canViewOpsStatus(role), JSON.stringify(role)).toBe(false)
    }
  })

  it('reste un sous-ensemble de la Supervision', () => {
    for (const role of USER_ROLES) {
      if (canViewOpsStatus(role)) expect(canAccessSupervision(role)).toBe(true)
    }
  })
})

/**
 * Lever ou remplacer une sanction en place : grade au moins égal à celui de
 * son auteur. Un modérateur ne défait pas la sanction d'un admin, un admin
 * pas celle d'un fondateur ; un pair, oui.
 */
describe('roles — sanction posée par un autre', () => {
  it('refuse un grade inférieur à celui de l’auteur', () => {
    expect(canOverrideSanction('moderator', 'admin')).toBe(false)
    expect(canOverrideSanction('admin', 'superadmin')).toBe(false)
    expect(canOverrideSanction('superadmin', 'fondateur')).toBe(false)
  })

  it('accepte un pair ou un grade supérieur', () => {
    expect(canOverrideSanction('moderator', 'moderator')).toBe(true)
    expect(canOverrideSanction('admin', 'moderator')).toBe(true)
    expect(canOverrideSanction('fondateur', 'fondateur')).toBe(true)
  })

  it('auteur inconnu (compte supprimé) : ne bloque pas', () => {
    expect(canOverrideSanction('moderator', null)).toBe(true)
  })
})
