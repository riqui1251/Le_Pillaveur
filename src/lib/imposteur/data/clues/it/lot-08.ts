// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from '../index'

/** it, lot 08 : paires 162 à 184 de data/it.ts (brief : node scripts/imposteur-clues-brief.mjs it 8). */
export const IMPOSTEUR_CLUES_IT_LOT_08: Record<string, ImposteurClueSet> = {
  'riunione|colloquio di lavoro': {
    a: ['ufficio', 'tavolo', 'colleghi', 'proiettore', 'ordine del giorno', 'verbale'],
    b: ['ufficio', 'ansia', 'giacca e cravatta', 'domande', 'risorse umane', 'curriculum', 'pregi e difetti'],
  },
  'smart working|open space': {
    a: ['lavoro', 'computer', 'videochiamata', 'casa','telecamera spenta', 'in pigiama'],
    b: ['lavoro', 'computer', 'colleghi', 'rumore', 'cuffie', 'scrivanie in fila', 'niente pareti'],
  },
  'contratto a tempo indeterminato|contratto a tempo determinato': {
    a: ['firma', 'busta paga', 'stabilità', 'mutuo approvato', 'fino alla pensione', 'posto fisso'],
    b: ['firma', 'busta paga', 'sei mesi', 'rinnovo', 'precario', 'scadenza'],
  },
  'sciopero|manifestazione': {
    a: ['protesta', 'sindacati', 'niente stipendio', 'scuole chiuse', 'treni fermi', 'braccia incrociate'],
    b: ['protesta', 'sindacati', 'piazza', 'slogan', 'cartelli', 'striscioni', 'corteo'],
  },
  'tasse|affitto': {
    a: ['soldi', 'stato', 'scadenze', 'evasione', 'commercialista', 'modello 730', 'agenzia delle entrate'],
    b: ['soldi', 'ogni mese', 'casa', 'bilocale', 'caparra', 'inquilino', 'padrone di casa'],
  },
  'lampadina|candela': {
    a: ['luce', 'buio', 'vetro', 'interruttore', 'led', 'avvitare', 'fulminata'],
    b: ['luce', 'buio', 'fiamma', 'compleanno', 'cena romantica', 'cera', 'stoppino'],
  },
  'aspirapolvere|spolverino': {
    a: ['pulizie', 'faccende', 'rumore', 'spina', 'tubo', 'sacchetto', 'folletto'],
    b: ['pulizie', 'faccende', 'manico', 'mensole', 'soprammobili', 'piume'],
  },
  'lavatrice|lavastoviglie': {
    a: ['acqua', 'detersivo', 'oblò', 'ammorbidente', 'centrifuga', 'calzini spaiati', 'bucato'],
    b: ['acqua', 'detersivo', 'cucina', 'dopo cena', 'pastiglia', 'posate', 'brillantante', 'piatti'],
  },
  'termosifone|condizionatore': {
    a: ['temperatura', 'bolletta', 'inverno', 'sotto la finestra', 'valvola', 'ghisa', 'calzini ad asciugare'],
    b: ['temperatura', 'bolletta', 'estate', 'telecomando', 'mal di gola', 'split', 'aria fredda'],
  },
  'ombrello|impermeabile': {
    a: ['pioggia', 'temporale', 'vento', 'manico', 'porta sfortuna', 'dimenticato ovunque', 'stecche'],
    b: ['pioggia', 'temporale', 'giacca', 'bottoni', 'cappuccio', 'trench', 'k-way'],
  },
  'arcobaleno|aurora boreale': {
    a: ['cielo', 'colori', 'sole', 'prisma', 'unicorni', "pentola d'oro", 'dopo la pioggia'],
    b: ['cielo', 'colori', 'notte', 'freddo', 'verde', 'islanda', 'lapponia', 'vento solare'],
  },
  'tempesta|tornado': {
    a: ['vento', 'danni', 'pioggia', 'fulmini', 'tuoni', 'naufragio', "bicchier d'acqua"],
    b: ['vento', 'danni', 'vortice', 'imbuto', 'kansas', 'mucche volanti', 'mago di oz'],
  },
  'eclissi solare|eclissi lunare': {
    a: ['cielo', 'ombra', 'di giorno', 'sole', 'corona', 'luna davanti', 'occhiali speciali'],
    b: ['cielo', 'ombra', 'di notte', 'luna piena', 'occhio nudo', 'terra in mezzo', 'luna di sangue'],
  },
  'ghiacciaio|iceberg': {
    a: ['freddo', 'scioglimento', 'montagna', 'alpinisti', 'ramponi', 'morena', 'crepacci'],
    b: ['freddo', 'scioglimento', 'oceano', 'galleggia', 'solo la punta', 'titanic'],
  },
  'cactus|bonsai': {
    a: ['pianta', 'vaso', 'poca acqua', 'sole', 'messico', 'deserto', 'spine'],
    b: ['pianta', 'vaso', 'pazienza', 'giappone', 'potatura', 'forbicine', 'albero in miniatura'],
  },
  'riccio|tartaruga': {
    a: ['animale', 'giardino', 'bosco', 'notturno', 'si appallottola', 'sonic', 'aculei'],
    b: ['animale', 'giardino', 'lunga vita', 'lentezza', 'ninja', 'guscio', 'carapace'],
  },
  'fenicottero|pavone': {
    a: ['uccello', 'piume', 'salvagente', 'collo lungo', 'gamberetti', 'su una zampa', 'rosa'],
    b: ['uccello', 'piume', 'vanità', 'blu', 'corteggiamento', 'fa la ruota', 'coda a ventaglio'],
  },
  'polpo|calamaro': {
    a: ['mare', 'tentacoli', 'scoglio', 'intelligente', 'con le patate', 'otto braccia'],
    b: ['mare', 'tentacoli', 'inchiostro', 'abissi', 'fritto misto', 'anelli'],
  },
  'sumo|wrestling': {
    a: ['lotta', 'corpo a corpo', 'chili di troppo', 'giappone', 'cerchio', 'lancio di sale', 'perizoma'],
    b: ['lotta', 'corpo a corpo', 'spettacolo', 'ring', 'tutto finto', 'sedie in testa', 'smackdown'],
  },
  'scherma|karate': {
    a: ['sport', 'combattimento', 'olimpiadi', 'tuta bianca', 'pedana', 'stoccata', 'fioretto'],
    b: ['sport', 'combattimento', 'giappone', 'kimono', 'cintura nera', 'tavolette spaccate', 'mister miyagi'],
  },
  'gioiello|orologio': {
    a: ['regalo', 'polso', 'cassaforte', 'carati', 'diamanti', 'anello', 'collana'],
    b: ['regalo', 'polso', 'svizzera', 'cinturino', 'quadrante', 'tic tac', 'lancette'],
  },
  'borsa|pochette': {
    a: ['accessorio', 'chiavi', 'spalla', 'manici', 'tracolla', 'senza fondo', 'mary poppins'],
    b: ['accessorio', 'chiavi', 'serata', 'matrimonio', 'paillettes', 'in mano', 'sotto il braccio'],
  },
  'guanti|sciarpa': {
    a: ['inverno', 'lana', 'un paio', 'pelle', 'boxe', 'chirurgo', 'dita'],
    b: ['inverno', 'lana', 'frange', 'nodo', 'stadio', 'gola', 'collo'],
  },
}
