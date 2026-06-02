import 'package:flutter/material.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'game_logic.dart';
import 'widgets/board_widget.dart';
import 'widgets/wheel_widget.dart';
import 'widgets/player_token.dart';
import '../../models/player.dart';

class PetitBuveurGameScreen extends StatefulWidget {
  final List<Player> initialPlayers;
  final Difficulty difficulty;
  final VoidCallback? onGameEnd;

  const PetitBuveurGameScreen({
    Key? key,
    required this.initialPlayers,
    this.difficulty = Difficulty.normal,
    this.onGameEnd,
  }) : super(key: key);

  @override
  State<PetitBuveurGameScreen> createState() => _PetitBuveurGameScreenState();
}

class _PetitBuveurGameScreenState extends State<PetitBuveurGameScreen> {
  late List<GamePlayer> players;
  int currentPlayerIndex = 0;
  int turnCount = 1;
  bool gameStarted = false;
  int? diceResult;
  GameCase? currentCase;
  GamePlayer? winner;
  String? animatingPlayerId;
  bool isProcessingTurn = false;
  bool isDiceRolling = false;
  GameCase? pendingCase;
  int? pendingPosition;
  bool showWheel = false;
  List<WheelSegment> wheelSegments = [];
  WheelSegment? wheelResult;
  GameCase? lastCase;

  @override
  void initState() {
    super.initState();
    _initializePlayers();
    _checkForSave();
  }

  void _initializePlayers() {
    players = widget.initialPlayers.map((p) {
      return GamePlayer(
        id: p.id,
        name: p.name,
        position: 0,
        drinks: 0,
        protected: false,
        cursed: 0,
        linkedTurns: 0,
        preferences: p.preferences,
      );
    }).toList();
  }

  void _checkForSave() {
    // Vérifier s'il y a une sauvegarde
    final box = Hive.box('gameSaves');
    final saveData = box.get('petit-buveur-save');
    if (saveData != null) {
      // Proposer de reprendre la partie sauvegardée
      // Pour l'instant, on ne charge pas automatiquement
    }
  }

  void _saveGame() {
    final save = GameSave(
      id: 'save_${DateTime.now().millisecondsSinceEpoch}',
      timestamp: DateTime.now().millisecondsSinceEpoch,
      players: players,
      currentPlayer: currentPlayerIndex,
      turnCount: turnCount,
      gameDifficulty: widget.difficulty,
      lastCase: lastCase,
      gameStarted: gameStarted,
      winner: winner,
    );

    final box = Hive.box('gameSaves');
    box.put('petit-buveur-save', save.toJson());
  }

  void _loadGame() {
    final box = Hive.box('gameSaves');
    final saveData = box.get('petit-buveur-save');
    if (saveData != null) {
      final save = GameSave.fromJson(Map<String, dynamic>.from(saveData));
      setState(() {
        players = save.players;
        currentPlayerIndex = save.currentPlayer;
        turnCount = save.turnCount;
        lastCase = save.lastCase;
        gameStarted = save.gameStarted;
        winner = save.winner;
      });
    }
  }

  void _deleteSave() {
    final box = Hive.box('gameSaves');
    box.delete('petit-buveur-save');
  }

  void _rollDice() {
    if (isProcessingTurn || isDiceRolling) return;

    setState(() {
      isProcessingTurn = true;
      isDiceRolling = true;
    });

    // Animation du dé
    Future.delayed(const Duration(milliseconds: 800), () {
      final result = PetitBuveurGameLogic.rollDice();
      setState(() {
        diceResult = result;
        isDiceRolling = false;
      });

      final player = players[currentPlayerIndex];
      final newPosition = PetitBuveurGameLogic.calculateNewPosition(
        player.position,
        result,
      );

      setState(() {
        animatingPlayerId = player.id;
        players[currentPlayerIndex].position = newPosition;
      });

      if (PetitBuveurGameLogic.checkWin(newPosition)) {
        setState(() {
          winner = players[currentPlayerIndex];
          gameStarted = false;
        });
        _saveGame();
        return;
      }

      // Générer une case
      final caseType = PetitBuveurGameLogic.generateCase(widget.difficulty);
      setState(() {
        pendingCase = caseType;
        pendingPosition = newPosition;
        if (caseType.type != CaseType.repetition &&
            caseType.type != CaseType.chance &&
            caseType.type != CaseType.echange) {
          lastCase = caseType;
        }
      });

      Future.delayed(const Duration(milliseconds: 500), () {
        setState(() {
          animatingPlayerId = null;
        });
        _showTargetDialog(caseType);
      });
    });
  }

  void _showTargetDialog(GameCase caseType) {
    if (caseType.type == CaseType.roue) {
      setState(() {
        wheelSegments = PetitBuveurGameLogic.generateWheelSegments();
        showWheel = true;
      });
      return;
    }

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Choisir un joueur'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: players.map((p) {
            return ListTile(
              title: Text(p.name),
              onTap: () {
                Navigator.pop(context);
                _applyEffectToPlayer(p.id, caseType);
              },
            );
          }).toList(),
        ),
      ),
    );
  }

  void _applyEffectToPlayer(String targetPlayerId, GameCase caseType) {
    final targetPlayer =
        players.firstWhere((p) => p.id == targetPlayerId);
    final updatedPlayers = List<GamePlayer>.from(players);

    switch (caseType.type) {
      case CaseType.normal:
        // Case safe
        break;
      case CaseType.gorgee:
      case CaseType.defi:
        if (!targetPlayer.protected) {
          targetPlayer.drinks += caseType.effect;
        }
        break;
      case CaseType.tous:
        for (final p in updatedPlayers) {
          if (p.id != targetPlayerId && !p.protected) {
            p.drinks += caseType.effect;
          }
        }
        break;
      case CaseType.avance:
      case CaseType.recul:
        if (!targetPlayer.protected) {
          final newPos = (targetPlayer.position + caseType.effect)
              .clamp(0, PetitBuveurGameLogic.boardSize - 1);
          targetPlayer.position = newPos;
          if (PetitBuveurGameLogic.checkWin(newPos)) {
            setState(() {
              winner = targetPlayer;
            });
          }
        }
        break;
      case CaseType.protection:
        targetPlayer.protected = true;
        break;
      case CaseType.malediction:
        if (!targetPlayer.protected) {
          targetPlayer.cursed = 3;
        }
        break;
      // Autres cas...
      default:
        break;
    }

    setState(() {
      players = updatedPlayers;
      currentCase = caseType;
    });

    _nextPlayer();
  }

  void _nextPlayer() {
    setState(() {
      currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
      if (currentPlayerIndex == 0) {
        turnCount++;
      }
      isProcessingTurn = false;
    });
    _saveGame();
  }

  @override
  Widget build(BuildContext context) {
    if (winner != null) {
      return _buildVictoryScreen();
    }

    if (showWheel) {
      return _buildWheelScreen();
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Le Petit Buveur'),
        actions: [
          IconButton(
            icon: const Icon(Icons.save),
            onPressed: _saveGame,
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadGame,
          ),
        ],
      ),
      body: Column(
        children: [
          // Informations du joueur actuel
          _buildCurrentPlayerInfo(),
          // Plateau de jeu
          Expanded(
            child: BoardWidget(
              players: players,
              boardSize: PetitBuveurGameLogic.boardSize,
              animatingPlayerId: animatingPlayerId,
            ),
          ),
          // Bouton de lancer de dé
          if (!isProcessingTurn && gameStarted)
            ElevatedButton(
              onPressed: _rollDice,
              child: Text(
                isDiceRolling
                    ? 'Dé: ${diceResult ?? "..."}'
                    : 'Lancer le dé',
              ),
            ),
          // Liste des joueurs
          _buildPlayersList(),
        ],
      ),
    );
  }

  Widget _buildCurrentPlayerInfo() {
    if (players.isEmpty) return const SizedBox();
    final player = players[currentPlayerIndex];
    return Card(
      child: ListTile(
        leading: PlayerToken(player: player),
        title: Text('Tour de ${player.name}'),
        subtitle: Text('Position: ${player.position + 1} | Gorgées: ${player.drinks}'),
      ),
    );
  }

  Widget _buildPlayersList() {
    return SizedBox(
      height: 100,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: players.length,
        itemBuilder: (context, index) {
          final player = players[index];
          return Padding(
            padding: const EdgeInsets.all(8.0),
            child: Column(
              children: [
                PlayerToken(
                  player: player,
                  isAnimating: player.id == animatingPlayerId,
                ),
                Text(player.name),
                Text('${player.drinks} gorgées'),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildWheelScreen() {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Roue des Gorgées'),
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            WheelWidget(
              segments: wheelSegments,
              onSpinComplete: (segment) {
                setState(() {
                  wheelResult = segment;
                  showWheel = false;
                });
                // Appliquer le résultat de la roue
                if (segment.value > 0) {
                  final player = players[currentPlayerIndex];
                  player.drinks += segment.value;
                }
                _nextPlayer();
              },
            ),
            if (wheelResult != null)
              Text(
                'Résultat: ${wheelResult!.label}',
                style: const TextStyle(fontSize: 24),
              ),
            ElevatedButton(
              onPressed: () {
                // La roue se lance automatiquement via onSpinComplete
              },
              child: const Text('Tourner la roue'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildVictoryScreen() {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.emoji_events, size: 100, color: Colors.amber),
            const SizedBox(height: 20),
            Text(
              '${winner?.name} a gagné !',
              style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: () {
                _deleteSave();
                if (widget.onGameEnd != null) {
                  widget.onGameEnd!();
                }
              },
              child: const Text('Retour au menu'),
            ),
          ],
        ),
      ),
    );
  }
}

