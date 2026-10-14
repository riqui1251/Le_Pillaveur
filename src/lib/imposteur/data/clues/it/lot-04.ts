// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from '../index'

/** it, lot 04 : paires 70 à 92 de data/it.ts (brief : node scripts/imposteur-clues-brief.mjs it 4). */
export const IMPOSTEUR_CLUES_IT_LOT_04: Record<string, ImposteurClueSet> = {
  'cameriere|barista': {
    a: ['mancia', 'grembiule', 'vassoio', 'tovaglia', 'piatto del giorno', 'ordinazione', 'portare il conto'],
    b: ['mancia', 'grembiule', 'bancone', 'tazzina', 'macchina del caffè', 'schiuma di latte', 'cappuccino'],
  },
  'panettiere|pasticcere': {
    a: ['forno', 'farina', "all'alba", 'lievito madre', 'impasto', 'filone', 'rosetta'],
    b: ['forno', 'farina', 'zucchero a velo', 'panna montata', 'sac à poche', 'millefoglie', 'cannoli'],
  },
  'parrucchiere|barbiere': {
    a: ['forbici', 'pettine', 'shampoo', 'phon', 'tinta', 'colpi di sole', 'messa in piega'],
    b: ['forbici', 'pettine', 'schiuma', 'asciugamano caldo', 'baffi', 'barba', 'rasoio a mano libera'],
  },
  'idraulico|elettricista': {
    a: ['preventivo', 'cassetta degli attrezzi', 'bagno', 'tubi', 'perdita', 'chiave inglese', 'sturalavandini'],
    b: ['preventivo', 'cassetta degli attrezzi', 'presa', 'cavi', 'scossa', 'cortocircuito', 'salvavita'],
  },
  'avvocato|notaio': {
    a: ['studio', 'parcella', 'cliente', 'tribunale', 'toga', 'arringa', 'obiezione'],
    b: ['studio', 'parcella', 'firma', 'contratto', 'eredità', 'testamento', 'rogito'],
  },
  'pilota|capitano': {
    a: ['divisa', 'equipaggio', 'aeroporto', 'turbolenze', 'decollo', 'cloche', 'torre di controllo'],
    b: ['divisa', 'equipaggio', 'mare', 'porto', 'nave', 'timone', 'mozzo'],
  },
  'astronauta|aviatore': {
    a: ['casco', 'tuta', 'spazio', 'razzo', 'conto alla rovescia', 'stazione spaziale', 'assenza di gravità'],
    b: ['casco', 'tuta', 'cielo', 'elica', 'occhialoni', 'sciarpa di seta', 'biplano'],
  },
  'luna|sole': {
    a: ['cielo', 'tondo', 'notte', 'marea', 'crateri', 'falce', 'lupo mannaro'],
    b: ['cielo', 'tondo', 'giorno', 'estate', 'caldo', 'abbronzatura', 'crema solare'],
  },
  'stella|cometa': {
    a: ['cielo', 'notte', 'scintillare', 'cinque punte', 'via lattea', 'orsa maggiore', 'polare'],
    b: ['cielo', 'notte', 'rara', 'scia', 'ghiaccio e polvere', 'coda luminosa', 'ogni 76 anni'],
  },
  'montagna|vulcano': {
    a: ['vetta', 'roccia', 'sentiero', 'scalata', 'rifugio', 'piste da sci', 'stambecco'],
    b: ['vetta', 'roccia', 'fumo', 'cratere', 'magma', 'eruzione', 'lava'],
  },
  'fiume|lago': {
    a: ['acqua dolce', 'pesca', 'ponte', 'corrente', 'argine', 'affluente', 'foce'],
    b: ['acqua dolce', 'pesca', 'riva', 'pedalò', 'acqua ferma', 'battello', 'mostro di Loch Ness'],
  },
  'foresta|giungla': {
    a: ['alberi', 'ombra', 'funghi', 'muschio', 'pini', 'taglialegna', 'cappuccetto rosso'],
    b: ['alberi', 'ombra', 'umidità', 'scimmie', 'pappagalli', 'machete', 'liane'],
  },
  'deserto|savana': {
    a: ['caldo', 'secco', 'sabbia', 'dune', 'cammello', 'oasi', 'miraggio'],
    b: ['caldo', 'secco', 'erba alta', 'safari', 'leoni', 'acacia', 'zebre'],
  },
  'pioggia|neve': {
    a: ['nuvole', 'cielo grigio', 'gocce', 'pozzanghere', 'stivali di gomma', 'impermeabile', 'ombrello'],
    b: ['nuvole', 'cielo grigio', 'inverno', 'fiocchi', 'catene', 'slittino', 'pupazzo'],
  },
  'temporale|ondata di caldo': {
    a: ['estate', 'allerta meteo', 'nuvoloni', 'acquazzone', 'contare i secondi', 'tuoni', 'fulmini'],
    b: ['estate', 'allerta meteo', 'sudore', 'ventilatore', 'condizionatore', 'afa', 'anticiclone africano'],
  },
  'primavera|autunno': {
    a: ['mezza stagione', "cambio dell'ora", 'fiori', 'polline', 'gemme', 'rondini', 'marzo'],
    b: ['mezza stagione', "cambio dell'ora", 'pioggia', 'vendemmia', 'castagne', 'foglie secche', 'ottobre'],
  },
  'occhiali da sole|cappellino': {
    a: ['estate', 'spiaggia', 'naso', 'raggi UV', 'stanghette', 'montatura', 'lenti scure'],
    b: ['estate', 'spiaggia', 'testa', 'baseball', 'visiera', 'frontino', "girato all'indietro"],
  },
  'costume da bagno|pantaloncini': {
    a: ['estate', 'mare', 'piscina', 'telo', 'nuotare', 'tuffo', 'due pezzi'],
    b: ['estate', 'mare', 'gambe', 'cotone', 'tasche', 'palestra', 'sopra al ginocchio'],
  },
  'scarpe da ginnastica|infradito': {
    a: ['piedi', 'suola', 'calzini', 'palestra', 'corsa', 'ammortizzate', 'lacci'],
    b: ['piedi', 'suola', 'estate', 'gomma', 'spiaggia', 'doccia in piscina', 'tra le dita'],
  },
  'jeans|tuta': {
    a: ['pantaloni', 'casual', 'blu', 'strappati', 'cinque tasche', 'rivetti', 'denim'],
    b: ['pantaloni', 'casual', 'divano', 'palestra', 'elastico in vita', 'felpa con zip', 'acetato'],
  },
  'abito|smoking': {
    a: ['cerimonia', 'giacca', 'sartoria', 'cravatta', 'ufficio', 'gessato', 'colloquio di lavoro'],
    b: ['cerimonia', 'giacca', 'nero', 'serata di gala', 'papillon', 'revers in raso', 'agente 007'],
  },
  'profumo|deodorante': {
    a: ['spruzzo', 'mattina', 'collo', 'polsi', 'regalo di Natale', 'boccetta di vetro', 'note di fondo'],
    b: ['spruzzo', 'mattina', 'palestra', 'sudore', 'stick', 'ascelle', 'antitraspirante'],
  },
  'divano|amaca': {
    a: ['sdraiarsi', 'pisolino', 'salotto', 'cuscini', 'braccioli', 'telecomando', 'tre posti'],
    b: ['sdraiarsi', 'pisolino', 'giardino', 'tropici', 'dondolare', 'corde', 'tra due palme'],
  },
}
