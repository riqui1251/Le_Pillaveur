'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Player } from '@/lib/players'; // Importer le type Player
import { CheckCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Définir les couleurs de ballon disponibles
const balloonColors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan'];

interface BalloonSelectionProps {
  players: Player[]; // Recevoir la liste des objets Player
  onBalloonsSelected: (choices: { [playerId: string]: string }) => void;
}

export default function BalloonSelection({ players, onBalloonsSelected }: BalloonSelectionProps) {
  const [choices, setChoices] = useState<{ [playerId: string]: string }>({});
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(players.length > 0 ? players[0].id : null); // Sélectionner le premier joueur par défaut

  // Mettre à jour le joueur sélectionné si la liste change (ex: retour arrière)
  useEffect(() => {
    if (!selectedPlayerId && players.length > 0) {
      setSelectedPlayerId(players[0].id);
    }
    if (selectedPlayerId && !players.some(p => p.id === selectedPlayerId)) {
      setSelectedPlayerId(players.length > 0 ? players[0].id : null);
    }
  }, [players, selectedPlayerId]);

  const handleColorSelect = (color: string) => {
    if (!selectedPlayerId) return;

    const newChoices = { ...choices, [selectedPlayerId]: color };
    setChoices(newChoices);
  };

  const allPlayersAssigned = players.length > 0 && players.every(player => choices[player.id] !== undefined);

  return (
    <TooltipProvider delayDuration={100}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {/* Colonne Joueurs */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Joueurs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {players.map((player) => {
              const isSelected = player.id === selectedPlayerId;
              const assignedColor = choices[player.id];
              return (
                <div
                  key={player.id}
                  onClick={() => setSelectedPlayerId(player.id)}
                  className={`flex items-center p-3 rounded-lg cursor-pointer transition-all duration-150 ${isSelected ? 'bg-amber-500/20 ring-2 ring-amber-500' : 'hover:bg-gray-700/50'}`}
                >
                  <Avatar className="h-9 w-9 mr-3">
                    {player.preferences.avatar && <AvatarImage src={player.preferences.avatar} alt={player.name} />}
                    <AvatarFallback className={`bg-${player.preferences.color}-500 text-white`}>
                      {player.name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-grow font-medium">{player.name}</span>
                  {assignedColor ? (
                    <div className={`w-5 h-5 rounded-full bg-${assignedColor}-500 ring-1 ring-white/50 shadow-sm`} />
                  ) : isSelected ? (
                    <CheckCircle className="w-5 h-5 text-amber-500 animate-pulse" />
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Colonne Sélection Ballon */}
        <div className="md:col-span-2 space-y-4">
          <h2 className="text-xl font-semibold text-center mb-4">
            {selectedPlayerId ? `Au tour de ${players.find(p => p.id === selectedPlayerId)?.name}, choisis ton ballon :` : "Sélectionnez un joueur"}
          </h2>
          <div className="grid grid-cols-4 gap-4">
            {balloonColors.map((color) => {
              const playersWithThisColor = players.filter(p => choices[p.id] === color);
              return (
                <Tooltip key={color}>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={() => handleColorSelect(color)}
                      disabled={!selectedPlayerId}
                      className={`relative bg-${color}-500 hover:bg-${color}-600 text-white p-4 rounded-full aspect-square transition-opacity duration-200 group flex items-center justify-center ${!selectedPlayerId ? 'opacity-50 cursor-not-allowed' : ''}`}
                      aria-label={`Ballon ${color}`}
                    >
                      {playersWithThisColor.length > 0 && (
                        <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 flex space-x-1">
                          {playersWithThisColor.slice(0, 3).map(p => (
                            <Avatar key={p.id} className="h-4 w-4 border border-black/50">
                              <AvatarFallback className={`bg-${p.preferences.color}-500 text-white text-[8px] leading-none`}>
                                {p.name.substring(0, 1)}
                              </AvatarFallback>
                            </Avatar>
                          ))}
                          {playersWithThisColor.length > 3 && (
                            <div className="flex items-center justify-center h-4 w-4 rounded-full bg-gray-600 text-white text-[8px] border border-black/50">
                              +{playersWithThisColor.length - 3}
                            </div>
                          )}
                        </div>
                      )}
                    </Button>
                  </TooltipTrigger>
                  {playersWithThisColor.length > 0 && (
                    <TooltipContent className="bg-black text-white border-slate-700">
                      <p>{playersWithThisColor.map(p => p.name).join(', ' )}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              );
            })}
          </div>
          
          <Button 
            onClick={() => onBalloonsSelected(choices)}
            disabled={!allPlayersAssigned}
            className="w-full mt-6 py-3 text-lg"
          >
            Commencer la Course !
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
} 