/** Parse une réponse fetch en JSON sans planter si le corps est vide */
export async function parseApiJson<T = Record<string, unknown>>(
  res: Response
): Promise<T> {
  const text = await res.text()
  if (!text.trim()) {
    return {} as T
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(
      res.ok
        ? 'Réponse serveur invalide'
        : `Erreur serveur (${res.status})`
    )
  }
}
