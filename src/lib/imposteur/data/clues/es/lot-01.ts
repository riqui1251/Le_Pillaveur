// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from '../index'

/** es, lot 01 : paires 1 à 23 de data/es.ts (brief : node scripts/imposteur-clues-brief.mjs es 1). */
export const IMPOSTEUR_CLUES_ES_LOT_01: Record<string, ImposteurClueSet> = {
  'playa|piscina': {
    a: ['verano', 'toalla', 'sombrilla', 'chiringuito', 'arena', 'olas', 'marea'],
    b: ['verano', 'toalla', 'socorrista', 'bordillo', 'gorro', 'trampolín', 'cloro'],
  },
  'café|té': {
    a: ['taza', 'desayuno', 'granos', 'molinillo', 'barista', 'cortado', 'expreso'],
    b: ['taza', 'desayuno', 'bolsita', 'hojas', 'ingleses', 'a las cinco', 'matcha'],
  },
  'cerveza|sidra': {
    a: ['botella', 'terraza', 'tercio', 'caña', 'espuma', 'lúpulo'],
    b: ['botella', 'fermentada', 'brazo en alto', 'culín', 'escanciar', 'asturiana', 'manzana'],
  },
  'vino tinto|vino blanco': {
    a: ['copa', 'bodega', 'carne roja', 'mancha', 'taninos', 'rioja', 'tempranillo'],
    b: ['copa', 'bodega', 'pescado', 'marisco', 'cubitera', 'verdejo', 'albariño'],
  },
  'mojito|piña colada': {
    a: ['cóctel', 'ron', 'hielo picado', 'azúcar moreno', 'lima', 'hierbabuena'],
    b: ['cóctel', 'ron', 'sombrillita', 'tropical', 'cremoso', 'coco'],
  },
  'vodka|tequila': {
    a: ['chupito', 'transparente', 'con naranja', 'caipiroska', 'patata', 'ruso'],
    b: ['chupito', 'sal', 'limón', 'margarita', 'agave', 'mexicano'],
  },
  'champán|cava': {
    a: ['burbujas', 'brindis', 'lujo', 'yate', 'podio', 'francés'],
    b: ['burbujas', 'brindis', 'nochevieja', 'brut nature', 'barato', 'catalán', 'anuncio de Freixenet'],
  },
  'pizza|coca de recapte': {
    a: ['masa', 'horno', 'repartidor', 'italiana', 'mozzarella', 'margarita'],
    b: ['masa', 'horno', 'rectangular', 'sin queso', 'verduras asadas', 'catalana', 'escalivada'],
  },
  'hamburguesa|kebab': {
    a: ['comida rápida', 'salsa', 'pepinillo', 'ternera', 'cheddar', 'pan con sésamo'],
    b: ['comida rápida', 'salsa', 'de madrugada', 'pan de pita', 'salsa de yogur', 'carne que gira', 'turco'],
  },
  'patatas fritas|patatas bravas': {
    a: ['aceite', 'ración', 'freidora', 'guarnición', 'kétchup', 'en bastones'],
    b: ['aceite', 'ración', 'tapa', 'taberna', 'alioli', 'pimentón', 'salsa picante'],
  },
  'cruasán|napolitana': {
    a: ['bollería', 'hojaldre', 'mantequilla', 'francés', 'forma curva', 'media luna'],
    b: ['bollería', 'hojaldre', 'merienda', 'rectangular', 'crema pastelera', 'de chocolate'],
  },
  'crepe|gofre': {
    a: ['merienda', 'chocolate', 'sartén', 'enrollada', 'fina', 'francesa'],
    b: ['merienda', 'chocolate', 'feria', 'nata', 'cuadraditos', 'belga'],
  },
  'raclette|fondue': {
    a: ['queso fundido', 'suizo', 'invierno', 'patatas cocidas', 'rascar', 'sartencitas'],
    b: ['queso fundido', 'suizo', 'olla', 'mojar pan', 'de chocolate', 'tenedor largo'],
  },
  'sushi|poke bowl': {
    a: ['arroz', 'pescado crudo', 'palillos', 'japonés', 'rollitos', 'wasabi', 'maki'],
    b: ['arroz', 'pescado crudo', 'saludable', 'aguacate', 'mango', 'edamame', 'hawaiano'],
  },
  'pasta|arroz': {
    a: ['hervir', 'plato', 'tomate', 'italiano', 'parmesano', 'al dente', 'espaguetis'],
    b: ['hervir', 'plato', 'grano', 'domingo', 'tres delicias', 'socarrat', 'paella'],
  },
  'kétchup|mayonesa': {
    a: ['salsa', 'bote', 'hamburguesa', 'rojo', 'dulce', 'tomate'],
    b: ['salsa', 'bote', 'blanca', 'aceite', 'huevo', 'ensaladilla'],
  },
  'patatas de bolsa|cacahuetes': {
    a: ['aperitivo', 'salado', 'crujientes', 'dedos grasientos', 'sabor jamón', 'láminas finas'],
    b: ['aperitivo', 'salado', 'frutos secos', 'cáscara', 'alergia', 'elefante'],
  },
  'helado|sorbete': {
    a: ['frío', 'postre', 'bola', 'tarrina', 'nata', 'cucurucho'],
    b: ['frío', 'postre', 'copa', 'limón', 'boda', 'sin leche'],
  },
  'chocolate|caramelo': {
    a: ['dulce', 'envoltorio', 'tableta', 'onza', 'con churros', 'cacao'],
    b: ['dulce', 'envoltorio', 'pegajoso', 'piñata', 'cabalgata', 'flan', 'azúcar quemado'],
  },
  'baguette|brioche': {
    a: ['pan', 'panadería', 'corteza', 'larga', 'bocadillo', 'bajo el brazo'],
    b: ['pan', 'panadería', 'desayuno', 'esponjoso', 'dulce', 'mantequilla'],
  },
  'tabla de quesos|embutidos': {
    a: ['picoteo', 'vino', 'cuchillo', 'uvas', 'membrillo', 'roquefort', 'manchego'],
    b: ['picoteo', 'vino', 'lonchas', 'cerdo', 'fuet', 'salchichón', 'chorizo'],
  },
  'ostra|mejillón': {
    a: ['marisco', 'concha', 'limón', 'cruda', 'lujo', 'perla'],
    b: ['marisco', 'concha', 'negro', 'al vapor', 'en escabeche', 'batea', 'tigre'],
  },
  'barbacoa|plancha': {
    a: ['carne', 'jardín', 'al aire libre', 'humo', 'brasas', 'carbón'],
    b: ['carne', 'cocina', 'aceite', 'gambas', 'sepia', 'chapa lisa'],
  },
}
