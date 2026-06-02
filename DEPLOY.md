# Guide de Déploiement FTP

## Méthode 1 : Utilisation du script de déploiement (Recommandé)

### Étape 1 : Préparer le déploiement
```bash
npm run deploy:prepare
```

Cette commande va créer un dossier `./deploy` contenant uniquement les fichiers nécessaires pour la production.

### Étape 2 : Transférer via FTP
1. Connectez-vous à votre serveur FTP
2. Naviguez vers le dossier de destination
3. Transférez le contenu du dossier `./deploy`

## Méthode 2 : Configuration manuelle du client FTP

### Pour FileZilla :
1. Créez un fichier `.ftpignore` (déjà créé)
2. Dans FileZilla, allez dans **Édition > Paramètres > Transfert de fichiers**
3. Activez l'option "Ignorer les fichiers listés dans .ftpignore"

### Pour WinSCP :
1. Créez un fichier `.ftpignore` (déjà créé)
2. Dans WinSCP, allez dans **Options > Préférences > Transfert**
3. Activez l'option "Ignorer les fichiers listés dans .ftpignore"

## Fichiers exclus du transfert

Les fichiers suivants sont automatiquement exclus :
- `.git/` - Dossier de contrôle de version
- `node_modules/` - Dépendances (à installer sur le serveur)
- `.next/` - Fichiers de build Next.js
- `.env*` - Fichiers de configuration sensibles
- `*.log` - Fichiers de logs
- `*.db` - Bases de données locales
- `.vscode/`, `.idea/` - Configuration IDE

## Après le déploiement

1. **Installer les dépendances** sur le serveur :
   ```bash
   npm install --production
   ```

2. **Générer les types Prisma** :
   ```bash
   npx prisma generate
   ```

3. **Configurer la base de données** :
   - Créer un fichier `.env` sur le serveur
   - Configurer la variable `DATABASE_URL`

4. **Lancer l'application** :
   ```bash
   npm run build
   npm start
   ```

## Dépannage

### Problème : "Transfert de fichier ignoré"
- **Cause** : Le fichier est dans la liste d'exclusion
- **Solution** : C'est normal, ces fichiers ne doivent pas être transférés

### Problème : "Erreur de connexion FTP"
- **Cause** : Problème de configuration FTP
- **Solution** : Vérifiez les paramètres de connexion (hôte, port, identifiants)

### Problème : "Permissions insuffisantes"
- **Cause** : Droits d'écriture insuffisants sur le serveur
- **Solution** : Contactez votre hébergeur pour ajuster les permissions

## Support

Si vous rencontrez des problèmes, vérifiez :
1. La configuration de votre client FTP
2. Les permissions sur le serveur
3. La configuration de votre hébergeur














