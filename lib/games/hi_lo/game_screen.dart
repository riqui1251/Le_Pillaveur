import 'dart:math';
import 'package:flutter/material.dart';
import 'game_logic.dart';
import '../../models/player.dart';

class HiLoGameScreen extends StatefulWidget {
  final List<Player> players;
  final GameMode gameMode;
  final VoidCallback? onGameEnd;

  const HiLoGameScreen({
    Key? key,
    required this.players,
    this.gameMode = GameMode.standard,
    this.onGameEnd,
  }) : super(key: key);

  @override
  State<HiLoGameScreen> createState() => _HiLoGameScreenState();
}

class _HiLoGameScreenState extends State<HiLoGameScreen> {
  late List<PlayingCard> deck;
  PlayingCard? currentCard;
  PlayingCard? nextCard;
  int currentPlayerIndex = 0;
  int drinkCounter = 1;
  bool gameOver = false;
  bool showResult = false;
  GuessType? lastGuess;
  bool? isCorrect;
  Map<String, int> gameResults = {};
  bool isFlipping = false;
  bool isProcessing = false;
  List<String> activePlayers = [];
  int correctGuessesInRow = 0;
  int targetGuesses = 5;

  @override
  void initState() {
    super.initState();
    _initializeGame();
  }

  void _initializeGame() {
    final newDeck = HiLoGameLogic.createDeck();
    final shuffledDeck = HiLoGameLogic.shuffleDeck(newDeck);

    setState(() {
      deck = shuffledDeck;
      currentCard = shuffledDeck[0];
      deck = shuffledDeck.sublist(1);
      nextCard = null;

      if (widget.gameMode == GameMode.standard) {
        currentPlayerIndex = Random(DateTime.now().millisecondsSinceEpoch).nextInt(widget.players.length);
      } else {
        currentPlayerIndex = 0;
        final target = 5 + (widget.players.length - 2) * 2;
        targetGuesses = target;
        correctGuessesInRow = 0;
        activePlayers = widget.players.map((p) => p.id).toList();
      }

      drinkCounter = 1;
      gameOver = false;
      showResult = false;
      lastGuess = null;
      isCorrect = null;
      gameResults = {};
      isFlipping = false;
      isProcessing = false;
    });
  }

  void _handleGuess(GuessType guess) {
    if (currentCard == null || gameOver || isFlipping || isProcessing) return;

    final currentDeck = HiLoGameLogic.regenerateDeckIfNeeded(deck);
    final nextCardFromDeck = currentDeck[0];
    final remainingDeck = currentDeck.sublist(1);

    setState(() {
      nextCard = nextCardFromDeck;
      deck = remainingDeck;
      lastGuess = guess;
      isFlipping = true;
    });

    final correct = HiLoGameLogic.checkGuess(currentCard!, nextCardFromDeck, guess);

    Future.delayed(const Duration(milliseconds: 600), () {
      setState(() {
        isCorrect = correct;
        showResult = true;
        isFlipping = false;
      });

      if (widget.gameMode == GameMode.standard) {
        if (correct) {
          if (guess == GuessType.equal) {
            drinkCounter += 3;
          } else {
            drinkCounter += 1;
          }
        } else {
          final currentPlayer = widget.players[currentPlayerIndex];
          gameResults[currentPlayer.id] =
              (gameResults[currentPlayer.id] ?? 0) + drinkCounter;
        }
      } else {
        // Mode traversée
        if (correct) {
          correctGuessesInRow++;
          if (guess == GuessType.equal) {
            drinkCounter += 3;
          } else {
            drinkCounter += 1;
          }

          if (guess == GuessType.equal) {
            activePlayers.remove(widget.players[currentPlayerIndex].id);
            if (activePlayers.isEmpty) {
              _endGame();
              return;
            }
          }

          if (correctGuessesInRow >= targetGuesses) {
            _endGame();
            return;
          }
        } else {
          for (final playerId in activePlayers) {
            gameResults[playerId] = (gameResults[playerId] ?? 0) + drinkCounter;
          }
          correctGuessesInRow = 0;
        }
      }

      if (!correct) {
        // Afficher dialogue d'erreur
      }
    });
  }

  void _nextTurn() {
    if (gameOver) return;

    if (widget.gameMode == GameMode.standard) {
      setState(() {
        currentPlayerIndex = (currentPlayerIndex + 1) % widget.players.length;
        if (!isCorrect! && !showResult) {
          drinkCounter = 1;
        }
      });
    } else {
      if (activePlayers.isEmpty) {
        _endGame();
        return;
      }

      setState(() {
        currentPlayerIndex = (currentPlayerIndex + 1) % activePlayers.length;
        if (!isCorrect! && !showResult) {
          drinkCounter = 1;
        }
      });
    }

    setState(() {
      currentCard = nextCard;
      nextCard = null;
      showResult = false;
      lastGuess = null;
      isCorrect = null;
    });
  }

  void _endGame() {
    setState(() {
      gameOver = true;
    });
    // Mettre à jour les statistiques des joueurs
  }

  @override
  Widget build(BuildContext context) {
    if (gameOver) {
      return _buildGameOverScreen();
    }

    final currentPlayer = widget.gameMode == GameMode.traversee
        ? widget.players.firstWhere(
            (p) => activePlayers.contains(p.id) &&
                widget.players.indexOf(p) == currentPlayerIndex)
        : widget.players[currentPlayerIndex];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Hi/Lo'),
      ),
      body: Column(
        children: [
          // Informations du jeu
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                children: [
                  Text('Gorgées: $drinkCounter'),
                  Text(
                      'Cartes: ${52 - deck.length - (currentCard != null ? 1 : 0) - (nextCard != null ? 1 : 0)}/52'),
                  if (widget.gameMode == GameMode.traversee)
                    Text(
                        'Objectif: $correctGuessesInRow/$targetGuesses bonnes réponses'),
                ],
              ),
            ),
          ),

          // Joueur actuel
          Card(
            child: ListTile(
              title: Text('Tour de ${currentPlayer.name}'),
            ),
          ),

          // Cartes
          Expanded(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                // Carte actuelle
                if (currentCard != null) _buildCard(currentCard!),

                // Carte suivante
                _buildNextCard(),
              ],
            ),
          ),

          // Boutons de prédiction
          if (!showResult && !gameOver)
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                ElevatedButton(
                  onPressed: () => _handleGuess(GuessType.higher),
                  child: const Row(
                    children: [
                      Icon(Icons.arrow_upward),
                      Text('Plus haut'),
                    ],
                  ),
                ),
                ElevatedButton(
                  onPressed: () => _handleGuess(GuessType.equal),
                  child: const Text('Égalité'),
                ),
                ElevatedButton(
                  onPressed: () => _handleGuess(GuessType.lower),
                  child: const Row(
                    children: [
                      Icon(Icons.arrow_downward),
                      Text('Plus bas'),
                    ],
                  ),
                ),
              ],
            ),

          // Bouton suivant
          if (showResult && !isCorrect!)
            ElevatedButton(
              onPressed: _nextTurn,
              child: const Text('Suivant'),
            ),

          // Indicateur de progression
          if (showResult && isCorrect!)
            const Text('Correct ! Prochain joueur dans un instant...'),
        ],
      ),
    );
  }

  Widget _buildCard(PlayingCard card) {
    return Container(
      width: 120,
      height: 180,
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(
          color: card.color == 'red' ? Colors.red : Colors.black,
          width: 2,
        ),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            card.displayValue,
            style: TextStyle(
              fontSize: 32,
              fontWeight: FontWeight.bold,
              color: card.color == 'red' ? Colors.red : Colors.black,
            ),
          ),
          Text(
            card.displaySuit,
            style: TextStyle(
              fontSize: 48,
              color: card.color == 'red' ? Colors.red : Colors.black,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNextCard() {
    if (isFlipping) {
      return AnimatedSwitcher(
        duration: const Duration(milliseconds: 600),
        transitionBuilder: (child, animation) {
          return RotationTransition(
            turns: animation,
            child: child,
          );
        },
        child: Container(
          key: ValueKey(isFlipping),
          width: 120,
          height: 180,
          decoration: BoxDecoration(
            color: Colors.white,
            border: Border.all(color: Colors.grey, width: 2),
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Center(
            child: Text('?', style: TextStyle(fontSize: 48)),
          ),
        ),
      );
    } else if (showResult && nextCard != null) {
      return _buildCard(nextCard!);
    } else {
      return Container(
        width: 120,
        height: 180,
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: Colors.grey, width: 2),
          borderRadius: BorderRadius.circular(8),
        ),
        child: const Center(
          child: Text('?', style: TextStyle(fontSize: 48)),
        ),
      );
    }
  }

  Widget _buildGameOverScreen() {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('Fin de la partie', style: TextStyle(fontSize: 24)),
            const SizedBox(height: 20),
            ...gameResults.entries.map((entry) {
              final player = widget.players.firstWhere((p) => p.id == entry.key);
              return Text('${player.name}: ${entry.value} gorgées');
            }),
            ElevatedButton(
              onPressed: widget.onGameEnd,
              child: const Text('Quitter'),
            ),
          ],
        ),
      ),
    );
  }
}

