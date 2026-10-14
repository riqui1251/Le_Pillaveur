// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from '../index'

/** es, lot 03 : paires 47 à 69 de data/es.ts (brief : node scripts/imposteur-clues-brief.mjs es 3). */
export const IMPOSTEUR_CLUES_ES_LOT_03: Record<string, ImposteurClueSet> = {
  'billar|dardos': {
    a: ['bar', 'puntería', 'mesa verde', 'tiza', 'taco', 'troneras', 'bola ocho'],
    b: ['bar', 'puntería', 'pared', 'tres tiros', 'punta afilada', 'diana', 'triple veinte'],
  },
  'póker|mus': {
    a: ['cartas', 'farol', 'fichas', 'casino', 'cara de palo', 'all in', 'escalera de color'],
    b: ['cartas', 'farol', 'por parejas', 'señas', 'baraja española', 'piedras', 'órdago'],
  },
  'ajedrez|damas': {
    a: ['tablero', 'blancas y negras', 'torre', 'caballo', 'alfil', 'enroque', 'jaque mate'],
    b: ['tablero', 'blancas y negras', 'fichas redondas', 'solo en diagonal', 'coronar', 'soplar', 'comer saltando'],
  },
  'yoga|pilates': {
    a: ['esterilla', 'respiración', 'flexibilidad', 'meditar', 'mantra', 'saludo al sol', 'namasté'],
    b: ['esterilla', 'respiración', 'abdominales', 'suelo pélvico', 'aro', 'core', 'máquina reformer'],
  },
  'pesas|crossfit': {
    a: ['gimnasio', 'músculos', 'mancuernas', 'espejo', 'banco', 'bíceps', 'culturista'],
    b: ['gimnasio', 'músculos', 'en grupo', 'neumático', 'comba', 'box', 'burpees'],
  },
  'footing|senderismo': {
    a: ['zapatillas', 'aire libre', 'por el parque', 'auriculares', 'sudar la camiseta', 'cronómetro', 'ritmo por km'],
    b: ['zapatillas', 'aire libre', 'montaña', 'mochila', 'bastones', 'cantimplora', 'ruta marcada'],
  },
  'buceo|esnórquel': {
    a: ['mar', 'peces', 'neopreno', 'profundidad', 'botella de aire', 'regulador', 'descompresión'],
    b: ['mar', 'peces', 'en la orilla', 'aletas', 'flotar', 'boca abajo', 'tubo'],
  },
  'pesca|caza': {
    a: ['madrugar', 'paciencia', 'río', 'barca', 'cebo', 'lombrices', 'anzuelo'],
    b: ['madrugar', 'paciencia', 'monte', 'camuflaje', 'perros', 'jabalí', 'escopeta'],
  },
  'guitarra|piano': {
    a: ['música', 'acordes', 'cuerdas', 'fogata', 'flamenco', 'púa', 'trastes', 'cejilla'],
    b: ['música', 'acordes', 'conservatorio', 'banqueta', 'pedal', 'de cola', 'teclas'],
  },
  'batería|DJ': {
    a: ['ritmo', 'escenario', 'golpes', 'platillos', 'caja', 'bombo', 'baquetas'],
    b: ['ritmo', 'escenario', 'discoteca', 'auriculares', 'cabina', 'vinilos', 'pinchar'],
  },
  'rap|rock': {
    a: ['música', 'concierto', 'gorra', 'bases', 'rimas', 'freestyle', 'batalla de gallos'],
    b: ['música', 'concierto', 'melena', 'chupa de cuero', 'batería', 'guitarra eléctrica', 'cuernos con la mano'],
  },
  'techno|reggae': {
    a: ['música', 'bailar', 'after', 'sintetizador', 'estroboscopio', 'nave industrial', 'rave'],
    b: ['música', 'bailar', 'buen rollo', 'playa', 'rojo amarillo y verde', 'jamaicano', 'rastas'],
  },
  'gato|perro': {
    a: ['mascota', 'pelo', 'bigotes', 'ovillo de lana', 'arenero', 'ronronear', 'miau'],
    b: ['mascota', 'pelo', 'paseo', 'correa', 'hueso', 'mover la cola', 'guau'],
  },
  'hámster|conejo': {
    a: ['jaula', 'mascota', 'serrín', 'pipas', 'nocturno', 'mofletes', 'rueda'],
    b: ['jaula', 'mascota', 'saltar', 'madriguera', 'zanahoria', 'rabito blanco', 'orejas largas'],
  },
  'loro|canario': {
    a: ['pájaro', 'jaula', 'plumas de colores', 'trópico', 'pico curvo', 'pirata', 'repetir palabras'],
    b: ['pájaro', 'jaula', 'alpiste', 'cantar', 'mina de carbón', 'amarillo'],
  },
  'tiburón|delfín': {
    a: ['mar', 'aleta', 'depredador', 'sangre', 'martillo', 'filas de dientes'],
    b: ['mar', 'aleta', 'inteligente', 'acuario', 'saltos', 'chasquidos', 'nariz de botella'],
  },
  'león|tigre': {
    a: ['felino', 'garras', 'sabana', 'manada', 'rugido', 'melena', 'rey de la selva'],
    b: ['felino', 'garras', 'solitario', 'jungla', 'naranja', 'de Bengala', 'rayas'],
  },
  'oso|lobo': {
    a: ['bosque', 'montaña', 'cueva', 'pescar salmón', 'miel', 'pardo', 'hibernar'],
    b: ['bosque', 'montaña', 'manada', 'colmillos', 'ovejas', 'luna llena', 'aullar'],
  },
  'abeja|avispa': {
    a: ['insecto', 'picadura', 'zumbido', 'flores', 'polen', 'colmena', 'miel'],
    b: ['insecto', 'picadura', 'verano', 'terraza', 'agresiva', 'cintura fina', 'nido de papel'],
  },
  'mariposa|libélula': {
    a: ['insecto', 'alas', 'primavera', 'flores', 'colores', 'capullo', 'oruga'],
    b: ['insecto', 'alas', 'verano', 'estanque', 'ojos enormes', 'cuerpo alargado', 'helicóptero'],
  },
  'médico|enfermero': {
    a: ['hospital', 'bata', 'consulta', 'estetoscopio', 'diagnóstico', 'receta', 'letra ilegible'],
    b: ['hospital', 'bata', 'turnos', 'curas', 'vacunas', 'sacar sangre', 'poner una vía'],
  },
  'bombero|policía': {
    a: ['uniforme', 'sirena', 'casco', 'escalera', 'calendario', 'manguera', 'incendio'],
    b: ['uniforme', 'sirena', 'patrulla', 'multa', 'placa', 'comisaría', 'esposas'],
  },
  'profesor|monitor': {
    a: ['enseñar', 'grupo', 'aula', 'pizarra', 'deberes', 'corregir exámenes', 'poner notas'],
    b: ['enseñar', 'grupo', 'actividades', 'silbato', 'excursión', 'tiempo libre', 'campamento'],
  },
}
