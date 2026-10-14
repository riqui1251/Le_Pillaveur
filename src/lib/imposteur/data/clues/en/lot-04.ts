// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from '../index'

/** en, lot 04 : paires 70 à 92 de data/en.ts (brief : node scripts/imposteur-clues-brief.mjs en 4). */
export const IMPOSTEUR_CLUES_EN_LOT_04: Record<string, ImposteurClueSet> = {
  'waiter|bartender': {
    a: ['tips', 'apron', 'menu', 'restaurant', 'notepad', 'table for two', 'carrying plates'],
    b: ['tips', 'apron', 'pub', 'last orders', 'shaker', 'pouring pints', 'behind the bar'],
  },
  'baker|pastry chef': {
    a: ['flour', 'oven', 'early start', 'kneading', 'sourdough', 'bloomer', 'loaf of bread'],
    b: ['flour', 'oven', 'butter', 'croissants', 'piping bag', 'éclairs', 'macarons'],
  },
  'hairdresser|barber': {
    a: ['scissors', 'haircut', 'salon', 'gossip', 'hair dye', 'highlights', 'blow-dry'],
    b: ['scissors', 'haircut', 'clippers', 'fade', 'beard trim', 'cut-throat razor', 'striped pole'],
  },
  'plumber|electrician': {
    a: ['van', 'call-out fee', 'leak', 'pipes', 'boiler', 'plunger', 'blocked toilet'],
    b: ['van', 'call-out fee', 'sockets', 'fuse box', 'voltage', 'circuit breaker', 'live wires'],
  },
  'lawyer|notary': {
    a: ['suit', 'paperwork', 'client', 'fees', 'courtroom', 'objection', 'not guilty'],
    b: ['suit', 'paperwork', 'signature', 'witness', 'stamp', 'property deeds', 'official seal'],
  },
  'pilot|captain': {
    a: ['uniform', 'stripes', 'jet lag', 'runway', 'turbulence', 'landing gear', 'cockpit'],
    b: ['uniform', 'stripes', 'crew', 'armband', 'deck', 'anchor', "ship's wheel"],
  },
  'astronaut|aviator': {
    a: ['flying', 'helmet', 'countdown', 'rocket', 'zero gravity', 'space station', 'spacesuit'],
    b: ['flying', 'helmet', 'leather jacket', 'goggles', 'white scarf', 'propeller', 'biplane'],
  },
  'moon|sun': {
    a: ['sky', 'round', 'night', 'tides', 'werewolves', 'craters', 'crescent'],
    b: ['sky', 'round', 'daytime', 'heat', 'rays', 'tan lines', 'solar panels'],
  },
  'star|comet': {
    a: ['night sky', 'telescope', 'make a wish', 'constellation', 'five points', 'walk of fame', 'twinkle twinkle'],
    b: ['night sky', 'telescope', 'once in a lifetime', 'orbit', 'ice and dust', 'streaking', 'glowing tail'],
  },
  'mountain|volcano': {
    a: ['summit', 'climb', 'altitude', 'goats', 'base camp', 'snowy peaks', 'ski lift'],
    b: ['summit', 'climb', 'rumbling', 'ash cloud', 'crater', 'erupting', 'lava'],
  },
  'river|lake': {
    a: ['fishing', 'fresh water', 'bridge', 'current', 'rapids', 'downstream', 'flows to the sea'],
    b: ['fishing', 'fresh water', 'skimming stones', 'cabin', 'jetty', 'pedalo', 'still water'],
  },
  'forest|jungle': {
    a: ['trees', 'getting lost', 'deer', 'mushrooms', 'campfire', 'pine cones', 'woodcutter'],
    b: ['trees', 'getting lost', 'humid', 'mosquitoes', 'monkeys', 'vines', 'machete'],
  },
  'desert|savannah': {
    a: ['heat', 'thirst', 'cactus', 'camels', 'mirage', 'oasis', 'sand dunes'],
    b: ['heat', 'thirst', 'safari', 'zebras', 'watering hole', 'tall grass', 'acacia trees'],
  },
  'rain|snow': {
    a: ['clouds', 'forecast', 'soaked', 'wellies', 'umbrella', 'drizzle', 'puddles'],
    b: ['clouds', 'forecast', 'freezing', 'skiing', 'sledge', 'flakes', 'carrot nose'],
  },
  'thunderstorm|heatwave': {
    a: ['summer', 'weather warning', 'dark clouds', 'power cut', 'rumbling', 'counting seconds', 'lightning'],
    b: ['summer', 'weather warning', 'sweating', 'ice lollies', 'electric fan', 'sunstroke', 'hosepipe ban'],
  },
  'spring|autumn': {
    a: ['mild', 'jacket weather', 'showers', 'blossom', 'lambs', 'daffodils', 'clocks go forward'],
    b: ['mild', 'jacket weather', 'back to school', 'pumpkins', 'conkers', 'clocks go back', 'falling leaves'],
  },
  'sunglasses|cap': {
    a: ['sunny day', 'tourist', 'squinting', 'on your nose', 'dark lenses', 'polarised', 'aviators'],
    b: ['sunny day', 'tourist', 'on your head', 'peak', 'worn backwards', 'baseball', 'snapback'],
  },
  'swimsuit|shorts': {
    a: ['summer', 'beach', 'pool', 'dripping wet', 'lycra', 'tan lines', 'one-piece'],
    b: ['summer', 'beach', 'bare legs', 'pockets', 'denim cut-offs', 'cargo', 'above the knee'],
  },
  'sneakers|flip-flops': {
    a: ['feet', 'rubber soles', 'gym', 'running', 'squeaky', 'laces', 'high-tops'],
    b: ['feet', 'rubber soles', 'beach', 'poolside', 'slapping sound', 'sandy toes', 'toe post'],
  },
  'jeans|sweatpants': {
    a: ['legs', 'waistband', 'blue', 'back pockets', 'skinny fit', 'rivets', 'denim'],
    b: ['legs', 'waistband', 'sofa', 'gym', 'grey marl', 'drawstring', 'elastic cuffs'],
  },
  'suit|tuxedo': {
    a: ['jacket', 'tailor', 'office', 'briefcase', 'job interview', 'pinstripe', 'two-piece'],
    b: ['jacket', 'tailor', 'prom', 'black tie event', 'satin lapels', 'bow tie', 'cummerbund'],
  },
  'perfume|deodorant': {
    a: ['smell', 'spray', 'gift box', 'duty free', 'wrist', 'glass bottle', 'behind the ears'],
    b: ['smell', 'spray', 'gym bag', 'morning routine', 'sweat patches', 'roll-on', 'armpits'],
  },
  'sofa|hammock': {
    a: ['nap', 'lazy afternoon', 'living room', 'cushions', 'remote control', 'armrest', 'three-seater'],
    b: ['nap', 'lazy afternoon', 'garden', 'swaying', 'beach holiday', 'rope netting', 'between two trees'],
  },
}
