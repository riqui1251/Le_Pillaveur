"use client"

import { useCallback, useEffect, useState } from 'react'
import { isSoundMuted, setSoundMuted, playGameSound, type GameSound } from '@/lib/sound/game-sounds'

/** Sons de jeu + toggle mute persistant (localStorage), sûr côté SSR. */
export function useGameSounds() {
  const [muted, setMuted] = useState(true)

  useEffect(() => {
    setMuted(isSoundMuted())
  }, [])

  const toggleMuted = useCallback(() => {
    setMuted((cur) => {
      setSoundMuted(!cur)
      return !cur
    })
  }, [])

  const play = useCallback((name: GameSound) => playGameSound(name), [])

  return { muted, toggleMuted, play }
}
