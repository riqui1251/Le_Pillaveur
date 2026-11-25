import { getSafeStorage } from './storage';

const STORAGE_KEY = 'selected_player_ids';

/**
 * Prévient les autres lecteurs de la page ('storage' ne sert qu'aux autres
 * onglets) : sans lui, cocher un joueur dans la feuille du hub laissait le
 * compteur de la barre sur l'ancien nombre.
 */
export const SELECTED_PLAYERS_EVENT = 'lp-selected-players-change';

function notifySelectedPlayers(): void {
	if (typeof window !== 'undefined') window.dispatchEvent(new Event(SELECTED_PLAYERS_EVENT));
}

export function getSelectedPlayerIds(): string[] {
	const storage = getSafeStorage();
	if (!storage) return [];
	try {
		const raw = storage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
	} catch {
		return [];
	}
}

export function setSelectedPlayerIds(ids: string[]): void {
	const storage = getSafeStorage();
	if (!storage) return;
	try {
		const unique = Array.from(new Set(ids.filter(Boolean)));
		const next = JSON.stringify(unique);
		// Rien de changé, rien à annoncer : chaque lecteur réécrit sa copie, sans
		// cette garde ils se renverraient l'événement sans fin.
		if (storage.getItem(STORAGE_KEY) === next) return;
		storage.setItem(STORAGE_KEY, next);
		notifySelectedPlayers();
	} catch {
		// Quota ou mode privé : la sélection vit alors en mémoire seulement.
	}
}

export function clearSelectedPlayerIds(): void {
	const storage = getSafeStorage();
	if (!storage) return;
	try {
		if (storage.getItem(STORAGE_KEY) === null) return;
		storage.removeItem(STORAGE_KEY);
		notifySelectedPlayers();
	} catch {
		// Même cause : rien à effacer si l'écriture avait déjà échoué.
	}
}



