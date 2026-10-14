// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from '../index'

/** fr, lot 08 : paires 162 à 184 de data/fr.ts (brief : node scripts/imposteur-clues-brief.mjs fr 8). */
export const IMPOSTEUR_CLUES_FR_LOT_08: Record<string, ImposteurClueSet> = {
  'réunion|entretien d’embauche': {
    a: ['bureau', 'rendez-vous', 'collègues', 'café', 'diapos', 'ordre du jour', 'compte rendu'],
    b: ['bureau', 'rendez-vous', 'stress', 'cv', 'recruteur', 'candidat', 'lettre de motivation', 'vos trois défauts'],
  },
  'télétravail|open space': {
    a: ['ordinateur', 'collègues', 'visio', 'maison', 'canapé', 'pantoufles', 'micro coupé', 'en pyjama'],
    b: ['ordinateur', 'collègues', 'bruit', 'machine à café', 'start-up', 'baby-foot', 'casque antibruit', 'sans cloisons'],
  },
  'CDI|CDD': {
    a: ['contrat', 'boulot', 'période d’essai', 'stabilité', 'prêt immobilier', 'le Graal', 'rupture conventionnelle'],
    b: ['contrat', 'boulot', 'remplacement', 'saisonnier', 'renouvelable', 'six mois', 'date de fin', 'prime de précarité'],
  },
  'grève|manifestation': {
    a: ['syndicats', 'retraites', 'préavis', 'retenue sur salaire', 'service minimum', 'trains annulés'],
    b: ['syndicats', 'retraites', 'slogans', 'mégaphone', 'cortège', 'gaz lacrymo', 'banderoles', 'pancartes'],
  },
  'impôts|loyer': {
    a: ['payer', 'chaque mois', 'état', 'déclaration', 'tranches', 'trésor public', 'bercy', 'prélèvement à la source'],
    b: ['payer', 'chaque mois', 'appartement', 'propriétaire', 'bail', 'caution', 'apl', 'quittance'],
  },
  'ampoule|bougie': {
    a: ['lumière', 'éclairer', 'plafond', 'grillée', 'watts', 'filament', 'interrupteur', 'basse consommation'],
    b: ['lumière', 'éclairer', 'flamme', 'souffler', 'chandelier', 'gâteau d’anniversaire', 'mèche', 'cire'],
  },
  'aspirateur|balai': {
    a: ['ménage', 'poussière', 'bruit', 'prise électrique', 'sans fil', 'tuyau', 'robot', 'dyson'],
    b: ['ménage', 'poussière', 'manche', 'pelle', 'poils', 'paille', 'sorcière', 'nimbus 2000'],
  },
  'lave-linge|lave-vaisselle': {
    a: ['électroménager', 'programme', 'hublot', 'tambour', 'essorage', 'assouplissant', 'séchoir', 'chaussette perdue'],
    b: ['électroménager', 'programme', 'cuisine', 'paniers', 'tablette', 'assiettes', 'couverts', 'sel régénérant'],
  },
  'radiateur|climatiseur': {
    a: ['température', 'thermostat', 'hiver', 'sous la fenêtre', 'chaudière', 'fonte', 'chaussettes à sécher', 'purger'],
    b: ['température', 'thermostat', 'été', 'canicule', 'télécommande', 'air frais', 'gaz réfrigérant'],
  },
  'parapluie|imperméable': {
    a: ['averse', 'il pleut', 'ouvrir', 'poignée', 'retourné par le vent', 'baleines', 'mary poppins'],
    b: ['averse', 'il pleut', 'manteau', 'capuche', 'boutons', 'trench', 'k-way', 'ciré jaune'],
  },
  'arc-en-ciel|aurore boréale': {
    a: ['couleurs', 'lumière', 'après la pluie', 'soleil', 'prisme', 'licorne', 'drapeau des fiertés', 'pot d’or'],
    b: ['couleurs', 'lumière', 'nuit', 'froid', 'vert fluo', 'vent solaire', 'islande', 'laponie'],
  },
  'tempête|tornade': {
    a: ['vent', 'météo', 'rafales', 'vagues', 'tuiles envolées', 'vigilance orange', 'côte bretonne', 'xynthia'],
    b: ['vent', 'météo', 'états-unis', 'tourbillon', 'entonnoir', 'chasseurs d’orages', 'kansas', 'twister'],
  },
  'éclipse solaire|éclipse lunaire': {
    a: ['astronomie', 'ombre', 'en plein jour', 'couronne', 'anneau de feu', 'soleil caché', 'lunettes spéciales'],
    b: ['astronomie', 'ombre', 'la nuit', 'pleine lune', 'teinte cuivrée', 'ombre de la terre', 'lune de sang'],
  },
  'glacier|iceberg': {
    a: ['glace', 'froid', 'montagne', 'fonte', 'alpes', 'crevasses', 'moraine', 'mer de glace'],
    b: ['glace', 'froid', 'océan', 'flotte', 'banquise', 'partie immergée', 'titanic'],
  },
  'cactus|bonsaï': {
    a: ['plante', 'pot', 'désert', 'peu d’eau', 'épines', 'mexique', 'far west', 'figue de barbarie'],
    b: ['plante', 'pot', 'japon', 'patience', 'zen', 'ciseaux', 'monsieur miyagi', 'arbre miniature'],
  },
  'hérisson|tortue': {
    a: ['jardin', 'hiberner', 'la nuit', 'limaces', 'boule', 'piquants', 'sonic'],
    b: ['jardin', 'hiberner', 'lenteur', 'salade', 'centenaire', 'le lièvre', 'carapace'],
  },
  'flamant rose|paon': {
    a: ['oiseau', 'plumes', 'long cou', 'lagune', 'crevettes', 'une patte', 'bouée de piscine', 'camargue'],
    b: ['oiseau', 'plumes', 'jardin de château', 'cri strident', 'bleu et vert', 'fier', 'ocelles', 'faire la roue'],
  },
  'pieuvre|calmar': {
    a: ['mer', 'tentacules', 'ventouses', 'rocher', 'camouflage', 'ouvre les bocaux', 'huit bras'],
    b: ['mer', 'tentacules', 'encre', 'géant des abysses', 'squid game', 'friture', 'anneaux', 'à la romaine'],
  },
  'sumo|catch': {
    a: ['combat', 'lutte', 'japon', 'poids lourds', 'chignon', 'pagne', 'jet de sel', 'yokozuna'],
    b: ['combat', 'lutte', 'ring', 'cordes', 'spectacle', 'masque', 'chaise pliante', 'john cena'],
  },
  'escrime|karaté': {
    a: ['tenue blanche', 'salut', 'masque', 'piste', 'touché', 'en garde', 'mousquetaires', 'fleuret'],
    b: ['tenue blanche', 'salut', 'pieds nus', 'tatami', 'ceinture noire', 'kata', 'okinawa', 'casser une planche'],
  },
  'bijou|montre': {
    a: ['poignet', 'cadeau', 'or', 'écrin', 'pierre précieuse', 'joaillier', 'collier', 'bague'],
    b: ['poignet', 'cadeau', 'suisse', 'pile', 'cadran', 'tic-tac', 'aiguilles', 'donne l’heure'],
  },
  'sac à main|pochette': {
    a: ['cuir', 'maroquinerie', 'épaule', 'anses', 'porte-monnaie', 'fourre-tout', 'clés au fond', 'birkin'],
    b: ['cuir', 'maroquinerie', 'soirée', 'mariage', 'fermoir', 'enveloppe', 'sans anse', 'sous le bras'],
  },
  'gants|écharpe': {
    a: ['hiver', 'laine', 'paire', 'mains', 'latex', 'boxe', 'vaisselle', 'cinq doigts'],
    b: ['hiver', 'laine', 'tricot', 'nouer', 'supporters', 'maire', 'miss france', 'autour du cou'],
  },
}
