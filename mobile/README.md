# Le Pillaveur — coquille mobile (Capacitor)

App Android/iOS qui charge **https://lepillaveur.fr** dans une webview
native (`server.url`). Le code du site reste la source de vérité : chaque
déploiement du site met l'app à jour sans repasser par les stores.
`www/` ne contient qu'un écran de secours (hors ligne, erreur serveur).

## Prérequis (Android)

- Node 20+
- **JDK 21** : Capacitor 8 impose Java 21 (`app/capacitor.build.gradle`), un
  JDK 17 échoue à la compilation. Le plus simple : le JBR d'Android Studio.
  - PowerShell : `$env:JAVA_HOME = "D:\AndroidStudio\jbr"`
  - Git Bash : `export JAVA_HOME="/d/AndroidStudio/jbr"`
- Android SDK (`%LOCALAPPDATA%\Android\Sdk`) — le chemin est lu depuis
  `android/local.properties` (non commité) :
  `sdk.dir=C:\\Users\\<toi>\\AppData\\Local\\Android\\Sdk`

## Commandes (depuis `mobile/`)

```bash
npm install              # une fois, et après chaque changement de dépendances
npm run build:android    # APK de test (prod)   → android/app/build/outputs/apk/debug/app-debug.apk
npm run bundle:android   # AAB pour le Play Store → android/app/build/outputs/bundle/release/app-release.aab
npm run android:local    # APK de test pointé sur le serveur de dev du PC (voir « Essai local »)
npm run icones           # régénère icônes + splash (gen-assets.mjs puis @capacitor/assets)
```

**Toujours passer par ces scripts** : ils lancent `cap sync android` avant
Gradle. La config réellement embarquée est un fichier GÉNÉRÉ
(`android/app/src/main/assets/capacitor.config.json`, ignoré par git) ; un
`gradlew` lancé à la main embarque le dernier sync, qui peut être celui d'un
essai local (l'app ouvrirait alors `localhost` sur tous les téléphones).

L'APK debug s'installe directement sur un téléphone (sources inconnues
activées).

## Configuration (`capacitor.config.json`)

Le JSON n'a pas de commentaires, d'où ce récapitulatif :

- `server.url` : le site. **Pas de `allowNavigation`** : toute page hors de
  `lepillaveur.fr` (sous-domaines compris) part dans le navigateur, et le pont
  natif reste réservé au site.
- `server.errorPath: "index.html"` : affiche `www/index.html` (servi en
  `https://localhost/index.html`) au lieu de la page d'erreur brute de Chromium.
  Capacitor le montrerait pour TOUTE réponse 4xx/5xx de la page principale ;
  `MainActivity` le réserve aux vraies pannes : hors ligne, 502/503/504 et 52x
  de Cloudflare. Une 404 ou une 500 gardent la page du site (traduite, avec sa
  navigation), et un défi Cloudflare (`cf-mitigated: challenge`, règle WAF ou
  mode « Under Attack ») s'affiche et s'exécute : remplacé par l'écran de
  secours, il ne passait jamais et « Réessayer » retombait dessus. Le bouton
  « Réessayer » relance la page en panne (lien d'invitation, jeton d'e-mail),
  l'accueil à défaut.
- `appendUserAgent: "LePillaveurApp/1"` : marque ajoutée au user-agent de la
  WebView. Le site la lit (`src/lib/native-app.ts`) en plus du pont natif pour
  se savoir dans l'app — même sur une page servie depuis le cache du service
  worker sans pont : l'entrée « Application mobile » du menu, la carte
  d'installation et le bouton plein écran restent cachés.
- `backgroundColor` + `plugins.SystemBars.style: "DARK"` : fond feutre avant le
  premier rendu et icônes claires dans les barres système (le site est toujours
  sombre). Les bandes des barres viennent de `res/values/styles.xml`.
- `plugins.SocialLogin.providers` : Google seulement. Facebook activé par
  défaut embarquait son SDK et les permissions publicitaires (AD_ID…), qui font
  refuser la release si la Play Console déclare « pas d'identifiant
  publicitaire ». Le manifeste retire en plus ces permissions (`tools:node="remove"`).
- `android.resolveServiceWorkerRequests: false` : Capacitor ne pose PAS son
  propre `ServiceWorkerClient` (sans filtre) ; c'est `MainActivity` qui en
  pose un, avec les chemins spéciaux fermés — voir « Hors ligne » plus bas.

`MainActivity.java` complète Capacitor : retour Android dans l'historique du
site, liens entrants `https://lepillaveur.fr/...` chargés (contrôle strict de
l'hôte) une seule fois, page courante retrouvée quand Android recrée
l'activité (processus tué en arrière-plan : le lien qui a lancé l'app n'est
pas rejoué), chemins `/_capacitor_file_`, `/_capacitor_content_` et
`/_capacitor_http_interceptor_` fermés (403), cookies écrits sur disque à la
mise en arrière-plan, rechargement si le processus de rendu meurt (au retour
au premier plan s'il meurt en arrière-plan ; l'accueil à la 2e mort en
rafale, plantage normal à la 3e).

Plugins natifs : `@capgo/capacitor-social-login` (bouton Google natif) et
`@capacitor/share` (feuille de partage Android, appelée par le site ; un APK
plus ancien, sans le plugin, garde le repli presse-papiers).

## Hors ligne (jeux locaux)

Le site enregistre un **service worker** (`/sw.js`, généré par
`src/app/sw.js/route.ts` ; stratégies dans `src/lib/offline/`) qui précharge
le hub, la page de repli `/hors-ligne` et les pages des jeux « un seul
téléphone » (Monsieur 3, PMU, Petit Buveur, Hi/Lo, Purple, Pyramide, Plinko,
1220) avec leurs fichiers JS/CSS ; la page des joueurs entre dans le cache à
sa première visite. Une fois l'app ouverte **une première fois en ligne**,
ces pages se rouvrent sans réseau — depuis l'icône (la racine est ramenée au
hub de la dernière langue vue) comme depuis une page restaurée. Les tables en
ligne, le compte et les règles tombent sur `/hors-ligne`, qui liste ce qui
reste jouable et propose « Réessayer ». Le worker sert aussi la page en cache
quand le serveur répond 502/503/504 ou 52x hors défi Cloudflare : une partie
en cours survit à un déploiement.

Côté coquille, `MainActivity` pose un `ServiceWorkerClient` (Capacitor n'en
pose aucun, `resolveServiceWorkerRequests` est à faux) : les requêtes du
worker ferment les chemins `/_capacitor_*` comme celles de la page, puis
passent par le serveur local de Capacitor, qui proxifie les pages HTML pour y
**injecter le pont natif**. Sans ce client, les pages rapatriées par le worker
(préchargées ou relayées) arrivaient sans `window.Capacitor` : connexion
Google native, partage et ambiance « Sans alcool » par défaut perdus. L'écran
de secours `www/index.html` ne sert plus que sans worker installé (tout
premier lancement hors ligne), quand même la page de repli manque, ou quand
une page NON mise en cache (table en ligne, compte, règles) reçoit une
502/503/504 ou 52x du serveur : le worker ne redirige vers `/hors-ligne`
qu'en panne réseau, une panne serveur garde sa réponse.

Essai sur appareil : ouvrir l'app en ligne, attendre quelques secondes (le
préchargement se fait après le chargement de la page), passer en mode avion,
relancer l'app depuis l'icône : le hub puis un jeu local doivent s'ouvrir et
se jouer ; une table en ligne doit mener à « Hors ligne ».

## Essai local (serveur de dev du PC)

La variante de test ne modifie jamais `capacitor.config.json` : `essai-local.mjs`
réécrit seulement la config générée, et le prochain `npm run build:android`
remet la prod. Le HTTP en clair n'est permis que vers `localhost`, et
seulement dans les builds debug (`app/src/debug/res/xml/network_security_config.xml`).

```bash
# Terminal 1, racine du dépôt (DATABASE_URL de .env = base LOCALE)
npm run dev -- -p 3131

# Terminal 2, mobile/ (émulateur démarré ou téléphone branché en débogage USB)
npm run android:local                  # port différent : PORT_LOCAL=3000 npm run android:local
adb reverse tcp:3131 tcp:3131          # localhost:3131 du téléphone → PC
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# Fin de l'essai
adb reverse --remove-all
npm run build:android                  # refait le sync : l'APK repointe sur lepillaveur.fr
```

La webview d'un build debug s'inspecte depuis Chrome du PC : `chrome://inspect`.

## Diffusion directe (APK sur le site)

En attendant les stores, la page `/application` du site propose l'APK au
téléchargement (`public/app/le-pillaveur.apk`, servi hors middleware i18n ;
la carte ne s'affiche que si le fichier est dans le dépôt). Android demande
alors d'autoriser les « sources inconnues » pour le navigateur. Publier une
nouvelle version de la coquille :

```bash
npm run build:android                                        # depuis mobile/
cp android/app/build/outputs/apk/debug/app-debug.apk ../public/app/le-pillaveur.apk
```

puis commiter et déployer le site (`npm run deploy` à la racine). Le site, lui,
se met à jour dans l'app sans retéléchargement : seule la coquille (Java,
plugins, config Capacitor) demande un nouvel APK.

## Publication Play Store

### Une fois

1. **Clé d'upload**, créée HORS du dépôt et sauvegardée (clé + mots de passe
   dans un gestionnaire de mots de passe : perdue, il faut demander une
   réinitialisation à Google) :
   ```powershell
   & "D:\AndroidStudio\jbr\bin\keytool.exe" -genkeypair -v -keystore "C:\chemin\hors\depot\lepillaveur-upload.jks" -alias upload -keyalg RSA -keysize 2048 -validity 10000
   ```
2. **`android/keystore.properties`** (ignoré par git, comme `*.jks` et
   `*.keystore`), lu par `android/app/build.gradle` :
   ```properties
   storeFile=C:/chemin/hors/depot/lepillaveur-upload.jks
   storePassword=<mot de passe du keystore>
   keyAlias=upload
   keyPassword=<mot de passe de la clé>
   ```
   Sans ce fichier, `bundle:android` produit un AAB **non signé** (refusé au
   téléversement) ; le debug, lui, se construit toujours.
   **Mots de passe en ASCII** (lettres non accentuées, chiffres, `-_.`) : le
   fichier est lu en UTF-8, mais la saisie de `keytool` dans une console
   Windows dépend de sa page de codes, et un « é » peut y être enregistré
   autrement qu'il ne s'écrit ici (« password was incorrect » à la
   signature). Préférer une longue suite aléatoire du gestionnaire de mots de
   passe.
3. **Play Console** : créer l'app `fr.lepillaveur.app`, garder **Play App
   Signing** (Google re-signe l'app installée depuis Play avec SA clé).
   Compte personnel créé après le 13/11/2023 : un test fermé avec au moins
   12 testeurs pendant 14 jours est exigé avant la production.

### À chaque version

1. Incrémenter `versionCode` (entier strictement croissant, sinon l'envoi est
   refusé) et ajuster `versionName` dans `android/app/build.gradle`.
2. `npm run bundle:android`.
3. Contrôler l'AAB avant l'envoi (Git Bash ; le `tar` de Windows lit les zip,
   pas celui de Git Bash) :
   ```bash
   AAB=android/app/build/outputs/bundle/release/app-release.aab
   /c/Windows/System32/tar.exe -xOf $AAB base/assets/capacitor.config.json   # url = https://lepillaveur.fr, ni cleartext ni localhost
   /d/AndroidStudio/jbr/bin/jarsigner.exe -verify $AAB                        # « jar verified. »
   ```
4. Téléverser `app-release.aab` dans la Play Console.

### Empreintes (connexion Google, App Links)

- Debug et upload : `cd android && gradlew signingReport` (SHA-1 et SHA-256).
- Play App Signing : Play Console › Intégrité de l'appli › Certificat de la
  clé de signature de l'appli (visible après le premier envoi).
- **Google Cloud Console** : un client OAuth **Android** (package
  `fr.lepillaveur.app`) par SHA-1 — debug de chaque PC, upload, Play App
  Signing — dans le MÊME projet que le client web. Sans celui de Play App
  Signing, la connexion Google échoue dans l'app installée depuis Play
  (« Developer console is not set up correctly ») alors qu'elle marche en debug.
- **App Links** : le site sert `/.well-known/assetlinks.json` par une route
  (`src/app/.well-known/assetlinks.json/route.ts`, exclue du middleware : pas
  de redirection de langue). Les empreintes se tiennent à UN seul endroit,
  `ANDROID_CERT_SHA256_FINGERPRINTS` dans `src/lib/android-app-links.ts` :
  y mettre les SHA-256 de Play App Signing et de la clé d'upload, et n'y
  laisser le debug que le temps des essais. Déployer APRÈS la diffusion d'un
  APK qui sait charger l'URL reçue (`MainActivity.onNewIntent`), sinon les
  liens ouvrent l'accueil.

## Icônes

`npm run icones` : `gen-assets.mjs` dessine les sources (`assets/`) avec le
même motif que le favicon, puis `@capacitor/assets` les décline. La couche
**monochrome** (icônes à thème, Android 13+) est écrite par `gen-assets.mjs`
directement dans `res/mipmap-*/` et branchée par `res/mipmap-anydpi-v33/`,
que l'outil ne réécrit pas (il réécrit `mipmap-anydpi-v26/` sans monochrome).
L'outil reformate aussi `AndroidManifest.xml` au passage : relire le diff.

## Pièges connus

- **Connexion Google** : Google bloque OAuth dans les webviews embarquées
  (`disallowed_useragent`). L'app embarque donc le plugin
  `@capgo/capacitor-social-login` : le site détecte la coquille
  (`src/lib/native-google-login.ts`) et remplace le bouton GIS par la
  fenêtre Google **native**, dont l'ID token part vers `/api/auth/google`
  comme sur le web. Prérequis : les clients OAuth Android ci-dessus.
- **Vocal WebRTC** : permissions `RECORD_AUDIO`/`MODIFY_AUDIO_SETTINGS`
  déclarées dans le manifeste — à tester sur appareil réel.
- **Apple (plus tard)** : la règle 4.2 refuse les apps « simple site
  emballé » — prévoir push/haptique natifs avant la soumission iOS, et un
  Mac pour builder.
