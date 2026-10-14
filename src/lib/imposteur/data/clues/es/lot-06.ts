// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from '../index'

/** es, lot 06 : paires 116 à 138 de data/es.ts (brief : node scripts/imposteur-clues-brief.mjs es 6). */
export const IMPOSTEUR_CLUES_ES_LOT_06: Record<string, ImposteurClueSet> = {
  'palomitas|algodón de azúcar': {
    a: ['feria', 'esponjoso', 'mantequilla', 'cubo', 'cine', 'maíz'],
    b: ['feria', 'esponjoso', 'pegajoso', 'palito', 'se deshace', 'nube rosa'],
  },
  'smoothie|batido': {
    a: ['pajita', 'licuadora', 'fruta', 'verde', 'detox', 'espinacas'],
    b: ['pajita', 'licuadora', 'fresa', 'leche', 'cacao', 'helado'],
  },
  'miel|mermelada': {
    a: ['tarro', 'tostada', 'pegajoso', 'dorado', 'colmena', 'abeja'],
    b: ['tarro', 'tostada', 'trozos', 'fresa', 'melocotón', 'fruta cocida'],
  },
  'escape room|láser tag': {
    a: ['equipo', 'cumpleaños', 'pistas', 'candado', 'acertijos', 'encerrados'],
    b: ['equipo', 'cumpleaños', 'oscuridad', 'chaleco', 'disparos', 'pistola de luz'],
  },
  'parque de atracciones|feria': {
    a: ['noria', 'tiovivo', 'colas largas', 'pase anual', 'caída libre', 'montaña rusa'],
    b: ['noria', 'tiovivo', 'tómbola', 'churros', 'fiestas del pueblo', 'casetas'],
  },
  'zoo|acuario': {
    a: ['animales', 'entrada', 'jaulas', 'leones', 'elefantes', 'jirafas'],
    b: ['animales', 'entrada', 'cristal', 'túnel', 'medusas', 'tiburones'],
  },
  'museo|biblioteca': {
    a: ['silencio', 'cultura', 'visita guiada', 'vitrinas', 'esculturas', 'cuadros'],
    b: ['silencio', 'cultura', 'estanterías', 'carné', 'préstamo', 'libros'],
  },
  'tienda de campaña|caravana': {
    a: ['camping', 'vacaciones', 'saco de dormir', 'montar', 'suelo duro', 'piquetas'],
    b: ['camping', 'vacaciones', 'carretera', 'remolque', 'enganche', 'casa con ruedas'],
  },
  'jacuzzi|sauna': {
    a: ['spa', 'toalla', 'agua caliente', 'bañador', 'chorros', 'burbujas'],
    b: ['spa', 'toalla', 'sudar', 'madera', 'calor seco', 'piedras calientes'],
  },
  'tobogán|columpio': {
    a: ['parque', 'niños', 'escalera', 'bajar', 'rampa', 'deslizarse'],
    b: ['parque', 'niños', 'asiento', 'cadenas', 'empujar', 'balancearse'],
  },
  'cama elástica|castillo hinchable': {
    a: ['saltar', 'descalzo', 'jardín', 'voltereta', 'red protectora', 'muelles'],
    b: ['saltar', 'descalzo', 'cumpleaños', 'plástico', 'torres', 'se desinfla'],
  },
  'monopatín|patines': {
    a: ['ruedas', 'casco', 'rampa', 'trucos', 'ollie', 'tabla'],
    b: ['ruedas', 'casco', 'rodilleras', 'pista', 'cordones', 'botas con ruedas'],
  },
  'kayak|hidropedal': {
    a: ['agua', 'playa', 'chaleco', 'río', 'remar', 'pala doble'],
    b: ['agua', 'playa', 'alquiler por horas', 'dos asientos', 'piernas', 'con tobogán'],
  },
  'velero|moto de agua': {
    a: ['mar', 'puerto', 'timón', 'regata', 'viento', 'mástil'],
    b: ['mar', 'puerto', 'gasolina', 'ruido', 'velocidad', 'manillar'],
  },
  'escalada|tirolina': {
    a: ['arnés', 'altura', 'cuerda', 'pared', 'magnesio', 'pies de gato'],
    b: ['arnés', 'altura', 'gritar', 'casco', 'polea', 'cable de acero'],
  },
  'maratón|triatlón': {
    a: ['dorsal', 'meta', 'correr', 'asfalto', 'avituallamiento', '42 kilómetros'],
    b: ['dorsal', 'meta', 'transición', 'neopreno', 'bicicleta', 'tres deportes'],
  },
  'boxeo|judo': {
    a: ['combate', 'árbitro', 'ring', 'asalto', 'gancho', 'guantes'],
    b: ['combate', 'árbitro', 'tatami', 'cinturón negro', 'kimono', 'ippon'],
  },
  'mago|payaso': {
    a: ['espectáculo', 'cumpleaños', 'cartas', 'varita', 'chistera', 'abracadabra'],
    b: ['espectáculo', 'cumpleaños', 'circo', 'maquillaje', 'zapatones', 'nariz roja'],
  },
  'pirata|vikingo': {
    a: ['barco', 'saqueo', 'tesoro', 'mapa', 'loro', 'pata de palo'],
    b: ['barco', 'saqueo', 'barba', 'hacha', 'nórdico', 'casco con cuernos'],
  },
  'zombi|vampiro': {
    a: ['no muerto', 'noche', 'gruñidos', 'andar lento', 'apocalipsis', 'cerebros'],
    b: ['no muerto', 'noche', 'capa', 'ataúd', 'ajo', 'colmillos'],
  },
  'bruja|hada': {
    a: ['magia', 'cuento', 'gato negro', 'verruga', 'caldero', 'escoba'],
    b: ['magia', 'cuento', 'alas', 'varita', 'purpurina', 'madrina'],
  },
  'unicornio|dragón': {
    a: ['leyenda', 'fantasía', 'blanco', 'arcoíris', 'caballo', 'cuerno'],
    b: ['leyenda', 'fantasía', 'cueva', 'escamas', 'alas', 'escupe fuego'],
  },
  'castillo|cabaña': {
    a: ['chimenea', 'lejos de todo', 'piedra', 'torres', 'foso', 'puente levadizo'],
    b: ['chimenea', 'lejos de todo', 'bosque', 'leña', 'troncos', 'casita de madera'],
  },
}
