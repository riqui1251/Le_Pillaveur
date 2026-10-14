// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from '../index'

/** it, lot 01 : paires 1 à 23 de data/it.ts (brief : node scripts/imposteur-clues-brief.mjs it 1). */
export const IMPOSTEUR_CLUES_IT_LOT_01: Record<string, ImposteurClueSet> = {
  'spiaggia|piscina': {
    a: ['estate', 'costume', 'ombrellone', 'sabbia', 'onde', 'conchiglie', 'bagnasciuga'],
    b: ['estate', 'costume', 'cuffia', 'trampolino', 'vasca', 'corsie', 'cloro'],
  },
  'caffè|tè': {
    a: ['tazza', 'zucchero', 'bar', 'chicchi', 'tostatura', 'espresso', 'moka'],
    b: ['tazza', 'zucchero', 'pomeriggio', 'biscotti', 'bustina', 'foglie', 'earl grey'],
  },
  'birra|sidro': {
    a: ['fermentata', 'bottiglia', 'boccale', 'schiuma', 'spina', 'malto', 'luppolo'],
    b: ['fermentata', 'bottiglia', 'dolciastro', 'frutteto', 'torchio', 'mele'],
  },
  'vino rosso|vino bianco': {
    a: ['uva', 'calice', 'bistecca', 'temperatura ambiente', 'decanter', 'tannini', 'chianti'],
    b: ['uva', 'calice', 'aperitivo', 'pesce', 'secchiello', 'vermentino'],
  },
  'mojito|piña colada': {
    a: ['cocktail', 'rum', 'cubano', 'ghiaccio tritato', 'lime', 'zucchero di canna', 'menta'],
    b: ['cocktail', 'rum', 'tropicale', 'frullatore', 'cremoso', 'cocco', 'ananas'],
  },
  'vodka|tequila': {
    a: ['superalcolico', 'shot', 'trasparente', 'freezer', 'patate', 'moscow mule', 'russa'],
    b: ['superalcolico', 'shot', 'sale e limone', 'sombrero', 'margarita', 'messicana', 'agave'],
  },
  'champagne|prosecco': {
    a: ['bollicine', 'brindisi', 'flûte', 'lusso', 'podio', 'francese'],
    b: ['bollicine', 'brindisi', 'aperitivo', 'spritz', 'bellini', 'vino veneto'],
  },
  'pizza|focaccia': {
    a: ['forno', 'impasto', 'spicchi', 'mozzarella', 'pomodoro', 'napoletana', 'margherita'],
    b: ['forno', 'impasto', 'teglia', 'olio', 'rosmarino', 'sale grosso', 'genovese'],
  },
  'hamburger|kebab': {
    a: ['carne', 'panino', 'patatine', 'bacon', 'sottiletta', 'sesamo', 'americano'],
    b: ['carne', 'panino', 'dopo la discoteca', 'cipolla', 'salsa yogurt', 'spiedo girevole', 'turco'],
  },
  'patatine fritte|patate al forno': {
    a: ['contorno', 'sale', 'croccanti', 'bastoncini', 'ketchup', 'olio bollente', 'friggitrice'],
    b: ['contorno', 'sale', 'pranzo della domenica', 'arrosto', 'rosmarino', 'spicchi', 'teglia'],
  },
  'cornetto|saccottino': {
    a: ['colazione', 'bar', 'cappuccino', 'vuoto o pieno', 'marmellata', 'crema', 'mezzaluna'],
    b: ['colazione', 'bar', 'sfoglia', 'merendina', 'quadrato', 'cioccolato', 'pain au chocolat'],
  },
  'crêpe|waffle': {
    a: ['nutella', 'zucchero a velo', 'padella', 'sottile', 'piegata in quattro', 'francese'],
    b: ['nutella', 'zucchero a velo', 'croccante', 'piastra', 'quadretti', 'belga'],
  },
  'raclette|fonduta': {
    a: ['montagna', 'formaggio fuso', 'baita', 'patate lesse', 'cetriolini', 'raschiare', 'padellini'],
    b: ['montagna', 'formaggio fuso', 'pentolino', 'pane', 'forchette lunghe', 'fontina', 'valdostana'],
  },
  'sushi|poke bowl': {
    a: ['pesce crudo', 'riso', 'bacchette', 'salsa di soia', 'wasabi', 'giapponese', 'nigiri'],
    b: ['pesce crudo', 'riso', 'avocado', 'mango', 'edamame', 'ingredienti a scelta', 'hawaiano'],
  },
  'pasta|riso': {
    a: ['carboidrati', 'pentola', 'sugo', 'parmigiano', 'al dente', 'carbonara', 'spaghetti'],
    b: ['carboidrati', 'pentola', 'chicchi', 'paella', 'arancini', 'risaia', 'carnaroli'],
  },
  'ketchup|maionese': {
    a: ['salsa', 'patatine', 'hot dog', 'agrodolce', 'rosso', 'pomodoro'],
    b: ['salsa', 'patatine', 'tramezzino', 'insalata russa', 'vitello tonnato', "tuorlo d'uovo"],
  },
  'patatine|noccioline': {
    a: ['aperitivo', 'salato', 'busta', 'croccanti', 'dita unte', 'paprika', 'fettine fritte'],
    b: ['aperitivo', 'salato', 'ciotolina', 'allergia', 'guscio', 'elefante', "burro d'arachidi"],
  },
  'gelato|sorbetto': {
    a: ['freddo', 'estate', 'cono', 'gusti', 'panna', 'stracciatella', 'fior di latte'],
    b: ['freddo', 'estate', 'frutta', 'limone', 'fine pasto', 'senza latte', 'sgroppino'],
  },
  'cioccolato|caramello': {
    a: ['dolce', 'budino', 'tavoletta', 'fondente', 'gianduia', 'cacao'],
    b: ['dolce', 'budino', 'appiccicoso', 'ambrato', 'toffee', 'mou', 'zucchero fuso'],
  },
  'baguette|brioche': {
    a: ['francese', 'fornaio', 'pane', 'crosta croccante', 'lunga e stretta', 'sotto il braccio'],
    b: ['francese', 'fornaio', 'dolce', 'burro', 'soffice', 'granita', 'col tuppo'],
  },
  'tagliere di formaggi|salumi': {
    a: ['aperitivo', 'vino', 'miele', 'latte', 'crosta', 'gorgonzola', 'pecorino'],
    b: ['aperitivo', 'vino', 'fette sottili', 'affettatrice', 'maiale', 'prosciutto crudo', 'mortadella'],
  },
  'ostrica|cozza': {
    a: ['mare', 'guscio', 'lusso', 'limone', 'cruda', 'champagne', 'perla'],
    b: ['mare', 'guscio', 'nera', 'scoglio', 'pentolone', 'sauté', 'impepata'],
  },
  'barbecue|piastra': {
    a: ['carne', 'verdure', 'ferragosto', 'giardino', 'salsiccia', 'fumo', 'carbonella'],
    b: ['carne', 'verdure', 'fornello', 'elettrica', 'ghisa', 'piadina', 'superficie liscia'],
  },
}
