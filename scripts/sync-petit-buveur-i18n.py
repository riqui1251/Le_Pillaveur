import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'messages'

translations = {
    'en': {
        'shameDice': {'diceLabel': 'Die: {value}'},
        'game': {
            'title': 'The Little Drinker', 'back': 'Back', 'turn': 'Turn {count}', 'turnOf': 'Turn of',
            'turnShort': 'Turn', 'ranking': 'Ranking', 'caseLabel': 'Square {number}', 'loading': 'Loading game…',
            'drinksShort': '{count} sip(s)', 'turnsRemaining': '{count} turn(s)', 'next': 'Next', 'continue': 'Continue',
            'close': 'Close', 'replay': 'Play again',
            'victory': {'winner': 'Winner!', 'wonGame': 'won the game 🎉', 'turns': 'Turns', 'players': 'Players', 'difficulty': 'Difficulty'},
            'target': {'title': 'Who to target?', 'hint': 'The square effect will be revealed after your choice', 'random': 'Random player', 'me': 'Me —'},
            'history': {'title': 'Last action', 'selfTarget': '(self / no target)'},
            'duel': {'winnerStays': '{winner} wins and stays · {loser} moves back one square', 'opponentWins': '{winner} wins · {loser} moves back one square'},
            'dialogs': {
                'teleportPrompt': 'Swap your position with:', 'teleportLeader': '🏆 1st in ranking ({name})', 'teleportLast': '🐢 Last place ({name})',
                'votePrompt': 'Hands up — who drinks {count} sips?', 'shameDiceRules': '1–2 safe · 3–4 sips · 5 advance · 6 back',
                'rollD6': 'Roll the D6', 'diceRolling': 'The die is rolling…', 'coinChooses': '{player} chooses heads or tails',
                'coinChoice': 'Choice: {choice}', 'drinksToTake': '{count} sip(s) to drink', 'coinSpinning': 'The coin is spinning…',
                'chancePrompt': 'Choose your action:', 'chanceReroll': '🎲 Roll the die again', 'chanceAdvance': '➡️ Move forward 2 squares',
                'chainTitle': 'Chain challenge', 'chainPrompt': 'Choose your partner for {count} linked turns', 'chainChooser': '{player} chooses',
                'exchangePrompt': 'Choose a player to swap positions with:',
            },
            'effects': {
                'skipTurn': 'Skip your turn', 'skipTurnDesc': 'Will automatically skip next turn', 'anchor': 'Anchor',
                'anchorDesc': 'Cannot advance next turn', 'mirrorDesc': 'When one drinks, the other too ({a} ↔ {b})',
                'mirrorDescShort': 'When one drinks, the other too', 'protectedStatus': '{player} is protected',
                'cursedStatus': '{player} is cursed ({count} turns)', 'chainStatus': '{from} → {to} ({count} turns)',
            },
            'wheel': {'defis': 'Challenge wheel', 'drinks': 'Sip wheel', 'turnOf': 'Turn of {player}', 'spin': 'Spin the wheel', 'spinning': 'The wheel is spinning…', 'legend': 'Legend'},
            'outcomes': {
                'skipTurn': '⏭️ {player} automatically skips this turn.', 'teleport': '🌀 {actor} swaps place with {partner} ({rank} in ranking)!',
                'teleportLeader': '1st', 'teleportLast': 'last', 'voteProtected': '🗳️ Vote: {player} {protected}', 'voteDrink': '🗳️ Vote: {player} drinks {count} sip(s)!',
                'pileFaceWin': '🪙 Heads or tails: {player} chose {choice}, draw {result} — safe!', 'pileFaceLose': '🪙 Heads or tails: draw {result}, {player} drinks {count} sip(s)!',
                'duelChallengerWins': '⚔️ Duel over: {challenger} wins (stays), {opponent} moves back one square.', 'duelOpponentWins': '⚔️ Duel over: {opponent} wins, {challenger} moves back one square.',
                'challengeSuccess': '✅ {player} completed the challenge!', 'challengeDrink': '🍺 {player} drank {count} sip(s)!',
                'noPreviousCase': 'No previous square, you are safe!', 'safeCase': 'Safe square! Player {player} is safe this turn.',
                'trap': '🕳️ Trap! {player} drinks {count} sip(s) (position {position})!', 'trapWithMessage': '🕳️ Trap! {player} drinks {count} sip(s) (position {position}) {message}',
                'move': '{arrow} {player} moves from square {from} to square {to}!', 'drinks': '{player} drinks {count} sip(s)!',
                'bombe': '💣 {player} triggered a bomb! Everyone drinks {count} sip(s), but {name} drinks double!',
                'protectionApplied': '🛡️ {player} is protected for a full round (everyone else plays once)!',
                'miroirSwap': '🪞 {player} swapped all positions! (first ↔ last)', 'trapProtected': '🕳️ Trap! {player} should have drunk {count} sip(s) (position {position}) but {protected}',
                'doublePeine': '💥 {player} drinks {count} sips (double penalty)!', 'copie': '👯 {player} copies the die ({delta}): square {from} → {to}!',
                'rouletteProtected': '🔫 {player} {protected}', 'rouletteMiss': '🔫 Miss! {player} drinks {count} sips!',
                'inversion': '🔃 Inversion! {last} (last) drinks {count} sip(s) instead of {player}!',
                'mirrorLink': '🪞 {actor} is linked to {target}: when one drinks, the other too ({count} turn(s) from {actor})!',
                'rewindSafe': '⏪ No previous square — {player} is safe!', 'melange': '🔀 {player} shuffled all positions!',
                'genericApplied': 'Square {type} applied to {player}', 'chainLinked': '🔗 {actor} → {target} — linked for {count} turns!',
                'chanceAdvance': '🍀 Luck: {player} moves forward 2 squares (square {case})!', 'exchange': '🔄 {a} and {b} swapped positions!',
                'everyoneDrinksHonor': 'Everyone drinks {count} sip(s) to honor "{compliment}"', 'everyoneDrinksExcept': 'Everyone drinks {count} sip(s) except',
                'wheelDefi': '🎭 Challenge: {label}!', 'wheelDefiDrink': '{player} drinks {count} sips.', 'wheelDefiPlay': '{player} — your turn to play!',
                'wheelDefiOrDrink': '{player} — complete the challenge or drink 2 sips!', 'wheelResult': '🎯 Wheel result: {label}!', 'wheelDrink': '{player} drinks (player on turn).',
            },
        },
    },
}


def deep_merge(base, patch):
    for k, v in patch.items():
        if isinstance(v, dict) and k in base and isinstance(base[k], dict):
            deep_merge(base[k], v)
        else:
            base[k] = v


for locale in ['en', 'es', 'it']:
    path = ROOT / f'{locale}.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    pb = data['games']['petit-buveur']
    patch = translations['en'] if locale == 'en' else translations['en']  # en base for all for now
    if locale == 'es':
        patch = json.loads(json.dumps(translations['en']))
        patch['game']['title'] = 'El Pequeño Bebedor'
        patch['game']['back'] = 'Volver'
        patch['game']['turn'] = 'Turno {count}'
        patch['game']['turnOf'] = 'Turno de'
        patch['game']['turnShort'] = 'Turno'
        patch['game']['ranking'] = 'Clasificación'
        patch['game']['caseLabel'] = 'Casilla {number}'
        patch['game']['loading'] = 'Cargando la partida…'
        patch['game']['next'] = 'Siguiente'
        patch['game']['continue'] = 'Continuar'
        patch['game']['close'] = 'Cerrar'
        patch['game']['replay'] = 'Jugar de nuevo'
        patch['game']['victory'] = {'winner': '¡Ganador!', 'wonGame': 'ganó la partida 🎉', 'turns': 'Turnos', 'players': 'Jugadores', 'difficulty': 'Dificultad'}
        patch['shameDice']['diceLabel'] = 'Dado: {value}'
    if locale == 'it':
        patch = json.loads(json.dumps(translations['en']))
        patch['game']['title'] = 'Il Piccolo Bevitore'
        patch['game']['back'] = 'Indietro'
        patch['game']['turn'] = 'Turno {count}'
        patch['game']['turnOf'] = 'Turno di'
        patch['game']['turnShort'] = 'Turno'
        patch['game']['ranking'] = 'Classifica'
        patch['game']['caseLabel'] = 'Casella {number}'
        patch['game']['loading'] = 'Caricamento partita…'
        patch['game']['next'] = 'Avanti'
        patch['game']['continue'] = 'Continua'
        patch['game']['close'] = 'Chiudi'
        patch['game']['replay'] = 'Rigioca'
        patch['game']['victory'] = {'winner': 'Vincitore!', 'wonGame': 'ha vinto la partita 🎉', 'turns': 'Turni', 'players': 'Giocatori', 'difficulty': 'Difficoltà'}
        patch['shameDice']['diceLabel'] = 'Dado: {value}'
    deep_merge(pb, patch)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(locale, 'ok')
