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
- `backgroundColor` + `plugins.SystemBars.style: "DARK"` : fond feutre avant le
  premier rendu et icônes claires dans les barres système (le site est toujours
  sombre). Les bandes des barres viennent de `res/values/styles.xml`.
- `plugins.SocialLogin.providers` : Google seulement. Facebook activé par
  défaut embarquait son SDK et les permissions publicitaires (AD_ID…), qui font
  refuser la release si la Play Console déclare « pas d'identifiant
  publicitaire ». Le manifeste retire en plus ces permissions (`tools:node="remove"`).
- `android.resolveServiceWorkerRequests: false` : le serveur local de Capacitor
  ne répond pas aux requêtes des service workers (défense en profondeur).

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
