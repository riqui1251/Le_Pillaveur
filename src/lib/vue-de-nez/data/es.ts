import type { VdnQuestionId } from './questions'
import type { VdnQuestionText } from './types'

/**
 * Textes espagnols (Espagne, tutoiement) ; les réponses vivent dans questions.ts. Organismes
 * internationaux sous leur nom officiel espagnol, autres sources sous leur propre nom. « trillones »
 * vaut 10^18 (échelle longue) : ce sont bien les « milliards de milliards » du français. Ni « vino »
 * (passé de venir), ni « trago », ni « sorbo » : le garde-fou d'alcool les attraperait.
 */
export const VDN_TEXTS: Readonly<Record<VdnQuestionId, VdnQuestionText>> = {
  'corps-os-adulte': {
    text: '¿Cuántos huesos tiene el esqueleto de un adulto? Sí, incluso el de quien baila como si no tuviera ninguno.',
    unit: 'huesos',
    source: 'Gray’s Anatomy',
  },
  'corps-dents-adulte': {
    text: '¿Cuántos dientes tiene una dentadura adulta completa, muelas del juicio incluidas?',
    unit: 'dientes',
    source: 'Gray’s Anatomy',
  },
  'corps-dents-lait': {
    text: '¿Cuántos dientes de leche puede llevarse en total el Ratoncito Pérez de un mismo peque?',
    unit: 'dientes',
    source: 'Gray’s Anatomy',
  },
  'corps-paires-cotes': {
    text: '¿Cuántos pares de costillas forman la caja torácica humana?',
    unit: 'pares',
    source: 'Gray’s Anatomy',
  },
  'corps-chromosomes': {
    text: '¿Cuántos cromosomas hay en el núcleo de una célula humana corriente (sin contar las células reproductoras)?',
    unit: 'cromosomas',
    source: 'Inserm',
  },
  'corps-osselets-oreille': {
    text: '¿Cuántos huesecillos se esconden en cada uno de tus oídos? Son los huesos más pequeños del cuerpo.',
    unit: 'huesecillos',
    source: 'Gray’s Anatomy',
  },
  'corps-os-main': {
    text: '¿Cuántos huesos tiene una mano humana, muñeca incluida?',
    unit: 'huesos',
    source: 'Gray’s Anatomy',
  },
  'corps-os-pied': {
    text: '¿Cuántos huesos tiene un pie humano? Piensa en los dedos de tus pies: también cuentan.',
    unit: 'huesos',
    source: 'Gray’s Anatomy',
  },
  'corps-phalanges': {
    text: '¿Cuántas falanges hay en total entre tus dos manos y tus dos pies? Está permitido contar con los dedos.',
    unit: 'falanges',
    source: 'Gray’s Anatomy',
  },
  'corps-nerfs-rachidiens': {
    text: '¿Cuántos pares de nervios salen de la médula espinal?',
    unit: 'pares',
    source: 'Gray’s Anatomy',
  },
  'corps-muscles-oeil': {
    text: '¿Cuántos músculos hacen girar un solo ojo dentro de su órbita? Muy prácticos para poner los ojos en blanco.',
    unit: 'músculos',
    source: 'Gray’s Anatomy',
  },
  'corps-lobes-poumons': {
    text: '¿Cuántos lóbulos suman tus dos pulmones juntos?',
    unit: 'lóbulos',
    source: 'Gray’s Anatomy',
  },
  'corps-groupes-sanguins': {
    text: 'Combinando el sistema ABO y el factor Rh (positivo o negativo), ¿cuántos grupos sanguíneos distintos se obtienen?',
    unit: 'grupos',
    source: 'Establecimiento Francés de la Sangre (EFS)',
  },
  'corps-globule-rouge': {
    text: '¿Cuántos días vive un glóbulo rojo, de media, antes de ser reciclado?',
    unit: 'días',
    source: 'Establecimiento Francés de la Sangre (EFS)',
  },
  'corps-nerfs-craniens': {
    text: '¿Cuántos pares de nervios craneales salen directamente de tu encéfalo? El olfato y la vista tienen cada uno el suyo.',
    unit: 'pares',
    source: 'Gray’s Anatomy',
  },
  'corps-vertebres-mobiles': {
    text: 'Sin contar las vértebras soldadas del sacro y del cóccix, ¿cuántas vértebras se apilan en la columna vertebral de un adulto? Lo justo para ir con la cabeza bien alta.',
    unit: 'vértebras',
    source: 'Gray’s Anatomy',
  },
  'corps-longueur-adn': {
    text: 'Si lo desenrollaras de punta a punta, ¿cuántos metros mediría el ADN de una sola de tus células, redondeando al metro?',
    unit: 'm',
    source: 'Inserm',
  },
  'corps-genome-paires-bases': {
    text: '¿Cuántos pares de bases (las famosas letras A, T, C y G) tiene el genoma humano, redondeando a los mil millones?',
    unit: 'pares de bases',
    source: 'National Human Genome Research Institute (NHGRI)',
  },
  'corps-neurones': {
    text: 'Según el estudio de Azevedo y sus colegas publicado en 2009, ¿cuántas neuronas tiene un cerebro humano adulto, redondeando a los mil millones? Sí, incluso un lunes por la mañana.',
    unit: 'neuronas',
    source: 'Azevedo et al., Journal of Comparative Neurology (2009)',
  },
  'corps-audition-aigus': {
    text: '¿Hasta qué frecuencia, en hercios, percibe los sonidos agudos el oído de un adulto joven?',
    unit: 'Hz',
    source: 'Inserm',
  },
  'corps-types-cones': {
    text: '¿Cuántos tipos de conos, las células que perciben los colores, tiene la retina humana?',
    unit: 'tipos',
    source: 'Encyclopædia Britannica',
  },
  'geographie-everest': {
    text: '¿Cuál es la altitud del Everest, en metros, según la medición oficial de 2020, redondeando al metro?',
    unit: 'm',
    source: 'Encyclopædia Britannica',
  },
  'geographie-mont-blanc': {
    text: '¿Cuál es la altitud del Mont Blanc, en metros, redondeando a la centena?',
    unit: 'm',
    source: 'IGN (Instituto Nacional de la Información Geográfica y Forestal de Francia)',
  },
  'geographie-tour-equateur': {
    text: '¿Cuántos kilómetros mide la vuelta a la Tierra por el ecuador, redondeando al millar?',
    unit: 'km',
    source: 'Encyclopædia Britannica',
  },
  'geographie-fosse-mariannes': {
    text: '¿Cuál es la profundidad máxima de la fosa de las Marianas, en metros, redondeando al millar?',
    unit: 'm',
    source: 'NOAA (National Oceanic and Atmospheric Administration)',
  },
  'geographie-nil': {
    text: '¿Cuál es la longitud del Nilo, en kilómetros, redondeando al millar?',
    unit: 'km',
    source: 'Encyclopædia Britannica',
  },
  'geographie-loire': {
    text: '¿Cuál es la longitud del Loira, el río más largo de Francia, en kilómetros, redondeando a la centena?',
    unit: 'km',
    source: 'Sandre (referencial nacional francés de datos sobre el agua)',
  },
  'geographie-seine': {
    text: '¿Cuál es la longitud del Sena, desde su nacimiento hasta el canal de la Mancha, en kilómetros, redondeando a la centena?',
    unit: 'km',
    source: 'Sandre (referencial nacional francés de datos sobre el agua)',
  },
  'geographie-baikal': {
    text: '¿Cuál es la profundidad máxima del lago Baikal, el más profundo del mundo, en metros, redondeando a la centena?',
    unit: 'm',
    source: 'Encyclopædia Britannica',
  },
  'geographie-kilimandjaro': {
    text: '¿Cuál es la altitud del Kilimanjaro, el techo de África, en metros, redondeando a la centena?',
    unit: 'm',
    source: 'Encyclopædia Britannica',
  },
  'geographie-sahara': {
    text: '¿Cuál es la superficie del Sahara, en kilómetros cuadrados, redondeando al millón? Llévate crema solar.',
    unit: 'km²',
    source: 'Encyclopædia Britannica',
  },
  'geographie-groenland': {
    text: '¿Cuál es la superficie de Groenlandia, la isla más grande del mundo, en kilómetros cuadrados, redondeando al millón?',
    unit: 'km²',
    source: 'Encyclopædia Britannica',
  },
  'geographie-titicaca': {
    text: '¿A qué altitud se encuentra el lago Titicaca, en metros, redondeando a la centena?',
    unit: 'm',
    source: 'Encyclopædia Britannica',
  },
  'geographie-salto-angel': {
    text: '¿Cuál es la altura del Salto Ángel, la cascada más alta del mundo, en metros, redondeando a la centena?',
    unit: 'm',
    source: 'Encyclopædia Britannica',
  },
  'geographie-mont-fuji': {
    text: '¿Cuál es la altitud del monte Fuji, estrella de las estampas japonesas, en metros, redondeando a la centena?',
    unit: 'm',
    source: 'Encyclopædia Britannica',
  },
  'geographie-part-oceans': {
    text: '¿Qué porcentaje de la superficie de la Tierra está cubierto por el océano, redondeando a la unidad?',
    unit: '%',
    source: 'NOAA (National Oceanic and Atmospheric Administration)',
  },
  'geographie-voisins-france': {
    text: '¿Cuántos países comparten frontera terrestre con la Francia metropolitana? Los microestados también cuentan.',
    unit: 'países',
    source: 'IGN (Instituto Nacional de la Información Geográfica y Forestal de Francia)',
  },
  'geographie-pas-de-calais': {
    text: '¿Cuál es la anchura del paso de Calais en su punto más estrecho, en kilómetros, redondeando a la decena?',
    unit: 'km',
    source: 'Encyclopædia Britannica',
  },
  'geographie-cantons-suisses': {
    text: '¿Cuántos cantones tiene Suiza? Se exige precisión suiza.',
    unit: 'cantones',
    source: 'Confederación Suiza (admin.ch)',
  },
  'geographie-fuseau-horaire': {
    text: '¿Cuántos grados de longitud abarca un huso horario teórico?',
    unit: 'grados',
    source: 'Observatorio de París',
  },
  'geographie-paris-new-york': {
    text: '¿Qué distancia en línea recta separa París de Nueva York, en kilómetros, redondeando al millar?',
    unit: 'km',
    source: 'Géoportail (IGN)',
  },
  'geographie-corse': {
    text: '¿Cuál es la superficie de Córcega, en kilómetros cuadrados, redondeando al millar?',
    unit: 'km²',
    source: 'Insee',
  },
  'geographie-leman': {
    text: '¿Cuál es la profundidad máxima del lago Lemán, en metros, redondeando a la decena?',
    unit: 'm',
    source: 'CIPEL (Comisión Internacional para la Protección de las Aguas del Lemán)',
  },
  'histoire-bastille': {
    text: '¿En qué año tomaron los parisinos la Bastilla?',
    unit: 'año',
    source: 'Enciclopedia Larousse',
  },
  'histoire-premier-pas-lune': {
    text: '¿En qué año dio Neil Armstrong el primer paso humano sobre la Luna?',
    unit: 'año',
    source: 'NASA',
  },
  'histoire-chute-mur-berlin': {
    text: '¿En qué año cayó el muro de Berlín?',
    unit: 'año',
    source: 'Enciclopedia Larousse',
  },
  'histoire-colomb-amerique': {
    text: '¿En qué año llegó Cristóbal Colón a América por primera vez? Y él, convencido de haber desembarcado en las Indias.',
    unit: 'año',
    source: 'Enciclopedia Larousse',
  },
  'histoire-hastings': {
    text: '¿En qué año ganó Guillermo el Conquistador la batalla de Hastings?',
    unit: 'año',
    source: 'Encyclopædia Britannica',
  },
  'histoire-charlemagne-empereur': {
    text: '¿En qué año fue coronado emperador Carlomagno? Pista: una cifra bien redonda.',
    unit: 'año',
    source: 'Enciclopedia Larousse',
  },
  'histoire-marignan': {
    text: '¿En qué año ganó Francisco I la batalla de Marignano?',
    unit: 'año',
    source: 'Enciclopedia Larousse',
  },
  'histoire-guerre-cent-ans': {
    text: '¿Cuántos años duró en realidad la guerra de los Cien Años? Pista: su nombre miente un poco.',
    unit: 'años',
    source: 'Enciclopedia Larousse',
  },
  'histoire-regne-louis-xiv': {
    text: '¿Cuántos años completos duró el reinado de Luis XIV, el más largo de la historia de Francia?',
    unit: 'años',
    source: 'Palacio de Versalles',
  },
  'histoire-regne-elisabeth-ii': {
    text: '¿Cuántos años completos reinó Isabel II en el Reino Unido?',
    unit: 'años',
    source: 'The Royal Household (royal.uk)',
  },
  'histoire-fondation-rome': {
    text: 'Según la leyenda, ¿en qué año antes de Cristo fundó Rómulo la ciudad de Roma?',
    unit: 'a. C.',
    source: 'Encyclopædia Britannica',
  },
  'histoire-alesia': {
    text: '¿En qué año antes de Cristo depuso Vercingétorix las armas ante César en Alesia?',
    unit: 'a. C.',
    source: 'Enciclopedia Larousse',
  },
  'histoire-pompei': {
    text: '¿En qué año de nuestra era sepultó el Vesubio la ciudad de Pompeya?',
    unit: 'año',
    source: 'Encyclopædia Britannica',
  },
  'histoire-duree-mur-berlin': {
    text: '¿Cuántos años completos se mantuvo en pie el muro de Berlín?',
    unit: 'años',
    source: 'Enciclopedia Larousse',
  },
  'histoire-gagarine': {
    text: '¿En qué año se convirtió Yuri Gagarin en el primer ser humano en viajar al espacio?',
    unit: 'año',
    source: 'Encyclopædia Britannica',
  },
  'histoire-marcheurs-lune': {
    text: '¿Cuántos astronautas caminaron sobre la Luna durante el programa Apolo?',
    unit: 'astronautas',
    source: 'NASA',
  },
  'histoire-epouses-henri-viii': {
    text: '¿Cuántas esposas tuvo el rey de Inglaterra Enrique VIII? No hacía las cosas a medias.',
    unit: 'esposas',
    source: 'Encyclopædia Britannica',
  },
  'histoire-longueur-titanic': {
    text: '¿Cuánto medía de largo el Titanic, en metros, redondeando a la decena?',
    unit: 'm',
    source: 'Encyclopædia Britannica',
  },
  'histoire-statue-liberte': {
    text: 'Sin su pedestal, ¿cuánto mide la estatua de la Libertad, de los pies a la punta de la antorcha, en metros, redondeando al metro?',
    unit: 'm',
    source: 'National Park Service (Estados Unidos)',
  },
  'histoire-pyramide-kheops': {
    text: 'Cuando se construyó, ¿qué altura alcanzaba la pirámide de Keops, en metros, redondeando a la decena?',
    unit: 'm',
    source: 'Encyclopædia Britannica',
  },
  'histoire-plages-debarquement': {
    text: '¿En cuántas playas desembarcaron los Aliados en Normandía el 6 de junio de 1944?',
    unit: 'playas',
    source: 'Memorial de Caen',
  },
  'histoire-bleriot-manche': {
    text: '¿En qué año cruzó Louis Blériot el canal de la Mancha en avión?',
    unit: 'año',
    source: 'Museo del Aire y del Espacio (Le Bourget)',
  },
  'sciences-vitesse-lumiere': {
    text: '¿A qué velocidad viaja la luz en el vacío, en kilómetros por segundo, redondeando a la unidad?',
    unit: 'km/s',
    source: 'Oficina Internacional de Pesas y Medidas (BIPM)',
  },
  'sciences-distance-lune': {
    text: '¿Qué distancia media separa la Tierra de la Luna, en kilómetros, redondeando al millar?',
    unit: 'km',
    source: 'NASA',
  },
  'sciences-distance-soleil': {
    text: '¿Qué distancia media separa la Tierra del Sol, en kilómetros, redondeando al millón?',
    unit: 'km',
    source: 'Unión Astronómica Internacional (UAI)',
  },
  'sciences-planetes': {
    text: '¿Cuántos planetas tiene oficialmente el sistema solar? Plutón sigue de morros.',
    unit: 'planetas',
    source: 'Unión Astronómica Internacional (UAI)',
  },
  'sciences-protons-or': {
    text: '¿Cuántos protones tiene el núcleo de un átomo de oro? También es su número atómico.',
    unit: 'protones',
    source: 'IUPAC (Unión Internacional de Química Pura y Aplicada)',
  },
  'sciences-ebullition-fahrenheit': {
    text: '¿A cuántos grados Fahrenheit hierve el agua al nivel del mar?',
    unit: '°F',
    source: 'NIST (National Institute of Standards and Technology)',
  },
  'sciences-zero-absolu': {
    text: '¿Cuál es la temperatura del cero absoluto, en grados Celsius, redondeando a la unidad? Más frío, imposible.',
    unit: '°C',
    source: 'Oficina Internacional de Pesas y Medidas (BIPM)',
  },
  'sciences-vitesse-son': {
    text: '¿A qué velocidad se propaga el sonido en el aire a 20 °C, en metros por segundo, redondeando a la decena?',
    unit: 'm/s',
    source: 'Encyclopædia Britannica',
  },
  'sciences-pesanteur': {
    text: '¿Cuál es la aceleración de la gravedad en la superficie de la Tierra, en m/s², redondeando a la centésima?',
    unit: 'm/s²',
    source: 'Oficina Internacional de Pesas y Medidas (BIPM)',
  },
  'sciences-cou-girafe': {
    text: '¿Cuántas vértebras tiene el largo cuello de una jirafa? Pista: ni una más que el tuyo.',
    unit: 'vértebras',
    source: 'Museo Nacional de Historia Natural de Francia',
  },
  'sciences-coeurs-pieuvre': {
    text: '¿Cuántos corazones tiene un pulpo? Como para amar sin medida.',
    unit: 'corazones',
    source: 'Museo Nacional de Historia Natural de Francia',
  },
  'sciences-gestation-elephant': {
    text: '¿Cuántos meses dura la gestación de una elefanta africana, redondeando al mes? Y pensar que nueve meses ya nos parecen eternos.',
    unit: 'meses',
    source: 'Encyclopædia Britannica',
  },
  'sciences-dents-chien': {
    text: '¿Cuántos dientes tiene un perro adulto? De sobra para dar buena cuenta de tus zapatillas.',
    unit: 'dientes',
    source: 'Encyclopædia Britannica',
  },
  'sciences-annee-mars': {
    text: '¿Cuántos días terrestres dura un año en Marte, redondeando a la unidad? Allí los cumpleaños escasean.',
    unit: 'días',
    source: 'NASA',
  },
  'sciences-terres-dans-soleil': {
    text: '¿Cuántas veces cabe el volumen de la Tierra en el del Sol, redondeando a la centena de millar? Como para sentirse poca cosa.',
    unit: 'veces',
    source: 'NASA',
  },
  'sciences-age-univers': {
    text: '¿Qué edad tiene el universo, en miles de millones de años, redondeando a la décima? Los lleva bastante bien.',
    unit: 'miles de millones de años',
    source: 'Agencia Espacial Europea (misión Planck)',
  },
  'sciences-trajet-lumiere-soleil': {
    text: '¿Cuántos segundos tarda la luz del Sol en llegar hasta nosotros, redondeando a la decena?',
    unit: 's',
    source: 'NASA',
  },
  'sciences-azote-liquide': {
    text: '¿A qué temperatura se vuelve líquido el nitrógeno, en grados Celsius, redondeando a la unidad?',
    unit: '°C',
    source: 'Encyclopædia Britannica',
  },
  'sciences-ligne-karman': {
    text: 'Según la Federación Aeronáutica Internacional, ¿a qué altitud empieza el espacio, en kilómetros?',
    unit: 'km',
    source: 'Federación Aeronáutica Internacional (FAI)',
  },
  'sciences-rotation-venus': {
    text: '¿Cuántos días terrestres tarda Venus en dar una vuelta sobre sí misma, redondeando a la unidad? Pista: dura más que su propio año.',
    unit: 'días',
    source: 'NASA',
  },
  'sciences-yeux-abeille': {
    text: '¿Cuántos ojos tiene una abeja? Pista: más de dos.',
    unit: 'ojos',
    source: 'Museo Nacional de Historia Natural de Francia',
  },
  'sciences-annee-lumiere': {
    text: '¿Cuántos miles de millones de kilómetros recorre la luz en un año, redondeando a la centena?',
    unit: 'miles de millones de km',
    source: 'Unión Astronómica Internacional (UAI)',
  },
  'sport-joueurs-rugby': {
    text: '¿Cuántos jugadores en total pisan el césped en el saque inicial de un partido de rugby a XV?',
    unit: 'jugadores',
    source: 'World Rugby',
  },
  'sport-point-penalty': {
    text: '¿A cuántos metros de la línea de meta está el punto de penalti?',
    unit: 'm',
    source: 'IFAB (Reglas de Juego)',
  },
  'sport-hauteur-panier': {
    text: '¿A qué altura se coloca una canasta de baloncesto, en centímetros?',
    unit: 'cm',
    source: 'FIBA (Federación Internacional de Baloncesto)',
  },
  'sport-filet-volley': {
    text: '¿Cuál es la altura de la red de voleibol en categoría masculina, en centímetros?',
    unit: 'cm',
    source: 'FIVB (Federación Internacional de Voleibol)',
  },
  'sport-marathon': {
    text: '¿Cuántos metros exactos hay que correr para completar un maratón? Cada metro cuenta, sobre todo el último.',
    unit: 'm',
    source: 'World Athletics',
  },
  'sport-duree-basket': {
    text: '¿Cuántos minutos de juego tiene un partido de baloncesto según las reglas FIBA, sin contar la prórroga?',
    unit: 'min',
    source: 'FIBA (Federación Internacional de Baloncesto)',
  },
  'sport-largeur-but': {
    text: '¿Cuál es la anchura de una portería de fútbol entre los dos postes, en centímetros? A los delanteros siempre les parece demasiado pequeña.',
    unit: 'cm',
    source: 'IFAB (Reglas de Juego)',
  },
  'sport-court-tennis': {
    text: '¿Cuál es la longitud de una pista de tenis, en metros, redondeando a la unidad?',
    unit: 'm',
    source: 'Federación Internacional de Tenis (ITF)',
  },
  'sport-billes-snooker': {
    text: '¿Cuántas bolas, blanca incluida, hay sobre la mesa al empezar una partida de snooker?',
    unit: 'bolas',
    source: 'WPBSA (World Professional Billiards and Snooker Association)',
  },
  'sport-flechettes-max': {
    text: '¿Cuál es la mejor puntuación posible lanzando tres dardos?',
    unit: 'puntos',
    source: 'World Darts Federation',
  },
  'sport-bowling-parfait': {
    text: '¿Cuál es la puntuación de una partida perfecta de bolos? Una cifra que rara vez se ve en el marcador una noche entre amigos.',
    unit: 'puntos',
    source: 'International Bowling Federation',
  },
  'sport-premier-tour-de-france': {
    text: '¿En qué año arrancó el primer Tour de Francia de la historia?',
    unit: 'año',
    source: 'Amaury Sport Organisation (ASO)',
  },
  'sport-premiers-jo-modernes': {
    text: '¿En qué año se celebraron en Atenas los primeros Juegos Olímpicos modernos?',
    unit: 'año',
    source: 'Comité Olímpico Internacional (COI)',
  },
  'sport-points-petanque': {
    text: '¿Cuántos puntos hay que marcar para ganar una partida de petanca? Y tú, ¿tiras o arrimas?',
    unit: 'puntos',
    source: 'Federación Francesa de Petanca y Juego Provenzal',
  },
  'sport-tours-10000': {
    text: '¿Cuántas vueltas a una pista de 400 metros hay que dar para correr los 10 000 metros?',
    unit: 'vueltas',
    source: 'World Athletics',
  },
  'sport-ironman': {
    text: 'Natación, ciclismo y carrera a pie sumados: ¿cuántos kilómetros tiene un triatlón Ironman, redondeando a la unidad?',
    unit: 'km',
    source: 'Ironman',
  },
  'sport-tir-arc': {
    text: '¿A qué distancia de la diana tiran los arqueros en los Juegos Olímpicos (arco recurvo), en metros?',
    unit: 'm',
    source: 'World Archery',
  },
  'sport-trou-golf': {
    text: '¿Cuál es el diámetro de un hoyo de golf, en milímetros, redondeando a la unidad? Visto desde el tee, parece minúsculo.',
    unit: 'mm',
    source: 'The R&A (Reglas de Golf)',
  },
  'sport-plumes-badminton': {
    text: '¿Cuántas plumas tiene un volante de bádminton reglamentario?',
    unit: 'plumas',
    source: 'Badminton World Federation (BWF)',
  },
  'sport-distance-lanceur': {
    text: 'En béisbol, ¿qué distancia hay entre la placa del lanzador y el home, en centímetros, redondeando a la unidad?',
    unit: 'cm',
    source: 'Major League Baseball (Reglas oficiales)',
  },
  'sport-mur-coup-franc': {
    text: 'En un tiro libre, ¿a cuántos centímetros del balón debe situarse la barrera como mínimo?',
    unit: 'cm',
    source: 'IFAB (Reglas de Juego)',
  },
  'societe-cases-echiquier': {
    text: '¿Cuántas casillas tiene un tablero de ajedrez? Jaque matemático.',
    unit: 'casillas',
    source: 'FIDE (Federación Internacional de Ajedrez)',
  },
  'societe-cartes-tarot': {
    text: '¿Cuántas cartas tiene una baraja de tarot francés, con la Excusa (su comodín) incluida?',
    unit: 'cartas',
    source: 'Federación Francesa de Tarot',
  },
  'societe-faces-opposees-de': {
    text: 'En un dado clásico de seis caras, ¿cuánto suman dos caras opuestas? Siempre da el mismo total.',
    unit: 'puntos',
    source: 'Encyclopædia Britannica',
  },
  'societe-cases-monopoly': {
    text: '¿Cuántas casillas tiene el tablero del Monopoly clásico, contando la casilla de Salida?',
    unit: 'casillas',
    source: 'Hasbro',
  },
  'societe-dominos': {
    text: '¿Cuántas fichas tiene un dominó clásico, del doble blanco al doble seis?',
    unit: 'fichas',
    source: 'Encyclopædia Britannica',
  },
  'societe-cases-scrabble': {
    text: '¿Cuántas casillas tiene un tablero de Scrabble?',
    unit: 'casillas',
    source: 'FISF (Federación Internacional de Scrabble Francófono)',
  },
  'societe-positions-rubik': {
    text: '¿Cuántas posiciones distintas puede adoptar un cubo de Rubik, en trillones (un 1 seguido de 18 ceros), redondeando a la unidad? Suerte si quieres probarlas todas.',
    unit: 'trillones',
    source: 'Encyclopædia Britannica',
  },
  'societe-carres-rubik': {
    text: '¿Cuántos cuadraditos de colores cubren un cubo de Rubik clásico?',
    unit: 'cuadrados',
    source: 'Rubik’s Brand Ltd',
  },
  'societe-rivets-tour-eiffel': {
    text: '¿Cuántos remaches mantienen en pie la torre Eiffel, redondeando a la centena de millar?',
    unit: 'remaches',
    source: 'SETE (Sociedad de Explotación de la Torre Eiffel)',
  },
  'societe-feuille-a4': {
    text: '¿Cuánto mide de largo una hoja A4, en milímetros?',
    unit: 'mm',
    source: 'Norma ISO 216',
  },
  'societe-a4-dans-a0': {
    text: '¿Cuántas hojas A4 se pueden cortar de una sola hoja A0?',
    unit: 'hojas',
    source: 'Norma ISO 216',
  },
  'societe-piece-2-euros': {
    text: '¿Cuánto pesa una moneda de 2 euros, en gramos, redondeando a la décima?',
    unit: 'g',
    source: 'Banco Central Europeo',
  },
  'societe-cases-sudoku': {
    text: '¿Cuántas casillas tiene una cuadrícula de sudoku clásica?',
    unit: 'casillas',
    source: 'Encyclopædia Britannica',
  },
  'societe-code-barres': {
    text: '¿Cuántos dígitos se alinean bajo el código de barras clásico (EAN) de los productos del supermercado?',
    unit: 'dígitos',
    source: 'GS1',
  },
  'societe-jeu-oie': {
    text: '¿Cuántas casillas tiene el recorrido del juego de la oca tradicional? Cuidado con el pozo.',
    unit: 'casillas',
    source: 'Biblioteca Nacional de Francia',
  },
  'societe-goban': {
    text: '¿Cuántas intersecciones tiene un goban, el tablero oficial del go?',
    unit: 'intersecciones',
    source: 'Federación Francesa de Go',
  },
  'societe-cases-puissance-4': {
    text: '¿Cuántas casillas tiene la cuadrícula de un Conecta 4?',
    unit: 'casillas',
    source: 'Hasbro',
  },
  'societe-mois-31-jours': {
    text: '¿Cuántos meses del año tienen 31 días? Los nudillos de tus puños pueden ayudarte.',
    unit: 'meses',
    source: 'IMCCE (Observatorio de París)',
  },
  'societe-pixels-full-hd': {
    text: '¿Cuántos píxeles tiene una pantalla Full HD, redondeando a la centena de millar?',
    unit: 'píxeles',
    source: 'UIT (Unión Internacional de Telecomunicaciones)',
  },
  'societe-secondes-jour': {
    text: '¿Cuántos segundos tiene un día de 24 horas?',
    unit: 's',
    source: 'Oficina Internacional de Pesas y Medidas (BIPM)',
  },
  'societe-briques-lego': {
    text: '¿De cuántas formas se pueden combinar seis ladrillos LEGO de 2 × 4 del mismo color, redondeando al millón?',
    unit: 'combinaciones',
    source: 'Søren Eilers (Universidad de Copenhague)',
  },
  'culture-touches-piano': {
    text: '¿Cuántas teclas tiene un piano clásico, contando blancas y negras?',
    unit: 'teclas',
    source: 'Encyclopædia Britannica',
  },
  'culture-cordes-harpe': {
    text: '¿Cuántas cuerdas tiene un arpa de concierto?',
    unit: 'cuerdas',
    source: 'Encyclopædia Britannica',
  },
  'culture-symphonies-beethoven': {
    text: '¿Cuántas sinfonías completó Beethoven?',
    unit: 'sinfonías',
    source: 'Encyclopædia Britannica',
  },
  'culture-age-mozart': {
    text: '¿Cuántos años cumplidos vivió Mozart? Una carrera exprés.',
    unit: 'años',
    source: 'Encyclopædia Britannica',
  },
  'culture-hauteur-joconde': {
    text: '¿Cuál es la altura de «La Gioconda», sin el marco, en centímetros, redondeando a la decena? Es más pequeña de lo que te imaginas.',
    unit: 'cm',
    source: 'Museo del Louvre',
  },
  'culture-ouverture-louvre': {
    text: '¿En qué año abrió el Louvre sus puertas al público como museo?',
    unit: 'año',
    source: 'Museo del Louvre',
  },
  'culture-tour-du-monde': {
    text: 'En la novela de Julio Verne, ¿en cuántos días se compromete Phileas Fogg a dar la vuelta al mundo?',
    unit: 'días',
    source: 'Biblioteca Nacional de Francia',
  },
  'culture-fahrenheit-bradbury': {
    text: 'Según el título de la novela de Ray Bradbury, ¿a cuántos grados Fahrenheit arde el papel?',
    unit: '°F',
    source: 'Encyclopædia Britannica',
  },
  'culture-premier-tintin': {
    text: '¿En qué año apareció Tintín por primera vez?',
    unit: 'año',
    source: 'Tintinimaginatio (antes Moulinsart)',
  },
  'culture-premier-asterix': {
    text: '¿En qué año nació Astérix el Galo en la revista «Pilote»?',
    unit: 'año',
    source: 'Éditions Albert René',
  },
  'culture-sonnets-shakespeare': {
    text: '¿Cuántos sonetos reúne la colección de Shakespeare publicada en 1609?',
    unit: 'sonetos',
    source: 'Folger Shakespeare Library',
  },
  'culture-syllabes-haiku': {
    text: '¿Cuántas sílabas tiene un haiku tradicional?',
    unit: 'sílabas',
    source: 'Encyclopædia Britannica',
  },
  'culture-episodes-friends': {
    text: '¿Cuántos episodios tiene en total la serie «Friends»? ¡Pivota!',
    unit: 'episodios',
    source: 'Warner Bros. Television',
  },
  'culture-episodes-game-of-thrones': {
    text: '¿Cuántos episodios tiene la serie «Juego de tronos», del primero al último?',
    unit: 'episodios',
    source: 'HBO',
  },
  'culture-pokemon-premiere-generation': {
    text: '¿Cuántos Pokémon había en la primerísima generación? ¡Hazte con todos!',
    unit: 'Pokémon',
    source: 'The Pokémon Company',
  },
  'culture-formes-tetris': {
    text: '¿Cuántas formas de pieza distintas caen en el Tetris? Sí, la ansiada barra larga es una de ellas.',
    unit: 'formas',
    source: 'The Tetris Company',
  },
  'culture-niveaux-super-mario': {
    text: '¿Cuántos niveles tiene el primer «Super Mario Bros.», lanzado en 1985? La princesa suele estar en otro castillo.',
    unit: 'niveles',
    source: 'Nintendo',
  },
  'culture-duree-433-cage': {
    text: '¿Cuántos segundos dura «4′33″», la famosa pieza silenciosa de John Cage?',
    unit: 's',
    source: 'Encyclopædia Britannica',
  },
  'culture-anneaux-pouvoir': {
    text: 'En «El Señor de los Anillos», ¿cuántos anillos de poder enumera el célebre poema, contando el Anillo Único?',
    unit: 'anillos',
    source: 'J. R. R. Tolkien, «El Señor de los Anillos»',
  },
  'culture-images-par-seconde': {
    text: '¿Cuántos fotogramas por segundo pasan en una película de cine clásica?',
    unit: 'fotogramas/s',
    source: 'CNC (Centro Nacional del Cine y de la Imagen Animada de Francia)',
  },
  'culture-premier-star-wars': {
    text: '¿En qué año se estrenó en los cines la primera película de «Star Wars»?',
    unit: 'año',
    source: 'Lucasfilm',
  },
}
