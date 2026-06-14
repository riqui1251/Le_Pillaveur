#!/usr/bin/env python3
"""Post-process machine translations for natural party-game UI copy."""

from __future__ import annotations

import json
from pathlib import Path

MESSAGES = Path(__file__).resolve().parents[1] / "messages"

PATCHES: dict[str, dict] = {
    "en.json": {
        "common.next": "Next",
        "common.validate": "Confirm…",
        "nav.pages.achievements.title": "Achievements",
        "nav.pages.achievements.subtitle": "Unlocked trophies",
        "nav.pages.stats.subtitle": "History",
        "nav.legal.confidentialite": "Privacy",
        "achievements.title": "Achievements",
        "common.playerCount": "{count, plural, one {# player} other {# players}}",
        "common.gameCount": "{count, plural, one {# game} other {# games}}",
        "common.sipsCount": "{count, plural, one {# sip} other {# sips}}",
        "common.turnCount": "{count, plural, one {# turn} other {# turns}}",
        "hub.selectedPlayers.ready": "{count, plural, one {# player ready} other {# players ready}}",
        "players.selectionStatus.ready": "{count, plural, one {# player selected} other {# players selected}}",
        "games.monsieur-3.sipsDrunk": "{count, plural, one {sip taken} other {sips taken}}",
        "games.catalog.pmu.title": "PMU Race",
        "games.catalog.pmu.description": "A friendly horse-racing betting game",
        "games.catalog.petit-buveur.title": "The Little Drinker",
        "games.catalog.roulette-russe.description": "A game of chance where each player takes a turn. Survive or drink!",
        "auth.register.termsPrefix": "I accept the",
        "auth.register.termsAnd": "and the",
        "feedback.dialogDescription": "Report a bug, suggest an improvement, or leave a comment. Thanks for helping us improve Le Pillaveur.",
    },
    "es.json": {
        "common.save": "Guardar",
        "common.close": "Cerrar",
        "common.next": "Siguiente",
        "common.validate": "Validar…",
        "nav.openMenu": "Abrir menú",
        "nav.pages.classement.title": "Clasificación",
        "nav.pages.achievements.title": "Logros",
        "nav.pages.achievements.subtitle": "Trofeos desbloqueados",
        "nav.pages.stats.title": "Estadísticas",
        "nav.pages.stats.subtitle": "Historial",
        "achievements.title": "Logros",
        "common.playerCount": "{count, plural, one {# jugador} other {# jugadores}}",
        "common.gameCount": "{count, plural, one {# juego} other {# juegos}}",
        "common.sipsCount": "{count, plural, one {# trago} other {# tragos}}",
        "common.turnCount": "{count, plural, one {# turno} other {# turnos}}",
        "hub.selectedPlayers.ready": "{count, plural, one {# jugador listo} other {# jugadores listos}}",
        "players.selectionStatus.ready": "{count, plural, one {# jugador seleccionado} other {# jugadores seleccionados}}",
        "games.monsieur-3.sipsDrunk": "{count, plural, one {trago bebido} other {tragos bebidos}}",
        "games.catalog.pmu.title": "Carrera PMU",
        "games.catalog.petit-buveur.title": "El Pequeño Bebedor",
        "games.catalog.roue-des-gorgees.description": "¡Añade tragos/acciones y gira la ruleta!",
        "hub.jeux.subtitle": "De clásicos a novedades — encuentra el ambiente perfecto para tu fiesta.",
    },
    "it.json": {
        "common.cancel": "Annulla",
        "common.confirm": "Conferma",
        "common.close": "Chiudi",
        "common.next": "Avanti",
        "common.validate": "Conferma…",
        "nav.pages.achievements.title": "Obiettivi",
        "nav.pages.achievements.subtitle": "Trofei sbloccati",
        "achievements.title": "Obiettivi",
        "common.playerCount": "{count, plural, one {# giocatore} other {# giocatori}}",
        "common.gameCount": "{count, plural, one {# gioco} other {# giochi}}",
        "common.sipsCount": "{count, plural, one {# sorso} other {# sorsi}}",
        "common.turnCount": "{count, plural, one {# turno} other {# turni}}",
        "hub.selectedPlayers.ready": "{count, plural, one {# giocatore pronto} other {# giocatori pronti}}",
        "players.selectionStatus.ready": "{count, plural, one {# giocatore selezionato} other {# giocatori selezionati}}",
        "games.monsieur-3.sipsDrunk": "{count, plural, one {sorso bevuto} other {sorsi bevuti}}",
        "games.catalog.pmu.title": "Corsa PMU",
        "games.catalog.petit-buveur.title": "Il Piccolo Bevitore",
        "hub.jeux.subtitle": "Dai classici alle novità — trova l'atmosfera perfetta per la tua serata.",
    },
}


def set_path(obj: dict, path: str, value: str) -> None:
    parts = path.split(".")
    cur = obj
    for part in parts[:-1]:
        cur = cur[part]
    cur[parts[-1]] = value


def main() -> None:
    for filename, patches in PATCHES.items():
        path = MESSAGES / filename
        data = json.loads(path.read_text(encoding="utf-8"))
        for dot_path, value in patches.items():
            set_path(data, dot_path, value)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Patched {filename}: {len(patches)} entries")


if __name__ == "__main__":
    main()
