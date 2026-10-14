// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from '../index'

/** en, lot 02 : paires 24 à 46 de data/en.ts (brief : node scripts/imposteur-clues-brief.mjs en 2). */
export const IMPOSTEUR_CLUES_EN_LOT_02: Record<string, ImposteurClueSet> = {
  'picnic|brunch': {
    a: ['weekend', 'spread', 'outdoors', 'park', 'ants', 'paper plates', 'checked blanket', 'wicker basket'],
    b: ['weekend', 'spread', 'late morning', 'café', 'avocado toast', 'mimosas', 'bottomless', 'eggs benedict'],
  },
  'nightclub|bar': {
    a: ['drinks', 'going out', 'late', 'queue outside', 'bouncer', 'cloakroom', 'strobe lights', 'dance floor'],
    b: ['drinks', 'going out', 'stools', 'counter', 'cocktail menu', 'last orders', 'open a tab', 'happy hour'],
  },
  'concert|festival': {
    a: ['live music', 'crowd', 'tour', 'arena', 'seated', 'support act', 'encore'],
    b: ['live music', 'crowd', 'summer', 'line-up', 'wristband', 'tents', 'wellies', 'portaloos'],
  },
  'cinema|theatre': {
    a: ['tickets', 'seats', 'dark', 'trailers', 'big screen', '3D glasses', 'popcorn'],
    b: ['tickets', 'seats', 'stage', 'interval', 'costumes', 'standing ovation', 'break a leg', 'curtain call'],
  },
  'karaoke|music quiz': {
    a: ['songs', 'pub', 'liquid courage', 'microphone', 'duet', 'off-key', 'lyrics on screen'],
    b: ['songs', 'pub', 'teams', 'answer sheet', 'buzzer', 'guess the artist', 'intro round', 'name that tune'],
  },
  'birthday party|housewarming': {
    a: ['invitations', 'gifts', 'balloons', 'cards', 'cake', 'candles', 'make a wish'],
    b: ['invitations', 'gifts', 'pot plant', 'the grand tour', 'moving boxes', 'new keys', 'new flat', 'just moved in'],
  },
  'wedding|christening': {
    a: ['church', 'family', 'speeches', 'bouquet', 'first dance', 'best man', 'bride and groom'],
    b: ['church', 'family', 'white gown', 'holy water', 'font', 'baby', 'godparents'],
  },
  'Christmas|New Year': {
    a: ['winter', 'holidays', 'presents', 'tree', 'crackers', 'stockings', 'mince pies', 'Santa'],
    b: ['winter', 'holidays', 'fireworks', 'hangover', 'resolutions', 'midnight kiss', 'countdown', 'Auld Lang Syne'],
  },
  'Halloween|Mardi Gras': {
    a: ['fancy dress', 'masks', 'autumn', 'sweets', 'ghosts', 'witches', 'pumpkins', 'trick or treat'],
    b: ['fancy dress', 'masks', 'parade', 'floats', 'feathers', 'jazz band', 'bead necklaces', 'New Orleans'],
  },
  'camping|hostel': {
    a: ['budget', 'backpack', 'field', 'sleeping bag', 'torch', 'midges', 'tent pegs', 'pitch a tent'],
    b: ['budget', 'backpack', 'gap year', 'reception desk', 'lockers', 'shared showers', 'dorm room', 'bunk beds'],
  },
  'hotel|Airbnb': {
    a: ['booking', 'holiday', 'lobby', 'lift', 'key card', 'minibar', 'room service', 'concierge'],
    b: ['booking', 'holiday', 'house rules', 'cleaning fee', 'lockbox', "someone's home", 'superhost'],
  },
  'plane|train': {
    a: ['travel', 'window seat', 'tray table', 'cabin crew', 'boarding pass', 'seatbelt sign', 'turbulence', 'take-off'],
    b: ['travel', 'window seat', 'delays', 'quiet coach', 'carriage', 'ticket inspector', 'platform', 'level crossing'],
  },
  'bicycle|scooter': {
    a: ['two wheels', 'handlebars', 'helmet', 'puncture', 'saddle', 'chain', 'gears', 'pedals'],
    b: ['two wheels', 'handlebars', 'kids', 'pavement', 'electric', 'rental app', 'standing up', 'narrow deck'],
  },
  'motorbike|moped': {
    a: ['helmet', 'two wheels', 'engine', 'open road', 'roaring exhaust', 'wheelie', 'sidecar', 'leathers'],
    b: ['helmet', 'two wheels', 'slow', 'buzzing noise', 'teenagers', 'delivery rider', 'top box', '50cc'],
  },
  'taxi|bus': {
    a: ['fare', 'driver', 'back seat', 'late night', 'tip', 'roof light', 'hailing', 'meter running'],
    b: ['fare', 'driver', 'timetable', 'route number', 'bell', 'standing room', 'top deck', 'double-decker'],
  },
  'subway|tram': {
    a: ['city', 'rush hour', 'line map', 'escalators', 'no signal', 'rats', 'tunnels', 'mind the gap'],
    b: ['city', 'rush hour', 'street level', 'bell', 'shares the road', 'street rails', 'overhead wires'],
  },
  'car|campervan': {
    a: ['driving', 'road trip', 'commute', 'school run', 'parking space', 'boot', 'four doors', 'hatchback'],
    b: ['driving', 'road trip', 'holiday', 'freedom', 'hippies', 'tiny kitchen', 'pop-up roof', 'fold-out bed'],
  },
  'skiing|snowboarding': {
    a: ['mountains', 'slopes', 'chairlift', 'après', 'salopettes', 'slalom', 'pizza wedge', 'poles'],
    b: ['mountains', 'slopes', 'baggy clothes', 'tricks', 'halfpipe', 'sore bum', 'sideways stance', 'goofy or regular'],
  },
  'surfing|paddleboarding': {
    a: ['water', 'balance', 'beach', 'wetsuit', 'wax', 'wipeout', 'big waves', 'hang ten'],
    b: ['water', 'balance', 'calm lake', 'standing up', 'kneeling', 'inflatable', 'yoga'],
  },
  'football|rugby': {
    a: ['pitch', 'studs', 'red card', 'offside', 'corner kick', 'header', 'keepy-uppy', 'goalkeeper'],
    b: ['pitch', 'studs', 'mud', 'gumshield', 'cauliflower ear', 'oval', 'line-out', 'scrum'],
  },
  'tennis|badminton': {
    a: ['racket', 'net', 'court', 'yellow ball', 'clay', 'grand slam', 'deuce', 'strawberries and cream'],
    b: ['racket', 'net', 'sports hall', 'garden game', 'underarm serve', 'birdie', 'feathers', 'shuttlecock'],
  },
  'basketball|handball': {
    a: ['court', 'trainers', 'tall players', 'dribbling', 'rebound', 'three-pointer', 'hoop', 'slam dunk'],
    b: ['court', 'trainers', 'olympic sport', 'throwing', 'goalkeeper', 'big in Denmark', 'sticky resin', 'seven-metre throw'],
  },
  'petanque|bowling': {
    a: ['balls', 'aiming', 'gravel', 'metal', 'village square', 'jack', 'south of France', 'pastis'],
    b: ['balls', 'aiming', 'alley', 'rental shoes', 'finger holes', 'gutter', 'strike', 'pins'],
  },
}
