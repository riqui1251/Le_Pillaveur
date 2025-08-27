export type GameMeta = {
  id: string;
  title: string;
  description: string;
  path: string;
  emoji: string;
  gradient: string;
  fallbackColor: string;
  colorFrom?: string; // Hex/RGB for inline gradients (avoids Tailwind purge)
  colorTo?: string;
};

// Source unique de vérité pour les jeux
export const GAMES: GameMeta[] = [
  {
    id: 'roulette-russe',
    title: 'Roulette Russe',
    description: "Un jeu de hasard où chaque joueur tire à tour de rôle. Survivre ou boire !",
    path: '/games/roulette-russe',
    emoji: '🎲',
    gradient: 'from-red-600 to-amber-500',
    colorFrom: '#dc2626',
    colorTo: '#f59e0b',
    fallbackColor: '#f97316',
  },
  {
    id: 'monsieur-3',
    title: 'Monsieur 3',
    description: 'Un jeu de dés convivial où vous devez éviter les 3 et autres combinaisons',
    path: '/games/monsieur-3',
    emoji: '🎲',
    gradient: 'from-sky-500 to-indigo-600',
    colorFrom: '#0ea5e9',
    colorTo: '#4f46e5',
    fallbackColor: '#6366f1',
  },
  {
    id: 'pmu',
    title: 'Course PMU',
    description: 'Un jeu de paris hippiques entre amis',
    path: '/games/pmu',
    emoji: '🏇',
    gradient: 'from-fuchsia-600 to-violet-700',
    colorFrom: '#c026d3',
    colorTo: '#6d28d9',
    fallbackColor: '#6366f1',
  },
  {
    id: 'petit-buveur',
    title: 'Le Petit Buveur',
    description: 'Un jeu de plateau festif avec des défis et des gorgées',
    path: '/games/petit-buveur',
    emoji: '🎲',
    gradient: 'from-emerald-600 to-teal-400',
    colorFrom: '#059669',
    colorTo: '#2dd4bf',
    fallbackColor: '#10b981',
  },
  {
    id: 'hi-lo',
    title: 'Hi/Lo',
    description: 'Devinez si la prochaine carte sera plus haute ou plus basse',
    path: '/games/hi-lo',
    emoji: '🃏',
    gradient: 'from-rose-500 to-fuchsia-500',
    colorFrom: '#f43f5e',
    colorTo: '#d946ef',
    fallbackColor: '#f97316',
  },
  {
    id: 'pyramide',
    title: 'Pyramide',
    description: 'Retournez les cartes et progressez dans la pyramide',
    path: '/games/pyramide',
    emoji: '🔺',
    gradient: 'from-amber-600 to-yellow-400',
    colorFrom: '#d97706',
    colorTo: '#facc15',
    fallbackColor: '#eab308',
  },
  {
    id: 'plinko',
    title: 'Plinko',
    description: 'Faites tomber une balle à travers des obstacles pour gagner des gorgées',
    path: '/games/plinko',
    emoji: '🔵',
    gradient: 'from-emerald-500 to-lime-400',
    colorFrom: '#10b981',
    colorTo: '#a3e635',
    fallbackColor: '#22c55e',
  },
  {
    id: 'roue-des-gorgees',
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
    title: 'Ballon Surprise',
    description: "Choisissez un ballon et priez pour qu'il gagne la course !",
    path: '/games/ballon-surprise',
    emoji: '🎈',
    gradient: 'from-sky-500 to-cyan-400',
    colorFrom: '#0ea5e9',
    colorTo: '#22d3ee',
    fallbackColor: '#38bdf8',
  },
  {
    id: 'the-choice',
    title: 'The Choice',
    description: 'Un jeu de choix où chaque décision compte !',
    path: '/games/the-choice',
    emoji: '🎯',
    gradient: 'from-violet-600 to-purple-700',
    colorFrom: '#7c3aed',
    colorTo: '#6b21a8',
    fallbackColor: '#8b5cf6',
  },
  {
    id: 'petits-points',
    title: 'Petits Points',
    description: 'Un jeu de précision et de rapidité où chaque point compte !',
    path: '/games/petits-points',
    emoji: '🎯',
    gradient: 'from-indigo-600 to-blue-600',
    colorFrom: '#4f46e5',
    colorTo: '#2563eb',
    fallbackColor: '#3b82f6',
  },
];

export function getGameById(id: string): GameMeta | undefined {
  return GAMES.find(g => g.id === id);
}



