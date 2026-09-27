/**
 * Digital Asset Links de l'application Android (coquille Capacitor), servis
 * sur /.well-known/assetlinks.json (src/app/.well-known/assetlinks.json).
 *
 * Android ne vérifie les App Links (autoVerify) que si ce fichier répond 200,
 * en HTTPS, en application/json, SANS aucune redirection, et liste le
 * certificat qui signe l'APK INSTALLÉ. Sans lui, les liens lepillaveur.fr
 * (invitations, QR des tables, réinitialisation du mot de passe) s'ouvrent
 * dans le navigateur au lieu de l'app.
 */

/** applicationId de la coquille (mobile/android/app/build.gradle). */
export const ANDROID_APP_PACKAGE = 'fr.lepillaveur.app'

/**
 * Empreintes SHA-256 des certificats autorisés à revendiquer nos liens —
 * SEULE liste à tenir à jour.
 *
 * À FAIRE AVANT LA PUBLICATION SUR GOOGLE PLAY : ajouter l'empreinte SHA-256 du
 * « Certificat de la clé de signature de l'app » (Play Console › Intégrité
 * de l'appli › Signature de l'appli). Avec Play App Signing, Google re-signe
 * l'APK : c'est CETTE empreinte que porte l'app installée depuis Play, pas
 * celle d'un keystore local. Y joindre celle du certificat de la clé
 * d'importation si des builds signés par elle circulent (tests internes).
 *
 * L'empreinte debug ne sert qu'aux essais sur émulateur : la retirer une
 * fois les empreintes Play en place — un APK debug signé sur ce poste
 * revendiquerait sinon nos liens.
 *
 * Format attendu par Android : 32 octets en hexadécimal MAJUSCULE séparés par
 * « : » (sortie de `keytool -list -v` ou de `apksigner verify --print-certs`).
 */
export const ANDROID_CERT_SHA256_FINGERPRINTS: readonly string[] = [
  // Keystore DEBUG du poste de développement (essais sur émulateur).
  'F7:42:F2:53:02:BE:80:E5:F9:A3:15:C5:31:F7:D0:15:7E:A9:FD:6C:73:6B:BC:85:E7:4E:CC:C0:E3:51:43:00',
]

type AssetLinksStatement = {
  relation: string[]
  target: {
    namespace: 'android_app'
    package_name: string
    sha256_cert_fingerprints: string[]
  }
}

/** Contenu de assetlinks.json : l'app peut ouvrir toutes les URL du domaine. */
export function androidAssetLinks(): AssetLinksStatement[] {
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: ANDROID_APP_PACKAGE,
        sha256_cert_fingerprints: [...ANDROID_CERT_SHA256_FINGERPRINTS],
      },
    },
  ]
}
