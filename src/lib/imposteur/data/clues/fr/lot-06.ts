// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from '../index'

/** fr, lot 06 : paires 116 à 138 de data/fr.ts (brief : node scripts/imposteur-clues-brief.mjs fr 6). */
export const IMPOSTEUR_CLUES_FR_LOT_06: Record<string, ImposteurClueSet> = {
  'popcorn|barbe à papa': {
    a: ['sucré', 'grignoter', 'cinéma', 'seau en carton', 'micro-ondes', 'ça éclate', 'grains de maïs'],
    b: ['sucré', 'fête foraine', 'colle aux doigts', 'rose', 'bâtonnet', 'nuage', 'sucre filé'],
  },
  'smoothie|milkshake': {
    a: ['paille', 'mixeur', 'healthy', 'fruits frais', 'détox', 'épinards', 'fruits mixés'],
    b: ['paille', 'mixeur', 'fast-food', 'chantilly', 'diner américain', 'boule de glace', 'lait et glace'],
  },
  'miel|confiture': {
    a: ['tartine', 'pot', 'liquide', 'doré', 'mal de gorge', 'ruche', 'abeilles'],
    b: ['tartine', 'pot', 'mamie', 'bocal', 'crêpe', 'fraises', 'fruits cuits'],
  },
  'escape game|laser game': {
    a: ['en équipe', 'anniversaire', 'code secret', 'maître du jeu', 'énigmes', 'cadenas', "s'échapper"],
    b: ['en équipe', 'anniversaire', 'dans le noir', 'fluo', 'fumée', 'viser', 'gilet à capteurs'],
  },
  "parc d'attractions|fête foraine": {
    a: ['manèges', 'sensations', 'loopings', "file d'attente", 'mascottes', 'coupe-file', 'entrée payante'],
    b: ['manèges', 'sensations', 'auto-tamponneuses', 'barbe à papa', 'chichis', 'stand de tir', 'pêche aux canards'],
  },
  'zoo|aquarium': {
    a: ['animaux', 'sortie scolaire', 'soigneur', 'en plein air', 'enclos', 'lions', 'girafes'],
    b: ['animaux', 'sortie scolaire', 'bleu', 'vitre', 'tunnel', 'requins', 'méduses'],
  },
  'musée|bibliothèque': {
    a: ['silence', 'culture', 'visite guidée', 'audioguide', 'sculptures', 'tableaux', 'la Joconde'],
    b: ['silence', 'culture', 'étagères', 'rayons', 'emprunter', 'carte de lecteur', 'livres'],
  },
  'tente|caravane': {
    a: ['camping', 'vacances', 'festival', 'sac de couchage', 'toile', 'piquets', 'sardines'],
    b: ['camping', 'vacances', 'roues', 'hollandais', 'remorque', 'lit escamotable', 'attelage'],
  },
  'jacuzzi|sauna': {
    a: ['spa', 'détente', 'maillot de bain', 'eau chaude', 'jets', 'remous', 'bulles'],
    b: ['spa', 'détente', 'serviette', 'bois', 'transpirer', 'pierres chaudes', 'finlandais', 'chaleur sèche'],
  },
  'toboggan|balançoire': {
    a: ['aire de jeux', 'parc', 'piscine', 'échelle', 'descente', 'en pente', 'glisser'],
    b: ['aire de jeux', 'parc', 'siège', 'chaînes', 'pousser', 'plus haut', 'va-et-vient'],
  },
  'trampoline|château gonflable': {
    a: ['sauter', 'enfants', 'jardin', 'saltos', 'toile tendue', 'filet', 'ressorts'],
    b: ['sauter', 'enfants', 'kermesse', 'chaussettes', 'plastique', 'soufflerie', 'tourelles'],
  },
  'skateboard|rollers': {
    a: ['roulettes', 'genouillères', 'rampe', 'pousser du pied', 'planche', 'ollie', 'kickflip'],
    b: ['roulettes', 'genouillères', 'aux pieds', 'lacets', 'disco', 'frein au talon', 'roues en ligne'],
  },
  'kayak|pédalo': {
    a: ['lac', 'gilet de sauvetage', 'rivière', 'chavirer', 'descente', 'rapides', 'pagaie'],
    b: ['lac', 'gilet de sauvetage', 'plage', 'location', 'à deux', 'toboggan', 'cygne', 'avec les pieds'],
  },
  'voilier|jet-ski': {
    a: ['mer', 'port', 'croisière', 'sans moteur', 'vent', 'régate', 'mât'],
    b: ['mer', 'port', 'vitesse', 'bruit', 'essence', 'guidon', 'kawasaki'],
  },
  'escalade|accrobranche': {
    a: ['baudrier', 'hauteur', 'falaise', 'mur', 'chaussons', 'magnésie', 'prises colorées'],
    b: ['baudrier', 'hauteur', 'mousquetons', 'forêt', 'parcours', 'pont de singe', 'tyrolienne', "d'arbre en arbre"],
  },
  'marathon|triathlon': {
    a: ['endurance', 'dossard', 'ampoules', 'ravitaillement', 'course à pied', 'mur du 30e', '42,195 km'],
    b: ['endurance', 'dossard', 'combinaison', 'vélo', 'natation', 'transition', 'ironman', 'trois sports'],
  },
  'boxe|judo': {
    a: ['combat', 'adversaire', 'protège-dents', 'ring', 'punching-ball', 'gants', 'uppercut'],
    b: ['combat', 'adversaire', 'prise', 'ceinture noire', 'kimono', 'tatami', 'ippon'],
  },
  'magicien|clown': {
    a: ['spectacle', 'cirque', 'cape', 'jeu de cartes', 'baguette', 'lapin', 'abracadabra'],
    b: ['spectacle', 'cirque', 'maquillage', 'perruque', 'grosses chaussures', 'tarte à la crème', 'nez rouge'],
  },
  'pirate|viking': {
    a: ['bateau', 'pillage', 'trésor', 'sabre', 'drapeau noir', 'perroquet', 'jambe de bois', 'cache-œil'],
    b: ['bateau', 'pillage', 'nord', 'barbe tressée', 'hache', 'casque à cornes', 'drakkar'],
  },
  'zombie|vampire': {
    a: ['mort-vivant', 'halloween', 'apocalypse', 'contagion', 'grogner', 'démarche lente', 'mange des cerveaux'],
    b: ['mort-vivant', 'halloween', 'nuit', 'cape', 'cercueil', 'ail', 'crocs', 'boit du sang'],
  },
  'sorcière|fée': {
    a: ['magie', 'conte', 'potion', 'chat noir', 'chaudron', 'chapeau pointu', 'verrue', 'balai volant'],
    b: ['magie', 'conte', 'baguette', 'paillettes', 'ailes', 'marraine', 'clochette'],
  },
  'licorne|dragon': {
    a: ['créature', 'légende', 'doudou', 'paillettes', 'arc-en-ciel', 'crinière', 'cheval magique'],
    b: ['créature', 'légende', 'chevalier', 'ailes', 'écailles', 'trésor gardé', 'crache du feu'],
  },
  'château|cabane': {
    a: ['maison', 'construire', 'pierre', 'roi', 'tours', 'douves', 'donjon', 'pont-levis'],
    b: ['maison', 'construire', 'enfants', 'bois', 'fond du jardin', 'planches', 'dans un arbre'],
  },
}
