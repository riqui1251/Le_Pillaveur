import 'dart:math';

enum CardValue {
  two,
  three,
  four,
  five,
  six,
  seven,
  eight,
  nine,
  ten,
  valet,
  dame,
  roi,
  as,
}

enum CardSuit {
  spades,
  hearts,
  diamonds,
  clubs,
}

class PlayingCard {
  final CardValue value;
  final CardSuit suit;
  final String color; // 'red' ou 'black'

  PlayingCard({
    required this.value,
    required this.suit,
    required this.color,
  });

  int get numericValue {
    switch (value) {
      case CardValue.two:
        return 2;
      case CardValue.three:
        return 3;
      case CardValue.four:
        return 4;
      case CardValue.five:
        return 5;
      case CardValue.six:
        return 6;
      case CardValue.seven:
        return 7;
      case CardValue.eight:
        return 8;
      case CardValue.nine:
        return 9;
      case CardValue.ten:
        return 10;
      case CardValue.valet:
        return 11;
      case CardValue.dame:
        return 12;
      case CardValue.roi:
        return 13;
      case CardValue.as:
        return 14;
    }
  }

  String get displayValue {
    switch (value) {
      case CardValue.two:
        return '2';
      case CardValue.three:
        return '3';
      case CardValue.four:
        return '4';
      case CardValue.five:
        return '5';
      case CardValue.six:
        return '6';
      case CardValue.seven:
        return '7';
      case CardValue.eight:
        return '8';
      case CardValue.nine:
        return '9';
      case CardValue.ten:
        return '10';
      case CardValue.valet:
        return 'V';
      case CardValue.dame:
        return 'D';
      case CardValue.roi:
        return 'R';
      case CardValue.as:
        return 'A';
    }
  }

  String get displaySuit {
    switch (suit) {
      case CardSuit.spades:
        return '♠';
      case CardSuit.hearts:
        return '♥';
      case CardSuit.diamonds:
        return '♦';
      case CardSuit.clubs:
        return '♣';
    }
  }
}

enum GameMode {
  standard,
  traversee,
}

enum GuessType {
  higher,
  lower,
  equal,
}

class HiLoGameLogic {
  static List<PlayingCard> createDeck() {
    final deck = <PlayingCard>[];
    final suits = [
      CardSuit.spades,
      CardSuit.hearts,
      CardSuit.diamonds,
      CardSuit.clubs
    ];
    final values = [
      CardValue.two,
      CardValue.three,
      CardValue.four,
      CardValue.five,
      CardValue.six,
      CardValue.seven,
      CardValue.eight,
      CardValue.nine,
      CardValue.ten,
      CardValue.valet,
      CardValue.dame,
      CardValue.roi,
      CardValue.as,
    ];

    for (final suit in suits) {
      for (final value in values) {
        final color = (suit == CardSuit.hearts || suit == CardSuit.diamonds)
            ? 'red'
            : 'black';
        deck.add(PlayingCard(value: value, suit: suit, color: color));
      }
    }

    return deck;
  }

  static List<PlayingCard> shuffleDeck(List<PlayingCard> deck) {
    final shuffled = List<PlayingCard>.from(deck);
    final random = Random();
    for (int i = shuffled.length - 1; i > 0; i--) {
      final j = random.nextInt(i + 1);
      final temp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = temp;
    }
    return shuffled;
  }

  static bool checkGuess(
    PlayingCard currentCard,
    PlayingCard nextCard,
    GuessType guess,
  ) {
    final currentValue = currentCard.numericValue;
    final nextValue = nextCard.numericValue;

    switch (guess) {
      case GuessType.higher:
        return nextValue > currentValue;
      case GuessType.lower:
        return nextValue < currentValue;
      case GuessType.equal:
        return nextValue == currentValue;
    }
  }

  static List<PlayingCard> regenerateDeckIfNeeded(List<PlayingCard> deck) {
    if (deck.length < 2) {
      final newDeck = createDeck();
      return shuffleDeck(newDeck);
    }
    return deck;
  }
}



