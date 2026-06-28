"use client"

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { usePlayers } from '../hooks/usePlayers';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { X, Trophy, Pencil } from 'lucide-react';
import { PlayerIcon } from '@/components/ui/PlayerIcon';
import { PlayerName } from '@/components/ui/PlayerName';
import { PlayerCustomizer } from '@/components/ui/PlayerCustomizer';
import { Player, getPlayerNameValidationError } from '@/lib/players';
import { nameValidationI18nKey } from '@/lib/name-moderation';
import { reportProfanityIfNeeded } from '@/lib/name-moderation-attempt-client';
import { useAuth } from '@/hooks/useAuth';

interface PlayerManagerProps {
  onPlayersSelected: (selectedPlayers: string[]) => void;
  onStartOnline?: () => void;
  minPlayers?: number;
  hideRemoveButtons?: boolean;
  variant?: 'default' | 'hub';
}

const HUB_CARD = 'bg-white/[0.04] border-white/10 backdrop-blur-md shadow-lg';

export function PlayerManager({ onPlayersSelected, onStartOnline, minPlayers = 2, hideRemoveButtons = false, variant = 'default' }: PlayerManagerProps) {
  const t = useTranslations('players');
  const tCommon = useTranslations('common.nameValidation');
  const isHub = variant === 'hub';
  const cardClass = isHub ? HUB_CARD : 'shadow-md';
  const { user, refresh, setPlayMode } = useAuth();
  const { players, loading, addPlayer, removePlayer, updatePlayerPreferences } = usePlayers();

  const [newPlayerName, setNewPlayerName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [customizingPlayer, setCustomizingPlayer] = useState<Player | null>(null);
  const [onlineName, setOnlineName] = useState('');
  const [onlineNameError, setOnlineNameError] = useState<string | null>(null);
  const [onlineLoading, setOnlineLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setOnlineName((prev) => prev || user.onlineDisplayName || user.displayName || '');
  }, [user?.id, user?.onlineDisplayName, user?.displayName]);

  const handleAddPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newPlayerName.trim();
    if (!trimmed) return;

    const validationError = getPlayerNameValidationError(trimmed);
    if (validationError) {
      void reportProfanityIfNeeded(trimmed, validationError, 'local_player_add');
      const key = nameValidationI18nKey(validationError);
      const messageKey =
        validationError === 'invalid_characters' ? 'invalidCharactersPlayer' : key;
      setNameError(tCommon(messageKey));
      return;
    }

    setNameError(null);
    addPlayer(trimmed);
    setNewPlayerName('');
  };

  const togglePlayerSelection = (playerId: string) => {
    setSelectedPlayerIds((prev) => {
      const isSelected = prev.includes(playerId);
      if (isSelected) {
        return prev.filter((id) => id !== playerId);
      }
      return [...prev, playerId];
    });
  };

  const handleStartGame = () => {
    if (selectedPlayerIds.length < minPlayers) return;
    onPlayersSelected(selectedPlayerIds);
  };

  const handleSaveOnlineName = async () => {
    const value = onlineName.trim();
    if (!value || !user) return false;
    setOnlineNameError(null);
    setOnlineLoading(true);
    try {
      const response = await fetch('/api/auth/online-display-name', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ onlineDisplayName: value }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setOnlineNameError(data.error ?? 'Pseudo online invalide');
        return false;
      }
      await refresh();
      return true;
    } finally {
      setOnlineLoading(false);
    }
  };

  const handleStartOnline = async () => {
    if (!user || !onStartOnline) return;
    if (!user.onlineDisplayName) {
      const ok = await handleSaveOnlineName();
      if (!ok) return;
    }
    await setPlayMode('online');
    onStartOnline();
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center rounded-2xl border p-12 ${isHub ? HUB_CARD : ''}`}>
        <div className="flex flex-col items-center gap-3 text-white/70">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
          <p>{t('loading')}</p>
        </div>
      </div>
    );
  }

  const canStart = selectedPlayerIds.length >= minPlayers;

  return (
    <>
      <div className="space-y-6 pb-28">
        <Card className={`p-4 ${cardClass}`}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold md:text-xl">{t('addTitle')}</h2>
          </div>
          <form onSubmit={handleAddPlayer} className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                type="text"
                placeholder={t('namePlaceholder')}
                value={newPlayerName}
                onChange={(e) => {
                  setNewPlayerName(e.target.value);
                  if (nameError) setNameError(null);
                }}
                className="flex-grow"
                aria-invalid={nameError ? true : undefined}
              />
              <Button type="submit" disabled={!newPlayerName.trim()} className="w-full sm:w-auto">
                {t('addButton')}
              </Button>
            </div>
            {nameError && (
              <p className="text-sm text-orange-400" role="alert">
                {nameError}
              </p>
            )}
          </form>
          {onStartOnline && (
            <div className="mt-4 rounded-xl border border-cyan-400/30 bg-cyan-500/10 p-3">
              {!user ? (
                <p className="text-sm text-cyan-100/90">Connexion requise pour jouer en ligne.</p>
              ) : (
                <>
                  {!user.onlineDisplayName && (
                    <div className="space-y-2">
                      <p className="text-xs text-cyan-100/85">
                        Crée ton pseudo online (lié au compte, modifiable plus tard dans Compte).
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          value={onlineName}
                          onChange={(e) => {
                            setOnlineName(e.target.value);
                            if (onlineNameError) setOnlineNameError(null);
                          }}
                          maxLength={30}
                          placeholder="Pseudo online"
                          className="h-9 border-cyan-300/30 bg-black/20"
                        />
                        <Button
                          type="button"
                          onClick={() => { void handleSaveOnlineName(); }}
                          disabled={!onlineName.trim() || onlineLoading}
                          className="bg-cyan-500 text-black hover:bg-cyan-400"
                        >
                          Enregistrer
                        </Button>
                      </div>
                      {onlineNameError && <p className="text-xs text-orange-300">{onlineNameError}</p>}
                    </div>
                  )}
                  <div className="mt-3">
                    <Button
                      type="button"
                      onClick={() => { void handleStartOnline(); }}
                      className="bg-cyan-500 text-black hover:bg-cyan-400"
                      disabled={onlineLoading}
                    >
                      Aller aux jeux en ligne
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold md:text-xl">{t('selectTitle')}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {players.map((player) => (
              <Card
                key={player.id}
                onClick={() => togglePlayerSelection(player.id)}
                className={`cursor-pointer p-3 transition-all duration-200 hover:shadow-lg ${cardClass} ${
                  selectedPlayerIds.includes(player.id)
                    ? 'bg-amber-500/15 shadow-[0_0_20px_rgba(245,158,11,0.15)] ring-2 ring-amber-400/80'
                    : isHub
                      ? 'opacity-90 hover:border-white/20 hover:opacity-100'
                      : 'opacity-80 hover:opacity-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <PlayerIcon player={player} size="md" className="h-10 w-10 text-xl" />
                  <div className="flex-grow">
                    <div className="font-semibold">
                      <PlayerName player={player} />
                    </div>
                    <div className="flex items-center gap-1 text-xs opacity-70">
                      <Trophy className="h-3 w-3" /> {t('wins', { count: player.stats.wins })}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCustomizingPlayer(player);
                    }}
                    title={t('customize')}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {!hideRemoveButtons && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        removePlayer(player.id);
                        setSelectedPlayerIds((prev) => prev.filter((id) => id !== player.id));
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>

      <PlayerCustomizer
        player={customizingPlayer}
        open={customizingPlayer !== null}
        onOpenChange={(open) => { if (!open) setCustomizingPlayer(null) }}
        onSave={updatePlayerPreferences}
      />

      <div
        className={`fixed inset-x-0 bottom-0 z-40 border-t px-4 py-3 backdrop-blur-xl ${
          isHub
            ? 'border-white/10 bg-[#07060b]/90'
            : 'border-border bg-background/95'
        }`}
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3 sm:gap-4">
          <p className={`min-w-0 flex-1 text-sm ${canStart ? 'text-white/70' : 'text-orange-400'}`}>
            {canStart
              ? t('selectionStatus.ready', { count: selectedPlayerIds.length })
              : t('selectionStatus.needMore', { min: minPlayers, current: selectedPlayerIds.length })}
          </p>
          <Button
            onClick={handleStartGame}
            disabled={!canStart}
            className="h-11 shrink-0 bg-gradient-to-r from-amber-500 to-orange-500 px-5 font-medium text-white hover:from-amber-600 hover:to-orange-600 disabled:opacity-50"
          >
            {t('startGame')}
          </Button>
        </div>
      </div>
    </>
  );
}
