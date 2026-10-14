// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from '../index'

/** en, lot 07 : paires 139 à 161 de data/en.ts (brief : node scripts/imposteur-clues-brief.mjs en 7). */
export const IMPOSTEUR_CLUES_EN_LOT_07: Record<string, ImposteurClueSet> = {
  'rocket|satellite': {
    a: ['space', 'launch', 'fuel', 'flames', 'astronauts', 'countdown', 'blast-off'],
    b: ['space', 'launch', 'orbit', 'signal', 'solar panels', 'space junk', 'dish on the roof'],
  },
  'tattoo|piercing': {
    a: ['needle', 'studio', 'design', 'regret', 'sleeve', 'cling film', 'ink'],
    b: ['needle', 'studio', 'metal', 'ear', 'stud', 'belly button', 'nose ring'],
  },
  'moustache|beard': {
    a: ['facial hair', 'barber', 'comb', 'detective', 'twirl', 'handlebar', 'upper lip'],
    b: ['facial hair', 'barber', 'oil', 'crumbs', 'hipster', 'lumberjack', 'chin'],
  },
  'nap|lie-in': {
    a: ['sleep', 'tired', 'sofa', 'dozing off', 'toddlers', 'after lunch', 'twenty minutes'],
    b: ['sleep', 'tired', 'duvet', 'hangover', 'weekend', 'no alarm', 'until noon'],
  },
  'pajamas|bathrobe': {
    a: ['at home', 'slippers', 'bedtime', 'flannel', 'sleepover', 'buttons', 'top and bottoms'],
    b: ['at home', 'slippers', 'shower', 'hotel', 'spa', 'wet hair', 'tie at the waist'],
  },
  'suitcase|backpack': {
    a: ['travel', 'luggage', 'zip', 'airport', 'wheels', 'telescopic handle', 'baggage carousel'],
    b: ['travel', 'luggage', 'school', 'hiking', 'hostel', 'straps', 'on your shoulders'],
  },
  'Marvel|DC': {
    a: ['comics', 'superheroes', 'Disney', 'Stan Lee', 'Spider-Man', 'Thanos', 'Avengers'],
    b: ['comics', 'superheroes', 'Warner Bros', 'Wonder Woman', 'the Joker', 'Gotham', 'Justice League'],
  },
  'Batman|Superman': {
    a: ['cape', 'DC', 'billionaire', 'gadgets', 'Gotham', 'the Joker', 'Bruce Wayne'],
    b: ['cape', 'DC', 'flying', 'red boots', 'Metropolis', 'kryptonite', 'Clark Kent'],
  },
  'Star Wars|Star Trek': {
    a: ['space', 'sci-fi', 'George Lucas', 'the Force', 'Jedi', 'lightsaber', 'Darth Vader'],
    b: ['space', 'sci-fi', 'Enterprise', 'beam me up', 'Vulcan salute', 'Captain Kirk', 'Spock'],
  },
  'Harry Potter|The Lord of the Rings': {
    a: ['fantasy', 'wizards', 'boarding school', 'owls', 'wand', 'lightning scar', 'Hogwarts'],
    b: ['fantasy', 'wizards', 'New Zealand', 'elves', 'hobbits', 'Gandalf', 'Mordor'],
  },
  'PlayStation|Xbox': {
    a: ['console', 'controller', 'Japan', 'God of War', 'square and circle', 'Gran Turismo', 'Sony'],
    b: ['console', 'controller', 'green', 'Halo', 'Game Pass', 'Master Chief', 'Microsoft'],
  },
  'iPhone|Samsung': {
    a: ['smartphone', 'touchscreen', 'California', 'AirDrop', 'Siri', 'Steve Jobs', 'Apple'],
    b: ['smartphone', 'touchscreen', 'Android', 'fridges', 'washing machines', 'South Korea', 'Galaxy'],
  },
  'Uber|Lyft': {
    a: ['app', 'driver', 'rating', 'worldwide', 'surge pricing', 'food delivery', 'black logo'],
    b: ['app', 'driver', 'tip', 'North America', 'Citi Bike', 'pink', 'fuzzy moustache'],
  },
  'Deliveroo|Uber Eats': {
    a: ['takeaway', 'rider', 'British', 'London', 'turquoise', 'kangaroo'],
    b: ['takeaway', 'rider', 'worldwide', 'black bag', 'green logo', 'taxi app'],
  },
  'Spotify|Apple Music': {
    a: ['streaming', 'playlists', 'podcasts', 'free with ads', 'green logo', 'Sweden', 'Wrapped'],
    b: ['streaming', 'playlists', 'lossless', 'pink icon', 'iPhone', 'Beats', 'iTunes'],
  },
  'Facebook|LinkedIn': {
    a: ['social network', 'profile', 'grandparents', 'birthdays', 'poke', 'Marketplace', 'Zuckerberg'],
    b: ['social network', 'profile', 'suit and tie', 'CV', 'recruiters', 'open to work', 'endorsements'],
  },
  'pencil|pen': {
    a: ['writing', 'school', 'drawing', 'wood', 'eraser', 'shavings', 'graphite'],
    b: ['writing', 'school', 'signature', 'ink', 'click', 'chewed cap', 'ballpoint'],
  },
  'eraser|correction fluid': {
    a: ['mistakes', 'pencil case', 'pink', 'smudges', 'crumbs', 'pencil marks', 'rubbing out'],
    b: ['mistakes', 'pencil case', 'white', 'little bottle', 'brush', 'drying time', 'paint over ink'],
  },
  'notebook|binder': {
    a: ['school', 'paper', 'doodles', 'to-do lists', 'lined pages', 'pocket-sized', 'spiral-bound'],
    b: ['school', 'paper', 'office', 'dividers', 'plastic sleeves', 'hole punch', 'three rings'],
  },
  'whiteboard|blackboard': {
    a: ['classroom', 'teacher', 'office', 'meeting room', 'brainstorm', 'magnets', 'dry-erase marker'],
    b: ['classroom', 'teacher', 'old school', 'cloth duster', 'screech', 'fingernails', 'chalk'],
  },
  'school bag|gym bag': {
    a: ['zip', 'shoulder strap', 'lunchbox', 'textbooks', 'timetable', 'homework', 'pencil case'],
    b: ['zip', 'shoulder strap', 'towel', 'water bottle', 'trainers', 'locker room', 'sweaty kit'],
  },
  'recess|lunch break': {
    a: ['free time', 'clock', 'bell', 'kids', 'tag', 'hopscotch', 'playground'],
    b: ['free time', 'clock', 'office', 'one hour', 'canteen', 'sandwich', 'meal deal'],
  },
  'boss|colleague': {
    a: ['office', 'work', 'meetings', 'pay rise', 'appraisal', 'corner office', "you're fired"],
    b: ['office', 'work', 'team', 'gossip', 'coffee machine', 'after-work drinks', 'desk neighbour'],
  },
}
