import type { VdnQuestionId } from './questions'
import type { VdnQuestionText } from './types'

export const VDN_TEXTS: Readonly<Record<VdnQuestionId, VdnQuestionText>> = {
  'corps-os-adulte': {
    text: 'Quante ossa ha lo scheletro di un adulto? Sì, anche quello dell’amico che balla come se non ne avesse nemmeno uno.',
    unit: 'ossa',
    source: 'Gray’s Anatomy',
  },
  'corps-dents-adulte': {
    text: 'Quanti denti conta una dentatura adulta completa, denti del giudizio compresi?',
    unit: 'denti',
    source: 'Gray’s Anatomy',
  },
  'corps-dents-lait': {
    text: 'Quanti denti da latte può raccogliere la fatina dei denti da un solo bambino?',
    unit: 'denti',
    source: 'Gray’s Anatomy',
  },
  'corps-paires-cotes': {
    text: 'Quante paia di costole formano la gabbia toracica umana?',
    unit: 'paia',
    source: 'Gray’s Anatomy',
  },
  'corps-chromosomes': {
    text: 'Quanti cromosomi racchiude il nucleo di una normale cellula umana (escluse le cellule riproduttive)?',
    unit: 'cromosomi',
    source: 'Inserm',
  },
  'corps-osselets-oreille': {
    text: 'Quanti ossicini si nascondono in ciascuna delle tue orecchie? Sono le ossa più piccole del corpo.',
    unit: 'ossicini',
    source: 'Gray’s Anatomy',
  },
  'corps-os-main': {
    text: 'Quante ossa ha una mano umana, polso compreso?',
    unit: 'ossa',
    source: 'Gray’s Anatomy',
  },
  'corps-os-pied': {
    text: 'Quante ossa ha un piede umano? Pensa alle dita dei piedi: contano anche loro.',
    unit: 'ossa',
    source: 'Gray’s Anatomy',
  },
  'corps-phalanges': {
    text: 'Quante falangi ci sono in tutto tra le tue due mani e i tuoi due piedi? Contare sulle dita è permesso.',
    unit: 'falangi',
    source: 'Gray’s Anatomy',
  },
  'corps-nerfs-rachidiens': {
    text: 'Quante paia di nervi partono dal midollo spinale?',
    unit: 'paia',
    source: 'Gray’s Anatomy',
  },
  'corps-muscles-oeil': {
    text: 'Quanti muscoli fanno ruotare un solo occhio nella sua orbita? Comodissimi per alzare gli occhi al cielo.',
    unit: 'muscoli',
    source: 'Gray’s Anatomy',
  },
  'corps-lobes-poumons': {
    text: 'Quanti lobi hanno in tutto i tuoi due polmoni?',
    unit: 'lobi',
    source: 'Gray’s Anatomy',
  },
  'corps-groupes-sanguins': {
    text: 'Incrociando il sistema AB0 con il fattore Rh (positivo o negativo), quanti gruppi sanguigni diversi si ottengono?',
    unit: 'gruppi',
    source: 'Ente francese del sangue (EFS)',
  },
  'corps-globule-rouge': {
    text: 'Quanti giorni vive in media un globulo rosso prima di essere riciclato?',
    unit: 'giorni',
    source: 'Ente francese del sangue (EFS)',
  },
  'corps-nerfs-craniens': {
    text: 'Quante paia di nervi cranici partono direttamente dal tuo encefalo? L’olfatto e la vista hanno ciascuno il proprio paio.',
    unit: 'paia',
    source: 'Gray’s Anatomy',
  },
  'corps-vertebres-mobiles': {
    text: 'Senza contare le vertebre saldate di osso sacro e coccige, quante vertebre si impilano nella colonna vertebrale di un adulto? Quanto basta per tenere la testa alta.',
    unit: 'vertebre',
    source: 'Gray’s Anatomy',
  },
  'corps-longueur-adn': {
    text: 'Srotolato e disteso da un capo all’altro, quanti metri misurerebbe il DNA di una sola delle tue cellule, arrotondando al metro?',
    unit: 'm',
    source: 'Inserm',
  },
  'corps-genome-paires-bases': {
    text: 'Quante paia di basi (le famose lettere A, T, C e G) conta il genoma umano, arrotondando al miliardo?',
    unit: 'paia di basi',
    source: 'National Human Genome Research Institute (NHGRI)',
  },
  'corps-neurones': {
    text: 'Secondo lo studio di Azevedo e colleghi pubblicato nel 2009, quanti neuroni ha il cervello di un adulto, arrotondando al miliardo? Sì, anche il lunedì mattina.',
    unit: 'neuroni',
    source: 'Azevedo et al., Journal of Comparative Neurology (2009)',
  },
  'corps-audition-aigus': {
    text: 'Fino a quale frequenza, in hertz, l’orecchio di un giovane adulto riesce a sentire i suoni acuti?',
    unit: 'Hz',
    source: 'Inserm',
  },
  'corps-types-cones': {
    text: 'Quanti tipi di coni, le cellule che percepiscono i colori, ha la retina umana?',
    unit: 'tipi',
    source: 'Encyclopædia Britannica',
  },
  'geographie-everest': {
    text: 'Quanto è alto l’Everest, in metri, secondo la misurazione ufficiale del 2020, arrotondando al metro?',
    unit: 'm',
    source: 'Encyclopædia Britannica',
  },
  'geographie-mont-blanc': {
    text: 'Quanto è alto il Monte Bianco, in metri, arrotondando al centinaio? Italia e Francia se ne contendono la vetta: almeno sull’altezza mettiamoci d’accordo.',
    unit: 'm',
    source: 'IGN (Istituto nazionale francese dell’informazione geografica e forestale)',
  },
  'geographie-tour-equateur': {
    text: 'Quanti chilometri misura la circonferenza della Terra all’equatore, arrotondando al migliaio?',
    unit: 'km',
    source: 'Encyclopædia Britannica',
  },
  'geographie-fosse-mariannes': {
    text: 'Qual è la profondità massima della fossa delle Marianne, in metri, arrotondando al migliaio?',
    unit: 'm',
    source: 'NOAA (National Oceanic and Atmospheric Administration)',
  },
  'geographie-nil': {
    text: 'Quanto è lungo il Nilo, in chilometri, arrotondando al migliaio?',
    unit: 'km',
    source: 'Encyclopædia Britannica',
  },
  'geographie-loire': {
    text: 'Quanto è lunga la Loira, il fiume più lungo della Francia, in chilometri, arrotondando al centinaio?',
    unit: 'km',
    source: 'Sandre (repertorio nazionale francese dei dati sull’acqua)',
  },
  'geographie-seine': {
    text: 'Quanto è lunga la Senna, dalla sorgente alla Manica, in chilometri, arrotondando al centinaio?',
    unit: 'km',
    source: 'Sandre (repertorio nazionale francese dei dati sull’acqua)',
  },
  'geographie-baikal': {
    text: 'Qual è la profondità massima del lago Bajkal, il più profondo del mondo, in metri, arrotondando al centinaio?',
    unit: 'm',
    source: 'Encyclopædia Britannica',
  },
  'geographie-kilimandjaro': {
    text: 'Quanto è alto il Kilimangiaro, il tetto dell’Africa, in metri, arrotondando al centinaio?',
    unit: 'm',
    source: 'Encyclopædia Britannica',
  },
  'geographie-sahara': {
    text: 'Qual è la superficie del Sahara, in chilometri quadrati, arrotondando al milione? Porta la crema solare.',
    unit: 'km²',
    source: 'Encyclopædia Britannica',
  },
  'geographie-groenland': {
    text: 'Qual è la superficie della Groenlandia, l’isola più grande del mondo, in chilometri quadrati, arrotondando al milione?',
    unit: 'km²',
    source: 'Encyclopædia Britannica',
  },
  'geographie-titicaca': {
    text: 'A che altitudine si trova il lago Titicaca, in metri, arrotondando al centinaio?',
    unit: 'm',
    source: 'Encyclopædia Britannica',
  },
  'geographie-salto-angel': {
    text: 'Quanto è alto il Salto Ángel, la cascata più alta del mondo, in metri, arrotondando al centinaio?',
    unit: 'm',
    source: 'Encyclopædia Britannica',
  },
  'geographie-mont-fuji': {
    text: 'Quanto è alto il monte Fuji, star delle stampe giapponesi, in metri, arrotondando al centinaio?',
    unit: 'm',
    source: 'Encyclopædia Britannica',
  },
  'geographie-part-oceans': {
    text: 'Che percentuale della superficie terrestre è coperta dall’oceano, arrotondando all’unità?',
    unit: '%',
    source: 'NOAA (National Oceanic and Atmospheric Administration)',
  },
  'geographie-voisins-france': {
    text: 'Quanti paesi hanno un confine terrestre con la Francia metropolitana? Contano anche i microstati (e sì, l’Italia c’è).',
    unit: 'paesi',
    source: 'IGN (Istituto nazionale francese dell’informazione geografica e forestale)',
  },
  'geographie-pas-de-calais': {
    text: 'Nel suo punto più angusto, quanto è largo lo stretto di Dover (o passo di Calais), in chilometri, arrotondando alla decina?',
    unit: 'km',
    source: 'Encyclopædia Britannica',
  },
  'geographie-cantons-suisses': {
    text: 'Quanti cantoni conta la Svizzera? Precisione svizzera, mi raccomando.',
    unit: 'cantoni',
    source: 'Confederazione Svizzera (admin.ch)',
  },
  'geographie-fuseau-horaire': {
    text: 'Quanti gradi di longitudine copre un fuso orario teorico?',
    unit: 'gradi',
    source: 'Osservatorio di Parigi',
  },
  'geographie-paris-new-york': {
    text: 'Quanti chilometri separano Parigi da New York in linea d’aria, arrotondando al migliaio?',
    unit: 'km',
    source: 'Géoportail (IGN)',
  },
  'geographie-corse': {
    text: 'Qual è la superficie della Corsica, la dirimpettaia della Sardegna, in chilometri quadrati, arrotondando al migliaio?',
    unit: 'km²',
    source: 'Insee',
  },
  'geographie-leman': {
    text: 'Qual è la profondità massima del lago di Ginevra (o Lemano), in metri, arrotondando alla decina?',
    unit: 'm',
    source: 'CIPEL (Commissione internazionale per la protezione delle acque del Lemano)',
  },
  'histoire-bastille': {
    text: 'In che anno i parigini presero la Bastiglia?',
    unit: 'anno',
    source: 'Enciclopedia Larousse',
  },
  'histoire-premier-pas-lune': {
    text: 'In che anno Neil Armstrong fece il primo passo umano sulla Luna?',
    unit: 'anno',
    source: 'NASA',
  },
  'histoire-chute-mur-berlin': {
    text: 'In che anno è caduto il muro di Berlino?',
    unit: 'anno',
    source: 'Enciclopedia Larousse',
  },
  'histoire-colomb-amerique': {
    text: 'In che anno il genovese Cristoforo Colombo raggiunse l’America per la prima volta? Lui era convinto di sbarcare nelle Indie.',
    unit: 'anno',
    source: 'Enciclopedia Larousse',
  },
  'histoire-hastings': {
    text: 'In che anno Guglielmo il Conquistatore vinse la battaglia di Hastings?',
    unit: 'anno',
    source: 'Encyclopædia Britannica',
  },
  'histoire-charlemagne-empereur': {
    text: 'In che anno Carlo Magno fu incoronato imperatore? Indizio: un numero bello tondo.',
    unit: 'anno',
    source: 'Enciclopedia Larousse',
  },
  'histoire-marignan': {
    text: 'In che anno Francesco I di Francia vinse la battaglia di Marignano, l’attuale Melegnano, alle porte di Milano?',
    unit: 'anno',
    source: 'Enciclopedia Larousse',
  },
  'histoire-guerre-cent-ans': {
    text: 'Quanti anni durò davvero la guerra dei Cent’anni? Indizio: il nome è un po’ bugiardo.',
    unit: 'anni',
    source: 'Enciclopedia Larousse',
  },
  'histoire-regne-louis-xiv': {
    text: 'Quanti anni interi durò il regno di Luigi XIV, il più lungo della storia di Francia?',
    unit: 'anni',
    source: 'Reggia di Versailles',
  },
  'histoire-regne-elisabeth-ii': {
    text: 'Per quanti anni interi Elisabetta II ha regnato sul Regno Unito?',
    unit: 'anni',
    source: 'The Royal Household (royal.uk)',
  },
  'histoire-fondation-rome': {
    text: 'Secondo la leggenda, in che anno avanti Cristo Romolo fondò Roma? Un classico delle elementari.',
    unit: 'a.C.',
    source: 'Encyclopædia Britannica',
  },
  'histoire-alesia': {
    text: 'In che anno avanti Cristo Vercingetorige depose le armi davanti a Cesare ad Alesia?',
    unit: 'a.C.',
    source: 'Enciclopedia Larousse',
  },
  'histoire-pompei': {
    text: 'In che anno della nostra era il Vesuvio seppellì Pompei?',
    unit: 'anno',
    source: 'Encyclopædia Britannica',
  },
  'histoire-duree-mur-berlin': {
    text: 'Per quanti anni interi il muro di Berlino è rimasto in piedi?',
    unit: 'anni',
    source: 'Enciclopedia Larousse',
  },
  'histoire-gagarine': {
    text: 'In che anno Jurij Gagarin divenne il primo essere umano a viaggiare nello spazio?',
    unit: 'anno',
    source: 'Encyclopædia Britannica',
  },
  'histoire-marcheurs-lune': {
    text: 'Quanti astronauti hanno camminato sulla Luna durante il programma Apollo?',
    unit: 'astronauti',
    source: 'NASA',
  },
  'histoire-epouses-henri-viii': {
    text: 'Quante mogli ebbe Enrico VIII, re d’Inghilterra? Non faceva le cose a metà.',
    unit: 'mogli',
    source: 'Encyclopædia Britannica',
  },
  'histoire-longueur-titanic': {
    text: 'Quanto era lungo il Titanic, in metri, arrotondando alla decina?',
    unit: 'm',
    source: 'Encyclopædia Britannica',
  },
  'histoire-statue-liberte': {
    text: 'Senza piedistallo, quanto misura la Statua della Libertà, dai piedi alla punta della fiaccola, in metri, arrotondando al metro?',
    unit: 'm',
    source: 'National Park Service (Stati Uniti)',
  },
  'histoire-pyramide-kheops': {
    text: 'Appena costruita, che altezza raggiungeva la piramide di Cheope, in metri, arrotondando alla decina?',
    unit: 'm',
    source: 'Encyclopædia Britannica',
  },
  'histoire-plages-debarquement': {
    text: 'Su quante spiagge sbarcarono gli Alleati in Normandia il 6 giugno 1944?',
    unit: 'spiagge',
    source: 'Memoriale di Caen',
  },
  'histoire-bleriot-manche': {
    text: 'In che anno Louis Blériot attraversò la Manica in aereo?',
    unit: 'anno',
    source: 'Museo dell’Aria e dello Spazio (Le Bourget)',
  },
  'sciences-vitesse-lumiere': {
    text: 'A che velocità viaggia la luce nel vuoto, in chilometri al secondo, arrotondando all’unità?',
    unit: 'km/s',
    source: 'Ufficio internazionale dei pesi e delle misure (BIPM)',
  },
  'sciences-distance-lune': {
    text: 'Qual è la distanza media tra la Terra e la Luna, in chilometri, arrotondando al migliaio?',
    unit: 'km',
    source: 'NASA',
  },
  'sciences-distance-soleil': {
    text: 'Qual è la distanza media tra la Terra e il Sole, in chilometri, arrotondando al milione?',
    unit: 'km',
    source: 'Unione astronomica internazionale (UAI)',
  },
  'sciences-planetes': {
    text: 'Quanti pianeti conta ufficialmente il Sistema solare? Plutone tiene ancora il broncio.',
    unit: 'pianeti',
    source: 'Unione astronomica internazionale (UAI)',
  },
  'sciences-protons-or': {
    text: 'Quanti protoni ha il nucleo di un atomo d’oro? È anche il suo numero atomico.',
    unit: 'protoni',
    source: 'IUPAC (Unione internazionale di chimica pura e applicata)',
  },
  'sciences-ebullition-fahrenheit': {
    text: 'A quanti gradi Fahrenheit bolle l’acqua al livello del mare?',
    unit: '°F',
    source: 'NIST (National Institute of Standards and Technology)',
  },
  'sciences-zero-absolu': {
    text: 'Qual è la temperatura dello zero assoluto, in gradi Celsius, arrotondando all’unità? Più freddo di così non si può.',
    unit: '°C',
    source: 'Ufficio internazionale dei pesi e delle misure (BIPM)',
  },
  'sciences-vitesse-son': {
    text: 'A che velocità si propaga il suono nell’aria a 20 °C, in metri al secondo, arrotondando alla decina?',
    unit: 'm/s',
    source: 'Encyclopædia Britannica',
  },
  'sciences-pesanteur': {
    text: 'Qual è l’accelerazione di gravità sulla superficie della Terra, in m/s², arrotondando al centesimo?',
    unit: 'm/s²',
    source: 'Ufficio internazionale dei pesi e delle misure (BIPM)',
  },
  'sciences-cou-girafe': {
    text: 'Quante vertebre ha il lungo collo di una giraffa? Indizio: nemmeno una più del tuo.',
    unit: 'vertebre',
    source: 'Museo nazionale di storia naturale (Parigi)',
  },
  'sciences-coeurs-pieuvre': {
    text: 'Quanti cuori ha un polpo? Ce n’è abbastanza per amare senza riserve.',
    unit: 'cuori',
    source: 'Museo nazionale di storia naturale (Parigi)',
  },
  'sciences-gestation-elephant': {
    text: 'Quanti mesi dura la gestazione di un’elefantessa africana, arrotondando al mese? E pensare che nove mesi ci sembrano lunghi.',
    unit: 'mesi',
    source: 'Encyclopædia Britannica',
  },
  'sciences-dents-chien': {
    text: 'Quanti denti ha un cane adulto? Più che sufficienti per prendersela con le tue pantofole.',
    unit: 'denti',
    source: 'Encyclopædia Britannica',
  },
  'sciences-annee-mars': {
    text: 'Quanti giorni terrestri dura un anno su Marte, arrotondando all’unità? Lassù i compleanni scarseggiano.',
    unit: 'giorni',
    source: 'NASA',
  },
  'sciences-terres-dans-soleil': {
    text: 'Quante volte il volume della Terra sta dentro quello del Sole, arrotondando al centinaio di migliaia? Di colpo ci si sente piccoli piccoli.',
    unit: 'volte',
    source: 'NASA',
  },
  'sciences-age-univers': {
    text: 'Quanti anni ha l’Universo, in miliardi di anni, arrotondando al decimo? Li porta piuttosto bene.',
    unit: 'miliardi di anni',
    source: 'Agenzia spaziale europea (missione Planck)',
  },
  'sciences-trajet-lumiere-soleil': {
    text: 'Quanti secondi impiega la luce del Sole per arrivare fino a noi, arrotondando alla decina?',
    unit: 's',
    source: 'NASA',
  },
  'sciences-azote-liquide': {
    text: 'A che temperatura l’azoto diventa liquido, in gradi Celsius, arrotondando all’unità?',
    unit: '°C',
    source: 'Encyclopædia Britannica',
  },
  'sciences-ligne-karman': {
    text: 'Secondo la Federazione aeronautica internazionale, a che altitudine comincia lo spazio, in chilometri?',
    unit: 'km',
    source: 'Federazione aeronautica internazionale (FAI)',
  },
  'sciences-rotation-venus': {
    text: 'Quanti giorni terrestri impiega Venere per fare un giro su sé stessa, arrotondando all’unità? Indizio: dura più del suo anno.',
    unit: 'giorni',
    source: 'NASA',
  },
  'sciences-yeux-abeille': {
    text: 'Quanti occhi ha un’ape? Indizio: più di due.',
    unit: 'occhi',
    source: 'Museo nazionale di storia naturale (Parigi)',
  },
  'sciences-annee-lumiere': {
    text: 'Quanti miliardi di chilometri percorre la luce in un anno, arrotondando al centinaio?',
    unit: 'miliardi di km',
    source: 'Unione astronomica internazionale (UAI)',
  },
  'sport-joueurs-rugby': {
    text: 'Quanti giocatori in tutto scendono in campo al calcio d’inizio di una partita di rugby a 15?',
    unit: 'giocatori',
    source: 'World Rugby',
  },
  'sport-point-penalty': {
    text: 'A quanti metri dalla linea di porta si trova il dischetto del rigore?',
    unit: 'm',
    source: 'IFAB (Regole del gioco)',
  },
  'sport-hauteur-panier': {
    text: 'A che altezza è fissato un canestro da basket, in centimetri?',
    unit: 'cm',
    source: 'FIBA (Federazione internazionale di pallacanestro)',
  },
  'sport-filet-volley': {
    text: 'Quanto è alta la rete della pallavolo maschile, in centimetri?',
    unit: 'cm',
    source: 'FIVB (Federazione internazionale di pallavolo)',
  },
  'sport-marathon': {
    text: 'Quanti metri esatti bisogna correre per portare a termine una maratona? Ogni metro conta, soprattutto l’ultimo.',
    unit: 'm',
    source: 'World Athletics',
  },
  'sport-duree-basket': {
    text: 'Quanti minuti di gioco dura una partita di basket secondo le regole FIBA, tempi supplementari esclusi?',
    unit: 'min',
    source: 'FIBA (Federazione internazionale di pallacanestro)',
  },
  'sport-largeur-but': {
    text: 'Quanto è larga una porta da calcio tra i due pali, in centimetri? Gli attaccanti la trovano sempre troppo stretta.',
    unit: 'cm',
    source: 'IFAB (Regole del gioco)',
  },
  'sport-court-tennis': {
    text: 'Quanto è lungo un campo da tennis, in metri, arrotondando all’unità?',
    unit: 'm',
    source: 'Federazione internazionale di tennis (ITF)',
  },
  'sport-billes-snooker': {
    text: 'Quante bilie, bianca compresa, sono sistemate sul tavolo all’inizio di una partita di snooker?',
    unit: 'bilie',
    source: 'WPBSA (World Professional Billiards and Snooker Association)',
  },
  'sport-flechettes-max': {
    text: 'Qual è il punteggio più alto possibile lanciando tre freccette?',
    unit: 'punti',
    source: 'World Darts Federation',
  },
  'sport-bowling-parfait': {
    text: 'Qual è il punteggio di una partita perfetta a bowling? Un punteggio che di rado si vede comparire in una serata tra amici.',
    unit: 'punti',
    source: 'International Bowling Federation',
  },
  'sport-premier-tour-de-france': {
    text: 'In che anno è partito il primissimo Tour de France?',
    unit: 'anno',
    source: 'Amaury Sport Organisation (ASO)',
  },
  'sport-premiers-jo-modernes': {
    text: 'In che anno si sono svolti ad Atene i primi Giochi olimpici moderni?',
    unit: 'anno',
    source: 'Comitato olimpico internazionale (CIO)',
  },
  'sport-points-petanque': {
    text: 'Quanti punti bisogna segnare per vincere una partita di pétanque? Allora, accosti o bocci?',
    unit: 'punti',
    source: 'Federazione francese di pétanque e gioco provenzale',
  },
  'sport-tours-10000': {
    text: 'Quanti giri di una pista da 400 metri bisogna completare per correre i 10.000 metri?',
    unit: 'giri',
    source: 'World Athletics',
  },
  'sport-ironman': {
    text: 'Nuoto, bici e corsa messi insieme: quanti chilometri misura un triathlon Ironman, arrotondando all’unità?',
    unit: 'km',
    source: 'Ironman',
  },
  'sport-tir-arc': {
    text: 'Ai Giochi olimpici, a che distanza dal bersaglio tirano gli arcieri (arco ricurvo), in metri?',
    unit: 'm',
    source: 'World Archery',
  },
  'sport-trou-golf': {
    text: 'Qual è il diametro di una buca da golf, in millimetri, arrotondando all’unità? Vista dal tee di partenza, sembra minuscola.',
    unit: 'mm',
    source: 'The R&A (Regole del golf)',
  },
  'sport-plumes-badminton': {
    text: 'Quante piume ha un volano da badminton regolamentare?',
    unit: 'piume',
    source: 'Badminton World Federation (BWF)',
  },
  'sport-distance-lanceur': {
    text: 'Nel baseball, che distanza separa la pedana del lanciatore dal piatto di casa base, in centimetri, arrotondando all’unità?',
    unit: 'cm',
    source: 'Major League Baseball (Regole ufficiali)',
  },
  'sport-mur-coup-franc': {
    text: 'Su un calcio di punizione, a quanti centimetri dal pallone deve stare come minimo la barriera? Lo spray dell’arbitro ne sa qualcosa.',
    unit: 'cm',
    source: 'IFAB (Regole del gioco)',
  },
  'societe-cases-echiquier': {
    text: 'Quante caselle ha una scacchiera? Scacco matematico.',
    unit: 'caselle',
    source: 'FIDE (Federazione internazionale degli scacchi)',
  },
  'societe-cartes-tarot': {
    text: 'Quante carte ha un mazzo di tarocchi francesi, Matto compreso?',
    unit: 'carte',
    source: 'Federazione francese di tarocchi',
  },
  'societe-faces-opposees-de': {
    text: 'Su un classico dado a sei facce, quanto fa la somma di due facce opposte? Il totale è sempre lo stesso.',
    unit: 'punti',
    source: 'Encyclopædia Britannica',
  },
  'societe-cases-monopoly': {
    text: 'Quante caselle ha il tabellone del Monopoly classico, casella del Via compresa?',
    unit: 'caselle',
    source: 'Hasbro',
  },
  'societe-dominos': {
    text: 'Quante tessere ha un domino classico, dal doppio bianco al doppio sei?',
    unit: 'tessere',
    source: 'Encyclopædia Britannica',
  },
  'societe-cases-scrabble': {
    text: 'Quante caselle ha il tabellone dello Scrabble? Proprio lo Scrabble, eh, non lo Scarabeo.',
    unit: 'caselle',
    source: 'FISF (Federazione internazionale di Scrabble francofono)',
  },
  'societe-positions-rubik': {
    text: 'Quante posizioni diverse può assumere un cubo di Rubik, in miliardi di miliardi, arrotondando all’unità? Buona fortuna a provarle tutte.',
    unit: 'miliardi di miliardi',
    source: 'Encyclopædia Britannica',
  },
  'societe-carres-rubik': {
    text: 'Quanti quadratini colorati ricoprono un cubo di Rubik classico?',
    unit: 'quadratini',
    source: 'Rubik’s Brand Ltd',
  },
  'societe-rivets-tour-eiffel': {
    text: 'Quanti rivetti tengono in piedi la Torre Eiffel, arrotondando al centinaio di migliaia?',
    unit: 'rivetti',
    source: 'SETE (Società di gestione della Torre Eiffel)',
  },
  'societe-feuille-a4': {
    text: 'Quanto è lungo un foglio A4, in millimetri?',
    unit: 'mm',
    source: 'Norma ISO 216',
  },
  'societe-a4-dans-a0': {
    text: 'Quanti fogli A4 si possono ricavare da un solo foglio A0?',
    unit: 'fogli',
    source: 'Norma ISO 216',
  },
  'societe-piece-2-euros': {
    text: 'Quanto pesa una moneta da 2 euro, in grammi, arrotondando al decimo?',
    unit: 'g',
    source: 'Banca centrale europea',
  },
  'societe-cases-sudoku': {
    text: 'Quante caselle ha una griglia di sudoku classica?',
    unit: 'caselle',
    source: 'Encyclopædia Britannica',
  },
  'societe-code-barres': {
    text: 'Quante cifre sono allineate sotto il classico codice a barre (EAN) dei prodotti del supermercato?',
    unit: 'cifre',
    source: 'GS1',
  },
  'societe-jeu-oie': {
    text: 'Quante caselle ha il percorso del gioco dell’oca tradizionale? Occhio al pozzo.',
    unit: 'caselle',
    source: 'Biblioteca nazionale di Francia (BnF)',
  },
  'societe-goban': {
    text: 'Quante intersezioni ha un goban, il tavoliere ufficiale del gioco del go?',
    unit: 'intersezioni',
    source: 'Federazione francese di go',
  },
  'societe-cases-puissance-4': {
    text: 'Quante caselle ha la griglia di Forza Quattro?',
    unit: 'caselle',
    source: 'Hasbro',
  },
  'societe-mois-31-jours': {
    text: 'Quanti mesi dell’anno hanno 31 giorni? Le nocche dei tuoi pugni possono darti una mano.',
    unit: 'mesi',
    source: 'IMCCE (Osservatorio di Parigi)',
  },
  'societe-pixels-full-hd': {
    text: 'Quanti pixel ha uno schermo Full HD, arrotondando al centinaio di migliaia?',
    unit: 'pixel',
    source: 'UIT (Unione internazionale delle telecomunicazioni)',
  },
  'societe-secondes-jour': {
    text: 'Quanti secondi ci sono in una giornata di 24 ore?',
    unit: 's',
    source: 'Ufficio internazionale dei pesi e delle misure (BIPM)',
  },
  'societe-briques-lego': {
    text: 'In quanti modi si possono assemblare sei mattoncini LEGO 2 × 4 dello stesso colore, arrotondando al milione?',
    unit: 'combinazioni',
    source: 'Søren Eilers (Università di Copenaghen)',
  },
  'culture-touches-piano': {
    text: 'Quanti tasti ha un pianoforte classico, bianchi e neri insieme?',
    unit: 'tasti',
    source: 'Encyclopædia Britannica',
  },
  'culture-cordes-harpe': {
    text: 'Quante corde ha un’arpa da concerto?',
    unit: 'corde',
    source: 'Encyclopædia Britannica',
  },
  'culture-symphonies-beethoven': {
    text: 'Quante sinfonie ha completato Beethoven?',
    unit: 'sinfonie',
    source: 'Encyclopædia Britannica',
  },
  'culture-age-mozart': {
    text: 'Quanti anni interi ha vissuto Mozart? Una carriera lampo.',
    unit: 'anni',
    source: 'Encyclopædia Britannica',
  },
  'culture-hauteur-joconde': {
    text: 'Quanto è alta la Gioconda, cornice esclusa, in centimetri, arrotondando alla decina? Più piccola di quanto si immagini.',
    unit: 'cm',
    source: 'Museo del Louvre',
  },
  'culture-ouverture-louvre': {
    text: 'In che anno il Louvre ha aperto le sue porte al pubblico come museo?',
    unit: 'anno',
    source: 'Museo del Louvre',
  },
  'culture-tour-du-monde': {
    text: 'Nel romanzo di Giulio Verne, in quanti giorni Phileas Fogg si impegna a fare il giro del mondo?',
    unit: 'giorni',
    source: 'Biblioteca nazionale di Francia (BnF)',
  },
  'culture-fahrenheit-bradbury': {
    text: 'Stando al titolo del romanzo di Ray Bradbury, a quanti gradi Fahrenheit prende fuoco la carta?',
    unit: '°F',
    source: 'Encyclopædia Britannica',
  },
  'culture-premier-tintin': {
    text: 'In che anno Tintin è comparso per la primissima volta?',
    unit: 'anno',
    source: 'Tintinimaginatio (ex Moulinsart)',
  },
  'culture-premier-asterix': {
    text: 'In che anno Asterix il gallico è nato sulle pagine del giornale «Pilote»?',
    unit: 'anno',
    source: 'Edizioni Albert René',
  },
  'culture-sonnets-shakespeare': {
    text: 'Quanti sonetti contiene la raccolta di Shakespeare pubblicata nel 1609?',
    unit: 'sonetti',
    source: 'Folger Shakespeare Library',
  },
  'culture-syllabes-haiku': {
    text: 'Quante sillabe ha un haiku tradizionale?',
    unit: 'sillabe',
    source: 'Encyclopædia Britannica',
  },
  'culture-episodes-friends': {
    text: 'Quanti episodi conta in tutto la serie «Friends»? Maratona sul divano garantita.',
    unit: 'episodi',
    source: 'Warner Bros. Television',
  },
  'culture-episodes-game-of-thrones': {
    text: 'Quanti episodi conta la serie «Il Trono di Spade», dal primo all’ultimo?',
    unit: 'episodi',
    source: 'HBO',
  },
  'culture-pokemon-premiere-generation': {
    text: 'Quanti Pokémon c’erano nella primissima generazione? Acchiappali tutti!',
    unit: 'Pokémon',
    source: 'The Pokémon Company',
  },
  'culture-formes-tetris': {
    text: 'Quante forme diverse di pezzi cadono in Tetris? Sì, conta anche la tanto sospirata stecca dritta.',
    unit: 'forme',
    source: 'The Tetris Company',
  },
  'culture-niveaux-super-mario': {
    text: 'Quanti livelli ha il primissimo «Super Mario Bros.», uscito nel 1985? La principessa è spesso in un altro castello.',
    unit: 'livelli',
    source: 'Nintendo',
  },
  'culture-duree-433-cage': {
    text: 'Quanti secondi dura «4′33″», il celebre brano silenzioso di John Cage?',
    unit: 's',
    source: 'Encyclopædia Britannica',
  },
  'culture-anneaux-pouvoir': {
    text: 'Nel «Signore degli Anelli», quanti anelli del potere elenca la celebre poesia, Unico Anello compreso?',
    unit: 'anelli',
    source: 'J. R. R. Tolkien, «Il Signore degli Anelli»',
  },
  'culture-images-par-seconde': {
    text: 'Quanti fotogrammi al secondo scorrono in un classico film per il cinema?',
    unit: 'fotogrammi/s',
    source: 'CNC (Centro nazionale francese del cinema e dell’immagine animata)',
  },
  'culture-premier-star-wars': {
    text: 'In che anno è uscito al cinema il primissimo film di «Star Wars», da noi «Guerre stellari»?',
    unit: 'anno',
    source: 'Lucasfilm',
  },
}
