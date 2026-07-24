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
  (`disallowed_useragent`). Invités + email/mot de passe fonctionnent ;
  la connexion Google dans l'app nécessitera plus tard un plugin natif ou
  des Custom Tabs.
- **Vocal WebRTC** : permissions `RECORD_AUDIO`/`MODIFY_AUDIO_SETTINGS`
  déclarées dans le manifest — à tester sur appareil réel.
- **Apple (plus tard)** : la règle 4.2 refuse les apps « simple site
  emballé » — prévoir push/haptique natifs avant la soumission iOS, et un
  Mac pour builder.
