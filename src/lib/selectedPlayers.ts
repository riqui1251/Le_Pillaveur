/* eslint-disable @typescript-eslint/no-unused-vars */
const STORAGE_KEY = 'selected_player_ids';

export function getSelectedPlayerIds(): string[] {
	if (typeof window === 'undefined') return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
	} catch {
		return [];
	}
}

export function setSelectedPlayerIds(ids: string[]): void {
	if (typeof window === 'undefined') return;
	try {
		const unique = Array.from(new Set(ids.filter(Boolean)));
		localStorage.setItem(STORAGE_KEY, JSON.stringify(unique));
	} catch {}
}

export function clearSelectedPlayerIds(): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {}
}


