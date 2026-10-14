// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from '../index'

/** it, lot 06 : paires 116 à 138 de data/it.ts (brief : node scripts/imposteur-clues-brief.mjs it 6). */
export const IMPOSTEUR_CLUES_IT_LOT_06: Record<string, ImposteurClueSet> = {
  'popcorn|zucchero filato': {
    a: ['dolce', 'bancarella', 'cinema', 'secchiello', 'microonde', 'scoppietta', 'chicchi di mais'],
    b: ['dolce', 'bancarella', 'giostre', 'appiccicoso', 'bastoncino', 'si scioglie in bocca', 'nuvola rosa'],
  },
  'frullato|frappè': {
    a: ['cannuccia', 'bicchiere alto', 'colazione', 'vitamine', 'banana', 'fragole', 'frutta fresca'],
    b: ['cannuccia', 'bicchiere alto', 'bar', 'schiuma', 'cioccolato', 'ghiaccio', 'latte e gelato'],
  },
  'miele|marmellata': {
    a: ['fetta biscottata', 'vasetto', 'dorato', 'tisana', 'mal di gola', 'alveare', 'api'],
    b: ['fetta biscottata', 'vasetto', 'nonna', 'cornetto', 'crostata', 'albicocche', 'frutta cotta'],
  },
  'escape room|laser game': {
    a: ['in squadra', 'compleanno', 'indovinelli', 'codice segreto', 'lucchetti', 'stanza chiusa', 'evadere in 60 minuti'],
    b: ['in squadra', 'compleanno', 'al buio', 'fumo', 'luci fluo', 'mirare', 'giubbotto con sensori', 'pistola a infrarossi'],
  },
  'parco divertimenti|luna park': {
    a: ['giostre', 'adrenalina', 'montagne russe', 'code infinite', 'mascotte', "biglietto d'ingresso", 'aree a tema'],
    b: ['giostre', 'adrenalina', 'zucchero filato', 'autoscontri', 'tiro a segno', 'gettoni', 'arriva in paese', 'giostrai'],
  },
  'zoo|acquario': {
    a: ['animali', 'gita scolastica', "all'aperto", 'gabbie', 'recinti', 'leoni', 'giraffe'],
    b: ['animali', 'gita scolastica', 'blu', 'vetro', 'tunnel', 'squali', 'meduse'],
  },
  'museo|biblioteca': {
    a: ['silenzio', 'cultura', 'biglietto', 'visita guidata', 'audioguida', 'statue', 'quadri'],
    b: ['silenzio', 'cultura', 'studiare', 'scaffali', 'tessera', 'prestito', 'libri'],
  },
  'tenda|roulotte': {
    a: ['campeggio', 'vacanze', 'festival', 'sacco a pelo', 'telo', 'montarla', 'picchetti'],
    b: ['campeggio', 'vacanze', 'ruote', 'olandesi', 'letto ribaltabile', 'rimorchio', 'gancio traino'],
  },
  'idromassaggio|sauna': {
    a: ['spa', 'relax', 'costume', 'acqua calda', 'vasca', 'getti', 'bollicine'],
    b: ['spa', 'relax', 'asciugamano', 'legno', 'sudare', 'pietre roventi', 'finlandese'],
  },
  'scivolo|altalena': {
    a: ['parco giochi', 'bambini', 'scaletta', 'in discesa', 'plastica', 'a pancia in giù', 'toboga'],
    b: ['parco giochi', 'bambini', 'seggiolino', 'spingere', 'catene', 'dondolare', 'avanti e indietro'],
  },
  'tappeto elastico|castello gonfiabile': {
    a: ['saltare', 'bambini', 'giardino', 'scalzi', 'rete di protezione', 'capriole', 'molle'],
    b: ['saltare', 'bambini', 'sagra', 'colori sgargianti', 'pareti morbide', 'torrette', 'pompa ad aria'],
  },
  'skateboard|pattini': {
    a: ['rotelle', 'ginocchiere', 'rampa', 'trick', 'tavola', 'spingere col piede', 'ollie'],
    b: ['rotelle', 'ginocchiere', 'pista', 'ai piedi', 'lacci', 'in linea', 'freno sulla punta'],
  },
  'kayak|pedalò': {
    a: ['sul lago', 'noleggio', 'fiume', 'rapide', 'stretto e lungo', 'eschimese', 'pagaia'],
    b: ['sul lago', 'noleggio', 'spiaggia', 'in coppia', 'lentamente', 'con lo scivolo', 'come una bici'],
  },
  "barca a vela|moto d'acqua": {
    a: ['mare', 'salvagente', 'vento', 'silenzio', 'timone', 'regata', 'randa'],
    b: ['mare', 'salvagente', 'velocità', 'rumore', 'benzina', 'scia', 'manubrio'],
  },
  'arrampicata|zipline': {
    a: ['imbracatura', 'moschettone', 'montagna', 'corda', 'scarpette', 'magnesite', 'prese sulla parete'],
    b: ['imbracatura', 'moschettone', 'alberi', 'vuoto sotto', 'carrucola', "cavo d'acciaio", 'volare appeso'],
  },
  'maratona|triathlon': {
    a: ['fatica', 'pettorale', 'asfalto', 'ristori', 'il muro', 'tutta di corsa', '42 chilometri'],
    b: ['fatica', 'pettorale', 'muta', 'bici da crono', 'zona cambio', 'ironman', 'nuoto bici corsa'],
  },
  'boxe|judo': {
    a: ['combattimento', 'palestra', 'paradenti', 'ring', 'sacco', 'montante', 'guantoni'],
    b: ['combattimento', 'palestra', 'tatami', 'kimono', 'cintura nera', 'proiezione', 'ippon'],
  },
  'mago|pagliaccio': {
    a: ['spettacolo', 'festa di compleanno', 'mantello', 'carte', 'bacchetta', 'coniglio nel cilindro', 'abracadabra'],
    b: ['spettacolo', 'festa di compleanno', 'circo', 'parrucca', 'scarpe enormi', 'torta in faccia', 'naso rosso'],
  },
  'pirata|vichingo': {
    a: ['nave', 'saccheggio', 'isola', 'tesoro', 'pappagallo', 'gamba di legno', "benda sull'occhio"],
    b: ['nave', 'saccheggio', 'freddo', 'barba intrecciata', 'ascia', 'elmo con le corna', 'drakkar'],
  },
  'zombie|vampiro': {
    a: ['horror', 'halloween', 'apocalisse', 'lento', 'pelle marcia', 'braccia tese', 'mangia cervelli'],
    b: ['horror', 'halloween', 'mantello', 'pipistrello', 'aglio', 'canini', 'succhia il sangue'],
  },
  'strega|fata': {
    a: ['magia', 'favole', 'gatto nero', 'pentolone', 'mela avvelenata', 'cappello a punta', 'scopa volante'],
    b: ['magia', 'favole', 'buona', 'brillantini', 'bacchetta', 'dentino sotto il cuscino', 'ali trasparenti'],
  },
  'unicorno|drago': {
    a: ['leggenda', 'fantasy', 'bambine', 'criniera', 'zoccoli', 'arcobaleno', 'cavallo magico'],
    b: ['leggenda', 'fantasy', 'caverna', 'tesoro', 'squame', 'ali enormi', 'sputa fuoco'],
  },
  'castello|baita': {
    a: ['camino', 'pietra', 'principessa', 'torri', 'cavalieri', 'fossato', 'ponte levatoio'],
    b: ['camino', 'pietra', 'legno', 'neve', 'polenta', 'alpeggio', 'casetta in montagna'],
  },
}
