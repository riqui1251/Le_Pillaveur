import 'package:flutter/material.dart';
import '../game_logic.dart';

class BoardWidget extends StatelessWidget {
  final List<GamePlayer> players;
  final int boardSize;
  final String? animatingPlayerId;
  final Function(int)? onCaseTap;

  const BoardWidget({
    Key? key,
    required this.players,
    required this.boardSize,
    this.animatingPlayerId,
    this.onCaseTap,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: BoardPainter(
        players: players,
        boardSize: boardSize,
        animatingPlayerId: animatingPlayerId,
      ),
      child: GestureDetector(
        onTapDown: (details) {
          if (onCaseTap != null) {
            final RenderBox box = context.findRenderObject() as RenderBox;
            final localPosition = box.globalToLocal(details.globalPosition);
            final caseIndex = _getCaseIndexFromPosition(
              localPosition,
              box.size,
              boardSize,
            );
            if (caseIndex != null && caseIndex >= 0 && caseIndex < boardSize) {
              onCaseTap!(caseIndex);
            }
          }
        },
      ),
    );
  }

  int? _getCaseIndexFromPosition(
    Offset position,
    Size size,
    int boardSize,
  ) {
    // Calcul simplifié pour déterminer quelle case a été tapée
    // Cette logique doit être adaptée selon la disposition du plateau
    final cellWidth = size.width / 5; // 5 cases par ligne approximativement
    final cellHeight = size.height / (boardSize / 5).ceil();
    final col = (position.dx / cellWidth).floor();
    final row = (position.dy / cellHeight).floor();
    final index = row * 5 + col;
    if (index >= 0 && index < boardSize) {
      return index;
    }
    return null;
  }
}

class BoardPainter extends CustomPainter {
  final List<GamePlayer> players;
  final int boardSize;
  final String? animatingPlayerId;

  BoardPainter({
    required this.players,
    required this.boardSize,
    this.animatingPlayerId,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0
      ..color = Colors.grey;

    final fillPaint = Paint()
      ..style = PaintingStyle.fill
      ..color = Colors.grey.shade200;

    // Dessiner le plateau en spirale ou en ligne
    // Pour simplifier, on dessine un plateau linéaire
    final cellWidth = size.width / 5;
    final cellHeight = size.height / (boardSize / 5).ceil();

    for (int i = 0; i < boardSize; i++) {
      final row = i ~/ 5;
      final col = i % 5;
      final x = col * cellWidth;
      final y = row * cellHeight;

      final rect = Rect.fromLTWH(x, y, cellWidth, cellHeight);
      canvas.drawRect(rect, fillPaint);
      canvas.drawRect(rect, paint);

      // Dessiner le numéro de la case
      final textPainter = TextPainter(
        text: TextSpan(
          text: '${i + 1}',
          style: TextStyle(
            fontSize: 12,
            color: Colors.black,
            fontWeight: FontWeight.bold,
          ),
        ),
        textDirection: TextDirection.ltr,
      );
      textPainter.layout();
      textPainter.paint(
        canvas,
        Offset(x + cellWidth / 2 - textPainter.width / 2,
            y + cellHeight / 2 - textPainter.height / 2),
      );
    }

    // Dessiner les pions des joueurs
    for (final player in players) {
      final row = player.position ~/ 5;
      final col = player.position % 5;
      final x = col * cellWidth + cellWidth / 2;
      final y = row * cellHeight + cellHeight / 2;

      final playerPaint = Paint()
        ..style = PaintingStyle.fill
        ..color = _getColorFromString(player.preferences.color);

      final isAnimating = player.id == animatingPlayerId;
      final radius = isAnimating ? 15.0 : 12.0;

      canvas.drawCircle(Offset(x, y), radius, playerPaint);

      // Dessiner le nom du joueur
      final namePainter = TextPainter(
        text: TextSpan(
          text: player.name.substring(0, 1).toUpperCase(),
          style: TextStyle(
            fontSize: 10,
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        textDirection: TextDirection.ltr,
      );
      namePainter.layout();
      namePainter.paint(
        canvas,
        Offset(x - namePainter.width / 2, y - namePainter.height / 2),
      );
    }
  }

  Color _getColorFromString(String colorString) {
    // Convertir les classes Tailwind en couleurs Flutter
    if (colorString.contains('red')) return Colors.red;
    if (colorString.contains('blue')) return Colors.blue;
    if (colorString.contains('green')) return Colors.green;
    if (colorString.contains('yellow')) return Colors.yellow;
    if (colorString.contains('purple')) return Colors.purple;
    if (colorString.contains('pink')) return Colors.pink;
    if (colorString.contains('indigo')) return Colors.indigo;
    if (colorString.contains('orange')) return Colors.orange;
    if (colorString.contains('teal')) return Colors.teal;
    if (colorString.contains('cyan')) return Colors.cyan;
    if (colorString.contains('rose')) return Colors.pink.shade300;
    if (colorString.contains('emerald')) return Colors.green.shade400;
    return Colors.grey;
  }

  @override
  bool shouldRepaint(BoardPainter oldDelegate) {
    return players != oldDelegate.players ||
        animatingPlayerId != oldDelegate.animatingPlayerId;
  }
}



