export interface OnlineChallenge {
  text: string
  drinks: number
}

// Defis online uniquement verifiables de facon declarative simple.
export const ONLINE_VERIFIABLE_CHALLENGES: OnlineChallenge[] = [
  { text: 'Nomme 3 boissons en 5 secondes', drinks: 2 },
  { text: 'Cite 4 capitales europeennes', drinks: 2 },
  { text: 'Fais rire un joueur en 10 secondes', drinks: 2 },
  { text: 'Donne 2 verites sur toi et 1 mensonge', drinks: 2 },
  { text: 'Epelle ton prenom a l envers', drinks: 1 },
]
