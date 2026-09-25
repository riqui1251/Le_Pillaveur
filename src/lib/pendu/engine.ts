/**
 * Moteur pur du Pendu des Gorgées (mode LOCAL, un téléphone qui tourne).
 * Aucune dépendance React/Next : choix du mot, lettres proposées, indices,
 * victoire/défaite, minuteur écoulé, gorgées, passage au joueur suivant.
 * Le composant ne garde que l'affichage, le minuteur et les fenêtres.
 *
 * Extrait STRICTEMENT à l'identique du composant historique : mêmes tirages à
 * suite aléatoire égale (`random` injectable), mêmes points, mêmes gorgées.
 *
 * Lettres : AUCUNE normalisation (comportement historique conservé). Le clavier
 * n'offre que A-Z ; une lettre accentuée (É, Œ), un tiret ou une minuscule
 * d'un mot ne peuvent donc être trouvés qu'au hasard du troisième indice (qui
 * les range parmi les « consonnes »). Voir penduUnreachableLetters.
 */

export type PenduDifficulty = 'facile' | 'normal' | 'difficile' | 'extreme'

// Mots par catégorie et difficulté - 60 mots par catégorie (15 par niveau)
export const WORD_CATEGORIES = {
  animaux: {
    facile: ['CHAT', 'CHIEN', 'OURS', 'LION', 'TIGRE', 'LOUP', 'CERF', 'VACHE', 'PORC', 'LAPIN', 'SOURIS', 'POULE', 'CANARD', 'MOUTON', 'CHEVAL', 'OIE', 'DINDE', 'COQ', 'COCHON', 'AGNEAU', 'CHEVRE', 'ANE', 'MULE', 'CHAMELEON', 'GECKO', 'IGUANE', 'SERPENT', 'LIZARD', 'TORTUE', 'GRENOUILLE', 'CRAPAUD', 'POISSON', 'CARPE', 'TRUITE', 'SAUMON', 'THON', 'MAQUEREAU', 'SARDINE', 'ANCHOIS', 'HARENG', 'MORUE', 'CABILLAUD', 'SOLE', 'PLIE', 'RAIE', 'REQUIN', 'BALEINE', 'DAUPHIN', 'PHOQUE', 'OTARIE', 'LION-DE-MER', 'MORSE', 'BISON', 'ELAN', 'DAIM', 'SANGLIER', 'LIEVRE', 'ECUREUIL', 'HAMSTER', 'COCHON-DINDE', 'PERROQUET', 'CANARI', 'SERPENT', 'LIZARD', 'GECKO', 'IGUANE', 'TORTUE', 'GRENOUILLE', 'CRAPAUD', 'POISSON', 'CARPE', 'TRUITE', 'SAUMON', 'THON', 'MAQUEREAU', 'SARDINE', 'ANCHOIS', 'HARENG', 'MORUE', 'CABILLAUD', 'SOLE', 'PLIE', 'RAIE', 'REQUIN', 'BALEINE', 'DAUPHIN', 'PHOQUE', 'OTARIE', 'LION-DE-MER', 'MORSE', 'BISON', 'ELAN', 'DAIM', 'SANGLIER', 'LIEVRE', 'ECUREUIL', 'HAMSTER', 'COCHON-DINDE', 'PERROQUET', 'CANARI'],
    normal: ['ELEPHANT', 'GIRAFE', 'CROCODILE', 'HIPPOPOTAME', 'KANGOUROU', 'LEOPARD', 'PINGOUIN', 'FLAMANT', 'CHAMEAU', 'ZEBRE', 'GORILLE', 'PANDA', 'KOALA', 'RENARD', 'CASTOR', 'ANTILOPE', 'GAZELLE', 'IMPALA', 'BONGO', 'NYALA', 'KUDU', 'ORYX', 'ADDAX', 'BOUQUETIN', 'MOUFLON', 'BIGHORN', 'ARGALI', 'TAKIN', 'GORAL', 'SEROW', 'ISARD', 'CHAMOIS', 'LYNX', 'JAGUAR', 'PUMA', 'OCELOT', 'SERVAL', 'CARACAL', 'MARGAY', 'JAGUARUNDI', 'KODKOD', 'ONCILLE', 'GUEPARD', 'LEOPARD-NEIGE', 'PANTHERE', 'TIGRE-BLANC', 'LION-BLANC', 'PUMA-NOIR', 'JAGUAR-NOIR', 'LEOPARD-NOIR'],
    difficile: ['RHINOCEROS', 'CHAUVE-SOURIS', 'ORNITHORYNQUE', 'TATOU', 'CAMELEON', 'SALAMANDRE', 'CHINCHILLA', 'FOURMILIER', 'PARESSEUX', 'ORANG-OUTAN', 'CHIMPANZE', 'MANDRILL', 'TAPIR', 'WOMBAT', 'ECHIDNE', 'CAPYBARA', 'AGOUTI', 'PACA', 'CHINCHILLA', 'VISCACHE', 'OCTODON', 'HUTIA', 'COYPU', 'CASTOR-GEANT', 'LOUTRE-GEANTE', 'BELETTE', 'HERMINE', 'PUTOIS', 'FURET', 'MARTRE', 'FOUINE', 'ZIBELINE', 'VISON', 'GLOUTON', 'CARCAJOU', 'RATEL', 'BLAIREAU', 'TAUPE', 'MUSARAIGNE', 'HERISSON', 'TENREC', 'SOLENODONTE', 'DESMAN', 'CONDYLURE', 'SCALOPE', 'CHRYSOCHLORE', 'ORYCTÉROPE', 'PANGOLIN-GEANT', 'FOURMILIER-GEANT', 'TAMANDUA', 'MYRMECOPHAGIE', 'BRADYPE', 'UNAU', 'AI', 'MEGALONYX', 'GLYPTODON', 'DOEDICURUS', 'MACRAUCHENIA', 'TOXODON', 'PYROTHERIUM', 'UINTATHERIUM', 'CORYPHODON', 'PHENACODUS', 'HYRACOTHERIUM', 'MESOHIPPUS'],
    extreme: ['AXOLOTL', 'QUETZAL', 'XENOPE', 'OKAPI', 'PANGOLIN', 'BINTURONG', 'FOSSA', 'NUMBAT', 'BILBY', 'DUNNART', 'POTOROO', 'BETTONG', 'BANDICOOT', 'ANTECHINUS', 'GLIDER', 'QUOLL', 'PLANIGALE', 'DASYURE', 'PHALANGER', 'CUSCUS', 'PADEMELON', 'QUOKKA', 'WALLABY', 'POSSUM', 'KOALA-GEANT', 'DIPROTODON', 'THYLACOLEO', 'MEGALANIA', 'PROCOPTODON', 'PALORCHESTES', 'ZYGOMATURUS', 'PHASCOLONUS', 'THYLACOSMILUS', 'BORHYAENA', 'ANDREWSARCHUS', 'ENTELODON', 'DAEODON', 'ARCHAEOTHERIUM', 'HYAENODON', 'SARKASTODON', 'PATRIOFELIS', 'OXYAENA', 'MESONYX', 'AMBULOCETUS', 'BASILOSAURUS', 'DORUDON', 'ZYGORHIZA', 'ARCHAEOCETE', 'PAKICETUS', 'RODHOCETUS', 'PROTOCETUS', 'GEORGIACETUS', 'INDOHYUS', 'DIACODEXIS', 'PHENACODUS', 'ECTOCION', 'CORYPHODON', 'UINTATHERIUM', 'EOBASILEUS', 'TETHEOPSIS', 'GOBIATHERIUM', 'MONGOLOTHERIUM', 'EMBOLOTHERIUM', 'BRONTOPS', 'TITANOTHERE']
  },
  objets: {
    facile: ['TABLE', 'CHAISE', 'LAMPE', 'LIVRE', 'STYLO', 'VERRE', 'PORTE', 'CLEF', 'SACS', 'TASSE', 'PLAT', 'FOUR', 'LIT', 'MIROIR', 'HORLOGE', 'CRAYON', 'GOMME', 'REGLE', 'CISEAUX', 'COLLE', 'PAPIER', 'CAHIER', 'CARNET', 'AGENDA', 'CALENDRIER', 'PHOTO', 'CADRE', 'TABLEAU', 'POSTER', 'AFFICHE', 'CARTE', 'LETTRE', 'ENVELOPPE', 'TIMBRE', 'COLIS', 'PAQUET', 'BOITE', 'SAC', 'VALISE', 'CARTABLE', 'TROUSSE', 'ETUI', 'POCHETTE', 'PORTEFEUILLE', 'PORTE-MONNAIE', 'BOURSE', 'SACOCHE', 'BESACE', 'GIBECIERE', 'MUSETTE', 'HAVRESAC', 'BISSAC', 'CARNASSIERE', 'GIBERNE', 'FONTES', 'SACOCHES', 'ALFORJAS', 'CANTINES', 'GAMELLES', 'BIDONS', 'GOURDES', 'THERMOS', 'BOUTEILLES', 'FLACONS'],
    normal: ['ORDINATEUR', 'TELEPHONE', 'TELEVISION', 'REFRIGERATEUR', 'ASPIRATEUR', 'MACHINE', 'GUITARE', 'PIANO', 'APPAREIL', 'CAMERA', 'MONTRE', 'LUNETTES', 'PARAPLUIE', 'VALISE', 'BOUTEILLE', 'IMPRIMANTE', 'SCANNER', 'PHOTOCOPIEUSE', 'FAX', 'PROJECTEUR', 'ECRAN', 'CLAVIER', 'SOURIS', 'CASQUE', 'MICROPHONE', 'HAUT-PARLEUR', 'AMPLIFICATEUR', 'MAGNETOPHONE', 'TOURNE-DISQUE', 'LECTEUR-CD', 'LECTEUR-DVD', 'CONSOLE', 'MANETTE', 'JOYSTICK', 'WEBCAM', 'TABLETTE', 'SMARTPHONE', 'CHARGEUR', 'BATTERIE', 'CABLE', 'ADAPTATEUR', 'MULTIPRISE', 'RALLONGE', 'INTERRUPTEUR', 'PRISE', 'AMPOULE', 'NEON', 'SPOT', 'LUSTRE', 'APPLIQUE', 'LAMPADAIRE', 'VEILLEUSE', 'TORCHE', 'LANTERNE', 'BOUGIE', 'CHANDELLE', 'CHANDELIER', 'CANDELABRE', 'FLAMBEAU', 'QUINQUET', 'LAMPION', 'FANAL', 'PHARE', 'PROJECTEUR'],
    difficile: ['STETHOSCOPE', 'KALEIDOSCOPE', 'XYLOPHONE', 'MICROSCOPE', 'TELESCOPE', 'BAROMETER', 'THERMOMETRE', 'ACCELEROMETRE', 'MANOMETRE', 'HYGROMETRE', 'ANEMOMETRE', 'SEISMOGRAPHE', 'OSCILLOSCOPE', 'SPECTROMETRE', 'REFRACTOMETRE', 'CHRONOMETRE', 'TACHYMETRE', 'ALTIMETRE', 'PLUVIOMETRE', 'LUXMETRE', 'DECIBELMETRE', 'MULTIMETRE', 'VOLTMETRE', 'AMPEREMETRE', 'OHMMETRE', 'WATTMETRE', 'FREQUENCEMETRE', 'CAPACIMETRE', 'INDUCTANCEMETRE', 'IMPEDANCEMETRE', 'GALVANOMETRE', 'ELECTROMETRE', 'MAGNETOMETRE', 'GAUSSMETRE', 'TESLAMETER', 'FLUXMETRE', 'RADIOMETRE', 'PHOTOMETRE', 'COLORIMETRE', 'DENSITOMETRE', 'VISCOSIMETRE', 'RHEOMETRE', 'TENSIOMETRE', 'DYNAMOMETRE', 'ERGOMETRE', 'CALORIMETRE', 'PYROMETRE', 'CRYOMETRE', 'DILATOMETER', 'INTERFEROMETRE', 'POLARIMETRE', 'REFRACTOMETRE', 'GONIOMETRE', 'THEODOLITE', 'SEXTANT', 'ASTROLABE', 'QUADRANT', 'OCTANT', 'CLINOMETRE', 'INCLINOMETRE', 'NIVEAU', 'EQUERRE', 'COMPAS', 'RAPPORTEUR', 'PANTOGRAPHE'],
    extreme: ['GYROSCOPE', 'CHRYSANTHEME', 'MNEMOTECHNIQUE', 'ONOMATOPEE', 'PNEUMATIQUE', 'PSYCHOLOGIQUE', 'PHYSIOLOGIQUE', 'PHENOMENOLOGIQUE', 'EPISTEMOLOGIQUE', 'METHODOLOGIQUE', 'ETYMOLOGIQUE', 'LEXICOGRAPHIQUE', 'CINEMATOGRAPHIQUE', 'CRYSTALLOGRAPHIQUE', 'ELECTROENCEPHALOGRAPHE', 'ELECTROCARDIOGRAPHE', 'ELECTROMYOGRAPHE', 'ELECTRORETINOGRAPHE', 'ELECTROOCULOGRAPHE', 'MAGNETOENCEPHALOGRAPHE', 'PNEUMOENCEPHALOGRAPHE', 'VENTRICULOGRAPHE', 'ARTERIOGRAPHE', 'PHLEBOGRAPHE', 'LYMPHOGRAPHE', 'SIALOGRAPHE', 'CHOLANGIOGRAPHE', 'UROGRAPHE', 'PYELOGRAPHE', 'CYSTOGRAPHE', 'HYSTEROSALPINGOGRAPHE', 'MAMMOGRAPHE', 'TOMOGRAPHE', 'SCANOGRAPHE', 'ECHOGRAPHE', 'DOPPLER', 'SCINTIGRAPHE', 'GAMMAGRAPHE', 'POSITOGRAPHE', 'CYCLOTRON', 'SYNCHROTRON', 'BETATRON', 'MICROTRON', 'SYNCHROCYCLOTRON', 'COSMOTRON', 'TEVATRON', 'COLLISIONNEUR', 'ACCELERATEUR', 'SPECTROGRAPHE', 'CHROMATOGRAPHE', 'ELECTROPHORESE', 'CENTRIFUGEUSE', 'ULTRACENTRIFUGEUSE', 'LYOPHILISATEUR', 'AUTOCLAVE', 'INCUBATEUR', 'ETUVE', 'DESSICCATEUR', 'EVAPORATEUR', 'DISTILLATEUR', 'SUBLIMATEUR', 'CRISTALLISOIR', 'PRECIPITATEUR', 'SEPARATEUR', 'PURIFICATEUR', 'CONCENTRATEUR']
  },
  nourriture: {
    facile: ['PAIN', 'FROMAGE', 'POMME', 'BANANE', 'ORANGE', 'POIRE', 'LAIT', 'BEURRE', 'SUCRE', 'SEL', 'RIZ', 'PATES', 'VIANDE', 'POISSON', 'OEUF', 'CERISE', 'FRAISE', 'PECHE', 'PRUNE', 'RAISIN', 'MELON', 'PASTEQUE', 'ANANAS', 'KIWI', 'MANGUE', 'AVOCAT', 'CITRON', 'LIME', 'PAMPLEMOUSSE', 'MANDARINE', 'CLEMENTINE', 'TOMATE', 'CAROTTE', 'RADIS', 'NAVET', 'BETTERAVE', 'OIGNON', 'AIL', 'ECHALOTE', 'POIREAU', 'CELERI', 'FENOUIL', 'PERSIL', 'BASILIC', 'THYM', 'ROMARIN', 'SAUGE', 'ORIGAN', 'MENTHE', 'CIBOULETTE', 'ANETH', 'CORIANDRE', 'CUMIN', 'PAPRIKA', 'CURRY', 'GINGEMBRE', 'CANNELLE', 'VANILLE', 'CHOCOLAT', 'MIEL', 'CONFITURE', 'NUTELLA', 'YAOURT', 'CREME'],
    normal: ['SPAGHETTI', 'HAMBURGER', 'SANDWICH', 'CHOCOLAT', 'BISCUIT', 'CROISSANT', 'BAGUETTE', 'CAMEMBERT', 'ROQUEFORT', 'SAUCISSON', 'JAMBON', 'SAUMON', 'CREVETTE', 'HOMARD', 'ESCARGOT', 'TAGLIATELLE', 'LINGUINE', 'PENNE', 'FUSILLI', 'RAVIOLI', 'TORTELLINI', 'GNOCCHI', 'RISOTTO', 'PAELLA', 'COUSCOUS', 'TABOULEH', 'HOUMOUS', 'FALAFEL', 'KEBAB', 'GYROS', 'MOUSSAKA', 'LASAGNE', 'CANNELLONI', 'PIZZA', 'CALZONE', 'FOCACCIA', 'BRUSCHETTA', 'ANTIPASTI', 'CARPACCIO', 'VITELLO', 'OSSO-BUCO', 'SALTIMBOCCA', 'PICCATA', 'SCALOPPINE', 'PARMIGIANA', 'CARBONARA', 'AMATRICIANA', 'PUTTANESCA', 'ARRABBIATA', 'AGLIO-OLIO', 'PESTO', 'ALFREDO', 'BOLOGNAISE', 'MARINARA', 'NAPOLETANA', 'QUATTRO-STAGIONI', 'MARGHERITA', 'CAPRICCIOSA', 'DIAVOLA', 'QUATTRO-FORMAGGI', 'PROSCIUTTO', 'FUNGHI', 'VEGETARIANA', 'MARINARA'],
    difficile: ['RATATOUILLE', 'BOUILLABAISSE', 'CHOUCROUTE', 'QUENELLE', 'CASSOULET', 'BRANDADE', 'TAPENADE', 'BOURGUIGNON', 'COQ-AU-VIN', 'POT-AU-FEU', 'BLANQUETTE', 'FRICASSEE', 'CONFIT', 'MAGRET', 'FOIE-GRAS', 'BOEUF-BOURGUIGNON', 'DAUBE', 'GIGOT', 'ROTI', 'RAGOUT', 'STEW', 'CIVET', 'TERRINE', 'PATE', 'RILLETTES', 'CONFITURE', 'GELÉE', 'CHUTNEY', 'PICKLES', 'CORNICHONS', 'OLIVES', 'CAPRES', 'ANCHOIS', 'THON', 'SARDINES', 'MAQUEREAU', 'HARENG', 'SAUMON', 'TRUITE', 'BROCHET', 'PERCHE', 'CARPE', 'ANGUILLE', 'LAMPROIE', 'ESTURGEON', 'CAVIAR', 'HUITRE', 'MOULE', 'PALOURDE', 'COQUE', 'BIGORNEAU', 'BULOT', 'SEICHE', 'CALMAR', 'PIEUVRE', 'POULE', 'CANARD', 'OIE', 'DINDE', 'PIGEON', 'CAILLE', 'PERDRIX', 'FAISAN', 'BÉCASSE', 'BÉCASSINE', 'VANESSE', 'BÉCARD', 'BÉCASSEAU', 'BÉCASSE', 'BÉCASSINE', 'BÉCARD', 'BÉCASSEAU'],
    extreme: ['CEVICHE', 'TZATZIKI', 'QUESADILLA', 'YAKITORI', 'BRUSCHETTA', 'CARPACCIO', 'ANTIPASTI', 'PROSCIUTTO', 'MOZZARELLA', 'GORGONZOLA', 'PARMIGIANO', 'MASCARPONE', 'TIRAMISU', 'ZABAGLIONE', 'CANNELLONI', 'OSSO-BUCO', 'SALTIMBOCCA', 'PICCATA', 'SCALOPPINE', 'PARMIGIANA', 'CARBONARA', 'AMATRICIANA', 'PUTTANESCA', 'ARRABBIATA', 'AGLIO-OLIO', 'PESTO', 'ALFREDO', 'BOLOGNAISE', 'MARINARA', 'NAPOLETANA', 'QUATTRO-STAGIONI', 'MARGHERITA', 'CAPRICCIOSA', 'DIAVOLA', 'QUATTRO-FORMAGGI', 'PROSCIUTTO', 'FUNGHI', 'VEGETARIANA', 'MARINARA', 'TAGLIATELLE', 'LINGUINE', 'PENNE', 'FUSILLI', 'RAVIOLI', 'TORTELLINI', 'GNOCCHI', 'RISOTTO', 'PAELLA', 'COUSCOUS', 'TABOULEH', 'HOUMOUS', 'FALAFEL', 'KEBAB', 'GYROS', 'MOUSSAKA', 'LASAGNE', 'CANNELLONI', 'PIZZA', 'CALZONE', 'FOCACCIA', 'BRUSCHETTA', 'ANTIPASTI', 'CARPACCIO', 'VITELLO', 'OSSO-BUCO', 'SALTIMBOCCA', 'PICCATA', 'SCALOPPINE', 'PARMIGIANA', 'CARBONARA', 'AMATRICIANA', 'PUTTANESCA', 'ARRABBIATA', 'AGLIO-OLIO', 'PESTO', 'ALFREDO', 'BOLOGNAISE', 'MARINARA', 'NAPOLETANA', 'QUATTRO-STAGIONI', 'MARGHERITA', 'CAPRICCIOSA', 'DIAVOLA', 'QUATTRO-FORMAGGI', 'PROSCIUTTO', 'FUNGHI', 'VEGETARIANA', 'MARINARA']
  },
  lieux: {
    facile: ['PARIS', 'LYON', 'PLAGE', 'FORET', 'VILLE', 'MAISON', 'ECOLE', 'PARC', 'JARDIN', 'ROUTE', 'PONT', 'GARE', 'PORT', 'FERME', 'USINE', 'MARSEILLE', 'TOULOUSE', 'NICE', 'NANTES', 'STRASBOURG', 'MONTPELLIER', 'BORDEAUX', 'LILLE', 'RENNES', 'REIMS', 'SAINT-ETIENNE', 'LE-HAVRE', 'TOULON', 'GRENOBLE', 'DIJON', 'ANGERS', 'NIMES', 'VILLEURBANNE', 'SAINT-DENIS', 'LE-MANS', 'AIX-EN-PROVENCE', 'CLERMONT-FERRAND', 'BREST', 'TOURS', 'AMIENS', 'LIMOGES', 'ANNEcy', 'PERPIGNAN', 'BOULOGNE-BILLANCOURT', 'ORLEANS', 'MULHOUSE', 'ROUEN', 'CAEN', 'REIMS', 'NANCY', 'SAINT-DENIS', 'ARGENTEUIL', 'MONTPELLIER', 'NANTES', 'TOULOUSE', 'NICE', 'STRASBOURG', 'NIMES', 'TOULON', 'GRENOBLE', 'DIJON', 'ANGERS', 'VILLEURBANNE', 'LE-MANS', 'AIX-EN-PROVENCE', 'CLERMONT-FERRAND', 'BREST', 'TOURS', 'AMIENS', 'LIMOGES', 'ANNEcy', 'PERPIGNAN', 'BOULOGNE-BILLANCOURT', 'ORLEANS', 'MULHOUSE', 'ROUEN', 'CAEN', 'REIMS', 'NANCY', 'SAINT-DENIS', 'ARGENTEUIL'],
    normal: ['RESTAURANT', 'BIBLIOTHEQUE', 'PHARMACIE', 'BOULANGERIE', 'BOUCHERIE', 'EPICERIE', 'LIBRAIRIE', 'CINEMA', 'THEATRE', 'MUSEE', 'GALERIE', 'HOPITAL', 'CLINIQUE', 'CABINET', 'BUREAU', 'SUPERMARCHE', 'HYPERMARCHE', 'MAGASIN', 'BOUTIQUE', 'CENTRE-COMMERCIAL', 'MARCHE', 'FOIRE', 'BAZAR', 'DEPOT', 'ENTREPOT', 'USINE', 'ATELIER', 'GARAGE', 'STATION-SERVICE', 'PARKING', 'AEROPORT', 'GARE', 'METRO', 'TRAMWAY', 'AUTOBUS', 'TAXI', 'HOTEL', 'AUBERGE', 'CAMPING', 'MOTEL', 'PENSION', 'RESIDENCE', 'APPARTEMENT', 'STUDIO', 'LOFT', 'VILLA', 'CHALET', 'CABANE', 'TENTE', 'CARAVANE', 'MOBILE-HOME', 'PISCINE', 'SAUNA', 'HAMMAM', 'SPA', 'GYMNASE', 'STADE', 'TERRAIN', 'COURT', 'PISTE', 'CIRCUIT', 'HIPPODROME', 'VELODROME', 'PATINOIRE', 'BOWLING', 'CASINO'],
    difficile: ['ARCHIPEL', 'OBSERVATOIRE', 'PLANETARIUM', 'AQUARIUM', 'AUDITORIUM', 'CONSERVATOIRE', 'LABORATOIRE', 'AMBASSADE', 'CONSULAT', 'PREFECTURE', 'TRIBUNAL', 'PALAIS', 'CHATEAU', 'MONASTERE', 'CATHEDRALE', 'PENITENCIER', 'SANATORIUM', 'DISPENSAIRE', 'POLYCLINIQUE', 'MATERNITE', 'HOSPICE', 'ASILE', 'ORPHELINAT', 'PENSIONNAT', 'INTERNAT', 'SEMINAIRE', 'NOVICIAT', 'COUVENT', 'ABBAYE', 'PRIEURE', 'CHARTREUSE', 'ERMITAGE', 'SANCTUAIRE', 'TEMPLE', 'MOSQUEE', 'SYNAGOGUE', 'PAGODE', 'STUPA', 'ZIGGURAT', 'MAUSOLEE', 'NECROPOLE', 'CIMETIERE', 'COLUMBARIUM', 'CREMATORIUM', 'MORGUE', 'AMPHITHEATRE', 'HIPPODROME', 'VELODROME', 'AUTODROME', 'AERODROME', 'HELIPORT', 'SPACEPORT', 'COSMODROME', 'ASTROPORT', 'SPATIOPORT', 'TELEPORT', 'STARGATE', 'WORMHOLE', 'BLACKHOLE', 'QUASAR', 'PULSAR', 'NEBULA', 'GALAXY', 'UNIVERSE', 'MULTIVERSE', 'DIMENSION', 'CONTINUUM'],
    extreme: ['MAUSOLEE', 'ZIGGOURAT', 'KREMLIN', 'ACROPOLE', 'COLISEE', 'PANTHEON', 'PARTHENON', 'HIPPODROME', 'AMPHITHEATRE', 'BASILIQUE', 'MINARETS', 'SYNAGOGUE', 'PAGODE', 'STUPAS', 'ZIGGURAT', 'PENITENCIER', 'SANATORIUM', 'DISPENSAIRE', 'POLYCLINIQUE', 'MATERNITE', 'HOSPICE', 'ASILE', 'ORPHELINAT', 'PENSIONNAT', 'INTERNAT', 'SEMINAIRE', 'NOVICIAT', 'COUVENT', 'ABBAYE', 'PRIEURE', 'CHARTREUSE', 'ERMITAGE', 'SANCTUAIRE', 'TEMPLE', 'MOSQUEE', 'SYNAGOGUE', 'PAGODE', 'STUPA', 'ZIGGURAT', 'MAUSOLEE', 'NECROPOLE', 'CIMETIERE', 'COLUMBARIUM', 'CREMATORIUM', 'MORGUE', 'AMPHITHEATRE', 'HIPPODROME', 'VELODROME', 'AUTODROME', 'AERODROME', 'HELIPORT', 'SPACEPORT', 'COSMODROME', 'ASTROPORT', 'SPATIOPORT', 'TELEPORT', 'STARGATE', 'WORMHOLE', 'BLACKHOLE', 'QUASAR', 'PULSAR', 'NEBULA', 'GALAXY', 'UNIVERSE', 'MULTIVERSE', 'DIMENSION', 'CONTINUUM']
  },
  metiers: {
    facile: ['MEDECIN', 'PROF', 'CHEF', 'POLICE', 'POMPIER', 'GARDE', 'JUGE', 'MAIRE', 'PILOTE', 'GUIDE', 'COACH', 'NURSE', 'MACON', 'PEINTRE', 'PLOMBIER', 'BOULANGER', 'BOUCHER', 'EPICIER', 'COIFFEUR', 'BARBIER', 'TAILLEUR', 'COUTURIER', 'CORDONNIER', 'HORLOGER', 'BIJOUTIER', 'FLEURISTE', 'LIBRAIRE', 'VENDEUR', 'CAISSIER', 'SERVEUR', 'BARMAN', 'CUISINIER', 'PATISSIER', 'GLACIER', 'TRAITEUR', 'FERMIER', 'BERGER', 'VACHER', 'PORCHER', 'AVICULTEUR', 'APICULTEUR', 'VITICULTEUR', 'MARAICHER', 'JARDINIER', 'PAYSAGISTE', 'BUCHERON', 'FORESTIER', 'CHASSEUR', 'PECHEUR', 'MARIN', 'CAPITAINE', 'MATELOT', 'DOCKER', 'GRUTIER', 'CHAUFFEUR', 'ROUTIER', 'TAXIMAN', 'LIVREUR', 'FACTEUR', 'POSTIER', 'SECRETAIRE', 'EMPLOYE', 'OUVRIER', 'ARTISAN', 'APPRENTI'],
    normal: ['AVOCAT', 'DENTISTE', 'PHARMACIEN', 'VETERINAIRE', 'ARCHITECTE', 'INGENIEUR', 'COMPTABLE', 'BANQUIER', 'JOURNALISTE', 'PHOTOGRAPHE', 'MUSICIEN', 'ACTEUR', 'DANSEUR', 'SCULPTEUR', 'DESIGNER', 'INFORMATICIEN', 'PROGRAMMEUR', 'DEVELOPPEUR', 'ANALYSTE', 'CONSULTANT', 'GESTIONNAIRE', 'DIRECTEUR', 'MANAGER', 'SUPERVISEUR', 'COORDINATEUR', 'ADMINISTRATEUR', 'ASSISTANT', 'TECHNICIEN', 'SPECIALISTE', 'EXPERT', 'CONSEILLER', 'FORMATEUR', 'INSTRUCTEUR', 'PROFESSEUR', 'ENSEIGNANT', 'EDUCATEUR', 'ANIMATEUR', 'MONITEUR', 'ENTRAINEUR', 'PREPARATEUR', 'THERAPEUTE', 'PRATICIEN', 'CLINICIEN', 'RADIOLOGUE', 'LABORANTIN', 'INFIRMIER', 'AIDE-SOIGNANT', 'AMBULANCIER', 'SECOURISTE', 'SAUVETEUR', 'POMPIER', 'GENDARME', 'POLICIER', 'DETECTIVE', 'ENQUETEUR', 'INSPECTEUR', 'COMMISSAIRE', 'PROCUREUR', 'NOTAIRE', 'HUISSIER', 'GREFFIER', 'CLERC', 'JURISTE', 'MAGISTRAT', 'ARBITRE', 'MEDIATEUR', 'NEGOCIATEUR'],
    difficile: ['ANESTHESISTE', 'CARDIOLOGUE', 'DERMATOLOGUE', 'NEUROLOGUE', 'PSYCHIATRE', 'RADIOLOGUE', 'CHIRURGIEN', 'GYNECOLOGUE', 'PEDIATRE', 'OPHTALMOLOGUE', 'ORTHODONTISTE', 'KINESITHERAPEUTE', 'PSYCHOLOGUE', 'ORTHOPHONISTE', 'PODOLOGUE', 'EPIDEMIOLOGISTE', 'BACTERIOLOGISTE', 'VIROLOGISTE', 'PARASITOLOGUE', 'MYCOLOGISTE', 'IMMUNOLOGISTE', 'GENETICIEN', 'BIOCHIMISTE', 'BIOPHYSICIEN', 'BIOMEDICIEN', 'BIOTECHNOLOGUE', 'NANOTECHNOLOGUE', 'MICROBIOLOGISTE', 'PHARMACOLOGUE', 'TOXICOLOGUE', 'PATHOLOGISTE', 'ANATOMOPATHOLOGISTE', 'CYTOPATHOLOGISTE', 'HISTOPATHOLOGISTE', 'NEUROPATHOLOGISTE', 'PSYCHOPATHOLOGISTE', 'PHYSIOPATHOLOGISTE', 'ETIOPATHOLOGISTE', 'OSTEOPATHOLOGISTE', 'NATUROPATHOLOGISTE', 'HOMEOPATHOLOGISTE', 'ACUPUNCTEUR', 'REFLEXOLOGUE', 'MAGNETISEUR', 'HYPNOTISEUR', 'SOPHROLOGUE', 'RELAXOLOGUE', 'GESTALT-THERAPEUTE', 'PSYCHANALYSTE', 'PSYCHOTHERAPEUTE', 'NEUROPSYCHOLOGUE', 'PSYCHOMOTRICIEN', 'ERGOTHERAPEUTE', 'ORTHOPTISTE', 'AUDIOPROTHESISTE', 'PROTHESISTE', 'ORTHOPEDIE', 'PODOLOGIE', 'CHIROPRACTEUR', 'OSTEOPATHE', 'ETIOPATHE', 'NATUROPATHE', 'HOMEOPATHE', 'PHYTOTHERAPEUTE', 'AROMATHERAPEUTHE', 'GEMMOTHERAPEUTE'],
    extreme: ['OTORHINOLARYNGOLOGUE', 'ANESTHESIOLOGISTE', 'GASTROENTEROLOGUE', 'ENDOCRINOLOGUE', 'RHUMATOLOGUE', 'PNEUMOLOGUE', 'NEPHROLOGUE', 'UROLOGUE', 'HEMATOLOGUE', 'ONCOLOGUE', 'IMMUNOLOGUE', 'INFECTIOLOGUE', 'GERIATRE', 'NEONATOLOGUE', 'TOXICOLOGUE', 'NEUROCHIRURGIEN', 'CARDIOCHIRURGIEN', 'THORACOCHIRURGIEN', 'ORTHOPEDISTE', 'TRAUMATOLOGUE', 'PLASTICIEN', 'MAXILLO-FACIAL', 'VASCULAIRE', 'DIGESTIF', 'HEPATO-BILIAIRE', 'PANCREATICO-DUODENAL', 'COLO-RECTAL', 'ENDO-UROLOGUE', 'ANDROLOGUE', 'SEXOLOGUE', 'FERTILITE', 'PROCREATION', 'PERINATOLOGIE', 'FOETO-PATHOLOGIE', 'GENETIQUE-MEDICALE', 'CYTOGENETIQUE', 'BIOLOGIE-MOLECULAIRE', 'IMMUNOGENETIQUE', 'PHARMACOGENETIQUE', 'TOXICOGENETIQUE', 'ECOTOXICOLOGIE', 'RADIOPROTECTION', 'MEDECINE-NUCLEAIRE', 'RADIOTHERAPIE', 'CURIETHERAPIE', 'HADRONTHERAPIE', 'PROTONTHERAPIE', 'NEUTRONTHERAPIE', 'PHOTODYNAMIQUE', 'CRYOTHERAPIE', 'THERMOTHERAPIE', 'ELECTROTHERAPIE', 'MAGNETOTHERAPIE', 'ULTRASONOTHERAPIE', 'LASERTHERAPIE', 'PHOTOTHERAPIE', 'CHROMOTHERAPIE', 'MUSICOTHERAPIE', 'ARTTHERAPIE', 'DANSETHERAPIE', 'DRAMATHERAPIE', 'BIBLIOTHERAPIE', 'LUDOTHERAPIE', 'ZOOTHERAPIE', 'HIPPOTHERAPIE', 'CANITHERAPIE', 'FELINTHERAPIE']
  },
  sports: {
    facile: ['FOOT', 'TENNIS', 'BASKET', 'RUGBY', 'BOXE', 'JUDO', 'KARATE', 'VELO', 'COURSE', 'SAUT', 'NAGE', 'SKI', 'SURF', 'GOLF', 'PING-PONG'],
    normal: ['FOOTBALL', 'VOLLEYBALL', 'HANDBALL', 'BADMINTON', 'NATATION', 'ATHLETISME', 'GYMNASTIQUE', 'ESCALADE', 'EQUITATION', 'ESCRIME', 'AVIRON', 'CANOE', 'VOILE', 'PLONGEE', 'PARACHUTE'],
    difficile: ['TAEKWONDO', 'HALTEROPHILIE', 'PENTATHLON', 'DECATHLON', 'TRIATHLON', 'BIATHLON', 'MARATHON', 'STEEPLECHASE', 'TRAMPOLINE', 'BOBSLEIGH', 'SKELETON', 'CURLING', 'BIATHLON', 'SKELETON', 'LUGE'],
    extreme: ['HEPTATHALON', 'OMNIUM', 'KEIRIN', 'MADISON', 'POURSUITE', 'KITESURFING', 'WINGSUIT', 'SLACKLINE', 'PARKOUR', 'FREERUNNING', 'CANYONING', 'SPELEOLOGIE', 'ALPINISME', 'PARAPENTE', 'DELTAPLANE']
  },
  pays: {
    facile: ['FRANCE', 'ITALIE', 'ESPAGNE', 'SUISSE', 'BELGIQUE', 'CANADA', 'JAPON', 'CHINE', 'INDE', 'BRESIL', 'MEXIQUE', 'EGYPTE', 'MAROC', 'TUNISIE', 'ALGERIE'],
    normal: ['ALLEMAGNE', 'ANGLETERRE', 'PORTUGAL', 'HOLLANDE', 'AUTRICHE', 'NORVEGE', 'FINLANDE', 'POLOGNE', 'HONGRIE', 'ROUMANIE', 'BULGARIE', 'CROATIE', 'SLOVENIE', 'SLOVAQUIE', 'TCHEQUE'],
    difficile: ['AZERBAIDJAN', 'KAZAKHSTAN', 'OUZBEKISTAN', 'KIRGHIZISTAN', 'TADJIKISTAN', 'TURKMENISTAN', 'AFGHANISTAN', 'BANGLADESH', 'SRI-LANKA', 'BIRMANIE', 'CAMBODGE', 'LAOS', 'MONGOLIE', 'NEPAL', 'BHOUTAN'],
    extreme: ['LIECHTENSTEIN', 'SAINT-MARIN', 'ANDORRE', 'MONACO', 'VATICAN', 'NAURU', 'TUVALU', 'PALAU', 'MARSHALL', 'MICRONÉSIE', 'KIRIBATI', 'VANUATU', 'SALOMON', 'FIDJI', 'TONGA']
  },
  couleurs: {
    facile: ['ROUGE', 'BLEU', 'VERT', 'JAUNE', 'NOIR', 'BLANC', 'ROSE', 'VIOLET', 'ORANGE', 'GRIS', 'MARRON', 'BEIGE', 'DORE', 'ARGENT', 'BRONZE'],
    normal: ['TURQUOISE', 'MAGENTA', 'CYAN', 'INDIGO', 'ECARLATE', 'CRAMOISIE', 'POURPRE', 'VERMILLON', 'BORDEAUX', 'MARINE', 'OLIVE', 'KAKI', 'SAUMON', 'CORAIL', 'FUCHSIA'],
    difficile: ['CHARTREUSE', 'VERMILLION', 'CELADON', 'BISTRE', 'OCRE', 'SEPIA', 'OMBRE', 'SIENNA', 'ALIZARINE', 'GARANCE', 'CARMIN', 'LAQUE', 'COBALT', 'OUTREMER', 'MALACHITE'],
    extreme: ['QUINACRIDONE', 'PHTHALOCYANINE', 'ANTHRAQUINONE', 'DIOXAZINE', 'ISOINDOLINE', 'PERYLENE', 'NAPHTHOL', 'BENZIMIDAZOLONE', 'DIKETOPYRROLOPYRROLE', 'QUINOPHTHALONE', 'PYRANTHRONE', 'FLAVANTHRONE', 'PERINONE', 'THIOINDIGO', 'CARBAZOLE']
  },
  emotions: {
    facile: ['JOIE', 'PEUR', 'COLERE', 'HONTE', 'FIERTE', 'AMOUR', 'HAINE', 'ENVIE', 'GENE', 'STRESS', 'CALME', 'PAIX', 'RAGE', 'IRA', 'BONHEUR', 'PLAISIR', 'DOULEUR', 'SOUFFRANCE', 'MALAISE', 'BIEN-ETRE', 'CONFORT', 'INCONFORT', 'AISE', 'MALAISE', 'SATISFACTION', 'INSATISFACTION', 'CONTENTEMENT', 'MECONTENTEMENT', 'ALLEGRESSE', 'GAITE', 'HILARITE', 'RIRE', 'SOURIRE', 'GRIMACE', 'PLEURS', 'LARMES', 'SANGLOTS', 'SOUPIRS', 'GEMISSEMENTS', 'CRIS', 'HURLEMENT', 'EXCLAMATION', 'SURPRISE', 'ETONNEMENT', 'ADMIRATION', 'RESPECT', 'VENERATION', 'ADORATION', 'CULTE', 'DEVOTION', 'PASSION', 'ARDEUR', 'FERVEUR', 'ZELE', 'ENTHOUSIASME', 'EXALTATION', 'TRANSPORT', 'RAVISSEMENT', 'ENCHANTEMENT', 'CHARME', 'SEDUCTION', 'ATTRACTION', 'REPULSION', 'AVERSION', 'ANTIPATHIE', 'SYMPATHIE', 'EMPATHIE', 'COMPASSION', 'PITIE', 'MISERICORDE'],
    normal: ['TRISTESSE', 'NOSTALGIE', 'MELANCOLIE', 'EUPHORIE', 'EXTASE', 'ANGOISSE', 'ANXIETE', 'PANIQUE', 'TERREUR', 'EFFROI', 'DEGOUT', 'MEPRIS', 'JALOUSIE', 'RANCUNE', 'REMORDS', 'CULPABILITE', 'INNOCENCE', 'PURETE', 'IMPURETE', 'NOBLESSE', 'BASSESSE', 'GRANDEUR', 'PETITESSE', 'GENEROSITE', 'AVARICE', 'CUPIDITE', 'DESINTERESSEMENT', 'ALTRUISME', 'EGOISME', 'NARCISSISME', 'HUMILITE', 'ORGUEIL', 'VANITE', 'MODESTIE', 'ARROGANCE', 'PRESOMPTION', 'SUFFISANCE', 'PRETENTION', 'SIMPLICITE', 'COMPLEXITE', 'FACILITE', 'DIFFICULTE', 'AISANCE', 'EMBARRAS', 'TROUBLE', 'CONFUSION', 'CLARTE', 'OBSCURITE', 'LUMIERE', 'TENEBRES', 'ESPOIR', 'DESESPOIR', 'OPTIMISME', 'PESSIMISME', 'CONFIANCE', 'DEFIANCE', 'ASSURANCE', 'INCERTITUDE', 'DOUTE', 'CERTITUDE', 'CONVICTION', 'HESITATION', 'DETERMINATION', 'INDECISION', 'RESOLUTION', 'IRRESOLUTION'],
    difficile: ['EXASPERATION', 'INDIGNATION', 'RESSENTIMENT', 'AMERTUME', 'DESESPOIR', 'ACCABLEMENT', 'ABATTEMENT', 'PROSTRATION', 'STUPEFACTION', 'EBAHISSEMENT', 'PERPLEXITE', 'INCREDULITE', 'SCEPTICISME', 'DEFIANCE', 'SUSPICION', 'CIRCONSPECTION', 'PRECAUTION', 'PRUDENCE', 'IMPRUDENCE', 'TEMERAIRE', 'AUDACE', 'COURAGE', 'BRAVOURE', 'VAILLANCE', 'HEROISME', 'LACHETE', 'COUARDISE', 'POLTRONNERIE', 'PUSILLANIMITE', 'TIMIDITE', 'HARDIESSE', 'INTREPIDITE', 'IMPAVIDITE', 'STOICISME', 'IMPASSIBILITE', 'FLEGME', 'SANG-FROID', 'PLACIDITE', 'SERENITE', 'QUIETUDE', 'TRANQUILLITE', 'AGITATION', 'TURBULENCE', 'EFFERVESCENCE', 'EBULLITION', 'BOUILLONNEMENT', 'FERMENTATION', 'TUMULTE', 'VACARME', 'FRACAS', 'TAPAGE', 'SILENCE', 'MUTISME', 'TACITURNITE', 'LOQUACITE', 'VOLUBILITE', 'ELOQUENCE', 'FACONDE', 'VERVE', 'BRIO', 'PANACHE', 'PRESTANCE', 'DISTINCTION', 'ELEGANCE', 'RAFFINEMENT', 'GROSSIERETE', 'VULGARITE', 'TRIVIALITE'],
    extreme: ['PUSILLANIMITE', 'MISANTHROPIE', 'ACRIMONIE', 'ANIMOSITE', 'RANCŒUR', 'ACERBITE', 'AIGREUR', 'AMERTUME', 'BILE', 'FIEL', 'VENIN', 'SPLEEN', 'CAFARD', 'BOURDON', 'NEURASTHENIE', 'HYPOCHONDRIE', 'MELANCOLIE', 'NOSTALGIE', 'SPLEEN', 'TAEDIUM-VITAE', 'WELTSCHMERZ', 'SAUDADE', 'HIRAETH', 'SEHNSUCHT', 'FERNWEH', 'WANDERLUST', 'GEMUTLICHKEIT', 'SCHADENFREUDE', 'ZEITGEIST', 'ANGST', 'WELTANSCHAUUNG', 'LEBENSMUDE', 'TODESSEHNSUCHT', 'LIEBESKUMMER', 'HERZSCHMERZ', 'KUMMERSPECK', 'VERSCHLIMMBESSERN', 'BACKPFEIFENGESICHT', 'OHRWURM', 'FREMDSCHAMEN', 'TORSCHLUSSPANIK', 'FERNWEH', 'HEIMWEH', 'WEHMUT', 'SCHWERMUT', 'TRUBSINN', 'MELANCHOLIE', 'HYPOCHONDRIE', 'NEURASTHENIE', 'PSYCHASTHENIE', 'DYSTHYMIE', 'CYCLOTHYMIE', 'ALEXITHYMIE', 'ANHEDONIE', 'APATHIE', 'ATARAXIE', 'ACEDIA', 'TAEDIUM', 'ENNUI', 'BLASEMENT', 'DESABUSEMENT', 'DESENCHANTEMENT', 'DESILLUSION', 'AMERTUME', 'ACRIMONIE', 'AIGREUR', 'BILE', 'FIEL', 'VENIN', 'RANCŒUR', 'RANCUNE', 'RESSENTIMENT', 'ANIMOSITE', 'HOSTILITE', 'AVERSION', 'ANTIPATHIE', 'REPUGNANCE', 'DEGOUT', 'NAUSEE', 'ECŒUREMENT', 'HAUT-LE-CŒUR']
  }
}

// Configuration par difficulté
export const DIFFICULTY_CONFIG: Record<
  PenduDifficulty,
  { maxErrors: number; drinkMultiplier: number; bonusPoints: number; timerDuration: number }
> = {
  facile: {
    maxErrors: 8,
    drinkMultiplier: 1,
    bonusPoints: 10,
    timerDuration: 60 // 60 secondes
  },
  normal: {
    maxErrors: 6,
    drinkMultiplier: 1.5,
    bonusPoints: 15,
    timerDuration: 50 // 50 secondes
  },
  difficile: {
    maxErrors: 5,
    drinkMultiplier: 2,
    bonusPoints: 25,
    timerDuration: 40 // 40 secondes
  },
  extreme: {
    maxErrors: 4,
    drinkMultiplier: 3,
    bonusPoints: 40,
    timerDuration: 30 // 30 secondes
  }
}

export type PenduCategory = keyof typeof WORD_CATEGORIES

/** Ordre historique des catégories (celui de `Object.keys`) : il fixe le tirage. */
export const PENDU_CATEGORIES = Object.keys(WORD_CATEGORIES) as PenduCategory[]

/** Symbole du minuteur écoulé, rangé parmi les lettres fausses (jamais compté comme erreur). */
export const TIMEOUT_MARK = '⏰'
/** Gorgées d'un minuteur écoulé, attribuées au passage au joueur suivant. */
export const TIMEOUT_DRINKS = 3
/** Indices par mot : voyelle, première lettre, puis une « consonne ». */
export const MAX_HINTS = 3
/** Un indice coûte 10 s de minuteur ; impossible avec 10 s ou moins. */
export const HINT_COST_SECONDS = 10
export const VOWELS = ['A', 'E', 'I', 'O', 'U', 'Y']
/** Clavier proposé aux joueurs : A-Z, sans accents ni tiret. */
export const PENDU_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export type RandomSource = () => number

/** Les joueurs piochent dans leur niveau ET les niveaux inférieurs. */
export function availableDifficulties(difficulty: PenduDifficulty): PenduDifficulty[] {
  if (difficulty === 'extreme') return ['facile', 'normal', 'difficile', 'extreme']
  if (difficulty === 'difficile') return ['facile', 'normal', 'difficile']
  if (difficulty === 'normal') return ['facile', 'normal']
  return ['facile']
}

/**
 * Tire une catégorie, puis un mot parmi tous ceux des niveaux accessibles de
 * cette catégorie (deux tirages, dans cet ordre). Les listes ne sont pas
 * dédoublonnées : un mot présent deux fois a deux fois plus de chances.
 */
export function pickPenduWord(
  difficulty: PenduDifficulty,
  random: RandomSource = Math.random
): { word: string; category: PenduCategory } {
  const category = PENDU_CATEGORIES[Math.floor(random() * PENDU_CATEGORIES.length)]
  const words = availableDifficulties(difficulty).flatMap((level) => WORD_CATEGORIES[category][level])
  return { word: words[Math.floor(random() * words.length)], category }
}

export type PenduPlayerScore = { id: string; score: number; drinks: number; wins: number }

export type PenduRoundState = 'playing' | 'won' | 'lost' | 'ended'

export type PenduState = {
  difficulty: PenduDifficulty
  /** Compteurs de la partie, dans l'ordre de la table (les profils restent au composant). */
  players: PenduPlayerScore[]
  currentPlayerIndex: number
  round: number
  currentWord: string
  currentCategory: string
  guessedLetters: string[]
  /** Lettres fausses, plus TIMEOUT_MARK quand le minuteur s'est écoulé. */
  wrongLetters: string[]
  gameState: PenduRoundState
  hintsUsed: number
  /** Pendu « normal » constaté (évite de le constater deux fois). */
  drinksPenaltyApplied: boolean
  /** Gorgées de minuteur écoulé en attente d'attribution. */
  timeoutDrinksToAdd: number
  /** Minuteur écoulé : le pendu complet s'affiche en fond. */
  showCompleteHangman: boolean
}

/** Autant de manches que de joueurs (règle historique : N joueurs → N-1 tours de table). */
export function penduMaxRounds(state: Pick<PenduState, 'players'>): number {
  return state.players.length
}

/** Nouveau mot pour le joueur au tour : lettres, indices et pénalités remis à zéro. */
export function drawPenduWord(state: PenduState, random: RandomSource = Math.random): PenduState {
  const { word, category } = pickPenduWord(state.difficulty, random)
  return {
    ...state,
    currentWord: word,
    currentCategory: category,
    guessedLetters: [],
    wrongLetters: [],
    gameState: 'playing',
    hintsUsed: 0,
    drinksPenaltyApplied: false,
    timeoutDrinksToAdd: 0,
    showCompleteHangman: false,
  }
}

/** Nouvelle partie : compteurs à zéro, premier joueur, manche 1, premier mot tiré. */
export function createPenduGame(options: {
  difficulty: PenduDifficulty
  playerIds: string[]
  random?: RandomSource
}): PenduState {
  const { difficulty, playerIds, random = Math.random } = options
  return drawPenduWord(
    {
      difficulty,
      players: playerIds.map((id) => ({ id, score: 0, drinks: 0, wins: 0 })),
      currentPlayerIndex: 0,
      round: 1,
      currentWord: '',
      currentCategory: '',
      guessedLetters: [],
      wrongLetters: [],
      gameState: 'playing',
      hintsUsed: 0,
      drinksPenaltyApplied: false,
      timeoutDrinksToAdd: 0,
      showCompleteHangman: false,
    },
    random
  )
}

/**
 * Lettre proposée. Doublons ignorés : une lettre déjà jouée (juste ou fausse)
 * ne compte pas deux fois, et rien ne bouge hors d'un mot en cours. Aucune
 * normalisation : « E » ne découvre pas un « É ».
 */
export function guessPenduLetter(state: PenduState, letter: string): PenduState {
  if (state.guessedLetters.includes(letter) || state.wrongLetters.includes(letter) || state.gameState !== 'playing') {
    return state
  }
  return state.currentWord.includes(letter)
    ? { ...state, guessedLetters: [...state.guessedLetters, letter] }
    : { ...state, wrongLetters: [...state.wrongLetters, letter] }
}

/** Erreurs réelles : les lettres fausses, sans le symbole du minuteur écoulé. */
export function penduErrorCount(state: Pick<PenduState, 'wrongLetters'>): number {
  return state.wrongLetters.filter((letter) => letter !== TIMEOUT_MARK).length
}

export type PenduRoundOutcome = 'won' | 'lost' | null

/**
 * Verdict du mot en cours (à relancer après chaque changement) :
 * - toutes les lettres DISTINCTES du mot trouvées → gagné : bonus du niveau et
 *   une victoire au joueur ;
 * - erreurs réelles ≥ maximum du niveau → pendu (les gorgées tombent au
 *   passage au joueur suivant). Un minuteur écoulé est traité ailleurs.
 */
export function evaluatePenduRound(state: PenduState): { state: PenduState; outcome: PenduRoundOutcome } {
  if (!state.currentWord || state.gameState !== 'playing') return { state, outcome: null }
  const config = DIFFICULTY_CONFIG[state.difficulty]

  const wordLetters = [...new Set(state.currentWord.split(''))]
  const isWordGuessed = wordLetters.every((letter) => state.guessedLetters.includes(letter))
  const isGameLost = penduErrorCount(state) >= config.maxErrors
  const isTimeout = state.wrongLetters.includes(TIMEOUT_MARK)

  if (isWordGuessed) {
    return {
      state: {
        ...state,
        gameState: 'won',
        players: state.players.map((p, i) =>
          i === state.currentPlayerIndex ? { ...p, score: p.score + config.bonusPoints, wins: p.wins + 1 } : p
        ),
      },
      outcome: 'won',
    }
  }
  if (isGameLost && !isTimeout && !state.drinksPenaltyApplied) {
    return { state: { ...state, gameState: 'lost', drinksPenaltyApplied: true }, outcome: 'lost' }
  }
  return { state, outcome: null }
}

/**
 * Indice : coûte HINT_COST_SECONDS de minuteur (refusé à 10 s ou moins), trois
 * par mot. 1er : une voyelle non trouvée, au hasard parmi les occurrences
 * (une voyelle présente deux fois a deux chances) ; 2e : la première lettre ;
 * 3e : une « consonne » au hasard — tout ce qui n'est pas une voyelle, tiret
 * et lettre accentuée compris. L'indice est consommé même sans rien révéler.
 * Null si l'indice est refusé.
 */
export function applyPenduHint(
  state: PenduState,
  timeLeft: number,
  random: RandomSource = Math.random
): { state: PenduState; timeCost: number } | null {
  if (state.hintsUsed >= MAX_HINTS || state.gameState !== 'playing' || !state.currentWord) return null
  if (timeLeft <= HINT_COST_SECONDS) return null

  const letters = state.currentWord.split('')
  let revealed: string | null = null
  if (state.hintsUsed === 0) {
    const unusedVowels = letters.filter((l) => VOWELS.includes(l)).filter((v) => !state.guessedLetters.includes(v))
    if (unusedVowels.length > 0) revealed = unusedVowels[Math.floor(random() * unusedVowels.length)]
  } else if (state.hintsUsed === 1) {
    const firstLetter = state.currentWord[0]
    if (!state.guessedLetters.includes(firstLetter)) revealed = firstLetter
  } else if (state.hintsUsed === 2) {
    const consonants = letters.filter((l) => !VOWELS.includes(l) && !state.guessedLetters.includes(l))
    if (consonants.length > 0) revealed = consonants[Math.floor(random() * consonants.length)]
  }

  return {
    state: {
      ...state,
      guessedLetters: revealed === null ? state.guessedLetters : [...state.guessedLetters, revealed],
      hintsUsed: state.hintsUsed + 1,
    },
    timeCost: HINT_COST_SECONDS,
  }
}

/**
 * Minuteur écoulé : le mot est perdu, TIMEOUT_DRINKS gorgées attendent le
 * passage au joueur suivant (à la place de la pénalité du pendu), le pendu
 * complet s'affiche. S'applique quel que soit l'état du mot (comportement
 * historique : le minuteur n'est pas toujours arrêté à temps).
 */
export function expirePenduTimer(state: PenduState): PenduState {
  return {
    ...state,
    gameState: 'lost',
    timeoutDrinksToAdd: TIMEOUT_DRINKS,
    showCompleteHangman: true,
    wrongLetters: state.wrongLetters.includes(TIMEOUT_MARK) ? state.wrongLetters : [...state.wrongLetters, TIMEOUT_MARK],
  }
}

/**
 * Gorgées du joueur au tour, dues au passage au suivant : celles du minuteur
 * écoulé s'il y en a, sinon — pendu « normal » — ⌈multiplicateur × (erreurs −
 * maximum + 2)⌉, soit 2 × multiplicateur arrondi au-dessus. Sinon 0.
 */
export function penduRoundDrinks(state: PenduState): number {
  if (state.timeoutDrinksToAdd > 0) return state.timeoutDrinksToAdd
  if (state.gameState === 'lost' && !state.wrongLetters.includes(TIMEOUT_MARK)) {
    const config = DIFFICULTY_CONFIG[state.difficulty]
    return Math.ceil(config.drinkMultiplier * (penduErrorCount(state) - config.maxErrors + 2))
  }
  return 0
}

/**
 * Passage au joueur suivant : gorgées du mot attribuées, puis joueur et manche
 * suivants avec un nouveau mot — ou fin de partie quand la manche suivante
 * atteindrait le nombre de joueurs (la partie s'arrête alors sur le joueur et
 * la manche courants).
 */
export function advancePenduGame(
  state: PenduState,
  random: RandomSource = Math.random
): { state: PenduState; ended: boolean } {
  const drinks = penduRoundDrinks(state)
  let next: PenduState = state
  if (drinks !== 0 || state.timeoutDrinksToAdd > 0) {
    next = {
      ...state,
      timeoutDrinksToAdd: 0,
      players: state.players.map((p, i) => (i === state.currentPlayerIndex ? { ...p, drinks: p.drinks + drinks } : p)),
    }
  }

  const nextIndex = (state.currentPlayerIndex + 1) % state.players.length
  // Tour de table bouclé : manche suivante.
  const willCompleteRound = nextIndex === 0
  const newRound = willCompleteRound ? state.round + 1 : state.round
  if (newRound >= penduMaxRounds(state)) {
    return { state: { ...next, gameState: 'ended' }, ended: true }
  }
  return { state: drawPenduWord({ ...next, currentPlayerIndex: nextIndex, round: newRound }, random), ended: false }
}

/** Gagnant : le plus de points, le premier de la table à égalité. */
export function penduWinner(state: Pick<PenduState, 'players'>): PenduPlayerScore | null {
  if (state.players.length === 0) return null
  return state.players.reduce((prev, current) => (current.score > prev.score ? current : prev))
}

/** Étape du dessin (0-8) selon la part des erreurs permises déjà commises. */
export function penduHangmanStage(errorCount: number, maxErrors: number): number {
  if (errorCount === 0) return 0
  const stage = Math.ceil((errorCount / maxErrors) * 8)
  return Math.min(Math.max(stage, 1), 8)
}

/** Mot affiché : lettres trouvées, « _ » ailleurs (tirets compris), séparés d'une espace. */
export function penduDisplayWord(word: string, guessedLetters: string[]): string {
  return word
    .split('')
    .map((letter) => (guessedLetters.includes(letter) ? letter : '_'))
    .join(' ')
}

/**
 * Lettres d'un mot absentes du clavier A-Z (accents, Œ, tiret, minuscule) :
 * elles ne se découvrent qu'au hasard du troisième indice. Sert au diagnostic
 * des listes de mots ; ne change rien au jeu.
 */
export function penduUnreachableLetters(word: string): string[] {
  return [...new Set(word.split(''))].filter((letter) => !PENDU_ALPHABET.includes(letter))
}

// ─── Reprise de partie (useResumableLocalGame) ───────────────────────────────

export const PENDU_SAVE_ID = 'pendu'
/** Incrémenter si la forme de PenduSave change : une vieille sauvegarde sera jetée. */
export const PENDU_SAVE_VERSION = 1

export type PenduSave = PenduState & {
  /** Table de la sauvegarde : on ne reprend jamais la soirée d'hier. */
  playerIds: string[]
  /** Secondes restantes au minuteur du mot en cours. */
  timeLeft: number
}

/** Uniquement des identifiants et des compteurs : aucun profil recopié. */
export function toPenduSave(state: PenduState, timeLeft: number): PenduSave {
  return { ...state, playerIds: state.players.map((p) => p.id), timeLeft }
}

const DIFFICULTIES: PenduDifficulty[] = ['facile', 'normal', 'difficile', 'extreme']
const RESUMABLE_STATES: PenduRoundState[] = ['playing', 'won', 'lost']

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

function isPlayerScore(value: unknown): value is PenduPlayerScore {
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  return typeof p.id === 'string' && isFiniteNumber(p.score) && isFiniteNumber(p.drinks) && isFiniteNumber(p.wins)
}

/**
 * Sauvegarde → état de jeu et minuteur. Null si elle est illisible, terminée,
 * ou si un de ses joueurs n'est plus à la table (`playerIds`) : on repart
 * alors sur une partie neuve plutôt que de planter.
 */
export function restorePenduSave(
  save: unknown,
  playerIds: string[]
): { state: PenduState; timeLeft: number } | null {
  if (!save || typeof save !== 'object') return null
  const s = save as Record<string, unknown>
  if (!DIFFICULTIES.includes(s.difficulty as PenduDifficulty)) return null
  if (!RESUMABLE_STATES.includes(s.gameState as PenduRoundState)) return null
  if (!Array.isArray(s.players) || s.players.length === 0 || !s.players.every(isPlayerScore)) return null
  const players = s.players as PenduPlayerScore[]
  if (!players.every((p) => playerIds.includes(p.id))) return null
  if (!isFiniteNumber(s.currentPlayerIndex) || s.currentPlayerIndex < 0 || s.currentPlayerIndex >= players.length) {
    return null
  }
  if (!isFiniteNumber(s.round) || !isFiniteNumber(s.hintsUsed) || !isFiniteNumber(s.timeoutDrinksToAdd)) return null
  if (typeof s.currentWord !== 'string' || s.currentWord === '' || typeof s.currentCategory !== 'string') return null
  if (!isStringArray(s.guessedLetters) || !isStringArray(s.wrongLetters)) return null
  if (typeof s.drinksPenaltyApplied !== 'boolean' || typeof s.showCompleteHangman !== 'boolean') return null
  if (!isFiniteNumber(s.timeLeft)) return null

  const state: PenduState = {
    difficulty: s.difficulty as PenduDifficulty,
    players: players.map(({ id, score, drinks, wins }) => ({ id, score, drinks, wins })),
    currentPlayerIndex: s.currentPlayerIndex,
    round: s.round,
    currentWord: s.currentWord,
    currentCategory: s.currentCategory,
    guessedLetters: s.guessedLetters,
    wrongLetters: s.wrongLetters,
    gameState: s.gameState as PenduRoundState,
    hintsUsed: s.hintsUsed,
    drinksPenaltyApplied: s.drinksPenaltyApplied,
    timeoutDrinksToAdd: s.timeoutDrinksToAdd,
    showCompleteHangman: s.showCompleteHangman,
  }
  const timerDuration = DIFFICULTY_CONFIG[state.difficulty].timerDuration
  return { state, timeLeft: Math.min(Math.max(0, Math.round(s.timeLeft)), timerDuration) }
}
