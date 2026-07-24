# Le Pillaveur — coquille mobile (Capacitor)

App Android/iOS qui charge **https://lepillaveur.fr** dans une webview
native (`server.url`). Le code du site reste la source de vérité : chaque
déploiement du site met l'app à jour sans repasser par les stores.
`www/` ne contient qu'un écran de secours hors-ligne.

## Prérequis (Android)

- Node 20+
- JDK 17+ (Temurin) — `JAVA_HOME` posé ou `org.gradle.java.home` dans
  `android/gradle.properties`
- Android SDK (`%LOCALAPPDATA%\Android\Sdk`) — le chemin est lu depuis
  `android/local.properties` (non commité) :
  `sdk.dir=C:\\Users\\<toi>\\AppData\\Local\\Android\\Sdk`

## Commandes

```bash
npm install            # une fois
node gen-assets.mjs    # régénère les sources d'icônes (assets/)
npx @capacitor/assets generate --android   # décline icônes + splash
npx cap sync android   # après changement de config/plugins
cd android && gradlew assembleDebug        # APK de test
```

APK de test : `android/app/build/outputs/apk/debug/app-debug.apk`
(installable directement sur un téléphone, sources inconnues activées).

## Publication Play Store (résumé)

1. Créer un keystore de release + configurer `signingConfigs` dans
   `android/app/build.gradle`.
2. `gradlew bundleRelease` → `.aab` à téléverser dans la Play Console
   (compte développeur : 25 $ une fois).
3. **App Links** : publier `public/.well-known/assetlinks.json` sur le
   site avec l'empreinte SHA-256 du keystore pour que les liens/QR
   `lepillaveur.fr` ouvrent l'app automatiquement.

## Pièges connus

- **Connexion Google** : Google bloque OAuth dans les webviews embarquées
  (`disallowed_useragent`). L'app embarque donc le plugin
  `@capgo/capacitor-social-login` : le site détecte la coquille
  (`src/lib/native-google-login.ts`) et remplace le bouton GIS par la
  fenêtre Google **native**, dont l'ID token part vers `/api/auth/google`
  comme sur le web. Prérequis Google Cloud Console : un client OAuth
  **Android** (package `fr.lepillaveur.app` + SHA-1 de chaque clé de
  signature — debug, release, Play App Signing) dans le MÊME projet que le
  client web ; sans lui, la fenêtre native échoue (erreur développeur).
- **Vocal WebRTC** : permissions `RECORD_AUDIO`/`MODIFY_AUDIO_SETTINGS`
  déclarées dans le manifest — à tester sur appareil réel.
- **Apple (plus tard)** : la règle 4.2 refuse les apps « simple site
  emballé » — prévoir push/haptique natifs avant la soumission iOS, et un
  Mac pour builder.
