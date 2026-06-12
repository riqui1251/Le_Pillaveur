"use client"

import { useRequireSelectedPlayers } from "@/hooks/useRequireSelectedPlayers"

export default function GamesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  useRequireSelectedPlayers()

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1400px] flex-1 px-2 py-1 sm:px-4">
      <div className="flex min-h-0 w-full flex-1 flex-col space-y-3 rounded-md bg-gray-900 p-2 text-white sm:space-y-6 sm:rounded-xl sm:p-6">
        {children}
      </div>
    </div>
  )
} 