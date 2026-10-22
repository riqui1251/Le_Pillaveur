/** Élément de la file « à traiter » à acquitter : un retour, ou une alerte pseudos suspects d'un compte. */
export type QueueAckTarget = { kind: 'feedback' | 'name-flag'; targetId: string }

/**
 * Acquitte un élément de la file « à traiter » : le retour passe « résolu »,
 * l'alerte pseudos suspects est levée.
 *
 * Rejette quand le serveur refuse (droits, compte disparu, panne), avec son
 * message, ou `fallback` si la réponse n'en porte pas : l'appelant ne retire
 * l'élément de la file qu'une fois la promesse tenue.
 */
export async function acknowledgeQueueItem(item: QueueAckTarget, fallback: string): Promise<void> {
  const res =
    item.kind === 'feedback'
      ? await fetch(`/api/admin/feedback/${item.targetId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ status: 'resolved' }),
        })
      : await fetch(`/api/admin/users/${item.targetId}/ack-name-flag`, {
          method: 'POST',
          credentials: 'include',
        })
  if (res.ok) return
  // Corps illisible (page d'erreur d'un proxy) : le statut suffit à refuser.
  const data = (await res.json().catch(() => null)) as { error?: unknown } | null
  throw new Error(typeof data?.error === 'string' && data.error ? data.error : fallback)
}
