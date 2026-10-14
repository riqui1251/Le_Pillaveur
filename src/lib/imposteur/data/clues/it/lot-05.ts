// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from '../index'

/** it, lot 05 : paires 93 à 115 de data/it.ts (brief : node scripts/imposteur-clues-brief.mjs it 5). */
export const IMPOSTEUR_CLUES_IT_LOT_05: Record<string, ImposteurClueSet> = {
  'doccia|vasca da bagno': {
    a: ['acqua calda', 'bagnoschiuma', 'cinque minuti', 'in piedi', 'box', 'soffione'],
    b: ['acqua calda', 'bagnoschiuma', 'relax', 'sdraiato', 'tappo', 'paperella di gomma', 'idromassaggio'],
  },
  'frigo|congelatore': {
    a: ['freddo', 'cucina', 'latte', 'avanzi', 'calamite', 'luce interna', 'quattro gradi'],
    b: ['freddo', 'cucina', 'cubetti', 'surgelati', 'brina', 'ghiaccioli', 'meno diciotto'],
  },
  'microonde|forno': {
    a: ['cucina', 'scaldare', 'avanzi', 'trenta secondi', 'popcorn', 'piatto girevole'],
    b: ['cucina', 'scaldare', 'teglia', 'lasagne', 'gratinare', 'ventilato', '180 gradi'],
  },
  'TV|proiettore': {
    a: ['schermo', 'film', 'divano', 'telecomando', 'canali', 'zapping', 'telegiornale'],
    b: ['schermo', 'film', 'buio', 'presentazione', 'lampada', 'fascio di luce', 'telo bianco'],
  },
  'console|PC da gaming': {
    a: ['videogiochi', 'cuffie', 'divano', 'joypad', 'cartuccia', 'Xbox', 'PlayStation'],
    b: ['videogiochi', 'cuffie', 'scrivania', 'mouse', 'tastiera meccanica', 'scheda video', 'luci RGB', 'Steam'],
  },
  'Instagram|TikTok': {
    a: ['social', 'follower', 'foto', 'filtri', 'carosello', 'griglia del profilo', 'Zuckerberg'],
    b: ['social', 'follower', 'video brevi', 'trend', 'duetti', 'cinese', 'balletti'],
  },
  'WhatsApp|Snapchat': {
    a: ['messaggi', 'telefono', 'vocali', 'ultimo accesso', 'gruppo di famiglia', 'spunte blu'],
    b: ['messaggi', 'telefono', 'filtri', 'foto che spariscono', 'streak', 'orecchie da cane', 'fantasmino giallo'],
  },
  'YouTube|Netflix': {
    a: ['video', 'streaming', 'gratis', 'pubblicità', 'tutorial', 'iscriviti', 'campanella'],
    b: ['video', 'streaming', 'abbonamento', 'serie', 'maratona', 'password condivisa', 'La casa di carta', 'tudum'],
  },
  'selfie|story': {
    a: ['telefono', 'foto', 'sorriso', 'fotocamera frontale', 'braccio teso', 'asta'],
    b: ['telefono', 'foto', 'visualizzazioni', 'sticker', 'sondaggio', 'cerchio colorato', 'dura 24 ore'],
  },
  'tacos|burrito': {
    a: ['messicano', 'tortilla', 'lime', 'piccoli', 'croccante', 'al pastor', 'a forma di U'],
    b: ['messicano', 'tortilla', 'fagioli', 'riso', 'carta stagnola', 'tutto chiuso', 'arrotolato'],
  },
  'limonata|tè freddo': {
    a: ['ghiaccio', 'estate', 'zucchero', 'aspro', 'agrumi', 'spremuta', 'limoni di Sorrento'],
    b: ['ghiaccio', 'estate', 'in bottiglia', 'infuso', 'bustina', 'teiera', 'gusto pesca'],
  },
  'espresso|cappuccino': {
    a: ['caffè', 'bar', 'tazzina', 'al banco', 'un sorso', 'crema', 'ristretto'],
    b: ['caffè', 'bar', 'colazione', 'cornetto', 'latte', 'schiuma', 'cacao spolverato', 'mai dopo pranzo'],
  },
  'gin tonic|spritz': {
    a: ['aperitivo', 'ghiaccio', 'bicchiere alto', 'scorza di limone', 'cetriolo', 'ginepro', 'acqua tonica'],
    b: ['aperitivo', 'ghiaccio', 'calice', 'arancione', 'fetta d’arancia', 'seltz', 'prosecco', 'regola 3-2-1'],
  },
  'rum|whisky': {
    a: ['distillato', 'superalcolico', 'tropici', 'canna da zucchero', 'pirati', 'mojito', 'cuba libre'],
    b: ['distillato', 'superalcolico', 'invecchiato', 'botte di rovere', 'torbato', 'scozzese', 'single malt'],
  },
  'sangria|punch': {
    a: ['frutta a pezzi', 'festa', 'vino rosso', 'brocca', 'pesche', 'tapas', 'spagnola'],
    b: ['frutta a pezzi', 'festa', 'rum', 'ciotola grande', 'mestolo', 'bicchieri di carta', 'ballo del liceo'],
  },
  'hot dog|toast farcito': {
    a: ['spuntino', 'pane', 'chiosco', 'stadio', 'senape', 'panino lungo', 'würstel'],
    b: ['spuntino', 'pane', 'bar', 'piastra', 'pancarré', 'sottiletta', 'prosciutto e formaggio'],
  },
  'nuggets|alette di pollo': {
    a: ['fast food', 'fritto', 'panatura', 'senza ossa', 'menu bambini', 'bocconcini', 'scatola da sei'],
    b: ['fast food', 'salsa barbecue', 'piccanti', 'dita unte', 'ossicini', 'sedano', 'stile buffalo'],
  },
  'ramen|noodles saltati': {
    a: ['bacchette', 'cucina asiatica', 'brodo', 'ciotola fumante', 'uovo marinato', 'giapponese', 'tonkotsu'],
    b: ['bacchette', 'cucina asiatica', 'padella', 'salsa di soia', 'germogli di soia', 'senza brodo', 'wok'],
  },
  'paella|risotto': {
    a: ['zafferano', 'chicchi', 'frutti di mare', 'cozze', 'padellona', 'spagnola', 'valenciana'],
    b: ['zafferano', 'chicchi', 'brodo', 'parmigiano', 'mantecatura', 'carnaroli', 'alla milanese'],
  },
  'couscous|tajine': {
    a: ['speziato', 'nordafricano', 'verdure', 'chicchi', 'semola', 'sgranato con forchetta', 'alla trapanese'],
    b: ['speziato', 'nordafricano', 'cottura lenta', 'agnello', 'albicocche secche', 'terracotta', 'coperchio a cono'],
  },
  'frittata|uova strapazzate': {
    a: ['uovo', 'padella', 'cipolle', 'zucchine', 'a spicchi', 'girata col coperchio'],
    b: ['uovo', 'padella', 'colazione', 'bacon', 'pane tostato', 'cremose', 'mescolate di continuo'],
  },
  'tiramisù|panna cotta': {
    a: ['dolce al cucchiaio', 'fine pasto', 'caffè', 'cacao amaro', 'mascarpone', 'savoiardi'],
    b: ['dolce al cucchiaio', 'fine pasto', 'stampino', 'tremolante', 'vaniglia', 'frutti di bosco', 'colla di pesce'],
  },
  'ciambella|muffin': {
    a: ['colazione', 'zucchero', 'glassa', 'zuccherini colorati', 'fritta', 'col buco'],
    b: ['colazione', 'zucchero', 'americano', 'gocce di cioccolato', 'mirtilli', 'cupola', 'pirottino'],
  },
}
