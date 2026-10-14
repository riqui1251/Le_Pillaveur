// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from '../index'

/** es, lot 07 : paires 139 à 161 de data/es.ts (brief : node scripts/imposteur-clues-brief.mjs es 7). */
export const IMPOSTEUR_CLUES_ES_LOT_07: Record<string, ImposteurClueSet> = {
  'cohete|satélite': {
    a: ['espacio', 'lanzamiento', 'combustible', 'humo', 'despegue', 'cuenta atrás'],
    b: ['espacio', 'lanzamiento', 'órbita', 'señal', 'antena', 'gps', 'parabólica'],
  },
  'tatuaje|piercing': {
    a: ['aguja', 'piel', 'tinta', 'dibujo', 'para siempre', 'tribal', 'manga completa'],
    b: ['aguja', 'piel', 'aro', 'agujero', 'ceja', 'lengua', 'ombligo'],
  },
  'bigote|barba': {
    a: ['pelo', 'cara', 'labio', 'bajo la nariz', 'puntas retorcidas', 'el de Dalí'],
    b: ['pelo', 'cara', 'patillas', 'hípster', 'leñador', 'mentón', 'perilla'],
  },
  'siesta|dormir hasta tarde': {
    a: ['descanso', 'sueño', 'sofá', 'calor', 'sobremesa', 'veinte minutos', 'después de comer', 'pijama y orinal'],
    b: ['descanso', 'sueño', 'domingo', 'resaca', 'persianas bajadas', 'sin despertador', 'desayunar a mediodía'],
  },
  'pijama|albornoz': {
    a: ['en casa', 'zapatillas', 'noche', 'franela', 'botones', 'pantalón largo', 'para dormir'],
    b: ['en casa', 'zapatillas', 'de rizo', 'cinturón', 'spa', 'hotel de lujo', 'tras la ducha'],
  },
  'maleta|mochila': {
    a: ['viaje', 'equipaje', 'ruedas', 'candado', 'asa extensible', 'bodega del avión', 'facturar'],
    b: ['viaje', 'equipaje', 'cremalleras', 'excursión', 'senderismo', 'cole', 'dos tirantes', 'a la espalda'],
  },
  'Marvel|DC': {
    a: ['cómics', 'superhéroes', 'Disney', 'Capitán América', 'Lobezno', 'Thanos', 'Los Vengadores', 'Stan Lee'],
    b: ['cómics', 'superhéroes', 'Warner', 'Gotham', 'Wonder Woman', 'Aquaman', 'el Joker', 'Linterna Verde'],
  },
  'Batman|Superman': {
    a: ['superhéroe', 'capa', 'millonario', 'Gotham', 'el Joker', 'Robin', 'murciélago', 'Bruce Wayne'],
    b: ['superhéroe', 'capa', 'periodista', 'calzoncillos por fuera', 'kriptonita', 'Lois Lane', 'Krypton', 'Clark Kent'],
  },
  'Star Wars|Star Trek': {
    a: ['espacio', 'naves', 'la Fuerza', 'jedis', 'espada láser', 'Halcón Milenario', 'Darth Vader', 'soy tu padre'],
    b: ['espacio', 'naves', 'teletransporte', 'Enterprise', 'orejas puntiagudas', 'capitán Kirk', 'saludo vulcano', 'Spock'],
  },
  'Harry Potter|El Señor de los Anillos': {
    a: ['magia', 'libros', 'colegio', 'varita', 'lechuza', 'Hogwarts', 'Voldemort', 'Quidditch'],
    b: ['magia', 'libros', 'elfos', 'enanos', 'hobbits', 'Mordor', 'Gandalf', 'mi tesoro'],
  },
  'PlayStation|Xbox': {
    a: ['consola', 'mando', 'Gran Turismo', 'God of War', 'Kratos', 'cuadrado y triángulo', 'Sony'],
    b: ['consola', 'mando', 'color verde', 'Game Pass', 'Halo', 'Master Chief', 'Bill Gates', 'Microsoft'],
  },
  'iPhone|Samsung': {
    a: ['móvil', 'cámara', 'Siri', 'AirDrop', 'iOS', 'manzana mordida', 'Steve Jobs'],
    b: ['móvil', 'cámara', 'Android', 'televisores', 'neveras', 'Corea del Sur', 'Galaxy'],
  },
  'Uber|Cabify': {
    a: ['coche', 'app', 'conductor', 'Estados Unidos', 'San Francisco', 'logo negro', 'también reparte comida'],
    b: ['coche', 'app', 'VTC', 'española', 'Madrid', 'color morado'],
  },
  'Glovo|Uber Eats': {
    a: ['repartidor', 'app', 'bicis', 'española', 'Barcelona', 'lo que sea', 'mochila amarilla'],
    b: ['repartidor', 'app', 'comida a domicilio', 'Estados Unidos', 'verde y negro', 'mochila verde'],
  },
  'Spotify|Apple Music': {
    a: ['canciones', 'playlists', 'podcasts', 'logo verde', 'Suecia', 'gratis con anuncios', 'Wrapped'],
    b: ['canciones', 'playlists', 'sin plan gratis', 'AirPods', 'iPhone', 'iTunes'],
  },
  'Facebook|LinkedIn': {
    a: ['red social', 'perfil', 'muro', 'me gusta', 'cumpleaños', 'gente mayor', 'Zuckerberg'],
    b: ['red social', 'perfil', 'contactos', 'trabajo', 'currículum', 'ofertas de empleo', 'postureo profesional'],
  },
  'lápiz|bolígrafo': {
    a: ['escribir', 'estuche', 'madera', 'grafito', 'mina', 'goma en la punta', 'sacapuntas'],
    b: ['escribir', 'estuche', 'azul', 'clic', 'tapón mordido', 'no se borra', 'tinta'],
  },
  'goma de borrar|corrector': {
    a: ['estuche', 'errores', 'frotar', 'virutas', 'lápiz', 'olor a fresa', 'nata'],
    b: ['estuche', 'errores', 'blanco', 'cinta', 'líquido', 'dejar secar', 'típex'],
  },
  'cuaderno|carpeta': {
    a: ['hojas', 'apuntes', 'espiral', 'cuadrícula', 'tapa dura', 'arrancar una hoja', 'los Rubio'],
    b: ['hojas', 'apuntes', 'anillas', 'archivar', 'separadores', 'fundas de plástico', 'con gomas'],
  },
  'pizarra blanca|pizarra negra': {
    a: ['aula', 'profe', 'oficina', 'reuniones', 'imanes', 'post-its', 'rotuladores'],
    b: ['aula', 'profe', 'polvo', 'borrador', 'colegio antiguo', 'chirrido de uñas', 'tiza'],
  },
  'cartera escolar|bolsa de deporte': {
    a: ['cremallera', 'asa', 'libros', 'estuche', 'ruedas', 'deberes', 'vuelta al cole'],
    b: ['cremallera', 'asa', 'toalla', 'zapatillas', 'chándal', 'gimnasio', 'olor a sudor'],
  },
  'recreo|pausa para comer': {
    a: ['descanso', 'timbre', 'patio', 'bocadillo', 'cromos', 'balón', 'media mañana'],
    b: ['descanso', 'oficina', 'una hora', 'microondas', 'táper', 'menú del día'],
  },
  'jefe|compañero de trabajo': {
    a: ['oficina', 'reuniones', 'despacho propio', 'pedir vacaciones', 'ascensos', 'despidos', 'el que manda'],
    b: ['oficina', 'reuniones', 'máquina de café', 'cotilleos', 'cena de empresa', 'amigo invisible', 'mismo cargo'],
  },
}
