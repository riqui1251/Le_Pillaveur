import { describe, expect, it } from 'vitest'
import {
  ESPION_LOCATION_IDS,
  espionLocationIdOf,
  espionLocationName,
  espionLocationsFor,
  getEspionLocations,
  normalizeEspionLocationName,
  type EspionLang,
} from './index'

const LANGS: EspionLang[] = ['fr', 'en', 'es', 'it']

// Figé à la main : un id renommé ou déplacé casserait les devinettes en vol et les données indexées par id.
const FROZEN_IDS = [
  'plage', 'hopital', 'ecole', 'aeroport', 'restaurant', 'cinema', 'casino', 'sous-marin', 'cirque',
  'ambassade', 'boite-de-nuit', 'commissariat-de-police', 'spa', 'supermarche', 'theatre',
  'universite', 'zoo', 'bibliotheque', 'cathedrale', 'camping', 'bateau-de-croisiere',
  'studio-de-cinema', 'ferme', 'station-de-ski', 'hotel', 'musee', 'parc-d-attractions', 'prison',
  'restaurant-japonais', 'salle-de-sport', 'stade-de-football', 'station-spatiale', 'marche-bio',
  'train', 'usine', 'cave-a-vin', 'yacht', 'aire-d-autoroute', 'banque', 'bureau',
  'caserne-de-pompiers', 'donjon-medieval', 'chantier-de-construction', 'chateau', 'cimetiere',
  'club-de-golf', 'salle-de-concert', 'salle-de-mariage', 'ecole-de-danse', 'festival-de-musique',
  'foret', 'gare', 'jardin-botanique', 'laboratoire', 'marche-aux-poissons', 'mine', 'monastere',
  'opera', 'palais-de-justice', 'parc-national', 'patinoire', 'phare', 'piscine-municipale',
  'plateau-de-television', 'poste-frontiere', 'base-militaire', 'refuge-de-montagne',
  'salle-des-fetes', 'salon-de-coiffure', 'sauna', 'station-de-metro', 'station-service',
  'studio-de-tatouage', 'village-de-vacances', 'observatoire-volcanique',
]

// Tableaux de HEAD 5c64578 : les parties en cours gardent ces noms, dans cet ordre.
const HEAD_NAMES: Record<EspionLang, string[]> = {
  fr: [
    'Plage', 'Hôpital', 'École', 'Aéroport', 'Restaurant', 'Cinéma', 'Casino', 'Sous-marin',
    'Cirque', 'Ambassade', 'Boîte de nuit', 'Commissariat de police', 'Spa', 'Supermarché',
    'Théâtre', 'Université', 'Zoo', 'Bibliothèque', 'Cathédrale', 'Camping', 'Bateau de croisière',
    'Studio de cinéma', 'Ferme', 'Station de ski', 'Hôtel', 'Musée', "Parc d'attractions", 'Prison',
    'Restaurant japonais', 'Salle de sport', 'Stade de football', 'Station spatiale', 'Marché bio',
    'Train', 'Usine', 'Cave à vin', 'Yacht', "Aire d'autoroute", 'Banque', 'Bureau',
    'Caserne de pompiers', 'Donjon médiéval', 'Chantier de construction', 'Château', 'Cimetière',
    'Club de golf', 'Salle de concert', 'Salle de mariage', 'École de danse', 'Festival de musique',
    'Forêt', 'Gare', 'Jardin botanique', 'Laboratoire', 'Marché aux poissons', 'Mine', 'Monastère',
    'Opéra', 'Palais de justice', 'Parc national', 'Patinoire', 'Phare', 'Piscine municipale',
    'Plateau de télévision', 'Poste-frontière', 'Base militaire', 'Refuge de montagne',
    'Salle des fêtes', 'Salon de coiffure', 'Sauna', 'Station de métro', 'Station-service',
    'Studio de tatouage', 'Village de vacances', 'Observatoire volcanique',
  ],
  en: [
    'Beach', 'Hospital', 'School', 'Airport', 'Restaurant', 'Cinema', 'Casino', 'Submarine',
    'Circus', 'Embassy', 'Nightclub', 'Police Station', 'Spa', 'Supermarket', 'Theatre',
    'University', 'Zoo', 'Library', 'Cathedral', 'Campsite', 'Cruise Ship', 'Film Studio', 'Farm',
    'Ski Resort', 'Hotel', 'Museum', 'Amusement Park', 'Prison', 'Japanese Restaurant', 'Gym',
    'Football Stadium', 'Space Station', 'Organic Market', 'Train', 'Factory', 'Wine Cellar',
    'Yacht', 'Motorway Service Area', 'Bank', 'Office', 'Fire Station', 'Medieval Dungeon',
    'Construction Site', 'Castle', 'Cemetery', 'Golf Club', 'Concert Hall', 'Wedding Hall',
    'Dance School', 'Music Festival', 'Forest', 'Train Station', 'Botanical Garden', 'Laboratory',
    'Fish Market', 'Mine', 'Monastery', 'Opera House', 'Courthouse', 'National Park', 'Ice Rink',
    'Lighthouse', 'Public Pool', 'TV Studio', 'Border Checkpoint', 'Military Base',
    'Mountain Refuge', 'Village Hall', 'Hair Salon', 'Sauna', 'Subway Station', 'Gas Station',
    'Tattoo Studio', 'Holiday Resort', 'Volcano Observatory',
  ],
  es: [
    'Playa', 'Hospital', 'Escuela', 'Aeropuerto', 'Restaurante', 'Cine', 'Casino', 'Submarino',
    'Circo', 'Embajada', 'Discoteca', 'Comisaría', 'Spa', 'Supermercado', 'Teatro', 'Universidad',
    'Zoológico', 'Biblioteca', 'Catedral', 'Camping', 'Crucero', 'Estudio de cine', 'Granja',
    'Estación de esquí', 'Hotel', 'Museo', 'Parque de atracciones', 'Prisión', 'Restaurante japonés',
    'Gimnasio', 'Estadio de fútbol', 'Estación espacial', 'Mercado orgánico', 'Tren', 'Fábrica',
    'Bodega', 'Yate', 'Área de servicio', 'Banco', 'Oficina', 'Estación de bomberos',
    'Mazmorra medieval', 'Obra en construcción', 'Castillo', 'Cementerio', 'Club de golf',
    'Sala de conciertos', 'Salón de bodas', 'Escuela de baile', 'Festival de música', 'Bosque',
    'Estación de tren', 'Jardín botánico', 'Laboratorio', 'Mercado de pescado', 'Mina', 'Monasterio',
    'Teatro de la ópera', 'Palacio de justicia', 'Parque nacional', 'Pista de hielo', 'Faro',
    'Piscina municipal', 'Estudio de televisión', 'Puesto fronterizo', 'Base militar',
    'Refugio de montaña', 'Salón municipal', 'Peluquería', 'Sauna', 'Estación de metro',
    'Gasolinera', 'Estudio de tatuajes', 'Complejo turístico', 'Observatorio volcánico',
  ],
  it: [
    'Spiaggia', 'Ospedale', 'Scuola', 'Aeroporto', 'Ristorante', 'Cinema', 'Casinò', 'Sottomarino',
    'Circo', 'Ambasciata', 'Discoteca', 'Commissariato', 'Spa', 'Supermercato', 'Teatro',
    'Università', 'Zoo', 'Biblioteca', 'Cattedrale', 'Campeggio', 'Nave da crociera',
    'Studio cinematografico', 'Fattoria', 'Stazione sciistica', 'Hotel', 'Museo',
    'Parco divertimenti', 'Prigione', 'Ristorante giapponese', 'Palestra', 'Stadio di calcio',
    'Stazione spaziale', 'Mercato biologico', 'Treno', 'Fabbrica', 'Cantina', 'Yacht',
    'Area di servizio', 'Banca', 'Ufficio', 'Caserma dei pompieri', 'Segreta medievale',
    'Cantiere edile', 'Castello', 'Cimitero', 'Circolo del golf', 'Sala concerti', 'Sala matrimoni',
    'Scuola di ballo', 'Festival musicale', 'Foresta', 'Stazione ferroviaria', 'Giardino botanico',
    'Laboratorio', 'Mercato del pesce', 'Miniera', 'Monastero', "Teatro dell'opera", 'Tribunale',
    'Parco nazionale', 'Pista di pattinaggio', 'Faro', 'Piscina comunale', 'Studio televisivo',
    'Posto di frontiera', 'Base militare', 'Rifugio di montagna', 'Sala comunale', 'Parrucchiere',
    'Sauna', 'Stazione della metro', 'Stazione di servizio', 'Studio per tatuaggi',
    'Villaggio turistico', 'Osservatorio vulcanico',
  ],
}

describe('identifiants des lieux', () => {
  it('75 ids uniques en ASCII kebab, dans l’ordre figé', () => {
    expect(ESPION_LOCATION_IDS).toHaveLength(75)
    expect([...ESPION_LOCATION_IDS]).toEqual(FROZEN_IDS)
    expect(new Set(ESPION_LOCATION_IDS).size).toBe(75)
    for (const id of ESPION_LOCATION_IDS) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('les 4 langues nomment exactement les mêmes ids', () => {
    for (const lang of LANGS) {
      expect(espionLocationsFor(lang).map((l) => l.id), lang).toEqual([...ESPION_LOCATION_IDS])
    }
  })

  it('noms non vides et uniques par langue après normalisation', () => {
    for (const lang of LANGS) {
      const names = getEspionLocations(lang)
      expect(names.every((n) => n.trim().length > 0), lang).toBe(true)
      expect(new Set(names.map(normalizeEspionLocationName)).size, lang).toBe(names.length)
    }
  })
})

describe('compatibilité avec les parties en cours', () => {
  it('getEspionLocations(lang) rend les tableaux de HEAD, mêmes noms, même ordre', () => {
    for (const lang of LANGS) expect(getEspionLocations(lang), lang).toEqual(HEAD_NAMES[lang])
  })

  it('langue inconnue ou absente : repli sur le français', () => {
    expect(getEspionLocations(null)).toEqual(HEAD_NAMES.fr)
    expect(getEspionLocations('de')).toEqual(HEAD_NAMES.fr)
    expect(getEspionLocations('toString')).toEqual(HEAD_NAMES.fr)
    expect(espionLocationName('plage', undefined)).toBe('Plage')
  })
})

describe('espionLocationIdOf', () => {
  it('chaque nom de chaque langue mène à son id, casse et accents ignorés', () => {
    for (const lang of LANGS) {
      for (const { id, name } of espionLocationsFor(lang)) {
        expect(espionLocationIdOf(name), `${lang}:${name}`).toBe(id)
        expect(espionLocationIdOf(`  ${name.toUpperCase()} `)).toBe(id)
        expect(espionLocationName(id, lang)).toBe(name)
      }
    }
    expect(espionLocationIdOf('hopital')).toBe('hopital')
    expect(espionLocationIdOf('Nulle part')).toBeNull()
  })

  it('jamais ambigu : 12 noms communs FR/EN, 6 FR/ES, 7 FR/IT mènent au même id', () => {
    const shared = (other: EspionLang) => {
      const fr = new Map(espionLocationsFor('fr').map((l) => [normalizeEspionLocationName(l.name), l.id]))
      return espionLocationsFor(other).filter((l) => fr.has(normalizeEspionLocationName(l.name))).map((l) => {
        expect(fr.get(normalizeEspionLocationName(l.name)), `${other}:${l.name}`).toBe(l.id)
        return l.id
      })
    }
    expect(shared('en')).toHaveLength(12)
    expect(shared('es')).toHaveLength(6)
    expect(shared('it')).toHaveLength(7)
    // Aucun nom normalisé, toutes langues confondues, ne désigne deux lieux.
    const owner = new Map<string, string>()
    for (const lang of LANGS) {
      for (const { id, name } of espionLocationsFor(lang)) {
        const key = normalizeEspionLocationName(name)
        expect(owner.get(key) ?? id, `${lang}:${name}`).toBe(id)
        owner.set(key, id)
      }
    }
  })
})
