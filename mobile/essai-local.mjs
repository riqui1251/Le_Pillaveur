import { readFileSync, writeFileSync } from 'fs'

/**
 * Essai local : fait pointer l'APK debug sur le serveur de dev du PC
 * (http://localhost:3131, joint depuis l'émulateur ou le téléphone par adb reverse).
 *
 * On modifie la config GÉNÉRÉE par `cap sync` (android/app/src/main/assets/
 * capacitor.config.json, ignorée par git), jamais capacitor.config.json : le fichier
 * suivi reste la config de prod, et tout `npm run build:android` ou `bundle:android`
 * refait le sync, donc remet la prod. Le HTTP en clair vers localhost n'est permis que
 * par la network_security_config des builds debug (app/src/debug/res/xml/).
 *
 * Usage (depuis mobile/) : npm run android:local   — port : PORT_LOCAL=3000 npm run android:local
 */

const port = process.env.PORT_LOCAL || '3131'
const fichier = 'android/app/src/main/assets/capacitor.config.json'

const config = JSON.parse(readFileSync(fichier, 'utf8'))
config.server = { ...config.server, url: `http://localhost:${port}` }
writeFileSync(fichier, JSON.stringify(config, null, '\t') + '\n')

console.log(`server.url -> http://localhost:${port} (config générée ; npm run build:android remet la prod)`)
