import 'package:flutter/material.dart';
import '../game_logic.dart';

class PlayerToken extends StatelessWidget {
  final GamePlayer player;
  final bool isAnimating;
  final VoidCallback? onTap;

  const PlayerToken({
    Key? key,
    required this.player,
    this.isAnimating = false,
    this.onTap,
  }) : super(key: key);

  Color _getColorFromString(String colorString) {
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
  Widget build(BuildContext context) {
    final color = _getColorFromString(player.preferences.color ?? 'bg-blue-500');
    final icon = player.preferences.icon ?? '🎮';

    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        width: isAnimating ? 50 : 40,
        height: isAnimating ? 50 : 40,
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
          border: Border.all(
            color: Colors.white,
            width: 2,
          ),
          boxShadow: isAnimating
              ? [
                  BoxShadow(
                    color: color.withOpacity(0.5),
                    blurRadius: 10,
                    spreadRadius: 2,
                  ),
                ]
              : [],
        ),
        child: Center(
          child: Text(
            icon,
            style: const TextStyle(fontSize: 20),
          ),
        ),
      ),
    );
  }
}



