'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

interface BalloonRaceProps {
  playerChoices: { [playerId: string]: string }; // { playerId: balloonColor }
  onRaceFinish: (winnerColor: string, sips: number) => void;
}

const RACE_HEIGHT = 400; // Hauteur de la zone de course en pixels
const MIN_SPEED = 0.5; // Vitesse minimale px/frame
const MAX_SPEED = 1.5; // Vitesse maximale px/frame

export default function BalloonRace({ playerChoices, onRaceFinish }: BalloonRaceProps) {
  const [positions, setPositions] = useState<{ [color: string]: number }>({});
  const [speeds, setSpeeds] = useState<{ [color: string]: number }>({});
  const [winner, setWinner] = useState<string | null>(null);
  const [finalSips, setFinalSips] = useState<number | null>(null);
  const requestRef = useRef<number | undefined>(undefined);
  const startTimeRef = useRef<number | undefined>(undefined);

  // Utiliser les entrées pour avoir playerId et color
  const playerEntries = Object.entries(playerChoices); 

  // Initialisation
  useEffect(() => {
    const initialPositions: { [color: string]: number } = {};
    const initialSpeeds: { [color: string]: number } = {};
    // Utiliser les couleurs uniques pour initialiser les états de position/vitesse par couleur
    const uniqueColors = Array.from(new Set(Object.values(playerChoices)));
    uniqueColors.forEach(color => {
      initialPositions[color] = 0;
      initialSpeeds[color] = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
    });
    setPositions(initialPositions);
    setSpeeds(initialSpeeds);
    setWinner(null);
    setFinalSips(null);
  }, [playerChoices]);

  const animate = useCallback((time: number) => {
    if (startTimeRef.current === undefined) {
      startTimeRef.current = time;
    }

    setPositions(prevPositions => {
      const newPositions = JSON.parse(JSON.stringify(prevPositions)); 
      let detectedWinner: string | null = null;

      for (const color in newPositions) {
        if (speeds[color] === undefined) continue; 
        if (detectedWinner) break; 
        newPositions[color] += speeds[color];
        if (newPositions[color] >= RACE_HEIGHT) {
          newPositions[color] = RACE_HEIGHT;
          if (!winner) {
             detectedWinner = color;
          }
        }
      }

      if (detectedWinner && !winner) {
        setWinner(detectedWinner);
        const sips = Math.floor(Math.random() * 8) + 1;
        setFinalSips(sips);
      }
      return newPositions;
    });

    if (!winner) {
      requestRef.current = requestAnimationFrame(animate);
    }
  }, [winner, speeds]);

  // Effet pour démarrer et arrêter l'animation
  useEffect(() => {
    if (Object.keys(speeds).length > 0 && !winner) {
      requestRef.current = requestAnimationFrame(animate);
    }
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = undefined; 
      }
    };
  }, [speeds, winner, animate]);

  // Effet pour appeler onRaceFinish une fois que le gagnant est défini
  useEffect(() => {
    if (winner && finalSips !== null) {
      onRaceFinish(winner, finalSips);
      // Arrêter l'animation ici aussi par sécurité
      if (requestRef.current) {
         cancelAnimationFrame(requestRef.current);
         requestRef.current = undefined;
      }
    }
  }, [winner, finalSips, onRaceFinish]);

  return (
    <div className="relative w-full border-2 border-dashed border-gray-400 rounded-lg overflow-hidden" style={{ height: `${RACE_HEIGHT + 50}px` }}>
      {/* Ligne d'arrivée */}
      <div 
        className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-green-400 to-blue-500 z-10"
        style={{ top: '1px' }} // Légèrement décalé pour être visible
      ></div>
      <div className="absolute top-1 left-0 right-0 text-center text-xs font-semibold text-white z-20 bg-black/30 py-0.5">
        LIGNE D&apos;ARRIVÉE
      </div>

      {/* Itérer sur les entrées joueur/couleur */}
      {playerEntries.map(([playerId, color], index) => (
        <div
          key={playerId} // Utiliser playerId comme clé unique
          className={`absolute bottom-0 w-10 h-12 rounded-full bg-${color}-500 shadow-lg transition-transform duration-100 ease-linear`}
          style={{
            // Calculer la position gauche basée sur l'index du joueur dans la liste des entrées
            left: `${(index * (100 / playerEntries.length)) + (50 / playerEntries.length)}%`, 
            transform: `translateY(-${positions[color] || 0}px) translateX(-50%)`, // La position verticale dépend toujours de la couleur
            clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
          }}
        >
          {/* TODO: Ajouter le nom du joueur si désiré */}
        </div>
      ))}

      {/* Affichage simple du gagnant pour le débogage */}
      {/* {winner && <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/70 text-white p-4 rounded">Gagnant: {winner}</div>} */}
    </div>
  );
} 