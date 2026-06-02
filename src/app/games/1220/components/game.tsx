"use client"

import { useCallback, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Player } from "@/lib/players"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { PlayerName } from "@/components/ui/PlayerName"
import {
  type Band1220,
  type Choices1220,
  type Parity1220,
  evaluatePlayerRoll1220,
  formatSips,
  TOTAL_MAX,
  TOTAL_MIN,
} from "@/lib/game-1220"
import { Dices } from "lucide-react"

type Phase = "setup" | "play"

export type Player1220Config = Choices1220 & { playerId: string; name: string }

interface GameProps {
  players: Player[]
  onGameEnd: () => void
}

const BANDS: { value: Band1220; label: string }[] = [
  { value: "2-10", label: "2 à 10" },
  { value: "11-20", label: "11 à 20" },
  { value: "21-30", label: "21 à 30" },
]

const numberOptions = Array.from(
  { length: TOTAL_MAX - TOTAL_MIN + 1 },
  (_, i) => TOTAL_MIN + i
)

function defaultChoices(): Choices1220 {
  return {
    parity: "pair",
    band: "11-20",
    drinkNumber: 7,
    giveNumber: 13,
  }
}

export default function Game1220({ players, onGameEnd }: GameProps) {
  const [phase, setPhase] = useState<Phase>("setup")
  const [draft, setDraft] = useState<Record<string, Choices1220>>(() => {
    const init: Record<string, Choices1220> = {}
    for (const p of players) init[p.id] = defaultChoices()
    return init
  })
  const [configs, setConfigs] = useState<Player1220Config[] | null>(null)
  const [d12, setD12] = useState(1)
  const [d20, setD20] = useState(1)
  const [rolling, setRolling] = useState(false)
  const [history, setHistory] = useState<
    {
      d12: number
      d20: number
      results: { name: string; config: Player1220Config; text: string[] }[]
    }[]
  >([])

  const updateDraft = useCallback(
    (id: string, patch: Partial<Choices1220>) => {
      setDraft((d) => ({
        ...d,
        [id]: { ...d[id], ...patch },
      }))
    },
    []
  )

  const setupValid = useMemo(() => {
    return players.every((p) => {
      const c = draft[p.id]
      if (!c) return false
      return (
        c.drinkNumber !== c.giveNumber &&
        c.drinkNumber >= TOTAL_MIN &&
        c.drinkNumber <= TOTAL_MAX &&
        c.giveNumber >= TOTAL_MIN &&
        c.giveNumber <= TOTAL_MAX
      )
    })
  }, [players, draft])

  const startPlay = () => {
    if (!setupValid) return
    const list: Player1220Config[] = players.map((p) => ({
      playerId: p.id,
      name: p.name,
      ...draft[p.id],
    }))
    setConfigs(list)
    setPhase("play")
  }

  const roll = () => {
    if (rolling || !configs) return
    setRolling(true)
    window.setTimeout(() => {
      const a = Math.floor(Math.random() * 12) + 1
      const b = Math.floor(Math.random() * 20) + 1
      setD12(a)
      setD20(b)
      const sum = a + b

      const results = configs.map((cfg) => {
        const r = evaluatePlayerRoll1220(a, b, cfg)
        const lines: string[] = []
        if (r.drinkSips > 0) {
          lines.push(`Boit : somme = chiffre fait boire (${cfg.drinkNumber}).`)
        }
        if (r.giveRawCount > 0) {
          for (const gr of r.giveReasons) {
            lines.push(`Donne à boire : ${gr.label}.`)
          }
          if (r.partialHit) {
            lines.push(
              `Nombre sur un dé (${r.partialNumbers.join(", ")}) sans que la somme soit ce nombre → les donnes comptent pour la moitié : ${formatSips(r.giveEffective)} gorgée(s) à distribuer (au lieu de ${r.giveRawCount}).`
            )
          } else {
            lines.push(
              `Total : ${formatSips(r.giveEffective)} gorgée(s) à distribuer.`
            )
          }
        } else if (r.partialHit) {
          lines.push(
            `Tes chiffres apparaissent sur un dé (${r.partialNumbers.join(", ")}) mais pas en somme (${sum}) — sans autre déclencheur « donne », rien à distribuer ce coup.`
          )
        }
        if (lines.length === 0) {
          lines.push("Rien pour toi sur ce lancer.")
        }
        return { name: cfg.name, config: cfg, text: lines }
      })

      setHistory((h) => [{ d12: a, d20: b, results }, ...h].slice(0, 12))
      setRolling(false)
    }, 700)
  }

  const total = d12 + d20

  if (phase === "setup") {
    return (
      <div className="space-y-4">
        <Card className="p-4 border-white/10 bg-white/5">
          <p className="text-sm text-white/85 leading-relaxed">
            Chaque joueur choisit une <strong>parité</strong> (pair / impair de
            la <strong>somme</strong>), une <strong>plage</strong> pour la
            somme (2–10, 11–20 ou 21–30), un <strong>chiffre fait boire</strong>{" "}
            (tu bois si la somme = ce chiffre) et un{" "}
            <strong>chiffre donne à boire</strong> (tu distribues si la somme =
            ce chiffre, en plus des matchs parité / plage). Si l’un de tes deux
            chiffres sort sur le dé 12 ou 20 mais que la <strong>somme</strong>{" "}
            n’est pas ce chiffre, les obligations « donne à boire » de ce lancer
            sont <strong>divisées par deux</strong>.
          </p>
        </Card>

        {players.map((p) => {
          const c = draft[p.id] ?? defaultChoices()
          const clash = c.drinkNumber === c.giveNumber
          return (
            <Card key={p.id} className="p-4 border-white/10 bg-white/5 space-y-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={p.preferences?.avatar} alt="" />
                  <AvatarFallback>
                    {p.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <PlayerName player={p} className="font-semibold text-lg" />
              </div>

              <div className="space-y-2">
                <Label className="text-white/90">Parité (sur la somme)</Label>
                <RadioGroup
                  value={c.parity}
                  onValueChange={(v) =>
                    updateDraft(p.id, { parity: v as Parity1220 })
                  }
                  className="flex flex-wrap gap-4"
                >
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <RadioGroupItem value="pair" id={`${p.id}-pair`} />
                    Pair
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <RadioGroupItem value="impair" id={`${p.id}-impair`} />
                    Impair
                  </label>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label className="text-white/90">Plage de la somme</Label>
                <RadioGroup
                  value={c.band}
                  onValueChange={(v) =>
                    updateDraft(p.id, { band: v as Band1220 })
                  }
                  className="flex flex-col gap-2"
                >
                  {BANDS.map((b) => (
                    <label
                      key={b.value}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <RadioGroupItem value={b.value} id={`${p.id}-${b.value}`} />
                      {b.label}
                    </label>
                  ))}
                </RadioGroup>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor={`${p.id}-drink`}>Chiffre fait boire</Label>
                  <Select
                    value={String(c.drinkNumber)}
                    onValueChange={(v) =>
                      updateDraft(p.id, { drinkNumber: Number(v) })
                    }
                  >
                    <SelectTrigger id={`${p.id}-drink`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {numberOptions.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${p.id}-give`}>Chiffre donne à boire</Label>
                  <Select
                    value={String(c.giveNumber)}
                    onValueChange={(v) =>
                      updateDraft(p.id, { giveNumber: Number(v) })
                    }
                  >
                    <SelectTrigger id={`${p.id}-give`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {numberOptions.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {clash && (
                <p className="text-sm text-amber-400">
                  Les deux chiffres doivent être différents.
                </p>
              )}
            </Card>
          )
        })}

        <Button
          className="w-full"
          size="lg"
          disabled={!setupValid}
          onClick={startPlay}
        >
          Valider les paris et lancer la partie
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="p-6 border-white/10 bg-gradient-to-br from-violet-950/80 to-slate-900/80">
        <div className="flex flex-col items-center gap-4">
          <div className="flex flex-wrap items-center justify-center gap-6">
            <div className="text-center">
              <div className="text-xs uppercase tracking-wide text-white/50 mb-1">
                Dé 12
              </div>
              <div
                className={`w-20 h-20 rounded-xl border-2 border-amber-400/60 bg-amber-500/10 flex items-center justify-center text-4xl font-bold ${rolling ? "animate-pulse" : ""}`}
              >
                {d12}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs uppercase tracking-wide text-white/50 mb-1">
                Dé 20
              </div>
              <div
                className={`w-20 h-20 rounded-xl border-2 border-cyan-400/60 bg-cyan-500/10 flex items-center justify-center text-4xl font-bold ${rolling ? "animate-pulse" : ""}`}
              >
                {d20}
              </div>
            </div>
          </div>
          <div className="text-center">
            <span className="text-white/60 text-sm">Somme</span>
            <div className="text-3xl font-bold text-white">{total}</div>
          </div>
          <Button
            size="lg"
            onClick={roll}
            disabled={rolling}
            className="gap-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500"
          >
            <Dices className="h-5 w-5" />
            {rolling ? "Lancer…" : "Lancer les dés"}
          </Button>
        </div>
      </Card>

      {history.length > 0 && (
        <Card className="p-4 border-white/10 bg-white/5 space-y-4">
          <h3 className="font-semibold text-white">Dernier lancer</h3>
          <p className="text-sm text-white/70">
            D12 = {history[0].d12}, D20 = {history[0].d20}, somme ={" "}
            {history[0].d12 + history[0].d20}
          </p>
          <ul className="space-y-3">
            {history[0].results.map((r) => (
              <li
                key={r.config.playerId}
                className="rounded-lg border border-white/10 p-3 bg-black/20"
              >
                <PlayerName
                  player={r.name}
                  className="font-medium text-amber-200 mb-2 block"
                />
                <ul className="text-sm text-white/85 space-y-1 list-disc pl-4">
                  {r.text.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {history.length > 1 && (
        <details className="text-sm text-white/60">
          <summary className="cursor-pointer py-2">Historique</summary>
          <ul className="space-y-2 mt-2 pl-2 border-l border-white/10">
            {history.slice(1).map((h, idx) => (
              <li key={idx}>
                {h.d12}+{h.d20}={h.d12 + h.d20}
              </li>
            ))}
          </ul>
        </details>
      )}

      <Button variant="outline" className="w-full border-white/20" onClick={onGameEnd}>
        Quitter le jeu
      </Button>
    </div>
  )
}
