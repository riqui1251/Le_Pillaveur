# Politique de confidentialité

**Dernière mise à jour :** 13 juillet 2026

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
- liste de joueurs synchronisée (pseudos locaux que vous créez).

En **mode local** (sans compte), vos joueurs locaux sont stockés sur votre appareil. La liste de leurs pseudos peut toutefois être transmise au serveur dans deux cas : si vous avez **accepté les statistiques de visite** (voir 3.3 — elle sert alors aussi à la détection de robots), ou si vous êtes **connecté à un compte** (synchronisation entre appareils). Si vous refusez les statistiques et n'avez pas de compte, ces pseudos ne quittent pas votre appareil.

### 3.3 Données techniques et d'usage

**Avec votre consentement** (case « statistiques de visite » à l'entrée du site), nous collectons pour des statistiques de fréquentation et la lutte anti-abus :

- identifiant de visiteur (cookie `lp_vid`) ;
- adresse IP ;
- pays estimé (géolocalisation approximative par adresse IP, calculée sur nos serveurs — aucun service tiers) ;
- type d'appareil / navigateur (user-agent simplifié) ;
- dates de connexion et temps de présence sur le site.

Si vous refusez, aucun suivi de visite n'est enregistré.

**Indépendamment de ce consentement**, pour les **comptes connectés** uniquement, nous conservons l'adresse IP, le pays estimé et le type d'appareil des dernières connexions au titre de la **sécurité et de la modération des comptes** (prévention des fraudes, bannissements) — base : intérêt légitime.

### 3.4 Chat et parties en ligne

Les messages envoyés dans le **chat** (chat de partie et messages entre amis) sont stockés sur nos serveurs et peuvent être soumis à un filtrage automatique de langage inapproprié. Ils sont conservés au maximum **12 mois** puis supprimés. L'état des parties en ligne (coups joués, votes, dessins) est temporaire et supprimé avec la table de jeu.

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
| `lp_session` | Maintien de votre session connectée | Session ou durée configurée |
| `lp_local_play` | Activation du mode local sans compte | Persistant |
| `lp_age_verified` | Mémorisation de votre déclaration d'âge (18+) | 1 an |
| `lp_analytics_consent` | Mémorisation de votre choix sur les statistiques de visite | 1 an |
| `lp_locale` | Mémorisation de votre langue d'interface | 1 an |
| `lp_vid` | Identifiant visiteur pour statistiques et anti-abus — **déposé uniquement si vous avez accepté les statistiques de visite** (ou, à titre strictement nécessaire, lors d'une tentative de pseudo refusée, pour la prévention des abus) | Persistant |

Vous pouvez modifier votre choix sur les statistiques de visite en supprimant les cookies du site dans votre navigateur : la question vous sera reposée à la prochaine visite.

## 4. Finalités du traitement

Vos données sont traitées pour :

- créer et gérer votre compte ;
- authentifier vos connexions ;
- synchroniser vos joueurs et statistiques entre appareils ;
- faire fonctionner les parties en ligne (tables, chat, classements) ;
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
- **Compte supprimé** : suppression ou anonymisation dans un délai de **12 mois** maximum après la demande, sauf obligation légale de conservation plus longue.
- **Logs techniques (adresses IP, présence)** : **6 mois**.
- **Messages de chat** : **12 mois**.
- **Traces de modération de pseudo** : **12 mois**.
- **Données de mesure d'audience** : **13 mois**.
- **Feedback** : conservation jusqu'à **24 mois** ou suppression sur demande.
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
