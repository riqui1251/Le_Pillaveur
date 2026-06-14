'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePlayers } from '@/hooks/usePlayers';
import { Trophy, RotateCcw, Beer, Skull, Heart } from 'lucide-react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { SelectedPlayersDisplay } from '@/components/SelectedPlayersDisplay';
import { useRouter } from '@/i18n/navigation';
import { PlayerName } from '@/components/ui/PlayerName';
import type { PlayerPreferences } from '@/lib/players';

interface GamePlayer {
  id: string;
  name: string;
  isAlive: boolean;
  drinks: number;
  preferences?: PlayerPreferences;
}

export default function RouletteRusse() {
  const t = useTranslations('games.roulette-russe');
  const tCommon = useTranslations('common');
  const { players } = usePlayers();
  const { selectedIds } = useSelectedPlayers();
  const [gamePlayers, setGamePlayers] = useState<GamePlayer[]>([]);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const router = useRouter()

  const [winner, setWinner] = useState<GamePlayer | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [currentResult, setCurrentResult] = useState<boolean>(false);

  useEffect(() => {
    const selected = selectedIds
      .map(id => players.find(p => p.id === id))
      .filter(Boolean)
      .map(p => ({
        id: p!.id,
        name: p!.name,
        isAlive: true,
        drinks: 0,
        preferences: p!.preferences,
      }));
    setGamePlayers(selected);
  }, [players, selectedIds]);

  useEffect(() => {
    if (gamePlayers.length >= 2 && !gameStarted) {
      setGameStarted(true)
    }
  }, [gamePlayers, gameStarted])

  const pullTrigger = () => {
    const hasLost = Math.random() < 1/6;
    setCurrentResult(hasLost);
    setShowResult(true);
    setGamePlayers(prev => {
      const updatedPlayers = prev.map((player, index) => 
        index === currentPlayerIndex 
          ? hasLost
            ? { ...player, isAlive: false }
            : { ...player, drinks: player.drinks + 1 }
          : player
      );
      const alivePlayers = updatedPlayers.filter(p => p.isAlive);
      if (alivePlayers.length === 1) {
        setTimeout(() => {
          setGameOver(true);
          setWinner(alivePlayers[0]);
          confetti();
        }, 2000);
        return updatedPlayers;
      }
      const findNextAlivePlayer = (currentIndex: number) => {
        let nextIndex = (currentIndex + 1) % updatedPlayers.length;
        while (!updatedPlayers[nextIndex].isAlive) {
          nextIndex = (nextIndex + 1) % updatedPlayers.length;
        }
        return nextIndex;
      };
      const nextPlayerIndex = findNextAlivePlayer(currentPlayerIndex);
      setTimeout(() => {
        setShowResult(false);
        setCurrentPlayerIndex(nextPlayerIndex);
      }, 2000);
      return updatedPlayers;
    });
  };

  const resetGame = () => {
    setGamePlayers(prev => prev.map(player => ({ ...player, isAlive: true, drinks: 0 })));
    setGameStarted(true);
    setGameOver(false);
    setCurrentPlayerIndex(0);
    setWinner(null);
    setCurrentResult(false);
    setShowResult(false);
  };

  const goHome = () => {
    router.push('/jeux')
  };

  if (!gameStarted) {
    const selectedPlayers = players.filter(p => selectedIds.includes(p.id));
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-3xl font-bold mb-6 text-center">{t('title')}</h1>
        <div className="max-w-md mx-auto">
          <SelectedPlayersDisplay players={selectedPlayers} />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-center">{t('title')}</h1>
        
        <div className="grid grid-cols-2 gap-4 mb-6">
          {gamePlayers
            .filter(player => player.isAlive)
            .map((player) => (
              <Card 
                key={player.id} 
                className={`p-4 border-2 ${
                  player.id === gamePlayers[currentPlayerIndex]?.id 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-green-500 bg-green-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className={`font-semibold ${
                      player.id === gamePlayers[currentPlayerIndex]?.id 
                        ? 'text-blue-800' 
                        : 'text-green-800'
                    }`}>
                      <PlayerName player={player} />
                    </h3>
                    <div className={`flex items-center gap-2 text-sm ${
                      player.id === gamePlayers[currentPlayerIndex]?.id 
                        ? 'text-blue-600' 
                        : 'text-green-600'
                    }`}>
                      <span>{t('alive')}</span>
                      <Heart className="w-4 h-4 text-red-500" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Beer className="w-5 h-5" />
                    <motion.span 
                      key={player.drinks}
                      initial={{ scale: 1.2, color: "#16a34a" }}
                      animate={{ scale: 1, color: "#166534" }}
                      transition={{ duration: 0.3 }}
                      className="font-semibold"
                    >
                      {player.drinks}
                    </motion.span>
                  </div>
                </div>
              </Card>
            ))}
          
          {gamePlayers
            .filter(player => !player.isAlive)
            .map((player) => (
              <Card key={player.id} className="p-4 opacity-60 bg-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-600">
                      <PlayerName player={player} />
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <span>{t('eliminated')}</span>
                      <Skull className="w-4 h-4 text-gray-500" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Beer className="w-5 h-5" />
                    <span className="font-semibold text-gray-600">{player.drinks}</span>
                  </div>
                </div>
              </Card>
            ))}
        </div>

        {!gameOver ? (
          <div className="text-center">
            <motion.div
              initial={{ scale: 1 }}
              animate={{ scale: showResult ? 1.2 : 1 }}
              transition={{ duration: 0.2 }}
              className="mb-6"
            >
              {showResult ? (
                currentResult ? (
                  <Skull className="w-20 h-20 mx-auto text-red-500" />
                ) : (
                  <Beer className="w-20 h-20 mx-auto text-green-500" />
                )
              ) : (
                <Button onClick={pullTrigger} className="w-full">
                  {t('pull', { name: gamePlayers[currentPlayerIndex]?.name ?? '' })}
                </Button>
              )}
            </motion.div>
          </div>
        ) : (
          <div className="text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, type: "spring" }}
              className="mb-6"
            >
              <Trophy className="w-24 h-24 mx-auto text-yellow-500 mb-4" />
              <h2 className="text-3xl font-bold mb-2">{tCommon('victory')}</h2>
              {winner && (
                <p className="text-xl text-muted-foreground mb-6">
                  {t('lastSurvivor', { name: winner.name })}
                </p>
              )}
            </motion.div>
            
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">{t('recapTitle')}</h3>
              <div className="grid grid-cols-1 gap-2 max-w-md mx-auto">
                {gamePlayers
                  .filter(player => player.isAlive)
                  .map((player) => (
                    <div key={player.id} className="flex items-center justify-between p-3 bg-yellow-100 border-2 border-yellow-500 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-yellow-600" />
                        <span className="font-bold text-yellow-800">
                          <PlayerName player={player} />
                        </span>
                        <Heart className="w-4 h-4 text-red-500" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Beer className="w-4 h-4" />
                        <span className="font-bold text-yellow-800">{t('sipsCount', { count: player.drinks })}</span>
                      </div>
                    </div>
                  ))}
                {gamePlayers
                  .filter(player => !player.isAlive)
                  .sort((a, b) => b.drinks - a.drinks)
                  .map((player) => (
                    <div key={player.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          <PlayerName player={player} />
                        </span>
                        <Skull className="w-4 h-4 text-gray-500" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Beer className="w-4 h-4" />
                        <span className="font-semibold">{t('sipsCount', { count: player.drinks })}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
            
            <div className="flex gap-3">
              <Button onClick={resetGame} className="flex-1">
                <RotateCcw className="w-4 h-4 mr-2" />
                {t('replay')}
              </Button>
              <Button onClick={goHome} variant="outline" className="flex-1">
                {t('home')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
