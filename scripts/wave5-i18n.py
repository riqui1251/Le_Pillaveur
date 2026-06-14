#!/usr/bin/env python3
"""Wave 5 i18n: patch message files and migrate supervision page."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MESSAGES = ROOT / "messages"
SUPERVISION_PAGE = ROOT / "src" / "app" / "[locale]" / "supervision" / "page.tsx"

ACCOUNT_RESET = {
    "fr": {
        "title": "Nouveau mot de passe",
        "subtitle": "Choisissez un mot de passe sécurisé pour votre compte.",
        "invalidLink": "Lien invalide ou expiré.",
        "backToLogin": "Retour à la connexion",
        "success": "Mot de passe mis à jour ! Redirection…",
        "newPassword": "Nouveau mot de passe",
        "confirmPassword": "Confirmer le mot de passe",
        "passwordPlaceholder": "Lettre + chiffre, 8 car. min.",
        "updating": "Mise à jour…",
        "submit": "Réinitialiser le mot de passe",
        "passwordRules": "8 caractères minimum, avec au moins une lettre et un chiffre.",
        "passwordMismatch": "Les mots de passe ne correspondent pas.",
    },
    "en": {
        "title": "New password",
        "subtitle": "Choose a secure password for your account.",
        "invalidLink": "Invalid or expired link.",
        "backToLogin": "Back to sign in",
        "success": "Password updated! Redirecting…",
        "newPassword": "New password",
        "confirmPassword": "Confirm password",
        "passwordPlaceholder": "Letter + number, 8 chars min.",
        "updating": "Updating…",
        "submit": "Reset password",
        "passwordRules": "At least 8 characters with one letter and one number.",
        "passwordMismatch": "Passwords do not match.",
    },
    "es": {
        "title": "Nueva contraseña",
        "subtitle": "Elige una contraseña segura para tu cuenta.",
        "invalidLink": "Enlace inválido o caducado.",
        "backToLogin": "Volver al inicio de sesión",
        "success": "¡Contraseña actualizada! Redirigiendo…",
        "newPassword": "Nueva contraseña",
        "confirmPassword": "Confirmar contraseña",
        "passwordPlaceholder": "Letra + número, mín. 8 car.",
        "updating": "Actualizando…",
        "submit": "Restablecer contraseña",
        "passwordRules": "Mínimo 8 caracteres con al menos una letra y un número.",
        "passwordMismatch": "Las contraseñas no coinciden.",
    },
    "it": {
        "title": "Nuova password",
        "subtitle": "Scegli una password sicura per il tuo account.",
        "invalidLink": "Link non valido o scaduto.",
        "backToLogin": "Torna al login",
        "success": "Password aggiornata! Reindirizzamento…",
        "newPassword": "Nuova password",
        "confirmPassword": "Conferma password",
        "passwordPlaceholder": "Lettera + numero, min. 8 car.",
        "updating": "Aggiornamento…",
        "submit": "Reimposta password",
        "passwordRules": "Almeno 8 caratteri con una lettera e un numero.",
        "passwordMismatch": "Le password non corrispondono.",
    },
}

ERRORS_EXTRA = {
    "fr": {
        "page": {
            "title": "Oups! Quelque chose s'est mal passé",
            "description": "Nous rencontrons un problème technique lors du chargement de cette page. Nous sommes désolés pour la gêne occasionnée.",
            "retry": "Réessayer",
            "home": "Retour à l'accueil",
            "tipsTitle": "Vous pouvez également essayer:",
            "tipRefresh": "Actualiser la page",
            "tipCache": "Vider le cache de votre navigateur",
            "tipConnection": "Vérifier votre connexion Internet",
            "logPrefix": "Erreur d'application:",
        },
        "boundary": {
            "title": "Une erreur s'est produite",
            "retry": "Réessayer",
            "backToGames": "Retour aux jeux",
        },
    },
    "en": {
        "page": {
            "title": "Oops! Something went wrong",
            "description": "We encountered a technical issue while loading this page. Sorry for the inconvenience.",
            "retry": "Try again",
            "home": "Back to home",
            "tipsTitle": "You can also try:",
            "tipRefresh": "Refresh the page",
            "tipCache": "Clear your browser cache",
            "tipConnection": "Check your internet connection",
            "logPrefix": "Application error:",
        },
        "boundary": {
            "title": "An error occurred",
            "retry": "Try again",
            "backToGames": "Back to games",
        },
    },
    "es": {
        "page": {
            "title": "¡Ups! Algo salió mal",
            "description": "Encontramos un problema técnico al cargar esta página. Disculpa las molestias.",
            "retry": "Reintentar",
            "home": "Volver al inicio",
            "tipsTitle": "También puedes probar:",
            "tipRefresh": "Actualizar la página",
            "tipCache": "Vaciar la caché del navegador",
            "tipConnection": "Comprobar tu conexión a Internet",
            "logPrefix": "Error de aplicación:",
        },
        "boundary": {
            "title": "Se produjo un error",
            "retry": "Reintentar",
            "backToGames": "Volver a los juegos",
        },
    },
    "it": {
        "page": {
            "title": "Ops! Qualcosa è andato storto",
            "description": "Abbiamo riscontrato un problema tecnico durante il caricamento di questa pagina. Ci scusiamo per l'inconveniente.",
            "retry": "Riprova",
            "home": "Torna alla home",
            "tipsTitle": "Puoi anche provare:",
            "tipRefresh": "Aggiorna la pagina",
            "tipCache": "Svuota la cache del browser",
            "tipConnection": "Controlla la connessione Internet",
            "logPrefix": "Errore applicazione:",
        },
        "boundary": {
            "title": "Si è verificato un errore",
            "retry": "Riprova",
            "backToGames": "Torna ai giochi",
        },
    },
}

# Shared structure — values differ per locale in SUPERVISION_LOCALIZED
SUPERVISION_KEYS = {
    "title": None,
    "loading": None,
    "refresh": None,
    "unknownCountry": None,
    "rolesHelpTitle": None,
    "rolesHierarchy": None,
    "roles": {
        "fondateur": None,
        "superadmin": None,
        "admin": None,
        "moderator": None,
        "user": None,
    },
    "subtitles": {
        "full": None,
        "bans": None,
        "accounts": None,
    },
    "tabs": {
        "overview": None,
        "geo": None,
        "accounts": None,
        "bans": None,
        "feedback": None,
        "feedbackResolved": None,
    },
    "stats": {
        "onlineNow": None,
        "onlineNowHint": None,
        "today": None,
        "todayHint": None,
        "week": None,
        "weekHint": None,
        "month": None,
        "monthHint": None,
    },
    "accounts": {
        "registered": None,
        "total": None,
        "moderators": None,
        "admins": None,
        "superAdmins": None,
        "founders": None,
        "adminTitle": None,
        "adminDesc": None,
        "searchPlaceholder": None,
        "rolePlaceholder": None,
        "statusPlaceholder": None,
        "allRoles": None,
        "players": None,
        "allStatus": None,
        "online": None,
        "banned": None,
        "resetFilters": None,
        "results": None,
        "ipAnalyzing": None,
        "ipSummary": None,
        "noMatch": None,
        "registeredOn": None,
        "seenOn": None,
        "you": None,
        "banReason": None,
        "history": None,
        "liftBan": None,
        "permanentBan": None,
        "temporaryBan": None,
        "deleteAccount": None,
    },
    "bans": {
        "activeTitle": None,
        "activeOverview": None,
        "suspendedCount": None,
        "noneActive": None,
        "noneOverview": None,
        "currentTitle": None,
        "currentDesc": None,
        "noneCurrent": None,
        "permanent": None,
        "temporary": None,
        "bannedOn": None,
        "expiresOn": None,
        "by": None,
        "comment": None,
        "until": None,
        "unban": None,
    },
    "connected": {
        "recentTitle": None,
        "recentDesc": None,
        "noneRecent": None,
    },
    "games": {
        "playedTitle": None,
        "playedDesc": None,
        "totalParties": None,
        "party": None,
        "parties": None,
        "noneRecorded": None,
    },
    "geo": {
        "onlineByCountry": None,
        "onlineByCountryDesc": None,
        "todayByCountry": None,
        "todayByCountryDesc": None,
        "tapCountry": None,
        "noData": None,
        "visitorsTitle": None,
        "visitorsDesc": None,
        "filterPlaceholder": None,
        "noVisitors": None,
        "noSearchResults": None,
        "hide": None,
        "details": None,
        "localPlayer": None,
        "localPlayers": None,
        "suspicious": None,
        "anonymousVisitor": None,
        "localPlayersLabel": None,
        "noLocalPlayers": None,
        "ipAddresses": None,
        "noIp": None,
        "linkedAccount": None,
        "noLinkedAccount": None,
        "visitorId": None,
        "countryDialogTitle": None,
        "countryDialogDesc": None,
        "noVisitorsForCountry": None,
        "scopeOnline": None,
        "scopeToday": None,
    },
    "activity": {
        "lastLogin": None,
        "neverLoggedIn": None,
        "timeOnSite": None,
        "estimated": None,
    },
    "feedback": {
        "activeTitle": None,
        "activeDesc": None,
        "resolvedTitle": None,
        "resolvedDesc": None,
        "searchActive": None,
        "searchResolved": None,
        "noActiveSearch": None,
        "noActive": None,
        "noResolvedSearch": None,
        "noResolved": None,
        "screenshot": None,
        "screenshots": None,
        "contact": None,
        "page": None,
        "screenshotsTitle": None,
        "markRead": None,
        "resolved": None,
        "lightboxTitle": None,
        "lightboxAlt": None,
        "captureAlt": None,
        "statusRead": None,
        "statusResolved": None,
    },
    "history": {
        "title": None,
        "localPlayers": None,
        "partiesStats": None,
        "achievements": None,
        "sessions": None,
        "localPlayerNames": None,
        "mode": None,
        "country": None,
        "ip": None,
        "lastActivity": None,
        "playerActivity": None,
        "gamesPlayed": None,
        "noParties": None,
        "currentlyBanned": None,
        "moderationHistory": None,
        "noEvents": None,
        "until": None,
        "by": None,
    },
    "actions": {
        "banPermanent": None,
        "banTemporary": None,
        "unban": None,
    },
    "dialogs": {
        "deleteTitle": None,
        "deleteDesc": None,
        "deleteAccountLabel": None,
        "deleteWarning": None,
        "cancel": None,
        "deleteConfirm": None,
        "unbanTitle": None,
        "unbanAccountLabel": None,
        "commentOptional": None,
        "unbanPlaceholder": None,
        "unbanConfirm": None,
        "banPermanentTitle": None,
        "banTemporaryTitle": None,
        "banAccountLabel": None,
        "durationDays": None,
        "day": None,
        "days": None,
        "banCommentLabel": None,
        "banCommentPlaceholder": None,
        "banConfirm": None,
    },
    "device": {
        "accountCodeTitle": None,
        "deviceTitle": None,
        "moreIps": None,
    },
    "apiErrors": {
        "modifyDenied": None,
        "banDenied": None,
        "deleteDenied": None,
        "unbanDenied": None,
    },
}

SUPERVISION_LOCALIZED = {
    "fr": {
        "title": "Supervision",
        "loading": "Chargement…",
        "refresh": "Actualiser",
        "unknownCountry": "Inconnu",
        "rolesHelpTitle": "Rôles et permissions",
        "rolesHierarchy": "Hiérarchie : joueur < modérateur < admin < super admin < fondateur — seul un grade supérieur peut sanctionner ou modifier un compte (jamais un pair). Les modérateurs : ban temporaire uniquement.",
        "roles": {"fondateur": "Fondateur", "superadmin": "Super admin", "admin": "Admin", "moderator": "Modérateur", "user": "Joueur"},
        "subtitles": {"full": "Tableau de bord complet — stats, jeux, visiteurs et comptes.", "bans": "Gestion des comptes et des bannissements.", "accounts": "Consultation et modération des comptes joueurs."},
        "tabs": {"overview": "Vue d'ensemble", "geo": "Pays / IP", "accounts": "Comptes ({count})", "bans": "Bannis ({count})", "feedback": "Retours ({count})", "feedbackResolved": "Résolus ({count})"},
        "stats": {"onlineNow": "En ligne maintenant", "onlineNowHint": "Visiteurs actifs (5 dernières min.)", "today": "Aujourd'hui", "todayHint": "Visiteurs uniques (jour)", "week": "7 jours", "weekHint": "Visiteurs uniques (semaine)", "month": "30 jours", "monthHint": "Visiteurs uniques (mois)"},
        "accounts": {"registered": "Comptes enregistrés", "total": "Total", "moderators": "Modérateurs", "admins": "Admins", "superAdmins": "Super admins", "founders": "Fondateurs", "adminTitle": "Administration des comptes", "adminDesc": "Recherche par pseudo, email, code unique (ex. LP-ABC123) ou adresse IP.", "searchPlaceholder": "Rechercher un compte ou une IP…", "rolePlaceholder": "Rôle", "statusPlaceholder": "Statut", "allRoles": "Tous les rôles", "players": "Joueurs", "allStatus": "Tous", "online": "En ligne", "banned": "Bannis", "resetFilters": "Réinitialiser", "results": "{count} résultat{plural} sur {total}", "ipAnalyzing": "Analyse de l'IP en cours…", "ipSummary": "IP {ip} — {accounts} compte{accountsPlural}, {visitors} visiteur{visitorsPlural}", "noMatch": "Aucun compte ne correspond à cette recherche.", "registeredOn": "Inscrit le {date}", "seenOn": "Vu le {date}", "you": "Toi", "banReason": "Motif : {reason}", "history": "Historique", "liftBan": "Lever le ban", "permanentBan": "Ban permanent", "temporaryBan": "Ban temporaire", "deleteAccount": "Supprimer le compte"},
        "bans": {"activeTitle": "Bannissements actifs", "activeOverview": "{count} compte(s) suspendu(s)", "suspendedCount": "{count} compte(s) suspendu(s)", "noneActive": "Aucun bannissement actif.", "noneOverview": "Aucun bannissement en cours.", "currentTitle": "Bannissements en cours", "currentDesc": "Comptes suspendus (permanent ou temporaire non expiré)", "noneCurrent": "Aucun bannissement actif.", "permanent": "Permanent", "temporary": "Temporaire", "bannedOn": "Banni le {date}", "expiresOn": "Expire le {date}", "by": "Par : {name}", "comment": "Commentaire : {comment}", "until": "jusqu'au {date}", "unban": "Débannir"},
        "connected": {"recentTitle": "Comptes connectés récemment", "recentDesc": "Joueurs identifiés avec leur IP et pays", "noneRecent": "Aucun compte connecté récemment."},
        "games": {"playedTitle": "Parties jouées par jeu", "playedDesc": "Agrégat cloud des comptes synchronisés", "totalParties": " — {count} partie{plural} au total", "party": "partie", "parties": "parties", "noneRecorded": "Aucune partie enregistrée pour le moment."},
        "geo": {"onlineByCountry": "En ligne par pays", "onlineByCountryDesc": "Visiteurs actifs ces 5 dernières minutes", "todayByCountry": "Connectés aujourd'hui par pays", "todayByCountryDesc": "Visiteurs ayant été actifs dans les dernières 24 h", "tapCountry": " Touchez un pays pour voir les visiteurs.", "noData": "Aucune donnée pour le moment.", "visitorsTitle": "Visiteurs et joueurs", "visitorsDesc": "Un joueur = une ligne (IP principale + menu pour les autres). Touchez une carte pour le détail.", "filterPlaceholder": "Filtrer par IP, pseudo, email ou pays…", "noVisitors": "Aucun visiteur enregistré pour le moment.", "noSearchResults": "Aucun résultat pour cette recherche.", "hide": "Masquer", "details": "Détails", "localPlayer": " joueur local", "localPlayers": " joueurs locaux", "suspicious": "Suspect", "anonymousVisitor": "Visiteur anonyme", "localPlayersLabel": "Joueurs locaux", "noLocalPlayers": "Aucun joueur remonté (visiteur sans liste ou pas encore synchronisé).", "ipAddresses": "Adresses IP", "noIp": "Aucune IP enregistrée", "linkedAccount": "Compte lié", "noLinkedAccount": "Aucun compte associé (visiteur anonyme)", "visitorId": "Visitor ID : {id}", "countryDialogTitle": "Visiteurs — {title}", "countryDialogDesc": "Liste des visiteurs et comptes pour ce pays. Touchez une carte pour voir toutes les IP.", "noVisitorsForCountry": "Aucun visiteur pour ce pays.", "scopeOnline": "en ligne", "scopeToday": "aujourd'hui"},
        "activity": {"lastLogin": "Dernière connexion :", "neverLoggedIn": "Jamais enregistrée", "timeOnSite": "Temps sur le site : {duration}", "estimated": " (estimé via activité)"},
        "feedback": {"activeTitle": "Retours en cours", "activeDesc": "Bugs, suggestions et commentaires à traiter. Une fois résolu, le retour passe dans l'onglet Résolus.", "resolvedTitle": "Retours résolus", "resolvedDesc": "Historique des retours marqués comme résolus.", "searchActive": "Rechercher un bug, auteur, message…", "searchResolved": "Rechercher dans les retours résolus…", "noActiveSearch": "Aucun retour en cours ne correspond à votre recherche.", "noActive": "Aucun retour en cours.", "noResolvedSearch": "Aucun retour résolu ne correspond à votre recherche.", "noResolved": "Aucun retour résolu pour le moment.", "screenshot": " capture", "screenshots": " captures", "contact": "Contact :", "page": "Page :", "screenshotsTitle": "Captures d'écran", "markRead": "Marquer lu", "resolved": "Résolu", "lightboxTitle": "Capture d'écran agrandie", "lightboxAlt": "Capture agrandie", "captureAlt": "Capture {index}", "statusRead": "Lu", "statusResolved": "Résolu"},
        "history": {"title": "Historique du compte", "localPlayers": "Joueurs locaux", "partiesStats": "Parties (stats)", "achievements": "Succès", "sessions": "Sessions", "localPlayerNames": "Noms des joueurs locaux", "mode": "Mode : {mode}", "country": "Pays : {country}", "ip": "IP :", "lastActivity": "Dernière activité : {date}", "playerActivity": "Activité du joueur", "gamesPlayed": "Jeux joués", "noParties": "Aucune partie enregistrée.", "currentlyBanned": "Compte actuellement banni", "moderationHistory": "Historique modération", "noEvents": "Aucun événement.", "until": "Jusqu'au {date}", "by": "{date} · par {name}"},
        "actions": {"banPermanent": "Bannissement permanent", "banTemporary": "Bannissement temporaire", "unban": "Débannissement"},
        "dialogs": {"deleteTitle": "Supprimer définitivement ce compte ?", "deleteDesc": "Compte :", "deleteAccountLabel": "Compte :", "deleteWarning": "Cette action est irréversible : email, joueurs cloud, stats et sessions seront effacés.", "cancel": "Annuler", "deleteConfirm": "Supprimer définitivement", "unbanTitle": "Lever le bannissement", "unbanAccountLabel": "Compte :", "commentOptional": "Commentaire (optionnel)", "unbanPlaceholder": "Motif du débannissement…", "unbanConfirm": "Débannir", "banPermanentTitle": "Bannissement permanent", "banTemporaryTitle": "Bannissement temporaire", "banAccountLabel": "Compte :", "durationDays": "Durée (jours)", "day": "{count} jour", "days": "{count} jours", "banCommentLabel": "Commentaire / motif (visible en interne)", "banCommentPlaceholder": "Ex. : spam, comportement toxique…", "banConfirm": "Confirmer le ban"},
        "device": {"accountCodeTitle": "Code compte unique", "deviceTitle": "Appareil : {label}", "moreIps": "+{count} IP"},
        "apiErrors": {"modifyDenied": "Modification refusée", "banDenied": "Bannissement refusé", "deleteDenied": "Suppression refusée", "unbanDenied": "Débannissement refusé"},
    },
    "en": {
        "title": "Supervision",
        "loading": "Loading…",
        "refresh": "Refresh",
        "unknownCountry": "Unknown",
        "rolesHelpTitle": "Roles and permissions",
        "rolesHierarchy": "Hierarchy: player < moderator < admin < super admin < founder — only a higher rank can sanction or modify an account (never a peer). Moderators: temporary ban only.",
        "roles": {"fondateur": "Founder", "superadmin": "Super admin", "admin": "Admin", "moderator": "Moderator", "user": "Player"},
        "subtitles": {"full": "Full dashboard — stats, games, visitors and accounts.", "bans": "Account and ban management.", "accounts": "Player account review and moderation."},
        "tabs": {"overview": "Overview", "geo": "Country / IP", "accounts": "Accounts ({count})", "bans": "Banned ({count})", "feedback": "Feedback ({count})", "feedbackResolved": "Resolved ({count})"},
        "stats": {"onlineNow": "Online now", "onlineNowHint": "Active visitors (last 5 min.)", "today": "Today", "todayHint": "Unique visitors (day)", "week": "7 days", "weekHint": "Unique visitors (week)", "month": "30 days", "monthHint": "Unique visitors (month)"},
        "accounts": {"registered": "Registered accounts", "total": "Total", "moderators": "Moderators", "admins": "Admins", "superAdmins": "Super admins", "founders": "Founders", "adminTitle": "Account administration", "adminDesc": "Search by username, email, unique code (e.g. LP-ABC123) or IP address.", "searchPlaceholder": "Search an account or IP…", "rolePlaceholder": "Role", "statusPlaceholder": "Status", "allRoles": "All roles", "players": "Players", "allStatus": "All", "online": "Online", "banned": "Banned", "resetFilters": "Reset", "results": "{count} result{plural} of {total}", "ipAnalyzing": "Analyzing IP…", "ipSummary": "IP {ip} — {accounts} account{accountsPlural}, {visitors} visitor{visitorsPlural}", "noMatch": "No account matches this search.", "registeredOn": "Registered on {date}", "seenOn": "Seen on {date}", "you": "You", "banReason": "Reason: {reason}", "history": "History", "liftBan": "Lift ban", "permanentBan": "Permanent ban", "temporaryBan": "Temporary ban", "deleteAccount": "Delete account"},
        "bans": {"activeTitle": "Active bans", "activeOverview": "{count} suspended account(s)", "suspendedCount": "{count} suspended account(s)", "noneActive": "No active ban.", "noneOverview": "No ban in progress.", "currentTitle": "Current bans", "currentDesc": "Suspended accounts (permanent or unexpired temporary)", "noneCurrent": "No active ban.", "permanent": "Permanent", "temporary": "Temporary", "bannedOn": "Banned on {date}", "expiresOn": "Expires on {date}", "by": "By: {name}", "comment": "Comment: {comment}", "until": "until {date}", "unban": "Unban"},
        "connected": {"recentTitle": "Recently connected accounts", "recentDesc": "Identified players with IP and country", "noneRecent": "No recently connected account."},
        "games": {"playedTitle": "Games played", "playedDesc": "Cloud aggregate of synced accounts", "totalParties": " — {count} game{plural} total", "party": "game", "parties": "games", "noneRecorded": "No game recorded yet."},
        "geo": {"onlineByCountry": "Online by country", "onlineByCountryDesc": "Active visitors in the last 5 minutes", "todayByCountry": "Connected today by country", "todayByCountryDesc": "Visitors active in the last 24 h", "tapCountry": " Tap a country to see visitors.", "noData": "No data yet.", "visitorsTitle": "Visitors and players", "visitorsDesc": "One player = one row (primary IP + menu for others). Tap a card for details.", "filterPlaceholder": "Filter by IP, username, email or country…", "noVisitors": "No visitor recorded yet.", "noSearchResults": "No results for this search.", "hide": "Hide", "details": "Details", "localPlayer": " local player", "localPlayers": " local players", "suspicious": "Suspicious", "anonymousVisitor": "Anonymous visitor", "localPlayersLabel": "Local players", "noLocalPlayers": "No player reported (visitor without list or not synced yet).", "ipAddresses": "IP addresses", "noIp": "No IP recorded", "linkedAccount": "Linked account", "noLinkedAccount": "No linked account (anonymous visitor)", "visitorId": "Visitor ID: {id}", "countryDialogTitle": "Visitors — {title}", "countryDialogDesc": "List of visitors and accounts for this country. Tap a card to see all IPs.", "noVisitorsForCountry": "No visitor for this country.", "scopeOnline": "online", "scopeToday": "today"},
        "activity": {"lastLogin": "Last login:", "neverLoggedIn": "Never recorded", "timeOnSite": "Time on site: {duration}", "estimated": " (estimated from activity)"},
        "feedback": {"activeTitle": "Open feedback", "activeDesc": "Bugs, suggestions and comments to handle. Once resolved, feedback moves to the Resolved tab.", "resolvedTitle": "Resolved feedback", "resolvedDesc": "History of feedback marked as resolved.", "searchActive": "Search bug, author, message…", "searchResolved": "Search resolved feedback…", "noActiveSearch": "No open feedback matches your search.", "noActive": "No open feedback.", "noResolvedSearch": "No resolved feedback matches your search.", "noResolved": "No resolved feedback yet.", "screenshot": " screenshot", "screenshots": " screenshots", "contact": "Contact:", "page": "Page:", "screenshotsTitle": "Screenshots", "markRead": "Mark read", "resolved": "Resolved", "lightboxTitle": "Enlarged screenshot", "lightboxAlt": "Enlarged capture", "captureAlt": "Capture {index}", "statusRead": "Read", "statusResolved": "Resolved"},
        "history": {"title": "Account history", "localPlayers": "Local players", "partiesStats": "Games (stats)", "achievements": "Achievements", "sessions": "Sessions", "localPlayerNames": "Local player names", "mode": "Mode: {mode}", "country": "Country: {country}", "ip": "IP:", "lastActivity": "Last activity: {date}", "playerActivity": "Player activity", "gamesPlayed": "Games played", "noParties": "No game recorded.", "currentlyBanned": "Account currently banned", "moderationHistory": "Moderation history", "noEvents": "No events.", "until": "Until {date}", "by": "{date} · by {name}"},
        "actions": {"banPermanent": "Permanent ban", "banTemporary": "Temporary ban", "unban": "Unban"},
        "dialogs": {"deleteTitle": "Permanently delete this account?", "deleteDesc": "Account:", "deleteAccountLabel": "Account:", "deleteWarning": "This action is irreversible: email, cloud players, stats and sessions will be deleted.", "cancel": "Cancel", "deleteConfirm": "Delete permanently", "unbanTitle": "Lift ban", "unbanAccountLabel": "Account:", "commentOptional": "Comment (optional)", "unbanPlaceholder": "Reason for unban…", "unbanConfirm": "Unban", "banPermanentTitle": "Permanent ban", "banTemporaryTitle": "Temporary ban", "banAccountLabel": "Account:", "durationDays": "Duration (days)", "day": "{count} day", "days": "{count} days", "banCommentLabel": "Comment / reason (internal)", "banCommentPlaceholder": "E.g. spam, toxic behavior…", "banConfirm": "Confirm ban"},
        "device": {"accountCodeTitle": "Unique account code", "deviceTitle": "Device: {label}", "moreIps": "+{count} IP"},
        "apiErrors": {"modifyDenied": "Modification denied", "banDenied": "Ban denied", "deleteDenied": "Deletion denied", "unbanDenied": "Unban denied"},
    },
    "es": {
        "title": "Supervisión",
        "loading": "Cargando…",
        "refresh": "Actualizar",
        "unknownCountry": "Desconocido",
        "rolesHelpTitle": "Roles y permisos",
        "rolesHierarchy": "Jerarquía: jugador < moderador < admin < super admin < fundador — solo un rango superior puede sancionar o modificar una cuenta (nunca un par). Moderadores: solo ban temporal.",
        "roles": {"fondateur": "Fundador", "superadmin": "Super admin", "admin": "Admin", "moderator": "Moderador", "user": "Jugador"},
        "subtitles": {"full": "Panel completo — estadísticas, juegos, visitantes y cuentas.", "bans": "Gestión de cuentas y baneos.", "accounts": "Consulta y moderación de cuentas de jugadores."},
        "tabs": {"overview": "Resumen", "geo": "País / IP", "accounts": "Cuentas ({count})", "bans": "Baneados ({count})", "feedback": "Comentarios ({count})", "feedbackResolved": "Resueltos ({count})"},
        "stats": {"onlineNow": "En línea ahora", "onlineNowHint": "Visitantes activos (últimos 5 min.)", "today": "Hoy", "todayHint": "Visitantes únicos (día)", "week": "7 días", "weekHint": "Visitantes únicos (semana)", "month": "30 días", "monthHint": "Visitantes únicos (mes)"},
        "accounts": {"registered": "Cuentas registradas", "total": "Total", "moderators": "Moderadores", "admins": "Admins", "superAdmins": "Super admins", "founders": "Fundadores", "adminTitle": "Administración de cuentas", "adminDesc": "Buscar por usuario, email, código único (ej. LP-ABC123) o IP.", "searchPlaceholder": "Buscar cuenta o IP…", "rolePlaceholder": "Rol", "statusPlaceholder": "Estado", "allRoles": "Todos los roles", "players": "Jugadores", "allStatus": "Todos", "online": "En línea", "banned": "Baneados", "resetFilters": "Restablecer", "results": "{count} resultado{plural} de {total}", "ipAnalyzing": "Analizando IP…", "ipSummary": "IP {ip} — {accounts} cuenta{accountsPlural}, {visitors} visitante{visitorsPlural}", "noMatch": "Ninguna cuenta coincide con esta búsqueda.", "registeredOn": "Registrado el {date}", "seenOn": "Visto el {date}", "you": "Tú", "banReason": "Motivo: {reason}", "history": "Historial", "liftBan": "Levantar ban", "permanentBan": "Ban permanente", "temporaryBan": "Ban temporal", "deleteAccount": "Eliminar cuenta"},
        "bans": {"activeTitle": "Baneos activos", "activeOverview": "{count} cuenta(s) suspendida(s)", "suspendedCount": "{count} cuenta(s) suspendida(s)", "noneActive": "Ningún baneo activo.", "noneOverview": "Ningún baneo en curso.", "currentTitle": "Baneos en curso", "currentDesc": "Cuentas suspendidas (permanente o temporal no expirado)", "noneCurrent": "Ningún baneo activo.", "permanent": "Permanente", "temporary": "Temporal", "bannedOn": "Baneado el {date}", "expiresOn": "Expira el {date}", "by": "Por: {name}", "comment": "Comentario: {comment}", "until": "hasta el {date}", "unban": "Desbanear"},
        "connected": {"recentTitle": "Cuentas conectadas recientemente", "recentDesc": "Jugadores identificados con IP y país", "noneRecent": "Ninguna cuenta conectada recientemente."},
        "games": {"playedTitle": "Partidas por juego", "playedDesc": "Agregado cloud de cuentas sincronizadas", "totalParties": " — {count} partida{plural} en total", "party": "partida", "parties": "partidas", "noneRecorded": "Ninguna partida registrada por ahora."},
        "geo": {"onlineByCountry": "En línea por país", "onlineByCountryDesc": "Visitantes activos en los últimos 5 minutos", "todayByCountry": "Conectados hoy por país", "todayByCountryDesc": "Visitantes activos en las últimas 24 h", "tapCountry": " Toca un país para ver visitantes.", "noData": "Sin datos por ahora.", "visitorsTitle": "Visitantes y jugadores", "visitorsDesc": "Un jugador = una fila (IP principal + menú para otras). Toca una tarjeta para detalles.", "filterPlaceholder": "Filtrar por IP, usuario, email o país…", "noVisitors": "Ningún visitante registrado.", "noSearchResults": "Sin resultados para esta búsqueda.", "hide": "Ocultar", "details": "Detalles", "localPlayer": " jugador local", "localPlayers": " jugadores locales", "suspicious": "Sospechoso", "anonymousVisitor": "Visitante anónimo", "localPlayersLabel": "Jugadores locales", "noLocalPlayers": "Ningún jugador reportado (visitante sin lista o no sincronizado).", "ipAddresses": "Direcciones IP", "noIp": "Ninguna IP registrada", "linkedAccount": "Cuenta vinculada", "noLinkedAccount": "Sin cuenta asociada (visitante anónimo)", "visitorId": "Visitor ID: {id}", "countryDialogTitle": "Visitantes — {title}", "countryDialogDesc": "Lista de visitantes y cuentas para este país.", "noVisitorsForCountry": "Ningún visitante para este país.", "scopeOnline": "en línea", "scopeToday": "hoy"},
        "activity": {"lastLogin": "Última conexión:", "neverLoggedIn": "Nunca registrada", "timeOnSite": "Tiempo en el sitio: {duration}", "estimated": " (estimado por actividad)"},
        "feedback": {"activeTitle": "Comentarios abiertos", "activeDesc": "Bugs, sugerencias y comentarios por tratar.", "resolvedTitle": "Comentarios resueltos", "resolvedDesc": "Historial de comentarios marcados como resueltos.", "searchActive": "Buscar bug, autor, mensaje…", "searchResolved": "Buscar en comentarios resueltos…", "noActiveSearch": "Ningún comentario abierto coincide.", "noActive": "Ningún comentario abierto.", "noResolvedSearch": "Ningún comentario resuelto coincide.", "noResolved": "Ningún comentario resuelto por ahora.", "screenshot": " captura", "screenshots": " capturas", "contact": "Contacto:", "page": "Página:", "screenshotsTitle": "Capturas de pantalla", "markRead": "Marcar leído", "resolved": "Resuelto", "lightboxTitle": "Captura ampliada", "lightboxAlt": "Captura ampliada", "captureAlt": "Captura {index}", "statusRead": "Leído", "statusResolved": "Resuelto"},
        "history": {"title": "Historial de cuenta", "localPlayers": "Jugadores locales", "partiesStats": "Partidas (stats)", "achievements": "Logros", "sessions": "Sesiones", "localPlayerNames": "Nombres de jugadores locales", "mode": "Modo: {mode}", "country": "País: {country}", "ip": "IP:", "lastActivity": "Última actividad: {date}", "playerActivity": "Actividad del jugador", "gamesPlayed": "Juegos jugados", "noParties": "Ninguna partida registrada.", "currentlyBanned": "Cuenta actualmente baneada", "moderationHistory": "Historial de moderación", "noEvents": "Ningún evento.", "until": "Hasta el {date}", "by": "{date} · por {name}"},
        "actions": {"banPermanent": "Baneo permanente", "banTemporary": "Baneo temporal", "unban": "Desbaneo"},
        "dialogs": {"deleteTitle": "¿Eliminar permanentemente esta cuenta?", "deleteDesc": "Cuenta:", "deleteAccountLabel": "Cuenta:", "deleteWarning": "Acción irreversible: email, jugadores cloud, stats y sesiones serán borrados.", "cancel": "Cancelar", "deleteConfirm": "Eliminar permanentemente", "unbanTitle": "Levantar baneo", "unbanAccountLabel": "Cuenta:", "commentOptional": "Comentario (opcional)", "unbanPlaceholder": "Motivo del desbaneo…", "unbanConfirm": "Desbanear", "banPermanentTitle": "Baneo permanente", "banTemporaryTitle": "Baneo temporal", "banAccountLabel": "Cuenta:", "durationDays": "Duración (días)", "day": "{count} día", "days": "{count} días", "banCommentLabel": "Comentario / motivo (interno)", "banCommentPlaceholder": "Ej.: spam, comportamiento tóxico…", "banConfirm": "Confirmar baneo"},
        "device": {"accountCodeTitle": "Código de cuenta único", "deviceTitle": "Dispositivo: {label}", "moreIps": "+{count} IP"},
        "apiErrors": {"modifyDenied": "Modificación denegada", "banDenied": "Baneo denegado", "deleteDenied": "Eliminación denegada", "unbanDenied": "Desbaneo denegado"},
    },
    "it": {
        "title": "Supervisione",
        "loading": "Caricamento…",
        "refresh": "Aggiorna",
        "unknownCountry": "Sconosciuto",
        "rolesHelpTitle": "Ruoli e permessi",
        "rolesHierarchy": "Gerarchia: giocatore < moderatore < admin < super admin < fondatore — solo un grado superiore può sanzionare o modificare un account (mai un pari). Moderatori: solo ban temporaneo.",
        "roles": {"fondateur": "Fondatore", "superadmin": "Super admin", "admin": "Admin", "moderator": "Moderatore", "user": "Giocatore"},
        "subtitles": {"full": "Dashboard completa — statistiche, giochi, visitatori e account.", "bans": "Gestione account e ban.", "accounts": "Consultazione e moderazione account giocatori."},
        "tabs": {"overview": "Panoramica", "geo": "Paese / IP", "accounts": "Account ({count})", "bans": "Bannati ({count})", "feedback": "Feedback ({count})", "feedbackResolved": "Risolti ({count})"},
        "stats": {"onlineNow": "Online ora", "onlineNowHint": "Visitatori attivi (ultimi 5 min.)", "today": "Oggi", "todayHint": "Visitatori unici (giorno)", "week": "7 giorni", "weekHint": "Visitatori unici (settimana)", "month": "30 giorni", "monthHint": "Visitatori unici (mese)"},
        "accounts": {"registered": "Account registrati", "total": "Totale", "moderators": "Moderatori", "admins": "Admin", "superAdmins": "Super admin", "founders": "Fondatori", "adminTitle": "Amministrazione account", "adminDesc": "Cerca per username, email, codice unico (es. LP-ABC123) o IP.", "searchPlaceholder": "Cerca account o IP…", "rolePlaceholder": "Ruolo", "statusPlaceholder": "Stato", "allRoles": "Tutti i ruoli", "players": "Giocatori", "allStatus": "Tutti", "online": "Online", "banned": "Bannati", "resetFilters": "Reimposta", "results": "{count} risultat{plural} su {total}", "ipAnalyzing": "Analisi IP in corso…", "ipSummary": "IP {ip} — {accounts} account{accountsPlural}, {visitors} visitatore{visitorsPlural}", "noMatch": "Nessun account corrisponde a questa ricerca.", "registeredOn": "Iscritto il {date}", "seenOn": "Visto il {date}", "you": "Tu", "banReason": "Motivo: {reason}", "history": "Cronologia", "liftBan": "Rimuovi ban", "permanentBan": "Ban permanente", "temporaryBan": "Ban temporaneo", "deleteAccount": "Elimina account"},
        "bans": {"activeTitle": "Ban attivi", "activeOverview": "{count} account sospeso/i", "suspendedCount": "{count} account sospeso/i", "noneActive": "Nessun ban attivo.", "noneOverview": "Nessun ban in corso.", "currentTitle": "Ban in corso", "currentDesc": "Account sospesi (permanente o temporaneo non scaduto)", "noneCurrent": "Nessun ban attivo.", "permanent": "Permanente", "temporary": "Temporaneo", "bannedOn": "Bannato il {date}", "expiresOn": "Scade il {date}", "by": "Da: {name}", "comment": "Commento: {comment}", "until": "fino al {date}", "unban": "Sbanna"},
        "connected": {"recentTitle": "Account connessi di recente", "recentDesc": "Giocatori identificati con IP e paese", "noneRecent": "Nessun account connesso di recente."},
        "games": {"playedTitle": "Partite per gioco", "playedDesc": "Aggregato cloud degli account sincronizzati", "totalParties": " — {count} partita{plural} in totale", "party": "partita", "parties": "partite", "noneRecorded": "Nessuna partita registrata."},
        "geo": {"onlineByCountry": "Online per paese", "onlineByCountryDesc": "Visitatori attivi negli ultimi 5 minuti", "todayByCountry": "Connessi oggi per paese", "todayByCountryDesc": "Visitatori attivi nelle ultime 24 h", "tapCountry": " Tocca un paese per vedere i visitatori.", "noData": "Nessun dato al momento.", "visitorsTitle": "Visitatori e giocatori", "visitorsDesc": "Un giocatore = una riga. Tocca una scheda per i dettagli.", "filterPlaceholder": "Filtra per IP, username, email o paese…", "noVisitors": "Nessun visitatore registrato.", "noSearchResults": "Nessun risultato per questa ricerca.", "hide": "Nascondi", "details": "Dettagli", "localPlayer": " giocatore locale", "localPlayers": " giocatori locali", "suspicious": "Sospetto", "anonymousVisitor": "Visitatore anonimo", "localPlayersLabel": "Giocatori locali", "noLocalPlayers": "Nessun giocatore segnalato.", "ipAddresses": "Indirizzi IP", "noIp": "Nessuna IP registrata", "linkedAccount": "Account collegato", "noLinkedAccount": "Nessun account associato (visitatore anonimo)", "visitorId": "Visitor ID: {id}", "countryDialogTitle": "Visitatori — {title}", "countryDialogDesc": "Elenco visitatori e account per questo paese.", "noVisitorsForCountry": "Nessun visitatore per questo paese.", "scopeOnline": "online", "scopeToday": "oggi"},
        "activity": {"lastLogin": "Ultimo accesso:", "neverLoggedIn": "Mai registrato", "timeOnSite": "Tempo sul sito: {duration}", "estimated": " (stimato dall'attività)"},
        "feedback": {"activeTitle": "Feedback aperti", "activeDesc": "Bug, suggerimenti e commenti da trattare.", "resolvedTitle": "Feedback risolti", "resolvedDesc": "Cronologia feedback segnati come risolti.", "searchActive": "Cerca bug, autore, messaggio…", "searchResolved": "Cerca nei feedback risolti…", "noActiveSearch": "Nessun feedback aperto corrisponde.", "noActive": "Nessun feedback aperto.", "noResolvedSearch": "Nessun feedback risolto corrisponde.", "noResolved": "Nessun feedback risolto al momento.", "screenshot": " screenshot", "screenshots": " screenshot", "contact": "Contatto:", "page": "Pagina:", "screenshotsTitle": "Screenshot", "markRead": "Segna letto", "resolved": "Risolto", "lightboxTitle": "Screenshot ingrandito", "lightboxAlt": "Capture ingrandita", "captureAlt": "Capture {index}", "statusRead": "Letto", "statusResolved": "Risolto"},
        "history": {"title": "Cronologia account", "localPlayers": "Giocatori locali", "partiesStats": "Partite (stats)", "achievements": "Successi", "sessions": "Sessioni", "localPlayerNames": "Nomi giocatori locali", "mode": "Modalità: {mode}", "country": "Paese: {country}", "ip": "IP:", "lastActivity": "Ultima attività: {date}", "playerActivity": "Attività giocatore", "gamesPlayed": "Giochi giocati", "noParties": "Nessuna partita registrata.", "currentlyBanned": "Account attualmente bannato", "moderationHistory": "Cronologia moderazione", "noEvents": "Nessun evento.", "until": "Fino al {date}", "by": "{date} · da {name}"},
        "actions": {"banPermanent": "Ban permanente", "banTemporary": "Ban temporaneo", "unban": "Sbannamento"},
        "dialogs": {"deleteTitle": "Eliminare definitivamente questo account?", "deleteDesc": "Account:", "deleteAccountLabel": "Account:", "deleteWarning": "Azione irreversibile: email, giocatori cloud, stats e sessioni saranno cancellati.", "cancel": "Annulla", "deleteConfirm": "Elimina definitivamente", "unbanTitle": "Rimuovi ban", "unbanAccountLabel": "Account:", "commentOptional": "Commento (opzionale)", "unbanPlaceholder": "Motivo dello sbannamento…", "unbanConfirm": "Sbanna", "banPermanentTitle": "Ban permanente", "banTemporaryTitle": "Ban temporaneo", "banAccountLabel": "Account:", "durationDays": "Durata (giorni)", "day": "{count} giorno", "days": "{count} giorni", "banCommentLabel": "Commento / motivo (interno)", "banCommentPlaceholder": "Es.: spam, comportamento tossico…", "banConfirm": "Conferma ban"},
        "device": {"accountCodeTitle": "Codice account unico", "deviceTitle": "Dispositivo: {label}", "moreIps": "+{count} IP"},
        "apiErrors": {"modifyDenied": "Modifica rifiutata", "banDenied": "Ban rifiutato", "deleteDenied": "Eliminazione rifiutata", "unbanDenied": "Sbannamento rifiutato"},
    },
}


def patch_messages() -> None:
    for locale in ("fr", "en", "es", "it"):
        path = MESSAGES / f"{locale}.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        data.setdefault("account", {})["reset"] = ACCOUNT_RESET[locale]
        data.setdefault("errors", {}).update(ERRORS_EXTRA[locale])
        data["supervision"] = SUPERVISION_LOCALIZED[locale]
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Patched {path.name}")


def migrate_supervision_page() -> None:
    text = SUPERVISION_PAGE.read_text(encoding="utf-8")

    if "useTranslations" not in text:
        text = text.replace(
            'import { useCallback, useEffect, useMemo, useState } from \'react\'\nimport { useRouter } from \'next/navigation\'',
            'import { useCallback, useEffect, useMemo, useState } from \'react\'\nimport { useFormatter, useLocale, useTranslations } from \'next-intl\'\nimport { useRouter } from \'@/i18n/navigation\'',
        )

    # Helper: inject t hook at start of components — done via manual replacements below
    replacements = [
        ("title=\"Code compte unique\"", "title={t('device.accountCodeTitle')}"),
        ("title={`Appareil : ${label}`}", "title={t('device.deviceTitle', { label })}"),
        ("+{others.length} IP", "{t('device.moreIps', { count: others.length })}"),
        ("return <Badge variant=\"secondary\">Joueur</Badge>", "return <Badge variant=\"secondary\">{t('roles.user')}</Badge>"),
        ("Fondateur\n      </Badge>", "{t('roles.fondateur')}\n      </Badge>"),
        ("Super admin\n      </Badge>", "{t('roles.superadmin')}\n      </Badge>"),
        ("Admin\n      </Badge>", "{t('roles.admin')}\n      </Badge>"),
        ("Modérateur\n      </Badge>", "{t('roles.moderator')}\n      </Badge>"),
        ("Dernière connexion :{' '}", "{t('activity.lastLogin')}{' '}"),
        (": 'Jamais enregistrée'}", ": t('activity.neverLoggedIn')}"),
        (" (estimé via activité)", "{t('activity.estimated')}"),
        ("return 'Bannissement permanent'", "return t('actions.banPermanent')"),
        ("return 'Bannissement temporaire'", "return t('actions.banTemporary')"),
        ("return 'Débannissement'", "return t('actions.unban')"),
        ("Aucune donnée pour le moment.", "{t('geo.noData')}"),
        (" Touchez un pays pour voir les visiteurs.'", "{t('geo.tapCountry')}"),
        ("Joueurs locaux</p>", "{t('geo.localPlayersLabel')}</p>"),
        ("Aucun joueur remonté (visiteur sans liste ou pas encore synchronisé).", "{t('geo.noLocalPlayers')}"),
        ("Suspect\n          </Badge>", "{t('geo.suspicious')}\n          </Badge>"),
        ("Adresses IP</p>", "{t('geo.ipAddresses')}</p>"),
        ("Aucune IP enregistrée</p>", "{t('geo.noIp')}</p>"),
        ("Compte lié</p>", "{t('geo.linkedAccount')}</p>"),
        ("Aucun compte associé (visiteur anonyme)</p>", "{t('geo.noLinkedAccount')}</p>"),
        ("Visitor ID : {row.visitorId}</p>", "{t('geo.visitorId', { id: row.visitorId })}</p>"),
        ("En ligne</Badge>", "{t('accounts.online')}</Badge>"),
        ("Visiteur anonyme</span>", "{t('geo.anonymousVisitor')}</span>"),
        ("Visiteurs et joueurs\n        </CardTitle>", "{t('geo.visitorsTitle')}\n        </CardTitle>"),
        ("Un joueur = une ligne (IP principale + menu pour les autres). Touchez une carte pour le détail.", "{t('geo.visitorsDesc')}"),
        ('placeholder="Filtrer par IP, pseudo, email ou pays…"', 'placeholder={t(\'geo.filterPlaceholder\')}'),
        ("? 'Aucun visiteur enregistré pour le moment.'", "? t('geo.noVisitors')"),
        (": 'Aucun résultat pour cette recherche.'}", ": t('geo.noSearchResults')}"),
        ("? 'Masquer' : 'Détails'}", "? t('geo.hide') : t('geo.details')}"),
        (" joueur{row.localPlayerCount > 1 ? 's locaux' : ' local'}", "{row.localPlayerCount > 1 ? t('geo.localPlayers') : t('geo.localPlayer')}"),
        ("Chargement…\n      </div>", "{t('loading')}\n      </div>"),
        (">Supervision</h1>", ">{t('title')}</h1>"),
        ("? 'Tableau de bord complet — stats, jeux, visiteurs et comptes.'", "? t('subtitles.full')"),
        ("? 'Gestion des comptes et des bannissements.'", "? t('subtitles.bans')"),
        (": 'Consultation et modération des comptes joueurs.'}", ": t('subtitles.accounts')}"),
        ("Actualiser\n        </Button>", "{t('refresh')}\n        </Button>"),
        (">Rôles et permissions</AlertTitle>", ">{t('rolesHelpTitle')}</AlertTitle>"),
        ("Hiérarchie : joueur", "{t('rolesHierarchy')}"),
        ("Vue d&apos;ensemble</TabsTrigger>", "{t('tabs.overview')}</TabsTrigger>"),
        ("Pays / IP</TabsTrigger>", "{t('tabs.geo')}</TabsTrigger>"),
        ('label="En ligne maintenant"', 'label={t(\'stats.onlineNow\')}'),
        ('hint="Visiteurs actifs (5 dernières min.)"', 'hint={t(\'stats.onlineNowHint\')}'),
        ('label="Aujourd\'hui"', 'label={t(\'stats.today\')}'),
        ('hint="Visiteurs uniques (jour)"', 'hint={t(\'stats.todayHint\')}'),
        ('label="7 jours"', 'label={t(\'stats.week\')}'),
        ('hint="Visiteurs uniques (semaine)"', 'hint={t(\'stats.weekHint\')}'),
        ('label="30 jours"', 'label={t(\'stats.month\')}'),
        ('hint="Visiteurs uniques (mois)"', 'hint={t(\'stats.monthHint\')}'),
        ("Comptes enregistrés\n                </CardTitle>", "{t('accounts.registered')}\n                </CardTitle>"),
        (">Total</p>", ">{t('accounts.total')}</p>"),
        (">Modérateurs</p>", ">{t('accounts.moderators')}</p>"),
        (">Admins</p>", ">{t('accounts.admins')}</p>"),
        (">Super admins</p>", ">{t('accounts.superAdmins')}</p>"),
        (">Fondateurs</p>", ">{t('accounts.founders')}</p>"),
        (">Bannissements actifs</CardTitle>", ">{t('bans.activeTitle')}</CardTitle>"),
        ("Aucun bannissement en cours.", "{t('bans.noneOverview')}"),
        ("Comptes connectés récemment\n              </CardTitle>", "{t('connected.recentTitle')}\n              </CardTitle>"),
        ("Joueurs identifiés avec leur IP et pays", "{t('connected.recentDesc')}"),
        ("Aucun compte connecté récemment.", "{t('connected.noneRecent')}"),
        ("Parties jouées par jeu\n              </CardTitle>", "{t('games.playedTitle')}\n              </CardTitle>"),
        ("Agrégat cloud des comptes synchronisés", "{t('games.playedDesc')}"),
        ("Aucune partie enregistrée pour le moment.", "{t('games.noneRecorded')}"),
        ('title="En ligne par pays"', 'title={t(\'geo.onlineByCountry\')}'),
        ('description="Visiteurs actifs ces 5 dernières minutes"', 'description={t(\'geo.onlineByCountryDesc\')}'),
        ('title="Connectés aujourd\'hui par pays"', 'title={t(\'geo.todayByCountry\')}'),
        ('description="Visiteurs ayant été actifs dans les dernières 24 h"', 'description={t(\'geo.todayByCountryDesc\')}'),
        (">Administration des comptes</CardTitle>", ">{t('accounts.adminTitle')}</CardTitle>"),
        ("Recherche par pseudo, email, code unique (ex. LP-ABC123) ou adresse IP.", "{t('accounts.adminDesc')}"),
        ('placeholder="Rechercher un compte ou une IP…"', 'placeholder={t(\'accounts.searchPlaceholder\')}'),
        ('placeholder="Rôle"', 'placeholder={t(\'accounts.rolePlaceholder\')}'),
        ('placeholder="Statut"', 'placeholder={t(\'accounts.statusPlaceholder\')}'),
        (">Tous les rôles</SelectItem>", ">{t('accounts.allRoles')}</SelectItem>"),
        (">Joueurs</SelectItem>", ">{t('accounts.players')}</SelectItem>"),
        (">Tous</SelectItem>", ">{t('accounts.allStatus')}</SelectItem>"),
        (">Bannis</SelectItem>", ">{t('accounts.banned')}</SelectItem>"),
        ("Réinitialiser\n                  </Button>", "{t('accounts.resetFilters')}\n                  </Button>"),
        ("Analyse de l&apos;IP en cours…</p>", "{t('accounts.ipAnalyzing')}</p>"),
        ("Aucun compte ne correspond à cette recherche.", "{t('accounts.noMatch')}"),
        (">Historique\n                      </Button>", ">{t('accounts.history')}\n                      </Button>"),
        (">Banni\n                          </Badge>", ">{t('accounts.banned')}\n                          </Badge>"),
        (">Toi\n                          </Badge>", ">{t('accounts.you')}\n                          </Badge>"),
        ("Lever le ban\n                          </Button>", "{t('accounts.liftBan')}\n                          </Button>"),
        ("Ban permanent\n                            </Button>", "{t('accounts.permanentBan')}\n                            </Button>"),
        ("Ban temporaire\n                            </Button>", "{t('accounts.temporaryBan')}\n                            </Button>"),
        ("Supprimer le compte\n                        </Button>", "{t('accounts.deleteAccount')}\n                        </Button>"),
        ("Bannissements en cours\n              </CardTitle>", "{t('bans.currentTitle')}\n              </CardTitle>"),
        ("Comptes suspendus (permanent ou temporaire non expiré)", "{t('bans.currentDesc')}"),
        ("Aucun bannissement actif.", "{t('bans.noneActive')}"),
        (">Permanent' : 'Temporaire'}", ">t('bans.permanent') : t('bans.temporary')}"),
        ("Débannir\n                      </Button>", "{t('bans.unban')}\n                      </Button>"),
        ("Retours en cours\n              </CardTitle>", "{t('feedback.activeTitle')}\n              </CardTitle>"),
        ('placeholder="Rechercher un bug, auteur, message…"', 'placeholder={t(\'feedback.searchActive\')}'),
        ("? 'Aucun retour en cours ne correspond à votre recherche.'", "? t('feedback.noActiveSearch')"),
        (": 'Aucun retour en cours.'", ": t('feedback.noActive')"),
        ("Retours résolus\n              </CardTitle>", "{t('feedback.resolvedTitle')}\n              </CardTitle>"),
        ('placeholder="Rechercher dans les retours résolus…"', 'placeholder={t(\'feedback.searchResolved\')}'),
        ("? 'Aucun retour résolu ne correspond à votre recherche.'", "? t('feedback.noResolvedSearch')"),
        (": 'Aucun retour résolu pour le moment.'", ": t('feedback.noResolved')"),
        (">Supprimer définitivement ce compte ?</DialogTitle>", ">{t('dialogs.deleteTitle')}</DialogTitle>"),
        ("Cette action est irréversible : email, joueurs cloud, stats et sessions seront effacés.", "{t('dialogs.deleteWarning')}"),
        (">Annuler\n            </Button>", ">{t('dialogs.cancel')}\n            </Button>"),
        (">Supprimer définitivement\n            </Button>", ">{t('dialogs.deleteConfirm')}\n            </Button>"),
        (">Lever le bannissement</DialogTitle>", ">{t('dialogs.unbanTitle')}</DialogTitle>"),
        ("Commentaire (optionnel)", "{t('dialogs.commentOptional')}"),
        ('placeholder="Motif du débannissement…"', 'placeholder={t(\'dialogs.unbanPlaceholder\')}'),
        (">Débannir\n            </Button>", ">{t('dialogs.unbanConfirm')}\n            </Button>"),
        ("? 'Bannissement permanent' : 'Bannissement temporaire'}", "? t('dialogs.banPermanentTitle') : t('dialogs.banTemporaryTitle')}"),
        (">Durée (jours)</label>", ">{t('dialogs.durationDays')}</label>"),
        (">1 jour</SelectItem>", ">{t('dialogs.day', { count: 1 })}</SelectItem>"),
        (">3 jours</SelectItem>", ">{t('dialogs.days', { count: 3 })}</SelectItem>"),
        (">7 jours</SelectItem>", ">{t('dialogs.days', { count: 7 })}</SelectItem>"),
        (">14 jours</SelectItem>", ">{t('dialogs.days', { count: 14 })}</SelectItem>"),
        (">30 jours</SelectItem>", ">{t('dialogs.days', { count: 30 })}</SelectItem>"),
        (">90 jours</SelectItem>", ">{t('dialogs.days', { count: 90 })}</SelectItem>"),
        ("Commentaire / motif (visible en interne)", "{t('dialogs.banCommentLabel')}"),
        ('placeholder="Ex. : spam, comportement toxique…"', 'placeholder={t(\'dialogs.banCommentPlaceholder\')}'),
        (">Confirmer le ban\n            </Button>", ">{t('dialogs.banConfirm')}\n            </Button>"),
        (">Historique du compte</DialogTitle>", ">{t('history.title')}</DialogTitle>"),
        (">Parties (stats)</p>", ">{t('history.partiesStats')}</p>"),
        (">Succès</p>", ">{t('history.achievements')}</p>"),
        (">Sessions</p>", ">{t('history.sessions')}</p>"),
        ("Noms des joueurs locaux</p>", "{t('history.localPlayerNames')}</p>"),
        ("Activité du joueur\n                  </p>", "{t('history.playerActivity')}\n                  </p>"),
        ("Jeux joués</p>", "{t('history.gamesPlayed')}</p>"),
        ("Aucune partie enregistrée.</p>", "{t('history.noParties')}</p>"),
        ("Compte actuellement banni", "{t('history.currentlyBanned')}"),
        ("Historique modération\n                </p>", "{t('history.moderationHistory')}\n                </p>"),
        ("Aucun événement.</p>", "{t('history.noEvents')}</p>"),
        (">Marquer lu\n                  </Button>", ">{t('feedback.markRead')}\n                  </Button>"),
        (">Résolu\n                  </Button>", ">{t('feedback.resolved')}\n                  </Button>"),
        (">Captures d&apos;écran</p>", ">{t('feedback.screenshotsTitle')}</p>"),
        ("Visiteurs — {countryDialog?.title}", "{t('geo.countryDialogTitle', { title: countryDialog?.title ?? '' })}"),
        ("Liste des visiteurs et comptes pour ce pays. Touchez une carte pour voir toutes les IP.", "{t('geo.countryDialogDesc')}"),
        ("Aucun visiteur pour ce pays.</p>", "{t('geo.noVisitorsForCountry')}</p>"),
        (">Capture d&apos;écran agrandie</DialogTitle>", ">{t('feedback.lightboxTitle')}</DialogTitle>"),
        ('alt="Capture agrandie"', 'alt={t(\'feedback.lightboxAlt\')}'),
        ("'Modification refusée'", "t('apiErrors.modifyDenied')"),
        ("'Bannissement refusé'", "t('apiErrors.banDenied')"),
        ("'Suppression refusée'", "t('apiErrors.deleteDenied')"),
        ("'Débannissement refusé'", "t('apiErrors.unbanDenied')"),
        ("status === 'read' ? 'Lu' : 'Résolu'", "status === 'read' ? t('feedback.statusRead') : t('feedback.statusResolved')"),
        ("toLocaleDateString('fr-FR')", "format.dateTime(new Date(/*DATE*/), { dateStyle: 'medium' })"),
        ("toLocaleString('fr-FR')", "format.dateTime(new Date(/*DATE*/), { dateStyle: 'medium', timeStyle: 'short' })"),
    ]

    # Don't apply broken date replacements via simple replace — handle separately
    for old, new in replacements:
        if "/*DATE*/" in new:
            continue
        if old in text:
            text = text.replace(old, new)

    # Inject hooks into helper components
    hook_injections = [
        ("function AccountCodeBadge({ code }", "function AccountCodeBadge({ code }"),
        ("function AccountCodeBadge({ code }: { code: string | null | undefined }) {\n  if (!code) return null", "function AccountCodeBadge({ code }: { code: string | null | undefined }) {\n  const t = useTranslations('supervision')\n  if (!code) return null"),
        ("function DeviceBadge({ device, compact }", "function DeviceBadge({ device, compact }"),
        ("function DeviceBadge({ device, compact }: { device?: string | null; compact?: boolean }) {\n  const label = deviceLabel(device)", "function DeviceBadge({ device, compact }: { device?: string | null; compact?: boolean }) {\n  const t = useTranslations('supervision')\n  const label = deviceLabel(device)"),
        ("function IpAddressDisplay({", "function IpAddressDisplay({"),
        ("function IpAddressDisplay({\n  ips,", "function IpAddressDisplay({\n  ips,"),
        ("}) {\n  if (ips.length === 0) {", "}) {\n  const t = useTranslations('supervision')\n  const locale = useLocale()\n  const format = useFormatter()\n  if (ips.length === 0) {"),
        ("function actionLabel(action: string): string {", "function useActionLabel() {\n  const t = useTranslations('supervision')\n  return (action: string): string => {"),
        ("      return action\n  }\n}", "      return action\n  }\n  }\n}"),
        ("function CountryList({", "function CountryList({"),
        ("}) {\n  const scope = title.toLowerCase().includes('aujourd') ? 'today' : 'online'", "}) {\n  const t = useTranslations('supervision')\n  const scope = title.toLowerCase().includes('aujourd') || title.toLowerCase().includes('today') || title.toLowerCase().includes('oggi') || title.toLowerCase().includes('hoy') ? 'today' : 'online'"),
        ("function LocalPlayersSection({ row }", "function LocalPlayersSection({ row }"),
        ("function LocalPlayersSection({ row }: { row: VisitorIpRow }) {\n  if (row.localPlayerCount === 0) {", "function LocalPlayersSection({ row }: { row: VisitorIpRow }) {\n  const t = useTranslations('supervision')\n  if (row.localPlayerCount === 0) {"),
        ("function VisitorDetailPanel({", "function VisitorDetailPanel({"),
        ("function VisitorDetailPanel({\n  row,", "function VisitorDetailPanel({\n  row,"),
        ("}) {\n  return (\n    <div className=\"mt-3 space-y-2 border-t border-white/10 pt-3 text-sm\">", "}) {\n  const t = useTranslations('supervision')\n  const locale = useLocale()\n  const format = useFormatter()\n  return (\n    <div className=\"mt-3 space-y-2 border-t border-white/10 pt-3 text-sm\">"),
        ("function IpVisitorList({", "function IpVisitorList({"),
        ("function IpVisitorList({\n  rows,", "function IpVisitorList({\n  rows,"),
        ("}) {\n  const [query, setQuery] = useState('')", "}) {\n  const t = useTranslations('supervision')\n  const locale = useLocale()\n  const format = useFormatter()\n  const [query, setQuery] = useState('')"),
        ("function RoleBadge({ role }", "function RoleBadge({ role }"),
        ("function RoleBadge({ role }: { role: string }) {\n  if (role === 'fondateur') {", "function RoleBadge({ role }: { role: string }) {\n  const t = useTranslations('supervision')\n  if (role === 'fondateur') {"),
        ("function UserActivityLines({", "function UserActivityLines({"),
        ("}) {\n  return (\n    <div className={compact ? 'space-y-0.5 text-[11px] text-white/35' : 'space-y-1 text-sm text-white/60'}>", "}) {\n  const t = useTranslations('supervision')\n  const format = useFormatter()\n  return (\n    <div className={compact ? 'space-y-0.5 text-[11px] text-white/35' : 'space-y-1 text-sm text-white/60'}>"),
        ("function FeedbackListSection({", "function FeedbackListSection({"),
        ("function FeedbackListSection({\n  items,", "function FeedbackListSection({\n  items,"),
        ("}) {\n  if (items.length === 0) {", "}) {\n  const format = useFormatter()\n  if (items.length === 0) {"),
        ("export default function SupervisionPage() {\n  const { user, loading } = useAuth()\n  const router = useRouter()", "export default function SupervisionPage() {\n  const t = useTranslations('supervision')\n  const tCommon = useTranslations('common')\n  const tErrors = useTranslations('errors')\n  const locale = useLocale()\n  const format = useFormatter()\n  const actionLabel = useActionLabel()\n  const { user, loading } = useAuth()\n  const router = useRouter()"),
    ]

    for old, new in hook_injections:
        if old != new and old in text:
            text = text.replace(old, new, 1)

    # countryLabel with locale
    text = re.sub(
        r"countryLabel\(([^)]+)\)",
        lambda m: f"countryLabel({m.group(1)}, locale, t('unknownCountry'))" if 'locale' not in m.group(1) else m.group(0),
        text,
    )

    # Fix duplicate locale in countryLabel calls
    text = text.replace("locale, t('unknownCountry'), locale", "locale, t('unknownCountry')")

    # Date formatting
    text = text.replace(
        "new Date(entry.lastSeenAt).toLocaleDateString('fr-FR')",
        "format.dateTime(new Date(entry.lastSeenAt), { dateStyle: 'medium' })",
    )
    text = text.replace(
        "new Date(item.createdAt).toLocaleString('fr-FR')",
        "format.dateTime(new Date(item.createdAt), { dateStyle: 'medium', timeStyle: 'short' })",
    )
    text = text.replace(
        "new Date(lastLoginAt).toLocaleString('fr-FR')",
        "format.dateTime(new Date(lastLoginAt), { dateStyle: 'medium', timeStyle: 'short' })",
    )
    text = text.replace(
        "new Date(entry.lastSeenAt).toLocaleString('fr-FR')",
        "format.dateTime(new Date(entry.lastSeenAt), { dateStyle: 'medium', timeStyle: 'short' })",
    )
    text = text.replace(
        "new Date(row.lastSeenAt).toLocaleString('fr-FR')",
        "format.dateTime(new Date(row.lastSeenAt), { dateStyle: 'medium', timeStyle: 'short' })",
    )
    text = text.replace(
        "new Date(b.bannedUntil).toLocaleDateString('fr-FR')",
        "format.dateTime(new Date(b.bannedUntil), { dateStyle: 'medium' })",
    )
    text = text.replace(
        "new Date(u.createdAt).toLocaleDateString('fr-FR')",
        "format.dateTime(new Date(u.createdAt), { dateStyle: 'medium' })",
    )
    text = text.replace(
        "new Date(u.lastSeenAt).toLocaleString('fr-FR')",
        "format.dateTime(new Date(u.lastSeenAt), { dateStyle: 'medium', timeStyle: 'short' })",
    )
    text = text.replace(
        "new Date(acc.lastSeenAt).toLocaleString('fr-FR')",
        "format.dateTime(new Date(acc.lastSeenAt), { dateStyle: 'medium', timeStyle: 'short' })",
    )
    text = text.replace(
        "new Date(b.bannedAt).toLocaleString('fr-FR')",
        "format.dateTime(new Date(b.bannedAt), { dateStyle: 'medium', timeStyle: 'short' })",
    )
    text = text.replace(
        "new Date(b.bannedUntil).toLocaleString('fr-FR')",
        "format.dateTime(new Date(b.bannedUntil), { dateStyle: 'medium', timeStyle: 'short' })",
    )
    text = text.replace(
        "new Date(historyDetail.user.lastSeenAt).toLocaleString('fr-FR')",
        "format.dateTime(new Date(historyDetail.user.lastSeenAt), { dateStyle: 'medium', timeStyle: 'short' })",
    )
    text = text.replace(
        "new Date(ev.createdAt).toLocaleString('fr-FR')",
        "format.dateTime(new Date(ev.createdAt), { dateStyle: 'medium', timeStyle: 'short' })",
    )
    text = text.replace(
        "new Date(ev.bannedUntil).toLocaleString('fr-FR')",
        "format.dateTime(new Date(ev.bannedUntil), { dateStyle: 'medium', timeStyle: 'short' })",
    )
    text = text.replace(
        "new Date(selectedFeedback.createdAt).toLocaleString('fr-FR')",
        "format.dateTime(new Date(selectedFeedback.createdAt), { dateStyle: 'medium', timeStyle: 'short' })",
    )
    text = text.replace(
        "new Date(row.lastSeenAt).toLocaleString('fr-FR')",
        "format.dateTime(new Date(row.lastSeenAt), { dateStyle: 'medium', timeStyle: 'short' })",
    )

    # Generic error strings
    text = text.replace("e.message : 'Erreur'", "e.message : tErrors('generic')")
    text = text.replace("data.error ?? 'Erreur'", "data.error ?? tErrors('generic')")

    # handleCountryClick title
    text = text.replace(
        "const title = `${countryLabel(country)} — ${scope === 'online' ? 'en ligne' : 'aujourd\\'hui'}`",
        "const title = `${countryLabel(country, locale, t('unknownCountry'))} — ${scope === 'online' ? t('geo.scopeOnline') : t('geo.scopeToday')}`",
    )

    # Temps sur le site
    text = text.replace(
        "Temps sur le site : {formatPresenceDuration(totalPresenceSeconds)}",
        "{t('activity.timeOnSite', { duration: formatPresenceDuration(totalPresenceSeconds) })}",
    )

    # Remove broken roles hierarchy duplicate line if both exist
    text = text.replace(
        "{t('rolesHierarchy')} &lt; modérateur &lt; admin &lt; super admin &lt; fondateur — seul un grade supérieur peut sanctionner ou modifier un compte (jamais un pair). Les modérateurs : ban temporaire uniquement.",
        "{t('rolesHierarchy')}",
    )

    SUPERVISION_PAGE.write_text(text, encoding="utf-8")
    print("Migrated supervision page (partial — review manually)")


if __name__ == "__main__":
    patch_messages()
    migrate_supervision_page()
