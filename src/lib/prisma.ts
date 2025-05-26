import { PrismaClient } from '@prisma/client'

// Vérifier si @prisma/client est correctement installé
function isPrismaClientAvailable() {
  try {
    // Vérification de la disponibilité sans utiliser require()
    // Comme nous importons déjà PrismaClient en haut, si cette ligne est atteinte, c'est que l'import a réussi
    const isAvailable = !!PrismaClient
    return isAvailable
  } catch (error) {
    // Si une erreur est levée, le module n'est pas disponible
    console.error('Erreur lors de la vérification de @prisma/client:', error)
    return false
  }
}

// Si Prisma n'est pas disponible en production, afficher une erreur plus explicite
if (process.env.NODE_ENV === 'production' && !isPrismaClientAvailable()) {
  console.error(`
    ------------------------------------------------------------
    ERREUR CRITIQUE: @prisma/client n'est pas correctement installé
    
    Veuillez exécuter les commandes suivantes sur le serveur:
    - npm install
    - npx prisma generate
    
    Ou ajouter "postinstall": "prisma generate" dans package.json
    ------------------------------------------------------------
  `)
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Initialiser avec une gestion d'erreur plus robuste
export const prisma = globalForPrisma.prisma ?? (() => {
  try {
    return new PrismaClient()
  } catch (error) {
    console.error('Erreur lors de l\'initialisation de PrismaClient:', error)
    throw new Error('Impossible d\'initialiser Prisma. Vérifiez l\'installation de @prisma/client.')
  }
})()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma 