"use client"

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { motion, AnimatePresence } from 'framer-motion'
import { Card } from '@/components/ui/card'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Player as BasePlayer, PlayerPreferences } from '@/lib/players'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { PlayerName, isSpecialPlayer } from '@/components/ui/PlayerName'
import ReactConfetti from 'react-confetti'
import { RefreshCw, Trophy, Home, Skull, Heart, Star, Clock } from 'lucide-react'

interface GamePlayer extends Omit<BasePlayer, 'stats' | 'createdAt'> {
  score: number
  drinks: number
  wins: number
  stats?: {
    gamesPlayed: number;
    wins: number;
    totalDrinks: number;
    favoriteGame?: string;
    lastPlayed?: number;
  }
  createdAt?: number
  preferences: PlayerPreferences
  id: string
}

interface GameProps {
  players: BasePlayer[]
  onGameEnd: () => void
  difficulty?: Difficulty
}

type Difficulty = 'facile' | 'normal' | 'difficile' | 'extreme'

// Mots par catégorie et difficulté - 60 mots par catégorie (15 par niveau)
const WORD_CATEGORIES = {
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

// Messages spéciaux pour certains joueurs
const simCompliments = [
  'Le tout puissant',
  'Le magnifique', 
  'Le grand sage',
  'Le maître',
  'Sa majesté',
  'Le créateur',
  'L\'invincible',
  'Le légendaire',
  'Le suprême',
  'L\'incontestable'
]

const debMessages = [
  'Boit des vrais gorgées',
  'Des gorgées pas des centilitres',
  'Pas que 2 cl !',
  'Boit vraiment cette fois',
  'Pas de triche',
  'Arrête de faire semblant',
  'On t\'a vu tricher',
  'Bois pour de vrai',
  'Pas d\'eau cette fois'
]

// Configuration par difficulté
const DIFFICULTY_CONFIG = {
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

// Types de styles de pendu
type HangmanStyle = 'classic' | 'modern' | 'space'

// Types de thèmes de couleur
type ColorTheme = 'default' | 'ocean' | 'sunset' | 'forest' | 'galaxy' | 'fire' | 'ice'

// Configuration des thèmes de couleur
const COLOR_THEMES = {
  default: {
    name: '🎯 Classique',
    background: 'from-purple-900 via-blue-900 to-indigo-900',
    cardBg: 'bg-white/10',
    cardBorder: 'border-white/20',
    title: 'from-yellow-400 to-orange-400',
    subtitle: 'text-purple-200',
    wordText: 'from-green-400 to-blue-400',
    category: 'text-yellow-400',
    hangmanBg: 'from-sky-100 to-sky-200'
  },
  ocean: {
    name: '🌊 Océan',
    background: 'from-blue-900 via-cyan-900 to-teal-900',
    cardBg: 'bg-cyan-500/10',
    cardBorder: 'border-cyan-300/20',
    title: 'from-cyan-300 to-blue-300',
    subtitle: 'text-cyan-200',
    wordText: 'from-teal-300 to-cyan-300',
    category: 'text-cyan-300',
    hangmanBg: 'from-cyan-100 to-blue-100'
  },
  sunset: {
    name: '🌅 Coucher de soleil',
    background: 'from-orange-900 via-red-900 to-pink-900',
    cardBg: 'bg-orange-500/10',
    cardBorder: 'border-orange-300/20',
    title: 'from-orange-300 to-pink-300',
    subtitle: 'text-orange-200',
    wordText: 'from-yellow-300 to-orange-300',
    category: 'text-orange-300',
    hangmanBg: 'from-orange-100 to-pink-100'
  },
  forest: {
    name: '🌲 Forêt',
    background: 'from-green-900 via-emerald-900 to-teal-900',
    cardBg: 'bg-green-500/10',
    cardBorder: 'border-green-300/20',
    title: 'from-green-300 to-emerald-300',
    subtitle: 'text-green-200',
    wordText: 'from-lime-300 to-green-300',
    category: 'text-green-300',
    hangmanBg: 'from-green-100 to-emerald-100'
  },
  galaxy: {
    name: '🌌 Galaxie',
    background: 'from-purple-900 via-violet-900 to-indigo-900',
    cardBg: 'bg-purple-500/10',
    cardBorder: 'border-purple-300/20',
    title: 'from-purple-300 to-pink-300',
    subtitle: 'text-purple-200',
    wordText: 'from-violet-300 to-purple-300',
    category: 'text-purple-300',
    hangmanBg: 'from-purple-100 to-violet-100'
  },
  fire: {
    name: '🔥 Feu',
    background: 'from-red-900 via-orange-900 to-yellow-900',
    cardBg: 'bg-red-500/10',
    cardBorder: 'border-red-300/20',
    title: 'from-red-300 to-yellow-300',
    subtitle: 'text-red-200',
    wordText: 'from-orange-300 to-red-300',
    category: 'text-red-300',
    hangmanBg: 'from-red-100 to-orange-100'
  },
  ice: {
    name: '❄️ Glace',
    background: 'from-blue-900 via-indigo-900 to-slate-900',
    cardBg: 'bg-blue-500/10',
    cardBorder: 'border-blue-300/20',
    title: 'from-blue-300 to-slate-300',
    subtitle: 'text-blue-200',
    wordText: 'from-slate-300 to-blue-300',
    category: 'text-blue-300',
    hangmanBg: 'from-blue-100 to-slate-100'
  }
}

// Composant SVG pour chaque étape du pendu
const HangmanStage = ({ stage, style = 'classic' }: { stage: number; style?: HangmanStyle }) => {
  // Couleurs selon le style
  const getStyleColors = (style: HangmanStyle) => {
    switch (style) {
      case 'modern':
        return {
          base: '#C0C0C0', // Métal
          rope: '#000000', // Noir
          head: '#FFE4C4', // Beige
          body: '#4169E1', // Bleu royal
          limbs: '#FF6347' // Rouge tomate
        }
      case 'space':
        return {
          base: '#708090', // Acier
          rope: '#00CED1', // Turquoise
          head: '#98FB98', // Vert alien
          body: '#4B0082', // Indigo
          limbs: '#FF1493' // Rose vif
        }
      default: // classic
        return {
          base: '#8B4513', // Marron pour le bois
          rope: '#654321', // Marron foncé pour la corde
          head: '#FFD700', // Doré pour la tête
          body: '#FF6B6B', // Rouge pour le corps
          limbs: '#4ECDC4' // Turquoise pour les membres
        }
    }
  }

  const stageColors = getStyleColors(style)

  // Rendu selon le style
  if (style === 'modern') {
    return (
      <svg viewBox="0 0 200 250" className="w-full h-full">
        {/* Gratte-ciel/Building */}
        {stage >= 1 && (
          <rect x="40" y="200" width="120" height="40" fill={stageColors.base} rx="2" />
        )}
        {stage >= 2 && (
          <rect x="95" y="50" width="10" height="200" fill={stageColors.base} rx="1" />
        )}
        {stage >= 3 && (
          <rect x="95" y="50" width="60" height="10" fill={stageColors.base} rx="1" />
        )}
        {/* Câble électrique */}
        {stage >= 4 && (
          <>
            <path d="M 155 60 Q 160 70 155 80 Q 150 90 155 100" stroke={stageColors.rope} strokeWidth="3" fill="none" />
            <circle cx="155" cy="100" r="5" fill="none" stroke={stageColors.rope} strokeWidth="2" />
          </>
        )}
        {/* Robot/Cyborg */}
        {stage >= 5 && (
          <>
            <rect x="145" y="110" width="20" height="20" fill={stageColors.head} rx="3" />
            <rect x="148" y="113" width="4" height="2" fill="#00FF00" />
            <rect x="152" y="113" width="4" height="2" fill="#00FF00" />
            <rect x="149" y="118" width="6" height="1" fill="#333" />
            {stage >= 8 && (
              <>
                <rect x="148" y="113" width="4" height="2" fill="#FF0000" />
                <rect x="152" y="113" width="4" height="2" fill="#FF0000" />
                <text x="155" y="125" fontSize="8" fill="#FF0000">ERROR</text>
              </>
            )}
          </>
        )}
        {/* Corps mécanique */}
        {stage >= 6 && (
          <rect x="150" y="130" width="10" height="30" fill={stageColors.body} rx="2" />
        )}
        {/* Bras mécaniques */}
        {stage >= 7 && (
          <rect x="135" y="140" width="15" height="4" fill={stageColors.limbs} rx="1" />
        )}
        {stage >= 8 && (
          <>
            <rect x="160" y="140" width="15" height="4" fill={stageColors.limbs} rx="1" />
            <rect x="150" y="160" width="4" height="20" fill={stageColors.limbs} rx="1" />
            <rect x="156" y="160" width="4" height="20" fill={stageColors.limbs} rx="1" />
          </>
        )}
      </svg>
    )
  }

  if (style === 'space') {
    return (
      <svg viewBox="0 0 200 250" className="w-full h-full">
        {/* Station spatiale */}
        {stage >= 1 && (
          <ellipse cx="100" cy="230" rx="80" ry="15" fill={stageColors.base} />
        )}
        {stage >= 2 && (
          <rect x="96" y="80" width="8" height="150" fill={stageColors.base} rx="2" />
        )}
        {/* Bras robotique */}
        {stage >= 3 && (
          <>
            <rect x="96" y="80" width="40" height="6" fill={stageColors.base} rx="1" />
            <circle cx="136" cy="83" r="4" fill={stageColors.base} />
          </>
        )}
        {/* Rayon tracteur */}
        {stage >= 4 && (
          <>
            <path d="M 136 87 L 136 120" stroke={stageColors.rope} strokeWidth="3" strokeDasharray="5,3" />
            <circle cx="136" cy="120" r="8" fill="none" stroke={stageColors.rope} strokeWidth="2" opacity="0.7" />
          </>
        )}
        {/* Alien */}
        {stage >= 5 && (
          <>
            <ellipse cx="136" cy="140" rx="18" ry="15" fill={stageColors.head} stroke="#333" strokeWidth="2" />
            <ellipse cx="130" cy="135" rx="4" ry="6" fill="#000" />
            <ellipse cx="142" cy="135" rx="4" ry="6" fill="#000" />
            <ellipse cx="136" cy="148" rx="2" ry="1" fill="#333" />
            {stage >= 8 && (
              <>
                <line x1="126" y1="131" x2="134" y2="139" stroke="#FF0000" strokeWidth="2" />
                <line x1="134" y1="131" x2="126" y2="139" stroke="#FF0000" strokeWidth="2" />
                <line x1="138" y1="131" x2="146" y2="139" stroke="#FF0000" strokeWidth="2" />
                <line x1="146" y1="131" x2="138" y2="139" stroke="#FF0000" strokeWidth="2" />
              </>
            )}
          </>
        )}
        {/* Corps alien */}
        {stage >= 6 && (
          <ellipse cx="136" cy="175" rx="8" ry="20" fill={stageColors.body} />
        )}
        {/* Tentacules */}
        {stage >= 7 && (
          <path d="M 136 165 Q 120 175 115 190 Q 110 200 120 205" stroke={stageColors.limbs} strokeWidth="3" fill="none" />
        )}
        {stage >= 8 && (
          <>
            <path d="M 136 165 Q 152 175 157 190 Q 162 200 152 205" stroke={stageColors.limbs} strokeWidth="3" fill="none" />
            <path d="M 136 185 Q 125 195 120 210" stroke={stageColors.limbs} strokeWidth="3" fill="none" />
            <path d="M 136 185 Q 147 195 152 210" stroke={stageColors.limbs} strokeWidth="3" fill="none" />
          </>
        )}
        {/* Étoiles */}
        <g fill="#FFD700" opacity="0.8">
          <circle cx="30" cy="40" r="1" />
          <circle cx="170" cy="30" r="1.5" />
          <circle cx="50" cy="60" r="1" />
          <circle cx="160" cy="70" r="1" />
        </g>
      </svg>
    )
  }

  // Style classique par défaut
  return (
    <svg viewBox="0 0 200 250" className="w-full h-full">
      {/* Base - toujours visible sauf étape 0 */}
      {stage >= 1 && (
        <rect x="10" y="230" width="180" height="15" fill={stageColors.base} rx="2" />
      )}
      
      {/* Poteau vertical */}
      {stage >= 2 && (
        <rect x="30" y="20" width="8" height="210" fill={stageColors.base} rx="2" />
      )}
      
      {/* Barre horizontale */}
      {stage >= 3 && (
        <rect x="30" y="20" width="100" height="8" fill={stageColors.base} rx="2" />
      )}
      
      {/* Corde - Placée AVANT le corps et la tête pour être en arrière-plan */}
      {stage >= 4 && (
        <>
          <rect x="125" y="28" width="4" height="30" fill={stageColors.rope} rx="1" />
          <circle cx="127" cy="58" r="8" fill="none" stroke={stageColors.rope} strokeWidth="2" />
        </>
      )}
      
      {/* Corps - Placé AVANT la tête pour être en arrière-plan */}
      {stage >= 6 && (
        <rect x="125" y="95" width="4" height="60" fill={stageColors.body} rx="1" />
      )}
      
      {/* Bras gauche */}
      {stage >= 7 && (
        <line x1="127" y1="110" x2="105" y2="135" stroke={stageColors.limbs} strokeWidth="3" strokeLinecap="round" />
      )}
      
      {/* Bras droit et jambes (mort) */}
      {stage >= 8 && (
        <>
          {/* Bras droit */}
          <line x1="127" y1="110" x2="149" y2="135" stroke={stageColors.limbs} strokeWidth="3" strokeLinecap="round" />
          {/* Jambe gauche */}
          <line x1="127" y1="155" x2="110" y2="190" stroke={stageColors.limbs} strokeWidth="3" strokeLinecap="round" />
          {/* Jambe droite */}
          <line x1="127" y1="155" x2="144" y2="190" stroke={stageColors.limbs} strokeWidth="3" strokeLinecap="round" />
        </>
      )}
      
      {/* Tête - Placée EN DERNIER pour être au premier plan */}
      {stage >= 5 && (
        <>
          <circle cx="127" cy="80" r="15" fill={stageColors.head} stroke="#333" strokeWidth="2" />
          {/* Yeux */}
          <circle cx="122" cy="76" r="2" fill="#333" />
          <circle cx="132" cy="76" r="2" fill="#333" />
          {/* Bouche */}
          <path d="M 120 85 Q 127 90 134 85" stroke="#333" strokeWidth="2" fill="none" />
          
          {/* Effet de mort - yeux en X (seulement à la mort) */}
          {stage >= 8 && (
            <>
              <g stroke="#FF0000" strokeWidth="2">
                <line x1="119" y1="73" x2="125" y2="79" />
                <line x1="125" y1="73" x2="119" y2="79" />
                <line x1="129" y1="73" x2="135" y2="79" />
                <line x1="135" y1="73" x2="129" y2="79" />
              </g>
            </>
          )}
        </>
      )}
      
      {/* Effet de particules de danger pour les dernières étapes */}
      {stage >= 7 && (
        <g>
          <circle cx="160" cy="40" r="2" fill="#FF0000" opacity="0.6">
            <animate attributeName="opacity" values="0.6;1;0.6" dur="1s" repeatCount="indefinite" />
          </circle>
          <circle cx="170" cy="60" r="1.5" fill="#FF4500" opacity="0.7">
            <animate attributeName="opacity" values="0.7;1;0.7" dur="1.2s" repeatCount="indefinite" />
          </circle>
          <circle cx="165" cy="80" r="1" fill="#FF6347" opacity="0.5">
            <animate attributeName="opacity" values="0.5;1;0.5" dur="0.8s" repeatCount="indefinite" />
          </circle>
        </g>
      )}
    </svg>
  )
}

// Fonction pour calculer quelle étape du pendu afficher selon la difficulté
const getHangmanStage = (errorCount: number, maxErrors: number): number => {
  if (errorCount === 0) return 0
  
  // Calculer le pourcentage d'erreurs et le mapper sur les étapes du pendu (1-8)
  const percentage = errorCount / maxErrors
  const stage = Math.ceil(percentage * 8)
  
  // S'assurer que l'étape est dans les limites
  return Math.min(Math.max(stage, 1), 8)
}

export default function Game({ players: initialPlayers, onGameEnd, difficulty = 'normal' }: GameProps) {
  const [players, setPlayers] = useState<GamePlayer[]>(
    initialPlayers.map(p => ({ 
      ...p, 
      score: 0, 
      drinks: 0, 
      wins: 0,
      preferences: p.preferences || { color: 'bg-blue-500', icon: '👤' }
    }))
  )
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0)
  const [currentWord, setCurrentWord] = useState('')
  const [currentCategory, setCurrentCategory] = useState('')
  const [guessedLetters, setGuessedLetters] = useState<string[]>([])
  const [wrongLetters, setWrongLetters] = useState<string[]>([])
  const [gameState, setGameState] = useState<'playing' | 'won' | 'lost' | 'ended'>('playing')
  const [round, setRound] = useState(1)
  const [showConfetti, setShowConfetti] = useState(false)
  const [showRoundDialog, setShowRoundDialog] = useState(false)
  const [roundResult, setRoundResult] = useState('')
  const [showEndDialog, setShowEndDialog] = useState(false)
  const [timeLeft, setTimeLeft] = useState(DIFFICULTY_CONFIG[difficulty].timerDuration)
  const [isTimerActive, setIsTimerActive] = useState(false)
  const [timerRef, setTimerRef] = useState<NodeJS.Timeout | null>(null)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [maxHints] = useState(3) // Maximum 3 indices par mot
  const [hangmanStyle, setHangmanStyle] = useState<HangmanStyle>('classic')
  const [drinksPenaltyApplied, setDrinksPenaltyApplied] = useState(false)
  const [timeoutDrinksToAdd, setTimeoutDrinksToAdd] = useState(0)
  const [colorTheme, setColorTheme] = useState<ColorTheme>('default')
  const [showThemeMenu, setShowThemeMenu] = useState(false)
  const [showCompleteHangman, setShowCompleteHangman] = useState(false)
  
  const config = DIFFICULTY_CONFIG[difficulty]
  const currentPlayer = players[currentPlayerIndex]
  const maxRounds = players.length // Un tour pour chaque joueur
  const theme = COLOR_THEMES[colorTheme]
  
  // Calculer les seuils de couleur proportionnels à la durée du minuteur
  const getTimerColor = (timeLeft: number) => {
    const redThreshold = Math.floor(config.timerDuration * 0.17) // ~17% du temps (10/60 = 0.17)
    const orangeThreshold = Math.floor(config.timerDuration * 0.33) // ~33% du temps (20/60 = 0.33)
    
    if (timeLeft <= redThreshold) return 'text-red-500'
    if (timeLeft <= orangeThreshold) return 'text-orange-500'
    return 'text-green-500'
  }
  
  const getTimerTextColor = (timeLeft: number) => {
    const redThreshold = Math.floor(config.timerDuration * 0.17)
    const orangeThreshold = Math.floor(config.timerDuration * 0.33)
    
    if (timeLeft <= redThreshold) return 'text-red-400 animate-pulse'
    if (timeLeft <= orangeThreshold) return 'text-orange-400'
    return 'text-green-400'
  }

  // Démarrer le minuteur
  const startTimer = useCallback(() => {
    // Nettoyer l'ancien minuteur s'il existe
    setTimerRef(prevTimer => {
      if (prevTimer) {
        clearInterval(prevTimer)
      }
      return null
    })
    
    setTimeLeft(config.timerDuration)
    setIsTimerActive(true)
    
    const newTimer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Nettoyer le minuteur immédiatement
          clearInterval(newTimer)
          setIsTimerActive(false)
          setTimerRef(null)
          
          // Temps écoulé - marquer pour attribution lors du clic
          setGameState('lost')
          setTimeoutDrinksToAdd(3) // Marquer 3 gorgées à ajouter plus tard
          setShowCompleteHangman(true) // Afficher le pendu complet en fond
          
          // Ajouter seulement le symbole timeout
          setWrongLetters(prevWrong => {
            if (!prevWrong.includes('⏰')) {
              return [...prevWrong, '⏰']
            }
            return prevWrong
          })
          
          console.log('TIMEOUT DÉTECTÉ - 3 gorgées seront ajoutées au clic sur "Joueur suivant"')
          
          return 0
        }
        return prev - 1
      })
    }, 1000)
    
    setTimerRef(newTimer)
  }, [config])

  // Arrêter le minuteur
  const stopTimer = useCallback(() => {
    setTimerRef(prevTimer => {
      if (prevTimer) {
        clearInterval(prevTimer)
      }
      return null
    })
    setIsTimerActive(false)
  }, [])

  // Générer un nouveau mot
  const generateNewWord = useCallback(() => {
    const categories = Object.keys(WORD_CATEGORIES)
    const randomCategory = categories[Math.floor(Math.random() * categories.length)]
    
    // Déterminer les difficultés accessibles selon la difficulté actuelle
    // Les joueurs ont accès aux mots de leur niveau ET des niveaux inférieurs
    const availableDifficulties: Difficulty[] = []
    if (difficulty === 'extreme') {
      availableDifficulties.push('facile', 'normal', 'difficile', 'extreme')
    } else if (difficulty === 'difficile') {
      availableDifficulties.push('facile', 'normal', 'difficile')
    } else if (difficulty === 'normal') {
      availableDifficulties.push('facile', 'normal')
    } else {
      availableDifficulties.push('facile')
    }
    
    // Collecter tous les mots des difficultés accessibles
    const allAvailableWords: string[] = []
    availableDifficulties.forEach(diff => {
      const words = WORD_CATEGORIES[randomCategory as keyof typeof WORD_CATEGORIES][diff]
      allAvailableWords.push(...words)
    })
    
    const randomWord = allAvailableWords[Math.floor(Math.random() * allAvailableWords.length)]
    
    setCurrentWord(randomWord)
    setCurrentCategory(randomCategory)
    setGuessedLetters([])
    setWrongLetters([])
    setGameState('playing')
    setHintsUsed(0) // Réinitialiser les indices pour le nouveau mot
    setDrinksPenaltyApplied(false) // Réinitialiser le flag de pénalité
    setTimeoutDrinksToAdd(0) // Réinitialiser les gorgées timeout en attente
    setShowCompleteHangman(false) // Réinitialiser l'affichage du pendu complet
    
    // Démarrer le minuteur pour le nouveau mot
    setTimeout(() => {
      startTimer()
    }, 1000) // Délai d'1 seconde pour que le joueur se prépare
  }, [difficulty, startTimer])

  // Système d'indices
  const useHint = useCallback(() => {
    if (hintsUsed >= maxHints || gameState !== 'playing' || !currentWord) return

    const hintCost = 10 // Coût en secondes
    if (timeLeft <= hintCost) return // Pas assez de temps

    // Réduire le temps
    setTimeLeft(prev => Math.max(0, prev - hintCost))

    // Types d'indices selon le nombre déjà utilisé
    if (hintsUsed === 0) {
      // Premier indice : révéler une voyelle
      const vowels = ['A', 'E', 'I', 'O', 'U', 'Y']
      const wordVowels = currentWord.split('').filter(letter => vowels.includes(letter))
      const unusedVowels = wordVowels.filter(vowel => !guessedLetters.includes(vowel))
      
      if (unusedVowels.length > 0) {
        const randomVowel = unusedVowels[Math.floor(Math.random() * unusedVowels.length)]
        setGuessedLetters(prev => [...prev, randomVowel])
      }
    } else if (hintsUsed === 1) {
      // Deuxième indice : révéler la première lettre
      const firstLetter = currentWord[0]
      if (!guessedLetters.includes(firstLetter)) {
        setGuessedLetters(prev => [...prev, firstLetter])
      }
    } else if (hintsUsed === 2) {
      // Troisième indice : révéler une consonne aléatoire
      const consonants = currentWord.split('').filter(letter => 
        !['A', 'E', 'I', 'O', 'U', 'Y'].includes(letter) && !guessedLetters.includes(letter)
      )
      
      if (consonants.length > 0) {
        const randomConsonant = consonants[Math.floor(Math.random() * consonants.length)]
        setGuessedLetters(prev => [...prev, randomConsonant])
      }
    }

    setHintsUsed(prev => prev + 1)
  }, [hintsUsed, maxHints, gameState, currentWord, timeLeft, guessedLetters])

  // Initialiser le premier mot
  useEffect(() => {
    generateNewWord()
  }, [generateNewWord])

  // Vérifier l'état du jeu
  const checkGameState = useCallback(() => {
    if (!currentWord || gameState !== 'playing') return

    const wordLetters = [...new Set(currentWord.split(''))]
    const isWordGuessed = wordLetters.every(letter => guessedLetters.includes(letter))
    
    // Exclure le symbole timeout du calcul des erreurs réelles
    const realWrongLetters = wrongLetters.filter(letter => letter !== '⏰')
    const isGameLost = realWrongLetters.length >= config.maxErrors
    
    // Ne pas traiter les timeouts ici (ils sont gérés dans le minuteur)
    const isTimeout = wrongLetters.includes('⏰')

    if (isWordGuessed) {
      setGameState('won')
      setShowConfetti(true)
      // Arrêter le minuteur
      setTimerRef(prevTimer => {
        if (prevTimer) {
          clearInterval(prevTimer)
        }
        return null
      })
      setIsTimerActive(false)
      setTimeout(() => setShowConfetti(false), 3000)
      
      // Mettre à jour les scores
      setPlayers(prev => prev.map((p, i) => 
        i === currentPlayerIndex 
          ? { ...p, score: p.score + config.bonusPoints, wins: p.wins + 1 }
          : p
      ))
    } else if (isGameLost && !isTimeout && !drinksPenaltyApplied) {
      // Seulement pour pendu normal, PAS pour timeout - SANS ajouter de gorgées ici
      setGameState('lost')
      setDrinksPenaltyApplied(true)
      
      // Arrêter le minuteur
      setTimerRef(prevTimer => {
        if (prevTimer) {
          clearInterval(prevTimer)
        }
        return null
      })
      setIsTimerActive(false)
      
      console.log('PENDU NORMAL DÉTECTÉ - Gorgées seront attribuées au clic sur "Joueur suivant"')
    }
  }, [currentWord, guessedLetters, wrongLetters, config, currentPlayerIndex, gameState, drinksPenaltyApplied])

  useEffect(() => {
    checkGameState()
  }, [checkGameState])

  // Nettoyer le minuteur au démontage du composant
  useEffect(() => {
    return () => {
      setTimerRef(prevTimer => {
        if (prevTimer) {
          clearInterval(prevTimer)
        }
        return null
      })
    }
  }, [])

  // Gérer la lettre devinée
  const handleLetterGuess = (letter: string) => {
    if (guessedLetters.includes(letter) || wrongLetters.includes(letter) || gameState !== 'playing' || !isTimerActive) {
      return
    }

    // Arrêter le minuteur actuel
    stopTimer()

    if (currentWord.includes(letter)) {
      setGuessedLetters(prev => [...prev, letter])
    } else {
      setWrongLetters(prev => [...prev, letter])
    }

    // Redémarrer le minuteur après un court délai
    setTimeout(() => {
      if (gameState === 'playing') {
        startTimer()
      }
    }, 500)
  }

  // Passer au joueur suivant
  const nextPlayer = () => {
    // Attribuer les gorgées MAINTENANT si nécessaire
    if (timeoutDrinksToAdd > 0) {
      // Attribution pour timeout
      setPlayers(prevPlayers => {
        const updatedPlayers = [...prevPlayers]
        const oldDrinks = updatedPlayers[currentPlayerIndex].drinks
        updatedPlayers[currentPlayerIndex] = {
          ...updatedPlayers[currentPlayerIndex],
          drinks: oldDrinks + timeoutDrinksToAdd
        }
        console.log(`ATTRIBUTION FINALE: +${timeoutDrinksToAdd} gorgées pour ${updatedPlayers[currentPlayerIndex].name}`)
        console.log(`Avant: ${oldDrinks}, Après: ${updatedPlayers[currentPlayerIndex].drinks}`)
        return updatedPlayers
      })
      setTimeoutDrinksToAdd(0) // Réinitialiser
    } else if (gameState === 'lost' && !wrongLetters.includes('⏰')) {
      // Attribution pour pendu normal
      const realWrongLetters = wrongLetters.filter(letter => letter !== '⏰')
      const drinks = Math.ceil(config.drinkMultiplier * (realWrongLetters.length - config.maxErrors + 2))
      setPlayers(prevPlayers => {
        const updatedPlayers = [...prevPlayers]
        const oldDrinks = updatedPlayers[currentPlayerIndex].drinks
        updatedPlayers[currentPlayerIndex] = {
          ...updatedPlayers[currentPlayerIndex],
          drinks: oldDrinks + drinks
        }
        console.log(`ATTRIBUTION PENDU: +${drinks} gorgées pour ${updatedPlayers[currentPlayerIndex].name}`)
        console.log(`Avant: ${oldDrinks}, Après: ${updatedPlayers[currentPlayerIndex].drinks}`)
        return updatedPlayers
      })
    }

    const nextIndex = (currentPlayerIndex + 1) % players.length
    
    // Vérifier si on a fait un tour complet avant de passer au joueur suivant
    const willCompleteRound = nextIndex === 0
    const newRound = willCompleteRound ? round + 1 : round
    
    // Vérifier si on a fait tous les tours nécessaires
    if (newRound >= maxRounds) {
      // Fin de partie
      setGameState('ended')
      setShowEndDialog(true)
      return
    }
    
    setCurrentPlayerIndex(nextIndex)
    
    // Mettre à jour le round si nécessaire
    if (willCompleteRound) {
      setRound(newRound)
    }
    
    generateNewWord()
    setShowRoundDialog(false)
  }

  // Fonction pour obtenir le type de joueur spécial
  const getSpecialPlayerType = (playerName: string): 'sim' | 'deb' | null => {
    const name = playerName.toLowerCase()
    if (name === 'sim' || name === 'riqui') return 'sim'
    if (name === 'deb') return 'deb'
    return null
  }

  // Afficher le résultat du round
  useEffect(() => {
    if (gameState === 'won' || gameState === 'lost') {
      const isWon = gameState === 'won'
      const playerName = currentPlayer.name
      const specialType = getSpecialPlayerType(playerName)
      
      let message = ''
      if (isWon) {
        if (specialType === 'sim') {
          message = `🎉 ${simCompliments[Math.floor(Math.random() * simCompliments.length)]} a trouvé le mot !`
        } else {
          message = `🎉 ${playerName} a trouvé le mot "${currentWord}" !`
        }
      } else {
        // Vérifier si c'est un timeout
        const isTimeout = wrongLetters.includes('⏰')
        if (isTimeout) {
          if (specialType === 'deb') {
            message = `⏰ ${debMessages[Math.floor(Math.random() * debMessages.length)]} - Temps écoulé ! Le mot était "${currentWord}"`
          } else {
            message = `⏰ ${playerName} n'a pas trouvé à temps ! Le mot était "${currentWord}"`
          }
        } else {
          if (specialType === 'deb') {
            message = `💀 ${debMessages[Math.floor(Math.random() * debMessages.length)]} - Le mot était "${currentWord}"`
          } else {
            message = `💀 ${playerName} a été pendu ! Le mot était "${currentWord}"`
          }
        }
      }
      
      setRoundResult(message)
      setTimeout(() => setShowRoundDialog(true), 1000)
    }
  }, [gameState, currentPlayer.name, currentWord, wrongLetters])

  // Afficher le mot avec les lettres devinées
  const displayWord = useMemo(() => {
    return currentWord
      .split('')
      .map(letter => guessedLetters.includes(letter) ? letter : '_')
      .join(' ')
  }, [currentWord, guessedLetters])

  // Générer le clavier
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  
  // Calculer le gagnant
  const winner = useMemo(() => {
    if (gameState !== 'ended') return null
    return players.reduce((prev, current) => 
      (current.score > prev.score) ? current : prev
    )
  }, [players, gameState])

  const restartGame = () => {
    // Arrêter le minuteur actuel
    setTimerRef(prevTimer => {
      if (prevTimer) {
        clearInterval(prevTimer)
      }
      return null
    })
    setIsTimerActive(false)
    setPlayers(
      initialPlayers.map(p => ({ 
        ...p, 
        score: 0, 
        drinks: 0, 
        wins: 0,
        preferences: p.preferences || { color: 'bg-blue-500', icon: '👤' }
      }))
    )
    setCurrentPlayerIndex(0)
    setRound(1)
    setShowEndDialog(false)
    generateNewWord()
  }

  return (
    <div className={`min-h-screen bg-gradient-to-b ${theme.background} text-white`}>
      {showConfetti && <ReactConfetti />}
      
      <div className="container mx-auto max-w-6xl px-2 py-4 space-y-4 md:space-y-6 md:px-4">
        {/* Header - Responsive */}
        <div className="text-center space-y-1 md:space-y-2">
          <h1 className={`text-2xl md:text-4xl font-bold bg-gradient-to-r ${theme.title} bg-clip-text text-transparent`}>
            Le Pendu des Gorgées 🎯
          </h1>
          <p className={`text-sm md:text-lg ${theme.subtitle}`}>
            Round {round}/{maxRounds} - Difficulté: {difficulty}
          </p>
          
          {/* Bouton pour ouvrir le menu des thèmes et styles */}
          <div className="flex justify-center mt-4">
            <Button
              onClick={() => setShowThemeMenu(!showThemeMenu)}
              className="px-4 py-2 bg-white/20 text-white hover:bg-white/30 rounded-lg transition-all"
            >
              🎨 Thèmes & Styles
            </Button>
          </div>
        </div>

        {/* Menu des thèmes et styles */}
        {showThemeMenu && (
          <Card className={`${theme.cardBg} backdrop-blur-sm ${theme.cardBorder} p-4 md:p-6 mb-4`}>
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-center mb-4">🎨 Thèmes & Styles</h3>
              
              {/* Sélection du style de pendu */}
              <div className="space-y-2">
                <span className={`${theme.subtitle} text-sm font-semibold`}>Style du pendu:</span>
                <div className="flex flex-wrap gap-2">
                  {(['classic', 'modern', 'space'] as HangmanStyle[]).map(style => (
                    <Button
                      key={style}
                      onClick={() => setHangmanStyle(style)}
                      className={`px-3 py-2 text-sm rounded transition-all ${
                        hangmanStyle === style 
                          ? 'bg-purple-600 text-white' 
                          : 'bg-white/20 text-white hover:bg-white/30'
                      }`}
                    >
                      {style === 'classic' && '🏛️ Classique'}
                      {style === 'modern' && '🏢 Moderne'}
                      {style === 'space' && '🚀 Spatial'}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Sélection du thème de couleur */}
              <div className="space-y-2">
                <span className={`${theme.subtitle} text-sm font-semibold`}>Thème de couleur:</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {(['default', 'ocean', 'sunset', 'forest', 'galaxy', 'fire', 'ice'] as ColorTheme[]).map(themeKey => (
                    <Button
                      key={themeKey}
                      onClick={() => setColorTheme(themeKey)}
                      className={`px-2 py-2 text-xs rounded transition-all ${
                        colorTheme === themeKey 
                          ? 'bg-purple-600 text-white' 
                          : 'bg-white/20 text-white hover:bg-white/30'
                      }`}
                    >
                      {COLOR_THEMES[themeKey].name}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Bouton pour fermer le menu */}
              <div className="flex justify-center pt-2">
                <Button
                  onClick={() => setShowThemeMenu(false)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all"
                >
                  ✕ Fermer
                </Button>
              </div>
            </div>
          </Card>
        )}


        {/* Zone de jeu principale */}
        <div className="space-y-3 md:space-y-6">
          {/* Pendu et mot - Centré */}
          <Card className={`${theme.cardBg} backdrop-blur-sm ${theme.cardBorder} p-4 md:p-8 relative`}>
            {/* Joueur actuel - En haut à gauche de la card */}
            <div className="absolute top-4 left-4 flex items-center space-x-2">
              <Avatar className="w-8 h-8 border-2 border-yellow-400">
                <AvatarImage src={currentPlayer.preferences?.avatar} />
                <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-500 text-white text-xs font-bold">
                  {currentPlayer.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="text-left">
                <div className="text-sm font-semibold">
                  <PlayerName player={currentPlayer} />
                </div>
                <div className="text-xs text-purple-200">À toi de jouer</div>
              </div>
            </div>

            {/* Minuteur en haut à droite de la card */}
            <div className="absolute top-2 right-2 md:top-4 md:right-4">
              <div className="relative w-12 h-12 md:w-16 md:h-16">
                {/* Cercle de fond */}
                <svg className="w-12 h-12 md:w-16 md:h-16 transform -rotate-90" viewBox="0 0 64 64">
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    stroke="currentColor"
                    strokeWidth="5"
                    fill="none"
                    className="text-gray-700"
                  />
                  {/* Cercle de progression */}
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    stroke="currentColor"
                    strokeWidth="5"
                    fill="none"
                    strokeLinecap="round"
                    className={`transition-all duration-1000 ${getTimerColor(timeLeft)}`}
                    strokeDasharray={`${2 * Math.PI * 28}`}
                    strokeDashoffset={`${2 * Math.PI * 28 * (1 - timeLeft / config.timerDuration)}`}
                  />
                </svg>
                {/* Texte du minuteur */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-xs md:text-sm font-bold ${getTimerTextColor(timeLeft)}`}>
                    {timeLeft}
                  </span>
                </div>
              </div>
            </div>
            

            <div className="text-center space-y-4 md:space-y-8 mt-2 md:mt-4">
              {/* Dessin du pendu - Version SVG */}
              <div className="flex justify-center relative">
                {/* Pendu complet en fond si timeout */}
                {showCompleteHangman && (
                  <div className="absolute inset-0 flex justify-center items-center opacity-30 z-0">
                    <div className={`bg-gradient-to-b ${theme.hangmanBg} rounded-lg p-3 md:p-6 shadow-lg border-2 ${theme.cardBorder}`}>
                      <div className="w-48 h-60 md:w-64 md:h-80">
                        <HangmanStage 
                          stage={8} // Pendu complet
                          style={hangmanStyle}
                        />
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Pendu normal */}
                <div className={`bg-gradient-to-b ${theme.hangmanBg} rounded-lg p-3 md:p-6 shadow-lg border-2 ${theme.cardBorder} ${showCompleteHangman ? 'relative z-10' : ''}`}>
                  <div className="w-48 h-60 md:w-64 md:h-80">
                    <HangmanStage 
                      stage={getHangmanStage(wrongLetters.length, config.maxErrors)} 
                      style={hangmanStyle}
                    />
                  </div>
                </div>
              </div>
              
              {/* Catégorie */}
              <div className={`text-lg md:text-xl ${theme.category} font-semibold`}>
                Catégorie: {currentCategory.charAt(0).toUpperCase() + currentCategory.slice(1)}
              </div>
              
              {/* Mot à deviner */}
              <div className={`text-2xl md:text-4xl font-bold tracking-widest font-mono bg-gradient-to-r ${theme.wordText} bg-clip-text text-transparent break-all`}>
                {displayWord}
              </div>
              
              {/* Erreurs et Indices */}
              <div className="flex flex-col items-center space-y-3 md:space-y-4">
                {/* Erreurs */}
                <div className="flex items-center justify-center space-x-2 md:space-x-3">
                  <Skull className="w-5 h-5 md:w-6 md:h-6 text-red-400" />
                  <span className="text-red-400 text-base md:text-lg">
                    Erreurs: {wrongLetters.length}/{config.maxErrors}
                  </span>
                  <div className="flex space-x-1">
                    {Array.from({ length: config.maxErrors }).map((_, i) => (
                      <Heart 
                        key={i} 
                        className={`w-4 h-4 md:w-5 md:h-5 ${i < config.maxErrors - wrongLetters.length ? 'text-red-500' : 'text-gray-600'}`}
                        fill={i < config.maxErrors - wrongLetters.length ? 'currentColor' : 'none'}
                      />
                    ))}
                  </div>
                </div>

                {/* Système d'indices */}
                <div className="flex items-center space-x-4">
                  <Button
                    onClick={useHint}
                    disabled={hintsUsed >= maxHints || gameState !== 'playing' || !isTimerActive || timeLeft <= 10}
                    className="bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-all"
                  >
                    💡 Indice ({hintsUsed}/{maxHints})
                  </Button>
                  <span className="text-yellow-400 text-sm">
                    Coût: -10s
                  </span>
                </div>

              </div>

              {/* Lettres fausses */}
              {wrongLetters.length > 0 && (
                <div className="text-red-400 text-sm md:text-lg px-2 text-center">
                  Lettres incorrectes: {wrongLetters.map(letter => 
                    letter === '⏰' ? 'Temps écoulé ⏰' : letter
                  ).join(', ')}
                </div>
              )}
            </div>
          </Card>

          {/* Clavier - En dessous et centré */}
          <Card className={`${theme.cardBg} backdrop-blur-sm ${theme.cardBorder} p-3 md:p-6`}>
            <h3 className="text-lg md:text-2xl font-bold mb-3 md:mb-6 text-center">Clavier</h3>
            <div className="max-w-4xl mx-auto">
              {/* Clavier mobile optimisé */}
              <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-13 gap-1 md:gap-2 justify-center">
                {alphabet.map(letter => {
                  const isUsed = guessedLetters.includes(letter) || wrongLetters.includes(letter)
                  const isCorrect = guessedLetters.includes(letter)
                  const isWrong = wrongLetters.includes(letter)
                  
                  return (
                    <Button
                      key={letter}
                      onClick={() => handleLetterGuess(letter)}
                      disabled={isUsed || gameState !== 'playing' || !isTimerActive}
                      className={`
                        aspect-square text-sm md:text-xl font-bold transition-all 
                        min-w-[40px] min-h-[40px] md:min-w-[50px] md:min-h-[50px]
                        touch-manipulation
                        ${isCorrect ? 'bg-green-600 hover:bg-green-700 text-white' :
                          isWrong ? 'bg-red-600 hover:bg-red-700 text-white' :
                          !isTimerActive && gameState === 'playing' ? 'bg-gray-600 text-gray-300 cursor-not-allowed' :
                          'bg-white/20 hover:bg-white/30 text-white border-white/30'}
                        ${isUsed || !isTimerActive ? 'cursor-not-allowed opacity-50' : ''}
                      `}
                    >
                      {letter}
                    </Button>
                  )
                })}
              </div>
            </div>
          </Card>

        </div>

        {/* Tableau des scores */}
        <Card className={`${theme.cardBg} backdrop-blur-sm ${theme.cardBorder} p-4 md:p-6`}>
          <h3 className="text-lg md:text-xl font-bold mb-3 md:mb-4 text-center">Tableau des scores</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {players.map((player, index) => (
              <div 
                key={player.id} 
                className={`p-4 rounded-lg border-2 transition-all ${
                  index === currentPlayerIndex 
                    ? 'border-yellow-400 bg-yellow-400/10' 
                    : 'border-white/20 bg-white/5'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Avatar className="w-12 h-12">
                    <AvatarImage src={player.preferences?.avatar} />
                    <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-500 text-white font-bold">
                      {player.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="font-semibold">
                      <PlayerName player={player} />
                    </div>
                    <div className="text-sm space-y-1">
                      <div className="flex items-center space-x-1">
                        <Star className="w-3 h-3 text-yellow-400" />
                        <span>{player.score} pts</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Trophy className="w-3 h-3 text-green-400" />
                        <span>{player.wins} victoires</span>
                      </div>
                      {player.drinks > 0 && (
                        <div className="text-red-400">🍺 {player.drinks} gorgées</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Boutons d'action */}
        <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 px-4">
          <Button 
            onClick={onGameEnd}
            variant="outline"
            className="border-white/20 text-white hover:bg-white/10 w-full sm:w-auto"
          >
            <Home className="w-4 h-4 mr-2" />
            Quitter
          </Button>
          <Button 
            onClick={restartGame}
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 w-full sm:w-auto"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Nouvelle partie
          </Button>
        </div>
      </div>

      {/* Dialog de résultat du round */}
      <Dialog open={showRoundDialog} onOpenChange={setShowRoundDialog}>
        <DialogContent className="bg-gray-900 border-white/20">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl">
              {gameState === 'won' ? '🎉 Bravo !' : '💀 Pendu !'}
            </DialogTitle>
          </DialogHeader>
          <div className="text-center space-y-4">
            <p className="text-lg">{roundResult}</p>
            {gameState === 'won' && (
              <p className="text-green-400">+{config.bonusPoints} points !</p>
            )}
            {gameState === 'lost' && currentPlayer.drinks > 0 && (
              <p className="text-red-400">
                🍺 {Math.ceil(config.drinkMultiplier * 2)} gorgées à boire !
              </p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={nextPlayer} className="w-full">
              {round >= maxRounds ? 'Voir les résultats' : 'Joueur suivant'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de fin de partie */}
      <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <DialogContent className="bg-gray-900 border-white/20">
          <DialogHeader>
            <DialogTitle className="text-center text-3xl">
              🏆 Fin de partie !
            </DialogTitle>
          </DialogHeader>
          <div className="text-center space-y-6">
            {winner && (
              <div className="space-y-2">
                <p className="text-2xl">🥇 Vainqueur :</p>
                <div className="flex items-center justify-center space-x-3">
                  <Avatar className="w-16 h-16 border-4 border-yellow-400">
                    <AvatarImage src={winner.preferences?.avatar} />
                    <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-500 text-white text-xl font-bold">
                      {winner.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="text-xl font-bold">
                      <PlayerName player={winner} />
                    </div>
                    <div className="text-yellow-400">{winner.score} points</div>
                  </div>
                </div>
              </div>
            )}

            {/* Classement final */}
            <div className="space-y-2">
              <h4 className="text-lg font-semibold">Classement final :</h4>
              <div className="space-y-2">
                {players
                  .sort((a, b) => b.score - a.score)
                  .map((player, index) => (
                    <div key={player.id} className="flex items-center justify-between p-2 rounded bg-white/10">
                      <div className="flex items-center space-x-2">
                        <span className="text-lg">{index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`}</span>
                        <PlayerName player={player} />
                      </div>
                      <div className="text-right">
                        <div>{player.score} pts</div>
                        {player.drinks > 0 && (
                          <div className="text-red-400 text-sm">🍺 {player.drinks}</div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col space-y-2">
            <Button onClick={restartGame} className="w-full">
              Rejouer
            </Button>
            <Button onClick={onGameEnd} variant="outline" className="w-full">
              Retour au menu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
