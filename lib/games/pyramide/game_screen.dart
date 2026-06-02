import 'package:flutter/material.dart';
import 'game_logic.dart';
import '../../models/player.dart';

class PyramideGameScreen extends StatefulWidget {
  final List<Player> players;
  final int pyramidHeight;
  final GameMode gameMode;
  final int deckCount;
  final int cardsToSelect;
  final VoidCallback? onGameEnd;

  const PyramideGameScreen({
    Key? key,
    required this.players,
    required this.pyramidHeight,
    this.gameMode = GameMode.fun,
    this.deckCount = 1,
    this.cardsToSelect = 4,
    this.onGameEnd,
  }) : super(key: key);

  @override
  State<PyramideGameScreen> createState() => _PyramideGameScreenState();
}

class _PyramideGameScreenState extends State<PyramideGameScreen> {
  List<List<PyramidCard>> pyramid = [];
  PyramidCard? currentCard;
  int totalCardsFlipped = 0;
  int totalCards = 0;
  Map<int, int>? nextCardToFlip; // {row, col}
  Map<int, int>? lastFlippedCard;
  bool gameOver = false;
  bool isCardFlipping = false;

  @override
  void initState() {
    super.initState();
    _initializeGame();
  }

  void _initializeGame() {
    if (widget.gameMode == GameMode.fun) {
      final newDeck = PyramideGameLogic.createDeck(1);
      final shuffledDeck = PyramideGameLogic.shuffleDeck(newDeck);
      final result = PyramideGameLogic.createPyramid(
        shuffledDeck,
        widget.pyramidHeight,
      );

      setState(() {
        // Convertir la liste plate en structure 2D
        final pyramidList = result['pyramid'] as List<PyramidCard>;
        pyramid = [];
        int index = 0;
        for (int row = 0; row < widget.pyramidHeight; row++) {
          final rowCards = <PyramidCard>[];
          for (int col = 0; col <= row; col++) {
            if (index < pyramidList.length) {
              rowCards.add(pyramidList[index]);
              index++;
            }
          }
          pyramid.add(rowCards);
        }

        totalCards = pyramidList.length;
        totalCardsFlipped = 0;
        nextCardToFlip = {'row': widget.pyramidHeight - 1, 'col': 0};
        lastFlippedCard = null;
        gameOver = false;
        isCardFlipping = false;
      });
    }
  }

  void _flipNextCard() {
    if (nextCardToFlip == null || isCardFlipping) return;

    setState(() {
      isCardFlipping = true;
    });

    final row = nextCardToFlip!['row']!;
    final col = nextCardToFlip!['col']!;

    if (row < pyramid.length && col < pyramid[row].length) {
      setState(() {
        pyramid[row][col].faceUp = true;
        currentCard = pyramid[row][col];
        totalCardsFlipped++;
        lastFlippedCard = {'row': row, 'col': col};
      });

      if (totalCardsFlipped >= totalCards) {
        setState(() {
          gameOver = true;
          nextCardToFlip = null;
        });
      } else {
        _findNextCardToFlip(row, col);
      }
    }

    Future.delayed(const Duration(milliseconds: 500), () {
      setState(() {
        isCardFlipping = false;
      });
    });
  }

  void _findNextCardToFlip(int currentRow, int currentCol) {
    // Essayer la colonne suivante dans la même rangée
    if (currentCol + 1 < pyramid[currentRow].length) {
      setState(() {
        nextCardToFlip = {'row': currentRow, 'col': currentCol + 1};
      });
      return;
    }

    // Passer à la rangée au-dessus
    if (currentRow > 0) {
      setState(() {
        nextCardToFlip = {'row': currentRow - 1, 'col': 0};
      });
      return;
    }

    setState(() {
      nextCardToFlip = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Pyramide ${widget.gameMode == GameMode.classic ? '· Mode Classique' : ''}'),
      ),
      body: Column(
        children: [
          // Barre de progression
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              children: [
                LinearProgressIndicator(
                  value: totalCards > 0 ? totalCardsFlipped / totalCards : 0,
                ),
                Text('$totalCardsFlipped / $totalCards cartes retournées'),
              ],
            ),
          ),

          // Pyramide
          Expanded(
            child: SingleChildScrollView(
              child: CustomPaint(
                painter: PyramidPainter(
                  pyramid: pyramid,
                  nextCardToFlip: nextCardToFlip,
                  lastFlippedCard: lastFlippedCard,
                ),
                child: Container(
                  width: double.infinity,
                  height: 600,
                ),
              ),
            ),
          ),

          // Carte actuelle
          if (currentCard != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      currentCard!.displayValue,
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                        color: currentCard!.isRed ? Colors.red : Colors.black,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      currentCard!.suitSymbol,
                      style: TextStyle(
                        fontSize: 32,
                        color: currentCard!.isRed ? Colors.red : Colors.black,
                      ),
                    ),
                  ],
                ),
              ),
            ),

          // Bouton Suivant
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: ElevatedButton(
              onPressed: gameOver || nextCardToFlip == null ? null : _flipNextCard,
              child: Text(gameOver ? 'Terminé' : 'Suivant'),
            ),
          ),
        ],
      ),
    );
  }
}

class PyramidPainter extends CustomPainter {
  final List<List<PyramidCard>> pyramid;
  final Map<int, int>? nextCardToFlip;
  final Map<int, int>? lastFlippedCard;

  PyramidPainter({
    required this.pyramid,
    this.nextCardToFlip,
    this.lastFlippedCard,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (pyramid.isEmpty) return;

    final cardWidth = 60.0;
    final cardHeight = 90.0;
    final spacing = 5.0;

    final startX = size.width / 2;
    var currentY = 50.0;

    for (int row = 0; row < pyramid.length; row++) {
      final rowCards = pyramid[row];
      final rowWidth = (rowCards.length * cardWidth) +
          ((rowCards.length - 1) * spacing);
      var currentX = startX - rowWidth / 2;

      for (int col = 0; col < rowCards.length; col++) {
        final card = rowCards[col];
        final isNext = nextCardToFlip != null &&
            nextCardToFlip!['row'] == row &&
            nextCardToFlip!['col'] == col;
        final isLast = lastFlippedCard != null &&
            lastFlippedCard!['row'] == row &&
            lastFlippedCard!['col'] == col;

        final paint = Paint()
          ..style = PaintingStyle.fill
          ..color = card.faceUp ? Colors.white : Colors.amber.shade800;

        final borderPaint = Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2.0
          ..color = isNext
              ? Colors.yellow
              : isLast
                  ? Colors.green
                  : Colors.grey;

        final rect = Rect.fromLTWH(currentX, currentY, cardWidth, cardHeight);
        canvas.drawRect(rect, paint);
        canvas.drawRect(rect, borderPaint);

        if (card.faceUp) {
          // Dessiner la valeur et le symbole
          final textPainter = TextPainter(
            text: TextSpan(
              text: '${card.displayValue}\n${card.suitSymbol}',
              style: TextStyle(
                fontSize: 16,
                color: card.isRed ? Colors.red : Colors.black,
                fontWeight: FontWeight.bold,
              ),
            ),
            textDirection: TextDirection.ltr,
            textAlign: TextAlign.center,
          );
          textPainter.layout();
          textPainter.paint(
            canvas,
            Offset(
              currentX + cardWidth / 2 - textPainter.width / 2,
              currentY + cardHeight / 2 - textPainter.height / 2,
            ),
          );
        } else {
          // Dessiner un point d'interrogation
          final textPainter = TextPainter(
            text: const TextSpan(
              text: '?',
              style: TextStyle(
                fontSize: 32,
                color: Colors.white,
                fontWeight: FontWeight.bold,
              ),
            ),
            textDirection: TextDirection.ltr,
          );
          textPainter.layout();
          textPainter.paint(
            canvas,
            Offset(
              currentX + cardWidth / 2 - textPainter.width / 2,
              currentY + cardHeight / 2 - textPainter.height / 2,
            ),
          );
        }

        currentX += cardWidth + spacing;
      }

      currentY += cardHeight + spacing;
    }
  }

  @override
  bool shouldRepaint(PyramidPainter oldDelegate) {
    return pyramid != oldDelegate.pyramid ||
        nextCardToFlip != oldDelegate.nextCardToFlip ||
        lastFlippedCard != oldDelegate.lastFlippedCard;
  }
}



