"use client";
import { useCallback, useEffect, useState } from 'react';
import { SELECTED_PLAYERS_EVENT, getSelectedPlayerIds, setSelectedPlayerIds, clearSelectedPlayerIds } from '@/lib/selectedPlayers';

const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

export function useSelectedPlayers() {
	const [selectedIds, setSelectedIds] = useState<string[]>(() => getSelectedPlayerIds());

	// Effet de montage conservé pour la compatibilité HMR (Fast Refresh)
	useEffect(() => {
		// Ré-synchronise depuis le stockage au montage côté client, puis à chaque
		// changement fait par un autre lecteur (même page ou autre onglet).
		const sync = () => {
			const next = getSelectedPlayerIds();
			setSelectedIds((prev) => (sameIds(prev, next) ? prev : next));
		};
		sync();
		window.addEventListener(SELECTED_PLAYERS_EVENT, sync);
		window.addEventListener('storage', sync);
		return () => {
			window.removeEventListener(SELECTED_PLAYERS_EVENT, sync);
			window.removeEventListener('storage', sync);
		};
	}, []);

	useEffect(() => {
		setSelectedPlayerIds(selectedIds);
	}, [selectedIds]);

	const select = useCallback((ids: string[]) => {
		setSelectedIds(Array.from(new Set(ids)));
	}, []);

	const add = useCallback((id: string) => {
		setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
	}, []);

	const remove = useCallback((id: string) => {
		setSelectedIds((prev) => prev.filter((x) => x !== id));
	}, []);

	const clear = useCallback(() => {
		setSelectedIds([]);
		clearSelectedPlayerIds();
	}, []);

	return { selectedIds, select, add, remove, clear };
}


