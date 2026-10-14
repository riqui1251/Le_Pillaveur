// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from '../index'

/** fr, lot 01 : paires 1 à 23 de data/fr.ts (brief : node scripts/imposteur-clues-brief.mjs fr 1). */
export const IMPOSTEUR_CLUES_FR_LOT_01: Record<string, ImposteurClueSet> = {
  'plage|piscine': {
    a: ['été', 'serviette', 'crème solaire', 'parasol', 'sable', 'vagues', 'marée'],
    b: ['été', 'serviette', 'maître-nageur', 'bonnet de bain', 'longueurs', 'plongeoir', 'chlore'],
  },
  'café|thé': {
    a: ['chaud', 'tasse', 'comptoir', 'grains', 'capsule', 'percolateur', 'expresso'],
    b: ['chaud', 'tasse', 'bouilloire', 'sachet', 'infusion', 'anglais', 'earl grey'],
  },
  'bière|cidre': {
    a: ['apéro', 'bulles', 'mousse', 'demi', 'pression', 'pinte', 'houblon'],
    b: ['apéro', 'bulles', 'brut', 'galette', 'chandeleur', 'bolée', 'pomme'],
  },
  'vin rouge|vin blanc': {
    a: ['raisin', 'verre', 'cave', 'viande', 'tanin', 'tache sur la nappe', 'bordeaux'],
    b: ['raisin', 'verre', 'frais', 'poisson', 'seau à glace', 'huîtres', 'chardonnay'],
  },
  'mojito|piña colada': {
    a: ['cocktail', 'rhum', 'paille', 'glace pilée', 'citron vert', 'sucre de canne', 'menthe'],
    b: ['cocktail', 'rhum', 'sucré', 'parasol en papier', 'crémeux', 'ananas', 'lait de coco'],
  },
  'vodka|tequila': {
    a: ['shot', 'alcool fort', 'glaçons', 'congélateur', 'bouteille givrée', 'red bull', 'russe'],
    b: ['shot', 'alcool fort', 'citron', 'sel', 'agave', 'margarita', 'mexicain'],
  },
  'champagne|prosecco': {
    a: ['bulles', 'flûte', 'bouchon qui saute', 'mariage', 'réveillon', 'millésime', 'podium'],
    b: ['bulles', 'flûte', 'apéro', 'pas cher', 'italien', 'aperol', 'spritz'],
  },
  'pizza|tarte flambée': {
    a: ['four', 'pâte fine', 'parts', 'livraison', 'tomate', 'mozzarella', 'margherita'],
    b: ['four', 'pâte fine', 'rectangle', 'crème fraîche', 'lardons', 'oignons', 'alsacienne'],
  },
  'burger|kebab': {
    a: ['frites', 'sauce', 'fast-food', 'pain rond', 'cornichon', 'cheddar', 'steak haché'],
    b: ['frites', 'sauce', 'fin de soirée', 'sauce blanche', 'pita', 'turc', 'broche'],
  },
  'frites|potatoes': {
    a: ['ketchup', 'huile', 'cornet', 'allumettes', 'belge', 'baraque', 'moules'],
    b: ['ketchup', 'huile', 'four', 'rustiques', 'peau', 'paprika', 'quartiers'],
  },
  'croissant|pain au chocolat': {
    a: ['boulangerie', 'beurre', 'feuilleté', 'dimanche matin', 'miettes', 'pointes', 'lune'],
    b: ['boulangerie', 'beurre', 'goûter', 'rectangle', 'débat régional', 'sud-ouest', 'deux barres'],
  },
  'crêpe|gaufre': {
    a: ['sucre', 'chantilly', 'fine', 'poêle', 'retourner', 'chandeleur', 'sarrasin'],
    b: ['sucre', 'chantilly', 'épaisse', 'fête foraine', 'sucre glace', 'carrés', 'belge', 'de Liège'],
  },
  'raclette|fondue': {
    a: ['fromage', 'hiver', 'charcuterie', 'pommes de terre', 'cornichons', 'appareil', 'poêlons'],
    b: ['fromage', 'hiver', 'pain', 'suisse', 'kirsch', 'longue fourchette', 'caquelon'],
  },
  'sushi|poke bowl': {
    a: ['poisson cru', 'saumon', 'riz', 'baguettes', 'soja', 'japonais', 'wasabi'],
    b: ['poisson cru', 'saumon', 'avocat', 'healthy', 'mangue', 'edamame', 'hawaïen'],
  },
  'pâtes|riz': {
    a: ['féculent', 'casserole', 'sauce tomate', 'parmesan', 'italien', 'al dente', 'spaghetti'],
    b: ['féculent', 'casserole', 'grains', 'asiatique', 'risotto', 'cantonais', 'basmati'],
  },
  'ketchup|mayonnaise': {
    a: ['sauce', 'frites', 'sucrée', 'rouge', "bouteille à l'envers", 'tomate'],
    b: ['sauce', 'frites', 'crémeuse', 'huile', 'moutarde', 'fouet', "jaune d'œuf"],
  },
  'chips|cacahuètes': {
    a: ['apéro', 'sachet', 'salé', 'croustillant', 'paprika', 'fines tranches', 'pommes de terre'],
    b: ['apéro', 'sachet', 'bol au bar', 'grillées', 'coque', 'allergie', 'éléphant'],
  },
  'glace|sorbet': {
    a: ['été', 'cornet', 'boule', 'vanille', 'lait', 'crème', 'italienne'],
    b: ['été', 'cornet', 'fruits', 'citron', 'léger', 'sans lait', 'trou normand'],
  },
  'chocolat|caramel': {
    a: ['sucré', 'dessert', 'tablette', 'noir', 'lapin de Pâques', 'ganache', 'cacao'],
    b: ['sucré', 'dessert', 'collant', 'crème brûlée', 'carambar', 'sucre fondu', 'beurre salé'],
  },
  'baguette|brioche': {
    a: ['boulangerie', 'mie', 'croûte', 'sous le bras', 'quignon', 'tradition', 'jambon-beurre'],
    b: ['boulangerie', 'mie', 'sucrée', 'moelleuse', 'beurre', 'tressée', 'vendéenne'],
  },
  'fromage|charcuterie': {
    a: ['planche', 'apéro', 'odeur', 'croûte', 'lait', 'affiné', 'camembert'],
    b: ['planche', 'apéro', 'tranches', 'cochon', 'jambon', 'rillettes', 'saucisson'],
  },
  'huître|moule': {
    a: ['coquillage', 'citron', 'réveillon', 'crue', 'couteau', 'perle', 'bourriche'],
    b: ['coquillage', 'citron', 'noire', 'casserole', 'frites', 'marinière', 'bouchot'],
  },
  'barbecue|plancha': {
    a: ['été', 'grillade', 'jardin', 'merguez', 'brochettes', 'fumée', 'charbon', 'braises'],
    b: ['été', 'grillade', 'gaz', 'crevettes', 'spatule', 'plaque', 'espagnole'],
  },
}
