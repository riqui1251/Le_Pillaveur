import 'dart:math';
import '../../models/player.dart';

enum CaseType {
  normal,
  defi,
  gorgee,
  recul,
  avance,
  tous,
  roue,
  echange,
  bombe,
  protection,
  malediction,
  chance,
  repetition,
  miroir,
  defiChaine,
  piege,
  melange,
}

enum Difficulty {
  facile,
  normal,
  difficile,
  extreme,
}

class GameCase {
  final CaseType type;
  final String description;
  final int effect;

  GameCase({
    required this.type,
    required this.description,
    required this.effect,
  });
}

class WheelSegment {
  final String id;
  final String label;
  final int value; // 0 = SAFE, 1..12 = gorgées

  WheelSegment({
    required this.id,
    required this.label,
    required this.value,
  });
}

class GamePlayer {
  final String id;
  final String name;
  int position;
  int drinks;
  bool protected;
  int cursed; // Nombre de tours restants pour la malédiction
  String? linkedTo; // ID du joueur avec qui il est lié
  int linkedTurns; // Nombre de tours restants pour le lien
  final PlayerPreferences preferences;

  GamePlayer({
    required this.id,
    required this.name,
    required this.position,
    required this.drinks,
    required this.protected,
    required this.cursed,
    this.linkedTo,
    required this.linkedTurns,
    required this.preferences,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'position': position,
        'drinks': drinks,
        'protected': protected,
        'cursed': cursed,
        'linkedTo': linkedTo,
        'linkedTurns': linkedTurns,
        'preferences': preferences.toJson(),
      };

  factory GamePlayer.fromJson(Map<String, dynamic> json) => GamePlayer(
        id: json['id'] as String,
        name: json['name'] as String,
        position: json['position'] as int,
        drinks: json['drinks'] as int,
        protected: json['protected'] as bool,
        cursed: json['cursed'] as int,
        linkedTo: json['linkedTo'] as String?,
        linkedTurns: json['linkedTurns'] as int,
        preferences: PlayerPreferences.fromJson(
            json['preferences'] as Map<String, dynamic>),
      );
}

class GameSave {
  final String id;
  final int timestamp;
  final List<GamePlayer> players;
  final int currentPlayer;
  final int turnCount;
  final Difficulty gameDifficulty;
  final GameCase? lastCase;
  final bool gameStarted;
  final GamePlayer? winner;

  GameSave({
    required this.id,
    required this.timestamp,
    required this.players,
    required this.currentPlayer,
    required this.turnCount,
    required this.gameDifficulty,
    this.lastCase,
    required this.gameStarted,
    this.winner,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'timestamp': timestamp,
        'players': players.map((p) => p.toJson()).toList(),
        'currentPlayer': currentPlayer,
        'turnCount': turnCount,
        'gameDifficulty': gameDifficulty.toString().split('.').last,
        'lastCase': lastCase != null
            ? {
                'type': lastCase!.type.toString().split('.').last,
                'description': lastCase!.description,
                'effect': lastCase!.effect,
              }
            : null,
        'gameStarted': gameStarted,
        'winner': winner?.toJson(),
      };

  factory GameSave.fromJson(Map<String, dynamic> json) {
    final difficultyStr = json['gameDifficulty'] as String;
    Difficulty difficulty;
    switch (difficultyStr) {
      case 'facile':
        difficulty = Difficulty.facile;
        break;
      case 'normal':
        difficulty = Difficulty.normal;
        break;
      case 'difficile':
        difficulty = Difficulty.difficile;
        break;
      case 'extreme':
        difficulty = Difficulty.extreme;
        break;
      default:
        difficulty = Difficulty.normal;
    }

    GameCase? lastCase;
    if (json['lastCase'] != null) {
      final caseJson = json['lastCase'] as Map<String, dynamic>;
      final typeStr = caseJson['type'] as String;
      CaseType type;
      switch (typeStr) {
        case 'normal':
          type = CaseType.normal;
          break;
        case 'defi':
          type = CaseType.defi;
          break;
        case 'gorgee':
          type = CaseType.gorgee;
          break;
        case 'recul':
          type = CaseType.recul;
          break;
        case 'avance':
          type = CaseType.avance;
          break;
        case 'tous':
          type = CaseType.tous;
          break;
        case 'roue':
          type = CaseType.roue;
          break;
        case 'echange':
          type = CaseType.echange;
          break;
        case 'bombe':
          type = CaseType.bombe;
          break;
        case 'protection':
          type = CaseType.protection;
          break;
        case 'malediction':
          type = CaseType.malediction;
          break;
        case 'chance':
          type = CaseType.chance;
          break;
        case 'repetition':
          type = CaseType.repetition;
          break;
        case 'miroir':
          type = CaseType.miroir;
          break;
        case 'defiChaine':
          type = CaseType.defiChaine;
          break;
        case 'piege':
          type = CaseType.piege;
          break;
        case 'melange':
          type = CaseType.melange;
          break;
        default:
          type = CaseType.normal;
      }
      lastCase = GameCase(
        type: type,
        description: caseJson['description'] as String,
        effect: caseJson['effect'] as int,
      );
    }

    return GameSave(
      id: json['id'] as String,
      timestamp: json['timestamp'] as int,
      players: (json['players'] as List)
          .map((p) => GamePlayer.fromJson(p as Map<String, dynamic>))
          .toList(),
      currentPlayer: json['currentPlayer'] as int,
      turnCount: json['turnCount'] as int,
      gameDifficulty: difficulty,
      lastCase: lastCase,
      gameStarted: json['gameStarted'] as bool,
      winner: json['winner'] != null
          ? GamePlayer.fromJson(json['winner'] as Map<String, dynamic>)
          : null,
    );
  }
}

class PetitBuveurGameLogic {
  static const int boardSize = 30;
  static const List<String> defaultColors = [
    'bg-red-500',
    'bg-blue-500',
    'bg-green-500',
    'bg-yellow-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-orange-500',
    'bg-teal-500',
    'bg-cyan-500',
    'bg-rose-500',
    'bg-emerald-500',
  ];

  static const Map<Difficulty, int> difficultyMultipliers = {
    Difficulty.facile: 1,
    Difficulty.normal: 2,
    Difficulty.difficile: 3,
    Difficulty.extreme: 4,
  };

  static const List<Map<String, dynamic>> defis = [
    {'text': 'Fais 10 pompes', 'drinks': 3},
    {'text': 'Raconte une blague', 'drinks': 3},
    {'text': 'Chante une chanson', 'drinks': 3},
    {'text': 'Imite un animal', 'drinks': 3},
    {'text': 'Fais 10 squats', 'drinks': 3},
    {'text': 'Fais 30 secondes de gainage', 'drinks': 3},
    {'text': 'Mime un film sans parler', 'drinks': 2},
    {'text': 'Imite un autre joueur', 'drinks': 2},
    {'text': 'Fais 10 tours sur toi-même', 'drinks': 2},
    {'text': 'Danse pendant 20 secondes', 'drinks': 2},
    {'text': 'Raconte ton souvenir de soirée le plus gênant', 'drinks': 3},
    {'text': 'Parle avec un accent pendant 2 tours', 'drinks': 2},
    {'text': 'Fais le poirier contre un mur', 'drinks': 3},
    {'text': 'Fais deviner un mot sans parler', 'drinks': 2},
    {'text': 'Récite l\'alphabet à l\'envers', 'drinks': 3},
    {'text': 'Fais 5 sauts de grenouille', 'drinks': 2},
    {'text': 'Ne touche pas ton téléphone pendant 3 tours', 'drinks': 8},
    {'text': 'Bois sans utiliser tes mains', 'drinks': 2},
  ];

  static GameCase generateCase(Difficulty difficulty) {
    final random = Random().nextDouble();
    final multiplier = difficultyMultipliers[difficulty]!;
    CaseType type;

    if (random < 0.08) {
      type = CaseType.roue;
    } else if (random < 0.15) {
      type = CaseType.tous;
    } else if (random < 0.20) {
      type = CaseType.echange;
    } else if (random < 0.25) {
      type = CaseType.bombe;
    } else if (random < 0.30) {
      type = CaseType.protection;
    } else if (random < 0.35) {
      type = CaseType.malediction;
    } else if (random < 0.40) {
      type = CaseType.chance;
    } else if (random < 0.45) {
      type = CaseType.repetition;
    } else if (random < 0.50) {
      type = CaseType.miroir;
    } else if (random < 0.55) {
      type = CaseType.defiChaine;
    } else if (random < 0.60) {
      type = CaseType.piege;
    } else if (random < 0.65) {
      type = CaseType.melange;
    } else {
      final types = [
        CaseType.normal,
        CaseType.defi,
        CaseType.gorgee,
        CaseType.recul,
        CaseType.avance
      ];
      type = types[Random().nextInt(types.length)];
    }

    switch (type) {
      case CaseType.normal:
        return GameCase(
          type: type,
          description: 'Case safe',
          effect: 0,
        );
      case CaseType.gorgee:
        final baseGorgees = Random().nextInt(3) + 1;
        var drinks = baseGorgees * multiplier;
        String description;

        if (difficulty == Difficulty.difficile && drinks > 8) {
          drinks = 8;
        }

        if (difficulty == Difficulty.extreme && drinks >= 12) {
          description = 'Cul sec ! 🍺';
        } else {
          description = 'Bois ${drinks} gorgée${drinks > 1 ? 's' : ''} !';
        }

        return GameCase(
          type: type,
          description: description,
          effect: drinks,
        );
      case CaseType.defi:
        final defi = defis[Random().nextInt(defis.length)];
        final drinks = (defi['drinks'] as int * multiplier).clamp(0, 4);
        return GameCase(
          type: type,
          description:
              'Défi : ${defi['text']} ou bois ${drinks} gorgée${drinks > 1 ? 's' : ''} !',
          effect: 0,
        );
      case CaseType.recul:
        return GameCase(
          type: type,
          description: 'Recule de 1 case !',
          effect: -1,
        );
      case CaseType.avance:
        return GameCase(
          type: type,
          description: 'Avance de 1 case !',
          effect: 1,
        );
      case CaseType.tous:
        final baseGorgees = Random().nextInt(2) + 1;
        final drinks = (baseGorgees * multiplier).clamp(0, 3);
        return GameCase(
          type: type,
          description:
              'Tout le monde boit ${drinks} gorgée${drinks > 1 ? 's' : ''} sauf la personne ciblée ! 🍻',
          effect: drinks,
        );
      case CaseType.roue:
        return GameCase(
          type: type,
          description: '🎯 Case spéciale : Roue des gorgées ! 🎯',
          effect: 0,
        );
      case CaseType.echange:
        return GameCase(
          type: type,
          description: '🔄 Échange ta position avec un autre joueur !',
          effect: 0,
        );
      case CaseType.bombe:
        return GameCase(
          type: type,
          description:
              '💣 Bombe ! Tout le monde boit, mais toi tu bois double !',
          effect: 2,
        );
      case CaseType.protection:
        return GameCase(
          type: type,
          description: '🛡️ Tu es protégé pendant 1 tour !',
          effect: 0,
        );
      case CaseType.malediction:
        return GameCase(
          type: type,
          description:
              '👻 Malédiction ! Tu bois à chaque tour pendant 3 tours !',
          effect: 3,
        );
      case CaseType.chance:
        return GameCase(
          type: type,
          description: '🍀 Chance ! Relance le dé ou avance de 2 cases !',
          effect: 0,
        );
      case CaseType.repetition:
        return GameCase(
          type: type,
          description: '🔄 Répète l\'action de la case précédente !',
          effect: 0,
        );
      case CaseType.miroir:
        return GameCase(
          type: type,
          description: '🪞 Miroir ! Les positions sont inversées !',
          effect: 0,
        );
      case CaseType.defiChaine:
        return GameCase(
          type: type,
          description:
              '🔗 Défi en chaîne ! Choisis avec qui tu seras lié pendant 5 tours !',
          effect: 5,
        );
      case CaseType.piege:
        return GameCase(
          type: type,
          description:
              '🕳️ Piège ! Le joueur ciblé boira autant de gorgées que sa position actuelle !',
          effect: 0,
        );
      case CaseType.melange:
        return GameCase(
          type: type,
          description: '🔀 Mélange ! Les positions sont mélangées !',
          effect: 0,
        );
    }
  }

  static List<WheelSegment> generateWheelSegments() {
    final segments = <WheelSegment>[];
    for (int i = 0; i < 15; i++) {
      final isSafe = (i + 1) % 3 == 0;
      final value = isSafe ? 0 : 1 + Random().nextInt(12);
      segments.add(WheelSegment(
        id: 'seg-$i-$value-${Random().nextInt(10000)}',
        label: value == 0 ? 'SAFE' : '$value gorgées',
        value: value,
      ));
    }
    return segments;
  }

  static int rollDice() {
    return Random().nextInt(6) + 1;
  }

  static int calculateNewPosition(int currentPosition, int diceResult) {
    return (currentPosition + diceResult).clamp(0, boardSize - 1);
  }

  static bool checkWin(int position) {
    return position >= boardSize - 1;
  }
}

