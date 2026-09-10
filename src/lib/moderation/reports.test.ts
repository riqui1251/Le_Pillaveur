import { describe, expect, it } from 'vitest'
import { isReportReason, parseReportContext, REPORT_REASONS } from './reports'

describe('isReportReason — motifs acceptés', () => {
  it('accepte tous les motifs déclarés', () => {
    for (const reason of REPORT_REASONS) {
      expect(isReportReason(reason)).toBe(true)
    }
  })

  it('refuse un motif inventé par un client', () => {
    expect(isReportReason('parce_que')).toBe(false)
    expect(isReportReason('')).toBe(false)
    expect(isReportReason('HARASSMENT')).toBe(false)
  })
})

describe('parseReportContext — extrait figé', () => {
  it('rend un tableau vide quand il n’y a pas de contexte', () => {
    expect(parseReportContext(null)).toEqual([])
  })

  it('ne casse pas sur un JSON corrompu', () => {
    expect(parseReportContext('{pas du json')).toEqual([])
  })

  it('ignore un JSON valide qui n’est pas un tableau', () => {
    expect(parseReportContext('{"body":"coucou"}')).toEqual([])
  })

  it('relit les messages figés', () => {
    const stored = JSON.stringify([
      { id: 'm1', senderId: 'u1', senderName: 'Alice', body: 'salut', createdAt: '2026-09-10T10:00:00.000Z' },
    ])
    expect(parseReportContext(stored)).toHaveLength(1)
    expect(parseReportContext(stored)[0].senderName).toBe('Alice')
  })
})
