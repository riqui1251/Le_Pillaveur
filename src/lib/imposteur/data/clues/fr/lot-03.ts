// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from '../index'

/** fr, lot 03 : paires 47 à 69 de data/fr.ts (brief : node scripts/imposteur-clues-brief.mjs fr 3). */
export const IMPOSTEUR_CLUES_FR_LOT_03: Record<string, ImposteurClueSet> = {
  'billard|fléchettes': {
    a: ['bar', 'pub', 'tapis vert', 'craie', 'bande', 'boule blanche', 'queue'],
    b: ['bar', 'pub', 'mur', 'plumes', 'pointe', 'cible', 'triple 20'],
  },
  'poker|tarot': {
    a: ['cartes', 'partie', 'jetons', 'casino', 'bluff', 'all-in', 'quinte flush'],
    b: ['cartes', 'partie', 'atouts', 'petit', 'preneur', 'excuse', 'garde sans'],
  },
  'échecs|dames': {
    a: ['plateau', 'cases', 'stratégie', 'cavalier', 'tour', 'roi', 'mat'],
    b: ['plateau', 'cases', 'pions', 'diagonale', 'sauter', 'prise obligatoire', 'rafle'],
  },
  'yoga|pilates': {
    a: ['tapis', 'salle', 'respiration', 'souplesse', 'lotus', 'namaste', 'salutation au soleil'],
    b: ['tapis', 'salle', 'posture', 'ballon', 'gainage', 'abdos', 'reformer'],
  },
  'musculation|crossfit': {
    a: ['salle', 'sueur', 'miroir', 'protéines', 'haltères', 'biceps', 'développé couché'],
    b: ['salle', 'sueur', 'chrono', 'rameur', 'kettlebell', 'box', 'burpees'],
  },
  'jogging|randonnée': {
    a: ['dehors', 'gourde', 'baskets', 'écouteurs', 'foulée', 'point de côté', 'semi-marathon'],
    b: ['dehors', 'gourde', 'montagne', 'sac à dos', 'sentier', 'refuge', 'bâtons'],
  },
  'plongée|snorkeling': {
    a: ['palmes', 'masque', 'combinaison', 'bouteille', 'profondeur', 'paliers', 'détendeur'],
    b: ['palmes', 'masque', 'surface', 'lagon', 'poissons', 'coraux', 'tuba'],
  },
  'pêche|chasse': {
    a: ['nature', 'patience', 'rivière', 'bottes', 'appât', 'canne', 'hameçon'],
    b: ['nature', 'patience', 'forêt', 'gilet orange', 'sanglier', 'fusil', 'gibier'],
  },
  'guitare|piano': {
    a: ['musique', 'concert', 'cordes', 'feu de camp', 'manche', 'gratter', 'médiator'],
    b: ['musique', 'concert', 'partition', 'pédale', 'queue', 'touches', 'noires et blanches'],
  },
  'batterie|DJ': {
    a: ['musique', 'rythme', 'concert', 'baguettes', 'cymbales', 'caisse claire', 'grosse caisse'],
    b: ['musique', 'rythme', 'casque', 'boîte de nuit', 'mix', 'platines', 'David Guetta'],
  },
  'rap|rock': {
    a: ['musique', 'concert', 'casquette', 'rimes', 'clash', 'flow', 'punchline'],
    b: ['musique', 'concert', 'cuir', 'cheveux longs', 'guitare', 'pogo', 'riff'],
  },
  'techno|reggae': {
    a: ['musique', 'danser', 'nuit blanche', 'basses', 'boum boum', 'stroboscope', 'rave'],
    b: ['musique', 'danser', 'soleil', 'plage', 'vert jaune rouge', 'dreadlocks', 'rasta'],
  },
  'chat|chien': {
    a: ['animal', 'poils', 'canapé', 'griffes', 'litière', 'moustaches', 'ronron'],
    b: ['animal', 'poils', 'promenade', 'laisse', 'niche', 'os', 'wouf'],
  },
  'hamster|lapin': {
    a: ['animal', 'cage', 'rongeur', 'copeaux', 'graines', 'roue', 'joues pleines'],
    b: ['animal', 'cage', 'terrier', 'clapier', 'chapeau de magicien', 'longues oreilles', 'carotte'],
  },
  'perroquet|canari': {
    a: ['oiseau', 'cage', 'plumes', 'couleurs', 'pirate', 'parle', 'répète tout'],
    b: ['oiseau', 'cage', 'graines', 'chant', 'mine de charbon', 'jaune', 'titi et grosminet'],
  },
  'requin|dauphin': {
    a: ['mer', 'nageoire', 'peur', 'aileron', 'mâchoires', 'grand blanc', 'dents de la mer'],
    b: ['mer', 'nageoire', 'sourire', 'sauts', 'intelligence', 'parc aquatique', 'sifflements'],
  },
  'lion|tigre': {
    a: ['félin', 'rugit', 'zoo', 'savane', 'safari', 'roi', 'crinière'],
    b: ['félin', 'rugit', 'jungle', 'cirque', 'orange et noir', 'shere khan', 'rayures'],
  },
  'ours|loup': {
    a: ['forêt', 'poils', 'peluche', 'hibernation', 'polaire', 'miel', 'grizzli'],
    b: ['forêt', 'poils', 'canines', 'meute', 'pleine lune', 'hurle', 'chaperon rouge'],
  },
  'abeille|guêpe': {
    a: ['été', 'piqûre', 'fleurs', 'pollen', 'reine', 'ruche', 'miel'],
    b: ['été', 'piqûre', 'terrasse', 'pique-nique', 'nid', 'confiture', 'taille fine'],
  },
  'papillon|libellule': {
    a: ['été', 'ailes', 'jardin', 'couleurs', 'filet', 'cocon', 'chenille'],
    b: ['été', 'ailes', 'étang', 'roseaux', 'gros yeux', 'vol stationnaire', 'hélicoptère'],
  },
  'médecin|infirmier': {
    a: ['hôpital', 'blouse blanche', 'salle d’attente', 'consultation', 'diagnostic', 'stéthoscope', 'ordonnance'],
    b: ['hôpital', 'blouse blanche', 'garde de nuit', 'pansement', 'prise de sang', 'perfusion', 'piqûre'],
  },
  'pompier|policier': {
    a: ['uniforme', 'sirène', 'casque', 'échelle', 'lance', 'calendrier', 'camion rouge'],
    b: ['uniforme', 'sirène', 'enquête', 'amende', 'commissariat', 'garde à vue', 'menottes'],
  },
  'professeur|moniteur': {
    a: ['cours', 'élèves', 'école', 'tableau', 'copies', 'bulletin', 'craie'],
    b: ['cours', 'élèves', 'colonie', 'ski', 'auto-école', 'permis', 'double pédale'],
  },
}
