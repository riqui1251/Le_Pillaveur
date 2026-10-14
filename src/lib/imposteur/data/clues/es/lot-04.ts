// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from '../index'

/** es, lot 04 : paires 70 à 92 de data/es.ts (brief : node scripts/imposteur-clues-brief.mjs es 4). */
export const IMPOSTEUR_CLUES_ES_LOT_04: Record<string, ImposteurClueSet> = {
  'camarero|barman': {
    a: ['propina', 'barra', 'terraza', 'mesas', 'libreta', 'comanda', 'bandeja'],
    b: ['propina', 'barra', 'noche', 'copas', 'hielo', 'cócteles', 'coctelera'],
  },
  'panadero|pastelero': {
    a: ['horno', 'harina', 'madrugar', 'levadura', 'masa madre', 'chapata', 'hogaza'],
    b: ['horno', 'harina', 'azúcar', 'nata', 'merengue', 'milhojas', 'tarta de cumpleaños'],
  },
  'peluquero|barbero': {
    a: ['tijeras', 'peine', 'champú', 'secador', 'flequillo', 'tinte', 'mechas'],
    b: ['tijeras', 'peine', 'bigote', 'navaja', 'brocha', 'toalla caliente', 'afeitado'],
  },
  'fontanero|electricista': {
    a: ['averías', 'furgoneta', 'tuberías', 'fugas', 'grifo', 'cisterna', 'desatascador'],
    b: ['averías', 'furgoneta', 'cables', 'enchufe', 'bombilla', 'calambre', 'saltan los plomos'],
  },
  'abogado|notario': {
    a: ['despacho', 'derecho', 'cliente', 'pleito', 'juicio', 'tribunal', 'toga'],
    b: ['despacho', 'derecho', 'firma', 'sello', 'herencia', 'hipoteca', 'escrituras', 'dar fe'],
  },
  'piloto|capitán': {
    a: ['uniforme', 'al mando', 'casco', 'cabina', 'despegue', 'turbulencias', 'aterrizaje'],
    b: ['uniforme', 'al mando', 'galones', 'brazalete', 'barco', 'timón', 'garfio'],
  },
  'astronauta|aviador': {
    a: ['casco', 'despegue', 'cohete', 'cuenta atrás', 'traje espacial', 'ingravidez', 'pisar la luna'],
    b: ['casco', 'despegue', 'hélice', 'avioneta', 'acrobacias', 'biplano', 'gafas y bufanda'],
  },
  'luna|sol': {
    a: ['cielo', 'eclipse', 'noche', 'mareas', 'cráter', 'cuarto menguante', 'hombre lobo'],
    b: ['cielo', 'eclipse', 'día', 'calor', 'rayos', 'amanecer', 'bronceado'],
  },
  'estrella|cometa': {
    a: ['cielo', 'noche', 'brillo', 'parpadeo', 'constelación', 'polar', 'cinco puntas'],
    b: ['cielo', 'noche', 'órbita', 'hielo', 'cola', 'estela', 'cada 76 años'],
  },
  'montaña|volcán': {
    a: ['cima', 'altura', 'senderismo', 'refugio', 'escalada', 'cabras', 'picos nevados'],
    b: ['cima', 'altura', 'cráter', 'ceniza', 'magma', 'erupción', 'lava'],
  },
  'río|lago': {
    a: ['agua dulce', 'pescar', 'corriente', 'orilla', 'puente', 'afluente', 'desembocadura'],
    b: ['agua dulce', 'pescar', 'aguas quietas', 'patos', 'barca de remos', 'cisnes', 'la leyenda de Nessie'],
  },
  'bosque|selva': {
    a: ['árboles', 'animales', 'hojas', 'setas', 'musgo', 'ardillas', 'leñador'],
    b: ['árboles', 'animales', 'humedad', 'mosquitos', 'monos', 'lianas', 'tucán'],
  },
  'desierto|sabana': {
    a: ['calor', 'sequía', 'arena', 'cactus', 'dunas', 'camello', 'oasis'],
    b: ['calor', 'sequía', 'hierba alta', 'safari', 'acacias', 'cebras', 'leones', 'jirafas'],
  },
  'lluvia|nieve': {
    a: ['nubes', 'invierno', 'gotas', 'charcos', 'botas de agua', 'chubasquero', 'paraguas'],
    b: ['nubes', 'invierno', 'frío', 'blanco', 'esquí', 'trineo', 'copos'],
  },
  'tormenta|ola de calor': {
    a: ['verano', 'aviso naranja', 'nubes negras', 'viento', 'granizo', 'relámpagos', 'truenos'],
    b: ['verano', 'aviso naranja', 'sudor', 'ventilador', 'abanico', 'noches tropicales', '40 grados'],
  },
  'primavera|otoño': {
    a: ['cambio de hora', 'entretiempo', 'alergia', 'polen', 'golondrinas', 'flores', 'marzo'],
    b: ['cambio de hora', 'entretiempo', 'lluvia', 'setas', 'vuelta al cole', 'castañas', 'hojas caídas'],
  },
  'gafas de sol|gorra': {
    a: ['verano', 'complemento', 'ojos', 'montura', 'patillas', 'cristales oscuros', 'polarizadas'],
    b: ['verano', 'complemento', 'cabeza', 'visera', 'del revés', 'béisbol'],
  },
  'bañador|pantalón corto': {
    a: ['verano', 'calor', 'toalla', 'mojado', 'piscina', 'nadar', 'chapuzón'],
    b: ['verano', 'calor', 'piernas', 'rodillas', 'bolsillos', 'cinturón'],
  },
  'zapatillas|chanclas': {
    a: ['pies', 'calzado', 'gimnasio', 'correr', 'suela de goma', 'cordones'],
    b: ['pies', 'calzado', 'verano', 'piscina', 'ducha', 'dedo gordo', 'madre enfadada'],
  },
  'vaqueros|chándal': {
    a: ['ropa', 'pantalones', 'azul', 'bolsillos', 'rotos', 'remaches', 'denim'],
    b: ['ropa', 'pantalones', 'domingo', 'cremallera', 'gimnasio', 'educación física', 'tres rayas'],
  },
  'traje|esmoquin': {
    a: ['chaqueta', 'boda', 'sastre', 'corbata', 'ejecutivo', 'oficina', 'entrevista de trabajo'],
    b: ['chaqueta', 'boda', 'noche de gala', 'alfombra roja', 'solapas de raso', 'pajarita', 'agente 007'],
  },
  'perfume|desodorante': {
    a: ['olor', 'spray', 'regalo', 'cuello', 'frasco de cristal', 'anuncios navideños'],
    b: ['olor', 'spray', 'gimnasio', 'sudor', 'roll-on', 'axilas'],
  },
  'sofá|hamaca': {
    a: ['siesta', 'tumbarse', 'cojines', 'salón', 'tele', 'mando a distancia', 'tres plazas'],
    b: ['siesta', 'tumbarse', 'verano', 'jardín', 'balanceo', 'entre dos árboles'],
  },
}
