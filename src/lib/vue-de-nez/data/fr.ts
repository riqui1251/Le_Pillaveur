import type { VdnQuestionId } from './questions'
import type { VdnQuestionText } from './types'

export const VDN_TEXTS: Readonly<Record<VdnQuestionId, VdnQuestionText>> = {
  'corps-os-adulte': {
    text: 'Combien d’os compte le squelette d’un adulte ? Oui, même celui du pote qui danse comme s’il n’en avait aucun.',
    unit: 'os',
    source: 'Gray’s Anatomy',
  },
  'corps-dents-adulte': {
    text: 'Combien de dents compte une dentition adulte complète, dents de sagesse comprises ?',
    unit: 'dents',
    source: 'Gray’s Anatomy',
  },
  'corps-dents-lait': {
    text: 'Combien de dents de lait la petite souris peut-elle récupérer chez un seul enfant ?',
    unit: 'dents',
    source: 'Gray’s Anatomy',
  },
  'corps-paires-cotes': {
    text: 'Combien de paires de côtes forment la cage thoracique humaine ?',
    unit: 'paires',
    source: 'Gray’s Anatomy',
  },
  'corps-chromosomes': {
    text: 'Combien de chromosomes renferme le noyau d’une cellule humaine ordinaire (hors cellules reproductrices) ?',
    unit: 'chromosomes',
    source: 'Inserm',
  },
  'corps-osselets-oreille': {
    text: 'Combien d’osselets se cachent dans chacune de tes oreilles ? Ce sont les plus petits os du corps.',
    unit: 'osselets',
    source: 'Gray’s Anatomy',
  },
  'corps-os-main': {
    text: 'Combien d’os compte une main humaine, poignet compris ?',
    unit: 'os',
    source: 'Gray’s Anatomy',
  },
  'corps-os-pied': {
    text: 'Combien d’os compte un pied humain ? Pense à tes orteils, ils comptent.',
    unit: 'os',
    source: 'Gray’s Anatomy',
  },
  'corps-phalanges': {
    text: 'Combien de phalanges au total dans tes deux mains et tes deux pieds ? Compter sur tes doigts est autorisé.',
    unit: 'phalanges',
    source: 'Gray’s Anatomy',
  },
  'corps-nerfs-rachidiens': {
    text: 'Combien de paires de nerfs partent de la moelle épinière ?',
    unit: 'paires',
    source: 'Gray’s Anatomy',
  },
  'corps-muscles-oeil': {
    text: 'Combien de muscles font tourner un seul œil dans son orbite ? Bien pratiques pour lever les yeux au ciel.',
    unit: 'muscles',
    source: 'Gray’s Anatomy',
  },
  'corps-lobes-poumons': {
    text: 'Combien de lobes comptent tes deux poumons réunis ?',
    unit: 'lobes',
    source: 'Gray’s Anatomy',
  },
  'corps-groupes-sanguins': {
    text: 'En croisant le système ABO et le rhésus (positif ou négatif), combien de groupes sanguins différents obtient-on ?',
    unit: 'groupes',
    source: 'Établissement français du sang (EFS)',
  },
  'corps-globule-rouge': {
    text: 'Combien de jours vit un globule rouge, en moyenne, avant d’être recyclé ?',
    unit: 'jours',
    source: 'Établissement français du sang (EFS)',
  },
  'corps-nerfs-craniens': {
    text: 'Combien de paires de nerfs crâniens partent directement de ton encéphale ? L’odorat et la vue ont chacun la leur.',
    unit: 'paires',
    source: 'Gray’s Anatomy',
  },
  'corps-vertebres-mobiles': {
    text: 'Sans compter les vertèbres soudées du sacrum et du coccyx, combien de vertèbres s’empilent dans la colonne vertébrale d’un adulte ? De quoi garder la tête haute.',
    unit: 'vertèbres',
    source: 'Gray’s Anatomy',
  },
  'corps-longueur-adn': {
    text: 'Déroulé bout à bout, l’ADN d’une seule de tes cellules mesurerait combien de mètres, au mètre près ?',
    unit: 'm',
    source: 'Inserm',
  },
  'corps-genome-paires-bases': {
    text: 'Combien de paires de bases (les fameuses lettres A, T, C et G) compte le génome humain, au milliard près ?',
    unit: 'paires de bases',
    source: 'National Human Genome Research Institute (NHGRI)',
  },
  'corps-neurones': {
    text: 'D’après l’étude d’Azevedo et de ses collègues publiée en 2009, combien de neurones compte un cerveau humain adulte, au milliard près ? Oui, même le lundi matin.',
    unit: 'neurones',
    source: 'Azevedo et al., Journal of Comparative Neurology (2009)',
  },
  'corps-audition-aigus': {
    text: 'Jusqu’à quelle fréquence, en hertz, l’oreille d’un jeune adulte perçoit-elle les sons aigus ?',
    unit: 'Hz',
    source: 'Inserm',
  },
  'corps-types-cones': {
    text: 'Combien de types de cônes, les cellules qui perçoivent les couleurs, possède la rétine humaine ?',
    unit: 'types',
    source: 'Encyclopædia Britannica',
  },
  'geographie-everest': {
    text: 'Quelle est l’altitude de l’Everest, en mètres, selon la mesure officielle de 2020, au mètre près ?',
    unit: 'm',
    source: 'Encyclopædia Britannica',
  },
  'geographie-mont-blanc': {
    text: 'Quelle est l’altitude du mont Blanc, en mètres, à la centaine près ?',
    unit: 'm',
    source: 'IGN (Institut national de l’information géographique et forestière)',
  },
  'geographie-tour-equateur': {
    text: 'Combien de kilomètres mesure le tour de la Terre par l’équateur, au millier près ?',
    unit: 'km',
    source: 'Encyclopædia Britannica',
  },
  'geographie-fosse-mariannes': {
    text: 'Quelle est la profondeur maximale de la fosse des Mariannes, en mètres, au millier près ?',
    unit: 'm',
    source: 'NOAA (National Oceanic and Atmospheric Administration)',
  },
  'geographie-nil': {
    text: 'Quelle est la longueur du Nil, en kilomètres, au millier près ?',
    unit: 'km',
    source: 'Encyclopædia Britannica',
  },
  'geographie-loire': {
    text: 'Quelle est la longueur de la Loire, plus long fleuve de France, en kilomètres, à la centaine près ?',
    unit: 'km',
    source: 'Sandre (référentiel national des données sur l’eau)',
  },
  'geographie-seine': {
    text: 'Quelle est la longueur de la Seine, de sa source à la Manche, en kilomètres, à la centaine près ?',
    unit: 'km',
    source: 'Sandre (référentiel national des données sur l’eau)',
  },
  'geographie-baikal': {
    text: 'Quelle est la profondeur maximale du lac Baïkal, le plus profond du monde, en mètres, à la centaine près ?',
    unit: 'm',
    source: 'Encyclopædia Britannica',
  },
  'geographie-kilimandjaro': {
    text: 'Quelle est l’altitude du Kilimandjaro, toit de l’Afrique, en mètres, à la centaine près ?',
    unit: 'm',
    source: 'Encyclopædia Britannica',
  },
  'geographie-sahara': {
    text: 'Quelle est la superficie du Sahara, en kilomètres carrés, au million près ? Prévois de la crème solaire.',
    unit: 'km²',
    source: 'Encyclopædia Britannica',
  },
  'geographie-groenland': {
    text: 'Quelle est la superficie du Groenland, plus grande île du monde, en kilomètres carrés, au million près ?',
    unit: 'km²',
    source: 'Encyclopædia Britannica',
  },
  'geographie-titicaca': {
    text: 'À quelle altitude se trouve le lac Titicaca, en mètres, à la centaine près ?',
    unit: 'm',
    source: 'Encyclopædia Britannica',
  },
  'geographie-salto-angel': {
    text: 'Quelle est la hauteur du Salto Ángel, plus haute chute d’eau du monde, en mètres, à la centaine près ?',
    unit: 'm',
    source: 'Encyclopædia Britannica',
  },
  'geographie-mont-fuji': {
    text: 'Quelle est l’altitude du mont Fuji, star des estampes japonaises, en mètres, à la centaine près ?',
    unit: 'm',
    source: 'Encyclopædia Britannica',
  },
  'geographie-part-oceans': {
    text: 'Quel pourcentage de la surface de la Terre est recouvert par l’océan, à l’unité près ?',
    unit: '%',
    source: 'NOAA (National Oceanic and Atmospheric Administration)',
  },
  'geographie-voisins-france': {
    text: 'Combien de pays partagent une frontière terrestre avec la France métropolitaine ? Les micro-États comptent aussi.',
    unit: 'pays',
    source: 'IGN (Institut national de l’information géographique et forestière)',
  },
  'geographie-pas-de-calais': {
    text: 'Quelle est la largeur du pas de Calais à son point le plus étroit, en kilomètres, à la dizaine près ?',
    unit: 'km',
    source: 'Encyclopædia Britannica',
  },
  'geographie-cantons-suisses': {
    text: 'Combien de cantons compte la Suisse ? Précision suisse exigée.',
    unit: 'cantons',
    source: 'Confédération suisse (admin.ch)',
  },
  'geographie-fuseau-horaire': {
    text: 'Combien de degrés de longitude couvre un fuseau horaire théorique ?',
    unit: 'degrés',
    source: 'Observatoire de Paris',
  },
  'geographie-paris-new-york': {
    text: 'Quelle distance à vol d’oiseau sépare Paris de New York, en kilomètres, au millier près ?',
    unit: 'km',
    source: 'Géoportail (IGN)',
  },
  'geographie-corse': {
    text: 'Quelle est la superficie de la Corse, en kilomètres carrés, au millier près ?',
    unit: 'km²',
    source: 'Insee',
  },
  'geographie-leman': {
    text: 'Quelle est la profondeur maximale du lac Léman, en mètres, à la dizaine près ?',
    unit: 'm',
    source: 'CIPEL (Commission internationale pour la protection des eaux du Léman)',
  },
  'histoire-bastille': {
    text: 'En quelle année les Parisiens ont-ils pris la Bastille ?',
    unit: 'année',
    source: 'Encyclopédie Larousse',
  },
  'histoire-premier-pas-lune': {
    text: 'En quelle année Neil Armstrong a-t-il fait le premier pas humain sur la Lune ?',
    unit: 'année',
    source: 'NASA',
  },
  'histoire-chute-mur-berlin': {
    text: 'En quelle année le mur de Berlin est-il tombé ?',
    unit: 'année',
    source: 'Encyclopédie Larousse',
  },
  'histoire-colomb-amerique': {
    text: 'En quelle année Christophe Colomb a-t-il atteint l’Amérique pour la première fois ? Lui croyait débarquer aux Indes.',
    unit: 'année',
    source: 'Encyclopédie Larousse',
  },
  'histoire-hastings': {
    text: 'En quelle année Guillaume le Conquérant a-t-il remporté la bataille d’Hastings ?',
    unit: 'année',
    source: 'Encyclopædia Britannica',
  },
  'histoire-charlemagne-empereur': {
    text: 'En quelle année Charlemagne a-t-il été couronné empereur ? Indice : un compte bien rond.',
    unit: 'année',
    source: 'Encyclopédie Larousse',
  },
  'histoire-marignan': {
    text: 'En quelle année François Ier a-t-il remporté la bataille de Marignan ?',
    unit: 'année',
    source: 'Encyclopédie Larousse',
  },
  'histoire-guerre-cent-ans': {
    text: 'Combien d’années a réellement duré la guerre de Cent Ans ? Indice : son nom est un peu menteur.',
    unit: 'ans',
    source: 'Encyclopédie Larousse',
  },
  'histoire-regne-louis-xiv': {
    text: 'Combien d’années complètes a duré le règne de Louis XIV, le plus long de l’histoire de France ?',
    unit: 'ans',
    source: 'Château de Versailles',
  },
  'histoire-regne-elisabeth-ii': {
    text: 'Combien d’années complètes Élisabeth II a-t-elle régné sur le Royaume-Uni ?',
    unit: 'ans',
    source: 'The Royal Household (royal.uk)',
  },
  'histoire-fondation-rome': {
    text: 'Selon la légende, en quelle année avant J.-C. Romulus a-t-il fondé Rome ?',
    unit: 'av. J.-C.',
    source: 'Encyclopædia Britannica',
  },
  'histoire-alesia': {
    text: 'En quelle année avant J.-C. Vercingétorix a-t-il déposé les armes devant César à Alésia ?',
    unit: 'av. J.-C.',
    source: 'Encyclopédie Larousse',
  },
  'histoire-pompei': {
    text: 'En quelle année de notre ère le Vésuve a-t-il enseveli Pompéi ?',
    unit: 'année',
    source: 'Encyclopædia Britannica',
  },
  'histoire-duree-mur-berlin': {
    text: 'Combien d’années complètes le mur de Berlin est-il resté debout ?',
    unit: 'ans',
    source: 'Encyclopédie Larousse',
  },
  'histoire-gagarine': {
    text: 'En quelle année Youri Gagarine est-il devenu le premier humain à voyager dans l’espace ?',
    unit: 'année',
    source: 'Encyclopædia Britannica',
  },
  'histoire-marcheurs-lune': {
    text: 'Combien d’astronautes ont marché sur la Lune pendant le programme Apollo ?',
    unit: 'astronautes',
    source: 'NASA',
  },
  'histoire-epouses-henri-viii': {
    text: 'Combien d’épouses le roi d’Angleterre Henri VIII a-t-il eues ? Il ne faisait pas les choses à moitié.',
    unit: 'épouses',
    source: 'Encyclopædia Britannica',
  },
  'histoire-longueur-titanic': {
    text: 'Quelle était la longueur du Titanic, en mètres, à la dizaine près ?',
    unit: 'm',
    source: 'Encyclopædia Britannica',
  },
  'histoire-statue-liberte': {
    text: 'Sans son socle, combien mesure la statue de la Liberté, des pieds au bout de la torche, en mètres, au mètre près ?',
    unit: 'm',
    source: 'National Park Service (États-Unis)',
  },
  'histoire-pyramide-kheops': {
    text: 'À sa construction, quelle hauteur atteignait la pyramide de Khéops, en mètres, à la dizaine près ?',
    unit: 'm',
    source: 'Encyclopædia Britannica',
  },
  'histoire-plages-debarquement': {
    text: 'Sur combien de plages les Alliés ont-ils débarqué en Normandie le 6 juin 1944 ?',
    unit: 'plages',
    source: 'Mémorial de Caen',
  },
  'histoire-bleriot-manche': {
    text: 'En quelle année Louis Blériot a-t-il traversé la Manche en avion ?',
    unit: 'année',
    source: 'Musée de l’Air et de l’Espace',
  },
  'sciences-vitesse-lumiere': {
    text: 'À quelle vitesse file la lumière dans le vide, en kilomètres par seconde, à l’unité près ?',
    unit: 'km/s',
    source: 'Bureau international des poids et mesures (BIPM)',
  },
  'sciences-distance-lune': {
    text: 'Quelle distance moyenne sépare la Terre de la Lune, en kilomètres, au millier près ?',
    unit: 'km',
    source: 'NASA',
  },
  'sciences-distance-soleil': {
    text: 'Quelle distance moyenne sépare la Terre du Soleil, en kilomètres, au million près ?',
    unit: 'km',
    source: 'Union astronomique internationale (UAI)',
  },
  'sciences-planetes': {
    text: 'Combien de planètes compte officiellement le Système solaire ? Pluton boude encore.',
    unit: 'planètes',
    source: 'Union astronomique internationale (UAI)',
  },
  'sciences-protons-or': {
    text: 'Combien de protons compte le noyau d’un atome d’or ? C’est aussi son numéro atomique.',
    unit: 'protons',
    source: 'IUPAC (Union internationale de chimie pure et appliquée)',
  },
  'sciences-ebullition-fahrenheit': {
    text: 'À combien de degrés Fahrenheit l’eau bout-elle au niveau de la mer ?',
    unit: '°F',
    source: 'NIST (National Institute of Standards and Technology)',
  },
  'sciences-zero-absolu': {
    text: 'Quelle est la température du zéro absolu, en degrés Celsius, à l’unité près ? Plus froid, c’est impossible.',
    unit: '°C',
    source: 'Bureau international des poids et mesures (BIPM)',
  },
  'sciences-vitesse-son': {
    text: 'À quelle vitesse le son se propage-t-il dans l’air à 20 °C, en mètres par seconde, à la dizaine près ?',
    unit: 'm/s',
    source: 'Encyclopædia Britannica',
  },
  'sciences-pesanteur': {
    text: 'Quelle est l’accélération de la pesanteur à la surface de la Terre, en m/s², au centième près ?',
    unit: 'm/s²',
    source: 'Bureau international des poids et mesures (BIPM)',
  },
  'sciences-cou-girafe': {
    text: 'Combien de vertèbres compte le long cou d’une girafe ? Indice : pas une de plus que le tien.',
    unit: 'vertèbres',
    source: 'Muséum national d’Histoire naturelle',
  },
  'sciences-coeurs-pieuvre': {
    text: 'Combien de cœurs possède une pieuvre ? De quoi aimer sans compter.',
    unit: 'cœurs',
    source: 'Muséum national d’Histoire naturelle',
  },
  'sciences-gestation-elephant': {
    text: 'Combien de mois dure la gestation d’une éléphante d’Afrique, au mois près ? Et dire qu’on trouve neuf mois longs.',
    unit: 'mois',
    source: 'Encyclopædia Britannica',
  },
  'sciences-dents-chien': {
    text: 'Combien de dents compte un chien adulte ? Largement de quoi s’occuper de tes chaussons.',
    unit: 'dents',
    source: 'Encyclopædia Britannica',
  },
  'sciences-annee-mars': {
    text: 'Combien de jours terrestres dure une année sur Mars, à l’unité près ? Les anniversaires s’y font rares.',
    unit: 'jours',
    source: 'NASA',
  },
  'sciences-terres-dans-soleil': {
    text: 'Combien de fois le volume de la Terre tient-il dans celui du Soleil, à la centaine de milliers près ? On se sent tout petit, d’un coup.',
    unit: 'fois',
    source: 'NASA',
  },
  'sciences-age-univers': {
    text: 'Quel âge a l’Univers, en milliards d’années, au dixième près ? Il les porte plutôt bien.',
    unit: 'milliards d’années',
    source: 'Agence spatiale européenne (mission Planck)',
  },
  'sciences-trajet-lumiere-soleil': {
    text: 'Combien de secondes met la lumière du Soleil pour arriver jusqu’à nous, à la dizaine près ?',
    unit: 's',
    source: 'NASA',
  },
  'sciences-azote-liquide': {
    text: 'À quelle température l’azote devient-il liquide, en degrés Celsius, à l’unité près ?',
    unit: '°C',
    source: 'Encyclopædia Britannica',
  },
  'sciences-ligne-karman': {
    text: 'Selon la Fédération aéronautique internationale, à quelle altitude commence l’espace, en kilomètres ?',
    unit: 'km',
    source: 'Fédération aéronautique internationale (FAI)',
  },
  'sciences-rotation-venus': {
    text: 'Combien de jours terrestres met Vénus pour faire un tour sur elle-même, à l’unité près ? Indice : c’est plus long que son année.',
    unit: 'jours',
    source: 'NASA',
  },
  'sciences-yeux-abeille': {
    text: 'Combien d’yeux possède une abeille ? Indice : plus que deux.',
    unit: 'yeux',
    source: 'Muséum national d’Histoire naturelle',
  },
  'sciences-annee-lumiere': {
    text: 'Combien de milliards de kilomètres la lumière parcourt-elle en un an, à la centaine près ?',
    unit: 'milliards de km',
    source: 'Union astronomique internationale (UAI)',
  },
  'sport-joueurs-rugby': {
    text: 'Combien de joueurs au total foulent la pelouse au coup d’envoi d’un match de rugby à XV ?',
    unit: 'joueurs',
    source: 'World Rugby',
  },
  'sport-point-penalty': {
    text: 'À combien de mètres de la ligne de but se trouve le point de penalty ?',
    unit: 'm',
    source: 'IFAB (Lois du jeu)',
  },
  'sport-hauteur-panier': {
    text: 'À quelle hauteur est fixé un panier de basket, en centimètres ?',
    unit: 'cm',
    source: 'FIBA (Fédération internationale de basket-ball)',
  },
  'sport-filet-volley': {
    text: 'Quelle est la hauteur du filet de volley-ball chez les hommes, en centimètres ?',
    unit: 'cm',
    source: 'FIVB (Fédération internationale de volley-ball)',
  },
  'sport-marathon': {
    text: 'Combien de mètres exactement faut-il courir pour boucler un marathon ? Chaque mètre compte, surtout le dernier.',
    unit: 'm',
    source: 'World Athletics',
  },
  'sport-duree-basket': {
    text: 'Combien de minutes de jeu compte un match de basket selon les règles FIBA, hors prolongation ?',
    unit: 'min',
    source: 'FIBA (Fédération internationale de basket-ball)',
  },
  'sport-largeur-but': {
    text: 'Quelle est la largeur d’un but de football entre les deux poteaux, en centimètres ? Les attaquants la trouvent toujours trop petite.',
    unit: 'cm',
    source: 'IFAB (Lois du jeu)',
  },
  'sport-court-tennis': {
    text: 'Quelle est la longueur d’un court de tennis, en mètres, à l’unité près ?',
    unit: 'm',
    source: 'Fédération internationale de tennis (ITF)',
  },
  'sport-billes-snooker': {
    text: 'Combien de billes, blanche comprise, sont posées sur la table au début d’une partie de snooker ?',
    unit: 'billes',
    source: 'WPBSA (World Professional Billiards and Snooker Association)',
  },
  'sport-flechettes-max': {
    text: 'Quel est le meilleur score possible en lançant trois fléchettes ?',
    unit: 'points',
    source: 'World Darts Federation',
  },
  'sport-bowling-parfait': {
    text: 'Quel est le score d’une partie parfaite au bowling ? Un score que l’on voit rarement s’afficher en soirée.',
    unit: 'points',
    source: 'International Bowling Federation',
  },
  'sport-premier-tour-de-france': {
    text: 'En quelle année s’est élancé le tout premier Tour de France ?',
    unit: 'année',
    source: 'Amaury Sport Organisation (ASO)',
  },
  'sport-premiers-jo-modernes': {
    text: 'En quelle année se sont tenus les premiers Jeux olympiques modernes, à Athènes ?',
    unit: 'année',
    source: 'Comité international olympique (CIO)',
  },
  'sport-points-petanque': {
    text: 'Combien de points faut-il marquer pour gagner une partie de pétanque ? Alors, tu tires ou tu pointes ?',
    unit: 'points',
    source: 'Fédération française de pétanque et jeu provençal',
  },
  'sport-tours-10000': {
    text: 'Combien de tours d’une piste de 400 mètres faut-il boucler pour courir un 10 000 mètres ?',
    unit: 'tours',
    source: 'World Athletics',
  },
  'sport-ironman': {
    text: 'Natation, vélo et course à pied réunis : combien de kilomètres compte un triathlon Ironman, à l’unité près ?',
    unit: 'km',
    source: 'Ironman',
  },
  'sport-tir-arc': {
    text: 'À quelle distance de la cible tirent les archers aux Jeux olympiques (arc classique), en mètres ?',
    unit: 'm',
    source: 'World Archery',
  },
  'sport-trou-golf': {
    text: 'Quel est le diamètre d’un trou de golf, en millimètres, à l’unité près ? Vu du départ, il paraît minuscule.',
    unit: 'mm',
    source: 'The R&A (Règles du golf)',
  },
  'sport-plumes-badminton': {
    text: 'Combien de plumes compte un volant de badminton réglementaire ?',
    unit: 'plumes',
    source: 'Badminton World Federation (BWF)',
  },
  'sport-distance-lanceur': {
    text: 'Au baseball, quelle distance sépare la plaque du lanceur du marbre, en centimètres, à l’unité près ?',
    unit: 'cm',
    source: 'Major League Baseball (Règles officielles)',
  },
  'sport-mur-coup-franc': {
    text: 'Sur un coup franc, à combien de centimètres du ballon le mur doit-il se tenir au minimum ?',
    unit: 'cm',
    source: 'IFAB (Lois du jeu)',
  },
  'societe-cases-echiquier': {
    text: 'Combien de cases compte un échiquier ? Échec et maths.',
    unit: 'cases',
    source: 'FIDE (Fédération internationale des échecs)',
  },
  'societe-cartes-tarot': {
    text: 'Combien de cartes compte un jeu de tarot, Excuse comprise ?',
    unit: 'cartes',
    source: 'Fédération française de tarot',
  },
  'societe-faces-opposees-de': {
    text: 'Sur un dé classique à six faces, combien font deux faces opposées additionnées ? Toujours le même total.',
    unit: 'points',
    source: 'Encyclopædia Britannica',
  },
  'societe-cases-monopoly': {
    text: 'Combien de cases compte le plateau du Monopoly classique, case Départ comprise ?',
    unit: 'cases',
    source: 'Hasbro',
  },
  'societe-dominos': {
    text: 'Combien de pièces compte un jeu de dominos classique, du double blanc au double six ?',
    unit: 'dominos',
    source: 'Encyclopædia Britannica',
  },
  'societe-cases-scrabble': {
    text: 'Combien de cases compte un plateau de Scrabble ?',
    unit: 'cases',
    source: 'FISF (Fédération internationale de Scrabble francophone)',
  },
  'societe-positions-rubik': {
    text: 'Combien de positions différentes peut prendre un Rubik’s Cube, en milliards de milliards, à l’unité près ? Bon courage pour toutes les essayer.',
    unit: 'milliards de milliards',
    source: 'Encyclopædia Britannica',
  },
  'societe-carres-rubik': {
    text: 'Combien de petits carrés colorés recouvrent un Rubik’s Cube classique ?',
    unit: 'carrés',
    source: 'Rubik’s Brand Ltd',
  },
  'societe-rivets-tour-eiffel': {
    text: 'Combien de rivets maintiennent la tour Eiffel debout, à la centaine de milliers près ?',
    unit: 'rivets',
    source: 'SETE (Société d’exploitation de la tour Eiffel)',
  },
  'societe-feuille-a4': {
    text: 'Quelle est la longueur d’une feuille A4, en millimètres ?',
    unit: 'mm',
    source: 'Norme ISO 216',
  },
  'societe-a4-dans-a0': {
    text: 'Combien de feuilles A4 peut-on découper dans une seule feuille A0 ?',
    unit: 'feuilles',
    source: 'Norme ISO 216',
  },
  'societe-piece-2-euros': {
    text: 'Combien pèse une pièce de 2 euros, en grammes, au dixième près ?',
    unit: 'g',
    source: 'Banque centrale européenne',
  },
  'societe-cases-sudoku': {
    text: 'Combien de cases compte une grille de sudoku classique ?',
    unit: 'cases',
    source: 'Encyclopædia Britannica',
  },
  'societe-code-barres': {
    text: 'Combien de chiffres s’alignent sous le code-barres classique (EAN) des produits de supermarché ?',
    unit: 'chiffres',
    source: 'GS1',
  },
  'societe-jeu-oie': {
    text: 'Combien de cases compte le parcours du jeu de l’oie traditionnel ? Gare au puits.',
    unit: 'cases',
    source: 'Bibliothèque nationale de France',
  },
  'societe-goban': {
    text: 'Combien d’intersections compte un goban, le plateau officiel du jeu de go ?',
    unit: 'intersections',
    source: 'Fédération française de go',
  },
  'societe-cases-puissance-4': {
    text: 'Combien de cases compte la grille d’un Puissance 4 ?',
    unit: 'cases',
    source: 'Hasbro',
  },
  'societe-mois-31-jours': {
    text: 'Combien de mois de l’année comptent 31 jours ? Les bosses de tes poings peuvent t’aider.',
    unit: 'mois',
    source: 'IMCCE (Observatoire de Paris)',
  },
  'societe-pixels-full-hd': {
    text: 'Combien de pixels compte un écran Full HD, à la centaine de milliers près ?',
    unit: 'pixels',
    source: 'UIT (Union internationale des télécommunications)',
  },
  'societe-secondes-jour': {
    text: 'Combien de secondes compte une journée de 24 heures ?',
    unit: 's',
    source: 'Bureau international des poids et mesures (BIPM)',
  },
  'societe-briques-lego': {
    text: 'De combien de façons peut-on assembler six briques LEGO 2 × 4 de la même couleur, au million près ?',
    unit: 'combinaisons',
    source: 'Søren Eilers (Université de Copenhague)',
  },
  'culture-touches-piano': {
    text: 'Combien de touches compte un piano classique, blanches et noires réunies ?',
    unit: 'touches',
    source: 'Encyclopædia Britannica',
  },
  'culture-cordes-harpe': {
    text: 'Combien de cordes compte une harpe de concert ?',
    unit: 'cordes',
    source: 'Encyclopædia Britannica',
  },
  'culture-symphonies-beethoven': {
    text: 'Combien de symphonies Beethoven a-t-il achevées ?',
    unit: 'symphonies',
    source: 'Encyclopædia Britannica',
  },
  'culture-age-mozart': {
    text: 'Combien d’années complètes a vécu Mozart ? Une carrière express.',
    unit: 'ans',
    source: 'Encyclopædia Britannica',
  },
  'culture-hauteur-joconde': {
    text: 'Quelle est la hauteur de La Joconde, cadre non compris, en centimètres, à la dizaine près ? Plus petite qu’on ne l’imagine.',
    unit: 'cm',
    source: 'Musée du Louvre',
  },
  'culture-ouverture-louvre': {
    text: 'En quelle année le Louvre a-t-il ouvert ses portes au public en tant que musée ?',
    unit: 'année',
    source: 'Musée du Louvre',
  },
  'culture-tour-du-monde': {
    text: 'Dans le roman de Jules Verne, en combien de jours Phileas Fogg s’engage-t-il à faire le tour du monde ?',
    unit: 'jours',
    source: 'Bibliothèque nationale de France',
  },
  'culture-fahrenheit-bradbury': {
    text: 'D’après le titre du roman de Ray Bradbury, à combien de degrés Fahrenheit le papier s’enflamme-t-il ?',
    unit: '°F',
    source: 'Encyclopædia Britannica',
  },
  'culture-premier-tintin': {
    text: 'En quelle année Tintin est-il apparu pour la toute première fois ?',
    unit: 'année',
    source: 'Tintinimaginatio (ex-Moulinsart)',
  },
  'culture-premier-asterix': {
    text: 'En quelle année Astérix le Gaulois est-il né dans le journal « Pilote » ?',
    unit: 'année',
    source: 'Éditions Albert René',
  },
  'culture-sonnets-shakespeare': {
    text: 'Combien de sonnets compte le recueil de Shakespeare publié en 1609 ?',
    unit: 'sonnets',
    source: 'Folger Shakespeare Library',
  },
  'culture-syllabes-haiku': {
    text: 'Combien de syllabes compte un haïku traditionnel ?',
    unit: 'syllabes',
    source: 'Encyclopædia Britannica',
  },
  'culture-episodes-friends': {
    text: 'Combien d’épisodes compte la série « Friends » en tout ? Pivot !',
    unit: 'épisodes',
    source: 'Warner Bros. Television',
  },
  'culture-episodes-game-of-thrones': {
    text: 'Combien d’épisodes compte la série « Game of Thrones », du premier au dernier ?',
    unit: 'épisodes',
    source: 'HBO',
  },
  'culture-pokemon-premiere-generation': {
    text: 'Combien de Pokémon comptait la toute première génération ? Attrapez-les tous !',
    unit: 'Pokémon',
    source: 'The Pokémon Company',
  },
  'culture-formes-tetris': {
    text: 'Combien de formes de pièces différentes tombent dans Tetris ? Oui, la barre tant attendue en fait partie.',
    unit: 'formes',
    source: 'The Tetris Company',
  },
  'culture-niveaux-super-mario': {
    text: 'Combien de niveaux compte le tout premier « Super Mario Bros. », sorti en 1985 ? La princesse est souvent dans un autre château.',
    unit: 'niveaux',
    source: 'Nintendo',
  },
  'culture-duree-433-cage': {
    text: 'Combien de secondes dure « 4′33″ », le célèbre morceau silencieux de John Cage ?',
    unit: 's',
    source: 'Encyclopædia Britannica',
  },
  'culture-anneaux-pouvoir': {
    text: 'Dans « Le Seigneur des anneaux », combien d’anneaux de pouvoir compte le célèbre poème, l’Anneau unique compris ?',
    unit: 'anneaux',
    source: 'J. R. R. Tolkien, « Le Seigneur des anneaux »',
  },
  'culture-images-par-seconde': {
    text: 'Combien d’images par seconde défilent dans un film de cinéma classique ?',
    unit: 'images/s',
    source: 'CNC (Centre national du cinéma et de l’image animée)',
  },
  'culture-premier-star-wars': {
    text: 'En quelle année le tout premier film « Star Wars » est-il sorti au cinéma ?',
    unit: 'année',
    source: 'Lucasfilm',
  },
}
