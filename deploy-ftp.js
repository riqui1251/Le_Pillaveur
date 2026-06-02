const fs = require('fs');
const path = require('path');

// Configuration du déploiement
const config = {
  sourceDir: './',
  deployDir: './deploy',
  includeFiles: [
    'package.json',
    'next.config.js',
    'tailwind.config.js',
    'tailwind.config.ts',
    'tsconfig.json',
    'postcss.config.js',
    'postcss.config.mjs',
    'eslint.config.mjs',
    'components.json',
    'public/',
    'src/',
    'prisma/schema.prisma',
    'prisma/migrations/',
    'scripts/'
  ],
  excludePatterns: [
    'node_modules',
    '.git',
    '.next',
    'out',
    'build',
    'dist',
    '.env*',
    '*.log',
    '*.db',
    '*.db-journal',
    '.cache',
    '.vscode',
    '.idea',
    'coverage',
    'deploy'
  ]
};

// Fonction pour vérifier si un fichier/dossier doit être exclu
function shouldExclude(filePath) {
  return config.excludePatterns.some(pattern => {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace('*', '.*'));
      return regex.test(filePath);
    }
    return filePath.includes(pattern);
  });
}

// Fonction pour vérifier si un fichier/dossier doit être inclus
function shouldInclude(filePath) {
  return config.includeFiles.some(pattern => {
    if (pattern.endsWith('/')) {
      return filePath.startsWith(pattern);
    }
    return filePath === pattern;
  });
}

// Fonction pour copier récursivement les fichiers
function copyDirectory(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const items = fs.readdirSync(src);
  
  for (const item of items) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    
    if (shouldExclude(srcPath)) {
      console.log(`Exclu: ${srcPath}`);
      continue;
    }
    
    if (shouldInclude(srcPath) || shouldInclude(item)) {
      const stat = fs.statSync(srcPath);
      
      if (stat.isDirectory()) {
        copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
        console.log(`Copié: ${srcPath}`);
      }
    }
  }
}

// Fonction principale
function prepareDeploy() {
  console.log('🚀 Préparation du déploiement FTP...');
  
  // Nettoyer le dossier de déploiement
  if (fs.existsSync(config.deployDir)) {
    fs.rmSync(config.deployDir, { recursive: true, force: true });
  }
  
  // Créer le dossier de déploiement
  fs.mkdirSync(config.deployDir, { recursive: true });
  
  // Copier les fichiers
  copyDirectory(config.sourceDir, config.deployDir);
  
  console.log('✅ Déploiement préparé dans le dossier ./deploy');
  console.log('📁 Vous pouvez maintenant transférer le contenu du dossier ./deploy via FTP');
}

// Exécuter le script
if (require.main === module) {
  prepareDeploy();
}

module.exports = { prepareDeploy, config };














