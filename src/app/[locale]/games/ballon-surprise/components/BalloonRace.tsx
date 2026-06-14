'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';

interface BalloonRaceProps {
  playerChoices: { [playerId: string]: string };
  onRaceFinish: (winnerColor: string, sips: number) => void;
}

const RACE_HEIGHT = 400;
const MIN_SPEED = 0.5;
const MAX_SPEED = 1.5;

export default function BalloonRace({ playerChoices, onRaceFinish }: BalloonRaceProps) {
  const t = useTranslations('games.ballon-surprise');
  const [positions, setPositions] = useState<{ [color: string]: number }>({});
  const [speeds, setSpeeds] = useState<{ [color: string]: number }>({});
  const [winner, setWinner] = useState<string | null>(null);
  const [finalSips, setFinalSips] = useState<number | null>(null);
  const requestRef = useRef<number | undefined>(undefined);
  const startTimeRef = useRef<number | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [raceHeightPx, setRaceHeightPx] = useState<number>(RACE_HEIGHT);

  const playerEntries = Object.entries(playerChoices);

  useEffect(() => {
    const initialPositions: { [color: string]: number } = {};
    const initialSpeeds: { [color: string]: number } = {};
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
        if (newPositions[color] >= raceHeightPx) {
          newPositions[color] = raceHeightPx;
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
  }, [winner, speeds, raceHeightPx]);

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

  useEffect(() => {
    if (winner && finalSips !== null) {
      onRaceFinish(winner, finalSips);
      if (requestRef.current) {
         cancelAnimationFrame(requestRef.current);
         requestRef.current = undefined;
      }
    }
  }, [winner, finalSips, onRaceFinish]);

  useEffect(() => {
    const computeHeight = () => {
      const ideal = Math.round(window.innerHeight * 0.6);
      const clamped = Math.max(300, Math.min(ideal, 520));
      setRaceHeightPx(clamped);
    };
    computeHeight();
    window.addEventListener('resize', computeHeight);
    return () => window.removeEventListener('resize', computeHeight);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full border-2 border-dashed border-gray-400 rounded-lg overflow-hidden"
      style={{ height: `${raceHeightPx + 50}px` }}
    >
      <div 
        className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-green-400 to-blue-500 z-10"
        style={{ top: '1px' }}
      ></div>
      <div className="absolute top-1 left-0 right-0 text-center text-xs font-semibold text-white z-20 bg-black/30 py-0.5">
        {t('finishLine')}
      </div>

      {playerEntries.map(([playerId, color], index) => (
        <div
          key={playerId}
          className={`absolute bottom-0 w-8 h-10 sm:w-10 sm:h-12 rounded-full bg-${color}-500 shadow-lg transition-transform duration-100 ease-linear`}
          style={{
            left: `${(index * (100 / playerEntries.length)) + (50 / playerEntries.length)}%`, 
            transform: `translateY(-${positions[color] || 0}px) translateX(-50%)`,
            clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
          }}
        >
        </div>
      ))}
    </div>
  );
}
