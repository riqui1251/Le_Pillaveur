import { getSafeStorage } from './storage';

const STORAGE_KEY = 'selected_player_ids';

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
		storage.setItem(STORAGE_KEY, JSON.stringify(unique));
	} catch {}
}

export function clearSelectedPlayerIds(): void {
	const storage = getSafeStorage();
	if (!storage) return;
	try {
		storage.removeItem(STORAGE_KEY);
	} catch {}
}



