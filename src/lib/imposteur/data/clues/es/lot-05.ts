// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from '../index'

/** es, lot 05 : paires 93 à 115 de data/es.ts (brief : node scripts/imposteur-clues-brief.mjs es 5). */
export const IMPOSTEUR_CLUES_ES_LOT_05: Record<string, ImposteurClueSet> = {
  'ducha|bañera': {
    a: ['jabón', 'toalla', 'de pie', 'cantar', 'mampara', 'alcachofa'],
    b: ['jabón', 'toalla', 'relax', 'espuma', 'tumbado', 'tapón', 'patito de goma'],
  },
  'nevera|congelador': {
    a: ['cocina', 'frío', 'puerta', 'leche', 'imanes', 'cajón de verduras'],
    b: ['cocina', 'frío', 'helados', 'cubitos', 'bajo cero', 'escarcha'],
  },
  'microondas|horno': {
    a: ['cocina', 'calentar', 'táper', 'palomitas', 'pitido', 'plato giratorio'],
    b: ['cocina', 'calentar', 'bandeja', 'asado', 'pizza casera', 'gratinar', 'precalentar'],
  },
  'tele|proyector': {
    a: ['películas', 'salón', 'sofá', 'mando', 'anuncios', 'zapping'],
    b: ['películas', 'salón', 'a oscuras', 'clase', 'pared blanca', 'diapositivas'],
  },
  'consola|PC gamer': {
    a: ['videojuegos', 'partida', 'sofá', 'mando', 'Switch', 'PlayStation'],
    b: ['videojuegos', 'partida', 'teclado', 'ratón', 'luces RGB', 'tarjeta gráfica', 'Steam'],
  },
  'Instagram|TikTok': {
    a: ['influencers', 'scroll', 'fotos', 'filtros', 'postureo', 'Zuckerberg'],
    b: ['influencers', 'scroll', 'vídeos cortos', 'sonidos', 'trends', 'bailes virales'],
  },
  'WhatsApp|Snapchat': {
    a: ['mensajes', 'móvil', 'audios', 'estados', 'grupo de la familia', 'doble check azul'],
    b: ['mensajes', 'móvil', 'filtros de perrito', 'fotos que desaparecen', 'rachas', 'fantasma amarillo'],
  },
  'YouTube|Netflix': {
    a: ['plataforma', 'pantalla', 'gratis', 'anuncios', 'tutoriales', 'suscríbete'],
    b: ['plataforma', 'pantalla', 'series', 'maratón', 'cuenta compartida', 'La casa de papel', 'tudum'],
  },
  'selfi|story': {
    a: ['móvil', 'redes', 'morritos', 'ángulo', 'cámara frontal', 'brazo estirado'],
    b: ['móvil', 'redes', 'subir', 'stickers', 'encuesta', 'quién la ha visto', '24 horas'],
  },
  'tacos|burrito': {
    a: ['mexicano', 'tortilla', 'cilantro', 'lima', 'doblados', 'al pastor'],
    b: ['mexicano', 'tortilla', 'frijoles', 'arroz', 'enrollado', 'papel de aluminio'],
  },
  'limonada|té helado': {
    a: ['verano', 'hielo', 'jarra', 'azúcar', 'cítricos', 'exprimidor'],
    b: ['verano', 'hielo', 'lata', 'melocotón', 'bolsitas', 'teína'],
  },
  'espresso|capuchino': {
    a: ['cafetera', 'desayuno', 'tacita', 'intenso', 'de un sorbo', 'sin leche'],
    b: ['cafetera', 'desayuno', 'taza grande', 'leche', 'espuma', 'canela', 'cacao espolvoreado'],
  },
  'gin-tonic|spritz': {
    a: ['copa de balón', 'terraza', 'pepino', 'piel de limón', 'botánicos', 'enebro'],
    b: ['copa de balón', 'terraza', 'aperitivo', 'italiano', 'rodaja de naranja', 'prosecco'],
  },
  'ron|whisky': {
    a: ['barrica', 'con cola', 'piratas', 'caribeño', 'caña de azúcar', 'mojito'],
    b: ['barrica', 'con cola', 'irlandés', 'malta', 'turba', 'escocés'],
  },
  'sangría|ponche': {
    a: ['fruta troceada', 'fiesta', 'verano', 'guiris', 'jarra', 'vino tinto'],
    b: ['fruta troceada', 'fiesta', 'cuenco grande', 'cucharón', 'navideño', 'canela', 'caliente'],
  },
  'perrito caliente|sándwich mixto': {
    a: ['pan', 'puesto callejero', 'kétchup', 'mostaza', 'pan alargado', 'salchicha'],
    b: ['pan', 'cafetería', 'tostado', 'queso fundido', 'pan de molde', 'jamón york'],
  },
  'nuggets|alitas de pollo': {
    a: ['salsa barbacoa', 'con los dedos', 'rebozado', 'trocitos', 'menú infantil', 'forma de dinosaurio'],
    b: ['salsa barbacoa', 'con los dedos', 'servilletas', 'picantes', 'cubo de KFC', 'huesos'],
  },
  'ramen|fideos salteados': {
    a: ['palillos', 'asiático', 'japonés', 'cuenco hondo', 'huevo marinado', 'sorber', 'caldo'],
    b: ['palillos', 'asiático', 'verduras', 'salsa de soja', 'para llevar', 'pad thai', 'wok'],
  },
  'paella|risotto': {
    a: ['arroz', 'domingo', 'azafrán', 'marisco', 'valenciana', 'socarrat'],
    b: ['arroz', 'cremoso', 'remover', 'mantequilla', 'parmesano', 'italiano'],
  },
  'cuscús|tajín': {
    a: ['marroquí', 'especias', 'garbanzos', 'pasas', 'granitos', 'sémola'],
    b: ['marroquí', 'especias', 'cordero', 'cocción lenta', 'olla de barro', 'tapa cónica'],
  },
  'tortilla francesa|huevos revueltos': {
    a: ['sartén', 'batir', 'cena rápida', 'bocadillo', 'redonda', 'doblada'],
    b: ['sartén', 'batir', 'desayuno', 'tostadas', 'beicon', 'remover sin parar'],
  },
  'tiramisú|panna cotta': {
    a: ['postre', 'italiano', 'café', 'cacao en polvo', 'mascarpone', 'soletillas'],
    b: ['postre', 'italiano', 'nata', 'frutos rojos', 'tiembla', 'flan blanco'],
  },
  'dónut|muffin': {
    a: ['bollería', 'merienda', 'glaseado', 'frito', 'fideos de colores', 'agujero'],
    b: ['bollería', 'merienda', 'horno', 'arándanos', 'pepitas de chocolate', 'cápsula de papel'],
  },
}
