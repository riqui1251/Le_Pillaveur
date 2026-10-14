// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from '../index'

/** en, lot 08 : paires 162 à 184 de data/en.ts (brief : node scripts/imposteur-clues-brief.mjs en 8). */
export const IMPOSTEUR_CLUES_EN_LOT_08: Record<string, ImposteurClueSet> = {
  'meeting|job interview': {
    a: ['office', 'handshake', 'agenda', 'colleagues', 'boardroom', 'taking minutes', 'could be an email'],
    b: ['office', 'handshake', 'nerves', 'best shirt', 'hiring manager', 'greatest weakness', 'five-year plan'],
  },
  'remote work|open space': {
    a: ['laptop', 'emails', 'pyjamas', 'video call', 'kitchen table', 'no commute', "you're on mute"],
    b: ['laptop', 'emails', 'colleagues', 'noise', 'headphones', 'hot desking', 'no walls'],
  },
  'permanent contract|fixed-term contract': {
    a: ['job', 'signature', 'security', 'mortgage', 'probation', 'for life', 'no end date'],
    b: ['job', 'signature', 'six months', 'renewal', 'maternity cover', 'temp', 'end date'],
  },
  'strike|protest': {
    a: ['placards', 'union', 'pay rise', 'no trains', 'tools down', 'walkout', 'picket line'],
    b: ['placards', 'union', 'banners', 'megaphone', 'chanting', 'riot police', 'march'],
  },
  'taxes|rent': {
    a: ['money', 'bills', 'government', 'payslip', 'accountant', 'deductions', 'self-assessment'],
    b: ['money', 'bills', 'first of the month', 'flatmates', 'deposit', 'lease', 'landlord'],
  },
  'light bulb|candle': {
    a: ['glow', 'evening', 'switch', 'ceiling', 'watts', 'bright idea', 'filament'],
    b: ['glow', 'evening', 'romantic dinner', 'power cut', 'matches', 'flame', 'wax', 'wick'],
  },
  'vacuum cleaner|broom': {
    a: ['dust', 'floor', 'carpet', 'plug', 'noise', 'cord', 'nozzle'],
    b: ['dust', 'floor', 'sweeping', 'dustpan', 'bristles', 'wooden handle', 'witch'],
  },
  'washing machine|dishwasher': {
    a: ['kitchen', 'cycle', 'socks', 'laundry', 'fabric softener', 'spin', 'drum'],
    b: ['kitchen', 'cycle', 'after dinner', 'plates', 'cutlery', 'tablets', 'rinse aid'],
  },
  'radiator|air conditioner': {
    a: ['wall', 'thermostat', 'winter', 'central heating', 'under the window', 'drying socks', 'bleed valve'],
    b: ['wall', 'thermostat', 'summer', 'heatwave', 'remote', 'humming', 'dripping', 'cold blast'],
  },
  'umbrella|raincoat': {
    a: ['drizzle', 'puddles', 'handle', 'folding', 'bad luck indoors', 'spokes', 'inside out'],
    b: ['drizzle', 'puddles', 'waterproof', 'zip', 'pockets', 'yellow', 'hood'],
  },
  'rainbow|northern lights': {
    a: ['sky', 'colours', 'sunshine', 'after a shower', 'arc', 'leprechaun', 'pot of gold'],
    b: ['sky', 'colours', 'night', 'freezing cold', 'bucket list', 'green glow', 'solar wind'],
  },
  'storm|tornado': {
    a: ['wind', 'weather warning', 'dark clouds', 'fallen trees', 'heavy rain', 'thunder', 'lightning'],
    b: ['wind', 'weather warning', 'spinning', 'cellar', 'trailer park', 'flying cows', 'funnel cloud'],
  },
  'solar eclipse|lunar eclipse': {
    a: ['sky', 'shadow', 'daytime', 'special glasses', 'pinhole camera', 'midday darkness', 'corona'],
    b: ['sky', 'shadow', 'night', 'full moon', 'red glow', 'earth in the way', 'blood moon'],
  },
  'glacier|iceberg': {
    a: ['cold', 'melting', 'mountains', 'hiking', 'valley', 'frozen river', 'crevasse'],
    b: ['cold', 'melting', 'ocean', 'floating', 'ship', 'tip', 'mostly underwater'],
  },
  'cactus|bonsai': {
    a: ['pot', 'windowsill', 'rarely watered', 'desert', 'cowboy', 'tumbleweed', 'spines'],
    b: ['pot', 'windowsill', 'patience', 'scissors', 'wire', 'pruning', 'tiny tree'],
  },
  'hedgehog|turtle': {
    a: ['pet', 'garden', 'night', 'hibernation', 'slugs', 'curls into a ball', 'prickles'],
    b: ['pet', 'garden', 'slow', 'lettuce', 'ninja', 'sea', 'shell'],
  },
  'flamingo|peacock': {
    a: ['bird', 'feathers', 'lake', 'shrimp', 'lawn ornament', 'pink', 'one leg'],
    b: ['bird', 'feathers', 'stately home', 'loud scream', 'showing off', 'blue', 'fanned tail'],
  },
  'octopus|squid': {
    a: ['sea', 'ink', 'suckers', 'camouflage', 'puzzle solver', 'escape artist', 'eight arms'],
    b: ['sea', 'ink', 'tentacles', 'deep sea', 'giant', 'torpedo shape', 'battered rings'],
  },
  'sumo|wrestling': {
    a: ['ring', 'referee', 'heavyweight', 'push out', 'salt throwing', 'loincloth', 'topknot'],
    b: ['ring', 'referee', 'gym', 'singlet', 'headlock', 'body slam', 'pinned for three'],
  },
  'fencing|karate': {
    a: ['combat sport', 'white outfit', 'mask', 'lunge', 'sword', 'en garde', 'touché'],
    b: ['combat sport', 'white outfit', 'bare feet', 'kicks', 'breaking boards', 'dojo', 'black belt'],
  },
  'jewelry|watch': {
    a: ['gift', 'wrist', 'gold', 'diamonds', 'pearls', 'necklace', 'earrings'],
    b: ['gift', 'wrist', 'strap', 'battery', 'ticking', 'dial', 'telling time'],
  },
  'handbag|clutch': {
    a: ['accessory', 'fashion', 'designer', 'carry everything', 'lipstick', 'rummaging', 'shoulder strap'],
    b: ['accessory', 'fashion', 'evening out', 'wedding', 'sequins', 'under the arm', 'no strap'],
  },
  'gloves|scarf': {
    a: ['winter', 'wool', 'pair', 'losing one', 'oven', 'boxing', 'five fingers'],
    b: ['winter', 'wool', 'knitted', 'snowman', 'football fans', 'tassels', 'around the neck'],
  },
}
