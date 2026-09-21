/**
 * Point d'entrée unique du processus serveur.
 *
 * Next.js 15 appelle `register()` UNE fois par processus, avant de servir la
 * première requête (le fichier `instrumentation` est stable depuis Next 15 :
 * aucun drapeau à poser dans next.config.js, la détection se fait sur le nom
 * du fichier et il est bien embarqué dans la sortie `standalone`).
 *
 * C'est le seul endroit du projet où l'on peut faire quelque chose « au
 * démarrage » plutôt qu'« au passage d'un visiteur » : les réglages SQLite
 * doivent être posés avant la première écriture, et les tâches planifiées
 * n'ont personne d'autre pour les lancer.
 */
export async function register() {
  // TOUT le corps tient dans ce `if`, et ce n'est PAS une question de style :
  // ce fichier est compilé DEUX FOIS, une fois pour Node et une fois pour le
  // runtime Edge (le middleware). Webpack remplace `process.env.NEXT_RUNTIME`
  // par une constante à la compilation : dans le bundle Edge, la condition
  // devient `'edge' === 'nodejs'`, le bloc entier est supprimé, et les
  // `import()` qu'il contient ne sont jamais tracés. Avec un `return`
  // anticipé (`if (… !== 'nodejs') return`), les imports restent au niveau du
  // corps de la fonction : webpack les embarque quand même dans le bundle
  // Edge, et le build ÉCHOUE sur la première dépendance Node rencontrée
  // (node-cron tire `node:crypto` : « UnhandledSchemeError »). C'est le motif
  // que documente Next, à la lettre.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // `next build` importe le code serveur pour le pré-rendu et appelle donc
    // `register()` : sans cette garde, la construction ouvrirait prisma/dev.db
    // — un fichier SUIVI par git et copié dans l'image (Dockerfile) — et lui
    // poserait un journal_mode=WAL PERSISTANT, écrit dans son en-tête.
    // Invisible de surcroît, puisque db-setup avale ses échecs. Le
    // planificateur se garde déjà lui-même (shouldStartScheduler) ; les PRAGMA
    // n'avaient pas d'équivalent, la règle est donc posée ici, une fois, pour
    // les deux.
    if (process.env.NEXT_PHASE === 'phase-production-build') return

    const { ensureSqliteRuntimeSettings } = await import('@/lib/db-setup')
    await ensureSqliteRuntimeSettings()

    // Après les PRAGMA, jamais avant : le planificateur écrit en base (purges
    // de conservation, nettoyage des salles) et doit trouver le journal déjà
    // en WAL.
    //
    // /!\ SOUS FILET, et ce n'est pas du zèle : Next RE-LÈVE ce que
    // `register()` rejette, et l'erreur remonte jusqu'au démarrage du serveur
    // — `node server.js` ne démarre alors pas du tout, et `--restart always`
    // boucle. Un ménage qui ne se pose pas est un désagrément (le filet du
    // ping reprend la conservation, et cleanupAbandonedRooms repart au
    // trafic) ; un site qui ne démarre pas est une panne. Le seul module qui
    // peut réellement manquer ici est node-cron, dont la présence dans
    // `.next/standalone` dépend du traçage de Next.
    try {
      const { startScheduledJobs } = await import('@/lib/scheduler')
      startScheduledJobs()
    } catch (error) {
      // Nom de la classe d'erreur seulement : aucune donnée personnelle dans
      // les journaux du conteneur, même au démarrage.
      console.error(
        '[instrumentation] planificateur non posé, le serveur démarre quand même :',
        error instanceof Error ? error.name : typeof error
      )
    }
  }
}
