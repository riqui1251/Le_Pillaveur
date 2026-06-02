class Player {
  final String id;
  final String name;
  final int createdAt;
  final PlayerStats stats;
  final PlayerPreferences preferences;

  Player({
    required this.id,
    required this.name,
    required this.createdAt,
    required this.stats,
    required this.preferences,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'createdAt': createdAt,
        'stats': stats.toJson(),
        'preferences': preferences.toJson(),
      };

  factory Player.fromJson(Map<String, dynamic> json) => Player(
        id: json['id'] as String,
        name: json['name'] as String,
        createdAt: json['createdAt'] as int,
        stats: PlayerStats.fromJson(json['stats'] as Map<String, dynamic>),
        preferences: PlayerPreferences.fromJson(
            json['preferences'] as Map<String, dynamic>),
      );

  Player copyWith({
    String? id,
    String? name,
    int? createdAt,
    PlayerStats? stats,
    PlayerPreferences? preferences,
  }) =>
      Player(
        id: id ?? this.id,
        name: name ?? this.name,
        createdAt: createdAt ?? this.createdAt,
        stats: stats ?? this.stats,
        preferences: preferences ?? this.preferences,
      );
}

class PlayerStats {
  final int gamesPlayed;
  final int wins;
  final int totalDrinks;
  final String? favoriteGame;
  final int? lastPlayed;
  final Map<String, GameStats>? gameStats;

  PlayerStats({
    required this.gamesPlayed,
    required this.wins,
    required this.totalDrinks,
    this.favoriteGame,
    this.lastPlayed,
    this.gameStats,
  });

  Map<String, dynamic> toJson() => {
        'gamesPlayed': gamesPlayed,
        'wins': wins,
        'totalDrinks': totalDrinks,
        'favoriteGame': favoriteGame,
        'lastPlayed': lastPlayed,
        'gameStats': gameStats?.map((k, v) => MapEntry(k, v.toJson())),
      };

  factory PlayerStats.fromJson(Map<String, dynamic> json) => PlayerStats(
        gamesPlayed: json['gamesPlayed'] as int? ?? 0,
        wins: json['wins'] as int? ?? 0,
        totalDrinks: json['totalDrinks'] as int? ?? 0,
        favoriteGame: json['favoriteGame'] as String?,
        lastPlayed: json['lastPlayed'] as int?,
        gameStats: json['gameStats'] != null
            ? (json['gameStats'] as Map<String, dynamic>).map(
                (k, v) => MapEntry(k, GameStats.fromJson(v as Map<String, dynamic>)))
            : null,
      );

  PlayerStats copyWith({
    int? gamesPlayed,
    int? wins,
    int? totalDrinks,
    String? favoriteGame,
    int? lastPlayed,
    Map<String, GameStats>? gameStats,
  }) =>
      PlayerStats(
        gamesPlayed: gamesPlayed ?? this.gamesPlayed,
        wins: wins ?? this.wins,
        totalDrinks: totalDrinks ?? this.totalDrinks,
        favoriteGame: favoriteGame ?? this.favoriteGame,
        lastPlayed: lastPlayed ?? this.lastPlayed,
        gameStats: gameStats ?? this.gameStats,
      );
}

class GameStats {
  final int gamesPlayed;
  final int wins;
  final int? totalDrinks;

  GameStats({
    required this.gamesPlayed,
    required this.wins,
    this.totalDrinks,
  });

  Map<String, dynamic> toJson() => {
        'gamesPlayed': gamesPlayed,
        'wins': wins,
        'totalDrinks': totalDrinks,
      };

  factory GameStats.fromJson(Map<String, dynamic> json) => GameStats(
        gamesPlayed: json['gamesPlayed'] as int? ?? 0,
        wins: json['wins'] as int? ?? 0,
        totalDrinks: json['totalDrinks'] as int?,
      );
}

class PlayerPreferences {
  final String color;
  final String? avatar;
  final String? nickname;
  final String? theme;
  final String? icon;
  final String? specialEffect;

  PlayerPreferences({
    required this.color,
    this.avatar,
    this.nickname,
    this.theme,
    this.icon,
    this.specialEffect,
  });

  Map<String, dynamic> toJson() => {
        'color': color,
        'avatar': avatar,
        'nickname': nickname,
        'theme': theme,
        'icon': icon,
        'specialEffect': specialEffect,
      };

  factory PlayerPreferences.fromJson(Map<String, dynamic> json) =>
      PlayerPreferences(
        color: json['color'] as String,
        avatar: json['avatar'] as String?,
        nickname: json['nickname'] as String?,
        theme: json['theme'] as String?,
        icon: json['icon'] as String?,
        specialEffect: json['specialEffect'] as String?,
      );

  PlayerPreferences copyWith({
    String? color,
    String? avatar,
    String? nickname,
    String? theme,
    String? icon,
    String? specialEffect,
  }) =>
      PlayerPreferences(
        color: color ?? this.color,
        avatar: avatar ?? this.avatar,
        nickname: nickname ?? this.nickname,
        theme: theme ?? this.theme,
        icon: icon ?? this.icon,
        specialEffect: specialEffect ?? this.specialEffect,
      );
}



