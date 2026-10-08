/** Enseigne de carte à jouer — identité « Cartes sur Table ». */
export type GameSuit = 'spade' | 'heart' | 'diamond' | 'club';

export type GameMeta = {
  id: string;
  title: string;
  description: string;
  path: string;
  emoji: string;
  gradient: string;
  fallbackColor: string;
  colorFrom?: string;
  colorTo?: string;
  /**
   * Famille de jeu, exprimée en enseigne de carte :
   * ♠ rôles cachés / suspense · ♥ culture / social · ♦ hasard / dés · ♣ créa / adresse.
   */
  suit?: GameSuit;
  /** Rang affiché dans le coin de la carte (A, K, Q, J, 10…). */
  rank?: string;
  hidden?: boolean;
  onlineReady?: boolean;
  /**
   * Jeu impossible en local (info cachée multi-écrans). Il reste VISIBLE au
   * hub en mode local — il fait envie et c'est la porte vers le compte — mais
   * rangé dans une section « en ligne uniquement » qui dit ce qu'il faut pour
   * y jouer, au lieu de laisser le groupe le découvrir après le clic.
   */
  onlineOnly?: boolean;
  /**
   * Bornes de joueurs EN LIGNE — informatif UI (hub + lobby). La vérité côté
   * serveur vit dans `src/lib/online/game-adapters.ts` ; un test vérifie que
   * les deux restent synchronisés.
   */
  minPlayers?: number;
  maxPlayers?: number;
  /**
   * Bornes de joueurs EN LOCAL (un téléphone qui tourne autour de la table),
   * pour les jeux sans version en ligne : le minimum est celui que la page du
   * jeu exige avant de lancer (`selectedPlayers.length >= n`). Pas de
   * `localMaxPlayers` tant qu'aucun moteur local n'impose de plafond — la
   * sélection de joueurs n'en a pas, et Pyramide n'est borné que par son
   * paquet en mode classique. Lu par src/lib/collections.ts (« à 2 joueurs »).
   */
  localMinPlayers?: number;
  localMaxPlayers?: number;
  /** L'hôte peut activer « compléter avec des bots » au lobby (lancer sous le minimum). */
  botsFillable?: boolean;
  /**
   * Tenue du jeu SEUL contre des bots — réservé aux jeux `botsFillable` (un
   * test le garde). Pourquoi : en prod (07/10/2026), une 1re partie jouée
   * seul contre des bots n'est rejouée que 4 fois sur 21, contre 25 sur 36 à
   * plusieurs, et Dilemmes, Sans Filtre, Crobard, Grand Bluff, le Menteur et
   * l'Espion y sont quittés en 1 à 2 min. Le premier essai doit montrer un
   * jeu qui tient sans potes, pas un salon vide. La MESURE tranche, pas
   * l'intention : un jeu ne passe 'great' que si ses parties solo durent
   * comme celles du Quiz ou du Président.
   * - 'great' : les bots JOUENT pour de vrai (combos au Président, bonnes
   *   réponses dosées par la difficulté au Quiz, débat et rôles clés au
   *   Loup-Garou), ou le jeu est un pari de chacun contre le hasard (Purple,
   *   1220, le plateau du Petit Buveur) où leur niveau ne change rien ;
   * - 'group' : le sel du jeu, c'est la discussion ou le bluff entre
   *   humains, et les bots n'y font que de la figuration (indice « … » et
   *   vote au hasard à l'Imposteur, aucune accusation à l'Espion, aucun
   *   dessin à Crobard, juge au hasard à Sans Filtre, bluffs tirés des
   *   mauvaises réponses au Grand Bluff, votes de persona à Dilemmes) : seul,
   *   on n'y voit rien. Le Menteur y est aussi : ses bots enchérissent sur
   *   les probabilités, mais un bluff sans visage à lire ne retient personne
   *   — quitté en 1 à 2 min seul, comme les autres.
   * Lu par le hub en mode solo (rangée « Parfaits en solo » d'abord, badge
   * « Mieux à plusieurs » ensuite) et par TryBotsGate (encart « ce jeu se
   * joue entre potes » + `soloAlternativeFor`). Ne retire jamais un jeu.
   */
  soloFit?: 'great' | 'group';
  /** Proposé en mode Soft (sans gorgées) — sous-ensemble des jeux onlineReady. */
  softModeReady?: boolean;
  /**
   * Jeu phare : remonté dans la rangée « les incontournables » en tête du hub.
   * Réservé aux jeux les plus démonstratifs du produit — au-delà de 4 ou 5, la
   * rangée ne met plus rien en avant. Un jeu `hidden` n'y a pas sa place.
   */
  featured?: boolean;
  /**
   * Jeu publié en BÊTA : jouable et au catalogue, mais encore en rodage —
   * un petit badge « Bêta » le dit sur sa carte du hub et sur sa vitrine,
   * plutôt que de le laisser masqué jusqu'à la perfection.
   */
  beta?: boolean;
  /**
   * Langues dans lesquelles le CONTENU du jeu existe (cartes, questions…),
   * quand il n'existe pas dans les quatre : Sans Filtre et Dilemmes n'ont que
   * des cartes françaises. Absent = toutes les langues du site. Le serveur
   * refuse une table dont la langue n'y est pas (content_lang_unavailable),
   * le hub le signale par un badge « FR » — voir hasContentIn.
   */
  contentLangs?: readonly string[];
};

// Source unique de vérité pour les jeux
export const GAMES: GameMeta[] = [
  {
    id: 'monsieur-3',
    title: 'Monsieur 3',
    description: "Évite le 3 comme la peste : chaque dé peut te faire trinquer.",
    path: '/games/monsieur-3',
    emoji: '🎲',
    suit: 'diamond',
    rank: 'J',
    gradient: 'from-sky-500 to-indigo-600',
    colorFrom: '#0ea5e9',
    colorTo: '#4f46e5',
    fallbackColor: '#6366f1',
    localMinPlayers: 2,
  },
  {
    id: 'pmu',
    title: 'Course PMU',
    description: "Mise sur ton canasson et hurle sur la ligne d’arrivée — le perdant régale.",
    path: '/games/pmu',
    emoji: '🏇',
    suit: 'diamond',
    rank: '7',
    gradient: 'from-fuchsia-600 to-violet-700',
    colorFrom: '#c026d3',
    colorTo: '#6d28d9',
    fallbackColor: '#6366f1',
    localMinPlayers: 2,
  },
  {
    id: 'petit-buveur',
    title: 'Le Petit Buveur',
    description: "Le plateau de l’apéro : avance, pioche des défis, distribue des gorgées.",
    path: '/games/petit-buveur',
    emoji: '🎲',
    suit: 'diamond',
    rank: 'A',
    gradient: 'from-emerald-600 to-teal-400',
    colorFrom: '#059669',
    colorTo: '#2dd4bf',
    fallbackColor: '#10b981',
    onlineReady: true,
    minPlayers: 2,
    maxPlayers: 99,
    botsFillable: true,
    soloFit: 'great',
  },
  {
    id: 'toucher-coule',
    title: 'Toucher-Coulé',
    description: 'La bataille navale apéro en équipes : touché tu bois, coulé tu trinques !',
    path: '/games/toucher-coule',
    emoji: '🚢',
    suit: 'club',
    rank: 'Q',
    gradient: 'from-sky-600 to-cyan-400',
    colorFrom: '#0284c7',
    colorTo: '#22d3ee',
    fallbackColor: '#0ea5e9',
    onlineReady: true,
    minPlayers: 1,
    maxPlayers: 8,
    onlineOnly: true,
    softModeReady: true,
  },
  {
    id: 'menteur',
    title: 'Le Menteur',
    description: 'Dés cachés, enchères et bluff : crie « Menteur ! » au bon moment ou trinque !',
    path: '/games/menteur',
    emoji: '🎲',
    suit: 'spade',
    rank: 'J',
    gradient: 'from-orange-600 to-red-500',
    colorFrom: '#ea580c',
    colorTo: '#ef4444',
    fallbackColor: '#f97316',
    onlineReady: true,
    minPlayers: 2,
    botsFillable: true,
    // Quitté en 1 à 2 min seul contre des bots (07/10/2026) : voir soloFit.
    soloFit: 'group',
    maxPlayers: 6,
    onlineOnly: true,
    softModeReady: true,
  },
  {
    id: 'imposteur',
    title: "L'Imposteur",
    description: 'Un mot secret, un intrus parmi vous : indices, votes et bluff au sommet !',
    path: '/games/imposteur',
    emoji: '🕵️',
    suit: 'spade',
    rank: 'K',
    gradient: 'from-violet-600 to-fuchsia-500',
    colorFrom: '#7c3aed',
    colorTo: '#d946ef',
    fallbackColor: '#a855f7',
    onlineReady: true,
    minPlayers: 3,
    botsFillable: true,
    soloFit: 'group',
    maxPlayers: 16,
    onlineOnly: true,
    softModeReady: true,
  },
  {
    id: 'quiz',
    title: 'Le Grand Pillaveur',
    description: 'Le quiz apéro : réponds vite et juste, ou bois ! Téléphones-buzzers et podium final.',
    path: '/games/quiz',
    emoji: '🧠',
    suit: 'heart',
    rank: 'A',
    gradient: 'from-blue-600 to-cyan-400',
    colorFrom: '#2563eb',
    colorTo: '#22d3ee',
    fallbackColor: '#3b82f6',
    onlineReady: true,
    minPlayers: 2,
    botsFillable: true,
    soloFit: 'great',
    maxPlayers: 16,
    onlineOnly: true,
    softModeReady: true,
    featured: true,
  },
  {
    id: 'loup-garou',
    title: 'Loup-Garou',
    description: 'Le classique des soirées, version apéro : loups, voyante, débats et lynchages qui trinquent !',
    path: '/games/loup-garou',
    emoji: '🐺',
    suit: 'spade',
    rank: 'A',
    gradient: 'from-slate-700 to-indigo-600',
    colorFrom: '#334155',
    colorTo: '#4f46e5',
    fallbackColor: '#6366f1',
    onlineReady: true,
    minPlayers: 4,
    botsFillable: true,
    soloFit: 'great',
    maxPlayers: 12,
    onlineOnly: true,
    softModeReady: true,
    featured: true,
  },
  {
    id: 'hi-lo',
    title: 'Hi/Lo',
    description: "Plus haute ou plus basse ? Un pari tout bête, des gorgées qui tombent très vite.",
    path: '/games/hi-lo',
    emoji: '🃏',
    suit: 'diamond',
    rank: '10',
    gradient: 'from-rose-500 to-fuchsia-500',
    colorFrom: '#f43f5e',
    colorTo: '#d946ef',
    fallbackColor: '#f97316',
    localMinPlayers: 2,
  },
  {
    id: 'purple',
    title: 'Purple',
    description: "Rouge, noir… ou Purple ? Le pari le plus traître du comptoir.",
    path: '/games/purple',
    emoji: '🟣',
    suit: 'diamond',
    rank: 'Q',
    gradient: 'from-purple-600 to-violet-500',
    colorFrom: '#9333ea',
    colorTo: '#8b5cf6',
    fallbackColor: '#a855f7',
    onlineReady: true,
    minPlayers: 2,
    maxPlayers: 16,
    botsFillable: true,
    soloFit: 'great',
  },
  {
    id: 'pyramide',
    title: 'Pyramide',
    description: "Grimpe la pyramide : les gorgées doublent à chaque étage.",
    path: '/games/pyramide',
    emoji: '🔺',
    suit: 'diamond',
    rank: '9',
    gradient: 'from-amber-600 to-yellow-400',
    colorFrom: '#d97706',
    colorTo: '#facc15',
    fallbackColor: '#eab308',
    localMinPlayers: 2,
  },
  {
    id: 'plinko',
    title: 'Plinko',
    description: "Lâche la bille, retiens ton souffle : là où elle tombe, quelqu’un trinque.",
    path: '/games/plinko',
    emoji: '🔵',
    suit: 'diamond',
    rank: '8',
    gradient: 'from-emerald-500 to-lime-400',
    colorFrom: '#10b981',
    colorTo: '#a3e635',
    fallbackColor: '#22c55e',
    localMinPlayers: 2,
  },
  {
    id: 'roue-des-gorgees',
    hidden: true,
    title: 'Roue des Gorgées',
    description: 'Ajoute des gorgées/actions et fais tourner la roue !',
    path: '/games/roue-des-gorgees',
    emoji: '🎡',
    gradient: 'from-pink-600 to-rose-400',
    colorFrom: '#db2777',
    colorTo: '#fb7185',
    fallbackColor: '#ec4899',
  },
  {
    id: 'ballon-surprise',
    hidden: true,
    title: 'Ballon Surprise',
    description: "Choisis ton ballon et prie pour qu’il gagne la course !",
    path: '/games/ballon-surprise',
    emoji: '🎈',
    gradient: 'from-sky-500 to-cyan-400',
    colorFrom: '#0ea5e9',
    colorTo: '#22d3ee',
    fallbackColor: '#38bdf8',
  },
  {
    id: 'petits-points',
    hidden: true,
    title: 'Petits Points',
    description: "Vise juste, vise vite : chaque point compte, chaque raté se paie.",
    path: '/games/petits-points',
    emoji: '🎯',
    gradient: 'from-indigo-600 to-blue-600',
    colorFrom: '#4f46e5',
    colorTo: '#2563eb',
    fallbackColor: '#3b82f6',
  },
  {
    id: 'pendu',
    hidden: true,
    title: 'Le Pendu des Gorgées',
    description: "Devine le mot avant d’être pendu : chaque lettre ratée se boit.",
    path: '/games/pendu',
    emoji: '🎯',
    gradient: 'from-purple-600 to-indigo-600',
    colorFrom: '#7c3aed',
    colorTo: '#4f46e5',
    fallbackColor: '#6366f1',
  },
  {
    id: 'trial-poursuite',
    hidden: true,
    title: 'Trial Poursuite',
    description: "Relève des défis fous sous pression : coordination, créativité, rapidité.",
    path: '/games/trial-poursuite',
    emoji: '🏍️',
    gradient: 'from-red-600 to-orange-500',
    colorFrom: '#dc2626',
    colorTo: '#f97316',
    fallbackColor: '#ef4444',
  },
  {
    id: '1220',
    title: '1220',
    description:
      'Un dé 12 et un dé 20 : pariez sur la parité, une plage de somme, et deux chiffres clés pour boire ou faire boire.',
    path: '/games/1220',
    emoji: '🎲',
    suit: 'diamond',
    rank: 'K',
    gradient: 'from-violet-600 to-amber-500',
    colorFrom: '#7c3aed',
    colorTo: '#f59e0b',
    fallbackColor: '#a855f7',
    onlineReady: true,
    minPlayers: 2,
    maxPlayers: 16,
    botsFillable: true,
    soloFit: 'great',
  },
  {
    id: 'bluff',
    title: 'Le Grand Bluff',
    description:
      'Une question, une fausse réponse à inventer, et un vote parmi les bluffs : trouve la vraie ou trompe tout le monde !',
    path: '/games/bluff',
    emoji: '🃏',
    suit: 'heart',
    rank: 'K',
    gradient: 'from-rose-600 to-amber-500',
    colorFrom: '#e11d48',
    colorTo: '#f59e0b',
    fallbackColor: '#f43f5e',
    onlineReady: true,
    minPlayers: 3,
    maxPlayers: 16,
    onlineOnly: true,
    botsFillable: true,
    soloFit: 'group',
    softModeReady: true,
  },
  {
    id: 'espion',
    title: "Qui est l'Espion ?",
    description:
      "Un lieu secret, un espion qui ne sait rien : questionnez-vous, accusez, ou devinez le lieu avant la fin du temps imparti !",
    path: '/games/espion',
    emoji: '🕵️',
    suit: 'spade',
    rank: 'Q',
    gradient: 'from-slate-700 to-cyan-600',
    colorFrom: '#334155',
    colorTo: '#0891b2',
    fallbackColor: '#0e7490',
    onlineReady: true,
    minPlayers: 3,
    maxPlayers: 16,
    onlineOnly: true,
    botsFillable: true,
    soloFit: 'group',
    softModeReady: true,
  },
  {
    id: 'tabou',
    // Publié en bêta : le relais vocal (TURN) qui le rend jouable hors d'un
    // même Wi-Fi est en service en production.
    beta: true,
    title: 'Tabou Vocal',
    description:
      'Décris un mot à voix haute sans prononcer les 4 mots tabous : ton équipe devine, les adversaires guettent la faute !',
    path: '/games/tabou',
    emoji: '🤐',
    suit: 'heart',
    rank: 'Q',
    gradient: 'from-emerald-600 to-teal-500',
    colorFrom: '#059669',
    colorTo: '#14b8a6',
    fallbackColor: '#10b981',
    onlineReady: true,
    minPlayers: 4,
    maxPlayers: 16,
    onlineOnly: true,
    // Pas de bots au lancement : un bot ne décrit pas un mot à voix haute,
    // ses manches de décrivant tourneraient à vide. Deux joueurs HUMAINS par
    // équipe sont exigés au lancement comme à « Rejouer »
    // (tabouHasTwoHumansPerTeam, online-tabou.ts) ; les bots ne font que
    // remplacer un joueur parti en cours de partie.
    softModeReady: true,
  },
  {
    id: 'crobard',
    title: 'Crobard',
    description:
      "Choisis un mot, dessine-le en direct sur l'écran : premier qui devine marque gros, le dessinateur aussi !",
    path: '/games/crobard',
    emoji: '🎨',
    suit: 'club',
    rank: 'A',
    gradient: 'from-fuchsia-600 to-orange-500',
    colorFrom: '#c026d3',
    colorTo: '#f97316',
    fallbackColor: '#e11d48',
    onlineReady: true,
    minPlayers: 3,
    maxPlayers: 16,
    onlineOnly: true,
    botsFillable: true,
    soloFit: 'group',
    softModeReady: true,
    featured: true,
  },
  {
    id: 'sans-filtre',
    title: 'Sans Filtre',
    description:
      'Une carte à trou, des réponses de mauvaise foi : le juge du tour couronne la plus drôle. À lire à voix haute !',
    path: '/games/sans-filtre',
    emoji: '🃏',
    suit: 'club',
    rank: 'J',
    gradient: 'from-zinc-800 to-amber-600',
    colorFrom: '#27272a',
    colorTo: '#d97706',
    fallbackColor: '#b45309',
    onlineReady: true,
    minPlayers: 4,
    maxPlayers: 16,
    onlineOnly: true,
    botsFillable: true,
    soloFit: 'group',
    softModeReady: true,
    featured: true,
    // Cartes écrites en français seulement (src/lib/sans-filtre/data/cards.fr.ts).
    contentLangs: ['fr'],
  },
  {
    id: 'mots-codes',
    title: 'Mots Codés',
    description:
      'Deux équipes, 25 mots, un Maître-mot par camp : un indice, un nombre, et gare à l’assassin !',
    path: '/games/mots-codes',
    emoji: '🗝️',
    suit: 'heart',
    rank: 'J',
    gradient: 'from-amber-600 to-red-700',
    colorFrom: '#d97706',
    colorTo: '#b91c1c',
    fallbackColor: '#b45309',
    onlineReady: true,
    minPlayers: 4,
    maxPlayers: 16,
    onlineOnly: true,
    softModeReady: true,
  },
  {
    id: 'dilemmes',
    title: 'Dilemmes',
    description:
      'Tu préfères, Je n’ai jamais, Qui de la table : votes secrets révélés d’un coup — la minorité trinque !',
    path: '/games/dilemmes',
    emoji: '⚖️',
    suit: 'heart',
    rank: '9',
    gradient: 'from-rose-700 to-amber-600',
    colorFrom: '#be123c',
    colorTo: '#d97706',
    fallbackColor: '#be123c',
    onlineReady: true,
    minPlayers: 3,
    maxPlayers: 16,
    onlineOnly: true,
    botsFillable: true,
    soloFit: 'group',
    softModeReady: true,
    // Cartes écrites en français seulement (src/lib/dilemmes/data/index.ts).
    contentLangs: ['fr'],
  },
  {
    id: 'petit-bac',
    title: 'Petit Bac',
    description:
      'Une lettre, cinq catégories : le premier qui remplit tout crie STOP. Réponses uniques 2 pts, doublons 1 pt — contestez à la révélation !',
    path: '/games/petit-bac',
    emoji: '📝',
    suit: 'heart',
    rank: '10',
    gradient: 'from-sky-700 to-amber-600',
    colorFrom: '#0369a1',
    colorTo: '#d97706',
    fallbackColor: '#0369a1',
    onlineReady: true,
    minPlayers: 2,
    maxPlayers: 16,
    onlineOnly: true,
    softModeReady: true,
  },
  {
    id: 'president',
    title: 'Président',
    description:
      'Le jeu de cartes des cours de récré : videz votre main, coupez au 2, et faites porter le Trou. L’échange des cartes est automatique entre les manches !',
    path: '/games/president',
    emoji: '👑',
    suit: 'spade',
    rank: '10',
    gradient: 'from-emerald-800 to-amber-600',
    colorFrom: '#065f46',
    colorTo: '#d97706',
    fallbackColor: '#065f46',
    onlineReady: true,
    minPlayers: 4,
    maxPlayers: 8,
    onlineOnly: true,
    botsFillable: true,
    soloFit: 'great',
    softModeReady: true,
  },
  {
    id: 'telephone-dessine',
    title: 'Téléphone Dessiné',
    description:
      "Écris une phrase, le suivant la dessine, le suivant la devine... jusqu'au fou rire collectif en fin de partie !",
    path: '/games/telephone-dessine',
    emoji: '📞',
    suit: 'club',
    rank: 'K',
    gradient: 'from-teal-600 to-indigo-500',
    colorFrom: '#0d9488',
    colorTo: '#6366f1',
    fallbackColor: '#14b8a6',
    onlineReady: true,
    minPlayers: 3,
    maxPlayers: 8,
    onlineOnly: true,
    softModeReady: true,
  },
];

export function getGameById(id: string): GameMeta | undefined {
  return GAMES.find(g => g.id === id);
}

/**
 * Le contenu du jeu existe-t-il dans cette langue ? Vrai pour tout jeu sans
 * `contentLangs`. Une langue absente vaut « fr » : c'est celle que prend une
 * table ouverte sans cookie de langue (POST /api/online/rooms).
 */
export function hasContentIn(
  game: Pick<GameMeta, 'contentLangs'>,
  lang: string | null | undefined
): boolean {
  return !game.contentLangs || game.contentLangs.includes(lang || 'fr');
}




/**
 * Hub en mode solo : les jeux « parfaits en solo » d'abord, tous les autres
 * ensuite — dans l'ordre reçu (celui du registre), sans en retirer aucun. Un
 * jeu sans `soloFit` tombe dans les autres : il n'a pas fait ses preuves seul.
 */
export function splitBySoloFit<T extends Pick<GameMeta, 'soloFit'>>(
  games: readonly T[]
): { great: T[]; others: T[] } {
  return {
    great: games.filter((g) => g.soloFit === 'great'),
    others: games.filter((g) => g.soloFit !== 'great'),
  };
}

/**
 * Le jeu « parfait en solo » à proposer à la place d'un jeu fait pour les
 * potes (encart de TryBotsGate) — « Essayer plutôt le Quiz ». Il doit
 * s'ouvrir seul avec des bots ICI : visible, en ligne, complétable par des
 * bots, cartes dans la langue de la page et, en ambiance Sans alcool, doté
 * de sa variante (la table serait sinon refusée ou hors ambiance).
 * Préférence : un phare de la même famille (l'Espion ou l'Imposteur, rôles
 * cachés, renvoient au Loup-Garou), puis un phare (le Quiz), puis la même
 * famille, puis le premier venu. Null si rien ne convient.
 */
export function soloAlternativeFor(
  gameId: string,
  { locale, soft = false, games = GAMES }: { locale?: string | null; soft?: boolean; games?: readonly GameMeta[] } = {}
): GameMeta | null {
  const game = games.find((g) => g.id === gameId);
  const candidates = games.filter(
    (g) =>
      g.id !== gameId &&
      g.soloFit === 'great' &&
      Boolean(g.botsFillable) &&
      Boolean(g.onlineReady) &&
      !g.hidden &&
      (!soft || Boolean(g.softModeReady)) &&
      hasContentIn(g, locale)
  );
  const sameSuit = (g: GameMeta) => Boolean(game?.suit) && g.suit === game?.suit;
  return (
    candidates.find((g) => g.featured && sameSuit(g)) ??
    candidates.find((g) => g.featured) ??
    candidates.find(sameSuit) ??
    candidates[0] ??
    null
  );
}
