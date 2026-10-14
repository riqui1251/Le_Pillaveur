// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from '../index'

/** es, lot 02 : paires 24 à 46 de data/es.ts (brief : node scripts/imposteur-clues-brief.mjs es 2). */
export const IMPOSTEUR_CLUES_ES_LOT_02: Record<string, ImposteurClueSet> = {
  'pícnic|brunch': {
    a: ['fin de semana', 'comer con amigos', 'al aire libre', 'bocadillos', 'cesta de mimbre', 'hormigas', 'mantel de cuadros'],
    b: ['fin de semana', 'comer con amigos', 'café', 'tostadas', 'a media mañana', 'tortitas', 'huevos Benedict'],
  },
  'discoteca|bar': {
    a: ['copas', 'de noche', 'luces', 'cola para entrar', 'portero', 'pista de baile', 'bola de espejos'],
    b: ['copas', 'de noche', 'camarero', 'terraza', 'taburete', 'caña', 'tapas'],
  },
  'concierto|festival': {
    a: ['escenario', 'entradas', 'gira', 'mecheros en alto', 'telonero', 'bis', 'una sola banda'],
    b: ['escenario', 'entradas', 'verano', 'pulsera', 'cartel', 'tiendas de campaña', 'varios días'],
  },
  'cine|teatro': {
    a: ['butaca', 'taquilla', 'sala oscura', 'tráiler', 'palomitas', 'gafas 3D', 'proyector'],
    b: ['butaca', 'taquilla', 'aplausos', 'función', 'camerino', 'telón', 'apuntador'],
  },
  'karaoke|quiz musical': {
    a: ['canciones', 'en grupo', 'vergüenza', 'micrófono', 'desafinar', 'letra en pantalla'],
    b: ['canciones', 'en grupo', 'equipos', 'puntos', 'pulsador', 'adivinar', 'título y artista'],
  },
  'cumpleaños|inauguración de piso': {
    a: ['fiesta', 'regalo', 'tarta', 'piñata', 'soplar', 'velas', 'tirón de orejas'],
    b: ['fiesta', 'regalo', 'llaves', 'nuevos vecinos', 'cajas', 'enseñar la casa', 'recién mudados'],
  },
  'boda|bautizo': {
    a: ['iglesia', 'familia', 'banquete', 'barra libre', 'ramo', 'anillos', 'novios'],
    b: ['iglesia', 'familia', 'padrinos', 'cura', 'agua bendita', 'faldón', 'bebé'],
  },
  'Navidad|Nochevieja': {
    a: ['familia', 'cena', 'turrón', 'regalos', 'villancicos', 'belén', 'Papá Noel'],
    b: ['familia', 'cena', 'brindis', 'fuegos artificiales', 'cotillón', 'Puerta del Sol', 'doce uvas'],
  },
  'Halloween|Carnaval': {
    a: ['disfraces', 'maquillaje', 'miedo', 'brujas', 'caramelos', 'calabaza', 'truco o trato'],
    b: ['disfraces', 'maquillaje', 'febrero', 'confeti', 'desfile', 'carrozas', 'Cádiz', 'chirigotas'],
  },
  'camping|albergue': {
    a: ['mochila', 'barato', 'naturaleza', 'mosquitos', 'linterna', 'saco de dormir', 'piquetas'],
    b: ['mochila', 'barato', 'desconocidos', 'recepción', 'taquilla', 'habitación compartida', 'literas'],
  },
  'hotel|Airbnb': {
    a: ['reserva', 'vacaciones', 'estrellas', 'desayuno buffet', 'recepción', 'minibar', 'botones'],
    b: ['reserva', 'vacaciones', 'reseñas', 'cocina propia', 'anfitrión', 'piso particular', 'caja de llaves'],
  },
  'avión|tren': {
    a: ['billete', 'maleta', 'azafata', 'control de seguridad', 'aeropuerto', 'despegue', 'turbulencias'],
    b: ['billete', 'maleta', 'estación', 'revisor', 'andén', 'vagón', 'locomotora'],
  },
  'bicicleta|patinete': {
    a: ['manillar', 'casco', 'pinchazo', 'cadena', 'sillín', 'pedales'],
    b: ['manillar', 'casco', 'eléctrico', 'batería', 'acera', 'plataforma', 'empujar con el pie'],
  },
  'moto|scooter': {
    a: ['casco', 'dos ruedas', 'carretera', 'chupa de cuero', 'caballito', 'marchas', 'embrague'],
    b: ['casco', 'dos ruedas', 'ciudad', 'automático', 'ruedas pequeñas', 'hueco bajo el asiento', 'vespa'],
  },
  'taxi|autobús': {
    a: ['conductor', 'parada', 'asiento de atrás', 'carrera', 'levantar la mano', 'luz verde', 'bajada de bandera'],
    b: ['conductor', 'parada', 'línea', 'horario', 'de pie', 'timbre', 'marquesina'],
  },
  'metro|tranvía': {
    a: ['raíles', 'línea', 'hora punta', 'transbordo', 'escaleras mecánicas', 'túnel', 'bajo tierra'],
    b: ['raíles', 'línea', 'eléctrico', 'catenaria', 'campanilla', 'semáforos', 'por la calle'],
  },
  'coche|autocaravana': {
    a: ['volante', 'carretera', 'gasolina', 'atasco', 'aparcar', 'maletero', 'cinco plazas'],
    b: ['volante', 'carretera', 'jubilados', 'área de pernocta', 'cocina', 'cama', 'aguas grises'],
  },
  'esquí|snowboard': {
    a: ['nieve', 'telesilla', 'forfait', 'slalom', 'cuña', 'dos tablas', 'bastones'],
    b: ['nieve', 'telesilla', 'piruetas', 'caerse de culo', 'de lado', 'half-pipe', 'una sola tabla'],
  },
  'surf|paddle surf': {
    a: ['tabla', 'neopreno', 'playa', 'olas grandes', 'parafina', 'invento', 'tubo'],
    b: ['tabla', 'neopreno', 'equilibrio', 'agua tranquila', 'pantano', 'de pie', 'remo largo'],
  },
  'fútbol|rugby': {
    a: ['balón', 'césped', 'portero', 'penalti', 'córner', 'chilena', 'once jugadores'],
    b: ['balón', 'césped', 'barro', 'pase atrás', 'placaje', 'melé', 'ovalado'],
  },
  'tenis|bádminton': {
    a: ['raqueta', 'red', 'saque', 'set', 'juez de silla', 'pelota amarilla', 'tierra batida'],
    b: ['raqueta', 'red', 'polideportivo', 'muñeca', 'sin bote', 'plumas', 'volante'],
  },
  'baloncesto|balonmano': {
    a: ['pabellón', 'bote', 'rebote', 'tapón', 'triple', 'mate', 'canasta'],
    b: ['pabellón', 'bote', 'pivote', 'portero', 'golpe franco', 'siete metros', 'resina'],
  },
  'petanca|bolos': {
    a: ['bola', 'lanzar', 'jubilados', 'parque', 'tierra', 'agacharse', 'bolas metálicas'],
    b: ['bola', 'lanzar', 'pista', 'agujeros', 'zapatos alquilados', 'pleno', 'strike'],
  },
}
