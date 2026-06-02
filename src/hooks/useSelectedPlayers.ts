"use client";
import { useCallback, useEffect, useState } from 'react';
import { getSelectedPlayerIds, setSelectedPlayerIds, clearSelectedPlayerIds } from '@/lib/selectedPlayers';

export function useSelectedPlayers() {
	const [selectedIds, setSelectedIds] = useState<string[]>(() => getSelectedPlayerIds());

	// Effet de montage conservé pour la compatibilité HMR (Fast Refresh)
	useEffect(() => {
		// Ré-synchronise depuis le stockage au montage côté client
		setSelectedIds(getSelectedPlayerIds());
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


