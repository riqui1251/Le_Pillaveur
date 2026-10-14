// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from '../index'

/** it, lot 07 : paires 139 à 161 de data/it.ts (brief : node scripts/imposteur-clues-brief.mjs it 7). */
export const IMPOSTEUR_CLUES_IT_LOT_07: Record<string, ImposteurClueSet> = {
  'razzo|satellite': {
    a: ['spazio', 'missione', 'carburante', 'fiamme', 'conto alla rovescia', 'rampa di lancio'],
    b: ['spazio', 'missione', 'segnale', 'pannelli solari', 'orbita', 'parabola', 'geostazionario'],
  },
  'tatuaggio|piercing': {
    a: ['ago', 'pelle', 'disegno', 'braccio', 'per sempre', 'macchinetta', 'inchiostro'],
    b: ['ago', 'pelle', 'metallo', 'buco', 'anellino', 'ombelico', 'setto nasale'],
  },
  'baffi|barba': {
    a: ['peli', 'faccia', 'cera', 'arricciati', 'a manubrio', 'sotto il naso'],
    b: ['peli', 'faccia', 'rasoio', 'guance', 'folta', 'hipster', 'mento'],
  },
  'pisolino|dormire fino a tardi': {
    a: ['letto', 'sonno', 'occhi chiusi', 'divano', 'dopo pranzo', 'venti minuti'],
    b: ['letto', 'sonno', 'domenica', 'persiane chiuse', 'sveglia spenta', 'mezzogiorno'],
  },
  'pigiama|accappatoio': {
    a: ['casa', 'morbido', 'sera', 'pantaloni', 'bottoni', 'notte', 'letto'],
    b: ['casa', 'morbido', 'cintura', 'cappuccio', 'spugna', 'piscina', 'dopo la doccia'],
  },
  'valigia|zaino': {
    a: ['viaggio', 'bagaglio', 'aeroporto', 'lucchetto', 'rotelle', 'stiva', 'nastro bagagli'],
    b: ['viaggio', 'bagaglio', 'scuola', 'montagna', 'trekking', 'in spalla'],
  },
  'Marvel|DC': {
    a: ['fumetti', 'supereroi', 'Disney', 'Thor', 'Spider-Man', 'Avengers', 'Stan Lee'],
    b: ['fumetti', 'supereroi', 'Warner Bros', 'Wonder Woman', 'Lanterna Verde', 'Joker', 'Justice League'],
  },
  'Batman|Superman': {
    a: ['supereroe', 'mantello', 'notte', 'maschera', 'miliardario', 'pipistrello', 'Gotham City'],
    b: ['supereroe', 'mantello', 'volare', 'occhiali', 'giornalista', 'kryptonite', 'Clark Kent'],
  },
  'Star Wars|Star Trek': {
    a: ['fantascienza', 'spazio', 'galassia lontana', 'la Forza', 'spada laser', 'Jedi', 'Darth Vader'],
    b: ['fantascienza', 'spazio', 'equipaggio', 'teletrasporto', 'orecchie a punta', 'Enterprise', 'Spock'],
  },
  'Harry Potter|Il Signore degli Anelli': {
    a: ['magia', 'libri', 'scuola', 'bacchetta', 'occhiali tondi', 'Voldemort', 'Hogwarts'],
    b: ['magia', 'libri', 'elfi', 'hobbit', 'Gandalf', 'Terra di Mezzo', 'Frodo'],
  },
  'PlayStation|Xbox': {
    a: ['console', 'videogiochi', 'giapponese', 'God of War', 'tasto triangolo', 'Sony'],
    b: ['console', 'videogiochi', 'verde', 'Halo', 'Game Pass', 'Microsoft'],
  },
  'iPhone|Samsung': {
    a: ['smartphone', 'schermo', 'California', 'Face ID', 'AirPods', 'Siri', 'mela morsicata'],
    b: ['smartphone', 'schermo', 'Android', 'televisori', 'elettrodomestici', 'Corea del Sud', 'Galaxy'],
  },
  'Uber|FreeNow': {
    a: ['app', 'corsa', 'americana', 'auto nera', 'NCC', 'proteste dei tassisti', 'Eats'],
    b: ['app', 'corsa', 'taxi', 'tassametro', 'auto bianca', 'mytaxi'],
  },
  'Deliveroo|Glovo': {
    a: ['rider', 'consegne', 'inglese', 'turchese', 'Londra', 'canguro'],
    b: ['rider', 'consegne', 'spagnola', 'qualsiasi cosa', 'Barcellona', 'zaino giallo'],
  },
  'Spotify|Apple Music': {
    a: ['streaming', 'playlist', 'podcast', 'svedese', 'logo verde', 'pubblicità', 'Wrapped'],
    b: ['streaming', 'playlist', 'audio spaziale', 'Mac', 'iPhone', 'mela', 'iTunes'],
  },
  'Facebook|LinkedIn': {
    a: ['social', 'profilo', 'amici', 'compleanni', 'gruppi', 'zii e nonni', 'Marketplace', 'Zuckerberg'],
    b: ['social', 'profilo', 'lavoro', 'colleghi', 'recruiter', 'curriculum', 'Open to Work'],
  },
  'matita|penna': {
    a: ['scrivere', 'astuccio', 'legno', 'disegno', 'gommino', 'temperino', 'grafite'],
    b: ['scrivere', 'astuccio', 'firma', 'tappo', 'clic', 'inchiostro', 'a sfera'],
  },
  'gomma|correttore': {
    a: ['errore', 'cancellare', 'rosa', 'strofinare', 'briciole', 'matita'],
    b: ['errore', 'cancellare', 'bianco', 'liquido', 'penna', 'nastro', 'pennellino'],
  },
  'quaderno|raccoglitore': {
    a: ['scuola', 'fogli', 'compiti', 'copertina', 'righe', 'brutta copia', 'pagine cucite'],
    b: ['scuola', 'fogli', 'ufficio', 'divisori', 'buste trasparenti', 'perforatrice', 'anelli'],
  },
  'lavagna bianca|lavagna nera': {
    a: ['aula', 'lezione', 'ufficio', 'riunione', 'magnetica', 'pennarello'],
    b: ['aula', 'lezione', 'maestra', 'polvere', 'stridio', 'cancellino', 'gesso'],
  },
  'cartella|borsone sportivo': {
    a: ['manico', 'pesante', 'libri', 'astuccio', 'elementari', 'grembiule'],
    b: ['manico', 'pesante', 'tracolla', 'scarpe', 'asciugamano', 'palestra', 'spogliatoio'],
  },
  'ricreazione|pausa pranzo': {
    a: ['panino', 'staccare', 'corridoio', 'cortile', 'bidello', 'merenda', 'campanella'],
    b: ['panino', 'staccare', 'ufficio', 'colleghi', "un'ora", 'mensa', 'buoni pasto'],
  },
  'capo|collega': {
    a: ['ufficio', 'lavoro', 'riunione', 'scadenze', 'ordini', 'promozione', 'licenziare'],
    b: ['ufficio', 'lavoro', 'pausa caffè', 'pettegolezzi', 'chat di gruppo', 'pari grado', 'scrivania accanto'],
  },
}
