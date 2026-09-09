/**
 * Codes d'erreur stables des routes /api/online.
 * Le champ `error` des réponses porte le code ; le champ `message` garde le
 * texte FR pour compat. Côté client, les codes sont traduits via le namespace
 * i18n `onlineLobby.errors` (messages/{fr,en,es,it}.json), avec le texte brut
 * en fallback pour les valeurs inconnues.
 */
export const ONLINE_ERROR_CODES = [
  'auth_required',
  'forbidden',
  'room_not_found',
  'code_required',
  'game_already_started',
  'game_not_active',
  'game_not_finished',
  'invalid_game',
  'unsupported_game',
  'server_managed_game',
  'invalid_state',
  'invalid_json',
  'version_conflict',
  'not_your_turn',
  'not_a_member',
  'server_error',
  // Lobby : lancement, équipes, visibilité
  'host_only_launch',
  'host_only_settings',
  'players_not_ready',
  'team_min_players',
  'teams_not_supported',
  'invalid_team',
  'team_full',
  'room_full',
  'invite_only',
  // Invitations d'amis
  'host_only_invite',
  'room_already_public',
  'friend_required',
  'not_friends',
  'cannot_invite_player',
  'already_in_room',
  'invite_not_found',
  // Vocal (RTC)
  'invalid_signal',
  'voice_unavailable',
  'signal_too_large',
  'recipient_not_in_room',
  // Remplacement AFK
  'no_active_player',
  'cannot_afk_self',
  'not_afk_yet',
  'nothing_to_replace',
  // Revanche : le vote a perdu la course d'écriture (compare-and-swap épuisé)
  'rematch_conflict',
  // Bornes de lancement — le nombre voyage dans `count` (i18n : « {count} »)
  'min_players',
  'max_players',
  // Actions de jeu : intention mal formée, ou joueur retiré de la salle
  'invalid_action',
  'replaced_by_bot',
  // Refus du moteur sans code dédié — filet générique, jamais de texte brut
  'action_failed',
] as const

export type OnlineErrorCode = (typeof ONLINE_ERROR_CODES)[number]

const CODE_SET = new Set<string>(ONLINE_ERROR_CODES)

export function isOnlineErrorCode(value: string): value is OnlineErrorCode {
  return CODE_SET.has(value)
}

/** Codes majuscules historiques (moteurs de jeu, remplacement AFK) → codes stables */
const LEGACY_ALIASES: Record<string, OnlineErrorCode> = {
  FORBIDDEN: 'forbidden',
  NOT_YOUR_TURN: 'not_your_turn',
  NO_ACTIVE_PLAYER: 'no_active_player',
  CANNOT_AFK_SELF: 'cannot_afk_self',
  NOT_AFK_YET: 'not_afk_yet',
  NOTHING_TO_REPLACE: 'nothing_to_replace',
  ACTION_FAILED: 'action_failed',
}

/** Résout une valeur `error` de l'API vers un code stable, ou null si inconnue */
export function resolveOnlineErrorCode(
  value: string | null | undefined
): OnlineErrorCode | null {
  if (!value) return null
  if (isOnlineErrorCode(value)) return value
  return LEGACY_ALIASES[value] ?? null
}

/** Texte FR de compat envoyé avec chaque code (champ `message`) */
export const ONLINE_ERROR_TEXT_FR: Record<OnlineErrorCode, string> = {
  auth_required: 'Connectez-vous pour jouer en ligne',
  forbidden: 'Accès refusé',
  room_not_found: 'Lobby introuvable',
  code_required: 'Code ou identifiant de lobby requis',
  game_already_started: 'La partie est déjà lancée',
  game_not_active: 'Partie non active',
  game_not_finished: "La partie n'est pas terminée",
  invalid_game: 'Jeu invalide',
  unsupported_game: 'Jeu non supporté par ce mode',
  server_managed_game: 'Ce jeu est géré par le serveur',
  invalid_state: 'État de partie invalide',
  invalid_json: 'JSON invalide',
  version_conflict: 'Conflit de version',
  not_your_turn: "Ce n'est pas votre tour",
  not_a_member: 'Pas membre de cette salle',
  server_error: 'Erreur serveur',
  host_only_launch: 'Seul le créateur peut lancer la partie',
  host_only_settings: 'Seul le créateur peut modifier les paramètres',
  players_not_ready: 'Tous les joueurs doivent être prêts',
  team_min_players: 'Chaque équipe doit avoir au moins 2 joueurs',
  teams_not_supported: 'Ce jeu ne gère pas les équipes',
  invalid_team: 'Équipe invalide',
  team_full: 'Cette équipe est complète',
  room_full: 'Ce lobby est complet pour ce format',
  invite_only: 'Ce lobby est sur invitation uniquement',
  host_only_invite: 'Seul le créateur peut inviter',
  room_already_public: 'Ce lobby est déjà public, aucune invitation nécessaire',
  friend_required: 'Ami requis',
  not_friends: "Vous n'êtes pas ami avec ce joueur",
  cannot_invite_player: 'Ce joueur ne peut pas être invité',
  already_in_room: 'Cet ami est déjà dans la salle',
  invite_not_found: 'Invitation introuvable',
  invalid_signal: 'Signal invalide',
  voice_unavailable: 'Vocal indisponible',
  signal_too_large: 'Signal trop volumineux',
  recipient_not_in_room: 'Destinataire hors salle',
  no_active_player: 'Aucun joueur actif',
  cannot_afk_self: 'Impossible de se remplacer soi-même',
  not_afk_yet: 'Ce joueur est encore dans le délai de grâce',
  nothing_to_replace: 'Aucun joueur à remplacer',
  rematch_conflict: 'Vote non enregistré, réessayez',
  min_players: 'Au moins {count} joueurs requis (bots inclus)',
  max_players: 'Trop de joueurs pour ce format (max {count})',
  invalid_action: 'Action invalide',
  replaced_by_bot: 'Tu as été remplacé par un bot',
  action_failed: 'Action impossible',
}

/** Paramètres d'un code à trou (bornes de joueurs) — repris tel quel côté i18n. */
export type OnlineErrorParams = { count?: number }

/**
 * Corps JSON d'erreur des routes online : code stable + texte FR de compat.
 * Les codes à trou (`min_players`, `max_players`) renvoient AUSSI `count` :
 * le client traduit lui-même le message avec ce nombre, plutôt que de recevoir
 * une phrase française toute faite.
 */
export function onlineErrorBody(
  code: OnlineErrorCode,
  params?: OnlineErrorParams
): { error: OnlineErrorCode; message: string; count?: number } {
  const text = ONLINE_ERROR_TEXT_FR[code]
  if (params?.count === undefined) return { error: code, message: text }
  return {
    error: code,
    message: text.replace('{count}', String(params.count)),
    count: params.count,
  }
}
