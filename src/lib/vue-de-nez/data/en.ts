import type { VdnQuestionId } from './questions'
import type { VdnQuestionText } from './types'

/**
 * Textes ANGLAIS : traduction de fr.ts, id pour id. La réponse vit dans questions.ts, commune aux
 * 4 langues : chaque énoncé garde le sens, l’unité métrique et l’arrondi du français (jamais de
 * miles ni de pieds). Orthographe britannique (metres, colour), apostrophe et guillemets
 * typographiques (’ “ ”). Sources inchangées, sous leur nom anglais officiel quand il existe.
 */
export const VDN_TEXTS: Readonly<Record<VdnQuestionId, VdnQuestionText>> = {
  'corps-os-adulte': {
    text: 'How many bones make up an adult skeleton? Yes, even your mate who dances like they haven’t got a single one.',
    unit: 'bones',
    source: 'Gray’s Anatomy',
  },
  'corps-dents-adulte': {
    text: 'How many teeth does a full adult set have, wisdom teeth included?',
    unit: 'teeth',
    source: 'Gray’s Anatomy',
  },
  'corps-dents-lait': {
    text: 'How many baby teeth can the Tooth Fairy collect from a single child?',
    unit: 'teeth',
    source: 'Gray’s Anatomy',
  },
  'corps-paires-cotes': {
    text: 'How many pairs of ribs make up the human ribcage?',
    unit: 'pairs',
    source: 'Gray’s Anatomy',
  },
  'corps-chromosomes': {
    text: 'How many chromosomes are there in the nucleus of an ordinary human cell (reproductive cells aside)?',
    unit: 'chromosomes',
    source: 'Inserm',
  },
  'corps-osselets-oreille': {
    text: 'How many ossicles are tucked away in each of your ears? They’re the smallest bones in the body.',
    unit: 'ossicles',
    source: 'Gray’s Anatomy',
  },
  'corps-os-main': {
    text: 'How many bones are there in a human hand, wrist included?',
    unit: 'bones',
    source: 'Gray’s Anatomy',
  },
  'corps-os-pied': {
    text: 'How many bones are there in a human foot? Spare a thought for your toes: they count.',
    unit: 'bones',
    source: 'Gray’s Anatomy',
  },
  'corps-phalanges': {
    text: 'How many phalanges are there altogether in your two hands and two feet? Counting on your fingers is allowed.',
    unit: 'phalanges',
    source: 'Gray’s Anatomy',
  },
  'corps-nerfs-rachidiens': {
    text: 'How many pairs of nerves branch out from the spinal cord?',
    unit: 'pairs',
    source: 'Gray’s Anatomy',
  },
  'corps-muscles-oeil': {
    text: 'How many muscles move a single eye around in its socket? Very handy for rolling your eyes.',
    unit: 'muscles',
    source: 'Gray’s Anatomy',
  },
  'corps-lobes-poumons': {
    text: 'How many lobes do your two lungs have between them?',
    unit: 'lobes',
    source: 'Gray’s Anatomy',
  },
  'corps-groupes-sanguins': {
    text: 'Combining the ABO system with the Rhesus factor (positive or negative), how many different blood groups do you get?',
    unit: 'blood groups',
    source: 'French Blood Establishment (EFS)',
  },
  'corps-globule-rouge': {
    text: 'On average, how many days does a red blood cell live before it gets recycled?',
    unit: 'days',
    source: 'French Blood Establishment (EFS)',
  },
  'corps-nerfs-craniens': {
    text: 'How many pairs of cranial nerves come straight out of your brain? Smell and sight each get their own.',
    unit: 'pairs',
    source: 'Gray’s Anatomy',
  },
  'corps-vertebres-mobiles': {
    text: 'Not counting the fused vertebrae of the sacrum and coccyx, how many vertebrae are stacked up in an adult’s spine? Enough to hold your head high.',
    unit: 'vertebrae',
    source: 'Gray’s Anatomy',
  },
  'corps-longueur-adn': {
    text: 'Unravelled and laid end to end, how many metres would the DNA from just one of your cells measure, to the nearest metre?',
    unit: 'm',
    source: 'Inserm',
  },
  'corps-genome-paires-bases': {
    text: 'How many base pairs (those famous letters A, T, C and G) make up the human genome, to the nearest billion?',
    unit: 'base pairs',
    source: 'National Human Genome Research Institute (NHGRI)',
  },
  'corps-neurones': {
    text: 'According to the 2009 study by Azevedo and colleagues, how many neurons are there in an adult human brain, to the nearest billion? Yes, even on a Monday morning.',
    unit: 'neurons',
    source: 'Azevedo et al., Journal of Comparative Neurology (2009)',
  },
  'corps-audition-aigus': {
    text: 'Up to what frequency, in hertz, can a young adult’s ear pick up high-pitched sounds?',
    unit: 'Hz',
    source: 'Inserm',
  },
  'corps-types-cones': {
    text: 'How many types of cones, the cells that detect colour, are there in the human retina?',
    unit: 'types',
    source: 'Encyclopædia Britannica',
  },
  'geographie-everest': {
    text: 'According to the official 2020 measurement, how high is Mount Everest, to the nearest metre?',
    unit: 'm',
    source: 'Encyclopædia Britannica',
  },
  'geographie-mont-blanc': {
    text: 'How high is Mont Blanc, to the nearest hundred metres?',
    unit: 'm',
    source: 'IGN (French National Institute of Geographic and Forest Information)',
  },
  'geographie-tour-equateur': {
    text: 'How far is it all the way round the Earth along the equator, to the nearest thousand kilometres?',
    unit: 'km',
    source: 'Encyclopædia Britannica',
  },
  'geographie-fosse-mariannes': {
    text: 'What is the maximum depth of the Mariana Trench, to the nearest thousand metres?',
    unit: 'm',
    source: 'NOAA (National Oceanic and Atmospheric Administration)',
  },
  'geographie-nil': {
    text: 'How long is the Nile, to the nearest thousand kilometres?',
    unit: 'km',
    source: 'Encyclopædia Britannica',
  },
  'geographie-loire': {
    text: 'How long is the Loire, France’s longest river, to the nearest hundred kilometres?',
    unit: 'km',
    source: 'Sandre (French national water data reference system)',
  },
  'geographie-seine': {
    text: 'How long is the Seine, from its source to the English Channel, to the nearest hundred kilometres?',
    unit: 'km',
    source: 'Sandre (French national water data reference system)',
  },
  'geographie-baikal': {
    text: 'What is the maximum depth of Lake Baikal, the deepest lake in the world, to the nearest hundred metres?',
    unit: 'm',
    source: 'Encyclopædia Britannica',
  },
  'geographie-kilimandjaro': {
    text: 'How high is Kilimanjaro, the roof of Africa, to the nearest hundred metres?',
    unit: 'm',
    source: 'Encyclopædia Britannica',
  },
  'geographie-sahara': {
    text: 'What is the area of the Sahara, to the nearest million square kilometres? Don’t forget the sun cream.',
    unit: 'km²',
    source: 'Encyclopædia Britannica',
  },
  'geographie-groenland': {
    text: 'What is the area of Greenland, the largest island in the world, to the nearest million square kilometres?',
    unit: 'km²',
    source: 'Encyclopædia Britannica',
  },
  'geographie-titicaca': {
    text: 'At what altitude does Lake Titicaca sit, to the nearest hundred metres?',
    unit: 'm',
    source: 'Encyclopædia Britannica',
  },
  'geographie-salto-angel': {
    text: 'How tall is Angel Falls, the highest waterfall in the world, to the nearest hundred metres?',
    unit: 'm',
    source: 'Encyclopædia Britannica',
  },
  'geographie-mont-fuji': {
    text: 'How high is Mount Fuji, star of Japanese woodblock prints, to the nearest hundred metres?',
    unit: 'm',
    source: 'Encyclopædia Britannica',
  },
  'geographie-part-oceans': {
    text: 'What percentage of the Earth’s surface is covered by ocean, to the nearest per cent?',
    unit: '%',
    source: 'NOAA (National Oceanic and Atmospheric Administration)',
  },
  'geographie-voisins-france': {
    text: 'How many countries share a land border with mainland France? Microstates count too.',
    unit: 'countries',
    source: 'IGN (French National Institute of Geographic and Forest Information)',
  },
  'geographie-pas-de-calais': {
    text: 'How wide is the Strait of Dover at its narrowest point, to the nearest ten kilometres?',
    unit: 'km',
    source: 'Encyclopædia Britannica',
  },
  'geographie-cantons-suisses': {
    text: 'How many cantons does Switzerland have? Swiss precision required.',
    unit: 'cantons',
    source: 'Swiss Confederation (admin.ch)',
  },
  'geographie-fuseau-horaire': {
    text: 'How many degrees of longitude does a theoretical time zone cover?',
    unit: 'degrees',
    source: 'Paris Observatory',
  },
  'geographie-paris-new-york': {
    text: 'As the crow flies, how far is Paris from New York, to the nearest thousand kilometres?',
    unit: 'km',
    source: 'Géoportail (IGN)',
  },
  'geographie-corse': {
    text: 'What is the area of Corsica, to the nearest thousand square kilometres?',
    unit: 'km²',
    source: 'Insee',
  },
  'geographie-leman': {
    text: 'What is the maximum depth of Lake Geneva, to the nearest ten metres?',
    unit: 'm',
    source: 'CIPEL (International Commission for the Protection of the Waters of Lake Geneva)',
  },
  'histoire-bastille': {
    text: 'In what year did Parisians storm the Bastille?',
    unit: 'year',
    source: 'Larousse Encyclopedia',
  },
  'histoire-premier-pas-lune': {
    text: 'In what year did Neil Armstrong take the first human step on the Moon?',
    unit: 'year',
    source: 'NASA',
  },
  'histoire-chute-mur-berlin': {
    text: 'In what year did the Berlin Wall fall?',
    unit: 'year',
    source: 'Larousse Encyclopedia',
  },
  'histoire-colomb-amerique': {
    text: 'In what year did Christopher Columbus first reach the Americas? He thought he’d landed in the Indies.',
    unit: 'year',
    source: 'Larousse Encyclopedia',
  },
  'histoire-hastings': {
    text: 'In what year did William the Conqueror win the Battle of Hastings?',
    unit: 'year',
    source: 'Encyclopædia Britannica',
  },
  'histoire-charlemagne-empereur': {
    text: 'In what year was Charlemagne crowned emperor? Hint: it’s a nice round number.',
    unit: 'year',
    source: 'Larousse Encyclopedia',
  },
  'histoire-marignan': {
    text: 'In what year did King Francis I of France win the Battle of Marignano?',
    unit: 'year',
    source: 'Larousse Encyclopedia',
  },
  'histoire-guerre-cent-ans': {
    text: 'How many years did the Hundred Years’ War actually last? Hint: its name tells a little fib.',
    unit: 'years',
    source: 'Larousse Encyclopedia',
  },
  'histoire-regne-louis-xiv': {
    text: 'How many full years did the reign of Louis XIV last, the longest in French history?',
    unit: 'years',
    source: 'Palace of Versailles',
  },
  'histoire-regne-elisabeth-ii': {
    text: 'How many full years did Elizabeth II reign over the United Kingdom?',
    unit: 'years',
    source: 'The Royal Household (royal.uk)',
  },
  'histoire-fondation-rome': {
    text: 'According to legend, in what year BC did Romulus found Rome?',
    unit: 'BC',
    source: 'Encyclopædia Britannica',
  },
  'histoire-alesia': {
    text: 'In what year BC did Vercingetorix lay down his arms before Caesar at Alesia?',
    unit: 'BC',
    source: 'Larousse Encyclopedia',
  },
  'histoire-pompei': {
    text: 'In what year AD did Vesuvius bury Pompeii?',
    unit: 'year',
    source: 'Encyclopædia Britannica',
  },
  'histoire-duree-mur-berlin': {
    text: 'How many full years did the Berlin Wall stay standing?',
    unit: 'years',
    source: 'Larousse Encyclopedia',
  },
  'histoire-gagarine': {
    text: 'In what year did Yuri Gagarin become the first human to travel into space?',
    unit: 'year',
    source: 'Encyclopædia Britannica',
  },
  'histoire-marcheurs-lune': {
    text: 'How many astronauts walked on the Moon during the Apollo programme?',
    unit: 'astronauts',
    source: 'NASA',
  },
  'histoire-epouses-henri-viii': {
    text: 'How many wives did King Henry VIII of England have? He never did things by halves.',
    unit: 'wives',
    source: 'Encyclopædia Britannica',
  },
  'histoire-longueur-titanic': {
    text: 'How long was the Titanic, to the nearest ten metres?',
    unit: 'm',
    source: 'Encyclopædia Britannica',
  },
  'histoire-statue-liberte': {
    text: 'Pedestal aside, how tall is the Statue of Liberty from toe to torch, to the nearest metre?',
    unit: 'm',
    source: 'US National Park Service',
  },
  'histoire-pyramide-kheops': {
    text: 'When it was first built, how tall was the Great Pyramid of Giza, to the nearest ten metres?',
    unit: 'm',
    source: 'Encyclopædia Britannica',
  },
  'histoire-plages-debarquement': {
    text: 'On how many beaches did the Allies land in Normandy on 6 June 1944?',
    unit: 'beaches',
    source: 'Caen Memorial',
  },
  'histoire-bleriot-manche': {
    text: 'In what year did Louis Blériot fly across the English Channel?',
    unit: 'year',
    source: 'French Air and Space Museum',
  },
  'sciences-vitesse-lumiere': {
    text: 'How fast does light zip through a vacuum, to the nearest kilometre per second?',
    unit: 'km/s',
    source: 'International Bureau of Weights and Measures (BIPM)',
  },
  'sciences-distance-lune': {
    text: 'What is the average distance between the Earth and the Moon, to the nearest thousand kilometres?',
    unit: 'km',
    source: 'NASA',
  },
  'sciences-distance-soleil': {
    text: 'What is the average distance between the Earth and the Sun, to the nearest million kilometres?',
    unit: 'km',
    source: 'International Astronomical Union (IAU)',
  },
  'sciences-planetes': {
    text: 'How many planets does the Solar System officially have? Pluto is still sulking.',
    unit: 'planets',
    source: 'International Astronomical Union (IAU)',
  },
  'sciences-protons-or': {
    text: 'How many protons are there in the nucleus of a gold atom? That’s also its atomic number.',
    unit: 'protons',
    source: 'IUPAC (International Union of Pure and Applied Chemistry)',
  },
  'sciences-ebullition-fahrenheit': {
    text: 'At how many degrees Fahrenheit does water boil at sea level?',
    unit: '°F',
    source: 'NIST (National Institute of Standards and Technology)',
  },
  'sciences-zero-absolu': {
    text: 'What is absolute zero in degrees Celsius, to the nearest degree? It simply doesn’t get any colder.',
    unit: '°C',
    source: 'International Bureau of Weights and Measures (BIPM)',
  },
  'sciences-vitesse-son': {
    text: 'How fast does sound travel through air at 20 °C, to the nearest ten metres per second?',
    unit: 'm/s',
    source: 'Encyclopædia Britannica',
  },
  'sciences-pesanteur': {
    text: 'What is the acceleration due to gravity at the Earth’s surface, in m/s², to two decimal places?',
    unit: 'm/s²',
    source: 'International Bureau of Weights and Measures (BIPM)',
  },
  'sciences-cou-girafe': {
    text: 'How many vertebrae are there in a giraffe’s long neck? Hint: not a single one more than in yours.',
    unit: 'vertebrae',
    source: 'French National Museum of Natural History',
  },
  'sciences-coeurs-pieuvre': {
    text: 'How many hearts does an octopus have? That’s a lot of love to give.',
    unit: 'hearts',
    source: 'French National Museum of Natural History',
  },
  'sciences-gestation-elephant': {
    text: 'How many months does an African elephant’s pregnancy last, to the nearest month? And to think we find nine months long.',
    unit: 'months',
    source: 'Encyclopædia Britannica',
  },
  'sciences-dents-chien': {
    text: 'How many teeth does an adult dog have? More than enough to make short work of your slippers.',
    unit: 'teeth',
    source: 'Encyclopædia Britannica',
  },
  'sciences-annee-mars': {
    text: 'How many Earth days does a year on Mars last, to the nearest day? Birthdays are few and far between up there.',
    unit: 'days',
    source: 'NASA',
  },
  'sciences-terres-dans-soleil': {
    text: 'How many times would the volume of the Earth fit inside that of the Sun, to the nearest hundred thousand? Suddenly you feel very small.',
    unit: 'times',
    source: 'NASA',
  },
  'sciences-age-univers': {
    text: 'How old is the Universe, in billions of years, to one decimal place? It wears its age rather well.',
    unit: 'billion years',
    source: 'European Space Agency (Planck mission)',
  },
  'sciences-trajet-lumiere-soleil': {
    text: 'How many seconds does sunlight take to reach us, to the nearest ten?',
    unit: 's',
    source: 'NASA',
  },
  'sciences-azote-liquide': {
    text: 'At what temperature does nitrogen turn liquid, in degrees Celsius, to the nearest degree?',
    unit: '°C',
    source: 'Encyclopædia Britannica',
  },
  'sciences-ligne-karman': {
    text: 'According to the World Air Sports Federation (FAI), at what altitude does space begin, in kilometres?',
    unit: 'km',
    source: 'World Air Sports Federation (FAI)',
  },
  'sciences-rotation-venus': {
    text: 'How many Earth days does Venus take to spin once on its axis, to the nearest day? Hint: it’s longer than its year.',
    unit: 'days',
    source: 'NASA',
  },
  'sciences-yeux-abeille': {
    text: 'How many eyes does a bee have? Hint: more than two.',
    unit: 'eyes',
    source: 'French National Museum of Natural History',
  },
  'sciences-annee-lumiere': {
    text: 'How many billion kilometres does light travel in a year, to the nearest hundred?',
    unit: 'billion km',
    source: 'International Astronomical Union (IAU)',
  },
  'sport-joueurs-rugby': {
    text: 'How many players in total are on the pitch at kick-off in a rugby union match?',
    unit: 'players',
    source: 'World Rugby',
  },
  'sport-point-penalty': {
    text: 'In football, how many metres from the goal line is the penalty spot?',
    unit: 'm',
    source: 'IFAB (Laws of the Game)',
  },
  'sport-hauteur-panier': {
    text: 'How high is a basketball hoop, in centimetres?',
    unit: 'cm',
    source: 'FIBA (International Basketball Federation)',
  },
  'sport-filet-volley': {
    text: 'How high is the net in men’s volleyball, in centimetres?',
    unit: 'cm',
    source: 'FIVB (International Volleyball Federation)',
  },
  'sport-marathon': {
    text: 'Exactly how many metres do you have to run to finish a marathon? Every metre counts, especially the last one.',
    unit: 'm',
    source: 'World Athletics',
  },
  'sport-duree-basket': {
    text: 'How many minutes of play are there in a basketball game under FIBA rules, not counting overtime?',
    unit: 'min',
    source: 'FIBA (International Basketball Federation)',
  },
  'sport-largeur-but': {
    text: 'How wide is a football goal between the two posts, in centimetres? Strikers always think it’s too small.',
    unit: 'cm',
    source: 'IFAB (Laws of the Game)',
  },
  'sport-court-tennis': {
    text: 'How long is a tennis court, to the nearest metre?',
    unit: 'm',
    source: 'International Tennis Federation (ITF)',
  },
  'sport-billes-snooker': {
    text: 'How many balls, cue ball included, are on the table at the start of a frame of snooker?',
    unit: 'balls',
    source: 'WPBSA (World Professional Billiards and Snooker Association)',
  },
  'sport-flechettes-max': {
    text: 'What is the highest possible score with three darts?',
    unit: 'points',
    source: 'World Darts Federation',
  },
  'sport-bowling-parfait': {
    text: 'What is the score for a perfect game of ten-pin bowling? Not one you often see flash up on the screen on a night out.',
    unit: 'points',
    source: 'International Bowling Federation',
  },
  'sport-premier-tour-de-france': {
    text: 'In what year did the very first Tour de France set off?',
    unit: 'year',
    source: 'Amaury Sport Organisation (ASO)',
  },
  'sport-premiers-jo-modernes': {
    text: 'In what year were the first modern Olympic Games held, in Athens?',
    unit: 'year',
    source: 'International Olympic Committee (IOC)',
  },
  'sport-points-petanque': {
    text: 'How many points do you need to win a game of pétanque? So, are you pointing or shooting?',
    unit: 'points',
    source: 'French Pétanque and Jeu Provençal Federation',
  },
  'sport-tours-10000': {
    text: 'How many laps of a 400-metre track does it take to run the 10,000 metres?',
    unit: 'laps',
    source: 'World Athletics',
  },
  'sport-ironman': {
    text: 'Swimming, cycling and running combined: how many kilometres is an Ironman triathlon, to the nearest kilometre?',
    unit: 'km',
    source: 'Ironman',
  },
  'sport-tir-arc': {
    text: 'How far from the target do archers shoot at the Olympic Games (recurve bow), in metres?',
    unit: 'm',
    source: 'World Archery',
  },
  'sport-trou-golf': {
    text: 'What is the diameter of a golf hole, to the nearest millimetre? From the tee, it looks tiny.',
    unit: 'mm',
    source: 'The R&A (Rules of Golf)',
  },
  'sport-plumes-badminton': {
    text: 'How many feathers does a regulation badminton shuttlecock have?',
    unit: 'feathers',
    source: 'Badminton World Federation (BWF)',
  },
  'sport-distance-lanceur': {
    text: 'In baseball, how far is the pitcher’s plate from home plate, to the nearest centimetre?',
    unit: 'cm',
    source: 'Major League Baseball (Official Baseball Rules)',
  },
  'sport-mur-coup-franc': {
    text: 'At a free kick, what is the minimum distance the wall must stand from the ball, in centimetres?',
    unit: 'cm',
    source: 'IFAB (Laws of the Game)',
  },
  'societe-cases-echiquier': {
    text: 'How many squares are there on a chessboard? Check your maths, mate.',
    unit: 'squares',
    source: 'FIDE (International Chess Federation)',
  },
  'societe-cartes-tarot': {
    text: 'How many cards are there in a tarot deck, the Fool included?',
    unit: 'cards',
    source: 'French Tarot Federation',
  },
  'societe-faces-opposees-de': {
    text: 'On a standard six-sided die, what do two opposite faces add up to? It’s always the same total.',
    unit: 'pips',
    source: 'Encyclopædia Britannica',
  },
  'societe-cases-monopoly': {
    text: 'How many spaces are there on a classic Monopoly board, GO included?',
    unit: 'spaces',
    source: 'Hasbro',
  },
  'societe-dominos': {
    text: 'How many tiles are there in a standard set of dominoes, from double blank to double six?',
    unit: 'dominoes',
    source: 'Encyclopædia Britannica',
  },
  'societe-cases-scrabble': {
    text: 'How many squares are there on a Scrabble board?',
    unit: 'squares',
    source: 'FISF (International Francophone Scrabble Federation)',
  },
  'societe-positions-rubik': {
    text: 'In quintillions (billions of billions), how many different positions can a Rubik’s Cube take, to the nearest whole number? Good luck trying them all.',
    unit: 'quintillion',
    source: 'Encyclopædia Britannica',
  },
  'societe-carres-rubik': {
    text: 'How many small coloured squares cover a classic Rubik’s Cube?',
    unit: 'squares',
    source: 'Rubik’s Brand Ltd',
  },
  'societe-rivets-tour-eiffel': {
    text: 'How many rivets keep the Eiffel Tower standing, to the nearest hundred thousand?',
    unit: 'rivets',
    source: 'SETE (Eiffel Tower operating company)',
  },
  'societe-feuille-a4': {
    text: 'How long is a sheet of A4 paper, in millimetres?',
    unit: 'mm',
    source: 'ISO 216 standard',
  },
  'societe-a4-dans-a0': {
    text: 'How many A4 sheets can you cut from a single A0 sheet?',
    unit: 'sheets',
    source: 'ISO 216 standard',
  },
  'societe-piece-2-euros': {
    text: 'How much does a 2-euro coin weigh, to the nearest tenth of a gram?',
    unit: 'g',
    source: 'European Central Bank',
  },
  'societe-cases-sudoku': {
    text: 'How many squares are there in a classic sudoku grid?',
    unit: 'squares',
    source: 'Encyclopædia Britannica',
  },
  'societe-code-barres': {
    text: 'How many digits line up under the standard barcode (EAN) on supermarket products?',
    unit: 'digits',
    source: 'GS1',
  },
  'societe-jeu-oie': {
    text: 'How many spaces are there on the track of the traditional Game of the Goose? Watch out for the well.',
    unit: 'spaces',
    source: 'National Library of France',
  },
  'societe-goban': {
    text: 'How many intersections are there on a goban, the official board for the game of Go?',
    unit: 'intersections',
    source: 'French Go Federation',
  },
  'societe-cases-puissance-4': {
    text: 'How many spaces are there in a Connect 4 grid?',
    unit: 'spaces',
    source: 'Hasbro',
  },
  'societe-mois-31-jours': {
    text: 'How many months of the year have 31 days? The knuckles on your fists can help.',
    unit: 'months',
    source: 'IMCCE (Paris Observatory)',
  },
  'societe-pixels-full-hd': {
    text: 'How many pixels make up a Full HD screen, to the nearest hundred thousand?',
    unit: 'pixels',
    source: 'ITU (International Telecommunication Union)',
  },
  'societe-secondes-jour': {
    text: 'How many seconds are there in a 24-hour day?',
    unit: 's',
    source: 'International Bureau of Weights and Measures (BIPM)',
  },
  'societe-briques-lego': {
    text: 'In how many ways can you put together six LEGO bricks (the classic 2 × 4 kind, all the same colour), to the nearest million?',
    unit: 'combinations',
    source: 'Søren Eilers (University of Copenhagen)',
  },
  'culture-touches-piano': {
    text: 'How many keys does a standard piano have, black and white together?',
    unit: 'keys',
    source: 'Encyclopædia Britannica',
  },
  'culture-cordes-harpe': {
    text: 'How many strings does a concert harp have?',
    unit: 'strings',
    source: 'Encyclopædia Britannica',
  },
  'culture-symphonies-beethoven': {
    text: 'How many symphonies did Beethoven complete?',
    unit: 'symphonies',
    source: 'Encyclopædia Britannica',
  },
  'culture-age-mozart': {
    text: 'How many full years did Mozart live? A whirlwind career.',
    unit: 'years',
    source: 'Encyclopædia Britannica',
  },
  'culture-hauteur-joconde': {
    text: 'How tall is the Mona Lisa, frame not included, to the nearest ten centimetres? It’s smaller than you’d think.',
    unit: 'cm',
    source: 'Louvre Museum',
  },
  'culture-ouverture-louvre': {
    text: 'In what year did the Louvre first open its doors to the public as a museum?',
    unit: 'year',
    source: 'Louvre Museum',
  },
  'culture-tour-du-monde': {
    text: 'In Jules Verne’s novel, how many days does Phileas Fogg give himself to travel around the world?',
    unit: 'days',
    source: 'National Library of France',
  },
  'culture-fahrenheit-bradbury': {
    text: 'Going by the title of Ray Bradbury’s novel, at how many degrees Fahrenheit does paper catch fire?',
    unit: '°F',
    source: 'Encyclopædia Britannica',
  },
  'culture-premier-tintin': {
    text: 'In what year did Tintin make his very first appearance?',
    unit: 'year',
    source: 'Tintinimaginatio (formerly Moulinsart)',
  },
  'culture-premier-asterix': {
    text: 'In what year was Asterix the Gaul born, in the pages of “Pilote” magazine?',
    unit: 'year',
    source: 'Éditions Albert René',
  },
  'culture-sonnets-shakespeare': {
    text: 'How many sonnets are there in Shakespeare’s collection published in 1609?',
    unit: 'sonnets',
    source: 'Folger Shakespeare Library',
  },
  'culture-syllabes-haiku': {
    text: 'How many syllables are there in a traditional haiku?',
    unit: 'syllables',
    source: 'Encyclopædia Britannica',
  },
  'culture-episodes-friends': {
    text: 'How many episodes of “Friends” are there in total? Pivot!',
    unit: 'episodes',
    source: 'Warner Bros. Television',
  },
  'culture-episodes-game-of-thrones': {
    text: 'How many episodes of “Game of Thrones” are there, from the first to the last?',
    unit: 'episodes',
    source: 'HBO',
  },
  'culture-pokemon-premiere-generation': {
    text: 'How many Pokémon were there in the very first generation? Gotta catch ’em all!',
    unit: 'Pokémon',
    source: 'The Pokémon Company',
  },
  'culture-formes-tetris': {
    text: 'How many different piece shapes fall in Tetris? Yes, the long piece you’re always waiting for is one of them.',
    unit: 'shapes',
    source: 'The Tetris Company',
  },
  'culture-niveaux-super-mario': {
    text: 'How many levels are there in the very first “Super Mario Bros.”, released in 1985? The princess is usually in another castle.',
    unit: 'levels',
    source: 'Nintendo',
  },
  'culture-duree-433-cage': {
    text: 'How many seconds does “4′33″”, John Cage’s famous silent piece, last?',
    unit: 's',
    source: 'Encyclopædia Britannica',
  },
  'culture-anneaux-pouvoir': {
    text: 'In “The Lord of the Rings”, how many Rings of Power appear in the famous poem, the One Ring included?',
    unit: 'rings',
    source: 'J.R.R. Tolkien, “The Lord of the Rings”',
  },
  'culture-images-par-seconde': {
    text: 'How many frames per second roll past in a classic cinema film?',
    unit: 'fps',
    source: 'CNC (French National Centre for Cinema and the Moving Image)',
  },
  'culture-premier-star-wars': {
    text: 'In what year did the very first “Star Wars” film come out in cinemas?',
    unit: 'year',
    source: 'Lucasfilm',
  },
}
