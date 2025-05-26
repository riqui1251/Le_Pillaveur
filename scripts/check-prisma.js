/**
 * Script de vérification et réparation de Prisma
 * Pour exécuter: node scripts/check-prisma.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Déterminer la commande à exécuter en fonction de l'OS
const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';
const npxCmd = isWindows ? 'npx.cmd' : 'npx';

// Chemins importants
const rootDir = path.resolve(__dirname, '..');
const prismaDir = path.join(rootDir, 'prisma');
const nodeModulesDir = path.join(rootDir, 'node_modules');
const prismaClientDir = path.join(nodeModulesDir, '@prisma', 'client');

console.log('🔍 Vérification de l\'installation de Prisma...');
console.log('📁 Dossier racine:', rootDir);
console.log('💻 Système d\'exploitation:', process.platform);

// Vérifier si le schéma Prisma existe
const schemaPath = path.join(prismaDir, 'schema.prisma');
if (!fs.existsSync(schemaPath)) {
  console.error('❌ ERREUR: Le fichier schema.prisma est introuvable dans', prismaDir);
  process.exit(1);
} else {
  console.log('✅ Le fichier schema.prisma existe');
}

// Exécuter une commande avec gestion d'erreur
function safeExec(cmd, options = {}) {
  try {
    return execSync(cmd, { stdio: 'inherit', cwd: rootDir, ...options });
  } catch (error) {
    console.error(`❌ Erreur lors de l'exécution de "${cmd}":`, error.message);
    return null;
  }
}

// Vérifier si le client Prisma est généré
if (!fs.existsSync(prismaClientDir)) {
  console.warn('⚠️ Le client Prisma n\'est pas généré dans', prismaClientDir);
  console.log('🔧 Génération du client Prisma...');
  
  // Tentative de génération avec npx
  if (safeExec(`${npxCmd} prisma generate`) === null) {
    console.log('⚠️ Première tentative échouée, vérification de l\'installation de Prisma...');
    
    // Vérifier si Prisma CLI est installé
    try {
      execSync(`${npxCmd} prisma --version`, { stdio: 'pipe', cwd: rootDir });
      console.log('✅ Prisma CLI est installé, mais la génération a échoué');
      
      // Vérifier les permissions
      console.log('🔍 Vérification des permissions...');
      if (!isWindows) {
        try {
          const nodeModulesStat = fs.statSync(nodeModulesDir);
          console.log(`📁 Permissions de node_modules: ${nodeModulesStat.mode.toString(8)}`);
          
          // Essayer de corriger les permissions si possible
          safeExec(`chmod -R 755 ${nodeModulesDir}`);
          console.log('🔧 Tentative de correction des permissions effectuée');
        } catch (err) {
          console.error('❌ Problème avec les permissions:', err.message);
        }
      }
      
      // Réessayer la génération
      console.log('🔄 Tentative alternative de génération...');
      if (safeExec(`${npxCmd} prisma generate --schema=${schemaPath}`) === null) {
        console.error('❌ Impossible de générer le client Prisma, essayez manuellement');
      }
    } catch (error) {
      // Prisma n'est pas installé, tentative d'installation
      console.log('📥 Prisma CLI n\'est pas installé. Installation en cours...');
      
      if (safeExec(`${npmCmd} install prisma@latest @prisma/client@latest`) !== null) {
        console.log('✅ Prisma installé avec succès, tentative de génération...');
        safeExec(`${npxCmd} prisma generate`);
      } else {
        console.error('❌ Impossible d\'installer Prisma');
        console.log('💡 Essayez manuellement: npm install prisma @prisma/client --save');
      }
    }
  } else {
    console.log('✅ Client Prisma généré avec succès');
  }
} else {
  console.log('✅ Le client Prisma est généré dans', prismaClientDir);
  
  // Vérifier si le client est à jour
  try {
    console.log('🔄 Vérification si le client Prisma est à jour...');
    const generatedIndexPath = path.join(prismaClientDir, 'index.js');
    
    if (fs.existsSync(generatedIndexPath)) {
      const generatedTime = fs.statSync(generatedIndexPath).mtime;
      const schemaTime = fs.statSync(schemaPath).mtime;
      
      if (schemaTime > generatedTime) {
        console.warn('⚠️ Le schéma a été modifié après la génération du client. Régénération...');
        safeExec(`${npxCmd} prisma generate`);
        console.log('✅ Client Prisma mis à jour');
      } else {
        console.log('✅ Le client Prisma est à jour');
      }
    } else {
      console.warn('⚠️ Client Prisma incomplet. Régénération...');
      safeExec(`${npxCmd} prisma generate`);
      console.log('✅ Client Prisma régénéré');
    }
  } catch (error) {
    console.error('❌ Erreur lors de la vérification/mise à jour du client:', error.message);
  }
}

// Vérifier si la base de données existe
const dbPath = path.join(prismaDir, 'dev.db');
if (!fs.existsSync(dbPath)) {
  console.warn('⚠️ La base de données SQLite (dev.db) n\'existe pas encore');
  console.log('🔧 Tentative de création de la base de données...');
  safeExec(`${npxCmd} prisma migrate dev --name init`);
}

console.log('\n✅ Vérification terminée');
console.log('\n📋 Résumé pour le serveur:');
console.log('1. Assurez-vous que le fichier .env contient: DATABASE_URL="file:./prisma/dev.db"');
console.log('2. Si les problèmes persistent, exécutez ces commandes:');
console.log('   cd /home/ftpuser/www/monprojet');
console.log('   npm install');
console.log('   npx prisma generate');
console.log('3. Si vous avez des erreurs de permission:');
console.log('   chmod -R 755 node_modules'); 