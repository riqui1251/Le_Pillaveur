// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from '../index'

/** it, lot 02 : paires 24 à 46 de data/it.ts (brief : node scripts/imposteur-clues-brief.mjs it 2). */
export const IMPOSTEUR_CLUES_IT_LOT_02: Record<string, ImposteurClueSet> = {
  'picnic|brunch': {
    a: ['weekend', 'tra amici', 'all’aperto', 'cestino', 'panini', 'formiche', 'tovaglia a quadri'],
    b: ['weekend', 'tra amici', 'domenica mattina', 'succo d’arancia', 'pancake', 'avocado toast', 'uova alla Benedict'],
  },
  'discoteca|bar': {
    a: ['serata', 'cocktail', 'dj', 'buttafuori', 'fila all’ingresso', 'pista da ballo', 'cubista'],
    b: ['serata', 'cocktail', 'bancone', 'sgabello', 'spritz', 'tabacchi', 'caffè al banco'],
  },
  'concerto|festival': {
    a: ['musica', 'palco', 'cantante', 'stadio', 'scaletta', 'accendini', 'bis'],
    b: ['musica', 'palco', 'estate', 'più giorni', 'tende', 'fango', 'braccialetto'],
  },
  'cinema|teatro': {
    a: ['sala', 'biglietto', 'buio', 'schermo', 'trailer', 'popcorn', 'occhialini 3D'],
    b: ['sala', 'biglietto', 'attori', 'costumi', 'intervallo', 'loggione', 'sipario rosso'],
  },
  'karaoke|quiz musicale': {
    a: ['canzoni', 'serata', 'duetto', 'stonati', 'microfono', 'testo che scorre'],
    b: ['canzoni', 'serata', 'squadre', 'punti', 'velocità', 'pulsante', 'prime note'],
  },
  'compleanno|festa di inaugurazione': {
    a: ['regali', 'invitati', 'sorpresa', 'età', 'tanti auguri', 'torta', 'spegnere le candeline'],
    b: ['regali', 'invitati', 'vicini', 'scatoloni', 'trasloco', 'giro delle stanze', 'casa nuova'],
  },
  'matrimonio|battesimo': {
    a: ['chiesa', 'bomboniere', 'testimoni', 'abito bianco', 'fedi', 'lancio del riso', 'luna di miele'],
    b: ['chiesa', 'bomboniere', 'neonato', 'madrina', 'padrino', 'vestina bianca', 'acqua sulla testa'],
  },
  'Natale|Capodanno': {
    a: ['dicembre', 'cenone', 'regali', 'albero', 'panettone', 'presepe', 'Gesù bambino'],
    b: ['dicembre', 'cenone', 'spumante', 'mezzanotte', 'botti', 'lenticchie', 'conto alla rovescia'],
  },
  'Halloween|Carnevale': {
    a: ['travestimento', 'maschera', 'paura', 'streghe', 'ragnatele', 'zucca intagliata', 'dolcetto o scherzetto'],
    b: ['travestimento', 'maschera', 'febbraio', 'stelle filanti', 'coriandoli', 'chiacchiere', 'carri allegorici'],
  },
  'campeggio|ostello': {
    a: ['zaino', 'risparmio', 'all’aperto', 'zanzare', 'sacco a pelo', 'picchetti', 'montare la tenda'],
    b: ['zaino', 'risparmio', 'camerata', 'sconosciuti', 'armadietto', 'lucchetto', 'letto a castello'],
  },
  'hotel|Airbnb': {
    a: ['valigia', 'check-in', 'reception', 'stelle', 'facchino', 'minibar', 'servizio in camera'],
    b: ['valigia', 'check-in', 'appartamento', 'recensioni', 'padrone di casa', 'cassetta delle chiavi', 'superhost'],
  },
  'aereo|treno': {
    a: ['viaggio', 'biglietto', 'gate', 'bagaglio a mano', 'turbolenze', 'hostess', 'decollo'],
    b: ['viaggio', 'biglietto', 'stazione', 'ritardo', 'controllore', 'vagone', 'binario'],
  },
  'bicicletta|monopattino': {
    a: ['ruote', 'pista ciclabile', 'gomma bucata', 'campanello', 'catena', 'sellino', 'pedalare'],
    b: ['ruote', 'pista ciclabile', 'elettrico', 'batteria', 'noleggio con app', 'in piedi', 'pedana'],
  },
  'moto|scooter': {
    a: ['casco', 'due ruote', 'giubbotto di pelle', 'marce', 'frizione', 'piega in curva', 'centauro'],
    b: ['casco', 'due ruote', 'città', 'traffico', 'pedana', 'bauletto', 'vespa'],
  },
  'taxi|autobus': {
    a: ['città', 'corsa', 'sedile posteriore', 'mancia', 'auto bianca', 'tassista', 'tassametro'],
    b: ['città', 'corsa', 'fermata', 'linea', 'orari', 'obliterare', 'capolinea'],
  },
  'metro|tram': {
    a: ['città', 'fermata', 'scale mobili', 'banchina', 'tornelli', 'galleria', 'sottoterra'],
    b: ['città', 'fermata', 'rotaie', 'cavi elettrici', 'in mezzo alla strada', 'scampanellio', 'pantografo'],
  },
  'auto|camper': {
    a: ['patente', 'volante', 'benzina', 'parcheggio', 'cintura', 'cinque posti', 'utilitaria'],
    b: ['patente', 'volante', 'vacanze', 'pensionati', 'area di sosta', 'letto a bordo', 'casa su ruote'],
  },
  'sci|snowboard': {
    a: ['neve', 'montagna', 'settimana bianca', 'scarponi', 'slalom', 'spazzaneve', 'bastoncini'],
    b: ['neve', 'montagna', 'salti', 'freestyle', 'half pipe', 'tavola', 'piedi legati'],
  },
  'surf|paddle': {
    a: ['mare', 'tavola', 'muta', 'oceano', 'onde alte', 'cavalcare l’onda'],
    b: ['mare', 'tavola', 'in piedi', 'equilibrio', 'acqua piatta', 'lago', 'pagaia'],
  },
  'calcio|rugby': {
    a: ['pallone', 'campo', 'tifosi', 'fuorigioco', 'rigore', 'corner', 'gol'],
    b: ['pallone', 'campo', 'terzo tempo', 'placcaggio', 'mischia', 'meta', 'palla ovale'],
  },
  'tennis|badminton': {
    a: ['racchetta', 'rete', 'set', 'servizio', 'ace', 'terra rossa', 'palline gialle'],
    b: ['racchetta', 'rete', 'palestra', 'giardino', 'piume', 'senza rimbalzo', 'volano'],
  },
  'basket|pallamano': {
    a: ['palestra', 'squadra', 'altezza', 'rimbalzo', 'tiro da tre', 'schiacciata', 'canestro'],
    b: ['palestra', 'squadra', 'porta', 'portiere', 'sette giocatori', 'resina sulle dita', 'area dei sei metri'],
  },
  'bocce|bowling': {
    a: ['pista', 'lanciare', 'anziani', 'circolo', 'spiaggia', 'accostare', 'pallino'],
    b: ['pista', 'lanciare', 'scarpe a noleggio', 'buchi per le dita', 'canaletta', 'birilli', 'strike'],
  },
}
