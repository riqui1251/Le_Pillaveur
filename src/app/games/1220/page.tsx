"use client"

import { useState } from "react"
import { usePlayers } from "@/hooks/usePlayers"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { User, Home } from "lucide-react"
import Link from "next/link"
import Game from "./components/game"
import { useSelectedPlayers } from "@/hooks/useSelectedPlayers"
import { SelectedPlayersDisplay } from "@/components/SelectedPlayersDisplay"

export default function Game1220Page() {
  const { players } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const [gameStarted, setGameStarted] = useState(false)
  const [activeTab, setActiveTab] = useState("players")

  const selectedPlayers = players.filter((p) => selectedIds.includes(p.id))

  const handleGameEnd = () => {
    setGameStarted(false)
    setActiveTab("players")
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">1220</h1>
        <Link href="/">
          <Button variant="outline" size="icon">
            <Home className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="players">
            <User className="mr-2 h-4 w-4" />
            Paris
          </TabsTrigger>
          <TabsTrigger value="game" disabled={!gameStarted}>
            Jeu
          </TabsTrigger>
        </TabsList>

        <TabsContent value="players" className="space-y-4">
          <SelectedPlayersDisplay players={selectedPlayers} />
          <Card className="p-4 border-white/10 bg-white/5">
            <p className="text-sm text-white/85 mb-4">
              Deux dés : un <strong>d12</strong> et un <strong>d20</strong>. La{" "}
              <strong>somme</strong> fait de 2 à 32. Au moins deux joueurs
              sélectionnés sur la page d’accueil.
            </p>
            <Button
              className="w-full"
              disabled={selectedPlayers.length < 2}
              onClick={() => {
                setGameStarted(true)
                setActiveTab("game")
              }}
            >
              Commencer
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="game">
          {gameStarted && (
            <Game players={selectedPlayers} onGameEnd={handleGameEnd} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
