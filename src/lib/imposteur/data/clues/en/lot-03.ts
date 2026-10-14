// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from '../index'

/** en, lot 03 : paires 47 à 69 de data/en.ts (brief : node scripts/imposteur-clues-brief.mjs en 3). */
export const IMPOSTEUR_CLUES_EN_LOT_03: Record<string, ImposteurClueSet> = {
  'pool|darts': {
    a: ['pub game', 'aim', 'table', 'cue', 'green felt', 'corner pocket', 'eight ball'],
    b: ['pub game', 'aim', 'wall', 'throwing', 'flights', 'treble twenty', 'bullseye'],
  },
  'poker|bridge': {
    a: ['card game', 'table', 'chips', 'bluffing', 'all in', 'full house', 'royal flush'],
    b: ['card game', 'table', 'retirement home', 'partners', 'tricks', 'bidding', 'no trumps'],
  },
  'chess|checkers': {
    a: ['board game', 'black and white', 'pawns', 'knight', 'castling', 'grandmaster', 'checkmate'],
    b: ['board game', 'black and white', 'round pieces', 'diagonal moves', 'jumping over', 'double jump', 'king me'],
  },
  'yoga|pilates': {
    a: ['mat', 'stretching', 'breathing', 'incense', 'lotus position', 'namaste', 'downward dog'],
    b: ['mat', 'stretching', 'core', 'posture', 'tiny movements', 'resistance ring', 'reformer'],
  },
  'weightlifting|crossfit': {
    a: ['gym', 'barbell', 'grunting', 'heavy plates', 'olympic sport', 'singlet', 'clean and jerk'],
    b: ['gym', 'barbell', 'kettlebells', 'burpees', 'box jumps', 'tyre flips', 'workout of the day'],
  },
  'jogging|hiking': {
    a: ['outdoors', 'water bottle', 'trainers', 'earphones', 'sweatband', 'tracksuit', 'laps of the park'],
    b: ['outdoors', 'water bottle', 'backpack', 'muddy boots', 'trail map', 'walking poles', 'summit'],
  },
  'scuba diving|snorkeling': {
    a: ['mask', 'flippers', 'wetsuit', 'deep water', 'regulator', 'oxygen tank', 'the bends'],
    b: ['mask', 'flippers', 'floating', 'shallow water', 'face down', 'sunburnt back', 'breathing tube'],
  },
  'fishing|hunting': {
    a: ['patience', 'dawn', 'riverbank', 'bait', 'maggots', 'rod and reel', 'the one that got away'],
    b: ['patience', 'dawn', 'woods', 'camouflage', 'tracks', 'rifle', 'deer stand'],
  },
  'guitar|piano': {
    a: ['instrument', 'chords', 'campfire', 'strap', 'strumming', 'frets', 'plectrum'],
    b: ['instrument', 'chords', 'stool', 'sheet music', 'pedals', 'ivories', 'eighty-eight keys'],
  },
  'drums|DJ': {
    a: ['beat', 'tempo', 'band', 'sticks', 'cymbals', 'kick pedal', 'snare'],
    b: ['beat', 'tempo', 'nightclub', 'headphones', 'playlist', 'drop the bass', 'turntables'],
  },
  'rap|rock': {
    a: ['music', 'concert', 'beats', 'gold chains', 'rhymes', 'mic drop', 'freestyle'],
    b: ['music', 'concert', 'long hair', 'leather jacket', 'amplifier', 'headbanging', 'guitar solo'],
  },
  'techno|reggae': {
    a: ['music', 'dancing', 'synthesizer', 'strobe lights', 'all-nighter', 'repetitive beat', 'warehouse rave'],
    b: ['music', 'dancing', 'sunshine', 'island vibes', 'dreadlocks', 'one love', 'rasta colours'],
  },
  'cat|dog': {
    a: ['pet', 'fur', 'whiskers', 'scratching post', 'litter tray', 'nine lives', 'purring'],
    b: ['pet', 'fur', 'kennel', 'leash', 'fetch', 'wagging tail', 'barking'],
  },
  'hamster|rabbit': {
    a: ['pet', 'cage', 'sawdust', 'nocturnal', 'wheel', 'exercise ball', 'stuffed cheeks'],
    b: ['pet', 'cage', 'hutch', 'carrots', 'hopping', 'floppy ears', "magician's hat"],
  },
  'parrot|canary': {
    a: ['bird', 'cage', 'tropical', 'big beak', 'talking', 'repeats everything', "pirate's shoulder"],
    b: ['bird', 'cage', 'seeds', 'singing', 'whistling', 'yellow', 'coal mine'],
  },
  'shark|dolphin': {
    a: ['ocean', 'fin', 'predator', 'surfers', 'rows of teeth', 'hammerhead', 'great white'],
    b: ['ocean', 'fin', 'pod', 'blowhole', 'clicking', 'aquarium show', 'bottlenose'],
  },
  'lion|tiger': {
    a: ['big cat', 'zoo', 'roar', 'savannah', 'pride', 'golden mane', 'king of the jungle'],
    b: ['big cat', 'zoo', 'endangered', 'jungle', 'stalking', 'orange fur', 'black stripes'],
  },
  'bear|wolf': {
    a: ['forest', 'wild animal', 'cave', 'salmon', 'honey', 'hibernation', 'grizzly'],
    b: ['forest', 'wild animal', 'grey fur', 'pack', 'sheep', 'three little pigs', 'howling at the moon'],
  },
  'bee|wasp': {
    a: ['insect', 'sting', 'buzzing', 'flowers', 'pollen', 'hive', 'honey'],
    b: ['insect', 'sting', 'picnic', 'fizzy drinks', 'jam jar trap', 'thin waist', 'paper nest'],
  },
  'butterfly|dragonfly': {
    a: ['wings', 'summer', 'flowers', 'nectar', 'colourful patterns', 'cocoon', 'caterpillar'],
    b: ['wings', 'summer', 'pond', 'reeds', 'hovering', 'long thin body', 'tiny helicopter'],
  },
  'doctor|nurse': {
    a: ['hospital', 'patients', 'white coat', 'stethoscope', 'diagnosis', 'prescriptions', 'messy handwriting'],
    b: ['hospital', 'patients', 'scrubs', 'night shift', 'bedside care', 'injections', 'bedpans'],
  },
  'firefighter|police officer': {
    a: ['uniform', 'siren', 'helmet', 'smoke', 'tall ladder', 'sliding pole', 'putting out flames'],
    b: ['uniform', 'siren', 'badge', 'patrol car', 'speeding ticket', 'handcuffs', 'under arrest'],
  },
  'teacher|coach': {
    a: ['role model', 'shouting', 'classroom', 'blackboard', 'homework', 'red pen', "parents' evening"],
    b: ['role model', 'shouting', 'team', 'whistle', 'sidelines', 'tactics board', 'half-time talk'],
  },
}
