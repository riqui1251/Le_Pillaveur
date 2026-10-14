// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from '../index'

/** fr, lot 04 : paires 70 à 92 de data/fr.ts (brief : node scripts/imposteur-clues-brief.mjs fr 4). */
export const IMPOSTEUR_CLUES_FR_LOT_04: Record<string, ImposteurClueSet> = {
  'serveur|barman': {
    a: ['pourboire', 'tablier', 'terrasse', 'addition', 'carnet', 'plat du jour', 'prendre la commande'],
    b: ['pourboire', 'tablier', 'comptoir', 'happy hour', 'cocktails', 'tireuse à bière', 'shaker'],
  },
  'boulanger|pâtissier': {
    a: ['four', 'farine', 'aux aurores', 'levain', 'pétrin', 'pain de campagne', 'baguette'],
    b: ['four', 'farine', 'sucre glace', 'poche à douille', 'chantilly', 'macarons', 'mille-feuille'],
  },
  'coiffeur|barbier': {
    a: ['ciseaux', 'peigne', 'shampoing', 'sèche-cheveux', 'coloration', 'mèches', 'brushing'],
    b: ['ciseaux', 'peigne', 'mousse', 'serviette chaude', 'moustache', 'barbe', 'coupe-chou'],
  },
  'plombier|électricien': {
    a: ['devis', 'caisse à outils', 'salle de bain', 'tuyau', 'fuite', 'joint', 'clé à molette', 'ventouse'],
    b: ['devis', 'caisse à outils', 'prise', 'câbles', 'fusible', 'disjoncteur', 'court-circuit'],
  },
  'avocat|notaire': {
    a: ['cabinet', 'honoraires', 'client', 'tribunal', 'robe noire', 'plaidoirie', 'objection'],
    b: ['cabinet', 'honoraires', 'signature', 'contrat', 'héritage', 'acte de vente', 'testament'],
  },
  'pilote|capitaine': {
    a: ['uniforme', 'équipage', 'aéroport', 'turbulences', 'décollage', 'cockpit', 'tour de contrôle'],
    b: ['uniforme', 'équipage', 'mer', 'port', 'navire', 'gouvernail', 'moussaillon'],
  },
  'astronaute|aviateur': {
    a: ['casque', 'combinaison', 'espace', 'fusée', 'compte à rebours', 'station spatiale', 'apesanteur'],
    b: ['casque', 'combinaison', 'ciel', 'hélice', 'lunettes', 'écharpe en soie', 'biplan'],
  },
  'lune|soleil': {
    a: ['ciel', 'rond', 'nuit', 'marée', 'croissant', 'cratères', 'loup-garou'],
    b: ['ciel', 'rond', 'jour', 'été', 'chaleur', 'bronzage', 'crème solaire'],
  },
  'étoile|comète': {
    a: ['ciel', 'nuit', 'scintiller', 'cinq branches', 'constellation', 'grande ourse', 'polaire'],
    b: ['ciel', 'nuit', 'rare', 'glace et poussière', 'traînée', 'queue lumineuse', 'tous les 76 ans'],
  },
  'montagne|volcan': {
    a: ['sommet', 'randonnée', 'altitude', 'neige', 'chalet', 'refuge', 'marmotte'],
    b: ['sommet', 'randonnée', 'fumée', 'cratère', 'éruption', 'magma', 'lave'],
  },
  'rivière|lac': {
    a: ['eau douce', 'pêche', 'pont', 'berge', 'courant', 'cascade', 'méandre'],
    b: ['eau douce', 'pêche', 'calme', 'barque', 'ponton', 'pédalo', 'monstre du loch'],
  },
  'forêt|jungle': {
    a: ['arbres', 'se perdre', 'sentier', 'champignons', 'chêne', 'sanglier', 'bûcheron'],
    b: ['arbres', 'se perdre', 'humide', 'moustiques', 'singes', 'machette', 'lianes'],
  },
  'désert|savane': {
    a: ['chaleur', 'sec', 'soif', 'sable', 'chameau', 'oasis', 'dunes'],
    b: ['chaleur', 'sec', 'herbes hautes', 'safari', 'lion', 'zèbres', 'baobab'],
  },
  'pluie|neige': {
    a: ['météo', 'ciel gris', 'mouillé', 'gouttes', 'imperméable', 'bottes en caoutchouc', 'flaques'],
    b: ['météo', 'ciel gris', 'froid', 'blanc', 'luge', 'bataille de boules', 'flocons'],
  },
  'orage|canicule': {
    a: ['été', 'alerte météo', 'nuages noirs', 'coupure de courant', 'tonnerre', 'éclairs', 'paratonnerre'],
    b: ['été', 'alerte météo', 'transpirer', 'volets fermés', 'ventilateur', 'clim', 'brumisateur'],
  },
  'printemps|automne': {
    a: ['saison', 'veste légère', 'fleurs', 'pollen', 'mars', 'hirondelles', 'bourgeons'],
    b: ['saison', 'veste légère', 'pluie', 'rentrée', 'châtaignes', 'champignons', 'feuilles mortes'],
  },
  'lunettes de soleil|casquette': {
    a: ['été', 'plage', 'éblouir', 'sur le nez', 'branches', 'anti-UV', 'verres teintés'],
    b: ['été', 'plage', 'sur la tête', "à l'envers", 'logo brodé', 'rappeur', 'visière'],
  },
  'maillot de bain|short': {
    a: ['été', 'plage', 'piscine', 'mouillé', 'une-pièce', 'deux-pièces', 'bikini'],
    b: ['été', 'plage', "jambes à l'air", 'poches', 'élastique', 'au-dessus du genou', 'bermuda'],
  },
  'baskets|tongs': {
    a: ['pieds', 'chaussures', 'chaussettes', 'sport', 'semelle', 'running', 'lacets'],
    b: ['pieds', 'chaussures', 'été', 'plage', 'claquer', 'caoutchouc', 'entre les orteils'],
  },
  'jean|jogging': {
    a: ['pantalon', 'tous les jours', 'bleu', 'poches arrière', 'slim', 'troué aux genoux', 'denim'],
    b: ['pantalon', 'tous les jours', 'dimanche', 'canapé', 'élastique', 'molleton', 'trois bandes'],
  },
  'costume|smoking': {
    a: ['veste', 'mariage', 'cravate', 'rayures', 'bureau', "entretien d'embauche", 'trois-pièces'],
    b: ['veste', 'mariage', 'noir', 'gala', 'revers en satin', 'agent 007', 'nœud papillon'],
  },
  'parfum|déodorant': {
    a: ['odeur', 'salle de bain', 'cadeau', 'flacon', 'poignet', 'duty free', 'sillage'],
    b: ['odeur', 'salle de bain', 'matin', 'transpiration', 'stick', 'roll-on', 'aisselles'],
  },
  'canapé|hamac': {
    a: ['sieste', "s'allonger", 'plaid', 'coussins', 'salon', 'télécommande', 'clic-clac'],
    b: ['sieste', "s'allonger", 'vacances', 'jardin', 'filet', 'se balancer', 'entre deux arbres'],
  },
}
