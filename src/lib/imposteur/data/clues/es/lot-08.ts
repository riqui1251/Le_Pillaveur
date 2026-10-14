// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from '../index'

/** es, lot 08 : paires 162 à 184 de data/es.ts (brief : node scripts/imposteur-clues-brief.mjs es 8). */
export const IMPOSTEUR_CLUES_ES_LOT_08: Record<string, ImposteurClueSet> = {
  'reunión|entrevista de trabajo': {
    a: ['sala', 'corbata', 'proyector', 'compañeros', 'orden del día', 'acta', 'podía ser un correo'],
    b: ['sala', 'corbata', 'nervios', 'currículum', 'recursos humanos', 'puntos débiles', 'dónde te ves en 5 años'],
  },
  'teletrabajo|oficina abierta': {
    a: ['portátil', 'auriculares', 'pijama', 'cámara apagada', 'el gato en la pantalla', 'desde casa'],
    b: ['portátil', 'auriculares', 'ruido', 'compañero de al lado', 'mesas en fila', 'cero intimidad', 'sin despachos'],
  },
  'contrato indefinido|contrato temporal': {
    a: ['firma', 'nómina', 'periodo de prueba', 'estabilidad', 'pedir hipoteca', 'para toda la vida', 'sin fecha de fin'],
    b: ['firma', 'nómina', 'verano', 'sustitución', 'renovar o no', 'fecha de fin', 'seis meses'],
  },
  'huelga|manifestación': {
    a: ['sindicatos', 'pancartas', 'convocatoria', 'piquete', 'día sin cobrar', 'fábrica cerrada', 'servicios mínimos'],
    b: ['sindicatos', 'pancartas', 'megáfono', 'consignas', 'calle cortada', 'cabecera', 'marcha por el centro'],
  },
  'impuestos|alquiler': {
    a: ['pagar', 'papeleo', 'gestoría', 'borrador', 'de abril a junio', 'declaración de la renta'],
    b: ['pagar', 'papeleo', 'inmobiliaria', 'fianza', 'piso compartido', 'casero'],
  },
  'bombilla|vela': {
    a: ['luz', 'mesilla', 'interruptor', 'vatios', 'led', 'casquillo', 'se ha fundido'],
    b: ['luz', 'mesilla', 'apagón', 'soplar', 'cumpleaños', 'cera', 'mecha'],
  },
  'aspiradora|escoba': {
    a: ['polvo', 'suelo', 'enchufe', 'ruido', 'filtro', 'robot redondo'],
    b: ['polvo', 'suelo', 'palo', 'bruja', 'barrer', 'recogedor'],
  },
  'lavadora|lavavajillas': {
    a: ['detergente', 'programa', 'suavizante', 'centrifugado', 'tender la ropa', 'calcetín perdido'],
    b: ['detergente', 'programa', 'pastilla', 'sal', 'abrillantador', 'cubiertos', 'platos sucios'],
  },
  'radiador|aire acondicionado': {
    a: ['temperatura', 'termostato', 'invierno', 'calefacción', 'calcetines secándose', 'purgar'],
    b: ['temperatura', 'termostato', 'verano', 'mando a distancia', 'frío', 'goteo en la acera', 'split'],
  },
  'paraguas|impermeable': {
    a: ['lluvia', 'charcos', 'mango', 'plegable', 'varillas', 'abrirlo en casa'],
    b: ['lluvia', 'charcos', 'capucha', 'cremallera', 'manos libres', 'pescador amarillo'],
  },
  'arcoíris|aurora boreal': {
    a: ['cielo', 'colores', 'lluvia y sol', 'bandera', 'siete colores', 'olla de oro'],
    b: ['cielo', 'colores', 'noche', 'frío polar', 'viaje a Islandia', 'luces verdes'],
  },
  'tormenta|tornado': {
    a: ['viento', 'nubes negras', 'chaparrón', 'rayo', 'trueno', 'contar los segundos'],
    b: ['viento', 'nubes negras', 'remolino', 'casas volando', 'embudo', 'el mago de Oz'],
  },
  'eclipse solar|eclipse lunar': {
    a: ['cielo', 'sombra', 'de día', 'corona', 'oscuro a mediodía', 'gafas especiales'],
    b: ['cielo', 'sombra', 'de noche', 'a simple vista', 'sombra de la Tierra', 'se pone roja'],
  },
  'glaciar|iceberg': {
    a: ['hielo', 'frío', 'deshielo', 'montaña', 'valle en U', 'el Perito Moreno'],
    b: ['hielo', 'frío', 'océano', 'flotando', 'la punta', 'bajo el agua', 'el Titanic'],
  },
  'cactus|bonsái': {
    a: ['maceta', 'planta', 'poco riego', 'desierto', 'pinchos', 'chumbera'],
    b: ['maceta', 'planta', 'paciencia', 'podar', 'alambre', 'japonés', 'árbol enano'],
  },
  'erizo|tortuga': {
    a: ['mascota', 'jardín', 'nocturno', 'hecho una bola', 'como Sonic', 'púas'],
    b: ['mascota', 'jardín', 'lechuga', 'lenta', 'ninjas', 'la liebre', 'caparazón'],
  },
  'flamenco|pavo real': {
    a: ['plumas', 'ave', 'laguna', 'patas largas', 'rosa', 'a la pata coja'],
    b: ['plumas', 'ave', 'jardín de palacio', 'presumido', 'azul y verde', 'cola en abanico'],
  },
  'pulpo|calamar': {
    a: ['fondo del mar', 'tentáculos', 'ventosas', 'listísimo', 'ocho brazos', 'a la gallega'],
    b: ['fondo del mar', 'tentáculos', 'tinta', 'rebozado', 'anillas', 'a la romana'],
  },
  'sumo|lucha libre': {
    a: ['combate', 'cuerpo a cuerpo', 'japonés', 'peso pesado', 'echar sal', 'círculo de arena', 'moño y taparrabos'],
    b: ['combate', 'cuerpo a cuerpo', 'ring', 'llaves', 'las cuerdas', 'mexicana', 'máscara'],
  },
  'esgrima|kárate': {
    a: ['combate', 'blanco', 'en guardia', 'careta', 'espada', 'florete'],
    b: ['combate', 'blanco', 'tatami', 'patada', 'cinturón negro', 'romper tablas', 'dar cera, pulir cera'],
  },
  'joya|reloj': {
    a: ['regalo', 'escaparate', 'oro', 'quilates', 'diamantes', 'collar'],
    b: ['regalo', 'escaparate', 'muñeca', 'correa', 'pila', 'agujas', 'tictac'],
  },
  'bolso|clutch': {
    a: ['complemento', 'pintalabios', 'hombro', 'asa', 'bandolera', 'no encuentro las llaves'],
    b: ['complemento', 'pintalabios', 'boda', 'de noche', 'pequeñito', 'forma de sobre', 'sin asas'],
  },
  'guantes|bufanda': {
    a: ['invierno', 'lana', 'perder uno', 'boxeo', 'manos', 'cinco dedos'],
    b: ['invierno', 'lana', 'tejida por la abuela', 'fútbol', 'de rayas', 'cuello'],
  },
}
