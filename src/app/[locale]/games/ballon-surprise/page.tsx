'use client';

import React, { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import BalloonSelection from './components/BalloonSelection';
import BalloonRace from './components/BalloonRace';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { GameShell } from '@/components/game/GameShell';
import { usePlayers } from '@/hooks/usePlayers';
import { Player } from '@/lib/players';
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers';

export default function BallonSurprisePage() {
  const t = useTranslations('games.ballon-surprise');
  const { players: allPlayers, updatePlayerStats } = usePlayers();
  const { selectedIds } = useSelectedPlayers();
  const statsFlushedRef = React.useRef(false);
  const [gameStep, setGameStep] = React.useState<'balloonSelection' | 'race' | 'results'>('balloonSelection');

  const [selectedPlayers, setSelectedPlayers] = React.useState<Player[]>([]);
  const [playerChoices, setPlayerChoices] = React.useState<{ [playerId: string]: string }>({});
  const [raceResult, setRaceResult] = React.useState<{ winnerColor: string; sips: number } | null>(null);

  useEffect(() => {
    const selected = selectedIds.map(id => allPlayers.find(p => p.id === id)).filter(Boolean) as Player[];
    setSelectedPlayers(selected);
  }, [allPlayers, selectedIds]);

  const handleBalloonsSelected = (choices: { [playerId: string]: string }) => {
    setPlayerChoices(choices);
    setGameStep('race');
  };

  const handleRaceFinish = (winnerColor: string, sips: number) => {
    setRaceResult({ winnerColor, sips });
    setGameStep('results');
  };

  const winnerPlayer = React.useMemo(() => {
    if (!raceResult) return null;
    const winnerId = Object.keys(playerChoices).find(playerId => playerChoices[playerId] === raceResult.winnerColor);
    return selectedPlayers.find(p => p.id === winnerId) || null;
  }, [raceResult, playerChoices, selectedPlayers]);

  useEffect(() => {
    if (gameStep !== 'results' || !raceResult || statsFlushedRef.current) return;
    if (selectedPlayers.length === 0) return;
    statsFlushedRef.current = true;
    selectedPlayers.forEach(p => {
      updatePlayerStats(p.id, 'ballon-surprise', {
        gamesPlayed: 1,
        wins: winnerPlayer && winnerPlayer.id === p.id ? 1 : 0,
      });
    });
  }, [gameStep, raceResult, selectedPlayers, winnerPlayer, updatePlayerStats]);

  const handleReplay = () => {
    statsFlushedRef.current = false;
    setGameStep('balloonSelection');
    setPlayerChoices({});
    setRaceResult(null);
  };

  return (
    <GameShell title={t('title')} backHref="/jeux" maxWidth={900}>
      {selectedPlayers.length < 2 ? (
        <Card className="p-6 text-center">
          <p className="text-muted-foreground">
            {t('needPlayers')}
          </p>
        </Card>
      ) : (
        <>
          {gameStep === 'balloonSelection' && (
            <BalloonSelection players={selectedPlayers} onBalloonsSelected={handleBalloonsSelected} />
          )}

          {gameStep === 'race' && (
            <BalloonRace playerChoices={playerChoices} onRaceFinish={handleRaceFinish} />
          )}

          {gameStep === 'results' && raceResult && (
            <div className="text-center p-6 bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg shadow-lg">
              <h2 className="text-2xl font-bold mb-4 text-yellow-400">{t('results.title')}</h2>
              <p className="text-xl mb-2">
                {t('results.winnerBalloon', { color: raceResult.winnerColor.toUpperCase() })}
              </p>
              {winnerPlayer ? (
                <p className="text-lg mb-4">
                  {t('results.winnerPlayer', { name: winnerPlayer.name, count: raceResult.sips })}
                </p>
              ) : (
                <p className="text-lg mb-4">
                  {t('results.noWinner', { color: raceResult.winnerColor, count: raceResult.sips })}
                </p>
              )}

              <Button onClick={handleReplay} className="mt-4">
                {t('results.replay')}
              </Button>
            </div>
          )}
        </>
      )}
    </GameShell>
  );
}
