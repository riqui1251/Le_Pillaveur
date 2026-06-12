import { useState } from 'react';
import { usePlayers } from '../hooks/usePlayers';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { X, Trophy, Pencil } from 'lucide-react';
import { PlayerIcon } from '@/components/ui/PlayerIcon';
import { PlayerName } from '@/components/ui/PlayerName';
import { PlayerCustomizer } from '@/components/ui/PlayerCustomizer';
import { Player } from '@/lib/players';

interface PlayerManagerProps {
  onPlayersSelected: (selectedPlayers: string[]) => void;
  minPlayers?: number;
  hideRemoveButtons?: boolean;
  variant?: 'default' | 'hub';
}

const HUB_CARD = 'bg-white/[0.04] border-white/10 backdrop-blur-md shadow-lg';

export function PlayerManager({ onPlayersSelected, minPlayers = 2, hideRemoveButtons = false, variant = 'default' }: PlayerManagerProps) {
  const isHub = variant === 'hub';
  const cardClass = isHub ? HUB_CARD : 'shadow-md';
  const { players, loading, addPlayer, removePlayer, updatePlayerPreferences } = usePlayers();

  const [newPlayerName, setNewPlayerName] = useState('');
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [customizingPlayer, setCustomizingPlayer] = useState<Player | null>(null);

  const handleAddPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerName.trim()) return;

    addPlayer(newPlayerName.trim());
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

  if (loading) {
    return (
      <div className={`flex items-center justify-center rounded-2xl border p-12 ${isHub ? HUB_CARD : ''}`}>
        <div className="flex flex-col items-center gap-3 text-white/70">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
          <p>Chargement des joueurs…</p>
        </div>
      </div>
    );
  }

  const canStart = selectedPlayerIds.length >= minPlayers;

  return (
    <>
      <div className="space-y-6 pb-28">
        <Card className={`p-4 ${cardClass}`}>
          <h2 className="mb-4 text-lg font-semibold md:text-xl">Ajouter un joueur</h2>
          <form onSubmit={handleAddPlayer} className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                type="text"
                placeholder="Nom du joueur"
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                className="flex-grow"
              />
              <Button type="submit" disabled={!newPlayerName.trim()} className="w-full sm:w-auto">
                Ajouter
              </Button>
            </div>
          </form>
        </Card>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold md:text-xl">Sélectionner les joueurs</h2>
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
                      <Trophy className="h-3 w-3" /> {player.stats.wins} victoires
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
                    title="Personnaliser"
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
              ? `${selectedPlayerIds.length} joueur${selectedPlayerIds.length > 1 ? 's' : ''} sélectionné${selectedPlayerIds.length > 1 ? 's' : ''}`
              : `Sélectionnez au moins ${minPlayers} joueurs (${selectedPlayerIds.length}/${minPlayers})`}
          </p>
          <Button
            onClick={handleStartGame}
            disabled={!canStart}
            className="h-11 shrink-0 bg-gradient-to-r from-amber-500 to-orange-500 px-5 font-medium text-white hover:from-amber-600 hover:to-orange-600 disabled:opacity-50"
          >
            Commencer la partie
          </Button>
        </div>
      </div>
    </>
  );
}
