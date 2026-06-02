import 'dart:math';

enum Suit {
  hearts,
  diamonds,
  clubs,
  spades,
}

enum Value {
  as,
  two,
  three,
  four,
  five,
  six,
  seven,
  eight,
  nine,
  ten,
  jack,
  queen,
  king,
}

class PyramidCard {
  final Suit suit;
  final Value value;
  bool faceUp;
  final int row;
  final int col;

  PyramidCard({
    required this.suit,
    required this.value,
    required this.faceUp,
    required this.row,
    required this.col,
  });

  int get numericValue {
    switch (value) {
      case Value.as:
        return 1;
      case Value.two:
        return 2;
      case Value.three:
        return 3;
      case Value.four:
        return 4;
      case Value.five:
        return 5;
      case Value.six:
        return 6;
      case Value.seven:
        return 7;
      case Value.eight:
        return 8;
      case Value.nine:
        return 9;
      case Value.ten:
        return 10;
      case Value.jack:
        return 11;
      case Value.queen:
        return 12;
      case Value.king:
        return 13;
    }
  }

  int get rankValue => value == Value.as ? 14 : numericValue;

  String get displayValue {
    switch (value) {
      case Value.as:
        return 'A';
      case Value.two:
        return '2';
      case Value.three:
        return '3';
      case Value.four:
        return '4';
      case Value.five:
        return '5';
      case Value.six:
        return '6';
      case Value.seven:
        return '7';
      case Value.eight:
        return '8';
      case Value.nine:
        return '9';
      case Value.ten:
        return '10';
      case Value.jack:
        return 'J';
      case Value.queen:
        return 'Q';
      case Value.king:
        return 'K';
    }
  }

  String get suitSymbol {
    switch (suit) {
      case Suit.hearts:
        return '♥';
      case Suit.diamonds:
        return '♦';
      case Suit.clubs:
        return '♣';
      case Suit.spades:
        return '♠';
    }
  }

  bool get isRed => suit == Suit.hearts || suit == Suit.diamonds;
}

enum GameMode {
  fun,
  classic,
}

enum PreludeStep {
  color,
  higherLower,
  insideOutside,
  suit,
}

class PredictionResult {
  final PreludeStep step;
  final String choice;
  final PyramidCard card;
  final bool success;

  PredictionResult({
    required this.step,
    required this.choice,
    required this.card,
    required this.success,
  });
}

class PyramideGameLogic {
  static List<PyramidCard> createDeck(int deckCount) {
    final suits = [Suit.hearts, Suit.diamonds, Suit.clubs, Suit.spades];
    final values = [
      Value.as,
      Value.two,
      Value.three,
      Value.four,
      Value.five,
      Value.six,
      Value.seven,
      Value.eight,
      Value.nine,
      Value.ten,
      Value.jack,
      Value.queen,
      Value.king,
    ];
    final deck = <PyramidCard>[];

    for (int i = 0; i < deckCount; i++) {
      for (final suit in suits) {
        for (final value in values) {
          deck.add(PyramidCard(
            suit: suit,
            value: value,
            faceUp: false,
            row: 0,
            col: 0,
          ));
        }
      }
    }

    return deck;
  }

  static List<PyramidCard> shuffleDeck(List<PyramidCard> deck) {
    final shuffled = List<PyramidCard>.from(deck);
    final random = Random();
    for (int i = shuffled.length - 1; i > 0; i--) {
      final j = random.nextInt(i + 1);
      final temp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = temp;
    }
    return shuffled;
  }

  static Map<String, List<PyramidCard>> createPyramid(
    List<PyramidCard> deck,
    int pyramidHeight,
  ) {
    final pyramidCards = <List<PyramidCard>>[];
    int deckIndex = 0;

    for (int row = 0; row < pyramidHeight; row++) {
      final rowCards = <PyramidCard>[];
      for (int col = 0; col <= row; col++) {
        if (deckIndex < deck.length) {
          final card = deck[deckIndex];
          rowCards.add(PyramidCard(
            suit: card.suit,
            value: card.value,
            faceUp: false,
            row: row,
            col: col,
          ));
          deckIndex++;
        }
      }
      pyramidCards.add(rowCards);
    }

    return {
      'pyramid': pyramidCards.expand((row) => row).toList(),
      'remaining': deck.sublist(deckIndex),
    };
  }

  static int valueToPoints(Value value) {
    if (value == Value.as ||
        value == Value.jack ||
        value == Value.queen ||
        value == Value.king) {
      return 10;
    }
    return value.index + 1;
  }

  static bool checkPreludeChoice(
    PreludeStep step,
    String choice,
    PyramidCard revealed,
    List<PyramidCard> previousRevealed,
  ) {
    switch (step) {
      case PreludeStep.color:
        final isRed = revealed.isRed;
        return (choice == 'red' && isRed) || (choice == 'black' && !isRed);
      case PreludeStep.higherLower:
        if (previousRevealed.isEmpty) return false;
        final first = previousRevealed[0];
        final cmp = revealed.rankValue - first.rankValue;
        return (choice == 'higher' && cmp > 0) ||
            (choice == 'lower' && cmp < 0);
      case PreludeStep.insideOutside:
        if (previousRevealed.length < 2) return false;
        final a = previousRevealed[0];
        final b = previousRevealed[1];
        final minV = min(a.rankValue, b.rankValue);
        final maxV = max(a.rankValue, b.rankValue);
        final r = revealed.rankValue;
        final isInside = r > minV && r < maxV;
        return (choice == 'inside' && isInside) ||
            (choice == 'outside' && !isInside);
      case PreludeStep.suit:
        final suitMap = {
          'hearts': Suit.hearts,
          'diamonds': Suit.diamonds,
          'clubs': Suit.clubs,
          'spades': Suit.spades,
        };
        return suitMap[choice] == revealed.suit;
    }
  }
}



