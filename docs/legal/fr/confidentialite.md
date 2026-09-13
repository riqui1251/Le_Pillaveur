# Politique de confidentialité

**Dernière mise à jour :** 13 septembre 2026

## 1. Introduction

La présente politique de confidentialité décrit comment **Le Pillaveur** (ci-après « le Service »), édité par **Simon Cozzi**, collecte, utilise et protège vos données personnelles conformément au Règlement Général sur la Protection des Données (RGPD) et à la loi Informatique et Libertés.

**Contact données personnelles :** lepillaveur@outlook.fr

## 2. Responsable du traitement

- **Responsable :** Simon Cozzi
- **Adresse :** disponible sur demande à lepillaveur@outlook.fr

## 3. Données collectées

### 3.1 Données de compte (inscription)

Lors de la création d'un compte, nous collectons :

- adresse email ;
- mot de passe (stocké sous forme de **empreinte cryptographique** — jamais en clair) ;
- pseudo (nom d'affichage).

### 3.2 Données de jeu

Si vous utilisez un compte, nous pouvons stocker :

- statistiques de parties (nombre de parties, victoires, défaites) ;
- compteurs de « gorgées » (unités ludiques abstraites, sans lien avec une consommation réelle) ;
- succès et achievements débloqués ;
- progression en ligne (expérience, niveau, cosmétiques) et résultats de parties en ligne (classements) ;
- liste d'amis (demandes envoyées et acceptées) ;
- statut « en ligne » visible par vos amis : il indique seulement si votre compte a été actif sur le site au cours des 3 dernières minutes (date de dernière activité du compte), que vous ayez accepté ou non les statistiques de visite ; ni l'heure exacte ni votre historique ne leur sont communiqués ;
- liste de joueurs synchronisée (pseudos locaux que vous créez).

En **mode local** (sans compte), vos joueurs locaux sont stockés sur votre appareil. La liste de leurs pseudos peut toutefois être transmise au serveur dans deux cas : si vous avez **accepté les statistiques de visite** (voir 3.3 — elle sert alors aussi à la détection de robots), ou si vous êtes **connecté à un compte** (synchronisation entre appareils). Si vous refusez les statistiques et n'avez pas de compte, ces pseudos ne quittent pas votre appareil.

### 3.3 Données techniques et d'usage

**Avec votre consentement** (choix « statistiques de visite » proposé à l'entrée du site), nous collectons pour des statistiques de fréquentation et la lutte anti-abus :

- identifiant de visiteur (cookie `lp_vid`) ;
- adresse IP ;
- pays estimé (géolocalisation approximative par adresse IP, calculée sur nos serveurs — aucun service tiers) ;
- type d'appareil / navigateur (user-agent simplifié) ;
- dates de connexion et temps de présence sur le site, ainsi que le dernier compte utilisé sur ce navigateur et la date de son dernier passage connecté (pour distinguer un navigateur encore connecté à ce compte d'un navigateur où il a seulement été utilisé auparavant).

Si vous refusez, aucun suivi de visite n'est enregistré.

**Indépendamment de ce consentement**, pour les **comptes connectés** uniquement, nous conservons l'adresse IP, le pays estimé et le type d'appareil des dernières connexions, ainsi que la date de dernière activité du compte (qui sert aussi au statut « en ligne » visible par vos amis et à la suppression automatique des comptes invités inactifs), au titre de la **sécurité et de la modération des comptes** (prévention des fraudes, bannissements) — base : intérêt légitime.

Dans les outils de modération du site, les adresses IPv6 d'un même réseau (même préfixe /64, en général une même box ou un même lieu) sont regroupées à l'affichage : ce regroupement est calculé à la lecture et n'enregistre aucune donnée supplémentaire.

### 3.4 Chat et parties en ligne

Les messages envoyés dans le **chat** (chat de partie et messages entre amis) sont stockés sur nos serveurs et peuvent être soumis à un filtrage automatique de langage inapproprié. Ils sont conservés au maximum **12 mois** puis supprimés. L'état des parties en ligne (coups joués, votes, dessins) est temporaire et supprimé avec la table de jeu. Nous conservons en revanche un **journal d'exploitation** des parties lancées — jeu, date, durée de la table, motif de fin (terminée, revanche, table quittée, fermée par l'équipe, abandonnée) et participants — pendant **12 mois**, pour suivre l'usage du service et instruire les signalements. Ce journal est consultable **compte par compte** par l'administration du site (parties lancées, séances de jeu et durée des tables auxquelles le compte a participé) et sert aussi à des statistiques de jeu en ligne qui ne nomment personne (joueurs uniques, parties lancées par jour) — base : intérêt légitime. Il ne contient aucun contenu de partie, et un compte supprimé cesse d'y être nommé.

### 3.5 Chat vocal

Le chat vocal utilise une connexion **pair-à-pair (WebRTC)** entre les joueurs : la voix **n'est ni enregistrée ni stockée** sur nos serveurs. Le serveur ne relaie que la signalisation technique (mise en relation) et, si nécessaire, un relais chiffré (TURN) sans conservation.

### 3.6 Modération des pseudos

Lorsqu'un pseudo est refusé par le filtre de langage (inscription, renommage), une trace de la tentative (pseudo tenté, contexte, user-agent) est conservée à des fins de modération et de prévention des abus — base : intérêt légitime. Conservation : **12 mois** maximum.

### 3.7 Feedback utilisateur

Si vous utilisez le formulaire de feedback, nous pouvons collecter :

- votre message ;
- captures d'écran que vous joignez volontairement ;
- email de contact (optionnel) ;
- contexte technique (page visitée, navigateur).

### 3.8 Cookies

Le Service utilise les cookies suivants :

| Cookie | Finalité | Durée |
|--------|----------|-------|
| `lp_session` | Maintien de votre session connectée | 30 jours (91 jours pour un compte invité), prolongés à chaque visite, sauf pour les comptes de l'équipe de modération |
| `lp_local_play` | Activation du mode local sans compte | Persistant |
| `lp_age_verified` | Mémorisation de votre déclaration d'âge (18+), exigée avant la création d'un compte invité | 1 an |
| `lp_analytics_consent` | Mémorisation de votre choix sur les statistiques de visite | 1 an |
| `lp_locale` | Mémorisation de votre langue d'interface | 1 an |
| `lp_vid` | Identifiant visiteur pour statistiques et anti-abus — **déposé uniquement si vous avez accepté les statistiques de visite** | Persistant |

Vous pouvez modifier votre choix sur les statistiques de visite en supprimant les cookies du site dans votre navigateur : la question vous sera reposée à la prochaine visite.

## 4. Finalités du traitement

Vos données sont traitées pour :

- créer et gérer votre compte ;
- authentifier vos connexions ;
- synchroniser vos joueurs et statistiques entre appareils ;
- faire fonctionner les parties en ligne (tables, chat, classements) et en suivre l'usage (journal des parties, consultable compte par compte par l'administration du site) ;
- assurer la sécurité du Service et prévenir les abus ;
- modérer les comptes et les contenus (suspension, bannissement en cas de violation) ;
- répondre à vos demandes de support et feedback ;
- produire des statistiques d'audience (avec votre consentement) ;
- respecter nos obligations légales.

Nous **ne vendons pas** vos données personnelles à des tiers.

## 5. Base légale

| Traitement | Base légale |
|------------|-------------|
| Compte et authentification | Exécution du contrat (CGU) |
| Statistiques de jeu, amis, classements | Exécution du contrat |
| Chat et parties en ligne | Exécution du contrat |
| Sécurité et modération (comptes, pseudos, contenus) | Intérêt légitime |
| Date de dernière activité du compte (statut « en ligne » visible par vos amis, sécurité, suppression des comptes invités inactifs) | Intérêt légitime |
| Journal des parties lancées (suivi de l'usage, signalements, consultation compte par compte par l'administration du site) | Intérêt légitime |
| Statistiques de visite (cookie `lp_vid`, IP, appareil) | **Consentement** |
| Porte d'âge (cookie) | Intérêt légitime (conformité) |
| Feedback | Consentement (envoi volontaire) |

## 6. Destinataires et sous-traitants

Vos données peuvent être traitées par :

- **L'hébergeur du Service** : OVH SAS — 2 rue Kellermann, 59100 Roubaix (France)
- **Resend** (envoi d'emails de réinitialisation de mot de passe) — États-Unis, avec garanties contractuelles appropriées

L'éditeur reste responsable du traitement. Aucun autre transfert à des tiers n'est effectué sans votre consentement, sauf obligation légale.

## 7. Durée de conservation

- **Compte actif** : données conservées tant que le compte existe.
- **Compte invité** (créé sans email ni mot de passe : en scannant un QR code, par un lien d'invitation ou avec « Essayer avec des bots ») : supprimé automatiquement après **90 jours** sans activité, avec tout ce qu'il contient (pseudo, progression, cosmétiques, amis). Il n'est accessible que par le cookie de session du navigateur (ou de l'application) où il a été créé : chaque visite depuis ce navigateur repousse ce délai, mais il reste inaccessible depuis un autre navigateur ou un autre appareil, et se déconnecter, se connecter à un autre compte dans ce navigateur ou effacer ses cookies le rend définitivement inaccessible. Un compte invité qui n'a plus aucune session valide (après une déconnexion, une connexion à un autre compte dans ce navigateur ou l'expiration de sa session) est supprimé plus tôt, après **7 jours** sans activité, sauf s'il est banni ou visé par un signalement en cours d'examen. Ajouter un email et un mot de passe, ou lier le compte à Google, le rend permanent.
- **Compte supprimé** : suppression ou anonymisation dans un délai de **12 mois** maximum après la demande, sauf obligation légale de conservation plus longue.
- **Logs techniques (adresses IP, présence)** : **6 mois**. L'adresse IP et le pays de dernière connexion attachés à un compte sont effacés après **6 mois** sans activité ; l'historique d'adresses IP d'un compte est supprimé immédiatement avec le compte.
- **Sessions de connexion** : supprimées à la déconnexion, ou automatiquement après leur expiration.
- **Messages de chat** : **12 mois**.
- **Journal des parties lancées** (jeu, date, durée de la table, motif de fin, participants) : **12 mois**.
- **Traces de modération de pseudo** : **12 mois**.
- **Données de mesure d'audience** : **13 mois**.
- **Feedback** : conservation jusqu'à **24 mois** ou suppression sur demande ; l'email de contact associé est effacé si vous supprimez votre compte.
- **Cookies âge et consentement** : 1 an, renouvelables à chaque validation.

Ces durées sont appliquées automatiquement par des purges régulières.

## 8. Vos droits

Conformément au RGPD, vous disposez des droits suivants :

- **Accès** : obtenir une copie de vos données ;
- **Rectification** : corriger des données inexactes ;
- **Effacement** : demander la suppression de vos données ;
- **Limitation** : restreindre certains traitements ;
- **Opposition** : vous opposer à un traitement fondé sur l'intérêt légitime ;
- **Retrait du consentement** : à tout moment, pour les traitements fondés sur le consentement ;
- **Portabilité** : recevoir vos données dans un format structuré (le cas échéant).

Vous pouvez **supprimer votre compte directement** depuis la page Compte (bouton « Supprimer mon compte ») : la suppression est immédiate et définitive.

Pour exercer vos autres droits, contactez : lepillaveur@outlook.fr

Vous pouvez également introduire une réclamation auprès de la **CNIL** (www.cnil.fr).

## 9. Sécurité

Nous mettons en œuvre des mesures techniques et organisationnelles appropriées :

- mots de passe hashés (bcrypt) ;
- cookies de session sécurisés ;
- en-têtes de sécurité HTTP (CSP, etc.) ;
- accès administrateur restreint.

Aucune transmission sur Internet n'est totalement sécurisée ; nous ne pouvons garantir une sécurité absolue.

## 10. Mineurs

Le Service est destiné aux personnes de **18 ans révolus**. Nous ne collectons pas sciemment de données personnelles de mineurs. Si vous pensez qu'un mineur nous a transmis des données, contactez-nous pour demander leur suppression.

## 11. Modifications

Cette politique peut être mise à jour. La date de dernière révision figure en tête du document. Nous vous encourageons à la consulter régulièrement.

## 12. Liens utiles

- [Conditions Générales d'Utilisation](/legal/cgu)
- [Mentions légales](/legal/mentions-legales)
