import 'package:flutter/material.dart';
import 'dart:math' as math;
import '../game_logic.dart';

class WheelWidget extends StatefulWidget {
  final List<WheelSegment> segments;
  final Function(WheelSegment)? onSpinComplete;

  const WheelWidget({
    Key? key,
    required this.segments,
    this.onSpinComplete,
  }) : super(key: key);

  @override
  State<WheelWidget> createState() => _WheelWidgetState();
}

class _WheelWidgetState extends State<WheelWidget>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _rotationAnimation;
  bool _isSpinning = false;
  WheelSegment? _result;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(seconds: 3),
      vsync: this,
    );
    _rotationAnimation = Tween<double>(
      begin: 0,
      end: 1,
    ).animate(CurvedAnimation(
      parent: _controller,
      curve: Curves.decelerate,
    ));
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void spin() {
    if (_isSpinning) return;

    setState(() {
      _isSpinning = true;
      _result = null;
    });

    // Rotation aléatoire entre 5 et 10 tours
    final random = math.Random();
    final spins = 5 + random.nextDouble() * 5;
    final targetRotation = spins * 2 * math.pi;

    _controller.reset();
    _rotationAnimation = Tween<double>(
      begin: 0,
      end: targetRotation,
    ).animate(CurvedAnimation(
      parent: _controller,
      curve: Curves.decelerate,
    ));

    _controller.forward().then((_) {
      // Calculer le segment gagnant
      final normalizedRotation = targetRotation % (2 * math.pi);
      final segmentAngle = 2 * math.pi / widget.segments.length;
      final winningIndex = (normalizedRotation / segmentAngle).floor() %
          widget.segments.length;
      final winningSegment = widget.segments[winningIndex];

      setState(() {
        _isSpinning = false;
        _result = winningSegment;
      });

      if (widget.onSpinComplete != null) {
        widget.onSpinComplete!(winningSegment);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _rotationAnimation,
      builder: (context, child) {
        return Transform.rotate(
          angle: _rotationAnimation.value,
          child: CustomPaint(
            size: const Size(300, 300),
            painter: WheelPainter(
              segments: widget.segments,
              result: _result,
            ),
          ),
        );
      },
    );
  }
}

class WheelPainter extends CustomPainter {
  final List<WheelSegment> segments;
  final WheelSegment? result;

  WheelPainter({
    required this.segments,
    this.result,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 20;
    final segmentAngle = 2 * math.pi / segments.length;

    // Dessiner les segments
    for (int i = 0; i < segments.length; i++) {
      final startAngle = i * segmentAngle - math.pi / 2;
      final endAngle = (i + 1) * segmentAngle - math.pi / 2;

      final paint = Paint()
        ..style = PaintingStyle.fill
        ..color = segments[i].value == 0
            ? Colors.green
            : (i % 2 == 0 ? Colors.red.shade300 : Colors.red.shade500);

      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        startAngle,
        segmentAngle,
        true,
        paint,
      );

      // Dessiner le texte
      final textAngle = startAngle + segmentAngle / 2;
      final textX = center.dx + (radius * 0.7) * math.cos(textAngle);
      final textY = center.dy + (radius * 0.7) * math.sin(textAngle);

      final textPainter = TextPainter(
        text: TextSpan(
          text: segments[i].label,
          style: const TextStyle(
            fontSize: 12,
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        textDirection: TextDirection.ltr,
        textAlign: TextAlign.center,
      );
      textPainter.layout();
      textPainter.paint(
        canvas,
        Offset(textX - textPainter.width / 2, textY - textPainter.height / 2),
      );
    }

    // Dessiner le pointeur
    final pointerPaint = Paint()
      ..style = PaintingStyle.fill
      ..color = Colors.black;
    final path = Path()
      ..moveTo(center.dx, center.dy - radius - 10)
      ..lineTo(center.dx - 10, center.dy - radius - 30)
      ..lineTo(center.dx + 10, center.dy - radius - 30)
      ..close();
    canvas.drawPath(path, pointerPaint);
  }

  @override
  bool shouldRepaint(WheelPainter oldDelegate) {
    return segments != oldDelegate.segments || result != oldDelegate.result;
  }
}



