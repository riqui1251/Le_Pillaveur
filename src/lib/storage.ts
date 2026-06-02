/**
 * Retourne un localStorage utilisable uniquement côté client.
 * Gère Node.js 25+ qui peut fournir un proxy localStorage sans getItem.
 */
export function getSafeStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    const storage = window.localStorage;
    if (storage && typeof storage.getItem === 'function') return storage;
  } catch {
    // localStorage désactivé ou inaccessible
  }
  return null;
}
