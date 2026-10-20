/**
 * « Méthode » de l'onglet Statistiques : TOUTES les définitions de ses
 * chiffres, rangées par thème, sous forme de références aux messages
 * `supervision.*` (clé + valeurs interpolées). Les tuiles et les graphes ne
 * montrent plus leur définition qu'à la demande (bouton « i ») : cette liste
 * est l'endroit où on les lit d'une traite. La page traduit, le test vérifie
 * que chaque entrée se rend dans les quatre langues sans valeur manquante, et
 * qu'aucune définition (clé en « …Def ») n'en manque.
 */

export const METHOD_GROUPS = ['audience', 'players', 'games', 'quality'] as const
export type MethodGroup = (typeof METHOD_GROUPS)[number]

/** Message de `supervision.*` ; une valeur peut être elle-même un message à traduire (« 7 jours »). */
export type MessageRef = { key: string; values?: Record<string, string | number | MessageRef> }

export type MethodEntry = { id: string; term: MessageRef; definition: MessageRef }

export type MethodParams = {
  /** Fenêtre de présence des navigateurs actifs, en minutes (src/lib/presence.ts). */
  onlineMinutes: number
  /** Fenêtre « actif » d'un battement, en minutes (src/lib/heartbeat.ts). */
  activeMinutes: number
  /** Cohortes des retours, en jours de Paris avant aujourd'hui. */
  returnCohorts: { d1: { from: number; to: number }; d7: { from: number; to: number } }
  /** Cohorte minimale pour afficher un taux de retour. */
  returnMinCohort: number
  /**
   * Fenêtres servies avec la croissance. Null tant qu'elle n'est pas chargée :
   * ses deux définitions sont alors omises plutôt que données avec une durée
   * inventée.
   */
  growthWindows: { registeredShareDays: number; playersByGameDays: number } | null
}

function ref(key: string, values?: MessageRef['values']): MessageRef {
  return values ? { key, values } : { key }
}

const TODAY = ref('stats.today')
const WEEK = ref('stats.week')
const MONTH = ref('stats.month')

/** « Joueurs uniques · 7 jours » : un intitulé et sa fenêtre (ou sa source, « · En ligne »). */
function windowed(label: string, window: MessageRef): MessageRef {
  return ref('method.windowed', { label: ref(label), window })
}

export function methodGroups(params: MethodParams): Array<{ group: MethodGroup; entries: MethodEntry[] }> {
  const { onlineMinutes, activeMinutes, returnCohorts, returnMinCohort, growthWindows } = params

  // Rangées comme les vues de l'onglet : la Méthode s'ouvre sur la vue d'où
  // l'on vient, et chaque chiffre s'y lit à côté de ses voisins d'écran.
  const audience: MethodEntry[] = [
    {
      id: 'visitors-window',
      term: ref('room.weekVisitors', { window: ref('statsTab.periodAria') }),
      definition: ref('statsTab.audience.visitorsWindowDef'),
    },
    {
      id: 'active-browsers',
      term: ref('stats.activeBrowsers'),
      definition: ref('statsTab.audience.activeBrowsersDef', { minutes: onlineMinutes }),
    },
    { id: 'median-visit', term: ref('activeAccounts.medianVisit'), definition: ref('activeAccounts.medianVisitDef') },
    { id: 'phone-share', term: ref('statsTab.audience.phoneShare'), definition: ref('statsTab.audience.phoneShareDef') },
    { id: 'visitors', term: ref('room.visitorsChartTitle'), definition: ref('room.visitorsDef') },
    { id: 'devices', term: ref('activeAccounts.devicesTitle'), definition: ref('activeAccounts.devicesDef') },
  ]

  const players: MethodEntry[] = [
    {
      id: 'active-d1',
      term: windowed('activeAccounts.title', TODAY),
      definition: ref('activeAccounts.activeTodayDef', { minutes: activeMinutes }),
    },
    {
      id: 'active-d7',
      term: windowed('activeAccounts.title', WEEK),
      definition: ref('activeAccounts.activeWindowDef', { days: 7, minutes: activeMinutes }),
    },
    {
      id: 'active-d30',
      term: windowed('activeAccounts.title', MONTH),
      definition: ref('activeAccounts.activeWindowDef', { days: 30, minutes: activeMinutes }),
    },
    { id: 'new', term: ref('activeAccounts.newLabel'), definition: ref('activeAccounts.newDef') },
    { id: 'returning', term: ref('activeAccounts.returningLabel'), definition: ref('activeAccounts.returningDef') },
    {
      id: 'return-d1',
      term: ref('activeAccounts.returnD1Label'),
      definition: ref('activeAccounts.returnDef', { days: 1, ...returnCohorts.d1, min: returnMinCohort }),
    },
    {
      id: 'return-d7',
      term: ref('activeAccounts.returnD7Label'),
      definition: ref('activeAccounts.returnDef', { days: 7, ...returnCohorts.d7, min: returnMinCohort }),
    },
    { id: 'series', term: ref('activeAccounts.seriesAccountsTitle'), definition: ref('activeAccounts.seriesDef') },
    { id: 'top', term: ref('activeAccounts.topTitle'), definition: ref('activeAccounts.topDef') },
    ...(growthWindows
      ? [
          {
            id: 'registered-share',
            term: ref('growth.registeredShareLabel'),
            definition: ref('growth.registeredShareDef', { days: growthWindows.registeredShareDays }),
          },
        ]
      : []),
    {
      id: 'median-active',
      term: ref('activeAccounts.medianActive'),
      definition: ref('activeAccounts.medianActiveDef', { minutes: activeMinutes }),
    },
    { id: 'idle-guests', term: ref('method.names.idleGuests'), definition: ref('activeAccounts.idleGuestsDef') },
    { id: 'deleted-seats', term: ref('method.names.deletedSeats'), definition: ref('activeAccounts.deletedSeatsDef') },
    { id: 'browsers', term: ref('activeAccounts.browsersTitle'), definition: ref('activeAccounts.browsersDef') },
    { id: 'series-new', term: ref('activeAccounts.seriesNewTitle'), definition: ref('activeAccounts.seriesNewDef') },
    { id: 'excluded', term: ref('method.names.excluded'), definition: ref('activeAccounts.excludedDef') },
  ]

  const games: MethodEntry[] = [
    { id: 'launches', term: ref('statsTab.games.launches'), definition: ref('statsTab.games.launchesDef') },
    {
      id: 'launches-online',
      term: windowed('statsTab.games.launches', ref('statsTab.games.online')),
      definition: ref('onlinePlayers.launchesDef'),
    },
    {
      id: 'launches-local',
      term: windowed('statsTab.games.launches', ref('statsTab.games.local')),
      definition: ref('localPlay.def'),
    },
    // Le seul chiffre de joueurs de l'onglet, posé dans la vue Jeux.
    {
      id: 'unique-d1',
      term: windowed('activeAccounts.playersTitle', TODAY),
      definition: ref('activeAccounts.playersTodayDef'),
    },
    {
      id: 'unique-d7',
      term: windowed('activeAccounts.playersTitle', WEEK),
      definition: ref('activeAccounts.playersWindowDef', { days: 7 }),
    },
    {
      id: 'unique-d30',
      term: windowed('activeAccounts.playersTitle', MONTH),
      definition: ref('activeAccounts.playersWindowDef', { days: 30 }),
    },
    { id: 'by-game', term: ref('statsTab.games.tableTitle'), definition: ref('statsTab.games.tableDef') },
    ...(growthWindows
      ? [
          {
            id: 'players-by-game',
            term: ref('growth.playersByGameTitle'),
            definition: ref('growth.playersByGameDef', { days: growthWindows.playersByGameDays }),
          },
        ]
      : []),
    { id: 'all-time', term: ref('games.playedTitle'), definition: ref('games.allTimeNote') },
    {
      id: 'duration-reliable',
      term: ref('gameSessions.reliability.reliable'),
      definition: ref('gameSessions.reliability.reliableHint'),
    },
    {
      id: 'duration-estimated',
      term: ref('gameSessions.reliability.estimated'),
      definition: ref('gameSessions.reliability.estimatedHint'),
    },
    {
      id: 'duration-unknown',
      term: ref('gameSessions.reliability.unknown'),
      definition: ref('gameSessions.reliability.unknownHint'),
    },
  ]

  const quality: MethodEntry[] = [
    { id: 'abandoned', term: ref('growth.abandonedLabel'), definition: ref('growth.abandonedDef') },
    { id: 'game-share', term: ref('activeAccounts.gameShare'), definition: ref('activeAccounts.gameShareDef') },
    { id: 'crashes', term: ref('clientErrors.title'), definition: ref('clientErrors.desc') },
    { id: 'crash-last-seen', term: ref('clientErrors.colLastSeen'), definition: ref('clientErrors.lastSeenHint') },
  ]

  return [
    { group: 'audience', entries: audience },
    { group: 'players', entries: players },
    { group: 'games', entries: games },
    { group: 'quality', entries: quality },
  ]
}

/** Traduit une référence, valeurs imbriquées comprises, avec le `t` du namespace `supervision`. */
export function resolveMessage(
  message: MessageRef,
  t: (key: string, values?: Record<string, string | number>) => string
): string {
  if (!message.values) return t(message.key)
  const values: Record<string, string | number> = {}
  for (const [name, value] of Object.entries(message.values)) {
    values[name] = typeof value === 'object' ? resolveMessage(value, t) : value
  }
  return t(message.key, values)
}
