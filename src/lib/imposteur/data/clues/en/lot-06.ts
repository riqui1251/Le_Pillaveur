// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from '../index'

/** en, lot 06 : paires 116 à 138 de data/en.ts (brief : node scripts/imposteur-clues-brief.mjs en 6). */
export const IMPOSTEUR_CLUES_EN_LOT_06: Record<string, ImposteurClueSet> = {
  'popcorn|cotton candy': {
    a: ['snack', 'fairground', 'movie night', 'butter', 'microwave', 'salted or sweet', 'kernels'],
    b: ['snack', 'fairground', 'pink', 'fluffy cloud', 'on a stick', 'melts on your tongue', 'spun sugar'],
  },
  'smoothie|milkshake': {
    a: ['blender', 'straw', 'fruit', 'berries', 'post-workout', 'spinach', 'kale'],
    b: ['blender', 'straw', 'diner', 'ice cream', 'whipped cream', 'cherry on top', 'vanilla malt'],
  },
  'honey|jam': {
    a: ['toast', 'jar', 'sticky', 'golden', 'sore throat', 'bees', 'hive'],
    b: ['toast', 'jar', 'fruit', 'scones', 'doughnut filling', 'strawberry', 'pectin'],
  },
  'escape room|laser tag': {
    a: ['team', 'birthday party', 'puzzles', 'riddles', 'padlocks', 'hidden key', 'locked in'],
    b: ['team', 'birthday party', 'dark arena', 'neon', 'fog machine', 'chest sensors', 'light gun'],
  },
  'theme park|funfair': {
    a: ['rides', 'queues', 'rollercoaster', 'gift shop', 'season pass', 'mascots', 'fast pass'],
    b: ['rides', 'candyfloss', 'travelling', 'village green', 'dodgems', 'waltzer', 'hook-a-duck'],
  },
  'zoo|aquarium': {
    a: ['animals', 'school trip', 'feeding time', 'cages', 'petting area', 'monkeys', 'giraffes'],
    b: ['animals', 'school trip', 'blue light', 'tanks', 'glass tunnel', 'jellyfish', 'sharks'],
  },
  'museum|library': {
    a: ['quiet', 'free entry', 'exhibits', 'glass cases', 'audio guide', 'curator', 'dinosaur bones'],
    b: ['quiet', 'free entry', 'shelves', 'study desks', 'borrowing', 'late fees', 'due date stamp'],
  },
  'tent|caravan': {
    a: ['camping', 'holiday', 'sleeping bag', 'festival', 'pegs', 'groundsheet', 'guy ropes'],
    b: ['camping', 'holiday', 'slow lane', 'towing', 'tiny kitchen', 'awning', 'tow bar'],
  },
  'hot tub|sauna': {
    a: ['spa', 'swimsuit', 'garden party', 'bubbles', 'chlorine', 'cup holders', 'water jets'],
    b: ['spa', 'towel', 'sweating', 'wooden bench', 'dry heat', 'hot stones', 'ladle of water'],
  },
  'slide|swing': {
    a: ['playground', 'kids', 'ladder', 'climbing up', 'going down', 'shiny metal', 'static hair'],
    b: ['playground', 'kids', 'seat', 'chains', 'pushing', 'feet in the air', 'back and forth'],
  },
  'trampoline|bouncy castle': {
    a: ['jumping', 'back garden', 'springs', 'safety net', 'black mat', 'somersault', 'backflip'],
    b: ['jumping', 'kids party', 'shoes off', 'inflatable', 'air pump', 'deflating', 'turrets'],
  },
  'skateboard|roller skates': {
    a: ['wheels', 'helmet', 'ramps', 'deck', 'grip tape', 'ollie', 'kickflip'],
    b: ['wheels', 'helmet', 'knee pads', 'laces', 'eighties', 'disco rink', 'toe stop'],
  },
  'kayak|pedal boat': {
    a: ['water', 'life jacket', 'river', 'paddle', 'rapids', 'double blade', 'spray skirt'],
    b: ['water', 'life jacket', 'park lake', 'hourly hire', 'side by side', 'swan shape', 'cycling on water'],
  },
  'sailboat|jet ski': {
    a: ['sea', 'marina', 'wind', 'mast', 'keel', 'regatta', 'tacking'],
    b: ['sea', 'marina', 'speed', 'loud engine', 'spray', 'wetsuit', 'handlebars'],
  },
  'rock climbing|zip line': {
    a: ['harness', 'helmet', 'cliff face', 'grip', 'chalk', 'bouldering', 'belay partner'],
    b: ['harness', 'helmet', 'treetops', 'adventure park', 'steel cable', 'pulley', 'whizzing down'],
  },
  'marathon|triathlon': {
    a: ['running', 'medal', 'training plan', 'blisters', 'water stations', 'foil blanket', '26 miles'],
    b: ['running', 'medal', 'wetsuit', 'bike', 'transition zone', 'ironman', 'swim bike run'],
  },
  'boxing|judo': {
    a: ['fighting', 'gym', 'gloves', 'ring', 'gum shield', 'punch bag', 'uppercut'],
    b: ['fighting', 'gym', 'mats', 'barefoot', 'white uniform', 'black belt', 'shoulder throw'],
  },
  'magician|clown': {
    a: ['entertainer', 'kids party', 'top hat', 'wand', 'rabbit', 'pick a card', 'sawing in half'],
    b: ['entertainer', 'kids party', 'circus', 'face paint', 'big shoes', 'squirty flower', 'red nose'],
  },
  'pirate|viking': {
    a: ['ship', 'sword', 'treasure map', 'rum', 'parrot', 'eye patch', 'walk the plank'],
    b: ['ship', 'sword', 'beard', 'axe', 'mead', 'longship', 'horned helmet'],
  },
  'zombie|vampire': {
    a: ['undead', 'halloween', 'horde', 'groaning', 'shuffling walk', 'rotting flesh', 'brains'],
    b: ['undead', 'halloween', 'pale skin', 'coffin', 'garlic', 'bat', 'fangs'],
  },
  'witch|fairy': {
    a: ['magic', 'wand', 'black cat', 'halloween', 'cauldron', 'pointy hat', 'broomstick'],
    b: ['magic', 'wand', 'sparkles', 'bottom of the garden', 'toadstool', 'wings', 'tooth under pillow'],
  },
  'unicorn|dragon': {
    a: ['myth', 'fairy tale', 'rainbow', 'glitter', 'white horse', 'sparkly mane', 'horn on head'],
    b: ['myth', 'fairy tale', 'cave', 'scales', 'wings', 'gold hoard', 'breathing fire'],
  },
  'castle|cabin': {
    a: ['fireplace', 'stone walls', 'king', 'knights', 'tower', 'moat', 'drawbridge'],
    b: ['fireplace', 'woods', 'lakeside', 'no wifi', 'snowed in', 'chopping wood', 'log walls'],
  },
}
