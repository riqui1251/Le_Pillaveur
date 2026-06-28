# Spécification de conformité — Le Petit Buveur

Date: 2026-06-16  
Statut: draft à valider avant implémentation

## 1) Objectif

Fournir une source de vérité unique pour reproduire fidèlement *Le Petit Buveur*:
- plateau visuel complet,
- moteur de règles exact,
- gestion des tours/états joueurs,
- anti-bug gameplay,
- tests automatisés de conformité.

## 2) Sources officielles retenues

Priorité canonique (web):
- `src/app/[locale]/games/petit-buveur/components/game.tsx`
- `src/app/[locale]/games/petit-buveur/case-config.ts`
- `src/app/[locale]/games/petit-buveur/resolve-case.ts`
- `src/app/[locale]/games/petit-buveur/case-types.ts`
- `src/app/[locale]/games/petit-buveur/case-notification.ts`
- `messages/fr.json`

Références secondaires (legacy, non canoniques):
- `lib/games/petit_buveur/game_logic.dart`
- `lib/games/petit_buveur/game_screen.dart`

## 3) Règles fonctionnelles consolidées

### 3.1 Plateau et victoire
- Plateau de 30 cases.
- Position bornée dans `[0..29]`.
- Affichage utilisateur en `[1..30]`.
- Victoire quand un joueur atteint la case finale.

### 3.2 Tours
- Ordre circulaire.
- Un seul joueur actif à la fois.
- `turnCount` incrémenté lors du retour au premier joueur.
- Aucune action de joueur non-actif ne doit modifier l’état.

### 3.3 Génération de cases
- Tirage pondéré (`CASE_TYPE_POOL`).
- Impact de la difficulté (`facile`, `normal`, `difficile`, `extreme`).
- Défis issus de la source i18n.

### 3.4 Effets d’état
- Protection avec durée.
- Malédiction (pénalité début de tour).
- Lien de défi chaîne.
- Miroir inverse.
- Passe-tour.
- Ancre (annule déplacement au prochain lancer).

### 3.5 Défis et sanctions
- Défi binaire réussi/raté.
- Sanction boisson si raté.
- Cas spéciaux: roulette russe, dé de la honte, pile/face, vote.

### 3.6 Anti-bug attendu
- Blocage double action (double clic lancer, double résolution défi).
- Validation ordre des tours.
- Pas d’état bloqué (watchdog ou fallback maîtrisé).
- Invariants: positions valides, pas de joueur perdu, transitions d’état valides.

## 4) Écarts et ambiguïtés à trancher avant implémentation

### A. Case `solo` appliquée une ou deux fois
- Constat actuel: double application possible.
- Décision demandée: `solo` doit appliquer une seule pénalité.
- Proposition: fixer à application unique.

### B. Passage de tour
- Constat actuel: certaines cases passent automatiquement, d’autres attendent une action UI.
- Décision demandée: standardiser un flux unique.
- Proposition: état explicite de tour avec transitions déterministes.

### C. `double-case` (sémantique exacte)
- Constat actuel: deux effets tirés, potentiellement sans même cible.
- Décision demandée: “deux effets strictement ciblés” ou “deux effets complets”?
- Proposition: conserver “deux effets complets” (compatible moteur actuel), documenter clairement.

### D. Protection (timing de décrément)
- Constat actuel: texte joueur ambigu.
- Décision demandée: décrément par “tour de table complet” strict.
- Proposition: formaliser en compteur de tours de table, non d’actions.

## 5) Plan d’implémentation après validation

1. Corriger les écarts de logique P0 (`solo`, transitions de tour critiques).
2. Aligner notifications/règles affichées avec moteur.
3. Ajouter garde-fous anti-bug centralisés.
4. Implémenter tests de conformité:
   - `case-config.test.ts`
   - `resolve-case.test.ts`
   - `engine.conformance.test.ts`
   - tests de transitions/erreurs API online

## 6) Critères de recette

- Tous les effets de case documentés ont un test.
- Aucun test de conformité en échec.
- Le plateau et l’historique reflètent strictement les transitions de règles.
- Aucune action hors tour n’altère la partie.
- Aucune séquence ne provoque d’état bloqué.
