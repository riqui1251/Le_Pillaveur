// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from '../index'

/** fr, lot 05 : paires 93 à 115 de data/fr.ts (brief : node scripts/imposteur-clues-brief.mjs fr 5). */
export const IMPOSTEUR_CLUES_FR_LOT_05: Record<string, ImposteurClueSet> = {
  'douche|bain': {
    a: ['eau chaude', 'savon', 'le matin', 'debout', 'rideau', 'à l’italienne', 'pommeau'],
    b: ['eau chaude', 'savon', 'détente', 'bougies', 'mousse', 'canard en plastique', 'baignoire'],
  },
  'frigo|congélateur': {
    a: ['cuisine', 'froid', 'porte', 'aimants', 'restes', 'beurre', 'bac à légumes'],
    b: ['cuisine', 'froid', 'glaçons', 'surgelés', 'givre', 'dégivrer', 'moins 18 degrés'],
  },
  'micro-ondes|four': {
    a: ['cuisine', 'minuteur', 'restes', 'bol', 'ding', 'pop-corn', 'plateau tournant'],
    b: ['cuisine', 'minuteur', 'gratin', 'gâteau', 'gants', 'préchauffer', 'thermostat 7'],
  },
  'télé|vidéoprojecteur': {
    a: ['écran', 'film', 'canapé', 'zapper', 'chaînes', 'présentateur', 'journal de 20 h'],
    b: ['écran', 'film', 'volets fermés', 'salle de réunion', 'câble HDMI', 'mur blanc', 'faisceau lumineux'],
  },
  'console|PC gamer': {
    a: ['jeux vidéo', 'casque', 'salon', 'canapé', 'manette', 'Mario Kart', 'PlayStation'],
    b: ['jeux vidéo', 'casque', 'bureau', 'souris', 'clavier mécanique', 'RGB', 'carte graphique'],
  },
  'Instagram|TikTok': {
    a: ['réseau social', 'abonnés', 'likes', 'hashtag', 'filtre', 'feed', 'photo carrée'],
    b: ['réseau social', 'abonnés', 'danse', 'trend', 'scroll infini', 'son viral', 'page pour toi'],
  },
  'WhatsApp|Snapchat': {
    a: ['messages', 'portable', 'groupe de famille', 'vocal', 'appel vidéo', 'statut', 'coches bleues'],
    b: ['messages', 'portable', 'capture d’écran', 'éphémère', 'filtre chien', 'flammes', 'fantôme jaune'],
  },
  'YouTube|Netflix': {
    a: ['streaming', 'vidéos', 'gratuit', 'tutos', 'pubs à passer', 'vlog', 'like et abonne-toi'],
    b: ['streaming', 'vidéos', 'abonnement', 'séries', 'épisode suivant', 'compte partagé', 'Stranger Things'],
  },
  'selfie|story': {
    a: ['photo', 'réseaux sociaux', 'grimace', 'caméra avant', 'duck face', 'perche', 'bras tendu'],
    b: ['photo', 'réseaux sociaux', 'vues', 'sondage', 'cercle coloré', 'swipe up', '24 heures'],
  },
  'tacos|burrito': {
    a: ['tortilla', 'sauce', 'fast-food', 'plié', 'grillé', 'frites dedans', 'sauce fromagère'],
    b: ['tortilla', 'sauce', 'mexicain', 'guacamole', 'riz', 'haricots rouges', 'roulé dans l’alu'],
  },
  'limonade|thé glacé': {
    a: ['été', 'glaçons', 'citron', 'bulles', 'buvette', 'bouchon mécanique', 'panaché'],
    b: ['été', 'glaçons', 'canette', 'sans bulles', 'pêche', 'fuze tea', 'lipton'],
  },
  'expresso|cappuccino': {
    a: ['café', 'tasse', 'après le repas', 'comptoir', 'un sucre', 'ristretto', 'serré'],
    b: ['café', 'tasse', 'italien', 'petit-déjeuner', 'lait', 'cacao en poudre', 'mousse de lait'],
  },
  'gin tonic|spritz': {
    a: ['apéro', 'cocktail', 'verre ballon', 'rondelle de citron', 'concombre', 'schweppes', 'genièvre'],
    b: ['apéro', 'cocktail', 'terrasse', 'italien', 'rondelle d’orange', 'prosecco', 'aperol'],
  },
  'rhum|whisky': {
    a: ['alcool fort', 'glaçons', 'pirates', 'mojito', 'arrangé', 'antilles', 'canne à sucre'],
    b: ['alcool fort', 'glaçons', 'coca', 'vieilli en fût', 'tourbé', 'écosse', 'single malt'],
  },
  'sangria|punch': {
    a: ['saladier', 'fruits', 'été', 'oranges', 'cannelle', 'espagne', 'vin rouge'],
    b: ['saladier', 'fruits', 'louche', 'soirée étudiante', 'goyave', 'planteur', 'rhum'],
  },
  'hot-dog|croque-monsieur': {
    a: ['snack', 'pain', 'ketchup', 'moutarde', 'stade', 'new york', 'saucisse'],
    b: ['snack', 'pain', 'brasserie', 'jambon', 'béchamel', 'gruyère', 'pain de mie'],
  },
  'nuggets|ailes de poulet': {
    a: ['volaille', 'sauce barbecue', 'friture', 'enfants', 'panure', 'happy meal', 'boîte de 20'],
    b: ['volaille', 'sauce barbecue', 'épicé', 'doigts collants', 'os à ronger', 'bucket', 'buffalo'],
  },
  'ramen|nouilles sautées': {
    a: ['baguettes', 'asiatique', 'bol fumant', 'aspirer bruyamment', 'œuf mollet', 'japon', 'bouillon'],
    b: ['baguettes', 'asiatique', 'traiteur chinois', 'boîte à emporter', 'sauce soja', 'pad thaï', 'wok'],
  },
  'paella|risotto': {
    a: ['riz', 'safran', 'chorizo', 'moules', 'grande poêle', 'fruits de mer', 'espagne'],
    b: ['riz', 'safran', 'italie', 'parmesan', 'champignons', 'remuer sans arrêt', 'arborio'],
  },
  'couscous|tajine': {
    a: ['épices', 'agneau', 'vendredi midi', 'pois chiches', 'merguez', 'bouillon de légumes', 'semoule'],
    b: ['épices', 'agneau', 'olives', 'pruneaux', 'citron confit', 'plat en terre', 'couvercle conique'],
  },
  'omelette|œufs brouillés': {
    a: ['poêle', 'petit-déjeuner', 'champignons', 'fromage râpé', 'baveuse', 'retourner', 'pliée en deux'],
    b: ['poêle', 'petit-déjeuner', 'brunch', 'bacon', 'toast', 'crémeux', 'remuer à la spatule'],
  },
  'tiramisu|panna cotta': {
    a: ['dessert', 'italien', 'en couches', 'cacao', 'boudoirs', 'café', 'mascarpone'],
    b: ['dessert', 'italien', 'verrine', 'fruits rouges', 'tremblote', 'coulis', 'gélatine'],
  },
  'donut|muffin': {
    a: ['goûter', 'américain', 'friture', 'glaçage rose', 'vermicelles', 'policiers', 'trou au milieu'],
    b: ['goûter', 'américain', 'starbucks', 'pépites de chocolat', 'dôme', 'caissette en papier', 'myrtilles'],
  },
}
