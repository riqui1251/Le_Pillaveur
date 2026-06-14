import React from 'react';
import { Player } from '@/lib/players';
import { isSpecialPlayer, getSpecialEffectClass } from '@/lib/playerUtils';
import { cn } from '@/lib/utils';

export { isSpecialPlayer, getSpecialEffectClass };

interface PlayerNameProps {
  player: Player | string | { name: string; preferences?: { specialEffect?: string | null } };
  className?: string;
}

function cleanClassNameForEffect(className: string): string {
  return className
    .split(/\s+/)
    .filter((token) => token && !token.startsWith('text-') && token !== 'block')
    .join(' ');
}

export function PlayerName({ player, className = '' }: PlayerNameProps) {
  const effectClass = getSpecialEffectClass(player);
  const playerName = typeof player === 'string' ? player : player?.name;
  const hasEffect = Boolean(effectClass);
  const finalClass = effectClass || 'player-name-default';

  const resolvedClassName = hasEffect
    ? cleanClassNameForEffect(className)
    : className.replace(/\bblock\b/g, 'inline-block');

  return (
    <span
      className={cn(
        'player-name',
        hasEffect && 'player-name-special',
        finalClass,
        resolvedClassName
      )}
    >
      {playerName}
    </span>
  );
}
