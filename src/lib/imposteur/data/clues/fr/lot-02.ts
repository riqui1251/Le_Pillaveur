// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from '../index'

/** fr, lot 02 : paires 24 à 46 de data/fr.ts (brief : node scripts/imposteur-clues-brief.mjs fr 2). */
export const IMPOSTEUR_CLUES_FR_LOT_02: Record<string, ImposteurClueSet> = {
  'pique-nique|brunch': {
    a: ['week-end', 'entre amis', 'dehors', 'glacière', 'sandwichs', 'fourmis', 'nappe sur l’herbe'],
    b: ['week-end', 'entre amis', 'grasse matinée', 'jus d’orange', 'viennoiseries', 'pancakes', 'œufs bénédicte'],
  },
  'boîte de nuit|bar': {
    a: ['soirée', 'alcool', 'file d’attente', 'videur', 'vestiaire', 'piste de danse', 'boule à facettes'],
    b: ['soirée', 'alcool', 'terrasse', 'pinte', 'tabouret', 'comptoir', 'happy hour'],
  },
  'concert|festival': {
    a: ['musique', 'scène', 'salle', 'fosse', 'première partie', 'briquets levés', 'rappel'],
    b: ['musique', 'scène', 'été', 'plein air', 'tente', 'boue', 'bracelet en tissu'],
  },
  'cinéma|théâtre': {
    a: ['salle', 'billet', 'obscurité', 'écran', 'lunettes 3D', 'bande-annonce', 'pop-corn'],
    b: ['salle', 'billet', 'comédiens', 'costumes', 'tirade', 'entracte', 'les trois coups'],
  },
  'karaoké|blind test': {
    a: ['chansons', 'soirée', 'écran', 'duo', 'chanter faux', 'micro', 'paroles qui défilent'],
    b: ['chansons', 'soirée', 'équipes', 'points', 'rapidité', 'buzzer', 'premières notes'],
  },
  'anniversaire|crémaillère': {
    a: ['fête', 'invités', 'cadeaux', 'surprise', 'âge', 'gâteau', 'souffler les bougies'],
    b: ['fête', 'invités', 'voisins', 'cartons', 'visite des pièces', 'nouvel appart', 'pendre'],
  },
  'mariage|baptême': {
    a: ['église', 'dragées', 'mairie', 'témoins', 'robe blanche', 'alliances', 'lancer du bouquet'],
    b: ['église', 'dragées', 'bébé', 'cierge', 'parrain', 'marraine', 'eau bénite'],
  },
  'Noël|Nouvel An': {
    a: ['réveillon', 'champagne', 'en famille', 'sapin', 'bûche', 'rennes', '25 décembre'],
    b: ['réveillon', 'champagne', 'cotillons', 'feux d’artifice', 'bonnes résolutions', 'compte à rebours', '31 décembre'],
  },
  'Halloween|Mardi gras': {
    a: ['déguisement', 'masques', 'fin octobre', 'frisson', 'sorcière', 'citrouille', 'des bonbons ou un sort'],
    b: ['déguisement', 'masques', 'février', 'confettis', 'beignets', 'carnaval', 'avant le carême'],
  },
  'camping|auberge de jeunesse': {
    a: ['vacances', 'petit budget', 'plein air', 'bloc sanitaire', 'emplacement', 'sardines', 'tente'],
    b: ['vacances', 'petit budget', 'sac à dos', 'routards', 'cuisine commune', 'lits superposés', 'dortoir'],
  },
  'hôtel|Airbnb': {
    a: ['séjour', 'réservation', 'étoiles', 'petit-déj inclus', 'minibar', 'réception', 'room service'],
    b: ['séjour', 'réservation', 'appli', 'appartement', 'chez l’habitant', 'boîte à clés', 'frais de ménage'],
  },
  'avion|train': {
    a: ['voyage', 'billet', 'valise', 'aéroport', 'hublot', 'turbulences', 'décollage'],
    b: ['voyage', 'billet', 'retard', 'gare', 'contrôleur', 'quai', 'wagon'],
  },
  'vélo|trottinette': {
    a: ['guidon', 'piste cyclable', 'casque', 'sonnette', 'selle', 'chaîne', 'pédales'],
    b: ['guidon', 'piste cyclable', 'électrique', 'libre-service', 'petites roues', 'debout', 'pousser du pied'],
  },
  'moto|scooter': {
    a: ['casque', 'deux-roues', 'vitesse', 'blouson en cuir', 'genou au sol', 'permis A', 'grosse cylindrée'],
    b: ['casque', 'deux-roues', 'en ville', 'livreur', 'tablier', 'coffre sous la selle', 'vespa'],
  },
  'taxi|bus': {
    a: ['transport', 'chauffeur', 'banquette arrière', 'pourboire', 'lever la main', 'enseigne lumineuse', 'compteur'],
    b: ['transport', 'chauffeur', 'ticket', 'horaires', 'arrêt', 'couloir réservé', 'bouton stop'],
  },
  'métro|tramway': {
    a: ['ville', 'rame', 'heure de pointe', 'couloirs', 'correspondance', 'escalators', 'sous terre'],
    b: ['ville', 'rame', 'en surface', 'caténaire', 'clochette', 'voie sur gazon', 'rails dans la rue'],
  },
  'voiture|camping-car': {
    a: ['route', 'volant', 'parking', 'bouchons', 'clignotant', 'citadine', 'créneau'],
    b: ['route', 'volant', 'vacances', 'retraités', 'aire de service', 'lit capucine', 'maison roulante'],
  },
  'ski|snowboard': {
    a: ['montagne', 'neige', 'forfait', 'tire-fesses', 'slalom', 'chasse-neige', 'bâtons'],
    b: ['montagne', 'neige', 'baggy', 'freestyle', 'half-pipe', 'pieds attachés', 'une seule planche'],
  },
  'surf|paddle': {
    a: ['mer', 'planche', 'combinaison', 'wax', 'spot', 'tube', 'grosses vagues'],
    b: ['mer', 'planche', 'lac', 'gonflable', 'eau calme', 'debout', 'pagaie'],
  },
  'foot|rugby': {
    a: ['stade', 'supporters', 'carton rouge', 'gardien', 'penalty', 'corner', 'ballon rond'],
    b: ['stade', 'supporters', 'sud-ouest', 'troisième mi-temps', 'essai', 'mêlée', 'ballon ovale'],
  },
  'tennis|badminton': {
    a: ['raquette', 'filet', 'set', 'jeu décisif', 'terre battue', 'balle jaune', 'quinze-zéro'],
    b: ['raquette', 'filet', 'gymnase', 'jardin', 'smash', 'plumes', 'volant'],
  },
  'basket|handball': {
    a: ['ballon', 'gymnase', 'dribble', 'grands joueurs', 'trois points', 'dunk', 'panier'],
    b: ['ballon', 'gymnase', 'gardien', 'sept joueurs', 'pivot', 'résine', 'zone des six mètres'],
  },
  'pétanque|bowling': {
    a: ['boules', 'viser', 'été', 'pastis', 'gravier', 'pointer', 'cochonnet'],
    b: ['boules', 'viser', 'chaussures louées', 'piste', 'gouttière', 'strike', 'quilles'],
  },
}
