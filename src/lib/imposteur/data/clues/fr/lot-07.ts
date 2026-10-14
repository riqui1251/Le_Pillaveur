// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from '../index'

/** fr, lot 07 : paires 139 à 161 de data/fr.ts (brief : node scripts/imposteur-clues-brief.mjs fr 7). */
export const IMPOSTEUR_CLUES_FR_LOT_07: Record<string, ImposteurClueSet> = {
  'fusée|satellite': {
    a: ['espace', 'lancement', 'décollage', 'compte à rebours', 'réacteurs', 'pas de tir', 'kourou'],
    b: ['espace', 'lancement', 'orbite', 'météo', 'gps', 'antenne parabolique', 'starlink'],
  },
  'tatouage|piercing': {
    a: ['aiguille', 'peau', 'salon', 'encre', 'pour la vie', 'tribal', 'dessin sur le bras'],
    b: ['aiguille', 'peau', 'bijou', 'trou', 'langue', 'arcade', 'nombril', 'anneau au nez'],
  },
  'moustache|barbe': {
    a: ['poils', 'rasoir', 'sous le nez', 'lèvre supérieure', 'gendarme', 'en guidon', 'movember'],
    b: ['poils', 'rasoir', 'menton', 'joues', 'tondeuse', 'hipster', 'bûcheron', 'père Noël'],
  },
  'sieste|grasse matinée': {
    a: ['dormir', 'repos', 'canapé', 'hamac', 'vingt minutes', 'après le repas', 'début d’après-midi'],
    b: ['dormir', 'repos', 'week-end', 'dimanche', 'volets fermés', 'réveil éteint', 'petit-déj au lit', 'jusqu’à midi'],
  },
  'pyjama|peignoir': {
    a: ['chez soi', 'confort', 'nuit', 'dodo', 'chambre', 'soirée télé', 'sous l’oreiller'],
    b: ['chez soi', 'confort', 'salle de bain', 'éponge', 'ceinture', 'après la douche', 'hôtel spa'],
  },
  'valise|sac à dos': {
    a: ['voyage', 'bagage', 'cadenas', 'soute', 'tapis roulant', 'roulettes', 'poignée télescopique'],
    b: ['voyage', 'bagage', 'camping', 'randonnée', 'auberge de jeunesse', 'gourde', 'collège', 'bretelles'],
  },
  'Marvel|DC': {
    a: ['comics', 'super-héros', 'Disney', 'Avengers', 'Spider-Man', 'Iron Man', 'Thanos', 'Stan Lee'],
    b: ['comics', 'super-héros', 'Warner', 'Gotham', 'Wonder Woman', 'Aquaman', 'Joker', 'Justice League'],
  },
  'Batman|Superman': {
    a: ['super-héros', 'cape', 'milliardaire', 'Gotham', 'Joker', 'Robin', 'chauve-souris', 'Bruce Wayne'],
    b: ['super-héros', 'cape', 'journaliste', 'slip rouge', 'kryptonite', 'Clark Kent', 'Krypton', 'Lois Lane'],
  },
  'Star Wars|Star Trek': {
    a: ['espace', 'vaisseau', 'la Force', 'Jedi', 'sabre laser', 'Yoda', 'Chewbacca', 'Dark Vador'],
    b: ['espace', 'vaisseau', 'téléportation', 'Enterprise', 'oreilles pointues', 'capitaine Kirk', 'Vulcain', 'Spock'],
  },
  'Harry Potter|Le Seigneur des Anneaux': {
    a: ['magie', 'saga', 'baguette', 'sorcier', 'Poudlard', 'quidditch', 'Hermione', 'Voldemort'],
    b: ['magie', 'saga', 'Tolkien', 'hobbit', 'Gandalf', 'Mordor', 'Gollum', 'Frodon'],
  },
  'PlayStation|Xbox': {
    a: ['console', 'manette', 'japonais', 'Sony', 'Gran Turismo', 'God of War', 'Uncharted', 'rond carré triangle'],
    b: ['console', 'manette', 'américain', 'Microsoft', 'Game Pass', 'Forza', 'Master Chief', 'Halo'],
  },
  'iPhone|Samsung': {
    a: ['smartphone', 'selfie', 'californien', 'Siri', 'AirPods', 'iOS', 'pomme croquée', 'Apple'],
    b: ['smartphone', 'selfie', 'Android', 'coréen', 'téléviseurs', 'pliable', 'Séoul', 'Galaxy'],
  },
  'Uber|Bolt': {
    a: ['VTC', 'chauffeur', 'course', 'cinq étoiles', 'américain', 'San Francisco', 'livraison de repas'],
    b: ['VTC', 'chauffeur', 'trottinette', 'moins cher', 'logo vert', 'Tallinn', 'estonien'],
  },
  'Deliveroo|Uber Eats': {
    a: ['livraison', 'livreur', 'appli', 'vélo', 'anglais', 'Londres', 'sac turquoise', 'kangourou'],
    b: ['livraison', 'livreur', 'scooter', 'américain', 'sac vert', 'McDo', 'VTC'],
  },
  'Spotify|Deezer': {
    a: ['musique', 'playlist', 'podcast', 'abonnement premium', 'suédois', 'Stockholm', 'logo vert', 'Wrapped'],
    b: ['musique', 'playlist', 'streaming', 'français', 'Paris', 'forfait Orange', 'Flow'],
  },
  'Facebook|LinkedIn': {
    a: ['réseau social', 'profil', 'amis', 'mur', 'pouce bleu', 'Marketplace', 'Meta', 'Zuckerberg'],
    b: ['réseau social', 'profil', 'carrière', 'CV', 'recruteur', 'offres d’emploi', 'Microsoft', 'réseau pro'],
  },
  'crayon|stylo': {
    a: ['écrire', 'trousse', 'dessin', 'bois', 'mine', 'graphite', 'à papier'],
    b: ['écrire', 'trousse', 'encre', 'capuchon', 'plume', 'quatre couleurs', 'bille', 'bic'],
  },
  'gomme|correcteur': {
    a: ['effacer', 'trousse', 'frotter', 'caoutchouc', 'miettes', 'crayon à papier', 'blanche et bleue', 'maped'],
    b: ['effacer', 'trousse', 'blanc', 'ça sèche', 'stylo bille', 'ruban', 'souris', 'tipp-ex'],
  },
  'cahier|classeur': {
    a: ['école', 'feuilles', 'lignes', 'spirale', 'brouillon', 'grands carreaux', 'clairefontaine'],
    b: ['école', 'feuilles', 'bureau', 'archives', 'pochettes plastiques', 'perforeuse', 'intercalaires', 'anneaux'],
  },
  'tableau blanc|tableau noir': {
    a: ['école', 'écrire debout', 'feutres', 'effaçable', 'salle de réunion', 'brainstorming', 'velleda'],
    b: ['école', 'écrire debout', 'éponge', 'ça crisse', 'à l’ancienne', 'ardoise', 'craie'],
  },
  'cartable|sac de sport': {
    a: ['fermeture éclair', 'à l’épaule', 'rentrée', 'trop lourd', 'roulettes', 'école', 'trousse', 'cahiers'],
    b: ['fermeture éclair', 'à l’épaule', 'vestiaire', 'serviette', 'baskets', 'gymnase', 'salle de muscu', 'odeur de transpi'],
  },
  'récréation|pause déjeuner': {
    a: ['sonnerie', 'coupure', 'cour', 'marelle', 'billes', 'élastique', 'surveillant', 'école primaire'],
    b: ['sonnerie', 'coupure', 'midi', 'collègues', 'sandwich', 'micro-ondes', 'ticket resto', 'cantine'],
  },
  'patron|collègue': {
    a: ['travail', 'bureau', 'cravate', 'hiérarchie', 'bureau du fond', 'entretien annuel', 'augmentation', 'signe la paie'],
    b: ['travail', 'bureau', 'open space', 'machine à café', 'pause clope', 'afterwork', 'pot de départ', 'même étage'],
  },
}
