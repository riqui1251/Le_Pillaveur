/**
 * Message à montrer quand un envoi du chat est refusé :
 * - 'tooFast' : anti-flood du serveur (429) ;
 * - 'readOnly' : mort au Loup-Garou, partie en cours (403 chat_read_only) — le
 *   message générique lui laissait croire à une panne ;
 * - 'failed' : le reste (ban, message invalide, 5xx), brouillon conservé.
 */
export type ChatSendError = 'tooFast' | 'readOnly' | 'failed'

export function chatSendError(status: number, error: unknown): ChatSendError {
  if (status === 429) return 'tooFast'
  if (status === 403 && error === 'chat_read_only') return 'readOnly'
  return 'failed'
}
